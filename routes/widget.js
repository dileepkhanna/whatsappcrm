const router = require("express").Router();
const { query } = require("../database/dbpromise.js");

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC Chat Widget endpoints.
//
// These are intentionally UN-authenticated and CORS-open because they are
// loaded by the <script src=".../widget.js?id=..."> tag on the customer's
// own website (a different origin). They only expose non-sensitive display
// config (title, number, position, size, logo) for a single widget id.
// ─────────────────────────────────────────────────────────────────────────────

function openCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, ngrok-skip-browser-warning",
  );
}

// GET /api/widget/config/:uniqueId  → JSON config for one widget
router.get("/api/widget/config/:uniqueId", async (req, res) => {
  openCors(res);
  try {
    const { uniqueId } = req.params;
    const [w] = await query(
      `SELECT unique_id, title, whatsapp_number, logo, place, size FROM chat_widget WHERE unique_id = ? LIMIT 1`,
      [uniqueId],
    );

    if (!w) {
      return res.status(404).json({ success: false, msg: "Widget not found" });
    }

    // Build an absolute logo URL if a logo filename is stored.
    let logoUrl = null;
    if (w.logo) {
      logoUrl = /^https?:\/\//i.test(w.logo)
        ? w.logo
        : `${req.protocol}://${req.get("host")}/media/${w.logo}`;
    }

    res.json({
      success: true,
      data: {
        title: w.title || "Chat with us",
        number: String(w.whatsapp_number || "").replace(/[^\d]/g, ""),
        place: w.place || "bottom-right",
        size: w.size || "medium",
        logo: logoUrl,
      },
    });
  } catch (err) {
    console.log("widget config error:", err);
    res.status(500).json({ success: false, msg: "Something went wrong" });
  }
});

// Preflight for the config endpoint.
router.options("/api/widget/config/:uniqueId", (req, res) => {
  openCors(res);
  res.sendStatus(204);
});

// GET /widget.js  → self-contained loader served as JavaScript.
// It reads its own ?id=, fetches the config, and injects a floating
// WhatsApp button that opens wa.me/<number>.
router.get("/widget.js", (req, res) => {
  openCors(res);
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  // Short cache so config/style changes propagate reasonably fast.
  res.setHeader("Cache-Control", "public, max-age=300");

  const script = `(function () {
  try {
    // Find our own <script> tag to read the ?id= param and derive the origin.
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

    // The "ngrok-skip-browser-warning" header makes ngrok's free tier return
    // the real JSON instead of its interstitial HTML warning page. It's
    // harmless on real domains (just an unknown header).
    fetch(origin + '/api/widget/config/' + encodeURIComponent(widgetId), {
      headers: { 'ngrok-skip-browser-warning': 'true' }
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.success || !res.data || !res.data.number) return;
        renderWidget(res.data, origin);
      })
      .catch(function () {});

    function sizePx(size) {
      if (size === 'small') return 48;
      if (size === 'large') return 72;
      return 60; // medium
    }

    function positionStyle(place) {
      var gap = '20px';
      switch (place) {
        case 'bottom-left':  return 'bottom:' + gap + ';left:' + gap + ';';
        case 'top-right':    return 'top:' + gap + ';right:' + gap + ';';
        case 'top-left':     return 'top:' + gap + ';left:' + gap + ';';
        default:             return 'bottom:' + gap + ';right:' + gap + ';';
      }
    }

    function renderWidget(cfg, origin) {
      if (document.getElementById('wacrm-chat-widget')) return; // avoid duplicates

      var dim = sizePx(cfg.size);
      var waUrl = 'https://wa.me/' + cfg.number;

      var btn = document.createElement('a');
      btn.id = 'wacrm-chat-widget';
      btn.href = waUrl;
      btn.target = '_blank';
      btn.rel = 'noopener noreferrer';
      btn.setAttribute('aria-label', cfg.title || 'Chat on WhatsApp');
      btn.title = cfg.title || 'Chat on WhatsApp';

      btn.style.cssText = [
        'position:fixed',
        positionStyle(cfg.place),
        'width:' + dim + 'px',
        'height:' + dim + 'px',
        'border-radius:50%',
        'background:#25D366',
        'box-shadow:0 4px 14px rgba(0,0,0,0.25)',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'cursor:pointer',
        'z-index:2147483000',
        'transition:transform .2s ease, box-shadow .2s ease',
        'text-decoration:none'
      ].join(';');

      btn.onmouseenter = function () { btn.style.transform = 'scale(1.08)'; };
      btn.onmouseleave = function () { btn.style.transform = 'scale(1)'; };

      var iconSize = Math.round(dim * 0.55);
      if (cfg.logo) {
        var img = document.createElement('img');
        img.src = cfg.logo;
        img.alt = '';
        img.style.cssText = 'width:' + iconSize + 'px;height:' + iconSize + 'px;border-radius:50%;object-fit:cover;';
        btn.appendChild(img);
      } else {
        // Inline WhatsApp glyph (white) so no external asset is needed.
        btn.innerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" width="' + iconSize + '" height="' + iconSize +
          '" viewBox="0 0 24 24" fill="#ffffff">' +
          '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>' +
          '</svg>';
      }

      (document.body || document.documentElement).appendChild(btn);
    }
  } catch (e) { /* fail silently on the host page */ }
})();`;

  res.send(script);
});

module.exports = router;
