// ─────────────────────────────────────────────────────────────────────────────
// Extra flow node processors.
//
// New node types added to the automation flow builder:
//   media          image / video / audio / document
//   buttons        up to 3 reply buttons, one output per button
//   list           up to 10 list rows, one output per row
//   inputName / inputEmail / inputPhone / inputNumber / inputDate
//                  ask a question, validate the reply, re-ask if invalid
//   switch         multi-branch routing on the reply or a saved variable
//   randomSplit    weighted random A/B branch
//   aiResponse     one AI-generated reply, then continue
//   updateContact  save collected details to the chat + phonebook contact
//   end            finish the flow and clear the session
// plus canStartFlow(), the keyword trigger for the initial node.
//
// All processors follow the engine contract used by automation/functions.js:
//   - persist the NEXT node into flow_session.data.node before continuing
//   - return { moveToNextNode: true } to run the next node now
//   - return { moveToNextNode: false } to stop and wait for the next message
//   - return {} to stop (error / no outgoing edge)
//
// Nodes that wait for a reply (buttons, list, inputs) store
//   flow_session.data.awaiting = { nodeId, retries }
// The first visit sends the prompt; the next incoming message is evaluated
// against that prompt. awaiting is cleared as soon as the node is left.
// ─────────────────────────────────────────────────────────────────────────────

const { query } = require("../database/dbpromise");
const {
  getCurrentTimestampInTimeZone,
  saveMessageToConversation,
} = require("../functions/function");

// Lazy to avoid any circular-require ordering issues with ./functions.
const fp = () => require("./functions");

// Meta (WhatsApp Cloud API) limits for interactive messages.
const LIMITS = {
  body: 1024,
  header: 60,
  footer: 60,
  buttonTitle: 20,
  maxButtons: 3,
  listButton: 20,
  sectionTitle: 24,
  rowTitle: 24,
  rowDescription: 72,
  maxRows: 10,
};

const cut = (value, max) => {
  const s = String(value ?? "").trim();
  return s.length > max ? s.slice(0, max) : s;
};

const norm = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// Variable names must match the {{name}} pattern replaceVariables understands.
const cleanVarName = (name) =>
  String(name || "")
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, "_");

function resolve(text, variablesObj) {
  if (text === undefined || text === null) return "";
  return String(fp().replaceVariables(String(text), variablesObj || {}));
}

// True when the text still contains an unresolved {{var}} / {{{var}}}.
const hasUnresolved = (text) => /\{\{\{?[^{}]+\}?\}\}/.test(String(text || ""));

// ── Session helpers ──────────────────────────────────────────────────────────
async function persist({ flowSession, element, uid, message, patch }) {
  const data = { ...(flowSession?.data || {}), ...patch };
  await query(
    `UPDATE flow_session SET data = ? WHERE flow_id = ? AND uid = ? AND sender_mobile = ?`,
    [JSON.stringify(data), element?.flow_id, uid, message?.senderMobile],
  );
  if (flowSession) flowSession.data = data;
  return data;
}

// Edge leaving `nodeId` through `handleId`. When handleId is null/undefined,
// prefer an edge with no handle, then any edge from the node.
function edgeFrom(edges, nodeId, handleId) {
  const out = (edges || []).filter((e) => e.source === nodeId);
  if (handleId === undefined || handleId === null) {
    return out.find((e) => !e.sourceHandle) || out[0] || null;
  }
  return out.find((e) => e.sourceHandle === handleId) || null;
}

function targetOf(nodes, edge) {
  if (!edge) return null;
  return (nodes || []).find((n) => n.id === edge.target) || null;
}

// Move to `target` (or stop if missing) and clear any awaiting state.
async function goTo(ctx, target, extraPatch = {}) {
  const { flowSession, element, user, message } = ctx;
  if (!target) {
    await persist({
      flowSession,
      element,
      uid: user.uid,
      message,
      patch: { awaiting: null, ...extraPatch },
    });
    return {};
  }
  await persist({
    flowSession,
    element,
    uid: user.uid,
    message,
    patch: { node: target, awaiting: null, ...extraPatch },
  });
  return { moveToNextNode: true };
}

// ── Sending ──────────────────────────────────────────────────────────────────
// Send a Meta message object and log it to the conversation. `logContext` is
// what the inbox stores (defaults to the sent content).
async function sendAndLog(ctx, content, logContext) {
  const { message, node, origin, sessionId, user, chatId } = ctx;
  const uid = user?.uid;

  const sentId = await fp().sendWaMessage({
    message,
    node,
    origin,
    sessionId,
    isGroup: false,
    uid,
    content,
  });
  if (!sentId) return null;

  try {
    const ts = getCurrentTimestampInTimeZone(user?.timezone || "Asia/Kolkata");
    const msgContext = logContext || content;
    const messageData = {
      type: msgContext?.type || "text",
      metaChatId: sentId,
      msgContext,
      reaction: "",
      timestamp: parseInt(ts) + 1,
      senderName: message?.senderName,
      senderMobile: message?.senderMobile,
      star: 0,
      route: "OUTGOING",
      context: null,
      origin,
    };
    await saveMessageToConversation({ uid, chatId, messageData, sentBy: "bot" });
    await query(
      `UPDATE beta_chats SET last_message = ? WHERE chat_id = ? AND uid = ?`,
      [JSON.stringify(messageData), chatId, uid],
    );
  } catch (err) {
    console.error("[flow-nodes] failed to log outgoing message:", err.message);
  }
  return sentId;
}

const textContent = (body) => ({
  type: "text",
  text: { body: String(body || ""), preview_url: false },
});

async function sendText(ctx, body) {
  if (!body || !String(body).trim()) return null;
  return sendAndLog(ctx, textContent(body));
}

// Only Meta Cloud API supports native interactive messages. Other channels
// (QR, Telegram, Instagram) get a numbered text menu instead.
function supportsInteractive(ctx) {
  const o = String(ctx.origin || "").toLowerCase();
  if (o === "meta") return true;
  if (o === "webhook_automation") {
    return ctx.node?.data?.webhook?.origin?.code === "META";
  }
  return false;
}

// ── 1) Media ─────────────────────────────────────────────────────────────────
// Delegates to processSendMessage so logging, "wait if next is a Response
// Saver" and next-node handling stay identical to the Send Message node.
async function processMedia(ctx) {
  try {
    const d = ctx.node?.data || {};
    const t = ["image", "video", "audio", "document"].includes(d.mediaType)
      ? d.mediaType
      : "image";
    const link = resolve(d.url, ctx.variablesObj).trim();

    if (!link) {
      console.warn(`[flow-nodes] media node ${ctx.node?.id} has no URL; skipping`);
      return goTo(ctx, targetOf(ctx.nodes, edgeFrom(ctx.edges, ctx.node.id)));
    }

    const media = { link };
    const caption = resolve(d.caption, ctx.variablesObj).trim();
    if (caption && t !== "audio") media.caption = caption;
    if (t === "document") {
      media.filename = resolve(d.filename, ctx.variablesObj).trim() || "document";
    }

    const content = { type: t, [t]: media };
    return fp().processSendMessage({
      ...ctx,
      node: { ...ctx.node, data: { ...d, content } },
    });
  } catch (err) {
    console.error("❌ processMedia error:", err);
    return {};
  }
}

// ── 2) Buttons / List ────────────────────────────────────────────────────────
function buildOptions(kind, d, variablesObj) {
  const raw = kind === "buttons" ? d.buttons || [] : d.rows || [];
  const limit = kind === "buttons" ? LIMITS.maxButtons : LIMITS.maxRows;
  const titleMax = kind === "buttons" ? LIMITS.buttonTitle : LIMITS.rowTitle;
  return raw
    .filter((o) => o && String(o.title || "").trim())
    .slice(0, limit)
    .map((o, i) => ({
      id: String(o.id || `opt_${i + 1}`).slice(0, 256),
      title: cut(resolve(o.title, variablesObj), titleMax),
      description: o.description
        ? cut(resolve(o.description, variablesObj), LIMITS.rowDescription)
        : "",
    }));
}

// Match a reply to an option: exact title, then option number, then a single
// unambiguous partial match.
function matchOption(options, replyText) {
  const reply = norm(replyText);
  if (!reply) return null;

  const exact = options.find((o) => norm(o.title) === reply);
  if (exact) return exact;

  const num = reply.match(/^(?:option\s*)?(\d{1,2})[.)]?$/);
  if (num) {
    const idx = parseInt(num[1], 10) - 1;
    if (options[idx]) return options[idx];
  }

  const partial = options.filter(
    (o) => norm(o.title).length >= 2 && (reply.includes(norm(o.title)) || norm(o.title).includes(reply)),
  );
  return partial.length === 1 ? partial[0] : null;
}

async function sendInteractivePrompt(ctx, kind, d, options) {
  const v = ctx.variablesObj;
  const body = cut(resolve(d.body, v), LIMITS.body) || "Please choose an option";
  const header = cut(resolve(d.header, v), LIMITS.header);
  const footer = cut(resolve(d.footer, v), LIMITS.footer);

  // Plain-text record for the inbox (renders on every channel).
  const menuText =
    `${body}\n\n` +
    options.map((o, i) => `${i + 1}. ${o.title}${o.description ? ` (${o.description})` : ""}`).join("\n");

  // Website live chat: the inbox keeps the numbered text, and the widget shows
  // the question with tappable option buttons (msgContext.webchat).
  if (String(ctx.origin || "").toLowerCase() === "webchat") {
    const logged = {
      ...textContent(menuText),
      webchat: {
        body,
        header,
        footer,
        buttonText: kind === "list" ? cut(resolve(d.buttonText, v), LIMITS.listButton) || "View options" : "",
        options: options.map((o) => ({ title: o.title, description: o.description || "" })),
      },
    };
    return sendAndLog(ctx, logged);
  }

  if (!supportsInteractive(ctx)) {
    return sendAndLog(ctx, textContent(`${menuText}\n\nReply with the option number or name.`));
  }

  const interactive =
    kind === "buttons"
      ? {
          type: "button",
          body: { text: body },
          action: {
            buttons: options.map((o) => ({ type: "reply", reply: { id: o.id, title: o.title } })),
          },
        }
      : {
          type: "list",
          body: { text: body },
          action: {
            button: cut(resolve(d.buttonText, v), LIMITS.listButton) || "View options",
            sections: [
              {
                title: cut(resolve(d.sectionTitle, v), LIMITS.sectionTitle) || "Options",
                rows: options.map((o) => ({
                  id: o.id,
                  title: o.title,
                  ...(o.description ? { description: o.description } : {}),
                })),
              },
            ],
          },
        };
  if (header) interactive.header = { type: "text", text: header };
  if (footer) interactive.footer = { text: footer };

  return sendAndLog(ctx, { type: "interactive", interactive }, textContent(menuText));
}

async function processInteractive(ctx, kind) {
  try {
    const { node, nodes, edges, flowSession, user, message, element, incomingText, variablesObj } = ctx;
    const d = node.data || {};
    const options = buildOptions(kind, d, variablesObj);

    if (!options.length) {
      console.warn(`[flow-nodes] ${kind} node ${node.id} has no options; skipping`);
      return goTo(ctx, targetOf(nodes, edgeFrom(edges, node.id)));
    }

    const awaiting = flowSession?.data?.awaiting;
    const isAwaiting = awaiting && awaiting.nodeId === node.id;

    // First visit: send the menu and wait.
    if (!isAwaiting) {
      const sent = await sendInteractivePrompt(ctx, kind, d, options);
      if (!sent) return {};
      await persist({
        flowSession,
        element,
        uid: user.uid,
        message,
        patch: { node, awaiting: { nodeId: node.id, retries: 0 } },
      });
      return { moveToNextNode: false };
    }

    // Reply received: route to the chosen option's branch.
    const chosen = matchOption(options, incomingText);
    if (chosen) {
      const varName = cleanVarName(d.variableName);
      const variables = varName
        ? { ...(variablesObj || {}), [varName]: chosen.title }
        : variablesObj || {};
      const target =
        targetOf(nodes, edgeFrom(edges, node.id, chosen.id)) ||
        targetOf(nodes, edgeFrom(edges, node.id, "default"));
      console.log(`🔘 ${kind} node ${node.id}: chose "${chosen.title}" → ${target?.id || "none"}`);
      return goTo(ctx, target, { variables });
    }

    // Not a valid option.
    const retries = (awaiting.retries || 0) + 1;
    const maxRetries = Number.isFinite(Number(d.maxRetries)) ? Number(d.maxRetries) : 2;
    if (retries > maxRetries) {
      const invalid = targetOf(nodes, edgeFrom(edges, node.id, "invalid"));
      if (invalid) return goTo(ctx, invalid);
    }

    await sendText(ctx, resolve(d.invalidMessage, variablesObj) || "Please choose one of the options below 👇");
    await sendInteractivePrompt(ctx, kind, d, options);
    await persist({
      flowSession,
      element,
      uid: user.uid,
      message,
      patch: { node, awaiting: { nodeId: node.id, retries } },
    });
    return { moveToNextNode: false };
  } catch (err) {
    console.error(`❌ process ${kind} error:`, err);
    return {};
  }
}

// ── 3) Typed inputs ──────────────────────────────────────────────────────────
const INPUT_TYPES = {
  inputName: "name",
  inputEmail: "email",
  inputPhone: "phone",
  inputNumber: "number",
  inputDate: "date",
};

const DEFAULT_QUESTIONS = {
  name: "Please type your full name.",
  email: "Please type your email address.",
  phone: "Please type your mobile number.",
  number: "Please type a number.",
  date: "Please type the date (DD/MM/YYYY).",
};

const DEFAULT_ERRORS = {
  name: "That doesn't look like a name. Please type your full name.",
  email: "That email doesn't look right. Please type a valid email address (e.g. name@example.com).",
  phone: "That number doesn't look right. Please type a valid mobile number.",
  number: "Please type a valid number.",
  date: "Please type a valid date in DD/MM/YYYY format.",
};

const pad2 = (n) => String(n).padStart(2, "0");

function parseDate(text) {
  const t = String(text || "").trim();
  let y, m, d;
  let mt = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/); // DD/MM/YYYY
  if (mt) {
    d = +mt[1];
    m = +mt[2];
    y = +mt[3];
  } else if ((mt = t.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/))) {
    y = +mt[1]; // YYYY-MM-DD
    m = +mt[2];
    d = +mt[3];
  } else {
    return null;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return { y, m, d, date: dt };
}

// Returns { ok, value, reason? }.
function validateInput(type, rawText, d = {}) {
  const text = String(rawText ?? "").replace(/\s+/g, " ").trim();
  if (!text) return { ok: false };

  switch (type) {
    case "name": {
      // Unicode letters + combining marks so Telugu / Hindi names pass.
      const ok = /^[\p{L}\p{M}][\p{L}\p{M} .'-]{1,59}$/u.test(text);
      return ok ? { ok: true, value: text } : { ok: false };
    }
    case "email": {
      const v = text.toLowerCase();
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
      return ok ? { ok: true, value: v } : { ok: false };
    }
    case "phone": {
      let digits = text.replace(/[^\d]/g, "");
      const cc = String(d.defaultCountryCode || "").replace(/[^\d]/g, "");
      if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
      if (cc && digits.length === 10) digits = cc + digits;
      const ok = digits.length >= 10 && digits.length <= 15;
      return ok ? { ok: true, value: digits } : { ok: false };
    }
    case "number": {
      const t = text.replace(/,/g, "").replace(/^₹\s*/, "");
      if (!/^-?\d+(\.\d+)?$/.test(t)) return { ok: false };
      const n = Number(t);
      const min = d.min === "" || d.min === undefined || d.min === null ? null : Number(d.min);
      const max = d.max === "" || d.max === undefined || d.max === null ? null : Number(d.max);
      if (min !== null && Number.isFinite(min) && n < min) return { ok: false, reason: "min" };
      if (max !== null && Number.isFinite(max) && n > max) return { ok: false, reason: "max" };
      return { ok: true, value: t };
    }
    case "date": {
      const p = parseDate(text);
      if (!p) return { ok: false };
      const today = new Date();
      const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
      if (d.dateRule === "future" && p.date.getTime() < todayUtc) return { ok: false, reason: "future" };
      if (d.dateRule === "past" && p.date.getTime() > todayUtc) return { ok: false, reason: "past" };
      const value =
        d.dateFormat === "YYYY-MM-DD"
          ? `${p.y}-${pad2(p.m)}-${pad2(p.d)}`
          : `${pad2(p.d)}/${pad2(p.m)}/${p.y}`;
      return { ok: true, value };
    }
    default:
      return { ok: true, value: text };
  }
}

async function processAskInput(ctx) {
  try {
    const { node, nodes, edges, flowSession, user, message, element, incomingText, variablesObj } = ctx;
    const d = node.data || {};
    const type = INPUT_TYPES[node.type] || "name";

    const awaiting = flowSession?.data?.awaiting;
    const isAwaiting = awaiting && awaiting.nodeId === node.id;

    if (!isAwaiting) {
      const question = resolve(d.question, variablesObj) || DEFAULT_QUESTIONS[type];
      const sent = await sendText(ctx, question);
      if (!sent) return {};
      await persist({
        flowSession,
        element,
        uid: user.uid,
        message,
        patch: { node, awaiting: { nodeId: node.id, retries: 0 } },
      });
      return { moveToNextNode: false };
    }

    const result = validateInput(type, incomingText, d);
    if (result.ok) {
      const varName = cleanVarName(d.variableName) || type;
      const variables = { ...(variablesObj || {}), [varName]: result.value };
      console.log(`📝 ${node.type} ${node.id}: saved {{${varName}}} = "${result.value}"`);
      const target =
        targetOf(nodes, edgeFrom(edges, node.id, "valid")) ||
        targetOf(nodes, edgeFrom(edges, node.id));
      return goTo(ctx, target, { variables });
    }

    const retries = (awaiting.retries || 0) + 1;
    const maxRetries = Number.isFinite(Number(d.maxRetries)) ? Number(d.maxRetries) : 2;
    if (retries > maxRetries) {
      const invalid = targetOf(nodes, edgeFrom(edges, node.id, "invalid"));
      if (invalid) return goTo(ctx, invalid);
    }

    await sendText(ctx, resolve(d.errorMessage, variablesObj) || DEFAULT_ERRORS[type]);
    await persist({
      flowSession,
      element,
      uid: user.uid,
      message,
      patch: { node, awaiting: { nodeId: node.id, retries } },
    });
    return { moveToNextNode: false };
  } catch (err) {
    console.error("❌ processAskInput error:", err);
    return {};
  }
}

// ── 4) Switch ────────────────────────────────────────────────────────────────
function caseMatches(matchType, text, value) {
  const t = norm(text);
  const v = norm(value);
  switch (matchType) {
    case "contains":
      return v !== "" && t.includes(v);
    case "starts_with":
      return v !== "" && t.startsWith(v);
    case "ends_with":
      return v !== "" && t.endsWith(v);
    case "greater_than":
    case "less_than": {
      const a = Number(String(text).replace(/,/g, ""));
      const b = Number(String(value).replace(/,/g, ""));
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      return matchType === "greater_than" ? a > b : a < b;
    }
    case "is_empty":
      return t === "";
    case "equals":
    default:
      return t === v;
  }
}

async function processSwitch(ctx) {
  try {
    const { node, nodes, edges, incomingText, variablesObj } = ctx;
    const d = node.data || {};
    const varName = cleanVarName(d.variable);
    const subject =
      d.source === "variable" && varName
        ? String((variablesObj || {})[varName] ?? "")
        : String(incomingText ?? "");

    const cases = Array.isArray(d.cases) ? d.cases : [];
    let target = null;
    let matchedCase = null;
    for (const c of cases) {
      if (!c || !c.id) continue;
      if (caseMatches(c.matchType, subject, resolve(c.value, variablesObj))) {
        target = targetOf(nodes, edgeFrom(edges, node.id, c.id));
        matchedCase = c;
        if (target) break;
      }
    }
    if (!target) {
      target =
        targetOf(nodes, edgeFrom(edges, node.id, "default")) ||
        targetOf(nodes, edgeFrom(edges, node.id));
    }
    console.log(`🔀 switch ${node.id}: "${subject}" → case ${matchedCase?.value ?? "default"} → ${target?.id || "none"}`);
    return goTo(ctx, target);
  } catch (err) {
    console.error("❌ processSwitch error:", err);
    return {};
  }
}

// ── 5) Random split ──────────────────────────────────────────────────────────
function pickWeighted(branches) {
  const weights = branches.map((b) => Math.max(0, Number(b.weight) || 0));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return branches[Math.floor(Math.random() * branches.length)];
  let r = Math.random() * total;
  for (let i = 0; i < branches.length; i++) {
    r -= weights[i];
    if (r < 0) return branches[i];
  }
  return branches[branches.length - 1];
}

async function processRandomSplit(ctx) {
  try {
    const { node, nodes, edges, variablesObj } = ctx;
    const d = node.data || {};
    // Only consider branches that are actually connected.
    const branches = (Array.isArray(d.branches) ? d.branches : []).filter(
      (b) => b && b.id && edgeFrom(edges, node.id, b.id),
    );
    if (!branches.length) return goTo(ctx, targetOf(nodes, edgeFrom(edges, node.id)));

    const chosen = pickWeighted(branches);
    const varName = cleanVarName(d.variableName);
    const extra = varName
      ? { variables: { ...(variablesObj || {}), [varName]: chosen.label || chosen.id } }
      : {};
    const target = targetOf(nodes, edgeFrom(edges, node.id, chosen.id));
    console.log(`🎲 randomSplit ${node.id}: picked "${chosen.label || chosen.id}" → ${target?.id || "none"}`);
    return goTo(ctx, target, extra);
  } catch (err) {
    console.error("❌ processRandomSplit error:", err);
    return {};
  }
}

// ── 6) AI response ───────────────────────────────────────────────────────────
function msgToText(msgContext) {
  try {
    const m = typeof msgContext === "string" ? JSON.parse(msgContext) : msgContext;
    return (
      m?.text?.body ||
      m?.interactive?.body?.text ||
      m?.image?.caption ||
      m?.video?.caption ||
      m?.document?.caption ||
      ""
    );
  } catch {
    return "";
  }
}

const INTERNAL_VARS = new Set(["senderMessage"]);

async function processAiResponse(ctx) {
  try {
    const { node, nodes, edges, user, chatId, incomingText, variablesObj } = ctx;
    const uid = user.uid;
    const d = node.data || {};

    // Recent conversation for context (oldest first).
    const limit = Math.min(Math.max(parseInt(d.contextMessages, 10) || 6, 1), 20);
    let rows = [];
    try {
      rows = await query(
        `SELECT msgContext, route FROM beta_conversation
         WHERE chat_id = ? AND uid = ? ORDER BY timestamp DESC LIMIT ?`,
        [chatId, uid, limit],
      );
    } catch (err) {
      console.error("[flow-nodes] could not load conversation history:", err.message);
    }
    const history = (rows || [])
      .reverse()
      .map((r) => ({ role: r.route === "INCOMING" ? "user" : "model", text: msgToText(r.msgContext) }))
      .filter((m) => m.text);
    const last = history[history.length - 1];
    if (incomingText && !(last && last.role === "user" && last.text === incomingText)) {
      history.push({ role: "user", text: String(incomingText) });
    }
    if (!history.length) history.push({ role: "user", text: "Hello" });

    const known = Object.entries(variablesObj || {})
      .filter(([k, v]) => !INTERNAL_VARS.has(k) && v !== undefined && v !== null && String(v).trim() !== "")
      .map(([k, v]) => `${k}: ${String(v).slice(0, 200)}`)
      .join("\n");

    const systemPrompt = [
      resolve(d.instructions, variablesObj) ||
        "You are a helpful WhatsApp assistant for this business. Answer the customer's last message.",
      known ? `Known details about this customer:\n${known}` : "",
      "Reply in plain WhatsApp text: short, friendly, no markdown headings or tables. Reply in the same language the customer uses unless told otherwise.",
    ]
      .filter(Boolean)
      .join("\n\n");

    // Keys saved once on the Lead Auto-Call page (OpenRouter brain, Gemini fallback).
    let saved = {};
    try {
      saved = await require("../helper/addon/wacall/leadStore.js").getApiKeys(uid);
    } catch (_) {}
    const voice = {
      openRouterApiKey: saved.openRouterApiKey,
      openRouterModel: String(d.model || "").trim() || saved.openRouterModel,
      geminiApiKey: saved.geminiApiKey,
    };

    const { chat } = require("../helper/addon/wacall/voiceBridge.js");
    const reply = await chat({ voice, systemPrompt, history });
    const text = reply?.success ? String(reply.text || "").trim() : "";

    const varName = cleanVarName(d.variableName);
    let variables = variablesObj || {};

    if (text) {
      if (d.sendReply !== false) await sendText(ctx, text);
      if (varName) variables = { ...variables, [varName]: text };
    } else {
      console.error(`[flow-nodes] aiResponse ${node.id} got no reply:`, reply?.error || "empty");
      const fallback = resolve(d.fallbackMessage, variablesObj);
      if (fallback) await sendText(ctx, fallback);
    }

    return goTo(ctx, targetOf(nodes, edgeFrom(edges, node.id)), { variables });
  } catch (err) {
    console.error("❌ processAiResponse error:", err);
    return {};
  }
}

// ── 7) Update contact ────────────────────────────────────────────────────────
async function processUpdateContact(ctx) {
  try {
    const { node, nodes, edges, user, chatId, message, variablesObj } = ctx;
    const uid = user.uid;
    const d = node.data || {};

    // Resolve each field; ignore empties and values with unresolved variables.
    const pick = (key) => {
      const v = resolve(d[key], variablesObj).trim();
      return v && !hasUnresolved(v) ? v.slice(0, 500) : null;
    };
    const fields = {
      name: pick("name"),
      var1: pick("var1"),
      var2: pick("var2"),
      var3: pick("var3"),
      var4: pick("var4"),
      var5: pick("var5"),
    };
    const mobile = String(message?.senderMobile || "").replace(/[^\d]/g, "");

    if (fields.name) {
      await query(`UPDATE beta_chats SET sender_name = ? WHERE chat_id = ? AND uid = ?`, [
        fields.name.slice(0, 255),
        chatId,
        uid,
      ]);
    }

    if (mobile) {
      const setCols = Object.keys(fields).filter((k) => fields[k] !== null);
      if (setCols.length) {
        await query(
          `UPDATE contact SET ${setCols.map((c) => `${c} = ?`).join(", ")}
           WHERE uid = ? AND REPLACE(REPLACE(mobile, '+', ''), ' ', '') = ?`,
          [...setCols.map((c) => fields[c]), uid, mobile],
        );
      }

      // Optionally add to a phonebook if not already there.
      const phonebookId = parseInt(d.phonebookId, 10);
      if (Number.isFinite(phonebookId) && phonebookId > 0) {
        const [book] = await query(`SELECT id, name FROM phonebook WHERE id = ? AND uid = ? LIMIT 1`, [
          phonebookId,
          uid,
        ]);
        if (book) {
          const [exists] = await query(
            `SELECT id FROM contact WHERE uid = ? AND phonebook_id = ?
             AND REPLACE(REPLACE(mobile, '+', ''), ' ', '') = ? LIMIT 1`,
            [uid, phonebookId, mobile],
          );
          if (!exists) {
            await query(
              `INSERT INTO contact (uid, phonebook_id, phonebook_name, name, mobile, var1, var2, var3, var4, var5)
               VALUES (?,?,?,?,?,?,?,?,?,?)`,
              [
                uid,
                book.id,
                book.name,
                fields.name || message?.senderName || null,
                mobile,
                fields.var1,
                fields.var2,
                fields.var3,
                fields.var4,
                fields.var5,
              ],
            );
          }
        } else {
          console.warn(`[flow-nodes] updateContact: phonebook ${phonebookId} not found for uid ${uid}`);
        }
      }
    }

    const patch = fields.name ? { variables: { ...(variablesObj || {}), senderName: fields.name } } : {};
    return goTo(ctx, targetOf(nodes, edgeFrom(edges, node.id)), patch);
  } catch (err) {
    console.error("❌ processUpdateContact error:", err);
    return {};
  }
}

// ── 8) End ───────────────────────────────────────────────────────────────────
async function processEnd(ctx) {
  try {
    const { user, element, message, node } = ctx;
    await query(
      `DELETE FROM flow_session WHERE uid = ? AND flow_id = ? AND sender_mobile = ? LIMIT 1`,
      [user.uid, element?.flow_id, message?.senderMobile],
    );
    console.log(`🏁 Flow ended at node ${node?.id} for ${message?.senderMobile}`);
    return { moveToNextNode: false };
  } catch (err) {
    console.error("❌ processEnd error:", err);
    return {};
  }
}

// ── Keyword trigger ──────────────────────────────────────────────────────────
// The initial node can be set to start only on specific keywords. A contact
// already inside the flow (session exists) is never blocked.
function keywordMatches(initialData, incomingText) {
  const keywords = String(initialData?.keywords || "")
    .split(",")
    .map((k) => norm(k))
    .filter(Boolean);
  if (!keywords.length) return true;
  const text = norm(incomingText);
  if (!text) return false;
  return initialData?.keywordMatch === "contains"
    ? keywords.some((k) => text.includes(k))
    : keywords.some((k) => text === k);
}

async function canStartFlow({ nodes, uid, flowId, message, incomingText }) {
  try {
    const initial =
      (nodes || []).find((n) => n.id === "initialNode") ||
      (nodes || []).find((n) => String(n.type || "").toLowerCase() === "initial");
    if (!initial || initial.data?.triggerType !== "keyword") return true;

    const [existing] = await query(
      `SELECT id FROM flow_session WHERE uid = ? AND flow_id = ? AND sender_mobile = ? LIMIT 1`,
      [uid, flowId, message?.senderMobile],
    );
    if (existing) return true;

    return keywordMatches(initial.data, incomingText);
  } catch (err) {
    console.error("[flow-nodes] canStartFlow error:", err.message);
    return true;
  }
}

const EXTRA_NODE_TYPES = [
  "media",
  "buttons",
  "list",
  ...Object.keys(INPUT_TYPES),
  "switch",
  "randomSplit",
  "aiResponse",
  "updateContact",
  "end",
];

// Single entry point used by processFlow's switch.
async function processExtraNode(ctx) {
  switch (ctx.node?.type) {
    case "media":
      return processMedia(ctx);
    case "buttons":
      return processInteractive(ctx, "buttons");
    case "list":
      return processInteractive(ctx, "list");
    case "inputName":
    case "inputEmail":
    case "inputPhone":
    case "inputNumber":
    case "inputDate":
      return processAskInput(ctx);
    case "switch":
      return processSwitch(ctx);
    case "randomSplit":
      return processRandomSplit(ctx);
    case "aiResponse":
      return processAiResponse(ctx);
    case "updateContact":
      return processUpdateContact(ctx);
    case "end":
      return processEnd(ctx);
    default:
      return { moveToNextNode: false };
  }
}

module.exports = {
  EXTRA_NODE_TYPES,
  processExtraNode,
  canStartFlow,
  // exported for tests
  validateInput,
  matchOption,
  buildOptions,
  caseMatches,
  keywordMatches,
  pickWeighted,
};
