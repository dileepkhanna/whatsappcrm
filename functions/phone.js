// ─────────────────────────────────────────────────────────────────────────────
// Shared phone-number normalization.
//
// WhatsApp chats are keyed by a chat_id of the form `meta_<digits>_<uid>` (or
// `<instanceNumber>_<digits>_<uid>` for QR). If different code paths normalize
// the same human phone number differently, the SAME contact ends up split
// across two chat rows — e.g. an outgoing template built from a bare 10-digit
// number ("9949512262") vs the inbound Meta webhook which always carries the
// full country code ("919949512262").
//
// To prevent that, EVERY place that builds a chat_id or stores sender_mobile
// MUST run the number through normalizePhone() so they all agree.
//
// This module is intentionally dependency-free so it can be safely required
// from lightweight inbound/webhook paths without circular-import risk.
// ─────────────────────────────────────────────────────────────────────────────

// Default country code applied when a number arrives with no country code.
// A bare 10-digit number is assumed to be India (91). Override via the
// DEFAULT_COUNTRY_CODE env var if your primary audience is elsewhere.
const DEFAULT_COUNTRY_CODE = String(process.env.DEFAULT_COUNTRY_CODE || "91");

/**
 * Normalize a phone number to digits only, padding a bare local number with the
 * default country code so it matches the fully-qualified `wa_id` Meta sends.
 *
 *   "+91 99495 12262" -> "919949512262"
 *   "9949512262"       -> "919949512262"
 *   "919949512262"     -> "919949512262"
 *
 * @param {string|number} num raw phone input
 * @returns {string} digits-only, country-code-qualified phone
 */
function normalizePhone(num) {
  let digits = String(num || "").replace(/\D/g, "");
  // Only pad when it's exactly a local 10-digit number. Longer strings are
  // assumed to already include a country code.
  if (digits.length === 10) {
    digits = DEFAULT_COUNTRY_CODE + digits;
  }
  return digits;
}

/**
 * Extract a normalized phone number from a WhatsApp id / JID string.
 * Handles plain numbers, "919949512262:1@s.whatsapp.net", "919949512262@c.us",
 * and falls back to stripping non-digits.
 *
 * @param {string} str raw id / jid / wa_id
 * @returns {string} normalized digits, or "" when nothing usable is found
 */
function normalizePhoneFromId(str) {
  if (!str) return "";
  // Prefer the leading run of digits before a ":" or "@" (JID form).
  const jidMatch = String(str).match(/^(\d+)(?=[:@])/);
  const raw = jidMatch ? jidMatch[1] : str;
  return normalizePhone(raw);
}

module.exports = { normalizePhone, normalizePhoneFromId, DEFAULT_COUNTRY_CODE };
