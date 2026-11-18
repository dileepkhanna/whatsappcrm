const axios = require("axios");

// WhatsApp Embedded Signup helpers.
// Flow: FB.login (config_id, response_type=code) -> auth code -> exchange for a
// business token -> resolve WABA + phone number -> subscribe app webhooks to the
// WABA (per-user callback) -> register the number on Cloud API.

const GRAPH = "https://graph.facebook.com/v21.0";

const graphErr = (err) =>
  err?.response?.data?.error?.error_user_msg ||
  err?.response?.data?.error?.message ||
  err?.message ||
  "Unknown Graph API error";

function checkEmbed() {
  return true;
}

// Public base URL of this CRM (no trailing slash).
function baseUrl() {
  return String(process.env.FRONTENDURI || process.env.BACKURI || "").replace(/\/+$/, "");
}

// Per-user webhook URL; the verify token is the user's uid (see routes/inbox.js).
function userWebhookUrl(uid) {
  const base = baseUrl();
  if (!base || !uid) return null;
  return `${base}/api/inbox/embed/webhook/${uid}`;
}

async function registerPhoneNumber({ token, phoneNumId, pin = "123456" }) {
  try {
    const { data } = await axios.post(
      `${GRAPH}/${phoneNumId}/register`,
      { messaging_product: "whatsapp", pin },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return { success: !!data?.success, data };
  } catch (err) {
    return { success: false, msg: graphErr(err) };
  }
}

async function getPhoneNumberStatus({ token, phoneNumId }) {
  try {
    const { data } = await axios.get(`${GRAPH}/${phoneNumId}`, {
      params: {
        fields:
          "id,display_phone_number,verified_name,status,platform_type,code_verification_status,quality_rating",
      },
      headers: { Authorization: `Bearer ${token}` },
    });
    return { success: true, data };
  } catch (err) {
    return { success: false, msg: graphErr(err) };
  }
}

async function subscribeWebhook({ token, wabaId, uid }) {
  const callback = userWebhookUrl(uid);
  const headers = { Authorization: `Bearer ${token}` };
  // Prefer a per-WABA callback so this user's messages reach their own webhook.
  if (callback) {
    try {
      const { data } = await axios.post(
        `${GRAPH}/${wabaId}/subscribed_apps`,
        { override_callback_uri: callback, verify_token: uid },
        { headers },
      );
      if (data?.success) return { success: true, callback };
    } catch (err) {
      console.warn("⚠️ override_callback_uri subscribe failed, falling back:", graphErr(err));
    }
  }
  // Fallback: subscribe using the app-level callback URL from the Meta dashboard.
  try {
    const { data } = await axios.post(`${GRAPH}/${wabaId}/subscribed_apps`, null, { headers });
    return { success: !!data?.success, callback: null };
  } catch (err) {
    return { success: false, msg: graphErr(err) };
  }
}

async function getWABADetails({ token, wabaId }) {
  try {
    const { data } = await axios.get(`${GRAPH}/${wabaId}`, {
      params: { fields: "id,name,currency,timezone_id,message_template_namespace" },
      headers: { Authorization: `Bearer ${token}` },
    });
    return { success: true, data };
  } catch (err) {
    return { success: false, msg: graphErr(err) };
  }
}

// Find the WABA the user granted access to, from the token's granular scopes.
async function wabaFromToken({ token, appId, appSecret }) {
  try {
    const { data } = await axios.get(`${GRAPH}/debug_token`, {
      params: { input_token: token, access_token: `${appId}|${appSecret}` },
    });
    const scopes = data?.data?.granular_scopes || [];
    const mgmt = scopes.find((s) => s.scope === "whatsapp_business_management");
    return mgmt?.target_ids?.[0] || null;
  } catch (err) {
    console.warn("⚠️ debug_token failed:", graphErr(err));
    return null;
  }
}

async function exchangeEmbedToken({
  appId,
  appSecret,
  authCode,
  wabaId,
  phoneNumId,
  businessId,
  uid,
  isCoexistence = false,
  registrationPin = "123456",
}) {
  if (!authCode) return { success: false, msg: "Missing authorization code from Facebook login" };

  // 1. Exchange the code for a business integration token.
  let token;
  try {
    const { data } = await axios.get(`${GRAPH}/oauth/access_token`, {
      params: { client_id: appId, client_secret: appSecret, code: authCode },
    });
    token = data?.access_token;
  } catch (err) {
    return { success: false, msg: `Token exchange failed: ${graphErr(err)}` };
  }
  if (!token) return { success: false, msg: "Meta did not return an access token" };

  // 2. Resolve the WABA.
  const resolvedWaba = wabaId || (await wabaFromToken({ token, appId, appSecret }));
  if (!resolvedWaba) {
    return {
      success: false,
      msg: "Could not find the WhatsApp Business Account. Please finish all signup steps and select a WhatsApp account.",
    };
  }

  // 3. Resolve the phone number.
  let resolvedPhone = phoneNumId;
  if (!resolvedPhone) {
    try {
      const { data } = await axios.get(`${GRAPH}/${resolvedWaba}/phone_numbers`, {
        params: { fields: "id,display_phone_number,platform_type" },
        headers: { Authorization: `Bearer ${token}` },
      });
      resolvedPhone = data?.data?.[0]?.id;
    } catch (err) {
      console.warn("⚠️ phone_numbers lookup failed:", graphErr(err));
    }
  }
  if (!resolvedPhone) {
    return {
      success: false,
      msg: "No phone number was found on this WhatsApp Business Account. Add a number during signup and try again.",
    };
  }

  const warnings = [];

  // 4. Subscribe this app to the WABA's webhooks.
  const sub = await subscribeWebhook({ token, wabaId: resolvedWaba, uid });
  if (!sub.success) warnings.push(`Webhook subscription failed: ${sub.msg}`);

  // 5. Register the number on Cloud API (not for coexistence / already-connected numbers).
  let phone = (await getPhoneNumberStatus({ token, phoneNumId: resolvedPhone })).data || {};
  if (!isCoexistence && phone.platform_type !== "CLOUD_API") {
    const reg = await registerPhoneNumber({ token, phoneNumId: resolvedPhone, pin: registrationPin });
    if (!reg.success) warnings.push(`Phone registration: ${reg.msg}`);
    phone = (await getPhoneNumberStatus({ token, phoneNumId: resolvedPhone })).data || phone;
  }

  const waba = (await getWABADetails({ token, wabaId: resolvedWaba })).data || { id: resolvedWaba };

  if (warnings.length) console.warn("⚠️ Embedded signup warnings:", warnings);

  return {
    success: true,
    msg: warnings.length
      ? `Connected, with warnings: ${warnings.join(" | ")}`
      : "WhatsApp Business Account connected",
    data: {
      waba: { ...waba, id: waba.id || resolvedWaba },
      token,
      phoneNumId: resolvedPhone,
      displayPhoneNumber: phone.display_phone_number || null,
      verifiedName: phone.verified_name || null,
      businessId: businessId || null,
      isCoexistence: !!isCoexistence,
      platformType: phone.platform_type || null,
      webhookCallback: sub.callback || null,
      warnings,
    },
  };
}

// Webhook URL template shown in the admin panel.
async function genEmbedWebhook() {
  const base = baseUrl();
  return base ? `${base}/api/inbox/embed/webhook/{USER_UID}` : null;
}

module.exports = {
  checkEmbed,
  exchangeEmbedToken,
  genEmbedWebhook,
  registerPhoneNumber,
  getPhoneNumberStatus,
  subscribeWebhook,
  getWABADetails,
};
