// ─────────────────────────────────────────────────────────────────────────────
// Google Gemini voice provider (FREE tier) for WhatsApp AI calling.
//
// TTS: text -> 16-bit PCM. Gemini's TTS models return base64 PCM at 24kHz mono
//      via generateContent with responseModalities:["AUDIO"] and a speechConfig
//      voice. We return the raw PCM + its sample rate; the call layer resamples.
// STT: audio (PCM wrapped as WAV) -> transcript, via a normal generateContent
//      call with inline audio + a "transcribe this" instruction.
//
// Uses the Gemini REST API directly with a free API key from Google AI Studio
// (aistudio.google.com). No SDK version coupling.
// ─────────────────────────────────────────────────────────────────────────────

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { writeWavHeader } = require("./audioUtils");

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Parse Google's "Please retry in 37.8s" hint (or RetryInfo) from a quota error.
function parseRetryDelayMs(err) {
  try {
    const msg = err.response?.data?.error?.message || "";
    const m = /retry in ([\d.]+)s/i.exec(msg);
    if (m) return Math.ceil(parseFloat(m[1]) * 1000);
    const details = err.response?.data?.error?.details || [];
    const ri = details.find((d) => (d["@type"] || "").includes("RetryInfo"));
    if (ri?.retryDelay) {
      const s = /([\d.]+)s/.exec(ri.retryDelay);
      if (s) return Math.ceil(parseFloat(s[1]) * 1000);
    }
  } catch (_) {}
  return 0;
}

// Gemini free tier returns 429 (quota) and 503 ("high demand") frequently.
// Retry with backoff, and when the error tells us exactly how long to wait
// ("retry in Ns"), honor it — capped so a live call never hangs too long.
async function postWithRetry(url, body, config, { retries = 3, baseDelayMs = 1500, maxWaitMs = 20000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await axios.post(url, body, config);
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      const msg = err.response?.data?.error?.message || "";
      const transient =
        status === 429 ||
        status === 503 ||
        status === 500 ||
        /high demand|temporar|overloaded|try again|quota/i.test(msg);
      if (!transient || attempt === retries) break;
      // Prefer Google's suggested delay, capped so the caller isn't left hanging.
      const suggested = parseRetryDelayMs(err);
      const wait = Math.min(maxWaitMs, suggested || baseDelayMs * (attempt + 1));
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

// ── Persistent TTS cache ──────────────────────────────────────────────────────
// Fixed lines (greeting, prompts, goodbye) are spoken with the SAME text +
// voice on every call. Caching the generated audio to disk means those lines
// cost TTS quota only ONCE ever, instead of once per call. This is the single
// biggest free-tier saver, since TTS quota (~10/day) is the bottleneck.
const TTS_CACHE_DIR = path.resolve(process.cwd(), "./client/public/meta-media/tts-cache");

function cacheKey(voiceName, text) {
  return crypto.createHash("sha1").update(`${voiceName}::${text}`).digest("hex");
}
function readTtsCache(voiceName, text) {
  try {
    const file = path.join(TTS_CACHE_DIR, `${cacheKey(voiceName, text)}.pcm`);
    if (fs.existsSync(file)) {
      return { pcm: fs.readFileSync(file), sampleRate: GEMINI_TTS_SAMPLE_RATE };
    }
  } catch (_) {}
  return null;
}
function writeTtsCache(voiceName, text, pcm) {
  try {
    if (!fs.existsSync(TTS_CACHE_DIR)) fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });
    fs.writeFileSync(path.join(TTS_CACHE_DIR, `${cacheKey(voiceName, text)}.pcm`), pcm);
  } catch (_) {}
}
const TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
// Use an alias that always resolves to a current flash model so it doesn't go
// stale when Google retires versioned model names. flash-lite-latest handles
// inline-audio transcription and is lighter/less rate-limited than full flash.
const STT_MODEL = process.env.GEMINI_STT_MODEL || "gemini-flash-lite-latest";
// Gemini TTS returns 24kHz mono 16-bit PCM.
const GEMINI_TTS_SAMPLE_RATE = 24000;
// Default prebuilt voice (Google offers several: Kore, Puck, Charon, Aoede, …).
const DEFAULT_VOICE = process.env.GEMINI_TTS_VOICE || "Kore";

/**
 * Text -> speech via Gemini. Returns { success, pcm, sampleRate }.
 * pcm is 16-bit LE mono PCM at 24kHz.
 */
async function textToSpeech({ apiKey, voiceId, text }) {
  if (!apiKey) return { success: false, error: "Missing Gemini API key" };
  if (!text || !text.trim()) return { success: false, error: "Empty text" };

  const voiceName = voiceId || DEFAULT_VOICE;

  // 1) Serve from cache if we've generated this exact line+voice before. This
  //    avoids spending TTS quota on fixed lines that repeat every call.
  const cached = readTtsCache(voiceName, text);
  if (cached) {
    return { success: true, pcm: cached.pcm, sampleRate: cached.sampleRate, cached: true };
  }

  const url = `${GEMINI_BASE}/models/${TTS_MODEL}:generateContent`;

  try {
    const res = await postWithRetry(
      url,
      {
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      },
      {
        // Send the key via the x-goog-api-key header. This works for both the
        // classic "AIza…" keys and the newer "AQ.…" keys (which are rejected
        // when passed as a ?key= query parameter).
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        timeout: 30000,
      },
    );

    const parts = res.data?.candidates?.[0]?.content?.parts || [];
    const audioPart = parts.find((p) => p.inlineData?.data);
    if (!audioPart) {
      return { success: false, error: "Gemini TTS returned no audio" };
    }
    const pcm = Buffer.from(audioPart.inlineData.data, "base64");
    // mimeType is usually "audio/L16;codec=pcm;rate=24000"; parse the rate if present.
    const rateMatch = /rate=(\d+)/.exec(audioPart.inlineData.mimeType || "");
    const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : GEMINI_TTS_SAMPLE_RATE;
    // Save to cache so this exact line+voice never costs quota again.
    writeTtsCache(voiceName, text, pcm);
    return { success: true, pcm, sampleRate };
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message;
    console.error("[wa-call] Gemini TTS failed:", detail);
    return { success: false, error: detail };
  }
}

/**
 * Speech -> text via Gemini. Wraps PCM in WAV, sends inline, asks for a plain
 * transcription. Returns { success, text }.
 */
async function speechToText({ apiKey, pcm, sampleRate = 16000 }) {
  if (!apiKey) return { success: false, error: "Missing Gemini API key", text: "" };
  if (!pcm || pcm.length === 0) return { success: true, text: "" };

  const url = `${GEMINI_BASE}/models/${STT_MODEL}:generateContent`;
  try {
    const wav = Buffer.concat([writeWavHeader(pcm.length, sampleRate, 1), pcm]);
    const res = await postWithRetry(
      url,
      {
        contents: [
          {
            parts: [
              {
                text: "Transcribe the following audio to plain text. Return only the transcription, no commentary.",
              },
              {
                inlineData: {
                  mimeType: "audio/wav",
                  data: wav.toString("base64"),
                },
              },
            ],
          },
        ],
      },
      {
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        timeout: 30000,
      },
    );

    const parts = res.data?.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p) => p.text || "").join(" ").trim();
    return { success: true, text };
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message;
    console.error("[wa-call] Gemini STT failed:", detail);
    return { success: false, error: "STT failed", text: "" };
  }
}

// Model used for the conversational LLM turn (generating the AI's spoken reply).
// flash-lite-latest is the lightest current model — fastest and least likely to
// hit the free tier's tight rate limits / "high demand" spikes.
const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || "gemini-flash-lite-latest";

/**
 * Conversational LLM turn. Given a system prompt and the running dialogue,
 * returns the assistant's next reply text — which we then speak with TTS.
 *
 * @param {Object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.systemPrompt   persona/instructions for the AI agent
 * @param {Array}  opts.history        [{ role: 'user'|'model', text }]
 * @returns {{ success, text, error }}
 */
async function chat({ apiKey, systemPrompt, history = [] }) {
  if (!apiKey) return { success: false, error: "Missing Gemini API key", text: "" };
  const url = `${GEMINI_BASE}/models/${CHAT_MODEL}:generateContent`;
  try {
    const contents = history.map((m) => ({
      role: m.role === "model" ? "model" : "user",
      parts: [{ text: m.text || "" }],
    }));
    const body = {
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 200 },
    };
    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }
    const res = await postWithRetry(url, body, {
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      timeout: 30000,
    });
    const parts = res.data?.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p) => p.text || "").join(" ").trim();
    return { success: true, text };
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message;
    console.error("[wa-call] Gemini chat failed:", detail);
    return { success: false, error: "chat failed", text: "" };
  }
}

module.exports = { textToSpeech, speechToText, chat, GEMINI_TTS_SAMPLE_RATE, DEFAULT_VOICE };
