/**
 * Twilio helpers for AI Phone Calling. Credentials always come from the admin
 * settings (vc_admin_settings), never from users.
 */
const crypto = require("crypto");
const twilio = require("twilio");

function publicBase() {
  const base = String(process.env.BACKURI || "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("BACKURI is not set in .env (public https URL of this server)");
  return base;
}

function publicWsBase() {
  return publicBase().replace(/^http/i, "ws");
}

function getClient(settings) {
  if (!settings.twilio_account_sid || !settings.twilio_auth_token) {
    throw new Error("Twilio credentials are not set in admin settings");
  }
  return twilio(settings.twilio_account_sid, settings.twilio_auth_token);
}

let rr = 0;
/** Round-robin over the configured outbound numbers. */
function pickFromNumber(settings) {
  const nums = Array.isArray(settings.twilio_numbers) ? settings.twilio_numbers : [];
  if (!nums.length) throw new Error("No Twilio outbound number is set in admin settings");
  return nums[rr++ % nums.length];
}

async function placeCall({ settings, to, callId }) {
  const client = getClient(settings);
  const from = pickFromNumber(settings);
  const base = publicBase();
  const call = await client.calls.create({
    to,
    from,
    url: `${base}/api/voice_call/twiml/${callId}`,
    method: "POST",
    statusCallback: `${base}/api/voice_call/status/${callId}`,
    statusCallbackMethod: "POST",
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    timeout: 30,
  });
  return { sid: call.sid, from };
}

async function hangup(settings, sid) {
  try {
    await getClient(settings).calls(sid).update({ status: "completed" });
  } catch (e) {
    // already ended is fine
    if (e.status !== 404 && e.code !== 21220) throw e;
  }
}

/** Validate X-Twilio-Signature on an incoming webhook request. */
function validateRequest(req, authToken) {
  const signature = req.headers["x-twilio-signature"];
  if (!signature || !authToken) return false;
  const url = `${publicBase()}${req.originalUrl}`;
  return twilio.validateRequest(authToken, signature, url, req.body || {});
}

// ─── Media stream token (HMAC, short lived) ─────────────────────────────────
function secret() {
  return String(process.env.JWTKEY || "");
}

function signStreamToken(callId, ttlSec = 120) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = `${callId}.${exp}`;
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("hex");
  return `${exp}.${sig}`;
}

function verifyStreamToken(callId, token) {
  if (!secret() || !token) return false;
  const [exp, sig] = String(token).split(".");
  if (!exp || !sig || Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const expected = crypto
    .createHmac("sha256", secret())
    .update(`${callId}.${exp}`)
    .digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Constant-time string compare for webhook tokens. */
function safeEqual(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  // empty values never match (an unset token must not authenticate anything)
  if (!x.length || !y.length) return false;
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = {
  publicBase,
  publicWsBase,
  getClient,
  pickFromNumber,
  placeCall,
  hangup,
  validateRequest,
  signStreamToken,
  verifyStreamToken,
  safeEqual,
};
