/**
 * ElevenLabs text-to-speech. Requests µ-law 8 kHz directly so the audio can be
 * sent to Twilio without any conversion.
 */
const axios = require("axios");
const { describeError } = require("./stt.js");

function voiceFor(lang, settings) {
  const v = lang === "te" ? settings.eleven_voice_te : settings.eleven_voice_en;
  return v || settings.eleven_voice_en || settings.eleven_voice_te || null;
}

/**
 * @param {string} text
 * @param {"en"|"te"} lang
 * @param {object} settings admin settings (raw)
 * @returns {Promise<Buffer>} raw µ-law 8 kHz bytes
 */
async function synthesize(text, lang, settings) {
  if (!settings.eleven_api_key) throw new Error("ElevenLabs API key is not set");
  const voiceId = voiceFor(lang, settings);
  if (!voiceId) throw new Error(`No ElevenLabs voice configured for "${lang}"`);

  const model = settings.eleven_tts_model || "eleven_multilingual_v2";
  const body = { text, model_id: model };
  // language_code is only accepted by the v2.5 (turbo/flash) family.
  if (/v2_5/.test(model)) body.language_code = lang;

  try {
    const res = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      body,
      {
        params: { output_format: "ulaw_8000" },
        headers: {
          "xi-api-key": settings.eleven_api_key,
          "Content-Type": "application/json",
          Accept: "application/octet-stream",
        },
        responseType: "arraybuffer",
        timeout: 20000,
      },
    );
    return Buffer.from(res.data);
  } catch (err) {
    // arraybuffer error bodies are Buffers; decode for a useful message
    if (err.response?.data && Buffer.isBuffer(err.response.data)) {
      try {
        err.response.data = JSON.parse(err.response.data.toString("utf8"));
      } catch {
        /* keep as is */
      }
    }
    throw new Error(`ElevenLabs TTS failed: ${describeError(err)}`);
  }
}

module.exports = { synthesize, voiceFor };
