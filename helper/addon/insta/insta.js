const { query } = require("../../../database/dbpromise");
const axios = require("axios");

const API_VERSION = "v21.0";

function checkInsta() {
  return true;
}

/**
 * Generate Instagram webhook URL for a specific user
 */
// Instagram webhooks are configured once per app (not per user). The webhook
// route verifies hub.verify_token against the last URL segment, so the URL
// ends with a stable secret token derived from the app secret.
async function getInstaWebhookToken() {
  const [config] = await query(`SELECT insta_app_secret FROM web_private LIMIT 1`, []);
  if (!config?.insta_app_secret) return null;
  return require("crypto")
    .createHash("sha256")
    .update(`insta-webhook:${config.insta_app_secret}`)
    .digest("hex")
    .slice(0, 24);
}

/**
 * App-level Instagram webhook URL (the verify token is the last path segment).
 */
async function genInstaWebhook() {
  try {
    const callback = await getInstaCallbackUri();
    if (!callback) return null;
    const domain = callback.replace(/\/api\/insta\/callback\/?$/, "").replace(/\/+$/, "");
    const token = await getInstaWebhookToken();
    if (!token) return null;
    return `${domain}/api/insta/webhook/${token}`;
  } catch (err) {
    console.error("[Instagram] Error generating webhook URL:", err);
    return null;
  }
}

/**
 * Subscribe the connected Instagram professional account to this app's webhooks
 * (Instagram API with Instagram Login uses graph.instagram.com/me/subscribed_apps).
 */
async function subscribeInstaWebhook(accessToken) {
  try {
    const url = `https://graph.instagram.com/${API_VERSION}/me/subscribed_apps`;

    const response = await axios.post(url, null, {
      params: {
        access_token: accessToken,
        subscribed_fields: "messages,messaging_postbacks,messaging_seen,message_reactions,comments",
      },
    });

    console.log("[Instagram] Webhook subscription response:", response.data);
    return response.data;
  } catch (err) {
    console.error("[Instagram] Webhook subscription error:", err.response?.data || err.message);
    return null;
  }
}

/**
 * Get Instagram OAuth callback URI
 */
async function getInstaCallbackUri() {
  try {
    const [config] = await query(`SELECT insta_callback_url FROM web_private LIMIT 1`, []);
    if (config?.insta_callback_url) return config.insta_callback_url.trim();
    // Default to the public app URL when the admin hasn't set one.
    const base = String(process.env.FRONTENDURI || "").replace(/\/+$/, "");
    if (base) return `${base}/api/insta/callback`;
    console.error("[Instagram] Callback URL not configured in web_private");
    return null;
  } catch (err) {
    console.error("[Instagram] Error getting callback URI:", err);
    return null;
  }
}

/**
 * Exchange authorization code for short-lived access token
 */
async function exchangeShortToken({ appId, appSecret, redirectUri, code }) {
  try {
    const url = "https://api.instagram.com/oauth/access_token";
    
    const formData = new URLSearchParams();
    formData.append("client_id", appId);
    formData.append("client_secret", appSecret);
    formData.append("grant_type", "authorization_code");
    formData.append("redirect_uri", redirectUri);
    formData.append("code", code);

    const response = await axios.post(url, formData, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    console.log("[Instagram] Short token exchange success");
    return response.data;
  } catch (err) {
    console.error("[Instagram] Short token exchange error:", err.response?.data || err.message);
    return { error: err.response?.data || err.message };
  }
}

/**
 * Exchange short-lived token for long-lived token (60 days)
 */
async function exchangeLongToken({ appSecret, shortToken }) {
  try {
    const url = `https://graph.instagram.com/access_token`;
    
    const response = await axios.get(url, {
      params: {
        grant_type: "ig_exchange_token",
        client_secret: appSecret,
        access_token: shortToken,
      },
    });

    console.log("[Instagram] Long token exchange success. Expires in:", response.data.expires_in, "seconds");
    return response.data;
  } catch (err) {
    console.error("[Instagram] Long token exchange error:", err.response?.data || err.message);
    // Return short token as fallback
    return { access_token: shortToken, token_type: "bearer", expires_in: 3600 };
  }
}

/**
 * Fetch Instagram user profile information
 */
async function fetchInstaProfile(token) {
  try {
    const url = `https://graph.instagram.com/me`;
    
    const response = await axios.get(url, {
      params: {
        // user_id is the professional account id that webhooks use as entry.id;
        // id alone is app-scoped and would not match incoming webhooks.
        fields: "id,user_id,username,name,account_type,profile_picture_url,media_count",
        access_token: token,
      },
    });

    console.log("[Instagram] Profile fetched:", response.data.username);
    return response.data;
  } catch (err) {
    console.error("[Instagram] Profile fetch error:", err.response?.data || err.message);
    return null;
  }
}

/**
 * Send Instagram direct message
 */
async function sendInstaMessage({ recipientId, message, accessToken, instagramAccountId }) {
  try {
    const url = `https://graph.facebook.com/${API_VERSION}/${instagramAccountId}/messages`;
    
    const response = await axios.post(url, {
      recipient: { id: recipientId },
      message: { text: message },
    }, {
      params: { access_token: accessToken },
    });

    return response.data;
  } catch (err) {
    console.error("[Instagram] Send message error:", err.response?.data || err.message);
    return null;
  }
}

/**
 * Reply to Instagram comment
 */
async function replyInstaComment({ commentId, message, accessToken }) {
  try {
    const url = `https://graph.facebook.com/${API_VERSION}/${commentId}/replies`;
    
    const response = await axios.post(url, {
      message: message,
    }, {
      params: { access_token: accessToken },
    });

    return response.data;
  } catch (err) {
    console.error("[Instagram] Reply comment error:", err.response?.data || err.message);
    return null;
  }
}

module.exports = {
  checkInsta,
  genInstaWebhook,
  exchangeShortToken,
  exchangeLongToken,
  fetchInstaProfile,
  sendInstaMessage,
  replyInstaComment,
  API_VERSION,
  getInstaCallbackUri,
  subscribeInstaWebhook,
  getInstaWebhookToken,
};
