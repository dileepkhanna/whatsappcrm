// ─────────────────────────────────────────────────────────────────────────────
// Lead Auto-Call trigger engine.
//
// When a NEW lead arrives (webhook / upload / sheet / manual) and the user has
// auto-call turned ON with a chosen flow, we immediately kick off a WhatsApp
// AI call to that lead to collect more details.
//
// IMPLEMENTATION NOTE — why we reuse wa_call_broadcasts:
//   The existing, already-verified outbound engine (broadcastProcessor.js) plus
//   the webhook wiring in routes/inbox.js correlate call-permission replies and
//   the WebRTC "connect" event via a wa_call_broadcasts row (matched by the
//   contact's mobile). Rather than duplicate that fragile correlation, each new
//   lead becomes a tiny single-contact broadcast campaign. The engine then:
//     1. sends the call-permission request,
//     2. the customer taps "Allow" → webhook marks permission granted,
//     3. we place the call and run the SAME flow engine used everywhere.
//
//   We keep the wa_call_leads row in sync (permission/call status + transcript)
//   by reading the campaign's per-contact JSON, so the Lead Auto-Call UI shows
//   live progress and the collected conversation.
//
// Meta constraint: WhatsApp business-initiated calls require the customer to
// accept a permission request first. Cold PSTN calling (Twilio etc.) is a
// separate future transport and is intentionally NOT wired here.
// ─────────────────────────────────────────────────────────────────────────────

const { query } = require("../../../database/dbpromise.js");
const leadStore = require("./leadStore.js");
const {
  processPermissionRequests,
  processBroadcastCalls,
} = require("./broadcastProcessor.js");
const { checkCallPermission } = require("./metaCallApi.js");

// Guard so we don't fire two campaigns for the same lead concurrently.
// Map of leadId -> lockedAt (ms). A lock older than LOCK_TTL_MS is considered
// stale and auto-released, so a lead can never get permanently stuck on
// "already in progress" (e.g. if a previous attempt died mid-way).
const inFlightMap = new Map();
const LOCK_TTL_MS = 2 * 60 * 1000; // 2 minutes

const inFlight = {
  has(id) {
    const at = inFlightMap.get(id);
    if (!at) return false;
    if (Date.now() - at > LOCK_TTL_MS) {
      inFlightMap.delete(id); // stale → release
      return false;
    }
    return true;
  },
  add(id) {
    inFlightMap.set(id, Date.now());
  },
  delete(id) {
    inFlightMap.delete(id);
  },
};

async function getUser(uid) {
  const [row] = await query(`SELECT * FROM user WHERE uid = ? LIMIT 1`, [uid]);
  return row || null;
}

async function getMetaApi(uid) {
  const [row] = await query(`SELECT * FROM meta_api WHERE uid = ? LIMIT 1`, [uid]);
  return row || null;
}

async function flowExists(uid, flowId) {
  if (!flowId) return false;
  const [row] = await query(
    `SELECT flow_id FROM wa_call_flows WHERE uid = ? AND flow_id = ? LIMIT 1`,
    [uid, flowId],
  );
  return !!row;
}

// Force the (single) contact of a lead campaign to permission_status=granted,
// so watchCampaign immediately proceeds to place the call. Used when Meta
// reports permission was already granted (direct-call path).
async function markContactGranted(campaignId) {
  try {
    const [row] = await query(
      `SELECT contacts FROM wa_call_broadcasts WHERE campaign_id = ? LIMIT 1`,
      [campaignId],
    );
    if (!row) return;
    let contacts = [];
    try {
      contacts = JSON.parse(row.contacts || "[]");
    } catch {
      contacts = [];
    }
    if (contacts[0]) {
      contacts[0].permission_status = "granted";
      contacts[0].permission_granted_at = new Date().toISOString();
    }
    await query(
      `UPDATE wa_call_broadcasts SET contacts = ?, status = 'running' WHERE campaign_id = ?`,
      [JSON.stringify(contacts), campaignId],
    );
  } catch (err) {
    console.error("[wa-call][lead] markContactGranted error:", err.message);
  }
}

// The minimal schema of wa_call_broadcasts (whatscrm_schema.sql) is missing the
// `contacts`, `call_delay`, and per-status stat columns that broadcastProcessor
// and this engine write to. Add them on demand so BOTH lead auto-calls and the
// regular broadcast feature work without a manual migration. Runs once.
let columnsEnsured = false;
async function ensureBroadcastColumns() {
  if (columnsEnsured) return;
  let have = new Set();
  try {
    const cols = await query(`SHOW COLUMNS FROM wa_call_broadcasts`);
    have = new Set((cols || []).map((c) => c.Field));
  } catch (_) {}
  const wanted = [
    ["contacts", "LONGTEXT NULL"],
    ["call_delay", "INT DEFAULT 5000"],
    ["meta_data", "LONGTEXT NULL"],
  ];
  // Run each ADD COLUMN separately, ignoring duplicate-column errors, so one
  // existing column can't abort the whole ALTER.
  for (const [name, def] of wanted) {
    if (have.has(name)) continue;
    try {
      await query(`ALTER TABLE wa_call_broadcasts ADD COLUMN \`${name}\` ${def}`);
    } catch (e) {
      if (e && e.code !== "ER_DUP_FIELDNAME") {
        console.error(`[wa-call][lead] add column ${name} failed:`, e.message);
      }
    }
  }
  columnsEnsured = true;
}

/**
 * Build a single-contact broadcast campaign for one lead and start the
 * permission-request phase. Returns { started, reason, campaignId }.
 */
async function triggerCallForLead(uid, lead) {
  try {
    console.log(`[wa-call][lead] triggerCallForLead: lead #${lead?.id} ${lead?.mobile} (uid ${uid})`);
    if (!lead || !lead.mobile) return { started: false, reason: "no_mobile" };
    if (inFlight.has(lead.id)) {
      console.log(`[wa-call][lead] lead #${lead.id} is locked (in flight); rejecting`);
      return { started: false, reason: "in_flight" };
    }

    // NOTE: the auto_call ON/OFF gate lives in onNewLead (the automatic path).
    // triggerCallForLead is also used by the manual "Call now" button, which
    // must work regardless of the auto-call toggle.
    const settings = await leadStore.getSettings(uid);
    if (!(await flowExists(uid, settings.flow_id))) {
      await leadStore.updateLead(lead.id, {
        status: "error",
        error_message: "No valid call flow selected in Lead Auto-Call settings",
      });
      return { started: false, reason: "no_flow" };
    }

    const metaApi = await getMetaApi(uid);
    if (!metaApi?.access_token || !metaApi?.business_phone_number_id) {
      await leadStore.updateLead(lead.id, {
        status: "error",
        error_message: "Meta API not configured (Profile → META API)",
      });
      return { started: false, reason: "no_meta_api" };
    }

    inFlight.add(lead.id);

    const campaignId = `LEAD_${lead.id}_${Date.now()}`;
    const contact = {
      id: `${campaignId}_0`,
      lead_id: lead.id,
      name: lead.name || "",
      mobile: String(lead.mobile).replace(/[^\d]/g, ""),
      permission_status: "pending",
      permission_requested_at: null,
      permission_granted_at: null,
      call_status: "pending",
      call_id: null,
      call_initiated_at: null,
      call_completed_at: null,
      call_duration: null,
      error_message: null,
      retry_count: 0,
    };

    const campaignData = {
      uid,
      campaign_id: campaignId,
      title: `Lead call: ${lead.name || lead.mobile}`,
      flow_id: settings.flow_id,
      status: "requesting_permissions",
      contacts: JSON.stringify([contact]),
      total_contacts: 1,
      logs: JSON.stringify([
        {
          timestamp: new Date().toISOString(),
          type: "lead_auto_call",
          message: `Auto-call campaign for lead #${lead.id}`,
        },
      ]),
      started_at: new Date(),
    };

    // Make sure the broadcast table has the columns the engine writes to.
    await ensureBroadcastColumns();
    await query(`INSERT INTO wa_call_broadcasts SET ?`, campaignData);

    await leadStore.updateLead(lead.id, {
      status: "calling",
      call_status: "checking_permission",
      called_at: new Date(),
    });

    // Step 0: has this consumer ALREADY granted permission? If so we can call
    // directly and skip the permission request entirely — which also avoids
    // Meta's per-pair permission-request rate limit (error #138009).
    const cleanMobile = String(lead.mobile).replace(/[^\d]/g, "");
    const perm = await checkCallPermission({
      phoneNumberId: metaApi.business_phone_number_id,
      accessToken: metaApi.access_token,
      to: cleanMobile,
    });
    console.log(`[wa-call][lead] call_permissions for ${cleanMobile}:`, JSON.stringify(perm.raw || perm));

    if (perm.granted) {
      console.log(`[wa-call][lead] permission already granted for ${cleanMobile}; calling directly`);
      // Mark the campaign contact granted so watchCampaign places the call now.
      await markContactGranted(campaignId);
      await leadStore.updateLead(lead.id, {
        permission_status: "granted",
        call_status: "calling",
      });
      watchCampaign(uid, campaignId, lead.id);
      return { started: true, campaignId, direct: true };
    }

    // Step 1: no existing permission → request it (awaited so we surface errors).
    await leadStore.updateLead(lead.id, {
      permission_status: "requested",
      call_status: "permission_requested",
    });
    const permResult = await processPermissionRequests(campaignId, uid);
    if (!permResult || permResult.sent < 1) {
      const errMsg = permResult?.error || "Could not send the WhatsApp call-permission request";
      const rateLimited = /138009|limit reached/i.test(errMsg);
      await leadStore.updateLead(lead.id, {
        status: rateLimited ? "waiting_permission" : "error",
        permission_status: rateLimited ? "requested" : "send_failed",
        call_status: rateLimited ? "permission_requested" : "failed",
        error_message: rateLimited
          ? "Already asked this person recently. Waiting for them to tap Allow (Meta limits repeat requests)."
          : errMsg,
      });
      inFlight.delete(lead.id);
      console.error(`[wa-call][lead] permission send failed for lead #${lead.id}: ${errMsg}`);
      // If rate-limited, they may still tap an earlier request → keep watching.
      if (rateLimited) {
        inFlight.add(lead.id);
        watchCampaign(uid, campaignId, lead.id);
        return { started: true, campaignId, waiting: true };
      }
      return { started: false, reason: "send_failed", error: errMsg };
    }

    // The permission message went out. Now watch for the customer's "Allow"
    // (arrives on the webhook) → then place the call, syncing lead status.
    watchCampaign(uid, campaignId, lead.id);

    return { started: true, campaignId };
  } catch (err) {
    console.error("[wa-call][lead] triggerCallForLead error:", err.message);
    inFlight.delete(lead.id);
    return { started: false, reason: err.message };
  }
}

// Poll the campaign row: once the single contact's permission is granted, start
// calling; keep the lead row's status/transcript mirrored; stop when the call
// is done or we time out (permission requests can expire).
function watchCampaign(uid, campaignId, leadId, { timeoutMs = 1000 * 60 * 30 } = {}) {
  const startedAt = Date.now();
  let callingStarted = false;

  const timer = setInterval(async () => {
    try {
      const [row] = await query(
        `SELECT * FROM wa_call_broadcasts WHERE campaign_id = ? LIMIT 1`,
        [campaignId],
      );
      if (!row) {
        clearInterval(timer);
        inFlight.delete(leadId);
        return;
      }

      let contacts = [];
      try {
        contacts = JSON.parse(row.contacts || "[]");
      } catch {
        contacts = [];
      }
      const c = contacts[0] || {};

      // Mirror status to the lead row.
      await leadStore.updateLead(leadId, {
        permission_status: c.permission_status || "pending",
        call_status: c.call_status || "pending",
        call_id: c.call_id || null,
        call_duration: Number.isFinite(c.call_duration) ? c.call_duration : null,
        error_message: c.error_message || null,
      });

      // When permission granted, place the call (once).
      if (c.permission_status === "granted" && !callingStarted) {
        callingStarted = true;
        await query(
          `UPDATE wa_call_broadcasts SET status = 'running' WHERE campaign_id = ?`,
          [campaignId],
        );
        setImmediate(() => processBroadcastCalls(campaignId, uid));
      }

      // Terminal states: pull transcript from the call log and finish.
      if (["completed", "failed", "rejected"].includes(c.call_status)) {
        await syncTranscriptFromLog(uid, leadId, c.call_id);
        await leadStore.updateLead(leadId, {
          status: c.call_status === "completed" ? "completed" : "error",
        });
        clearInterval(timer);
        inFlight.delete(leadId);
        return;
      }
      if (["denied", "expired"].includes(c.permission_status)) {
        await leadStore.updateLead(leadId, { status: "no_permission" });
        clearInterval(timer);
        inFlight.delete(leadId);
        return;
      }
      if (c.permission_status === "send_failed") {
        await leadStore.updateLead(leadId, {
          status: "error",
          error_message: c.error_message || "Permission request failed to send",
        });
        clearInterval(timer);
        inFlight.delete(leadId);
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        await leadStore.updateLead(leadId, {
          status: "timeout",
          error_message: "Permission not granted in time",
        });
        clearInterval(timer);
        inFlight.delete(leadId);
      }
    } catch (err) {
      console.error("[wa-call][lead] watchCampaign error:", err.message);
    }
  }, 4000);
}

// Copy the transcript captured during the call (stored in wa_call_logs.data) to
// the lead row, so "what the customer said" is visible right on the lead.
async function syncTranscriptFromLog(uid, leadId, callId) {
  try {
    if (!callId) return;
    const [log] = await query(
      `SELECT data FROM wa_call_logs WHERE uid = ? AND call_id = ? ORDER BY id DESC LIMIT 1`,
      [uid, callId],
    );
    if (!log?.data) return;
    let parsed = {};
    try {
      parsed = JSON.parse(log.data);
    } catch {
      parsed = {};
    }
    if (Array.isArray(parsed.transcript)) {
      await leadStore.updateLead(leadId, { transcript: parsed.transcript });
    }
  } catch (err) {
    console.error("[wa-call][lead] syncTranscriptFromLog error:", err.message);
  }
}

/**
 * Called right after a lead is inserted. Fires the auto-call only when enabled.
 * Safe to call for every new lead; it self-gates on settings.
 */
async function onNewLead(uid, lead) {
  try {
    const settings = await leadStore.getSettings(uid);
    if (!settings.auto_call) return { started: false, reason: "auto_call_off" };
    return await triggerCallForLead(uid, lead);
  } catch (err) {
    console.error("[wa-call][lead] onNewLead error:", err.message);
    return { started: false, reason: err.message };
  }
}

module.exports = {
  onNewLead,
  triggerCallForLead,
};
