/**
 * Lead ingestion for AI Phone Calling: phone normalisation, payload mapping
 * for each lead source, dedupe and consent handling.
 */
const axios = require("axios");
const { query } = require("../../../database/dbpromise.js");
const store = require("./store.js");

const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Normalise a phone number to E.164.
 * @param {string} raw
 * @param {string} defaultCc country calling code without "+", e.g. "91"
 * @returns {string|null}
 */
function normalizePhone(raw, defaultCc = "91") {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  const hadPlus = s.startsWith("+");
  let digits = s.replace(/\D/g, "");
  if (!digits) return null;

  let e164;
  if (hadPlus) {
    e164 = `+${digits}`;
  } else if (digits.startsWith("00")) {
    e164 = `+${digits.slice(2)}`;
  } else if (digits.length === 10) {
    e164 = `+${defaultCc}${digits}`;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    e164 = `+${defaultCc}${digits.slice(1)}`;
  } else if (digits.startsWith(defaultCc) && digits.length >= defaultCc.length + 8) {
    e164 = `+${digits}`;
  } else if (digits.length >= 11 && digits.length <= 15) {
    e164 = `+${digits}`;
  } else {
    return null;
  }
  return E164.test(e164) ? e164 : null;
}

function normalizeLanguage(v) {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith("te") || s.includes("telugu") || s.includes("తెలుగు")) return "te";
  if (s.startsWith("en") || s.includes("english")) return "en";
  return null;
}

function pick(obj, keys) {
  const lower = {};
  for (const k of Object.keys(obj || {})) lower[String(k).trim().toLowerCase()] = obj[k];
  for (const key of keys) {
    const v = lower[key];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

const NAME_KEYS = ["name", "full_name", "full name", "fullname", "first_name", "customer_name"];
const PHONE_KEYS = [
  "phone", "phone_number", "phone number", "mobile", "mobile_number", "mobile number",
  "number", "contact", "whatsapp", "phone_number_1",
];
const EMAIL_KEYS = ["email", "e-mail", "mail", "email_address"];
const LANG_KEYS = ["language", "lang", "preferred_language", "preferred language"];

/** Map a flat object (CSV row, generic webhook body) to a lead. */
function mapFlat(obj) {
  return {
    name: pick(obj, NAME_KEYS),
    phone: pick(obj, PHONE_KEYS),
    email: pick(obj, EMAIL_KEYS),
    language: normalizeLanguage(pick(obj, LANG_KEYS)),
    extra: obj,
  };
}

/** Meta Lead Ads: field_data = [{ name, values: [...] }] */
function mapMetaFieldData(fieldData = []) {
  const flat = {};
  for (const f of fieldData) {
    const key = String(f.name || "").toLowerCase();
    const val = Array.isArray(f.values) ? f.values[0] : f.value;
    if (key) flat[key] = val;
  }
  return mapFlat(flat);
}

/** Google Ads lead form: user_column_data = [{ column_id, string_value }] */
function mapGoogle(body = {}) {
  const flat = {};
  for (const c of body.user_column_data || []) {
    const key = String(c.column_id || c.column_name || "").toLowerCase();
    if (key) flat[key] = c.string_value;
  }
  let name = flat.full_name || "";
  if (!name && (flat.first_name || flat.last_name)) {
    name = `${flat.first_name || ""} ${flat.last_name || ""}`.trim();
  }
  return {
    name,
    phone: flat.phone_number || flat.phone || "",
    email: flat.email || "",
    language: normalizeLanguage(flat.language),
    extra: { ...flat, lead_id: body.lead_id, campaign_id: body.campaign_id, form_id: body.form_id },
  };
}

/** Fetch the details of a Meta leadgen event with the user's page token. */
async function fetchMetaLead(leadgenId, pageToken) {
  const version = process.env.META_GRAPH_VERSION || "v19.0";
  const res = await axios.get(`https://graph.facebook.com/${version}/${encodeURIComponent(leadgenId)}`, {
    params: { access_token: pageToken },
    timeout: 15000,
  });
  return mapMetaFieldData(res.data?.field_data || []);
}

async function isDnc(uid, phone) {
  const rows = await query(
    `SELECT id FROM vc_dnc WHERE phone_e164 = ? AND uid IN (?, ?) LIMIT 1`,
    [phone, uid, store.GLOBAL_DNC_UID],
  );
  return rows.length > 0;
}

/**
 * Insert one lead into a campaign.
 * @returns {{status:"created"|"duplicate"|"invalid"|"dnc", lead?:object, reason?:string}}
 */
async function insertLead({ uid, campaign, data, source, consent }) {
  const phone = normalizePhone(data.phone, campaign.country_code || "91");
  if (!phone) return { status: "invalid", reason: "Invalid phone number" };
  if (!consent) return { status: "invalid", reason: "No consent" };
  if (await isDnc(uid, phone)) return { status: "dnc", reason: "Number is on the do-not-call list" };

  const delaySec = campaign.auto_mode ? Math.max(0, Number(campaign.auto_delay_sec) || 0) : 0;
  const extra = JSON.stringify(data.extra || {}).slice(0, 20000);

  try {
    const result = await query(
      `INSERT INTO vc_leads
        (uid, campaign_id, name, phone_e164, email, source, language, consent, status, next_attempt_at, extra)
       VALUES (?,?,?,?,?,?,?,1,'queued', DATE_ADD(NOW(), INTERVAL ? SECOND), ?)`,
      [
        uid,
        campaign.campaign_id,
        String(data.name || "").slice(0, 255) || null,
        phone,
        String(data.email || "").slice(0, 255) || null,
        source,
        data.language || null,
        delaySec,
        extra,
      ],
    );
    return { status: "created", lead: { id: result.insertId, phone_e164: phone } };
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return { status: "duplicate", reason: "Already in this campaign" };
    throw e;
  }
}

module.exports = {
  normalizePhone,
  normalizeLanguage,
  mapFlat,
  mapMetaFieldData,
  mapGoogle,
  fetchMetaLead,
  insertLead,
  isDnc,
};
