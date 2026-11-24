const jwt = require("jsonwebtoken");
const { query } = require("../database/dbpromise");
const { getNumberOfDaysFromTimestamp } = require("../functions/function");

/**
 * Resolve the EFFECTIVE plan for a user.
 *
 * user.plan is a frozen JSON snapshot taken at subscribe time, so admin edits
 * to a plan's permissions would otherwise never reach existing subscribers.
 * We re-read the live plan row by its id so permission changes apply instantly.
 * Falls back to the stored snapshot if the plan row was deleted.
 */
const resolveEffectivePlan = async (rawPlan) => {
  if (!rawPlan) return null;
  let snapshot;
  try {
    snapshot = typeof rawPlan === "string" ? JSON.parse(rawPlan) : rawPlan;
  } catch {
    return null;
  }
  if (!snapshot || typeof snapshot !== "object") return null;

  // A snapshot with add-ons keeps the original base plan in _base.
  const addons = require("../helper/addons.js");
  const baseSnap = addons.baseOf(snapshot);
  const addonMeta = Array.isArray(snapshot._addons) ? snapshot._addons : [];

  try {
    let live = null;

    // 1. Try to match the live plan by id.
    if (baseSnap.id) {
      const rows = await query(`SELECT * FROM plan WHERE id = ?`, [
        baseSnap.id,
      ]);
      live = rows[0] || null;
    }

    // 2. Fall back to matching by title (handles snapshots with a missing id,
    //    or plans that were deleted and recreated with a new id).
    if (!live && baseSnap.title) {
      const rows = await query(`SELECT * FROM plan WHERE title = ? LIMIT 1`, [
        baseSnap.title,
      ]);
      live = rows[0] || null;
    }

    // Merge: live flags win, but keep any snapshot-only fields (e.g. purchase
    // metadata) that the live row doesn't have.
    let result = live ? { ...baseSnap, ...live } : baseSnap;

    // Layer the add-ons that have not expired yet (live permissions).
    const now = Date.now();
    const active = addonMeta.filter((a) => new Date(a.expires).getTime() > now);
    if (active.length) {
      const rows = await query(`SELECT * FROM plan WHERE id IN (?)`, [
        active.map((a) => a.id),
      ]);
      result = addons.mergeAddons(result, rows);
      result._addons = active;
    }

    return result;
  } catch (e) {
    console.error("resolveEffectivePlan error:", e.message);
    return snapshot;
  }
};

const checkPlan = async (req, res, next) => {
  try {
    if (req.owner) {
      req.decode.uid = req.owner.uid;
    }

    const getUser = await query(`SELECT * FROM user WHERE uid = ?`, [
      req.decode.uid,
    ]);
    const plan = getUser[0]?.plan;

    if (!plan) {
      return res.json({
        success: false,
        msg: "Please subscribe a plan to proceed this.",
      });
    }

    const numOfDyaLeft = getNumberOfDaysFromTimestamp(getUser[0]?.plan_expire);

    if (numOfDyaLeft < 1) {
      return res.json({
        success: false,
        msg: "Your plan was expired. Please buy a plan",
      });
    } else {
      // Use the LIVE plan flags so admin permission changes take effect
      // immediately, not the frozen snapshot stored on the user.
      req.plan = (await resolveEffectivePlan(plan)) || JSON.parse(plan);
      next();
    }
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
};

const checkContactLimit = async (req, res, next) => {
  try {
    const contact_limit = req.plan?.contact_limit;

    const getContacts = await query(`SELECT * FROM contact WHERE uid = ?`, [
      req.decode.uid,
    ]);

    if (getContacts.length >= contact_limit) {
      return res.json({
        success: false,
        msg: `Your plan allowd you to add only ${contact_limit} contacts. Delete some to add new`,
      });
    } else {
      next();
    }
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
};

const checkNote = async (req, res, next) => {
  try {
    if (req.plan?.allow_note > 0) {
      next();
    } else {
      return res.json({
        msg: "Your plan does not allow you to add or edit chat notes",
      });
    }
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
};

const checkTags = async (req, res, next) => {
  try {
    if (req.plan?.allow_tag > 0) {
      next();
    } else {
      return res.json({
        msg: "Your plan does not allow you to add or edit chat notes",
      });
    }
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
};

const checkWaWArmer = async (req, res, next) => {
  try {
    if (req.plan?.wa_warmer > 0) {
      next();
    } else {
      return res.json({
        msg: "Your plan does not allow you this feature",
      });
    }
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
};

const checkQrScan = async (req, res, next) => {
  try {
    if (req.plan?.qr_account > 0) {
      // Re-generating a QR for an instance the user already owns must NOT be
      // blocked by the limit — it doesn't add a new instance.
      const bodyUniqueId = req.body?.uniqueId;
      if (bodyUniqueId) {
        const existing = await query(
          `SELECT id FROM instance WHERE uniqueId = ? AND uid = ?`,
          [bodyUniqueId, req.decode.uid],
        );
        if (existing.length > 0) {
          return next();
        }
      }

      const accounts = parseInt(req?.plan?.qr_account) || 0;
      const instances = await query(`SELECT * FROM instance WHERE uid = ?`, [
        req.decode.uid,
      ]);

      if (instances?.length >= accounts) {
        return res.json({
          success: false,
          msg: `Your plan allows you to add ${accounts} instances only`,
        });
      }

      next();
    } else {
      return res.json({
        success: false,
        msg: "Your plan does not allow you this feature",
      });
    }
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
};

const checkTeleInbox = async (req, res, next) => {
  try {
    if (req.plan?.telegram_inbox > 0) {
      next();
    } else {
      return res.json({
        msg: "Your plan does not allow you this feature",
      });
    }
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
};

const checkInstaInbox = async (req, res, next) => {
  try {
    if (req.plan?.instagram_inbox > 0) {
      next();
    } else {
      return res.json({
        msg: "Your plan does not allow you this feature",
      });
    }
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
};

const checkWaForms = async (req, res, next) => {
  try {
    if (req.plan?.allow_wa_forms > 0) {
      next();
    } else {
      return res.json({
        msg: "Your plan does not allow you this feature",
      });
    }
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
};

const checkWaCall = async (req, res, next) => {
  try {
    if (req.plan?.allow_wa_call > 0) {
      next();
    } else {
      return res.json({
        success: false,
        msg: "Your plan does not include AI WhatsApp Calling",
      });
    }
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
};

// AI Phone Calling (Twilio) - separate from AI WhatsApp Calling (allow_wa_call)
const checkAiVoice = async (req, res, next) => {
  try {
    if (req.plan?.allow_ai_voice > 0) {
      next();
    } else {
      return res.json({
        success: false,
        msg: "Your plan does not include AI Phone Calling",
      });
    }
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
};

const checkWebhook = async (req, res, next) => {
  try {
    if (req.plan?.allow_webhook > 0) {
      next();
    } else {
      return res.json({
        success: false,
        msg: "Your plan does not include Webhook Automation",
      });
    }
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
};

const checkChatWidget = async (req, res, next) => {
  try {
    if (req.plan?.allow_chat_widget > 0) {
      next();
    } else {
      return res.json({
        success: false,
        msg: "Your plan does not include the Chat Widget",
      });
    }
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
};

const checkAgents = async (req, res, next) => {
  try {
    if (req.plan?.allow_agents > 0) {
      next();
    } else {
      return res.json({
        success: false,
        msg: "Your plan does not include Team Agents",
      });
    }
  } catch (err) {
    console.log(err);
    res.json({ msg: "server error", err });
  }
};

module.exports = {
  checkPlan,
  checkContactLimit,
  checkNote,
  checkTags,
  checkWaWArmer,
  checkQrScan,
  checkWaForms,
  checkInstaInbox,
  checkTeleInbox,
  checkWaCall,
  checkAiVoice,
  checkWebhook,
  checkChatWidget,
  checkAgents,
  resolveEffectivePlan,
};
