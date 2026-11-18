// ─────────────────────────────────────────────────────────────────────────────
// Meta WhatsApp Business Calling — Cloud API client.
//
// All call control goes through a single Graph endpoint:
//   POST https://graph.facebook.com/<version>/<PHONE_NUMBER_ID>/calls
// with an "action" of: pre_accept | accept | reject | terminate.
//
// For pre_accept / accept we must supply our WebRTC SDP *answer* as:
//   { call_id, action, session: { sdp_type: "answer", sdp: "<sdp string>" } }
//
// Reference: Meta "WhatsApp Business Calling API" (Cloud API). The exact JSON
// shape is documented by Meta; this module isolates it so the rest of the code
// never hard-codes Graph URLs. Version is pinned but overridable via env.
// ─────────────────────────────────────────────────────────────────────────────

const axios = require("axios");

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";

function graphUrl(phoneNumberId) {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/calls`;
}

function authHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

/**
 * Low-level POST to the /calls endpoint. Returns { success, data, error }.
 * Never throws — callers get a normalized result so the webhook stays resilient.
 */
async function callAction({ phoneNumberId, accessToken, callId, action, session, extra = {} }) {
  if (!phoneNumberId || !accessToken) {
    return { success: false, error: { message: "Missing phoneNumberId or accessToken" } };
  }
  const payload = {
    messaging_product: "whatsapp",
    call_id: callId,
    action,
    ...extra,
  };
  if (session) payload.session = session;

  try {
    const res = await axios.post(graphUrl(phoneNumberId), payload, {
      headers: authHeaders(accessToken),
      timeout: 15000,
    });
    return { success: true, data: res.data };
  } catch (err) {
    const metaErr = err.response?.data?.error || { message: err.message };
    console.error(
      `[wa-call] Meta call action "${action}" failed for ${callId}:`,
      JSON.stringify(metaErr),
    );
    return { success: false, error: metaErr };
  }
}

/**
 * Optionally "pre-accept" the call. Pre-accepting lets media start flowing
 * (and ICE connect) before the full accept, reducing the gap of silence at the
 * start of the call. Carries our SDP answer.
 */
async function preAcceptCall({ phoneNumberId, accessToken, callId, sdpAnswer }) {
  return callAction({
    phoneNumberId,
    accessToken,
    callId,
    action: "pre_accept",
    session: { sdp_type: "answer", sdp: sdpAnswer },
  });
}

/**
 * Accept the call, supplying our WebRTC SDP answer. After Meta processes this,
 * the RTP audio path is live end-to-end.
 */
async function acceptCall({ phoneNumberId, accessToken, callId, sdpAnswer }) {
  return callAction({
    phoneNumberId,
    accessToken,
    callId,
    action: "accept",
    session: { sdp_type: "answer", sdp: sdpAnswer },
  });
}

/** Reject an inbound call outright (no answer). */
async function rejectCall({ phoneNumberId, accessToken, callId }) {
  return callAction({ phoneNumberId, accessToken, callId, action: "reject" });
}

/** Terminate/hang up an active call. */
async function terminateCall({ phoneNumberId, accessToken, callId }) {
  return callAction({ phoneNumberId, accessToken, callId, action: "terminate" });
}

/**
 * Initiate an OUTBOUND call (business-initiated). Meta then drives the WebRTC
 * handshake: it replies with an SDP offer via the "calls" webhook (connect
 * event), which our broadcast connect handler answers.
 *
 * biz_opaque_callback_data lets us correlate the webhook back to a campaign +
 * contact (we stuff { campaign_id, mobile } JSON in there).
 */
async function initiateCall({ phoneNumberId, accessToken, to, callbackData, sdpOffer }) {
  if (!phoneNumberId || !accessToken) {
    return { success: false, error: { message: "Missing phoneNumberId or accessToken" } };
  }
  const payload = {
    messaging_product: "whatsapp",
    to,
    action: "connect",
  };
  // WhatsApp business-initiated calls require our WebRTC SDP OFFER in `session`.
  // Without it Meta returns 131009 "Missing session parameter".
  if (sdpOffer) {
    payload.session = { sdp_type: "offer", sdp: sdpOffer };
  }
  if (callbackData) payload.biz_opaque_callback_data = callbackData;

  try {
    const res = await axios.post(graphUrl(phoneNumberId), payload, {
      headers: authHeaders(accessToken),
      timeout: 15000,
    });
    // Meta returns the new call id.
    const callId = res.data?.calls?.[0]?.id || res.data?.id || null;
    return { success: true, data: res.data, callId };
  } catch (err) {
    const metaErr = err.response?.data?.error || { message: err.message };
    console.error(`[wa-call] initiateCall to ${to} failed:`, JSON.stringify(metaErr));
    return { success: false, error: metaErr };
  }
}

/**
 * Send an interactive "call permission request" message. Business-initiated
 * calls require the customer to grant permission first; they reply accept/reject
 * which arrives on the messages webhook as interactive.call_permission_reply.
 */
async function sendCallPermissionRequest({ phoneNumberId, accessToken, to, bodyText }) {
  if (!phoneNumberId || !accessToken) {
    return { success: false, error: { message: "Missing phoneNumberId or accessToken" } };
  }
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "call_permission_request",
      body: { text: bodyText || "May we call you to assist with your request?" },
      action: { name: "call_permission_request" },
    },
  };
  try {
    const res = await axios.post(url, payload, {
      headers: authHeaders(accessToken),
      timeout: 15000,
    });
    return { success: true, data: res.data, messageId: res.data?.messages?.[0]?.id || null };
  } catch (err) {
    const metaErr = err.response?.data?.error || { message: err.message };
    console.error(`[wa-call] sendCallPermissionRequest to ${to} failed:`, JSON.stringify(metaErr));
    return { success: false, error: metaErr };
  }
}

/**
 * Check whether a consumer has already granted call permission, so we can call
 * directly WITHOUT sending another permission request (which is rate-limited by
 * Meta per business-consumer pair — error #138009).
 *
 * GET /{phone_number_id}/call_permissions?user_wa_id=<to>
 * Returns { granted: bool, canRequest: bool, raw }. On any error we return
 * granted:false, canRequest:true so callers fall back to the normal request.
 */
async function checkCallPermission({ phoneNumberId, accessToken, to }) {
  if (!phoneNumberId || !accessToken) {
    return { granted: false, canRequest: true, error: "Missing phoneNumberId or accessToken" };
  }
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/call_permissions`;
  try {
    const res = await axios.get(url, {
      headers: authHeaders(accessToken),
      params: { user_wa_id: to },
      timeout: 15000,
    });
    const data = res.data || {};
    // Meta's response (and BSP mirrors) look roughly like:
    //   { permission: { status: "no_permission"|"temporary"|"permanent",
    //                   expiration_timestamp },
    //     actions: { can_call, can_send_call_permission_request } }
    // Shapes vary across API versions, so probe several locations.
    const permission = data?.permission || data?.data?.[0]?.permission || data?.data?.[0] || data;
    const status = String(
      permission?.status || permission?.permission_status || data?.status || "",
    ).toLowerCase();
    const actions = permission?.actions || data?.actions || {};
    // "temporary" and "permanent" both mean the user has granted permission.
    const granted =
      ["granted", "approved", "temporary", "permanent"].includes(status) ||
      actions?.can_call === true;
    const canRequest =
      actions?.can_send_call_permission_request !== false &&
      actions?.can_send_request !== false;
    return { granted, canRequest, status, raw: data };
  } catch (err) {
    const metaErr = err.response?.data?.error || { message: err.message };
    // Don't hard-fail — let the caller fall back to sending a request.
    return { granted: false, canRequest: true, error: metaErr.message, raw: metaErr };
  }
}

module.exports = {
  GRAPH_VERSION,
  preAcceptCall,
  acceptCall,
  rejectCall,
  terminateCall,
  initiateCall,
  sendCallPermissionRequest,
  checkCallPermission,
};
