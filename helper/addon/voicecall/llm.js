/**
 * OpenRouter chat client for the voice agent. Uses the platform key from the
 * admin settings (never a per-user key).
 */
const axios = require("axios");

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function mapError(err) {
  const status = err.response?.status;
  const detail =
    err.response?.data?.error?.message || err.response?.data?.message || err.message;
  if (status === 401) return "OpenRouter rejected the API key";
  if (status === 402) return "OpenRouter credits exhausted";
  if (status === 429) return "OpenRouter rate limit reached";
  if (status === 502 || status === 503) return "OpenRouter model unavailable";
  return `OpenRouter error: ${detail}`;
}

/**
 * @param {object} p
 * @param {Array<{role:string,content:string}>} p.messages
 * @param {object} p.settings admin settings (raw)
 * @param {number} [p.maxTokens]
 * @param {number} [p.temperature]
 * @param {boolean} [p.json] request a JSON object response
 * @param {number} [p.timeoutMs]
 * @returns {Promise<string>}
 */
async function chat({
  messages,
  settings,
  maxTokens = 220,
  temperature = 0.5,
  json = false,
  timeoutMs = 12000,
}) {
  if (!settings.openrouter_api_key) throw new Error("OpenRouter API key is not set");
  const body = {
    model: settings.openrouter_model || "openai/gpt-4o-mini",
    messages,
    max_tokens: maxTokens,
    temperature,
  };
  if (json) body.response_format = { type: "json_object" };

  try {
    const res = await axios.post(OPENROUTER_URL, body, {
      headers: {
        Authorization: `Bearer ${settings.openrouter_api_key}`,
        "Content-Type": "application/json",
      },
      timeout: timeoutMs,
    });
    const text = res.data?.choices?.[0]?.message?.content;
    if (!text) throw new Error("OpenRouter returned an empty response");
    return String(text).trim();
  } catch (err) {
    if (err.message === "OpenRouter returned an empty response") throw err;
    throw new Error(mapError(err));
  }
}

module.exports = { chat };
