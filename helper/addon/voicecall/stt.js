/**
 * ElevenLabs speech-to-text (utterance based).
 */
const axios = require("axios");
const { wavFromPcm16 } = require("./audio.js");

const LANG_CODES = { en: "eng", te: "tel" };

/**
 * @param {Buffer} pcm16  8 kHz mono int16 audio of ONE utterance
 * @param {"en"|"te"} lang
 * @param {object} settings admin settings (raw)
 * @returns {Promise<string>} transcript ("" when nothing was recognised)
 */
async function transcribe(pcm16, lang, settings) {
  if (!settings.eleven_api_key) throw new Error("ElevenLabs API key is not set");

  const form = new FormData();
  form.append("model_id", settings.eleven_stt_model || "scribe_v1");
  // lang "auto" lets the model detect the language (used for the language menu).
  if (lang !== "auto") form.append("language_code", LANG_CODES[lang] || LANG_CODES.en);
  form.append("tag_audio_events", "false");
  form.append(
    "file",
    new Blob([wavFromPcm16(pcm16, 8000)], { type: "audio/wav" }),
    "utterance.wav",
  );

  try {
    const res = await axios.post(
      "https://api.elevenlabs.io/v1/speech-to-text",
      form,
      {
        headers: { "xi-api-key": settings.eleven_api_key },
        timeout: 20000,
        maxBodyLength: Infinity,
      },
    );
    return String(res.data?.text || "").trim();
  } catch (err) {
    throw new Error(`ElevenLabs STT failed: ${describeError(err)}`);
  }
}

function describeError(err) {
  const d = err.response?.data;
  const msg =
    d?.detail?.message ||
    (typeof d?.detail === "string" ? d.detail : null) ||
    d?.message ||
    err.message;
  return `${err.response?.status || ""} ${msg}`.trim();
}

module.exports = { transcribe, describeError };
