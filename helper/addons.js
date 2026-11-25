/**
 * Plan add-ons.
 *
 * A plan row with plan_type = 'addon' is bought on top of a base plan. Its
 * permissions are folded INTO user.plan (the snapshot many parts of the app read
 * directly), so every existing feature check keeps working unchanged:
 *
 *   user.plan = { ...baseFlagsWithAddonsMerged, _base: {original base}, _addons: [{id,title,expires}] }
 *
 * Rows in user_addons are the source of truth for what is active and until when.
 * NOTE: do not require functions/function.js here (it requires this file lazily).
 */
const { query } = require("../database/dbpromise.js");

const BOOL_FLAGS = [
  "allow_tag", "allow_note", "allow_chatbot", "allow_api", "wa_warmer", "rest_api_qr",
  "instagram_inbox", "telegram_inbox", "allow_wa_forms", "allow_wa_call", "allow_webhook",
  "allow_chat_widget", "allow_agents", "allow_ai_voice",
];
// numeric limits that add up (base + every active add-on)
const SUM_FLAGS = ["contact_limit", "qr_account", "ai_voice_minutes"];
const META_KEYS = ["_base", "_addons"];

let ensurePromise = null;
function ensureAddonTables() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const cols = await query(`SHOW COLUMNS FROM plan LIKE 'plan_type'`, []);
      if (cols.length === 0) {
        await query(`ALTER TABLE plan ADD COLUMN plan_type varchar(20) NOT NULL DEFAULT 'base'`, []);
      }
      // Enterprise / "talk to sales" plans: no online checkout, sales activates them.
      const pm = await query(`SHOW COLUMNS FROM plan LIKE 'pricing_mode'`, []);
      if (pm.length === 0) {
        await query(`ALTER TABLE plan ADD COLUMN pricing_mode varchar(20) NOT NULL DEFAULT 'fixed'`, []);
      }
      const sc = await query(`SHOW COLUMNS FROM plan LIKE 'sales_contact'`, []);
      if (sc.length === 0) {
        await query(`ALTER TABLE plan ADD COLUMN sales_contact varchar(255) DEFAULT NULL`, []);
      }
      // Free-text content for the Enterprise card (tagline, feature list, rates box).
      for (const [col, def] of [
        ["tagline", "varchar(255) DEFAULT NULL"],
        ["custom_features", "text DEFAULT NULL"],
        ["rates_title", "varchar(100) DEFAULT NULL"],
        ["rate_rows", "text DEFAULT NULL"],
      ]) {
        const exists = await query(`SHOW COLUMNS FROM plan LIKE '${col}'`, []);
        if (exists.length === 0) {
          await query(`ALTER TABLE plan ADD COLUMN ${col} ${def}`, []);
        }
      }
      await query(
        `CREATE TABLE IF NOT EXISTS user_addons (
          id int(11) NOT NULL AUTO_INCREMENT,
          uid varchar(255) NOT NULL,
          plan_id int(11) NOT NULL,
          title varchar(255) DEFAULT NULL,
          plan_snapshot longtext DEFAULT NULL,
          expires_at datetime NOT NULL,
          createdAt datetime DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_uid (uid, expires_at),
          KEY idx_plan (plan_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        [],
      );
    })().catch((e) => {
      ensurePromise = null;
      throw e;
    });
  }
  return ensurePromise;
}

const parse = (raw) => {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const stripMeta = (obj) => {
  const out = { ...obj };
  for (const k of META_KEYS) delete out[k];
  return out;
};

/** The original base plan inside a (possibly merged) snapshot. */
function baseOf(snapshot) {
  if (!snapshot) return null;
  return snapshot._base ? { ...snapshot._base } : stripMeta(snapshot);
}

/** Pure: fold add-on plan rows into a base plan object. */
function mergeAddons(base, addonPlans) {
  const out = { ...base };
  for (const a of addonPlans) {
    for (const f of BOOL_FLAGS) {
      if (Number(a[f]) > 0) out[f] = 1;
    }
    for (const f of SUM_FLAGS) {
      out[f] = (Number(out[f]) || 0) + (Number(a[f]) || 0);
    }
  }
  return out;
}

const mysqlDate = (d) => d.toISOString().slice(0, 19).replace("T", " ");

/** Active add-on rows for a user, each with the best available plan data. */
async function getActiveAddons(uid) {
  await ensureAddonTables();
  const rows = await query(`SELECT * FROM user_addons WHERE uid = ? AND expires_at > NOW()`, [uid]);
  if (!rows.length) return [];
  const ids = [...new Set(rows.map((r) => r.plan_id))];
  const live = await query(`SELECT * FROM plan WHERE id IN (?)`, [ids]);
  return rows.map((r) => ({
    row: r,
    plan: live.find((p) => p.id === r.plan_id) || parse(r.plan_snapshot) || {},
  }));
}

/** Recompute user.plan from its base plan + currently active add-ons. */
async function recomputeUserPlan(uid) {
  const [user] = await query(`SELECT plan FROM user WHERE uid = ?`, [uid]);
  const raw = parse(user?.plan);
  if (!raw) return;
  const base = baseOf(raw);
  const active = await getActiveAddons(uid);

  let next;
  if (!active.length) {
    next = base;
  } else {
    next = {
      ...mergeAddons(base, active.map((a) => a.plan)),
      _base: base,
      _addons: active.map((a) => ({
        id: a.row.plan_id,
        title: a.row.title,
        expires: new Date(a.row.expires_at).toISOString(),
      })),
    };
  }
  const json = JSON.stringify(next);
  if (json !== (typeof user.plan === "string" ? user.plan : JSON.stringify(user.plan))) {
    await query(`UPDATE user SET plan = ? WHERE uid = ?`, [json, uid]);
  }
}

/**
 * Returns a message when `plan` cannot be bought by `uid`, else null.
 * - "talk to sales" plans cannot be bought online (opts.skipSales lets the admin assign them)
 * - add-ons need an active base plan
 */
async function getAddonBlock(plan, uid, opts = {}) {
  if (plan && plan.pricing_mode === "contact_sales" && !opts.skipSales) {
    return "This plan is available by contacting sales. Please use the Talk to sales button.";
  }
  if (!plan || plan.plan_type !== "addon") return null;
  const [user] = await query(`SELECT plan, plan_expire FROM user WHERE uid = ?`, [uid]);
  const hasBase = !!parse(user?.plan);
  const notExpired = user?.plan_expire && new Date(user.plan_expire).getTime() > Date.now();
  if (!hasBase || !notExpired) {
    return "Add-ons need an active base plan. Please buy or renew a base plan first.";
  }
  return null;
}

/** Activate (or extend) an add-on for a user. Throws if there is no base plan. */
async function activateAddon(plan, uid) {
  await ensureAddonTables();
  const block = await getAddonBlock(plan, uid);
  if (block) throw new Error(block);

  const days = Math.max(1, parseInt(plan.plan_duration_in_days, 10) || 30);
  const [existing] = await query(
    `SELECT id, expires_at FROM user_addons WHERE uid = ? AND plan_id = ? AND expires_at > NOW()
      ORDER BY expires_at DESC LIMIT 1`,
    [uid, plan.id],
  );
  if (existing) {
    await query(`UPDATE user_addons SET expires_at = DATE_ADD(expires_at, INTERVAL ? DAY), title = ?, plan_snapshot = ? WHERE id = ?`, [
      days, plan.title, JSON.stringify(plan), existing.id,
    ]);
  } else {
    await query(
      `INSERT INTO user_addons (uid, plan_id, title, plan_snapshot, expires_at)
       VALUES (?,?,?,?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
      [uid, plan.id, plan.title, JSON.stringify(plan), days],
    );
  }
  await recomputeUserPlan(uid);
}

/** Drop expired add-ons out of user.plan snapshots. */
async function sweepExpired() {
  try {
    await ensureAddonTables();
    const users = await query(`SELECT uid, plan FROM user WHERE plan LIKE '%"_addons"%'`, []);
    const now = Date.now();
    for (const u of users) {
      const p = parse(u.plan);
      const expired = (p?._addons || []).some((a) => new Date(a.expires).getTime() <= now);
      if (expired) await recomputeUserPlan(u.uid);
    }
  } catch (e) {
    console.log("[addons] sweep error:", e.message);
  }
}

let timer = null;
function startSweeper() {
  if (timer) return;
  sweepExpired();
  timer = setInterval(sweepExpired, 10 * 60 * 1000);
  if (timer.unref) timer.unref();
}

module.exports = {
  BOOL_FLAGS,
  SUM_FLAGS,
  ensureAddonTables,
  parse,
  baseOf,
  mergeAddons,
  getActiveAddons,
  recomputeUserPlan,
  getAddonBlock,
  activateAddon,
  sweepExpired,
  startSweeper,
  mysqlDate,
};
