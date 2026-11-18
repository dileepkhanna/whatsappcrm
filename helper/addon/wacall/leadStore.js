// ─────────────────────────────────────────────────────────────────────────────
// Lead-to-Call storage layer.
//
// Two tables back the "Lead Auto-Call" feature:
//
//   wa_call_leads         — the "sheet" that fills up as leads arrive from ad
//                           campaigns (Meta / Google) via webhook, Excel/CSV
//                           upload, Google-Sheet polling, or manual add.
//
//   wa_call_lead_settings — one row per user holding auto-call configuration:
//                           whether auto-calling is ON, which flow to run, the
//                           secret webhook token, and optional Google-Sheet
//                           polling config.
//
// Both are created on demand (ensureTables) so the feature works even if the
// operator never runs the SQL migration. All access goes through the shared
// dbpromise `query`.
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require("crypto");
const { query } = require("../../../database/dbpromise.js");

let ensured = false;

async function ensureTables() {
  if (ensured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS wa_call_leads (
      id INT(11) NOT NULL AUTO_INCREMENT,
      uid VARCHAR(255) NOT NULL,
      name VARCHAR(255) DEFAULT NULL,
      mobile VARCHAR(50) DEFAULT NULL,
      email VARCHAR(255) DEFAULT NULL,
      source VARCHAR(100) DEFAULT NULL,
      extra LONGTEXT DEFAULT NULL,
      status VARCHAR(50) DEFAULT 'new',
      permission_status VARCHAR(50) DEFAULT 'pending',
      call_id VARCHAR(255) DEFAULT NULL,
      call_status VARCHAR(50) DEFAULT 'pending',
      call_duration INT(11) DEFAULT NULL,
      transcript LONGTEXT DEFAULT NULL,
      error_message TEXT DEFAULT NULL,
      called_at DATETIME DEFAULT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_uid (uid),
      KEY idx_uid_mobile (uid, mobile)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS wa_call_lead_settings (
      id INT(11) NOT NULL AUTO_INCREMENT,
      uid VARCHAR(255) NOT NULL,
      auto_call TINYINT(1) DEFAULT 0,
      flow_id VARCHAR(255) DEFAULT NULL,
      permission_text TEXT DEFAULT NULL,
      webhook_token VARCHAR(255) DEFAULT NULL,
      sheet_enabled TINYINT(1) DEFAULT 0,
      sheet_url TEXT DEFAULT NULL,
      sheet_last_row INT(11) DEFAULT 0,
      sheet_poll_minutes INT(11) DEFAULT 5,
      sheet_last_poll DATETIME DEFAULT NULL,
      sheet_last_result VARCHAR(255) DEFAULT NULL,
      voice_provider VARCHAR(50) DEFAULT NULL,
      eleven_api_key TEXT DEFAULT NULL,
      gemini_api_key TEXT DEFAULT NULL,
      openrouter_api_key TEXT DEFAULT NULL,
      openrouter_model VARCHAR(255) DEFAULT NULL,
      default_voice_id VARCHAR(255) DEFAULT NULL,
      default_language VARCHAR(20) DEFAULT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_uid (uid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // Add newer columns if this table pre-existed without them. Each ADD COLUMN
  // runs on its OWN statement and ignores "duplicate column" — so one existing
  // column can't block the others (a single combined ALTER fails entirely if
  // any one column already exists → ER_DUP_FIELDNAME).
  const wanted = [
    ["sheet_last_poll", "DATETIME DEFAULT NULL"],
    ["sheet_last_result", "VARCHAR(255) DEFAULT NULL"],
    ["voice_provider", "VARCHAR(50) DEFAULT NULL"],
    ["eleven_api_key", "TEXT DEFAULT NULL"],
    ["gemini_api_key", "TEXT DEFAULT NULL"],
    ["openrouter_api_key", "TEXT DEFAULT NULL"],
    ["openrouter_model", "VARCHAR(255) DEFAULT NULL"],
    ["default_voice_id", "VARCHAR(255) DEFAULT NULL"],
    ["default_language", "VARCHAR(20) DEFAULT NULL"],
  ];
  let have = new Set();
  try {
    const cols = await query(`SHOW COLUMNS FROM wa_call_lead_settings`);
    have = new Set((cols || []).map((c) => c.Field));
  } catch (_) {}
  for (const [name, def] of wanted) {
    if (have.has(name)) continue;
    try {
      await query(`ALTER TABLE wa_call_lead_settings ADD COLUMN ${name} ${def}`);
    } catch (e) {
      // Ignore duplicate-column races; log anything else.
      if (e && e.code !== "ER_DUP_FIELDNAME") {
        console.error(`[leadStore] add column ${name} failed:`, e.message);
      }
    }
  }
  ensured = true;
}

// Return a user's saved AI-calling keys as a `voice` config object the call
// engine understands. Entered once in the UI; used by every flow.
async function getApiKeys(uid) {
  const s = await getSettings(uid);
  return {
    provider: s.voice_provider || "elevenlabs",
    elevenApiKey: s.eleven_api_key || null,
    geminiApiKey: s.gemini_api_key || null,
    openRouterApiKey: s.openrouter_api_key || null,
    openRouterModel: s.openrouter_model || null,
    voiceId: s.default_voice_id || null,
    language: s.default_language || "en",
  };
}

// Record the outcome of a sheet poll so the UI can display it.
async function recordPoll(uid, { seen, imported }) {
  await ensureTables();
  const result = `saw ${seen} row(s), imported ${imported} new`;
  await query(
    `UPDATE wa_call_lead_settings SET sheet_last_poll = NOW(), sheet_last_result = ? WHERE uid = ?`,
    [result, uid],
  );
}

function newToken() {
  return crypto.randomBytes(18).toString("hex");
}

// Fetch (creating if needed) the settings row for a user. Guarantees a
// webhook_token exists so the UI always has a URL to show.
async function getSettings(uid) {
  await ensureTables();
  let [row] = await query(`SELECT * FROM wa_call_lead_settings WHERE uid = ? LIMIT 1`, [uid]);
  if (!row) {
    const token = newToken();
    await query(
      `INSERT INTO wa_call_lead_settings (uid, auto_call, webhook_token) VALUES (?, 0, ?)`,
      [uid, token],
    );
    [row] = await query(`SELECT * FROM wa_call_lead_settings WHERE uid = ? LIMIT 1`, [uid]);
  } else if (!row.webhook_token) {
    const token = newToken();
    await query(`UPDATE wa_call_lead_settings SET webhook_token = ? WHERE uid = ?`, [token, uid]);
    row.webhook_token = token;
  }
  return row;
}

async function updateSettings(uid, patch) {
  await getSettings(uid); // ensure row exists
  const allowed = [
    "auto_call",
    "flow_id",
    "permission_text",
    "sheet_enabled",
    "sheet_url",
    "sheet_last_row",
    "sheet_poll_minutes",
    "voice_provider",
    "eleven_api_key",
    "gemini_api_key",
    "openrouter_api_key",
    "openrouter_model",
    "default_voice_id",
    "default_language",
  ];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      sets.push(`${key} = ?`);
      params.push(patch[key]);
    }
  }
  if (!sets.length) return getSettings(uid);
  params.push(uid);
  await query(`UPDATE wa_call_lead_settings SET ${sets.join(", ")} WHERE uid = ?`, params);
  return getSettings(uid);
}

async function regenerateToken(uid) {
  await getSettings(uid);
  const token = newToken();
  await query(`UPDATE wa_call_lead_settings SET webhook_token = ? WHERE uid = ?`, [token, uid]);
  return token;
}

// Find a settings row purely by its webhook token (used by the public hook).
async function getSettingsByToken(uid, token) {
  await ensureTables();
  const [row] = await query(
    `SELECT * FROM wa_call_lead_settings WHERE uid = ? AND webhook_token = ? LIMIT 1`,
    [uid, token],
  );
  return row || null;
}

// Insert a lead. De-dupes on (uid, mobile) so a lead that submits twice or a
// re-poll of the same sheet row doesn't create duplicate call attempts.
// Returns { lead, isNew }.
async function insertLead(uid, { name, mobile, email, source, extra }) {
  await ensureTables();
  const cleanMobile = String(mobile || "").replace(/[^\d]/g, "");
  if (!cleanMobile) return { lead: null, isNew: false, reason: "no_mobile" };

  const [existing] = await query(
    `SELECT * FROM wa_call_leads WHERE uid = ? AND mobile = ? LIMIT 1`,
    [uid, cleanMobile],
  );
  if (existing) return { lead: existing, isNew: false, reason: "duplicate" };

  const result = await query(
    `INSERT INTO wa_call_leads (uid, name, mobile, email, source, extra, status)
     VALUES (?, ?, ?, ?, ?, ?, 'new')`,
    [
      uid,
      name || null,
      cleanMobile,
      email || null,
      source || "manual",
      extra ? JSON.stringify(extra) : null,
    ],
  );
  const insertId = result?.insertId;
  const [lead] = await query(`SELECT * FROM wa_call_leads WHERE id = ? LIMIT 1`, [insertId]);
  return { lead, isNew: true };
}

async function listLeads(uid) {
  await ensureTables();
  const rows = await query(
    `SELECT * FROM wa_call_leads WHERE uid = ? ORDER BY id DESC`,
    [uid],
  );
  return rows.map((r) => {
    let extra = {};
    let transcript = [];
    try {
      extra = r.extra ? JSON.parse(r.extra) : {};
    } catch {
      extra = {};
    }
    try {
      transcript = r.transcript ? JSON.parse(r.transcript) : [];
    } catch {
      transcript = [];
    }
    return { ...r, extra, transcript };
  });
}

async function getLead(id) {
  await ensureTables();
  const [row] = await query(`SELECT * FROM wa_call_leads WHERE id = ? LIMIT 1`, [id]);
  return row || null;
}

async function updateLead(id, patch) {
  await ensureTables();
  const allowed = [
    "name",
    "mobile",
    "email",
    "status",
    "permission_status",
    "call_id",
    "call_status",
    "call_duration",
    "transcript",
    "error_message",
    "called_at",
  ];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      let val = patch[key];
      if (key === "transcript" && typeof val !== "string") val = JSON.stringify(val || []);
      sets.push(`${key} = ?`);
      params.push(val);
    }
  }
  if (!sets.length) return;
  params.push(id);
  await query(`UPDATE wa_call_leads SET ${sets.join(", ")} WHERE id = ?`, params);
}

// Update a lead by (uid, mobile) — used by webhook correlators that only know
// the phone number.
async function updateLeadByMobile(uid, mobile, patch) {
  await ensureTables();
  const cleanMobile = String(mobile || "").replace(/[^\d]/g, "");
  const [row] = await query(
    `SELECT id FROM wa_call_leads WHERE uid = ? AND mobile = ? ORDER BY id DESC LIMIT 1`,
    [uid, cleanMobile],
  );
  if (!row) return null;
  await updateLead(row.id, patch);
  return row.id;
}

async function deleteLead(uid, id) {
  await ensureTables();
  await query(`DELETE FROM wa_call_leads WHERE id = ? AND uid = ?`, [id, uid]);
}

module.exports = {
  ensureTables,
  recordPoll,
  getApiKeys,
  getSettings,
  updateSettings,
  regenerateToken,
  getSettingsByToken,
  insertLead,
  listLeads,
  getLead,
  updateLead,
  updateLeadByMobile,
  deleteLead,
};
