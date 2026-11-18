const router = require("express").Router();
const { query } = require("../database/dbpromise.js");

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC Chat Widget endpoints (loaded by <script src=".../widget.js?id=..."> on
// the customer's own website, a different origin, so they are CORS-open and
// unauthenticated).
//
// Two modes per widget:
//   • "whatsapp" – floating button that opens wa.me/<number> (click-to-chat)
//   • "live"     – chat window inside the website. Visitor messages land in the
//                  CRM inbox as origin "webchat"; the selected chatbot flow and
//                  agents reply; the widget polls for replies.
// ─────────────────────────────────────────────────────────────────────────────

// ── one-time schema migration (adds the live-chat columns) ──────────────────
const WIDGET_COLUMNS = {
  mode: "VARCHAR(20) NOT NULL DEFAULT 'whatsapp'",
  flow_id: "VARCHAR(255) NULL",
  theme_color: "VARCHAR(20) NULL",
  welcome_msg: "TEXT NULL",
  bot_name: "VARCHAR(100) NULL",
  start_text: "VARCHAR(100) NULL",
  ask_details: "TINYINT(1) NOT NULL DEFAULT 0",
};
const migrated = (async () => {
  try {
    const cols = await query(`SHOW COLUMNS FROM chat_widget`);
    const have = new Set(cols.map((c) => c.Field));
    for (const [name, def] of Object.entries(WIDGET_COLUMNS)) {
      if (!have.has(name)) await query(`ALTER TABLE chat_widget ADD COLUMN \`${name}\` ${def}`);
    }
  } catch (err) {
    console.error("chat_widget migration failed:", err.message);
  }
})();

function openCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, ngrok-skip-browser-warning");
}

const normPlace = (p) => {
  const v = String(p || "bottom-right").toLowerCase().replace(/_/g, "-");
  return ["bottom-right", "bottom-left", "top-right", "top-left"].includes(v) ? v : "bottom-right";
};
const normSize = (s) => {
  const px = parseInt(s, 10);
  return Number.isFinite(px) ? Math.min(Math.max(px, 40), 96) : s || "medium";
};
const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(String(c || "")) ? c : "#008069");

// ── GET /api/widget/config/:uniqueId ────────────────────────────────────────
router.get("/api/widget/config/:uniqueId", async (req, res) => {
  openCors(res);
  try {
    await migrated;
    const [w] = await query(`SELECT * FROM chat_widget WHERE unique_id = ? LIMIT 1`, [req.params.uniqueId]);
    if (!w) return res.status(404).json({ success: false, msg: "Widget not found" });

    let logoUrl = null;
    if (w.logo) {
      if (/^https?:\/\//i.test(w.logo)) logoUrl = w.logo;
      else {
        const fs = require("fs");
        const path = require("path");
        const file = path.join(__dirname, "..", "client", "public", "media", path.basename(w.logo));
        if (fs.existsSync(file)) logoUrl = `${req.protocol}://${req.get("host")}/media/${w.logo}`;
      }
    }

    res.json({
      success: true,
      data: {
        mode: w.mode === "live" ? "live" : "whatsapp",
        title: w.title || "Chat with us",
        number: String(w.whatsapp_number || "").replace(/[^\d]/g, ""),
        place: normPlace(w.place),
        size: normSize(w.size),
        logo: logoUrl,
        color: safeColor(w.theme_color),
        botName: w.bot_name || w.title || "Support",
        welcome: w.welcome_msg || "Hi there! 👋 How can we help you today?",
        startText: w.start_text || "Hi",
        askDetails: !!w.ask_details,
      },
    });
  } catch (err) {
    console.log("widget config error:", err);
    res.status(500).json({ success: false, msg: "Something went wrong" });
  }
});

// ── Live chat API ───────────────────────────────────────────────────────────
const VISITOR_RE = /^[A-Za-z0-9]{16,40}$/;
const chatIdOf = (visitorId, uid) => `webchat_${visitorId}_${uid}`;
const mobileOf = (visitorId) => `web_${visitorId}`.slice(0, 50);

// Small in-memory rate limiter: 15 messages / minute per visitor and per IP.
const hits = new Map();
function limited(key, max = 15, windowMs = 60_000) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k);
  return arr.length > max;
}

// Live widget + owner, only if the owner's plan includes the chat widget.
async function loadLiveWidget(uniqueId) {
  await migrated;
  const [w] = await query(`SELECT * FROM chat_widget WHERE unique_id = ? AND mode = 'live' LIMIT 1`, [uniqueId]);
  if (!w) return null;
  const [user] = await query(`SELECT * FROM user WHERE uid = ? LIMIT 1`, [w.uid]);
  if (!user) return null;
  let plan = {};
  try {
    plan = JSON.parse(user.plan || "{}") || {};
  } catch {}
  if (!(Number(plan.allow_chat_widget) > 0)) return null;
  return { widget: w, user };
}

const cleanText = (v, max) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);

router.options("/api/widget/*", (req, res) => {
  openCors(res);
  res.sendStatus(204);
});

// POST /api/widget/chat/:uniqueId/send  { visitorId, text, name?, phone? }
router.post("/api/widget/chat/:uniqueId/send", async (req, res) => {
  openCors(res);
  try {
    const { visitorId } = req.body || {};
    const text = cleanText(req.body?.text, 2000);
    if (!VISITOR_RE.test(String(visitorId || ""))) return res.status(400).json({ success: false, msg: "Invalid visitor" });
    if (!text) return res.status(400).json({ success: false, msg: "Message is empty" });
    const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
    if (limited(`v:${visitorId}`) || limited(`ip:${ip}`, 40)) {
      return res.status(429).json({ success: false, msg: "You're sending messages too quickly. Please wait a moment." });
    }

    const live = await loadLiveWidget(req.params.uniqueId);
    if (!live) return res.status(404).json({ success: false, msg: "Chat is not available" });
    const { widget, user } = live;
    const uid = user.uid;

    const name = cleanText(req.body?.name, 60);
    const phone = cleanText(req.body?.phone, 20).replace(/[^\d+]/g, "");
    const displayName = name ? (phone ? `${name} (${phone})` : name) : "";

    const chatId = chatIdOf(visitorId, uid);
    const senderMobile = mobileOf(visitorId);
    const { getCurrentTimestampInTimeZone, saveMessageToConversation } = require("../functions/function");
    const timestamp = parseInt(getCurrentTimestampInTimeZone(user.timezone || "Asia/Kolkata"));

    const [chat] = await query(`SELECT * FROM beta_chats WHERE chat_id = ? AND uid = ? LIMIT 1`, [chatId, uid]);
    const senderName = displayName || chat?.sender_name || "Website visitor";

    // The inbox shows "Name (phone)"; the chatbot greets with the name only.
    const flowName = name || (chat?.sender_name || "").replace(/\s*\([^)]*\)\s*$/, "") || "there";

    const newMessage = {
      type: "text",
      metaChatId: `wcin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      msgContext: { type: "text", text: { body: text } },
      reaction: "",
      timestamp,
      senderName: flowName,
      senderMobile,
      star: 0,
      route: "INCOMING",
      context: null,
      origin: "webchat",
    };

    await saveMessageToConversation({ uid, chatId, messageData: { ...newMessage, senderName }, sentBy: "visitor" });

    if (chat) {
      await query(
        `UPDATE beta_chats SET last_message = ?, sender_name = ?, unread_count = COALESCE(unread_count, 0) + 1, updatedAt = NOW() WHERE chat_id = ? AND uid = ?`,
        [JSON.stringify({ ...newMessage, senderName }), senderName, chatId, uid],
      );
    } else {
      await query(`INSERT INTO beta_chats SET ?`, {
        uid,
        chat_id: chatId,
        sender_name: senderName,
        sender_mobile: senderMobile,
        origin: "webchat",
        origin_instance_id: JSON.stringify({ id: widget.unique_id, title: String(widget.title || "Website").slice(0, 80) }),
        last_message: JSON.stringify({ ...newMessage, senderName }),
        unread_count: 1,
        is_opened: 0,
        assigned_agent: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Tell the CRM inbox right away (same events as the other channels).
    try {
      const { getConnectionsByUid, sendToSocket } = require("../socket");
      for (const s of getConnectionsByUid(uid, true) || []) {
        sendToSocket(s?.socketId, { chatId }, "request_update_chat_list");
        sendToSocket(s?.socketId, { message: newMessage, chat_id: chatId }, "message.new");
        sendToSocket(s?.socketId, newMessage, `new_message_${chatId}`);
        sendToSocket(s?.socketId, {}, "ring");
      }
    } catch (e) {
      console.log("webchat socket notify failed:", e.message);
    }

    res.json({ success: true });

    // Chatbot reply (after responding, so the visitor isn't kept waiting).
    // The bot comes from the Chatbot section (Website channel) or the
    // widget's own flow; getActiveFlows decides, so always ask it.
    {
      const { processWebhook } = require("../helper/inbox/chatbot");
      // {{visitorName}} / {{visitorPhone}} are available in the flow.
      const variables = { visitorName: flowName };
      if (phone) variables.visitorPhone = phone;
      processWebhook(newMessage, user, { sessionId: widget.unique_id, chatId, variables }).catch((e) =>
        console.log("webchat bot error:", e?.message || e),
      );
    }
  } catch (err) {
    console.log("webchat send error:", err);
    if (!res.headersSent) res.status(500).json({ success: false, msg: "Something went wrong" });
  }
});

// GET /api/widget/chat/:uniqueId/messages?visitorId=…&after=<lastId>
router.get("/api/widget/chat/:uniqueId/messages", async (req, res) => {
  openCors(res);
  try {
    const visitorId = String(req.query.visitorId || "");
    if (!VISITOR_RE.test(visitorId)) return res.status(400).json({ success: false, msg: "Invalid visitor" });
    const after = Math.max(0, parseInt(req.query.after, 10) || 0);

    const live = await loadLiveWidget(req.params.uniqueId);
    if (!live) return res.status(404).json({ success: false, msg: "Chat is not available" });

    const rows = await query(
      `SELECT id, route, type, msgContext, timestamp FROM beta_conversation
       WHERE chat_id = ? AND uid = ? AND id > ? ORDER BY id ASC LIMIT 100`,
      [chatIdOf(visitorId, live.user.uid), live.user.uid, after],
    );

    const httpLink = (l) => (/^https?:\/\//i.test(String(l || "")) ? String(l) : "");
    const messages = rows.map((r) => {
      let c = {};
      try {
        c = JSON.parse(r.msgContext || "{}") || {};
      } catch {}
      const t = c.type || r.type || "text";
      const m = { id: r.id, from: r.route === "INCOMING" ? "visitor" : "business", ts: Number(r.timestamp) || 0, type: "text", text: "" };
      if (c.webchat?.options?.length) {
        m.type = "options";
        m.text = String(c.webchat.body || "");
        m.header = String(c.webchat.header || "");
        m.footer = String(c.webchat.footer || "");
        m.buttonText = String(c.webchat.buttonText || "");
        m.options = c.webchat.options.slice(0, 10).map((o) => ({ title: String(o.title || ""), description: String(o.description || "") }));
      } else if (["image", "video", "audio", "document"].includes(t) && c[t]) {
        m.type = t;
        m.url = httpLink(c[t].link);
        m.text = String(c[t].caption || "");
        m.filename = String(c[t].filename || "");
      } else if (t === "template") {
        m.text = String(c.template?.text || c.template?.name || "");
      } else {
        m.text = String(c.text?.body ?? c.interactive?.body?.text ?? "");
      }
      return m;
    });

    res.json({ success: true, messages });
  } catch (err) {
    console.log("webchat messages error:", err);
    res.status(500).json({ success: false, msg: "Something went wrong" });
  }
});

// ── GET /widget.js → self-contained loader ─────────────────────────────────
router.get("/widget.js", (req, res) => {
  openCors(res);
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(LOADER);
});

const WA_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ffffff" width="100%" height="100%"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';
const CHAT_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ffffff" width="100%" height="100%"><path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2zm-3 11H7v-2h10v2zm0-4H7V7h10v2z"/></svg>';
const CLOSE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ffffff" width="100%" height="100%"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

const LOADER = `(function () {
  try {
    var WA_SVG = ${JSON.stringify(WA_SVG)};
    var CHAT_SVG = ${JSON.stringify(CHAT_SVG)};
    var CLOSE_SVG = ${JSON.stringify(CLOSE_SVG)};

    var current = document.currentScript;
    if (!current) {
      var scripts = document.getElementsByTagName('script');
      for (var i = scripts.length - 1; i >= 0; i--) {
        if ((scripts[i].src || '').indexOf('widget.js') !== -1) { current = scripts[i]; break; }
      }
    }
    if (!current) return;
    var src = current.src || '';
    var idMatch = src.match(/[?&]id=([^&]+)/);
    var widgetId = idMatch ? decodeURIComponent(idMatch[1]) : null;
    if (!widgetId) return;
    var origin = src.split('/widget.js')[0];
    var HDRS = { 'ngrok-skip-browser-warning': 'true' };

    fetch(origin + '/api/widget/config/' + encodeURIComponent(widgetId), { headers: HDRS })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.success || !res.data) return;
        if (document.getElementById('wacrm-chat-widget')) return;
        if (res.data.mode === 'live') renderLive(res.data);
        else if (res.data.number) renderWhatsApp(res.data);
      })
      .catch(function () {});

    function sizePx(size) {
      if (typeof size === 'number') return size;
      if (size === 'small') return 48;
      if (size === 'large') return 72;
      return 60;
    }
    function pos(place, gap) {
      gap = gap || '20px';
      if (place === 'bottom-left') return 'bottom:' + gap + ';left:' + gap + ';';
      if (place === 'top-right') return 'top:' + gap + ';right:' + gap + ';';
      if (place === 'top-left') return 'top:' + gap + ';left:' + gap + ';';
      return 'bottom:' + gap + ';right:' + gap + ';';
    }
    function el(tag, cls, text) {
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    }

    // ── Mode 1: click-to-chat button (opens WhatsApp) ──
    function renderWhatsApp(cfg) {
      var dim = sizePx(cfg.size);
      var btn = document.createElement('a');
      btn.id = 'wacrm-chat-widget';
      btn.href = 'https://wa.me/' + cfg.number + (cfg.title ? '?text=' + encodeURIComponent(cfg.title) : '');
      btn.target = '_blank';
      btn.rel = 'noopener noreferrer';
      btn.title = cfg.title || 'Chat on WhatsApp';
      btn.setAttribute('aria-label', btn.title);
      btn.style.cssText = 'position:fixed;' + pos(cfg.place) + 'width:' + dim + 'px;height:' + dim + 'px;border-radius:50%;background:#25D366;box-shadow:0 4px 14px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;z-index:2147483000;transition:transform .2s;text-decoration:none;';
      btn.onmouseenter = function () { btn.style.transform = 'scale(1.08)'; };
      btn.onmouseleave = function () { btn.style.transform = 'scale(1)'; };
      var icon = Math.round(dim * 0.55);
      function glyph() { btn.innerHTML = '<span style="display:block;width:' + icon + 'px;height:' + icon + 'px">' + WA_SVG + '</span>'; }
      if (cfg.logo) {
        var img = document.createElement('img');
        img.src = cfg.logo; img.alt = '';
        img.style.cssText = 'width:' + icon + 'px;height:' + icon + 'px;border-radius:50%;object-fit:cover;';
        img.onerror = glyph;
        btn.appendChild(img);
      } else glyph();
      (document.body || document.documentElement).appendChild(btn);
    }

    // ── Mode 2: live chat window inside the website ──
    function renderLive(cfg) {
      var KEY = 'wacrm_wc_' + widgetId;
      var store = {};
      try { store = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
      function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
      if (!store.visitorId || !/^[A-Za-z0-9]{16,40}$/.test(store.visitorId)) {
        var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', id = '';
        var rnd = (window.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(24)) : null;
        for (var k = 0; k < 24; k++) id += chars[(rnd ? rnd[k] : Math.floor(Math.random() * 4294967296)) % chars.length];
        store.visitorId = id; store.lastId = 0; save();
      }

      var color = cfg.color || '#008069';
      var dim = sizePx(cfg.size);
      var host = document.createElement('div');
      host.id = 'wacrm-chat-widget';
      host.style.cssText = 'position:fixed;z-index:2147483000;' + pos(cfg.place);
      (document.body || document.documentElement).appendChild(host);
      var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
      var top = cfg.place.indexOf('top') === 0, left = cfg.place.indexOf('left') !== -1;

      var css = el('style');
      css.textContent =
        '*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}' +
        '.fab{width:' + dim + 'px;height:' + dim + 'px;border-radius:50%;border:0;cursor:pointer;background:' + color + ';box-shadow:0 6px 20px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;padding:' + Math.round(dim * 0.24) + 'px;position:relative;transition:transform .2s}' +
        '.fab:hover{transform:scale(1.06)}.fab img{width:100%;height:100%;border-radius:50%;object-fit:cover}' +
        '.badge{position:absolute;top:-2px;right:-2px;min-width:20px;height:20px;border-radius:10px;background:#ef4444;color:#fff;font-size:11px;font-weight:700;display:none;align-items:center;justify-content:center;padding:0 5px;border:2px solid #fff}' +
        '.panel{position:absolute;' + (top ? 'top:' : 'bottom:') + (dim + 14) + 'px;' + (left ? 'left:0;' : 'right:0;') + 'width:370px;height:560px;max-height:calc(100vh - ' + (dim + 50) + 'px);background:#fff;border-radius:18px;box-shadow:0 12px 48px rgba(0,0,0,.22);display:none;flex-direction:column;overflow:hidden;animation:pop .18s ease-out}' +
        '@keyframes pop{from{opacity:0;transform:translateY(' + (top ? '-' : '') + '12px) scale(.98)}to{opacity:1;transform:none}}' +
        '.panel.open{display:flex}' +
        '.hdr{background:' + color + ';color:#fff;padding:14px 14px 14px 16px;display:flex;align-items:center;gap:10px}' +
        '.av{width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.22);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;flex-shrink:0;overflow:hidden}.av img{width:100%;height:100%;object-fit:cover}' +
        '.ht{flex:1;min-width:0}.hn{font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hs{font-size:12px;opacity:.88;display:flex;align-items:center;gap:5px}.dot{width:7px;height:7px;border-radius:50%;background:#4ade80}' +
        '.ib{background:rgba(255,255,255,.16);border:0;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:7px;text-decoration:none}.ib:hover{background:rgba(255,255,255,.28)}' +
        '.body{flex:1;overflow-y:auto;padding:16px 12px;background:#f4f6f8;display:flex;flex-direction:column;gap:8px}' +
        '.row{display:flex}.row.v{justify-content:flex-end}' +
        '.b{max-width:82%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}' +
        '.row.v .b{background:' + color + ';color:#fff;border-bottom-right-radius:4px}.row.r .b{background:#fff;color:#111827;border-bottom-left-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,.08)}' +
        '.b img{max-width:100%;border-radius:10px;display:block;margin-bottom:4px}.b a{color:inherit;text-decoration:underline}.b audio,.b video{max-width:100%}' +
        '.hdt{font-weight:700;margin-bottom:3px}.ft{font-size:12px;opacity:.65;margin-top:5px}' +
        '.opts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.opt{border:1.5px solid ' + color + ';color:' + color + ';background:#fff;border-radius:18px;padding:7px 13px;font-size:13px;font-weight:600;cursor:pointer;text-align:left}.opt:hover{background:' + color + ';color:#fff}.opt:disabled{opacity:.45;cursor:default;background:#fff;color:' + color + '}' +
        '.opt small{display:block;font-weight:400;opacity:.75;font-size:11.5px}' +
        '.typing{display:none;padding:2px 12px 8px;background:#f4f6f8}.typing span{display:inline-block;width:7px;height:7px;margin-right:3px;border-radius:50%;background:#9ca3af;animation:bl 1.2s infinite}.typing span:nth-child(2){animation-delay:.2s}.typing span:nth-child(3){animation-delay:.4s}@keyframes bl{0%,80%,100%{opacity:.3}40%{opacity:1}}' +
        '.foot{display:flex;gap:8px;padding:10px;border-top:1px solid #e5e7eb;background:#fff}' +
        '.in{flex:1;border:1px solid #d1d5db;border-radius:22px;padding:10px 14px;font-size:14px;outline:none;resize:none;max-height:96px;line-height:1.35}.in:focus{border-color:' + color + '}' +
        '.send{width:42px;height:42px;border-radius:50%;border:0;background:' + color + ';color:#fff;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center}.send:disabled{opacity:.5;cursor:default}' +
        '.form{padding:18px 16px;display:flex;flex-direction:column;gap:10px;background:#fff}.form p{margin:0 0 4px;font-size:14px;color:#374151}.form input{border:1px solid #d1d5db;border-radius:10px;padding:10px 12px;font-size:14px;outline:none}.form input:focus{border-color:' + color + '}.form button{border:0;border-radius:10px;padding:11px;background:' + color + ';color:#fff;font-weight:700;font-size:14px;cursor:pointer}' +
        '.err{color:#dc2626;font-size:12px;text-align:center;padding:4px 10px;display:none}' +
        '.pw{text-align:center;font-size:10.5px;color:#9ca3af;padding:0 0 6px;background:#fff}' +
        '@media (max-width:480px){.panel{position:fixed;inset:0;width:100%;height:100%;max-height:none;border-radius:0}}';
      root.appendChild(css);

      // Floating button
      var fab = el('button', 'fab');
      fab.setAttribute('aria-label', 'Open chat');
      var badge = el('span', 'badge');
      function fabIcon(open) {
        fab.innerHTML = '';
        if (!open && cfg.logo) {
          var im = document.createElement('img'); im.src = cfg.logo; im.alt = '';
          im.onerror = function () { fab.innerHTML = CHAT_SVG; fab.appendChild(badge); };
          fab.appendChild(im);
        } else fab.innerHTML = open ? CLOSE_SVG : CHAT_SVG;
        fab.appendChild(badge);
      }
      fabIcon(false);

      // Panel
      var panel = el('div', 'panel');
      panel.setAttribute('role', 'dialog');
      var hdr = el('div', 'hdr');
      var av = el('div', 'av');
      if (cfg.logo) { var ai = document.createElement('img'); ai.src = cfg.logo; ai.alt = ''; ai.onerror = function () { av.textContent = (cfg.botName || 'S').charAt(0).toUpperCase(); }; av.appendChild(ai); }
      else av.textContent = (cfg.botName || 'S').charAt(0).toUpperCase();
      var ht = el('div', 'ht');
      ht.appendChild(el('div', 'hn', cfg.title || 'Chat with us'));
      var hs = el('div', 'hs'); hs.appendChild(el('span', 'dot')); hs.appendChild(document.createTextNode('We reply in a few minutes'));
      ht.appendChild(hs);
      hdr.appendChild(av); hdr.appendChild(ht);
      if (cfg.number) {
        var wa = document.createElement('a'); wa.className = 'ib';
        wa.href = 'https://wa.me/' + cfg.number; wa.target = '_blank'; wa.rel = 'noopener noreferrer';
        wa.title = 'Continue on WhatsApp'; wa.innerHTML = WA_SVG; hdr.appendChild(wa);
      }
      var cls = el('button', 'ib'); cls.title = 'Close'; cls.innerHTML = CLOSE_SVG; hdr.appendChild(cls);
      var body = el('div', 'body');
      var typing = el('div', 'typing'); typing.innerHTML = '<span></span><span></span><span></span>';
      var err = el('div', 'err');
      var foot = el('div', 'foot');
      var input = el('textarea', 'in'); input.rows = 1; input.placeholder = 'Type a message…'; input.maxLength = 2000;
      var send = el('button', 'send'); send.setAttribute('aria-label', 'Send');
      send.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
      foot.appendChild(input); foot.appendChild(send);
      var pw = el('div', 'pw', 'Powered by WhatsCRM');
      panel.appendChild(hdr); panel.appendChild(body); panel.appendChild(typing); panel.appendChild(err);

      // Optional pre-chat form (name + phone)
      var form = null;
      if (cfg.askDetails && !store.name) {
        form = el('div', 'form');
        form.appendChild(el('p', '', 'Please share your details so we can help you better.'));
        var fn = el('input'); fn.placeholder = 'Your name'; fn.maxLength = 60;
        var fp = el('input'); fp.placeholder = 'Mobile number'; fp.type = 'tel'; fp.maxLength = 20;
        var fb = el('button', '', 'Start chat');
        form.appendChild(fn); form.appendChild(fp); form.appendChild(fb);
        fb.onclick = function () {
          var n = fn.value.trim(), p = fp.value.replace(/[^\\d+]/g, '');
          if (n.length < 2) { fn.focus(); return; }
          if (p.replace(/\\D/g, '').length < 8) { fp.focus(); return; }
          store.name = n; store.phone = p; save();
          form.parentNode && form.parentNode.removeChild(form);
          panel.insertBefore(foot, pw); input.focus();
          if (!store.lastId) sendText(cfg.startText || 'Hi');
        };
        panel.appendChild(form);
      } else panel.appendChild(foot);
      panel.appendChild(pw);

      root.appendChild(panel); root.appendChild(fab);

      // ── rendering ──
      var seen = {}, lastBusinessOptions = null, opened = false, unread = 0, pollTimer = null, botWaitTimer = null;

      // WhatsApp-style *bold*, _italic_, ~strike~ and clickable links, built
      // with DOM nodes only (never innerHTML) so messages can't inject markup.
      function fmt(parent, text) {
        var re = /(\\*[^*\\n]+\\*|_[^_\\n]+_|~[^~\\n]+~|https?:\\/\\/[^\\s<]+)/g, last = 0, mt;
        while ((mt = re.exec(text))) {
          if (mt.index > last) parent.appendChild(document.createTextNode(text.slice(last, mt.index)));
          var t = mt[0], node;
          if (t.charAt(0) === 'h') {
            node = document.createElement('a'); node.href = t; node.target = '_blank'; node.rel = 'noopener noreferrer'; node.textContent = t;
          } else {
            node = document.createElement(t.charAt(0) === '*' ? 'b' : t.charAt(0) === '_' ? 'i' : 's');
            node.textContent = t.slice(1, -1);
          }
          parent.appendChild(node);
          last = mt.index + t.length;
        }
        if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
      }

      function addRow(who, node) {
        var row = el('div', 'row ' + (who === 'visitor' ? 'v' : 'r'));
        row.appendChild(node); body.appendChild(row);
        body.scrollTop = body.scrollHeight;
      }
      function bubble(m) {
        var b = el('div', 'b');
        if (m.type === 'image' && m.url) {
          var im = document.createElement('img'); im.src = m.url; im.alt = ''; im.loading = 'lazy'; b.appendChild(im);
          if (m.text) b.appendChild(document.createTextNode(m.text));
        } else if ((m.type === 'video' || m.type === 'audio') && m.url) {
          var md = document.createElement(m.type); md.src = m.url; md.controls = true; b.appendChild(md);
          if (m.text) b.appendChild(el('div', '', m.text));
        } else if (m.type === 'document' && m.url) {
          var a = document.createElement('a'); a.href = m.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
          a.textContent = '📄 ' + (m.filename || 'Open document'); b.appendChild(a);
          if (m.text) b.appendChild(el('div', '', m.text));
        } else {
          if (m.header) b.appendChild(el('div', 'hdt', m.header));
          fmt(b, m.text || '');
          if (m.footer) b.appendChild(el('div', 'ft', m.footer));
        }
        if (m.type === 'options' && m.options && m.options.length) {
          var box = el('div', 'opts');
          m.options.forEach(function (o) {
            var ob = el('button', 'opt', o.title);
            if (o.description) ob.appendChild(el('small', '', o.description));
            ob.onclick = function () {
              box.querySelectorAll('button').forEach(function (x) { x.disabled = true; });
              sendText(o.title);
            };
            box.appendChild(ob);
          });
          b.appendChild(box);
          if (lastBusinessOptions) lastBusinessOptions.querySelectorAll('button').forEach(function (x) { x.disabled = true; });
          lastBusinessOptions = box;
        }
        return b;
      }
      function render(m) {
        if (seen[m.id]) return;
        seen[m.id] = 1;
        if (m.from === 'visitor') { var p = body.querySelector('[data-pending]'); if (p) { p.parentNode.parentNode.removeChild(p.parentNode); } }
        addRow(m.from, bubble(m));
        if (m.from === 'business') {
          typing.style.display = 'none';
          if (!opened) { unread++; badge.textContent = unread > 9 ? '9+' : String(unread); badge.style.display = 'flex'; }
        }
      }

      // Welcome message (local only)
      if (cfg.welcome) addRow('business', bubble({ type: 'text', text: cfg.welcome }));

      function poll() {
        fetch(origin + '/api/widget/chat/' + encodeURIComponent(widgetId) + '/messages?visitorId=' + store.visitorId + '&after=' + (store.lastId || 0), { headers: HDRS })
          .then(function (r) { return r.json(); })
          .then(function (res) {
            if (!res || !res.success) return;
            (res.messages || []).forEach(function (m) { render(m); if (m.id > (store.lastId || 0)) store.lastId = m.id; });
            if ((res.messages || []).length) save();
          })
          .catch(function () {});
      }
      function schedule() {
        clearTimeout(pollTimer);
        if (document.hidden) { pollTimer = setTimeout(schedule, 5000); return; }
        // Visitors who never chatted don't poll until they open the window.
        if (!opened && !store.lastId && !store.sent) return;
        poll();
        pollTimer = setTimeout(schedule, opened ? 2500 : 15000);
      }

      function sendText(text) {
        text = String(text || '').trim();
        if (!text) return;
        err.style.display = 'none';
        var b = el('div', 'b', text); b.setAttribute('data-pending', '1'); b.style.opacity = '.7';
        addRow('visitor', b);
        input.value = ''; send.disabled = true;
        if (!store.sent) { store.sent = 1; save(); }
        typing.style.display = 'block';
        clearTimeout(botWaitTimer);
        botWaitTimer = setTimeout(function () { typing.style.display = 'none'; }, 15000);
        fetch(origin + '/api/widget/chat/' + encodeURIComponent(widgetId) + '/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
          body: JSON.stringify({ visitorId: store.visitorId, text: text, name: store.name || '', phone: store.phone || '' })
        })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (x) {
            send.disabled = false;
            if (!x.ok || !x.j.success) throw new Error((x.j && x.j.msg) || 'Message not sent');
            setTimeout(poll, 700); setTimeout(poll, 2000);
          })
          .catch(function (e) {
            send.disabled = false; typing.style.display = 'none';
            b.style.opacity = '1'; b.style.background = '#fee2e2'; b.style.color = '#991b1b';
            err.textContent = (e && e.message) || 'Message not sent. Please try again.'; err.style.display = 'block';
          });
      }

      function toggle(open) {
        opened = open;
        panel.classList.toggle('open', open);
        fabIcon(open);
        if (open) { unread = 0; badge.style.display = 'none'; setTimeout(function () { (form ? form.querySelector('input') : input).focus(); }, 50); body.scrollTop = body.scrollHeight; }
        schedule();
      }
      fab.onclick = function () { toggle(!opened); };
      cls.onclick = function () { toggle(false); };
      send.onclick = function () { sendText(input.value); };
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(input.value); } });
      input.addEventListener('input', function () { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 96) + 'px'; });
      document.addEventListener('visibilitychange', function () { if (!document.hidden) schedule(); });

      // Load history for returning visitors, then poll.
      var lastSeen = store.lastId || 0; store.lastId = 0;
      fetch(origin + '/api/widget/chat/' + encodeURIComponent(widgetId) + '/messages?visitorId=' + store.visitorId + '&after=0', { headers: HDRS })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          (res && res.messages || []).forEach(function (m) {
            render(m);
            if (m.id > store.lastId) store.lastId = m.id;
          });
          // Messages that arrived while the visitor was away count as unread.
          unread = (res && res.messages || []).filter(function (m) { return m.from === 'business' && m.id > lastSeen; }).length;
          if (unread) { badge.textContent = unread > 9 ? '9+' : String(unread); badge.style.display = 'flex'; }
          typing.style.display = 'none';
          save();
        })
        .catch(function () { store.lastId = lastSeen; })
        .then(function () { pollTimer = setTimeout(schedule, 15000); });
    }
  } catch (e) { /* never break the host page */ }
})();`;

module.exports = router;
