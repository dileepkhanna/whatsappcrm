/**
 * Web Push Notification Routes — /api/webpush
 *
 * Uses the browser-native Push API (no Firebase/FCM).
 * Depends on `web-push` npm package for VAPID signing.
 *
 * Tables (auto-created):
 *   push_subscriptions  — one row per browser subscription
 *   push_notification_logs — sent notification history
 */
const router = require("express").Router();
const webpush = require("web-push");
const { query } = require("../database/dbpromise");
const validateUser = require("../middlewares/user");
const crypto = require("crypto");

// ─── Auto-create tables ───────────────────────────────────────────────────────
async function ensureTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id            INT(11) NOT NULL AUTO_INCREMENT,
      uid           VARCHAR(255) NOT NULL,
      sub_id        VARCHAR(64)  NOT NULL,
      endpoint      TEXT         NOT NULL,
      p256dh        TEXT         DEFAULT NULL,
      auth          TEXT         DEFAULT NULL,
      user_agent    TEXT         DEFAULT NULL,
      browser       VARCHAR(100) DEFAULT NULL,
      active        TINYINT(1)   DEFAULT 1,
      notify_messages     TINYINT(1) DEFAULT 1,
      notify_broadcasts   TINYINT(1) DEFAULT 1,
      notify_system       TINYINT(1) DEFAULT 1,
      createdAt     DATETIME     DEFAULT CURRENT_TIMESTAMP,
      updatedAt     DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY sub_id (sub_id),
      KEY uid_idx (uid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS push_notification_logs (
      id          INT(11) NOT NULL AUTO_INCREMENT,
      uid         VARCHAR(255) NOT NULL,
      title       VARCHAR(255) NOT NULL,
      body        TEXT         DEFAULT NULL,
      icon        VARCHAR(500) DEFAULT NULL,
      url         VARCHAR(500) DEFAULT NULL,
      total_sent  INT(11)      DEFAULT 0,
      succeeded   INT(11)      DEFAULT 0,
      failed      INT(11)      DEFAULT 0,
      sent_by     VARCHAR(50)  DEFAULT 'system',   -- 'user' | 'system'
      createdAt   DATETIME     DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY uid_idx (uid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Add VAPID columns to web_private only if they don't already exist.
  // Checking information_schema first avoids the noisy "Duplicate column name"
  // (ER_DUP_FIELDNAME) errors that the query helper logs on every boot.
  const addColumnIfMissing = async (column, definition) => {
    try {
      const [row] = await query(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'web_private' AND COLUMN_NAME = ?`,
        [column]
      );
      if (!row || Number(row.cnt) === 0) {
        await query(`ALTER TABLE web_private ADD COLUMN ${column} ${definition}`);
      }
    } catch (e) {
      // Swallow the rare race where the column was added concurrently.
      if (e && e.code !== "ER_DUP_FIELDNAME") {
        console.error(`webpush add column ${column}:`, e.message);
      }
    }
  };

  await addColumnIfMissing("vapid_public_key", "TEXT DEFAULT NULL");
  await addColumnIfMissing("vapid_private_key", "TEXT DEFAULT NULL");
  await addColumnIfMissing("vapid_email", "VARCHAR(255) DEFAULT NULL");
}
ensureTables().catch(e => console.error("webpush tables bootstrap:", e.message));

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function getVapidKeys() {
  const [row] = await query(
    `SELECT vapid_public_key, vapid_private_key, vapid_email FROM web_private LIMIT 1`,
    []
  );
  return row || {};
}

function buildWebpush(vapid) {
  if (!vapid.vapid_public_key || !vapid.vapid_private_key) return null;
  webpush.setVapidDetails(
    `mailto:${vapid.vapid_email || "admin@example.com"}`,
    vapid.vapid_public_key,
    vapid.vapid_private_key
  );
  return webpush;
}

function detectBrowser(ua = "") {
  if (/Edg\//i.test(ua))    return "Edge";
  if (/OPR\//i.test(ua))    return "Opera";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Firefox\//i.test(ua))return "Firefox";
  if (/Safari\//i.test(ua)) return "Safari";
  return "Unknown";
}

// ─── GET /vapid-public-key ────────────────────────────────────────────────────
// Returns the VAPID public key (safe to expose) + auto-generates if not set
router.get("/vapid-public-key", validateUser, async (req, res) => {
  try {
    let vapid = await getVapidKeys();

    // Auto-generate VAPID keys on first call
    if (!vapid.vapid_public_key) {
      const keys = webpush.generateVAPIDKeys();
      await query(
        `UPDATE web_private SET
           vapid_public_key  = ?,
           vapid_private_key = ?,
           vapid_email       = ?
         LIMIT 1`,
        [keys.publicKey, keys.privateKey, "admin@whatscrm.app"]
      );
      vapid = { vapid_public_key: keys.publicKey, vapid_private_key: keys.privateKey };
    }

    res.json({ success: true, publicKey: vapid.vapid_public_key });
  } catch (err) {
    console.error("vapid-public-key:", err);
    res.json({ success: false, msg: err.message });
  }
});

// ─── POST /subscribe ──────────────────────────────────────────────────────────
// Saves a PushSubscription from the browser
router.post("/subscribe", validateUser, async (req, res) => {
  try {
    const { subscription, userAgent } = req.body;
    if (!subscription?.endpoint) return res.json({ success: false, msg: "No subscription" });

    const sub_id = crypto.createHash("sha256").update(subscription.endpoint).digest("hex").slice(0, 32);
    const browser = detectBrowser(userAgent || "");

    const exists = await query(`SELECT id FROM push_subscriptions WHERE sub_id = ?`, [sub_id]);
    if (exists.length > 0) {
      await query(
        `UPDATE push_subscriptions SET
           endpoint = ?, p256dh = ?, auth = ?, user_agent = ?, browser = ?, active = 1, uid = ?
         WHERE sub_id = ?`,
        [
          subscription.endpoint,
          subscription.keys?.p256dh || null,
          subscription.keys?.auth || null,
          userAgent || null,
          browser,
          req.decode.uid,
          sub_id
        ]
      );
    } else {
      await query(
        `INSERT INTO push_subscriptions
           (uid, sub_id, endpoint, p256dh, auth, user_agent, browser)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          req.decode.uid,
          sub_id,
          subscription.endpoint,
          subscription.keys?.p256dh || null,
          subscription.keys?.auth || null,
          userAgent || null,
          browser
        ]
      );
    }

    res.json({ success: true, sub_id });
  } catch (err) {
    console.error("subscribe:", err);
    res.json({ success: false, msg: err.message });
  }
});

// ─── POST /unsubscribe ────────────────────────────────────────────────────────
router.post("/unsubscribe", validateUser, async (req, res) => {
  try {
    const { endpoint, sub_id } = req.body;
    if (sub_id) {
      await query(`DELETE FROM push_subscriptions WHERE sub_id = ? AND uid = ?`, [sub_id, req.decode.uid]);
    } else if (endpoint) {
      const id = crypto.createHash("sha256").update(endpoint).digest("hex").slice(0, 32);
      await query(`DELETE FROM push_subscriptions WHERE sub_id = ? AND uid = ?`, [id, req.decode.uid]);
    }
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, msg: err.message });
  }
});

// ─── GET /my-subscriptions ────────────────────────────────────────────────────
router.get("/my-subscriptions", validateUser, async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, sub_id, browser, user_agent, active,
              notify_messages, notify_broadcasts, notify_system, createdAt
       FROM push_subscriptions WHERE uid = ? ORDER BY createdAt DESC`,
      [req.decode.uid]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.json({ success: false, msg: err.message });
  }
});

// ─── POST /update-preferences ─────────────────────────────────────────────────
router.post("/update-preferences", validateUser, async (req, res) => {
  try {
    const { sub_id, notify_messages, notify_broadcasts, notify_system } = req.body;
    if (!sub_id) return res.json({ success: false, msg: "sub_id required" });

    await query(
      `UPDATE push_subscriptions
         SET notify_messages = ?, notify_broadcasts = ?, notify_system = ?
       WHERE sub_id = ? AND uid = ?`,
      [notify_messages ? 1 : 0, notify_broadcasts ? 1 : 0, notify_system ? 1 : 0, sub_id, req.decode.uid]
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, msg: err.message });
  }
});

// ─── POST /send-test ──────────────────────────────────────────────────────────
router.post("/send-test", validateUser, async (req, res) => {
  try {
    const vapid = await getVapidKeys();
    const wp = buildWebpush(vapid);
    if (!wp) return res.json({ success: false, msg: "VAPID keys not configured" });

    const subs = await query(
      `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE uid = ? AND active = 1`,
      [req.decode.uid]
    );

    if (subs.length === 0) return res.json({ success: false, msg: "No active subscriptions found" });

    const payload = JSON.stringify({
      title: "🔔 Test Notification",
      body:  "Web push is working! You'll receive real-time alerts here.",
      icon:  "/favicon.svg",
      url:   "/user/dashboard",
    });

    let succeeded = 0, failed = 0;
    for (const sub of subs) {
      try {
        await wp.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        succeeded++;
      } catch (e) {
        failed++;
        if (e.statusCode === 410 || e.statusCode === 404) {
          // Subscription expired — mark inactive
          await query(
            `UPDATE push_subscriptions SET active = 0 WHERE endpoint = ?`,
            [sub.endpoint]
          );
        }
      }
    }

    res.json({ success: true, msg: `Test sent — ${succeeded} delivered, ${failed} failed`, succeeded, failed });
  } catch (err) {
    console.error("send-test:", err);
    res.json({ success: false, msg: err.message });
  }
});

// ─── POST /send-notification ──────────────────────────────────────────────────
// Send to all subscriptions for the current user (or target uid for system use)
router.post("/send-notification", validateUser, async (req, res) => {
  try {
    const vapid = await getVapidKeys();
    const wp = buildWebpush(vapid);
    if (!wp) return res.json({ success: false, msg: "VAPID not configured" });

    const { title, body, icon, url } = req.body;
    if (!title) return res.json({ success: false, msg: "Title is required" });

    const subs = await query(
      `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE uid = ? AND active = 1 AND notify_system = 1`,
      [req.decode.uid]
    );

    const payload = JSON.stringify({ title, body: body || "", icon: icon || "/favicon.svg", url: url || "/" });
    let succeeded = 0, failed = 0;

    for (const sub of subs) {
      try {
        await wp.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        succeeded++;
      } catch (e) {
        failed++;
        if (e.statusCode === 410 || e.statusCode === 404) {
          await query(`UPDATE push_subscriptions SET active = 0 WHERE endpoint = ?`, [sub.endpoint]);
        }
      }
    }

    // Log it
    await query(
      `INSERT INTO push_notification_logs (uid, title, body, icon, url, total_sent, succeeded, failed, sent_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.decode.uid, title, body || "", icon || "", url || "", subs.length, succeeded, failed, "user"]
    );

    res.json({ success: true, succeeded, failed, total: subs.length });
  } catch (err) {
    console.error("send-notification:", err);
    res.json({ success: false, msg: err.message });
  }
});

// ─── GET /notification-logs ───────────────────────────────────────────────────
router.get("/notification-logs", validateUser, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || "1"));
    const limit = Math.min(50, parseInt(req.query.limit || "20"));
    const offset = (page - 1) * limit;

    const [{ total }] = await query(
      `SELECT COUNT(*) AS total FROM push_notification_logs WHERE uid = ?`,
      [req.decode.uid]
    );
    const rows = await query(
      `SELECT * FROM push_notification_logs WHERE uid = ?
       ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
      [req.decode.uid, limit, offset]
    );

    res.json({
      success: true, data: rows,
      pagination: { total: Number(total), page, limit, totalPages: Math.ceil(Number(total) / limit) }
    });
  } catch (err) {
    res.json({ success: false, msg: err.message });
  }
});

// ─── Exported helper: send push to any uid (called by inbox pipeline) ─────────
async function sendPushToUser({ uid, title, body, icon, url, type = "notify_messages" }) {
  try {
    const vapid = await getVapidKeys();
    const wp = buildWebpush(vapid);
    if (!wp) return;

    const typeCol = ["notify_messages", "notify_broadcasts", "notify_system"].includes(type)
      ? type : "notify_messages";

    const subs = await query(
      `SELECT endpoint, p256dh, auth FROM push_subscriptions
       WHERE uid = ? AND active = 1 AND \`${typeCol}\` = 1`,
      [uid]
    );

    if (!subs.length) return;

    const payload = JSON.stringify({ title, body: body || "", icon: icon || "/favicon.svg", url: url || "/" });
    for (const sub of subs) {
      try {
        await wp.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (e) {
        if (e.statusCode === 410 || e.statusCode === 404) {
          await query(`UPDATE push_subscriptions SET active = 0 WHERE endpoint = ?`, [sub.endpoint]);
        }
      }
    }
  } catch (err) {
    console.error("sendPushToUser:", err.message);
  }
}

module.exports = router;
module.exports.sendPushToUser = sendPushToUser;
