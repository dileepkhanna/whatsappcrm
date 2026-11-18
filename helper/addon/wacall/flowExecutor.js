// ─────────────────────────────────────────────────────────────────────────────
// Call-flow executor — CONVERSATIONAL + GRAPH-AWARE.
//
// Runs a saved call flow against a live WebRTC call session. Supports two flow
// shapes:
//
//   1. NODE GRAPH (new visual builder): data = { nodes[], edges[], voice, ... }
//      We start at the entry node and walk edges. Node types:
//        start / greeting → speak intro, go to next
//        say / message    → speak a line, go to next
//        askListen        → speak prompt, then run a conversational loop
//                           (listen → STT → LLM → speak) for a few turns
//        aiResponse       → one LLM turn from context, speak it
//        condition        → branch on the last caller utterance (sourceHandle a/b)
//        hangup           → speak closing line, end
//
//   2. LINEAR STEPS (old editor): data = { steps: [{type,text,gatherHint}] }
//      Executed top-to-bottom (backward compatible).
//
// The `transcript` array (passed in) is appended LIVE as the conversation
// happens, so callers can persist partial transcripts even if the call drops.
// ─────────────────────────────────────────────────────────────────────────────

const { textToSpeech, speechToText, chat } = require("./voiceBridge");
const { substituteVariables } = require("./utils");

// ── Helpers to read node/step data uniformly ─────────────────────────────────
function nodeType(node) {
  return (node.data?.stepType || node.data?.msgContent?.callStep || node.type || "message").toLowerCase();
}
function nodeText(node) {
  return node.data?.msgContent?.text ?? node.data?.text ?? "";
}
function nodeGatherHint(node) {
  return node.data?.msgContent?.gatherHint ?? node.data?.gatherHint ?? "";
}

// Map a language code/name to a clear instruction for the AI.
function languageInstruction(lang) {
  const l = String(lang || "").toLowerCase();
  if (l === "te" || l.includes("telugu")) {
    return "IMPORTANT: Speak and respond ONLY in Telugu (తెలుగు). Use natural spoken Telugu. If the caller speaks English words, you may mix them naturally, but reply primarily in Telugu.";
  }
  if (l === "hi" || l.includes("hindi")) {
    return "IMPORTANT: Speak and respond ONLY in Hindi (हिन्दी). Use natural spoken Hindi.";
  }
  if (l === "en" || l.includes("english") || !l) {
    return "Speak and respond in clear, natural English.";
  }
  // Any other explicit language name.
  return `IMPORTANT: Speak and respond ONLY in ${lang}.`;
}

// Build the AI persona/system prompt from the whole flow (nodes or steps).
function buildSystemPrompt(items, flowData, language) {
  const langLine = languageInstruction(language);
  if (flowData?.systemPrompt) {
    // Still enforce the chosen language even when a custom prompt is provided.
    return `${flowData.systemPrompt}\n${langLine}`;
  }
  const texts = items.map((it) => it.text).filter(Boolean);
  const goals = items.filter((it) => it.type === "asklisten" || it.type === "gather").map((it) => it.gatherHint || it.text).filter(Boolean);
  return [
    "You are a friendly, concise voice assistant answering a phone call for a business.",
    texts.length ? `Business context: ${texts.join(" ")}` : "",
    goals.length ? `Your goals on this call: ${goals.join("; ")}.` : "",
    "Speak naturally and briefly, like on a real phone call — one or two short sentences per turn.",
    "Do not use markdown, emojis, or bullet points. If the caller is done or says goodbye, wrap up politely.",
    langLine,
  ].filter(Boolean).join(" ");
}

// Normalize a flow into an ordered item list (for linear execution / prompt building).
function normalizeItems(flowData) {
  if (Array.isArray(flowData?.steps) && flowData.steps.length > 0) {
    return flowData.steps.map((s) => ({ type: (s.type || "message").toLowerCase(), text: s.text || "", gatherHint: s.gatherHint || "" }));
  }
  const nodes = Array.isArray(flowData?.nodes) ? flowData.nodes : [];
  return nodes.map((n) => ({ type: nodeType(n), text: nodeText(n), gatherHint: nodeGatherHint(n) }));
}

function isGraph(flowData) {
  return Array.isArray(flowData?.nodes) && flowData.nodes.length > 0 &&
    Array.isArray(flowData?.edges) && flowData.edges.length > 0 &&
    !(Array.isArray(flowData?.steps) && flowData.steps.length > 0 && flowData.__preferSteps);
}

async function runCallFlow({ session, flowData, voice = {}, transcript = [], onTerminate, uid }) {
  // Merge the user's GLOBAL saved keys (entered once in the UI) as defaults, so
  // individual flows don't need to carry their own keys. Precedence:
  //   explicit `voice` arg  →  flow's own voice config  →  saved global keys.
  let saved = {};
  if (uid) {
    try {
      saved = await require("./leadStore.js").getApiKeys(uid);
    } catch (_) {
      saved = {};
    }
  }
  const fv = flowData?.voice || {};
  const pick3 = (a, b, c) => a || b || c || undefined;
  const language =
    voice.language || fv.language || flowData?.language || saved.language || "en";
  const voiceCfg = {
    provider: pick3(voice.provider, fv.provider, saved.provider),
    apiKey: voice.apiKey || fv.apiKey,
    elevenApiKey: pick3(voice.elevenApiKey, fv.elevenApiKey, saved.elevenApiKey),
    geminiApiKey: pick3(voice.geminiApiKey, fv.geminiApiKey, saved.geminiApiKey),
    voiceId: pick3(voice.voiceId, fv.voiceId, saved.voiceId),
    openRouterApiKey: pick3(voice.openRouterApiKey, fv.openRouterApiKey, saved.openRouterApiKey),
    openRouterModel: pick3(voice.openRouterModel, fv.openRouterModel, saved.openRouterModel),
    language,
  };

  const items = normalizeItems(flowData);
  const systemPrompt = buildSystemPrompt(items, flowData, language);
  const history = [];
  const maxTurns = Number(flowData?.maxTurns) || 6;

  // ── shared primitives ──
  const speak = async (text) => {
    if (!text || !text.trim()) return;
    const resolved = substituteVariables(text, { gather: {} });
    const tts = await textToSpeech({ voice: voiceCfg, text: resolved });
    if (tts.success) {
      history.push({ role: "model", text: resolved });
      await session.playPcm16k(tts.pcm);
    } else {
      console.error("[wa-call] TTS step skipped:", tts.error);
    }
  };

  const listenOnce = async () => {
    const pcm16k = await session.captureUntilSilence({ maxMs: 12000, silenceMs: 1200, minSpeechMs: 300 });
    if (!pcm16k || pcm16k.length === 0) return "";
    const stt = await speechToText({ voice: voiceCfg, pcm: pcm16k });
    return (stt.text || "").trim();
  };

  // One conversational exchange: listen, record, LLM reply, speak. Appends to
  // the LIVE transcript so partial data is preserved. Returns the caller text.
  const converse = async () => {
    const said = await listenOnce();
    if (!said) return "";
    history.push({ role: "user", text: said });
    transcript.push({ role: "caller", text: said });
    console.log(`[wa-call] caller said: "${said}"`);
    const reply = await chat({ voice: voiceCfg, systemPrompt, history });
    const answer = reply.success && reply.text ? reply.text : "Okay.";
    transcript.push({ role: "assistant", text: answer });
    await speak(answer);
    return said;
  };

  const doneSignal = (said) => /\b(bye|goodbye|that'?s all|nothing else|thank you)\b/i.test(said || "");

  // ── LINEAR mode (old steps, or a nodeless flow) ──
  if (!isGraph(flowData)) {
    for (const it of items) {
      if (it.type === "greeting" || it.type === "message" || it.type === "say" || it.type === "start") {
        await speak(it.text);
      } else if (it.type === "gather" || it.type === "asklisten") {
        await speak(it.text);
        for (let t = 0; t < maxTurns; t++) {
          const said = await converse();
          if (!said) { if (t === 0) { await speak("Sorry, I didn't catch that. Could you say it again?"); continue; } break; }
          if (doneSignal(said)) break;
        }
      } else if (it.type === "airesponse") {
        const reply = await chat({ voice: voiceCfg, systemPrompt, history });
        if (reply.success && reply.text) { transcript.push({ role: "assistant", text: reply.text }); await speak(reply.text); }
      } else if (it.type === "hangup") {
        await speak(it.text);
        break;
      }
    }
    if (typeof onTerminate === "function") await onTerminate();
    return { transcript };
  }

  // ── GRAPH mode (visual node builder) ──
  const nodes = flowData.nodes;
  const edges = flowData.edges || [];
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // adjacency: sourceId -> [{ target, sourceHandle }]
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source).push({ target: e.target, sourceHandle: e.sourceHandle || null });
  }
  const nextOf = (id, handle = null) => {
    const outs = adj.get(id) || [];
    if (handle) {
      const m = outs.find((o) => o.sourceHandle === handle);
      if (m) return m.target;
    }
    return outs[0]?.target || null;
  };

  // Entry node: an explicit start/greeting, or the node with no incoming edge.
  const hasIncoming = new Set(edges.map((e) => e.target));
  let startId =
    nodes.find((n) => ["start", "greeting"].includes(nodeType(n)))?.id ||
    nodes.find((n) => !hasIncoming.has(n.id))?.id ||
    nodes[0]?.id;

  let currentId = startId;
  const visited = new Map(); // id -> visit count (cycle guard)
  const MAX_STEPS = 40;
  let steps = 0;
  let lastCallerText = "";

  while (currentId && steps < MAX_STEPS) {
    steps += 1;
    visited.set(currentId, (visited.get(currentId) || 0) + 1);
    if (visited.get(currentId) > 6) break; // loop guard

    const node = byId.get(currentId);
    if (!node) break;
    const type = nodeType(node);

    if (type === "start" || type === "greeting" || type === "say" || type === "message") {
      await speak(nodeText(node));
      currentId = nextOf(currentId);
      continue;
    }

    if (type === "asklisten" || type === "gather") {
      await speak(nodeText(node));
      for (let t = 0; t < maxTurns; t++) {
        const said = await converse();
        if (!said) { if (t === 0) { await speak("Sorry, I didn't catch that. Could you say it again?"); continue; } break; }
        lastCallerText = said;
        if (doneSignal(said)) break;
      }
      currentId = nextOf(currentId);
      continue;
    }

    if (type === "airesponse") {
      const reply = await chat({ voice: voiceCfg, systemPrompt, history });
      if (reply.success && reply.text) { transcript.push({ role: "assistant", text: reply.text }); await speak(reply.text); }
      currentId = nextOf(currentId);
      continue;
    }

    if (type === "condition") {
      // Branch on whether the last caller utterance contains the configured keyword.
      const keyword = (node.data?.msgContent?.keyword || node.data?.keyword || "").toLowerCase();
      const matched = keyword && lastCallerText.toLowerCase().includes(keyword);
      currentId = nextOf(currentId, matched ? "a" : "b") || nextOf(currentId);
      continue;
    }

    if (type === "hangup") {
      await speak(nodeText(node));
      break;
    }

    // Unknown node type — just advance.
    currentId = nextOf(currentId);
  }

  if (typeof onTerminate === "function") await onTerminate();
  return { transcript };
}

module.exports = { runCallFlow, buildSystemPrompt, normalizeItems };
