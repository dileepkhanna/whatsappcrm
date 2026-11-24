/**
 * AI Phone Calling (Twilio) - data layer.
 *
 * Completely separate from the WhatsApp calling module (wa_call_*).
 * All tables are prefixed `vc_`.
 */
const crypto = require("crypto");
const { query } = require("../../../database/dbpromise.js");

const GLOBAL_DNC_UID = "__global__";

const DDL = [
  `CREATE TABLE IF NOT EXISTS vc_admin_settings (
    id int(11) NOT NULL,
    twilio_account_sid varchar(255) DEFAULT NULL,
    twilio_auth_token varchar(255) DEFAULT NULL,
    twilio_numbers text DEFAULT NULL,
    openrouter_api_key varchar(255) DEFAULT NULL,
    openrouter_model varchar(255) DEFAULT 'openai/gpt-4o-mini',
    eleven_api_key varchar(255) DEFAULT NULL,
    eleven_voice_te varchar(255) DEFAULT NULL,
    eleven_voice_en varchar(255) DEFAULT NULL,
    eleven_tts_model varchar(100) DEFAULT 'eleven_multilingual_v2',
    eleven_stt_model varchar(100) DEFAULT 'scribe_v1',
    global_max_concurrent int(11) DEFAULT 5,
    updatedAt datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS vc_agents (
    id int(11) NOT NULL AUTO_INCREMENT,
    uid varchar(255) NOT NULL,
    agent_id varchar(100) NOT NULL,
    name varchar(255) NOT NULL,
    business_context text DEFAULT NULL,
    goal text DEFAULT NULL,
    questions text DEFAULT NULL,
    greeting_en text DEFAULT NULL,
    greeting_te text DEFAULT NULL,
    default_language varchar(10) DEFAULT 'en',
    tone varchar(100) DEFAULT 'friendly and professional',
    max_duration_sec int(11) DEFAULT 300,
    createdAt datetime DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_agent (agent_id),
    KEY idx_uid (uid)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS vc_campaigns (
    id int(11) NOT NULL AUTO_INCREMENT,
    uid varchar(255) NOT NULL,
    campaign_id varchar(100) NOT NULL,
    title varchar(255) NOT NULL,
    agent_id varchar(100) NOT NULL,
    status varchar(30) DEFAULT 'draft',
    auto_mode tinyint(1) DEFAULT 0,
    auto_delay_sec int(11) DEFAULT 60,
    window_days varchar(30) DEFAULT '1,2,3,4,5,6,7',
    window_start varchar(5) DEFAULT '09:00',
    window_end varchar(5) DEFAULT '20:00',
    timezone varchar(100) DEFAULT 'Asia/Kolkata',
    country_code varchar(5) DEFAULT '91',
    max_concurrent int(11) DEFAULT 1,
    max_attempts int(11) DEFAULT 2,
    retry_gap_min int(11) DEFAULT 60,
    call_gap_sec int(11) DEFAULT 5,
    pause_reason varchar(255) DEFAULT NULL,
    createdAt datetime DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_campaign (campaign_id),
    KEY idx_uid (uid),
    KEY idx_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS vc_leads (
    id int(11) NOT NULL AUTO_INCREMENT,
    uid varchar(255) NOT NULL,
    campaign_id varchar(100) NOT NULL DEFAULT '',
    name varchar(255) DEFAULT NULL,
    phone_e164 varchar(32) NOT NULL,
    email varchar(255) DEFAULT NULL,
    source varchar(30) DEFAULT 'manual',
    language varchar(10) DEFAULT NULL,
    consent tinyint(1) DEFAULT 0,
    timezone varchar(100) DEFAULT NULL,
    status varchar(30) DEFAULT 'queued',
    outcome varchar(50) DEFAULT NULL,
    attempts int(11) DEFAULT 0,
    next_attempt_at datetime DEFAULT NULL,
    locked_until datetime DEFAULT NULL,
    extra longtext DEFAULT NULL,
    createdAt datetime DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_lead (uid, campaign_id, phone_e164),
    KEY idx_dial (campaign_id, status, next_attempt_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS vc_calls (
    id int(11) NOT NULL AUTO_INCREMENT,
    uid varchar(255) NOT NULL,
    call_id varchar(100) NOT NULL,
    twilio_sid varchar(64) DEFAULT NULL,
    lead_id int(11) DEFAULT NULL,
    campaign_id varchar(100) DEFAULT NULL,
    agent_id varchar(100) DEFAULT NULL,
    is_test tinyint(1) DEFAULT 0,
    from_number varchar(32) DEFAULT NULL,
    to_number varchar(32) DEFAULT NULL,
    status varchar(30) DEFAULT 'queued',
    language varchar(10) DEFAULT NULL,
    duration_sec int(11) DEFAULT NULL,
    billed_minutes int(11) DEFAULT NULL,
    transcript longtext DEFAULT NULL,
    summary text DEFAULT NULL,
    outcome varchar(50) DEFAULT NULL,
    answers longtext DEFAULT NULL,
    error text DEFAULT NULL,
    startedAt datetime DEFAULT CURRENT_TIMESTAMP,
    endedAt datetime DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_call (call_id),
    KEY idx_uid (uid, startedAt),
    KEY idx_campaign (campaign_id),
    KEY idx_sid (twilio_sid)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS vc_dnc (
    id int(11) NOT NULL AUTO_INCREMENT,
    uid varchar(255) NOT NULL,
    phone_e164 varchar(32) NOT NULL,
    reason varchar(255) DEFAULT NULL,
    createdAt datetime DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_dnc (uid, phone_e164)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS vc_source_tokens (
    id int(11) NOT NULL AUTO_INCREMENT,
    uid varchar(255) NOT NULL,
    source varchar(30) NOT NULL,
    token varchar(128) NOT NULL,
    campaign_id varchar(100) DEFAULT NULL,
    google_key varchar(255) DEFAULT NULL,
    meta_page_token text DEFAULT NULL,
    default_language varchar(10) DEFAULT NULL,
    createdAt datetime DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_src (uid, source),
    KEY idx_token (token)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS vc_usage (
    id int(11) NOT NULL AUTO_INCREMENT,
    uid varchar(255) NOT NULL,
    month char(7) NOT NULL,
    minutes int(11) DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_usage (uid, month)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

let ensurePromise = null;
function ensureTables() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      for (const sql of DDL) await query(sql, []);
      await query(`INSERT IGNORE INTO vc_admin_settings (id) VALUES (1)`, []);
      // plan columns (additive only)
      for (const [col, def] of [
        ["allow_ai_voice", "tinyint(1) DEFAULT 0"],
        ["ai_voice_minutes", "int(11) DEFAULT 0"],
      ]) {
        const exists = await query(`SHOW COLUMNS FROM plan LIKE '${col}'`, []);
        if (exists.length === 0) {
          await query(`ALTER TABLE plan ADD COLUMN ${col} ${def}`, []);
        }
      }
    })().catch((e) => {
      ensurePromise = null; // allow retry
      throw e;
    });
  }
  return ensurePromise;
}

// ─── admin settings ─────────────────────────────────────────────────────────
const SECRET_FIELDS = [
  "twilio_auth_token",
  "openrouter_api_key",
  "eleven_api_key",
];
const SETTING_FIELDS = [
  "twilio_account_sid",
  "twilio_auth_token",
  "twilio_numbers",
  "openrouter_api_key",
  "openrouter_model",
  "eleven_api_key",
  "eleven_voice_te",
  "eleven_voice_en",
  "eleven_tts_model",
  "eleven_stt_model",
  "global_max_concurrent",
];

function maskSecret(v) {
  if (!v) return "";
  const s = String(v);
  return s.length <= 4 ? "••••" : `••••••••${s.slice(-4)}`;
}

async function getAdminSettingsRaw() {
  await ensureTables();
  const [row] = await query(`SELECT * FROM vc_admin_settings WHERE id = 1`, []);
  const s = row || {};
  let numbers = [];
  try {
    numbers = JSON.parse(s.twilio_numbers || "[]");
  } catch {
    numbers = [];
  }
  return { ...s, twilio_numbers: numbers };
}

async function getAdminSettingsMasked() {
  const s = await getAdminSettingsRaw();
  const out = { ...s };
  for (const f of SECRET_FIELDS) {
    out[`${f}_set`] = !!s[f];
    out[f] = maskSecret(s[f]);
  }
  delete out.id;
  return out;
}

async function saveAdminSettings(body = {}) {
  await ensureTables();
  const patch = {};
  for (const f of SETTING_FIELDS) {
    if (body[f] === undefined) continue;
    let v = body[f];
    if (SECRET_FIELDS.includes(f)) {
      // blank or masked value => keep existing
      if (!v || String(v).startsWith("••••")) continue;
      v = String(v).trim();
    } else if (f === "twilio_numbers") {
      const arr = (Array.isArray(v) ? v : String(v).split(/[\n,]/))
        .map((x) => String(x).trim())
        .filter(Boolean);
      v = JSON.stringify(arr);
    } else if (f === "global_max_concurrent") {
      v = Math.max(1, Math.min(100, parseInt(v) || 1));
    } else {
      v = v == null ? null : String(v).trim() || null;
    }
    patch[f] = v;
  }
  const keys = Object.keys(patch);
  if (keys.length) {
    await query(`UPDATE vc_admin_settings SET ? WHERE id = 1`, [patch]);
  }
  return getAdminSettingsMasked();
}

// ─── helpers ────────────────────────────────────────────────────────────────
function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(5).toString("hex")}`;
}

function newToken() {
  return crypto.randomBytes(24).toString("hex");
}

function monthKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function getUsage(uid, month = monthKey()) {
  const [row] = await query(
    `SELECT minutes FROM vc_usage WHERE uid = ? AND month = ?`,
    [uid, month],
  );
  return row ? Number(row.minutes) : 0;
}

async function addUsage(uid, minutes, month = monthKey()) {
  await query(
    `INSERT INTO vc_usage (uid, month, minutes) VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE minutes = minutes + VALUES(minutes)`,
    [uid, month, minutes],
  );
}

async function getPlanMinutesCap(uid) {
  const [u] = await query(`SELECT plan FROM user WHERE uid = ?`, [uid]);
  if (!u || !u.plan) return 0;
  // effective plan = live base plan + active add-ons (limits stack)
  const { resolveEffectivePlan } = require("../../../middlewares/plan.js");
  const p = await resolveEffectivePlan(u.plan);
  if (!p || !(Number(p.allow_ai_voice) > 0)) return 0;
  return Math.max(0, Number(p.ai_voice_minutes) || 0);
}
module.exports = {
  GLOBAL_DNC_UID,
  ensureTables,
  getAdminSettingsRaw,
  getAdminSettingsMasked,
  saveAdminSettings,
  maskSecret,
  newId,
  newToken,
  monthKey,
  getUsage,
  addUsage,
  getPlanMinutesCap,
};
