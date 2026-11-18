// ─────────────────────────────────────────────────────────────────────────────
// Voice bridge — provider dispatcher for the WhatsApp AI calling engine.
//
// Two jobs:
//   TTS: text -> 16-bit PCM (mono). The call layer resamples to the negotiated
//        WebRTC rate before playback.
//   STT: PCM -> transcript text (for "gather" steps).
//
// Providers:
//   "gemini"     (default, FREE) — Google Gemini via ./geminiVoice.js
//   "elevenlabs"                 — ElevenLabs REST (better quality, paid)
//
// The provider + key come from the flow's voice config:
//   voice = { provider, apiKey, voiceId }
// Falls back to env (GEMINI_API_KEY / ELEVENLABS_API_KEY) when no key is set.
// ─────────────────────────────────────────────────────────────────────────────

const axios = require("axios");
const FormData = require("form-data");
const { writeWavHeader } = require("./audioUtils");
const gemini = require("./geminiVoice");
const openRouter = require("./openRouter");

// ── ElevenLabs backend ────────────────────────────────────────────────────────
const EL_BASE = "https://api.elevenlabs.io/v1";
const EL_TTS_OUTPUT_FORMAT = "pcm_16000";
const EL_TTS_SAMPLE_RATE = 16000;
const EL_TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || "eleven_turbo_v2_5";
const EL_STT_MODEL = process.env.ELEVENLABS_STT_MODEL || "scribe_v1";

async function elevenTts({ apiKey, voiceId, text }) {
  if (!apiKey) return { success: false, error: "Missing ElevenLabs API key" };
  if (!voiceId) return { success: false, error: "Missing ElevenLabs voice id" };
  try {
    const res = await axios.post(
      `${EL_BASE}/text-to-speech/${voiceId}`,
      { text, model_id: EL_TTS_MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75 } },
      {
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/basic" },
        params: { output_format: EL_TTS_OUTPUT_FORMAT },
        responseType: "arraybuffer",
        timeout: 30000,
      },
    );
    return { success: true, pcm: Buffer.from(res.data), sampleRate: EL_TTS_SAMPLE_RATE };
  } catch (err) {
    const detail = err.response?.data
      ? Buffer.from(err.response.data).toString("utf8").slice(0, 300)
      : err.message;
    console.error("[wa-call] ElevenLabs TTS failed:", detail);
    return { success: false, error: detail };
  }
}

async function elevenStt({ apiKey, pcm, sampleRate = 16000 }) {
  if (!apiKey) return { success: false, error: "Missing ElevenLabs API key", text: "" };
  if (!pcm || pcm.length === 0) return { success: true, text: "" };
  try {
    const wav = Buffer.concat([writeWavHeader(pcm.length, sampleRate, 1), pcm]);
    const form = new FormData();
    form.append("file", wav, { filename: "audio.wav", contentType: "audio/wav" });
    form.append("model_id", EL_STT_MODEL);
    const res = await axios.post(`${EL_BASE}/speech-to-text`, form, {
      headers: { "xi-api-key": apiKey, ...form.getHeaders() },
      timeout: 30000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    const text = res.data?.text || res.data?.transcript || "";
    return { success: true, text: String(text).trim() };
  } catch (err) {
    console.error("[wa-call] ElevenLabs STT failed:", err.response?.data || err.message);
    return { success: false, error: "STT failed", text: "" };
  }
}

// ── Provider resolution ────────────────────────────────────────────────────────
function resolveProvider(voice = {}) {
  const requested = (voice.provider || "").toLowerCase();
  const hasElevenKey = !!(voice.elevenApiKey || voice.apiKey || process.env.ELEVENLABS_API_KEY);
  const hasGeminiKey = !!(voice.geminiApiKey || voice.apiKey || process.env.GEMINI_API_KEY || process.env.GEMINI_KEY);

  // If ElevenLabs is explicitly requested AND a usable ElevenLabs key exists, honor it.
  if (requested === "elevenlabs" && hasElevenKey) return "elevenlabs";
  // If Gemini is explicitly requested, honor it.
  if (requested === "gemini") return "gemini";

  // Otherwise fall back sensibly: prefer Gemini (free) whenever a Gemini key is
  // available. This makes old/misconfigured flows (e.g. provider="elevenlabs"
  // with no ElevenLabs key) still work via the free Gemini key in .env.
  if (hasGeminiKey) return "gemini";
  if (hasElevenKey) return "elevenlabs";
  return "gemini";
}

// Keys are provided by the FRONTEND flow config. We support both a generic
// `apiKey` (matching the selected provider) and explicit per-provider keys
// (`elevenApiKey`, `geminiApiKey`) so a flow can pair an ElevenLabs voice with
// a Gemini brain. Env vars are only a last-resort fallback.
function elevenKey(voice = {}) {
  return voice.elevenApiKey || voice.apiKey || process.env.ELEVENLABS_API_KEY;
}
function geminiKey(voice = {}) {
  return voice.geminiApiKey || voice.apiKey || process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;
}
function keyFor(provider, voice = {}) {
  return provider === "elevenlabs" ? elevenKey(voice) : geminiKey(voice);
}

/**
 * Text -> speech. Returns { success, pcm, sampleRate, error }.
 * @param {Object} opts.voice { provider, apiKey, voiceId }
 */
// A safe default ElevenLabs voice ("Rachel") used when a flow selected the
// ElevenLabs provider but never picked a specific voice — so calls still speak
// instead of failing with "Missing ElevenLabs voice id".
const DEFAULT_ELEVEN_VOICE_ID =
  process.env.ELEVENLABS_DEFAULT_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

async function textToSpeech({ voice = {}, text }) {
  const provider = resolveProvider(voice);
  const apiKey = keyFor(provider, voice);
  if (provider === "elevenlabs") {
    const voiceId = voice.voiceId || DEFAULT_ELEVEN_VOICE_ID;
    const result = await elevenTts({ apiKey, voiceId, text });
    // If ElevenLabs fails (bad/missing voice, no credits, etc.) but a Gemini
    // key exists, fall back to Gemini TTS so the caller still hears a voice.
    const gKey = geminiKey(voice);
    if (!result.success && gKey) {
      console.warn(`[wa-call] ElevenLabs TTS failed (${result.error}); falling back to Gemini voice.`);
      return gemini.textToSpeech({ apiKey: gKey, voiceId: null, text });
    }
    return result;
  }
  return gemini.textToSpeech({ apiKey, voiceId: voice.voiceId, text });
}

/**
 * Speech -> text. Returns { success, text, error }.
 */
/**
 * Conversational LLM turn. Only Gemini implements this (ElevenLabs is voice-only);
 * when the provider is ElevenLabs we still use the Gemini key for the brain, so
 * an ElevenLabs voice can be paired with a Gemini conversation.
 */
async function chat({ voice = {}, systemPrompt, history = [] }) {
  // The conversational brain now uses OpenRouter (reliable, OpenAI-compatible).
  // Key + model come from the frontend flow config, then env as fallback.
  const orKey = voice.openRouterApiKey || process.env.OPENROUTER_API_KEY;
  if (orKey) {
    const result = await openRouter.chat({
      apiKey: orKey,
      model: voice.openRouterModel || process.env.OPENROUTER_MODEL,
      systemPrompt,
      history,
    });
    if (result.success) return result;
    // If OpenRouter fails and a Gemini key exists, fall back so the call still works.
    const gKey = geminiKey(voice);
    if (gKey) {
      console.warn("[wa-call] OpenRouter chat failed; falling back to Gemini brain.");
      return gemini.chat({ apiKey: gKey, systemPrompt, history });
    }
    return result;
  }
  // No OpenRouter key configured → use Gemini brain as before.
  return gemini.chat({ apiKey: geminiKey(voice), systemPrompt, history });
}

async function speechToText({ voice = {}, pcm, sampleRate = 16000 }) {
  const provider = resolveProvider(voice);
  const apiKey = keyFor(provider, voice);
  if (provider === "elevenlabs") {
    return elevenStt({ apiKey, pcm, sampleRate });
  }
  return gemini.speechToText({ apiKey, pcm, sampleRate });
}

module.exports = { textToSpeech, speechToText, chat, resolveProvider };
