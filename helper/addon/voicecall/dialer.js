/**
 * Auto-dialer for AI Phone Calling.
 *
 * State lives in the database. Every tick it:
 *   1. recovers leads/calls stuck from a crash or restart
 *   2. for each running campaign, claims eligible leads atomically and dials
 */
const moment = require("moment-timezone");
const { query } = require("../../../database/dbpromise.js");
const store = require("./store.js");
const twilioClient = require("./twilioClient.js");
const { isDnc } = require("./leadIngest.js");
const { emitCall } = require("./notify.js");

const TICK_MS = 10000;
const LOCK_MINUTES = 20;
const ACTIVE_STATUSES = ["queued", "initiated", "ringing", "in-progress"];

let timer = null;
let running = false;
const lastDial = new Map(); // campaign_id -> ms

/** Is `now` inside the campaign window, evaluated in the given timezone? */
function inWindow(campaign, tz, now = moment()) {
  const zone = moment.tz.zone(tz) ? tz : "UTC";
  const local = now.clone().tz(zone);
  const days = String(campaign.window_days || "1,2,3,4,5,6,7")
    .split(",")
    .map((d) => parseInt(d, 10));
  if (!days.includes(local.isoWeekday())) return false;
  const [sh, sm] = String(campaign.window_start || "09:00").split(":").map(Number);
  const [eh, em] = String(campaign.window_end || "20:00").split(":").map(Number);
  const mins = local.hours() * 60 + local.minutes();
  return mins >= sh * 60 + sm && mins < eh * 60 + em;
}

function isConfigured(s) {
  return !!(
    s.twilio_account_sid &&
    s.twilio_auth_token &&
    s.twilio_numbers?.length &&
    s.openrouter_api_key &&
    s.eleven_api_key &&
    (s.eleven_voice_en || s.eleven_voice_te)
  );
}

async function recover() {
  // leads stuck in "calling" whose lock expired
  await query(
    `UPDATE vc_leads l JOIN vc_campaigns c ON c.campaign_id = l.campaign_id
       SET l.status = IF(l.attempts < c.max_attempts, 'retry', 'failed'),
           l.next_attempt_at = NOW(), l.locked_until = NULL
     WHERE l.status = 'calling' AND l.locked_until < NOW()`,
    [],
  );
  // calls that never reported a final status
  await query(
    `UPDATE vc_calls SET status = 'failed', error = COALESCE(error, 'Call did not finish'), endedAt = NOW()
     WHERE status IN (?) AND startedAt < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [ACTIVE_STATUSES, LOCK_MINUTES],
  );
}

async function activeCalls(campaignId) {
  const where = campaignId ? `AND campaign_id = ?` : "";
  const params = campaignId ? [ACTIVE_STATUSES, campaignId] : [ACTIVE_STATUSES];
  const [row] = await query(
    `SELECT COUNT(*) AS n FROM vc_calls WHERE status IN (?) AND is_test = 0 ${where}`,
    params,
  );
  return Number(row?.n || 0);
}

async function pauseCampaign(campaignId, reason) {
  await query(
    `UPDATE vc_campaigns SET status = 'paused', pause_reason = ? WHERE campaign_id = ?`,
    [reason, campaignId],
  );
}

/** Create the call row and ask Twilio to dial. */
async function dial({ settings, campaign, lead }) {
  const callId = store.newId("call");
  await query(
    `INSERT INTO vc_calls (uid, call_id, lead_id, campaign_id, agent_id, to_number, status, language)
     VALUES (?,?,?,?,?,?, 'queued', ?)`,
    [campaign.uid, callId, lead.id, campaign.campaign_id, campaign.agent_id, lead.phone_e164, lead.language || null],
  );
  try {
    const { sid, from } = await twilioClient.placeCall({
      settings,
      to: lead.phone_e164,
      callId,
    });
    await query(`UPDATE vc_calls SET twilio_sid = ?, from_number = ?, status = 'initiated' WHERE call_id = ?`, [
      sid,
      from,
      callId,
    ]);
    emitCall(campaign.uid, { call_id: callId, campaign_id: campaign.campaign_id, lead_id: lead.id, status: "initiated" });
    return { ok: true };
  } catch (err) {
    const message = err.message || "Twilio error";
    await query(`UPDATE vc_calls SET status = 'failed', error = ?, endedAt = NOW() WHERE call_id = ?`, [
      message.slice(0, 500),
      callId,
    ]);
    await markAttemptFailed(campaign, lead.id, "failed");
    // 20003 = authentication error: stop the campaign instead of burning attempts
    if (err.code === 20003 || err.status === 401) {
      await pauseCampaign(campaign.campaign_id, "Twilio authentication failed. Check admin settings.");
    }
    return { ok: false, error: message };
  }
}

/** Put a lead back in the queue, or mark it failed when attempts are used up. */
async function markAttemptFailed(campaign, leadId, outcome) {
  await query(
    `UPDATE vc_leads
        SET status = IF(attempts < ?, 'retry', 'failed'),
            outcome = IF(attempts < ?, outcome, ?),
            next_attempt_at = DATE_ADD(NOW(), INTERVAL ? MINUTE),
            locked_until = NULL
      WHERE id = ? AND status = 'calling'`,
    [campaign.max_attempts, campaign.max_attempts, outcome, campaign.retry_gap_min, leadId],
  );
}

async function processCampaign(campaign, settings, state) {
  // plan minutes cap
  const cap = await store.getPlanMinutesCap(campaign.uid);
  if (cap <= 0) return pauseCampaign(campaign.campaign_id, "Your plan does not include AI Phone Calling minutes.");
  const used = await store.getUsage(campaign.uid);
  if (used >= cap) return pauseCampaign(campaign.campaign_id, "Monthly call minutes used up.");

  const campaignActive = await activeCalls(campaign.campaign_id);
  let slots = Math.min(
    Math.max(1, campaign.max_concurrent) - campaignActive,
    state.globalLimit - state.globalActive,
  );

  if (slots > 0) {
    const gapMs = Math.max(0, Number(campaign.call_gap_sec) || 0) * 1000;
    const candidates = await query(
      `SELECT * FROM vc_leads
        WHERE campaign_id = ? AND consent = 1 AND status IN ('queued','retry')
          AND attempts < ? AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
          AND (locked_until IS NULL OR locked_until < NOW())
        ORDER BY id LIMIT 50`,
      [campaign.campaign_id, campaign.max_attempts],
    );

    for (const lead of candidates) {
      if (slots <= 0) break;
      if (gapMs && Date.now() - (lastDial.get(campaign.campaign_id) || 0) < gapMs) break;

      if (!inWindow(campaign, lead.timezone || campaign.timezone)) continue;

      if (await isDnc(campaign.uid, lead.phone_e164)) {
        await query(`UPDATE vc_leads SET status = 'dnc', outcome = 'do_not_call' WHERE id = ?`, [lead.id]);
        continue;
      }

      // atomic claim: only one dialer can win this row
      const claim = await query(
        `UPDATE vc_leads
            SET status = 'calling', attempts = attempts + 1,
                locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE)
          WHERE id = ? AND status IN ('queued','retry')
            AND (locked_until IS NULL OR locked_until < NOW())`,
        [LOCK_MINUTES, lead.id],
      );
      if (!claim.affectedRows) continue;

      lastDial.set(campaign.campaign_id, Date.now());
      slots -= 1;
      state.globalActive += 1;
      const r = await dial({ settings, campaign, lead });
      if (!r.ok) {
        const [fresh] = await query(`SELECT status FROM vc_campaigns WHERE campaign_id = ?`, [campaign.campaign_id]);
        if (fresh && fresh.status !== "running") break; // paused by an auth failure
      }
    }
  }

  // finish list-type campaigns when nothing is left
  if (!campaign.auto_mode) {
    const [left] = await query(
      `SELECT COUNT(*) AS n FROM vc_leads WHERE campaign_id = ? AND status IN ('queued','retry','calling')`,
      [campaign.campaign_id],
    );
    if (Number(left.n) === 0 && (await activeCalls(campaign.campaign_id)) === 0) {
      await query(`UPDATE vc_campaigns SET status = 'done' WHERE campaign_id = ?`, [campaign.campaign_id]);
    }
  }
}

async function tick() {
  if (running) return;
  running = true;
  try {
    await store.ensureTables();
    await recover();

    const campaigns = await query(`SELECT * FROM vc_campaigns WHERE status = 'running'`, []);
    if (!campaigns.length) return;

    const settings = await store.getAdminSettingsRaw();
    if (!isConfigured(settings)) return;

    const state = {
      globalLimit: Math.max(1, Number(settings.global_max_concurrent) || 1),
      globalActive: await activeCalls(null),
    };

    for (const c of campaigns) {
      try {
        await processCampaign(c, settings, state);
      } catch (e) {
        console.log(`[voicecall] campaign ${c.campaign_id} error:`, e.message);
      }
    }
  } catch (e) {
    console.log("[voicecall] dialer tick error:", e.message);
  } finally {
    running = false;
  }
}

function start() {
  if (timer) return;
  timer = setInterval(tick, TICK_MS);
  console.log("✅ AI Phone Calling dialer started");
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, tick, inWindow, isConfigured, markAttemptFailed };
