/**
 * AI Settings Routes — /api/ai_settings
 * Stores per-user AI Flow Builder credentials (provider, model, API key)
 * so users don't have to re-enter them every time.
 *
 * Table (auto-created): ai_flow_settings
 */
const router = require("express").Router();
const { query } = require("../database/dbpromise");
const validateUser = require("../middlewares/user");

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS ai_flow_settings (
      id           INT(11) NOT NULL AUTO_INCREMENT,
      uid          VARCHAR(255) NOT NULL,
      provider     VARCHAR(50)  DEFAULT 'openrouter',
      model        VARCHAR(255) DEFAULT NULL,
      custom_model VARCHAR(255) DEFAULT NULL,
      api_key      TEXT         DEFAULT NULL,
      createdAt    DATETIME     DEFAULT CURRENT_TIMESTAMP,
      updatedAt    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uid (uid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
ensureTable().catch((e) => console.error("ai_flow_settings bootstrap:", e.message));

// ─── GET /get ─────────────────────────────────────────────────────────────────
router.get("/get", validateUser, async (req, res) => {
  try {
    const [row] = await query(
      `SELECT provider, model, custom_model, api_key FROM ai_flow_settings WHERE uid = ?`,
      [req.decode.uid]
    );
    res.json({
      success: true,
      data: row || { provider: "openrouter", model: "", custom_model: "", api_key: "" },
    });
  } catch (err) {
    console.error("ai_settings get:", err);
    res.json({ success: false, msg: err.message });
  }
});

// ─── POST /save ───────────────────────────────────────────────────────────────
router.post("/save", validateUser, async (req, res) => {
  try {
    const { provider, model, custom_model, api_key } = req.body;

    const exists = await query(`SELECT id FROM ai_flow_settings WHERE uid = ?`, [req.decode.uid]);
    if (exists.length > 0) {
      await query(
        `UPDATE ai_flow_settings SET provider = ?, model = ?, custom_model = ?, api_key = ? WHERE uid = ?`,
        [provider || "openrouter", model || "", custom_model || "", api_key || "", req.decode.uid]
      );
    } else {
      await query(
        `INSERT INTO ai_flow_settings (uid, provider, model, custom_model, api_key) VALUES (?, ?, ?, ?, ?)`,
        [req.decode.uid, provider || "openrouter", model || "", custom_model || "", api_key || ""]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error("ai_settings save:", err);
    res.json({ success: false, msg: err.message });
  }
});

// ─── POST /clear ──────────────────────────────────────────────────────────────
router.post("/clear", validateUser, async (req, res) => {
  try {
    await query(`DELETE FROM ai_flow_settings WHERE uid = ?`, [req.decode.uid]);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, msg: err.message });
  }
});

module.exports = router;
