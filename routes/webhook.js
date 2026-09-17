/**
 * Webhook Management Routes — /api/webhook
 *
 * Tables (auto-created on first request):
 *   user_webhooks  — one row per webhook endpoint the user defines
 *   webhook_logs   — one row per incoming call to that endpoint
 */

const router = require("express").Router();
const { query } = require("../database/dbpromise");
const validateUser = require("../middlewares/user");
const { checkPlan, checkWebhook } = require("../middlewares/plan");
const crypto = require("crypto");

// ─── Table bootstrap ──────────────────────────────────────────────────────────
async function ensureTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS user_webhooks (
      id          INT(11) NOT NULL AUTO_INCREMENT,
      uid         VARCHAR(255) NOT NULL,
      webhook_id  VARCHAR(64)  NOT NULL,
      name        VARCHAR(255) NOT NULL,
      description TEXT         DEFAULT NULL,
      events      TEXT         DEFAULT NULL,   -- JSON array e.g. ["message","button_reply"]
      secret      VARCHAR(128) DEFAULT NULL,   -- HMAC secret for payload signing
      active      TINYINT(1)   DEFAULT 1,
      headers_json TEXT        DEFAULT NULL,   -- custom headers to forward
      createdAt   DATETIME     DEFAULT CURRENT_TIMESTAMP,
      updatedAt   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY webhook_id (webhook_id),
      KEY uid_idx (uid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS webhook_logs (
      id          INT(11) NOT NULL AUTO_INCREMENT,
      uid         VARCHAR(255) NOT NULL,
      webhook_id  VARCHAR(64)  NOT NULL,
      method      VARCHAR(10)  DEFAULT 'POST',
      status_code INT(4)       DEFAULT 200,
      status      VARCHAR(20)  DEFAULT 'success',   -- success | error | pending
      source_ip   VARCHAR(64)  DEFAULT NULL,
      headers_json TEXT        DEFAULT NULL,
      payload     LONGTEXT     DEFAULT NULL,         -- raw request body (JSON string)
      response    TEXT         DEFAULT NULL,
      error_msg   TEXT         DEFAULT NULL,
      duration_ms INT(11)      DEFAULT NULL,
      createdAt   DATETIME     DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY uid_idx (uid),
      KEY webhook_id_idx (webhook_id),
      KEY status_idx (status),
      KEY createdAt_idx (createdAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

// Run once at load time; errors logged but not fatal
ensureTables().catch((e) => console.error("webhook tables bootstrap:", e.message));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function genId() {
  return "wh_" + crypto.randomBytes(10).toString("hex");
}

function safeJson(val) {
  if (!val) return null;
  if (typeof val === "object") return JSON.stringify(val);
  return val;
}

function parseJson(val, fallback = null) {
  if (!val) return fallback;
  if (typeof val === "object") return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

// ─── GET /get_webhooks ────────────────────────────────────────────────────────
router.get("/get_webhooks", validateUser, checkPlan, checkWebhook, async (req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM user_webhooks WHERE uid = ? ORDER BY createdAt DESC`,
      [req.decode.uid]
    );
    const data = rows.map((r) => ({
      ...r,
      events: parseJson(r.events, []),
      headers_json: parseJson(r.headers_json, {}),
    }));
    res.json({ success: true, data });
  } catch (err) {
    console.error("get_webhooks:", err);
    res.json({ success: false, msg: err.message });
  }
});

// ─── POST /add_webhook ────────────────────────────────────────────────────────
router.post("/add_webhook", validateUser, checkPlan, checkWebhook, async (req, res) => {
  try {
    const { name, description = "", events = [], secret = "" } = req.body;
    if (!name?.trim()) return res.json({ success: false, msg: "Name is required" });

    const webhook_id = genId();
    await query(
      `INSERT INTO user_webhooks (uid, webhook_id, name, description, events, secret, active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [req.decode.uid, webhook_id, name.trim(), description, safeJson(events), secret]
    );
    const [row] = await query(`SELECT * FROM user_webhooks WHERE webhook_id = ?`, [webhook_id]);
    res.json({ success: true, msg: "Webhook created", data: { ...row, events: parseJson(row.events, []) } });
  } catch (err) {
    console.error("add_webhook:", err);
    res.json({ success: false, msg: err.message });
  }
});

// ─── POST /update_webhook ─────────────────────────────────────────────────────
router.post("/update_webhook", validateUser, checkPlan, checkWebhook, async (req, res) => {
  try {
    const { webhook_id, name, description, events, secret, active } = req.body;
    if (!webhook_id) return res.json({ success: false, msg: "webhook_id required" });

    const [existing] = await query(
      `SELECT id FROM user_webhooks WHERE webhook_id = ? AND uid = ?`,
      [webhook_id, req.decode.uid]
    );
    if (!existing) return res.json({ success: false, msg: "Webhook not found" });

    const fields = [];
    const vals = [];
    if (name       !== undefined) { fields.push("name = ?");        vals.push(name); }
    if (description!== undefined) { fields.push("description = ?"); vals.push(description); }
    if (events     !== undefined) { fields.push("events = ?");      vals.push(safeJson(events)); }
    if (secret     !== undefined) { fields.push("secret = ?");      vals.push(secret); }
    if (active     !== undefined) { fields.push("active = ?");      vals.push(active ? 1 : 0); }

    if (fields.length === 0) return res.json({ success: false, msg: "Nothing to update" });

    vals.push(webhook_id, req.decode.uid);
    await query(
      `UPDATE user_webhooks SET ${fields.join(", ")} WHERE webhook_id = ? AND uid = ?`,
      vals
    );
    const [row] = await query(`SELECT * FROM user_webhooks WHERE webhook_id = ?`, [webhook_id]);
    res.json({ success: true, msg: "Updated", data: { ...row, events: parseJson(row.events, []) } });
  } catch (err) {
    console.error("update_webhook:", err);
    res.json({ success: false, msg: err.message });
  }
});

// ─── POST /toggle_webhook ─────────────────────────────────────────────────────
router.post("/toggle_webhook", validateUser, checkPlan, checkWebhook, async (req, res) => {
  try {
    const { webhook_id } = req.body;
    if (!webhook_id) return res.json({ success: false, msg: "webhook_id required" });
    const [row] = await query(
      `SELECT id, active FROM user_webhooks WHERE webhook_id = ? AND uid = ?`,
      [webhook_id, req.decode.uid]
    );
    if (!row) return res.json({ success: false, msg: "Not found" });
    const newActive = row.active === 1 ? 0 : 1;
    await query(`UPDATE user_webhooks SET active = ? WHERE webhook_id = ?`, [newActive, webhook_id]);
    res.json({ success: true, active: newActive });
  } catch (err) {
    res.json({ success: false, msg: err.message });
  }
});

// ─── POST /delete_webhook ─────────────────────────────────────────────────────
router.post("/delete_webhook", validateUser, checkPlan, checkWebhook, async (req, res) => {
  try {
    const { webhook_id } = req.body;
    if (!webhook_id) return res.json({ success: false, msg: "webhook_id required" });
    await query(
      `DELETE FROM user_webhooks WHERE webhook_id = ? AND uid = ?`,
      [webhook_id, req.decode.uid]
    );
    // Also clean up logs
    await query(`DELETE FROM webhook_logs WHERE webhook_id = ? AND uid = ?`, [webhook_id, req.decode.uid]);
    res.json({ success: true, msg: "Deleted" });
  } catch (err) {
    res.json({ success: false, msg: err.message });
  }
});

// ─── POST /webhook/:webhook_id  (incoming payload from external system) ───────
// GET  /webhook/:webhook_id  (some systems use GET for ping/verification)
async function handleIncoming(req, res) {
  const start = Date.now();
  const { webhook_id } = req.params;
  try {
    const [wh] = await query(
      `SELECT * FROM user_webhooks WHERE webhook_id = ? AND active = 1`,
      [webhook_id]
    );
    if (!wh) {
      return res.status(404).json({ success: false, msg: "Webhook not found or inactive" });
    }

    // Optional HMAC signature verification
    if (wh.secret) {
      const sig = req.headers["x-webhook-signature"] || req.headers["x-hub-signature-256"] || "";
      const expected = "sha256=" + crypto.createHmac("sha256", wh.secret).update(JSON.stringify(req.body)).digest("hex");
      if (sig && sig !== expected) {
        await query(
          `INSERT INTO webhook_logs (uid, webhook_id, method, status_code, status, source_ip, headers_json, payload, error_msg, duration_ms)
           VALUES (?, ?, ?, 401, 'error', ?, ?, ?, 'Invalid signature', ?)`,
          [wh.uid, webhook_id, req.method, req.ip, safeJson(req.headers), safeJson(req.body), Date.now() - start]
        );
        return res.status(401).json({ success: false, msg: "Invalid signature" });
      }
    }

    const payload = safeJson(req.body);
    const duration = Date.now() - start;

    await query(
      `INSERT INTO webhook_logs (uid, webhook_id, method, status_code, status, source_ip, headers_json, payload, response, duration_ms)
       VALUES (?, ?, ?, 200, 'success', ?, ?, ?, 'OK', ?)`,
      [wh.uid, webhook_id, req.method, req.ip, safeJson(req.headers), payload, duration]
    );

    res.json({ success: true, msg: "Received", webhook_id });
  } catch (err) {
    console.error("incoming webhook:", err);
    await query(
      `INSERT INTO webhook_logs (uid, webhook_id, method, status_code, status, source_ip, payload, error_msg, duration_ms)
       VALUES (?, ?, ?, 500, 'error', ?, ?, ?, ?)`,
      [null, webhook_id, req.method, req.ip, safeJson(req.body), err.message, Date.now() - start]
    ).catch(() => {});
    res.status(500).json({ success: false, msg: "Internal error" });
  }
}

router.post("/webhook/:webhook_id", handleIncoming);
router.get("/webhook/:webhook_id",  handleIncoming);

// ─── GET /get_webhook_logs ────────────────────────────────────────────────────
router.get("/get_webhook_logs", validateUser, checkPlan, checkWebhook, async (req, res) => {
  try {
    const {
      webhook_id,
      status,
      page = 1,
      limit = 20,
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit)));
    const offset   = (pageNum - 1) * pageSize;

    let where = "uid = ?";
    const params = [req.decode.uid];

    if (webhook_id) { where += " AND webhook_id = ?"; params.push(webhook_id); }
    if (status)     { where += " AND status = ?";     params.push(status); }

    const [{ total }] = await query(
      `SELECT COUNT(*) AS total FROM webhook_logs WHERE ${where}`,
      params
    );

    const rows = await query(
      `SELECT id, webhook_id, method, status_code, status, source_ip, duration_ms, error_msg, createdAt
       FROM webhook_logs WHERE ${where}
       ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: Number(total),
        page: pageNum,
        limit: pageSize,
        totalPages: Math.ceil(Number(total) / pageSize),
      },
    });
  } catch (err) {
    console.error("get_webhook_logs:", err);
    res.json({ success: false, msg: err.message });
  }
});

// ─── GET /get_webhook_log/:id  (full payload for a single log entry) ──────────
router.get("/get_webhook_log/:id", validateUser, checkPlan, checkWebhook, async (req, res) => {
  try {
    const [row] = await query(
      `SELECT * FROM webhook_logs WHERE id = ? AND uid = ?`,
      [req.params.id, req.decode.uid]
    );
    if (!row) return res.json({ success: false, msg: "Not found" });
    res.json({ success: true, data: { ...row, headers_json: parseJson(row.headers_json, {}), payload: parseJson(row.payload, {}) } });
  } catch (err) {
    res.json({ success: false, msg: err.message });
  }
});

// ─── POST /delete_webhook_logs ────────────────────────────────────────────────
router.post("/delete_webhook_logs", validateUser, checkPlan, checkWebhook, async (req, res) => {
  try {
    const { webhook_id, ids } = req.body;
    if (ids && Array.isArray(ids) && ids.length > 0) {
      const placeholders = ids.map(() => "?").join(",");
      await query(
        `DELETE FROM webhook_logs WHERE uid = ? AND id IN (${placeholders})`,
        [req.decode.uid, ...ids]
      );
    } else if (webhook_id) {
      await query(
        `DELETE FROM webhook_logs WHERE uid = ? AND webhook_id = ?`,
        [req.decode.uid, webhook_id]
      );
    } else {
      await query(`DELETE FROM webhook_logs WHERE uid = ?`, [req.decode.uid]);
    }
    res.json({ success: true, msg: "Logs cleared" });
  } catch (err) {
    res.json({ success: false, msg: err.message });
  }
});

module.exports = router;
