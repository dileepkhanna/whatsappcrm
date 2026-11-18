// ─────────────────────────────────────────────────────────────────────────────
// Inbound WhatsApp AI call orchestrator.
//
// Called from the Meta webhook (routes/inbox.js, `case "calls"`) as
//   handleCalls(change, userUID, body)
// for calls that are NOT broadcast/outbound (i.e. a customer called the
// business number).
//
// Lifecycle:
//   event "connect"  → the payload carries an SDP offer in callEvent.session.sdp.
//                      We find the user's ACTIVE call bot + its flow, build a
//                      WebRTC answer, `accept` the call on Meta with that answer,
//                      wait for ICE, then run the flow (speak/listen) and finally
//                      terminate + log.
//   event "terminate"→ the caller hung up; tear down the session and log.
//
// Requirements at runtime: meta_api row (access_token + business_phone_number_id),
// an active wa_call_bot pointing at a wa_call_flows row, and ElevenLabs voice
// config saved in the flow (data.voice) or ELEVENLABS_API_KEY in env.
// ─────────────────────────────────────────────────────────────────────────────

const { query } = require("../../../database/dbpromise.js");
const { CallSession } = require("./callSession");
const { runCallFlow } = require("./flowExecutor");
const { waitForIceConnection, saveRecording } = require("./audioUtils");
const { acceptCall, terminateCall } = require("./metaCallApi");

// Active sessions keyed by Meta call_id.
const activeCalls = new Map();

// The plan-gate stub kept `checkWaCall` returning true; preserve that export so
// existing imports keep working. Real plan gating is done by middlewares/plan.js.
function checkWaCall() {
  return true;
}

async function getMetaApi(uid) {
  const [row] = await query(`SELECT * FROM meta_api WHERE uid = ? LIMIT 1`, [uid]);
  return row || null;
}

async function getActiveFlow(uid) {
  const [bot] = await query(
    `SELECT * FROM wa_call_bot WHERE uid = ? AND active = 1 LIMIT 1`,
    [uid],
  );
  if (!bot) return null;
  const [flow] = await query(
    `SELECT * FROM wa_call_flows WHERE uid = ? AND flow_id = ? LIMIT 1`,
    [uid, bot.flow_id],
  );
  if (!flow) return null;
  let data = {};
  try {
    data = typeof flow.data === "string" ? JSON.parse(flow.data) : flow.data || {};
  } catch (_) {
    data = {};
  }
  return { bot, flow, data };
}

async function logCall({ uid, callId, from, to, status, duration, extra }) {
  try {
    await query(
      `INSERT INTO wa_call_logs (uid, call_id, from_number, to_number, status, duration, data, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        uid,
        callId,
        from || null,
        to || null,
        status || null,
        Number.isFinite(duration) ? duration : null,
        extra ? JSON.stringify(extra) : null,
      ],
    );
  } catch (err) {
    console.error("[wa-call] logCall failed:", err.message);
  }
}

async function handleConnect({ uid, callEvent, phoneNumberId, metaApi, businessNumber }) {
  const callId = callEvent.id;
  const from = callEvent.from || callEvent.contact?.wa_id || null;
  const offerSdp = callEvent.session?.sdp;

  if (!offerSdp) {
    console.error(`[wa-call] connect for ${callId} had no SDP offer; ignoring.`);
    return;
  }

  const active = await getActiveFlow(uid);
  if (!active) {
    console.warn(`[wa-call] No active call bot for uid ${uid}; rejecting call ${callId}.`);
    await terminateCall({
      phoneNumberId,
      accessToken: metaApi.access_token,
      callId,
    });
    await logCall({ uid, callId, from, to: businessNumber, status: "no_bot", duration: 0 });
    return;
  }

  const session = new CallSession({ callId });
  const startedAt = Date.now();
  // A LIVE transcript array shared with the flow executor. It's appended to as
  // the conversation happens, so even if the flow throws mid-call or the caller
  // hangs up abruptly, we still have everything said up to that point.
  const transcript = [];
  const callEntry = { session, uid, from, startedAt, transcript, flowId: active.flow.flow_id, businessNumber, phoneNumberId, saved: false };
  activeCalls.set(callId, callEntry);

  // Persist whatever we have so far. Safe to call multiple times; the last call
  // (with the final status) wins. Used by success, error, AND terminate paths.
  const persist = async (status, extra = {}) => {
    if (callEntry.saved && status !== "completed" && status !== "failed") return;
    callEntry.saved = true;
    let recordingUrl = null;
    try {
      const merged = session.getCapturedSoFar?.();
      if (merged && merged.length) {
        recordingUrl = saveRecording({ pcm: merged, sampleRate: 16000, fileName: `call_${callId}.wav` });
      }
    } catch (_) {}
    await logCall({
      uid,
      callId,
      from,
      to: businessNumber,
      status,
      duration: Math.round((Date.now() - startedAt) / 1000),
      extra: { flow_id: active.flow.flow_id, transcript, recordingUrl, ...extra },
    });
  };
  callEntry.persist = persist;

  try {
    // 1) Build our SDP answer from Meta's offer.
    const answerSdp = await session.createAnswer(offerSdp);

    // 2) Accept the call on Meta with our answer.
    const accepted = await acceptCall({
      phoneNumberId,
      accessToken: metaApi.access_token,
      callId,
      sdpAnswer: answerSdp,
    });
    if (!accepted.success) {
      throw new Error(`Meta accept failed: ${accepted.error?.message || "unknown"}`);
    }

    // 3) Wait for the media path to come up.
    const iceOk = await waitForIceConnection(session.pc, 15000);
    if (!iceOk) {
      console.warn(`[wa-call] ICE not connected for ${callId}; proceeding anyway.`);
    }

    // 4) Run the flow (speak / listen). The executor appends to `transcript`
    //    live as each turn happens.
    const voice = active.data?.voice || {};
    await runCallFlow({
      session,
      flowData: active.data,
      voice,
      transcript,
      uid,
    });

    // 5) End the call on Meta.
    await terminateCall({ phoneNumberId, accessToken: metaApi.access_token, callId });
    await persist("completed");
  } catch (err) {
    console.error(`[wa-call] call ${callId} failed:`, err.message);
    try {
      await terminateCall({ phoneNumberId, accessToken: metaApi.access_token, callId });
    } catch (_) {}
    // Save the PARTIAL transcript collected before the error, so customer speech
    // is never lost even when the flow crashes mid-call.
    await persist("failed", { error: err.message });
  } finally {
    session.close();
    activeCalls.delete(callId);
  }
}

async function handleTerminate({ uid, callEvent, businessNumber }) {
  const callId = callEvent.id;
  const entry = activeCalls.get(callId);

  if (entry) {
    // Caller hung up while our flow was still running. Save whatever the
    // customer said so far (via the live transcript on the entry), then tear
    // down. This is the key path for "never lose the customer's speech".
    if (entry.persist && !entry.saved) {
      try {
        await entry.persist("completed", { endedBy: "caller" });
      } catch (_) {}
    }
    try {
      entry.session.close();
    } catch (_) {}
    activeCalls.delete(callId);
    return; // persist() already wrote the log with the transcript
  }

  // No active session found (call ended before/independently of our flow) —
  // still record the basic call event.
  await logCall({
    uid,
    callId,
    from: callEvent.from || null,
    to: businessNumber,
    status: callEvent.status || "terminated",
    duration: Number(callEvent.duration) || 0,
  });
}

/**
 * Entry point invoked by the webhook. Mirrors the existing call signature:
 *   handleCalls(change, userUID, body)
 * `change` is body.entry[0].changes[0] with field === "calls".
 */
async function handleCalls(change, userUID, _body) {
  try {
    const value = change?.value || {};
    const phoneNumberId = value.metadata?.phone_number_id;
    const businessNumber = value.metadata?.display_phone_number || null;
    const calls = value.calls || [];

    if (!userUID) {
      console.error("[wa-call] handleCalls called without userUID.");
      return;
    }
    const metaApi = await getMetaApi(userUID);
    if (!metaApi?.access_token || !phoneNumberId) {
      console.error("[wa-call] Missing meta_api/access_token or phone_number_id; cannot handle call.");
      return;
    }

    for (const callEvent of calls) {
      if (callEvent.event === "connect") {
        // Fire and forget — the call runs for its whole duration; we must not
        // block the webhook response.
        setImmediate(() =>
          handleConnect({ uid: userUID, callEvent, phoneNumberId, metaApi, businessNumber }),
        );
      } else if (callEvent.event === "terminate") {
        await handleTerminate({ uid: userUID, callEvent, businessNumber });
      }
    }
  } catch (err) {
    console.error("[wa-call] handleCalls error:", err.message);
  }
}

module.exports = { handleCalls, checkWaCall, activeCalls };
