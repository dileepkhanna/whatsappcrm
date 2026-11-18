// ─────────────────────────────────────────────────────────────────────────────
// Outbound (broadcast) WhatsApp AI calling.
//
// Flow of an outbound campaign:
//   1. start_permission_request → processPermissionRequests(): send each pending
//      contact a "call_permission_request" interactive message. The customer's
//      accept/reject lands on the messages webhook (handled in routes/inbox.js →
//      updateBroadcastContactPermission).
//   2. start_calling → processBroadcastCalls(): for contacts with granted
//      permission, initiate an outbound call via Meta. Meta then sends a "connect"
//      webhook with an SDP offer.
//   3. handleBroadcastCallConnect(): answer the offer with WebRTC, accept the
//      call, and run the SAME flow engine used for inbound calls.
//   4. handleBroadcastCallTerminate(): clean up + record status.
//
// This reuses callSession.js + flowExecutor.js (shared with inbound), and the
// Gemini/ElevenLabs voice bridge — so the free voice provider works here too.
//
// Resilience: campaign state (per-contact status) is kept inside the row's
// `contacts` JSON column, which is the one column all code paths agree on. We
// avoid writing stat columns that may not exist in every schema.
// ─────────────────────────────────────────────────────────────────────────────

const { query } = require("../../../database/dbpromise.js");
const { CallSession } = require("./callSession");
const { runCallFlow } = require("./flowExecutor");
const { waitForIceConnection } = require("./audioUtils");
const {
  acceptCall,
  terminateCall,
  initiateCall,
  sendCallPermissionRequest,
} = require("./metaCallApi");

// In-flight outbound calls, keyed by Meta call_id.
const outgoingCallStates = new Map();

// ── DB helpers ────────────────────────────────────────────────────────────────
async function getBroadcast(campaignId) {
  const [row] = await query(
    `SELECT * FROM wa_call_broadcasts WHERE campaign_id = ? LIMIT 1`,
    [campaignId],
  );
  return row || null;
}

function parseContacts(row) {
  try {
    return JSON.parse(row.contacts || "[]");
  } catch {
    return [];
  }
}

async function saveContacts(campaignId, contacts) {
  await query(`UPDATE wa_call_broadcasts SET contacts = ? WHERE campaign_id = ?`, [
    JSON.stringify(contacts),
    campaignId,
  ]);
}

async function appendLog(campaignId, type, message) {
  try {
    const row = await getBroadcast(campaignId);
    if (!row) return;
    const logs = (() => {
      try {
        return JSON.parse(row.logs || "[]");
      } catch {
        return [];
      }
    })();
    logs.push({ timestamp: new Date().toISOString(), type, message });
    await query(`UPDATE wa_call_broadcasts SET logs = ? WHERE campaign_id = ?`, [
      JSON.stringify(logs),
      campaignId,
    ]);
  } catch (err) {
    console.error("[wa-call] appendLog failed:", err.message);
  }
}

async function getMetaApi(uid) {
  const [row] = await query(`SELECT * FROM meta_api WHERE uid = ? LIMIT 1`, [uid]);
  return row || null;
}

async function getFlow(uid, flowId) {
  const [flow] = await query(
    `SELECT * FROM wa_call_flows WHERE uid = ? AND flow_id = ? LIMIT 1`,
    [uid, flowId],
  );
  if (!flow) return null;
  let data = {};
  try {
    data = typeof flow.data === "string" ? JSON.parse(flow.data) : flow.data || {};
  } catch {
    data = {};
  }
  return { flow, data };
}

// ── 1) Permission requests ──────────────────────────────────────────────────
async function processPermissionRequests(campaignId, uid) {
  try {
    const row = await getBroadcast(campaignId);
    if (!row) return;
    const metaApi = await getMetaApi(uid);
    if (!metaApi?.access_token || !metaApi?.business_phone_number_id) {
      await appendLog(campaignId, "error", "Meta API not configured");
      return;
    }
    const contacts = parseContacts(row);
    let sent = 0;
    let lastError = null;
    for (const c of contacts) {
      if (c.permission_status !== "pending") continue;
      const resp = await sendCallPermissionRequest({
        phoneNumberId: metaApi.business_phone_number_id,
        accessToken: metaApi.access_token,
        to: c.mobile,
      });
      if (resp.success) {
        c.permission_status = "requested";
        c.permission_requested_at = new Date().toISOString();
        sent += 1;
      } else {
        lastError = resp.error?.message || "permission request failed";
        c.error_message = lastError;
        // Mark clearly so watchers can stop instead of hanging on "pending".
        c.permission_status = "send_failed";
      }
    }
    await saveContacts(campaignId, contacts);
    await appendLog(campaignId, "permissions_requested", `Sent ${sent} permission request(s)`);
    return { sent, error: sent > 0 ? null : lastError };
  } catch (err) {
    console.error("[wa-call] processPermissionRequests error:", err.message);
    return { sent: 0, error: err.message };
  }
}

// ── 2) Place outbound calls to granted contacts ───────────────────────────────
async function processBroadcastCalls(campaignId, uid) {
  try {
    const row = await getBroadcast(campaignId);
    if (!row) return;
    const metaApi = await getMetaApi(uid);
    if (!metaApi?.access_token || !metaApi?.business_phone_number_id) {
      await appendLog(campaignId, "error", "Meta API not configured");
      return;
    }
    const delay = Number(row.call_delay) || 5000;
    const contacts = parseContacts(row);

    for (const c of contacts) {
      // Only call contacts that granted permission and haven't been called yet.
      const eligible =
        c.permission_status === "granted" &&
        ["pending", "failed"].includes(c.call_status);
      if (!eligible) continue;

      await initiateBroadcastCall({ campaignId, uid, metaApi, contact: c });
      // Persist incremental status and pace the calls.
      await saveContacts(campaignId, contacts);
      await new Promise((r) => setTimeout(r, delay));
    }

    await appendLog(campaignId, "calling_done", "Finished initiating calls");
  } catch (err) {
    console.error("[wa-call] processBroadcastCalls error:", err.message);
  }
}

async function initiateBroadcastCall({ campaignId, uid, metaApi, contact }) {
  const callbackData = JSON.stringify({ campaign_id: campaignId, mobile: contact.mobile });

  // Business-initiated calls: WE are the offerer. Build a WebRTC session and
  // create an SDP offer to include in the initiate request (Meta rejects the
  // call with 131009 "Missing session parameter" otherwise).
  const call = new CallSession({ callId: `pending_${Date.now()}` });
  let sdpOffer = null;
  try {
    sdpOffer = await call.createOffer();
  } catch (err) {
    contact.call_status = "failed";
    contact.error_message = `WebRTC offer failed: ${err.message}`;
    try { call.close(); } catch (_) {}
    return;
  }

  const resp = await initiateCall({
    phoneNumberId: metaApi.business_phone_number_id,
    accessToken: metaApi.access_token,
    to: contact.mobile,
    callbackData,
    sdpOffer,
  });

  if (resp.success && resp.callId) {
    contact.call_status = "ringing";
    contact.call_id = resp.callId;
    contact.call_initiated_at = new Date().toISOString();
    call.callId = resp.callId;
    // Keep the SAME session so the connect webhook applies Meta's ANSWER to it
    // (rather than building a new answer). started=false until connect arrives.
    outgoingCallStates.set(resp.callId, { campaignId, uid, contact, session: call, offered: true, ranFlow: false });

    // Some Meta responses include the answer SDP inline; if so, run immediately.
    const inlineAnswer = resp.data?.calls?.[0]?.session?.sdp || resp.data?.session?.sdp;
    if (inlineAnswer) {
      runOutboundFlow({ callId: resp.callId, uid, campaignId, answerSdp: inlineAnswer }).catch((e) =>
        console.error("[wa-call] runOutboundFlow (inline) error:", e.message),
      );
    }
  } else {
    contact.call_status = "failed";
    contact.error_message = resp.error?.message || "initiate failed";
    try { call.close(); } catch (_) {}
  }
}

// Run the AI flow for an outbound call once we have Meta's ANSWER SDP. Shared by
// the inline-answer path and the connect-webhook path.
async function runOutboundFlow({ callId, uid, campaignId, answerSdp }) {
  const state = outgoingCallStates.get(callId);
  if (!state || state.ranFlow) return;
  state.ranFlow = true;

  const metaApi = await getMetaApi(uid);
  const row = await getBroadcast(campaignId);
  const active = row ? await getFlow(uid, row.flow_id) : null;
  const call = state.session;
  if (!call || !active || !metaApi?.access_token) return;

  const startedAt = Date.now();
  try {
    await call.applyAnswer(answerSdp);
    await waitForIceConnection(call.pc, 15000);
    await runCallFlow({ session: call, flowData: active.data, voice: active.data?.voice || {}, uid });
    await terminateCall({
      phoneNumberId: metaApi.business_phone_number_id,
      accessToken: metaApi.access_token,
      callId,
    });
    const duration = Math.round((Date.now() - startedAt) / 1000);
    await updateContactInBroadcast(campaignId, state.contact?.mobile, {
      call_status: "completed",
      call_duration: duration,
      call_completed_at: new Date().toISOString(),
    });
    await logOutboundCall(uid, callId, metaApi, state.contact?.mobile, "completed", duration, {
      flow_id: row.flow_id,
    });
  } catch (err) {
    console.error(`[wa-call] outbound call ${callId} failed:`, err.message);
    try {
      await terminateCall({ phoneNumberId: metaApi.business_phone_number_id, accessToken: metaApi.access_token, callId });
    } catch (_) {}
    await updateContactInBroadcast(campaignId, state.contact?.mobile, {
      call_status: "failed",
      error_message: err.message,
    });
  } finally {
    try { call.close(); } catch (_) {}
    outgoingCallStates.delete(callId);
  }
}

// ── 3) Meta sent us the SDP offer for an outbound call ────────────────────────
async function handleBroadcastCallConnect(callId, session, callbackData) {
  const sdp = session?.sdp;
  const sdpType = session?.sdp_type || session?.sdpType;
  const state = outgoingCallStates.get(callId) || parseCallback(callbackData);
  if (!state) {
    console.error(`[wa-call] connect for unknown outbound call ${callId}`);
    return;
  }
  const { campaignId, uid } = state;

  // Case A — we OFFERED this call (business-initiated). Meta's connect event
  // carries its ANSWER. Apply it and run the flow (shared runOutboundFlow).
  if (state.offered && state.session) {
    if (!sdp) {
      console.error(`[wa-call] outbound connect ${callId} had no answer SDP`);
      return;
    }
    await runOutboundFlow({ callId, uid, campaignId, answerSdp: sdp });
    return;
  }

  // Case B — legacy path where Meta sent an OFFER and we answer (kept for
  // compatibility). Build an answer session and accept.
  const offerSdp = sdp;
  const row = await getBroadcast(campaignId);
  const metaApi = await getMetaApi(uid);
  if (!row || !metaApi?.access_token) return;

  const active = await getFlow(uid, row.flow_id);
  if (!active) {
    await terminateCall({ phoneNumberId: metaApi.business_phone_number_id, accessToken: metaApi.access_token, callId });
    return;
  }

  const call = new CallSession({ callId });
  const startedAt = Date.now();
  state.session = call;
  outgoingCallStates.set(callId, state);

  try {
    const answerSdp = await call.createAnswer(offerSdp);
    const accepted = await acceptCall({
      phoneNumberId: metaApi.business_phone_number_id,
      accessToken: metaApi.access_token,
      callId,
      sdpAnswer: answerSdp,
    });
    if (!accepted.success) throw new Error(accepted.error?.message || "accept failed");

    await waitForIceConnection(call.pc, 15000);

    await runCallFlow({ session: call, flowData: active.data, voice: active.data?.voice || {}, uid });

    await terminateCall({
      phoneNumberId: metaApi.business_phone_number_id,
      accessToken: metaApi.access_token,
      callId,
    });

    const duration = Math.round((Date.now() - startedAt) / 1000);
    await updateContactInBroadcast(campaignId, state.contact?.mobile, {
      call_status: "completed",
      call_duration: duration,
      call_completed_at: new Date().toISOString(),
    });
    await logOutboundCall(uid, callId, metaApi, state.contact?.mobile, "completed", duration, {
      flow_id: row.flow_id,
    });
  } catch (err) {
    console.error(`[wa-call] outbound call ${callId} failed:`, err.message);
    try {
      await terminateCall({ phoneNumberId: metaApi.business_phone_number_id, accessToken: metaApi.access_token, callId });
    } catch (_) {}
    await updateContactInBroadcast(campaignId, state.contact?.mobile, {
      call_status: "failed",
      error_message: err.message,
    });
  } finally {
    call.close();
    outgoingCallStates.delete(callId);
  }
}

// ── 4) Outbound call ended ────────────────────────────────────────────────────
async function handleBroadcastCallTerminate(callId, status, duration, callbackData) {
  const state = outgoingCallStates.get(callId) || parseCallback(callbackData);
  if (state?.session) {
    try {
      state.session.close();
    } catch (_) {}
  }
  outgoingCallStates.delete(callId);
  if (state?.campaignId) {
    await updateContactInBroadcast(state.campaignId, state.contact?.mobile, {
      call_status: status === "FAILED" ? "failed" : "completed",
      call_duration: Number(duration) || 0,
    });
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function parseCallback(callbackData) {
  if (!callbackData) return null;
  try {
    const parsed = typeof callbackData === "string" ? JSON.parse(callbackData) : callbackData;
    return parsed?.campaign_id ? { campaignId: parsed.campaign_id, contact: { mobile: parsed.mobile } } : null;
  } catch {
    return null;
  }
}

async function updateContactInBroadcast(campaignId, mobile, updates) {
  try {
    if (!campaignId || !mobile) return;
    const row = await getBroadcast(campaignId);
    if (!row) return;
    const contacts = parseContacts(row);
    const c = contacts.find((x) => x.mobile === mobile);
    if (!c) return;
    Object.assign(c, updates);
    await saveContacts(campaignId, contacts);
  } catch (err) {
    console.error("[wa-call] updateContactInBroadcast failed:", err.message);
  }
}

async function logOutboundCall(uid, callId, metaApi, to, status, duration, extra) {
  try {
    await query(
      `INSERT INTO wa_call_logs (uid, call_id, from_number, to_number, status, duration, data, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        uid,
        callId,
        metaApi?.business_phone_number_id || null,
        to || null,
        status,
        Number.isFinite(duration) ? duration : null,
        extra ? JSON.stringify(extra) : null,
      ],
    );
  } catch (err) {
    console.error("[wa-call] logOutboundCall failed:", err.message);
  }
}

module.exports = {
  processPermissionRequests,
  processBroadcastCalls,
  initiateBroadcastCall,
  handleBroadcastCallConnect,
  handleBroadcastCallTerminate,
  updateContactInBroadcast,
  outgoingCallStates,
};
