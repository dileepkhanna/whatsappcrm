/**
 * AI Phone Calling (Twilio). Mounted at /api/voice_call
 *
 * Completely separate from routes/waCall.js (AI WhatsApp Calling).
 */
const router = require("express").Router();
const stream = require("stream");
const csv = require("csv-parser");
const axios = require("axios");
const moment = require("moment-timezone");
const twilio = require("twilio");

const { query } = require("../database/dbpromise.js");
const validateUser = require("../middlewares/user.js");
const adminValidator = require("../middlewares/admin.js");
const { checkPlan, checkAiVoice } = require("../middlewares/plan.js");

const store = require("../helper/addon/voicecall/store.js");
const twilioClient = require("../helper/addon/voicecall/twilioClient.js");
const ingest = require("../helper/addon/voicecall/leadIngest.js");
const prompts = require("../helper/addon/voicecall/prompts.js");
const dialer = require("../helper/addon/voicecall/dialer.js");
const mediaServer = require("../helper/addon/voicecall/mediaServer.js");
const { emitCall } = require("../helper/addon/voicecall/notify.js");

const U = [validateUser, checkPlan, checkAiVoice];
const FINAL = ["completed", "busy", "no-answer", "failed", "canceled"];

// make sure tables exist before any handler runs
router.use(async (req, res, next) => {
  try {
    await store.ensureTables();
    next();
  } catch (e) {
    console.log("[voicecall] ensureTables failed:", e.message);
    res.json({ success: false, msg: "Voice calling is not ready. Check database permissions." });
  }
});

const fail = (res, err, msg = "Something went wrong") => {
  console.log("[voicecall]", err?.message || err);
  res.json({ success: false, msg });
};

const clamp = (v, min, max, dflt) => {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return dflt;
  return Math.max(min, Math.min(max, n));
};

const pageParams = (q) => {
  const limit = clamp(q.limit, 1, 100, 25);
  const page = clamp(q.page, 1, 100000, 1);
  return { limit, offset: (page - 1) * limit, page };
};

// ─── tiny in-memory rate limiter for public hooks ───────────────────────────
const hits = new Map();
setInterval(() => hits.clear(), 60 * 1000).unref();
const rateLimited = (key, max = 60) => {
  const n = (hits.get(key) || 0) + 1;
  hits.set(key, n);
  return n > max;
};

function parseCsvBuffer(buf) {
  return new Promise((resolve) => {
    const rows = [];
    const s = new stream.PassThrough();
    s.end(buf);
    s.pipe(csv())
      .on("data", (d) => rows.push(d))
      .on("end", () => resolve(rows))
      .on("error", () => resolve([]));
  });
}

const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const safeJson = (s, d) => {
  try {
    return s ? JSON.parse(s) : d;
  } catch {
    return d;
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN: platform settings
// ═══════════════════════════════════════════════════════════════════════════
router.get("/admin/settings", adminValidator, async (req, res) => {
  try {
    res.json({ success: true, data: await store.getAdminSettingsMasked() });
  } catch (e) {
    fail(res, e);
  }
});

router.post("/admin/settings", adminValidator, async (req, res) => {
  try {
    const data = await store.saveAdminSettings(req.body || {});
    res.json({ success: true, msg: "Settings saved", data });
  } catch (e) {
    fail(res, e);
  }
});

router.post("/admin/settings/test", adminValidator, async (req, res) => {
  const s = await store.getAdminSettingsRaw();
  const results = {};

  // Twilio
  try {
    if (!s.twilio_account_sid || !s.twilio_auth_token) throw new Error("Not set");
    const acc = await twilio(s.twilio_account_sid, s.twilio_auth_token)
      .api.accounts(s.twilio_account_sid)
      .fetch();
    results.twilio = { ok: true, msg: `Connected (${acc.friendlyName}, ${acc.status})` };
  } catch (e) {
    results.twilio = { ok: false, msg: e.message };
  }

  // OpenRouter
  try {
    if (!s.openrouter_api_key) throw new Error("Not set");
    const r = await axios.get("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${s.openrouter_api_key}` },
      timeout: 10000,
    });
    results.openrouter = { ok: true, msg: `Key valid${r.data?.data?.label ? ` (${r.data.data.label})` : ""}` };
  } catch (e) {
    results.openrouter = { ok: false, msg: e.response?.data?.error?.message || e.message };
  }

  // ElevenLabs (check each configured voice, falls back to the models list)
  try {
    if (!s.eleven_api_key) throw new Error("Not set");
    const headers = { "xi-api-key": s.eleven_api_key };
    const voices = [
      ["English", s.eleven_voice_en],
      ["Telugu", s.eleven_voice_te],
    ].filter(([, v]) => v);
    if (!voices.length) {
      await axios.get("https://api.elevenlabs.io/v1/models", { headers, timeout: 10000 });
      results.elevenlabs = { ok: true, msg: "Key valid. Set voice IDs for English and Telugu." };
    } else {
      const names = [];
      for (const [label, id] of voices) {
        const r = await axios.get(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(id)}`, {
          headers,
          timeout: 10000,
        });
        names.push(`${label}: ${r.data?.name || id}`);
      }
      results.elevenlabs = { ok: true, msg: `Key valid. ${names.join(", ")}` };
    }
  } catch (e) {
    const d = e.response?.data;
    results.elevenlabs = {
      ok: false,
      msg: d?.detail?.message || (typeof d?.detail === "string" ? d.detail : null) || e.message,
    };
  }

  // Public URL
  try {
    results.public_url = { ok: true, msg: twilioClient.publicBase() };
  } catch (e) {
    results.public_url = { ok: false, msg: e.message };
  }

  res.json({ success: true, data: results });
});

router.get("/admin/overview", adminValidator, async (req, res) => {
  try {
    const month = store.monthKey();
    const [calls] = await query(`SELECT COUNT(*) AS n FROM vc_calls`, []);
    const [mins] = await query(`SELECT COALESCE(SUM(minutes),0) AS n FROM vc_usage WHERE month = ?`, [month]);
    const [today] = await query(`SELECT COUNT(*) AS n FROM vc_calls WHERE startedAt >= CURDATE()`, []);
    res.json({
      success: true,
      data: {
        total_calls: Number(calls.n),
        calls_today: Number(today.n),
        minutes_this_month: Number(mins.n),
        live_calls: mediaServer.activeCount(),
      },
    });
  } catch (e) {
    fail(res, e);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// USER: agents
// ═══════════════════════════════════════════════════════════════════════════
function readAgentBody(b) {
  const name = prompts.sanitizeField(b.name, 120);
  if (!name) return { error: "Agent name is required" };
  const questions = (Array.isArray(b.questions) ? b.questions : [])
    .map((q) => prompts.sanitizeField(q, 200))
    .filter(Boolean)
    .slice(0, 10);
  return {
    value: {
      name,
      business_context: String(b.business_context || "").slice(0, 2000),
      goal: String(b.goal || "").slice(0, 600),
      questions: JSON.stringify(questions),
      greeting_en: String(b.greeting_en || "").slice(0, 500) || null,
      greeting_te: String(b.greeting_te || "").slice(0, 500) || null,
      default_language: prompts.normalizeLang(b.default_language, "en"),
      tone: prompts.sanitizeField(b.tone, 100) || "friendly and professional",
      max_duration_sec: clamp(b.max_duration_sec, 30, 900, 300),
    },
  };
}

const formatAgent = (a) => ({ ...a, questions: safeJson(a.questions, []) });

router.get("/agents", ...U, async (req, res) => {
  try {
    const rows = await query(`SELECT * FROM vc_agents WHERE uid = ? ORDER BY id DESC`, [req.decode.uid]);
    res.json({ success: true, data: rows.map(formatAgent) });
  } catch (e) {
    fail(res, e);
  }
});

router.post("/agents", ...U, async (req, res) => {
  try {
    const { value, error } = readAgentBody(req.body || {});
    if (error) return res.json({ success: false, msg: error });
    const agent_id = store.newId("agent");
    await query(`INSERT INTO vc_agents SET ?`, [{ ...value, uid: req.decode.uid, agent_id }]);
    res.json({ success: true, msg: "Agent created", agent_id });
  } catch (e) {
    fail(res, e);
  }
});

router.post("/agents/update", ...U, async (req, res) => {
  try {
    const { value, error } = readAgentBody(req.body || {});
    if (error) return res.json({ success: false, msg: error });
    const r = await query(`UPDATE vc_agents SET ? WHERE agent_id = ? AND uid = ?`, [
      value,
      req.body.agent_id,
      req.decode.uid,
    ]);
    if (!r.affectedRows) return res.json({ success: false, msg: "Agent not found" });
    res.json({ success: true, msg: "Agent updated" });
  } catch (e) {
    fail(res, e);
  }
});

router.post("/agents/delete", ...U, async (req, res) => {
  try {
    const { agent_id } = req.body || {};
    const [used] = await query(
      `SELECT COUNT(*) AS n FROM vc_campaigns WHERE agent_id = ? AND uid = ?`,
      [agent_id, req.decode.uid],
    );
    if (Number(used.n) > 0) {
      return res.json({ success: false, msg: "This agent is used by a campaign. Delete the campaign first." });
    }
    await query(`DELETE FROM vc_agents WHERE agent_id = ? AND uid = ?`, [agent_id, req.decode.uid]);
    res.json({ success: true, msg: "Agent deleted" });
  } catch (e) {
    fail(res, e);
  }
});

// Test call: only to the number saved on the user's own profile, to prevent
// abuse of the shared Twilio account.
router.post("/agents/test_call", ...U, async (req, res) => {
  try {
    const uid = req.decode.uid;
    const { agent_id, language } = req.body || {};
    const [agent] = await query(`SELECT * FROM vc_agents WHERE agent_id = ? AND uid = ?`, [agent_id, uid]);
    if (!agent) return res.json({ success: false, msg: "Agent not found" });

    const settings = await store.getAdminSettingsRaw();
    if (!dialer.isConfigured(settings)) {
      return res.json({ success: false, msg: "AI Phone Calling is not configured by the admin yet." });
    }

    const [user] = await query(`SELECT mobile_with_country_code FROM user WHERE uid = ?`, [uid]);
    const to = ingest.normalizePhone(user?.mobile_with_country_code, "91");
    if (!to) {
      return res.json({
        success: false,
        msg: "Add your mobile number with country code in your profile. Test calls go only to your own number.",
      });
    }

    const [today] = await query(
      `SELECT COUNT(*) AS n FROM vc_calls WHERE uid = ? AND is_test = 1 AND startedAt >= CURDATE()`,
      [uid],
    );
    if (Number(today.n) >= 10) return res.json({ success: false, msg: "Daily test call limit (10) reached" });

    const cap = await store.getPlanMinutesCap(uid);
    if ((await store.getUsage(uid)) >= cap) {
      return res.json({ success: false, msg: "Your monthly call minutes are used up" });
    }

    const callId = store.newId("call");
    const lang = ["en", "te"].includes(language) ? language : null;
    await query(
      `INSERT INTO vc_calls (uid, call_id, agent_id, is_test, to_number, status, language)
       VALUES (?,?,?,1,?, 'queued', ?)`,
      [uid, callId, agent.agent_id, to, lang],
    );
    try {
      const { sid, from } = await twilioClient.placeCall({ settings, to, callId });
      await query(`UPDATE vc_calls SET twilio_sid = ?, from_number = ?, status = 'initiated' WHERE call_id = ?`, [
        sid,
        from,
        callId,
      ]);
    } catch (err) {
      await query(`UPDATE vc_calls SET status = 'failed', error = ?, endedAt = NOW() WHERE call_id = ?`, [
        String(err.message).slice(0, 500),
        callId,
      ]);
      return res.json({ success: false, msg: `Could not place the call: ${err.message}` });
    }
    res.json({ success: true, msg: `Calling ${to.slice(0, -4).replace(/\d/g, "•")}${to.slice(-4)} now`, call_id: callId });
  } catch (e) {
    fail(res, e);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// USER: campaigns
// ═══════════════════════════════════════════════════════════════════════════
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

async function readCampaignBody(uid, b) {
  const title = prompts.sanitizeField(b.title, 150);
  if (!title) return { error: "Title is required" };
  const [agent] = await query(`SELECT agent_id FROM vc_agents WHERE agent_id = ? AND uid = ?`, [b.agent_id, uid]);
  if (!agent) return { error: "Select a valid voice agent" };
  const timezone = moment.tz.zone(b.timezone) ? b.timezone : "Asia/Kolkata";
  const window_start = TIME_RE.test(b.window_start) ? b.window_start : "09:00";
  const window_end = TIME_RE.test(b.window_end) ? b.window_end : "20:00";
  if (window_end <= window_start) return { error: "Calling window end must be after start" };
  const days = (Array.isArray(b.window_days) ? b.window_days : String(b.window_days || "1,2,3,4,5,6,7").split(","))
    .map((d) => parseInt(d, 10))
    .filter((d) => d >= 1 && d <= 7);
  if (!days.length) return { error: "Select at least one calling day" };
  const cc = String(b.country_code || "91").replace(/\D/g, "").slice(0, 4) || "91";

  return {
    value: {
      title,
      agent_id: b.agent_id,
      auto_mode: b.auto_mode ? 1 : 0,
      auto_delay_sec: clamp(b.auto_delay_sec, 0, 3600, 60),
      window_days: [...new Set(days)].sort().join(","),
      window_start,
      window_end,
      timezone,
      country_code: cc,
      max_concurrent: clamp(b.max_concurrent, 1, 10, 1),
      max_attempts: clamp(b.max_attempts, 1, 5, 2),
      retry_gap_min: clamp(b.retry_gap_min, 5, 1440, 60),
      call_gap_sec: clamp(b.call_gap_sec, 0, 300, 5),
    },
  };
}

async function ownCampaign(uid, campaign_id) {
  const [c] = await query(`SELECT * FROM vc_campaigns WHERE campaign_id = ? AND uid = ?`, [campaign_id, uid]);
  return c || null;
}

router.get("/campaigns", ...U, async (req, res) => {
  try {
    const uid = req.decode.uid;
    const campaigns = await query(`SELECT * FROM vc_campaigns WHERE uid = ? ORDER BY id DESC`, [uid]);
    const leadRows = await query(
      `SELECT campaign_id, status, COUNT(*) AS n FROM vc_leads WHERE uid = ? GROUP BY campaign_id, status`,
      [uid],
    );
    const callRows = await query(
      `SELECT campaign_id, COUNT(*) AS total,
              SUM(status = 'completed') AS completed,
              SUM(duration_sec > 0) AS answered,
              SUM(outcome = 'interested') AS interested,
              COALESCE(SUM(billed_minutes),0) AS minutes
         FROM vc_calls WHERE uid = ? AND is_test = 0 GROUP BY campaign_id`,
      [uid],
    );
    const data = campaigns.map((c) => {
      const stats = { leads: 0, queued: 0, calling: 0, retry: 0, done: 0, failed: 0, dnc: 0 };
      for (const r of leadRows.filter((x) => x.campaign_id === c.campaign_id)) {
        stats.leads += Number(r.n);
        if (stats[r.status] !== undefined) stats[r.status] += Number(r.n);
      }
      const k = callRows.find((x) => x.campaign_id === c.campaign_id) || {};
      return {
        ...c,
        stats: {
          ...stats,
          calls: Number(k.total || 0),
          answered: Number(k.answered || 0),
          interested: Number(k.interested || 0),
          minutes: Number(k.minutes || 0),
        },
      };
    });
    res.json({ success: true, data });
  } catch (e) {
    fail(res, e);
  }
});

router.post("/campaigns", ...U, async (req, res) => {
  try {
    const { value, error } = await readCampaignBody(req.decode.uid, req.body || {});
    if (error) return res.json({ success: false, msg: error });
    const campaign_id = store.newId("camp");
    await query(`INSERT INTO vc_campaigns SET ?`, [{ ...value, uid: req.decode.uid, campaign_id, status: "draft" }]);
    res.json({ success: true, msg: "Campaign created", campaign_id });
  } catch (e) {
    fail(res, e);
  }
});

router.post("/campaigns/update", ...U, async (req, res) => {
  try {
    const c = await ownCampaign(req.decode.uid, req.body?.campaign_id);
    if (!c) return res.json({ success: false, msg: "Campaign not found" });
    if (c.status === "running") return res.json({ success: false, msg: "Pause the campaign before editing" });
    const { value, error } = await readCampaignBody(req.decode.uid, req.body || {});
    if (error) return res.json({ success: false, msg: error });
    await query(`UPDATE vc_campaigns SET ? WHERE campaign_id = ?`, [value, c.campaign_id]);
    res.json({ success: true, msg: "Campaign updated" });
  } catch (e) {
    fail(res, e);
  }
});

async function setCampaignStatus(req, res, { from, to, check }) {
  try {
    const uid = req.decode.uid;
    const c = await ownCampaign(uid, req.body?.campaign_id);
    if (!c) return res.json({ success: false, msg: "Campaign not found" });
    if (from && !from.includes(c.status)) {
      return res.json({ success: false, msg: `Campaign is ${c.status}` });
    }
    if (check) {
      const problem = await check(uid, c);
      if (problem) return res.json({ success: false, msg: problem });
    }
    await query(`UPDATE vc_campaigns SET status = ?, pause_reason = NULL WHERE campaign_id = ?`, [to, c.campaign_id]);
    res.json({ success: true, msg: `Campaign ${to}` });
  } catch (e) {
    fail(res, e);
  }
}

const canRun = async (uid) => {
  const settings = await store.getAdminSettingsRaw();
  if (!dialer.isConfigured(settings)) return "AI Phone Calling is not configured by the admin yet.";
  const cap = await store.getPlanMinutesCap(uid);
  if (cap <= 0) return "Your plan has no AI Phone Calling minutes.";
  if ((await store.getUsage(uid)) >= cap) return "Your monthly call minutes are used up.";
  return null;
};

router.post("/campaigns/start", ...U, (req, res) =>
  setCampaignStatus(req, res, { from: ["draft", "paused", "stopped", "done"], to: "running", check: canRun }),
);
router.post("/campaigns/resume", ...U, (req, res) =>
  setCampaignStatus(req, res, { from: ["paused"], to: "running", check: canRun }),
);
router.post("/campaigns/pause", ...U, (req, res) =>
  setCampaignStatus(req, res, { from: ["running"], to: "paused" }),
);
router.post("/campaigns/stop", ...U, (req, res) =>
  setCampaignStatus(req, res, { from: ["running", "paused"], to: "stopped" }),
);

router.post("/campaigns/delete", ...U, async (req, res) => {
  try {
    const c = await ownCampaign(req.decode.uid, req.body?.campaign_id);
    if (!c) return res.json({ success: false, msg: "Campaign not found" });
    if (c.status === "running") return res.json({ success: false, msg: "Stop the campaign first" });
    await query(`DELETE FROM vc_leads WHERE campaign_id = ? AND uid = ?`, [c.campaign_id, req.decode.uid]);
    await query(`UPDATE vc_source_tokens SET campaign_id = NULL WHERE campaign_id = ? AND uid = ?`, [
      c.campaign_id,
      req.decode.uid,
    ]);
    await query(`DELETE FROM vc_campaigns WHERE campaign_id = ?`, [c.campaign_id]);
    res.json({ success: true, msg: "Campaign deleted" });
  } catch (e) {
    fail(res, e);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// USER: leads
// ═══════════════════════════════════════════════════════════════════════════
router.get("/leads", ...U, async (req, res) => {
  try {
    const uid = req.decode.uid;
    const { limit, offset, page } = pageParams(req.query);
    const where = ["uid = ?"];
    const params = [uid];
    if (req.query.campaign_id) {
      where.push("campaign_id = ?");
      params.push(req.query.campaign_id);
    }
    if (req.query.status) {
      where.push("status = ?");
      params.push(req.query.status);
    }
    if (req.query.q) {
      where.push("(name LIKE ? OR phone_e164 LIKE ?)");
      params.push(`%${req.query.q}%`, `%${req.query.q}%`);
    }
    const [total] = await query(`SELECT COUNT(*) AS n FROM vc_leads WHERE ${where.join(" AND ")}`, params);
    const rows = await query(
      `SELECT id, campaign_id, name, phone_e164, email, source, language, status, outcome, attempts, next_attempt_at, createdAt
         FROM vc_leads WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    res.json({ success: true, data: rows, total: Number(total.n), page, limit });
  } catch (e) {
    fail(res, e);
  }
});

async function leadTarget(req, res) {
  const c = await ownCampaign(req.decode.uid, req.body?.campaign_id);
  if (!c) {
    res.json({ success: false, msg: "Select a campaign" });
    return null;
  }
  return c;
}

router.post("/leads/add", ...U, async (req, res) => {
  try {
    const campaign = await leadTarget(req, res);
    if (!campaign) return;
    if (!req.body.consent) {
      return res.json({ success: false, msg: "Confirm that this person agreed to be contacted" });
    }
    const r = await ingest.insertLead({
      uid: req.decode.uid,
      campaign,
      source: "manual",
      consent: true,
      data: {
        name: req.body.name,
        phone: req.body.phone,
        email: req.body.email,
        language: ingest.normalizeLanguage(req.body.language),
        extra: {},
      },
    });
    if (r.status !== "created") return res.json({ success: false, msg: r.reason });
    res.json({ success: true, msg: "Lead added" });
  } catch (e) {
    fail(res, e);
  }
});

async function bulkInsert(uid, campaign, rows, source) {
  const out = { imported: 0, duplicates: 0, dnc: 0, invalid: [] };
  let i = 0;
  for (const row of rows) {
    i += 1;
    const r = await ingest.insertLead({ uid, campaign, source, consent: true, data: ingest.mapFlat(row) });
    if (r.status === "created") out.imported += 1;
    else if (r.status === "duplicate") out.duplicates += 1;
    else if (r.status === "dnc") out.dnc += 1;
    else if (out.invalid.length < 50) out.invalid.push({ row: i, reason: r.reason });
  }
  return out;
}

router.post("/leads/import_csv", ...U, async (req, res) => {
  try {
    const campaign = await leadTarget(req, res);
    if (!campaign) return;
    if (String(req.body.consent) !== "true") {
      return res.json({ success: false, msg: "Confirm that every person in this file agreed to be contacted" });
    }
    const file = req.files?.file;
    if (!file) return res.json({ success: false, msg: "Upload a CSV file" });
    const rows = await parseCsvBuffer(file.data);
    if (!rows.length) return res.json({ success: false, msg: "No rows found in the file" });
    if (rows.length > 5000) return res.json({ success: false, msg: "Maximum 5000 rows per file" });
    const result = await bulkInsert(req.decode.uid, campaign, rows, "csv");
    res.json({ success: true, msg: `${result.imported} leads imported`, data: result });
  } catch (e) {
    fail(res, e);
  }
});

router.post("/leads/import_phonebook", ...U, async (req, res) => {
  try {
    const campaign = await leadTarget(req, res);
    if (!campaign) return;
    if (!req.body.consent) {
      return res.json({ success: false, msg: "Confirm that every contact agreed to be contacted" });
    }
    const contacts = await query(`SELECT name, mobile FROM contact WHERE uid = ? AND phonebook_id = ? LIMIT 5000`, [
      req.decode.uid,
      req.body.phonebook_id,
    ]);
    if (!contacts.length) return res.json({ success: false, msg: "No contacts in this phonebook" });
    const result = await bulkInsert(
      req.decode.uid,
      campaign,
      contacts.map((c) => ({ name: c.name, phone: c.mobile })),
      "phonebook",
    );
    res.json({ success: true, msg: `${result.imported} leads imported`, data: result });
  } catch (e) {
    fail(res, e);
  }
});

router.post("/leads/delete", ...U, async (req, res) => {
  try {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Boolean);
    if (!ids.length) return res.json({ success: false, msg: "No leads selected" });
    await query(`DELETE FROM vc_leads WHERE uid = ? AND id IN (?) AND status != 'calling'`, [req.decode.uid, ids]);
    res.json({ success: true, msg: "Deleted" });
  } catch (e) {
    fail(res, e);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// USER: lead sources (webhook URLs)
// ═══════════════════════════════════════════════════════════════════════════
const SOURCES = ["meta", "google", "webhook"];

async function ensureSource(uid, source) {
  await query(`INSERT IGNORE INTO vc_source_tokens (uid, source, token) VALUES (?,?,?)`, [
    uid,
    source,
    store.newToken(),
  ]);
  const [row] = await query(`SELECT * FROM vc_source_tokens WHERE uid = ? AND source = ?`, [uid, source]);
  return row;
}

function formatSource(row, uid) {
  return {
    source: row.source,
    url: `${twilioClient.publicBase()}/api/voice_call/hook/${row.source}/${uid}/${row.token}`,
    verify_token: row.source === "meta" ? row.token : undefined,
    campaign_id: row.campaign_id,
    default_language: row.default_language,
    google_key: row.google_key || "",
    meta_page_token_set: !!row.meta_page_token,
  };
}

router.get("/sources", ...U, async (req, res) => {
  try {
    const uid = req.decode.uid;
    const out = [];
    for (const s of SOURCES) out.push(formatSource(await ensureSource(uid, s), uid));
    res.json({ success: true, data: out });
  } catch (e) {
    fail(res, e);
  }
});

router.post("/sources/update", ...U, async (req, res) => {
  try {
    const uid = req.decode.uid;
    const { source, campaign_id, default_language, google_key, meta_page_token } = req.body || {};
    if (!SOURCES.includes(source)) return res.json({ success: false, msg: "Unknown source" });
    await ensureSource(uid, source);
    if (campaign_id && !(await ownCampaign(uid, campaign_id))) {
      return res.json({ success: false, msg: "Campaign not found" });
    }
    const patch = {
      campaign_id: campaign_id || null,
      default_language: ingest.normalizeLanguage(default_language),
    };
    if (source === "google") patch.google_key = String(google_key || "").slice(0, 200) || null;
    if (source === "meta" && meta_page_token && !String(meta_page_token).startsWith("••••")) {
      patch.meta_page_token = String(meta_page_token).trim();
    }
    await query(`UPDATE vc_source_tokens SET ? WHERE uid = ? AND source = ?`, [patch, uid, source]);
    res.json({ success: true, msg: "Source saved" });
  } catch (e) {
    fail(res, e);
  }
});

router.post("/sources/regen_token", ...U, async (req, res) => {
  try {
    const uid = req.decode.uid;
    const { source } = req.body || {};
    if (!SOURCES.includes(source)) return res.json({ success: false, msg: "Unknown source" });
    await ensureSource(uid, source);
    await query(`UPDATE vc_source_tokens SET token = ? WHERE uid = ? AND source = ?`, [
      store.newToken(),
      uid,
      source,
    ]);
    const [row] = await query(`SELECT * FROM vc_source_tokens WHERE uid = ? AND source = ?`, [uid, source]);
    res.json({ success: true, msg: "New URL generated. The old one no longer works.", data: formatSource(row, uid) });
  } catch (e) {
    fail(res, e);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// USER: calls, DNC, usage
// ═══════════════════════════════════════════════════════════════════════════
function callFilters(q, uid) {
  const where = ["c.uid = ?"];
  const params = [uid];
  const add = (cond, v) => {
    where.push(cond);
    params.push(v);
  };
  if (q.campaign_id) add("c.campaign_id = ?", q.campaign_id);
  if (q.status) add("c.status = ?", q.status);
  if (q.outcome) add("c.outcome = ?", q.outcome);
  if (q.language) add("c.language = ?", q.language);
  if (q.from) add("c.startedAt >= ?", q.from);
  if (q.to) add("c.startedAt < DATE_ADD(?, INTERVAL 1 DAY)", q.to);
  if (q.is_test === "1") where.push("c.is_test = 1");
  else if (q.is_test === "0") where.push("c.is_test = 0");
  return { where: where.join(" AND "), params };
}

router.get("/calls", ...U, async (req, res) => {
  try {
    const { limit, offset, page } = pageParams(req.query);
    const { where, params } = callFilters(req.query, req.decode.uid);
    const [total] = await query(`SELECT COUNT(*) AS n FROM vc_calls c WHERE ${where}`, params);
    const rows = await query(
      `SELECT c.id, c.call_id, c.campaign_id, c.is_test, c.to_number, c.status, c.language, c.duration_sec,
              c.billed_minutes, c.summary, c.outcome, c.error, c.startedAt, c.endedAt, l.name AS lead_name
         FROM vc_calls c LEFT JOIN vc_leads l ON l.id = c.lead_id
        WHERE ${where} ORDER BY c.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    res.json({ success: true, data: rows, total: Number(total.n), page, limit });
  } catch (e) {
    fail(res, e);
  }
});

router.get("/calls_export", ...U, async (req, res) => {
  try {
    const { where, params } = callFilters(req.query, req.decode.uid);
    const rows = await query(
      `SELECT c.call_id, c.startedAt, c.to_number, l.name AS lead_name, c.campaign_id, c.status, c.language,
              c.duration_sec, c.outcome, c.summary
         FROM vc_calls c LEFT JOIN vc_leads l ON l.id = c.lead_id
        WHERE ${where} ORDER BY c.id DESC LIMIT 10000`,
      params,
    );
    const head = ["call_id", "started_at", "phone", "name", "campaign_id", "status", "language", "duration_sec", "outcome", "summary"];
    const lines = [head.join(",")];
    for (const r of rows) {
      lines.push(
        [r.call_id, r.startedAt && new Date(r.startedAt).toISOString(), r.to_number, r.lead_name, r.campaign_id, r.status, r.language, r.duration_sec, r.outcome, r.summary]
          .map(csvCell)
          .join(","),
      );
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="ai-phone-calls.csv"');
    res.send(lines.join("\n"));
  } catch (e) {
    fail(res, e);
  }
});

router.get("/calls/:callId", ...U, async (req, res) => {
  try {
    const [c] = await query(
      `SELECT c.*, l.name AS lead_name FROM vc_calls c LEFT JOIN vc_leads l ON l.id = c.lead_id
        WHERE c.call_id = ? AND c.uid = ?`,
      [req.params.callId, req.decode.uid],
    );
    if (!c) return res.json({ success: false, msg: "Call not found" });
    res.json({
      success: true,
      data: { ...c, transcript: safeJson(c.transcript, []), answers: safeJson(c.answers, {}) },
    });
  } catch (e) {
    fail(res, e);
  }
});

router.get("/dnc", ...U, async (req, res) => {
  try {
    const rows = await query(`SELECT id, phone_e164, reason, createdAt FROM vc_dnc WHERE uid = ? ORDER BY id DESC LIMIT 1000`, [
      req.decode.uid,
    ]);
    res.json({ success: true, data: rows });
  } catch (e) {
    fail(res, e);
  }
});

router.post("/dnc/add", ...U, async (req, res) => {
  try {
    const phone = ingest.normalizePhone(req.body?.phone, String(req.body?.country_code || "91").replace(/\D/g, ""));
    if (!phone) return res.json({ success: false, msg: "Invalid phone number" });
    await query(`INSERT IGNORE INTO vc_dnc (uid, phone_e164, reason) VALUES (?,?,?)`, [
      req.decode.uid,
      phone,
      String(req.body?.reason || "Added manually").slice(0, 250),
    ]);
    await query(`UPDATE vc_leads SET status = 'dnc', outcome = 'do_not_call' WHERE uid = ? AND phone_e164 = ? AND status IN ('queued','retry')`, [
      req.decode.uid,
      phone,
    ]);
    res.json({ success: true, msg: "Added to do-not-call list" });
  } catch (e) {
    fail(res, e);
  }
});

router.post("/dnc/remove", ...U, async (req, res) => {
  try {
    await query(`DELETE FROM vc_dnc WHERE id = ? AND uid = ?`, [req.body?.id, req.decode.uid]);
    res.json({ success: true, msg: "Removed" });
  } catch (e) {
    fail(res, e);
  }
});

router.get("/usage", ...U, async (req, res) => {
  try {
    const uid = req.decode.uid;
    const [cap, used] = await Promise.all([store.getPlanMinutesCap(uid), store.getUsage(uid)]);
    res.json({ success: true, data: { month: store.monthKey(), used, cap, remaining: Math.max(0, cap - used) } });
  } catch (e) {
    fail(res, e);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC: Twilio webhooks (signature validated)
// ═══════════════════════════════════════════════════════════════════════════
async function twilioGuard(req, res) {
  const settings = await store.getAdminSettingsRaw();
  let valid = false;
  try {
    valid = twilioClient.validateRequest(req, settings.twilio_auth_token);
  } catch (e) {
    console.log("[voicecall] signature check error:", e.message);
  }
  if (!valid) {
    res.status(403).send("Invalid signature");
    return null;
  }
  return settings;
}

router.post("/twiml/:callId", async (req, res) => {
  try {
    if (!(await twilioGuard(req, res))) return;
    const [call] = await query(`SELECT call_id, status FROM vc_calls WHERE call_id = ?`, [req.params.callId]);
    const vr = new twilio.twiml.VoiceResponse();
    if (!call || FINAL.includes(call.status)) {
      vr.hangup();
    } else {
      const connect = vr.connect();
      const s = connect.stream({ url: `${twilioClient.publicWsBase()}/twilio-media` });
      s.parameter({ name: "callId", value: call.call_id });
      s.parameter({ name: "token", value: twilioClient.signStreamToken(call.call_id) });
    }
    res.type("text/xml").send(vr.toString());
  } catch (e) {
    console.log("[voicecall] twiml error:", e.message);
    const vr = new twilio.twiml.VoiceResponse();
    vr.hangup();
    res.type("text/xml").send(vr.toString());
  }
});

router.post("/status/:callId", async (req, res) => {
  try {
    if (!(await twilioGuard(req, res))) return;
    const callId = req.params.callId;
    const status = String(req.body.CallStatus || "");
    const duration = parseInt(req.body.CallDuration, 10) || 0;

    const [call] = await query(`SELECT * FROM vc_calls WHERE call_id = ?`, [callId]);
    if (!call) return res.sendStatus(204);

    if (!FINAL.includes(status)) {
      await query(`UPDATE vc_calls SET status = ? WHERE call_id = ? AND status NOT IN (?)`, [status, callId, FINAL]);
      emitCall(call.uid, { call_id: callId, campaign_id: call.campaign_id, lead_id: call.lead_id, status });
      return res.sendStatus(204);
    }

    // Final status. billed_minutes IS NULL makes this idempotent.
    const billed = duration > 0 ? Math.ceil(duration / 60) : 0;
    const r = await query(
      `UPDATE vc_calls SET status = ?, duration_sec = ?, billed_minutes = ?, endedAt = NOW()
        WHERE call_id = ? AND billed_minutes IS NULL`,
      [status, duration, billed, callId],
    );
    if (r.affectedRows) {
      if (billed > 0) await store.addUsage(call.uid, billed);

      if (call.lead_id && !call.is_test && status !== "completed") {
        const [campaign] = await query(`SELECT * FROM vc_campaigns WHERE campaign_id = ?`, [call.campaign_id]);
        if (campaign) {
          await dialer.markAttemptFailed(campaign, call.lead_id, status === "no-answer" ? "no_answer" : "failed");
        }
      }
      emitCall(call.uid, { call_id: callId, campaign_id: call.campaign_id, lead_id: call.lead_id, status });
    }
    res.sendStatus(204);
  } catch (e) {
    console.log("[voicecall] status error:", e.message);
    res.sendStatus(500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC: lead source hooks (secret token in the URL)
// ═══════════════════════════════════════════════════════════════════════════
async function loadSource(req, res, source) {
  const { uid, token } = req.params;
  if (rateLimited(`${source}:${uid}`)) {
    res.status(429).json({ success: false, msg: "Too many requests" });
    return null;
  }
  const [row] = await query(`SELECT * FROM vc_source_tokens WHERE uid = ? AND source = ?`, [uid, source]);
  if (!row || !twilioClient.safeEqual(token, row.token)) {
    res.status(403).json({ success: false, msg: "Invalid token" });
    return null;
  }
  return row;
}

async function acceptLead(row, data) {
  if (!row.campaign_id) return { ok: false, msg: "No campaign selected for this source" };
  const [campaign] = await query(`SELECT * FROM vc_campaigns WHERE campaign_id = ? AND uid = ?`, [
    row.campaign_id,
    row.uid,
  ]);
  if (!campaign) return { ok: false, msg: "Campaign not found" };
  if (!data.language && row.default_language) data.language = row.default_language;
  // The form submission itself is the consent for ad lead sources.
  const r = await ingest.insertLead({ uid: row.uid, campaign, data, source: row.source, consent: true });
  return { ok: r.status === "created", status: r.status, msg: r.reason };
}

// Meta verification handshake
router.get("/hook/meta/:uid/:token", async (req, res) => {
  try {
    const row = await loadSource(req, res, "meta");
    if (!row) return;
    if (req.query["hub.mode"] === "subscribe" && twilioClient.safeEqual(req.query["hub.verify_token"], row.token)) {
      return res.status(200).send(String(req.query["hub.challenge"] || ""));
    }
    res.sendStatus(403);
  } catch (e) {
    res.sendStatus(500);
  }
});

router.post("/hook/meta/:uid/:token", async (req, res) => {
  try {
    const row = await loadSource(req, res, "meta");
    if (!row) return;
    const body = req.body || {};
    const results = [];

    if (Array.isArray(body.entry)) {
      // native Meta leadgen notification
      for (const entry of body.entry) {
        for (const ch of entry.changes || []) {
          if (ch.field !== "leadgen" || !ch.value?.leadgen_id) continue;
          if (!row.meta_page_token) {
            console.log("[voicecall] Meta lead received but no page access token is set");
            continue;
          }
          try {
            const data = await ingest.fetchMetaLead(ch.value.leadgen_id, row.meta_page_token);
            results.push(await acceptLead(row, data));
          } catch (e) {
            console.log("[voicecall] Meta lead fetch failed:", e.response?.data?.error?.message || e.message);
          }
        }
      }
    } else if (Array.isArray(body.field_data)) {
      results.push(await acceptLead(row, ingest.mapMetaFieldData(body.field_data)));
    } else {
      results.push(await acceptLead(row, ingest.mapFlat(body)));
    }
    res.json({ success: true, received: results.length });
  } catch (e) {
    console.log("[voicecall] meta hook error:", e.message);
    res.status(500).json({ success: false });
  }
});

router.post("/hook/google/:uid/:token", async (req, res) => {
  try {
    const row = await loadSource(req, res, "google");
    if (!row) return;
    const body = req.body || {};
    if (!row.google_key || !twilioClient.safeEqual(body.google_key, row.google_key)) {
      return res.status(403).json({ success: false, msg: "Invalid Google key" });
    }
    if (body.is_test) return res.json({ success: true, msg: "Test lead received" });
    const r = await acceptLead(row, ingest.mapGoogle(body));
    res.json({ success: r.ok || r.status === "duplicate", status: r.status || null, msg: r.msg || null });
  } catch (e) {
    console.log("[voicecall] google hook error:", e.message);
    res.status(500).json({ success: false });
  }
});

router.post("/hook/webhook/:uid/:token", async (req, res) => {
  try {
    const row = await loadSource(req, res, "webhook");
    if (!row) return;
    const body = req.body || {};
    const data = Array.isArray(body.field_data) ? ingest.mapMetaFieldData(body.field_data) : ingest.mapFlat(body);
    const r = await acceptLead(row, data);
    res.json({ success: r.ok || r.status === "duplicate", status: r.status || null, msg: r.msg || null });
  } catch (e) {
    console.log("[voicecall] webhook error:", e.message);
    res.status(500).json({ success: false });
  }
});

module.exports = router;
