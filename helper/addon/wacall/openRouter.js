// ─────────────────────────────────────────────────────────────────────────────
// OpenRouter chat brain for WhatsApp AI calling.
//
// OpenRouter (https://openrouter.ai) is an OpenAI-compatible LLM gateway. It
// provides the CONVERSATION (text replies) only — it does NOT do TTS or STT, so
// voice + speech-to-text still come from ElevenLabs/Gemini. We use it as a
// drop-in replacement for the Gemini "chat" brain because it's far more reliable
// than the Gemini free tier (which throws "high demand"/quota errors).
//
// API: POST https://openrouter.ai/api/v1/chat/completions
//   headers: Authorization: Bearer <OPENROUTER_API_KEY>
//   body:    { model, messages:[{role:'system'|'user'|'assistant', content}], ... }
//
// The API key is supplied by the FRONTEND flow config (voice.openRouterApiKey),
// falling back to OPENROUTER_API_KEY in env only if present.
// ─────────────────────────────────────────────────────────────────────────────

const axios = require("axios");

const OR_BASE = process.env.OPENROUTER_BASE || "https://openrouter.ai/api/v1";
// A free, chat-capable, multilingual default (good for Telugu/English).
const DEFAULT_MODEL =
  process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-exp:free";

// Models that DON'T work with /chat/completions (e.g. "decisions" models) or
// are otherwise unusable here. If a flow was saved with one, we silently
// substitute the safe default so the call still works.
const BLOCKED_MODELS = [/span-01/i, /decisions/i];

// Ordered free chat fallbacks — if the chosen model errors, we try these in
// turn so a single flaky/free model doesn't break the call.
const FREE_FALLBACKS = [
  "google/gemini-2.0-flash-exp:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-chat-v3-0324:free",
];

function safeModel(model) {
  if (!model) return DEFAULT_MODEL;
  if (BLOCKED_MODELS.some((re) => re.test(model))) return DEFAULT_MODEL;
  return model;
}

// Retry transient errors (429/5xx) a couple of times with short backoff so a
// live call doesn't fail on a momentary blip.
async function postWithRetry(url, body, config, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await axios.post(url, body, config);
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      const transient = status === 429 || (status >= 500 && status < 600);
      if (!transient || attempt === retries) break;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastErr;
}

/**
 * Conversational LLM turn via OpenRouter.
 * @param {Object} opts
 * @param {string} opts.apiKey        OpenRouter API key (from the flow/frontend)
 * @param {string} opts.model         optional model id (defaults to DEFAULT_MODEL)
 * @param {string} opts.systemPrompt  persona/instructions (includes language rule)
 * @param {Array}  opts.history       [{ role: 'user'|'model', text }]
 * @returns {{ success, text, error }}
 */
async function chat({ apiKey, model, systemPrompt, history = [] }) {
  if (!apiKey) return { success: false, error: "Missing OpenRouter API key", text: "" };

  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  for (const m of history) {
    messages.push({
      role: m.role === "model" || m.role === "assistant" ? "assistant" : "user",
      content: m.text || "",
    });
  }

  // Build the model try-list: the chosen (sanitized) model first, then free
  // fallbacks, de-duplicated. This survives a single free model being down or
  // returning "Provider returned error".
  const chosen = safeModel(model);
  const tryModels = [chosen, ...FREE_FALLBACKS].filter(
    (m, i, arr) => m && arr.indexOf(m) === i,
  );

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.OPENROUTER_REFERER || "https://whatscrm.app",
    "X-Title": "WhatsCRM AI Calling",
  };

  let lastDetail = "unknown error";
  for (const m of tryModels) {
    try {
      const res = await postWithRetry(
        `${OR_BASE}/chat/completions`,
        { model: m, messages, temperature: 0.7, max_tokens: 200 },
        { headers, timeout: 30000 },
      );
      const text = (res.data?.choices?.[0]?.message?.content || "").trim();
      if (text) {
        if (m !== chosen) console.log(`[wa-call] OpenRouter used fallback model: ${m}`);
        return { success: true, text, model: m };
      }
      lastDetail = "empty response";
    } catch (err) {
      lastDetail =
        err.response?.data?.error?.message ||
        err.response?.data?.error ||
        err.message;
      console.error(`[wa-call] OpenRouter model ${m} failed:`, lastDetail);
      // Try the next fallback model.
    }
  }
  return { success: false, error: lastDetail, text: "" };
}

module.exports = { chat, DEFAULT_MODEL };
