const router = require("express").Router();
const { query } = require("../database/dbpromise.js");
const randomstring = require("randomstring");
const bcrypt = require("bcrypt");
const {
  getUserPlayDays,
  sendAPIMessage,
  getNumberOfDaysFromTimestamp,
  sendMetatemplet,
} = require("../functions/function.js");
const { sign } = require("jsonwebtoken");
const validateUser = require("../middlewares/user.js");
const Stripe = require("stripe");
const {
  checkPlan,
  checkNote,
  checkTags,
  checkContactLimit,
} = require("../middlewares/plan.js");
const { recoverEmail } = require("../emails/returnEmails.js");
const moment = require("moment");
const jwt = require("jsonwebtoken");
const { getMetaTempletByName } = require("../loops/loopFunctions.js");

function decodeToken(token) {
  return new Promise((resolve) => {
    jwt.verify(token, process.env.JWTKEY, (err, decode) => {
      if (err) {
        return resolve({ success: false, data: {}, message: "Invalid API keys" });
      }
      // Run the DB lookup outside the jwt.verify callback so errors are catchable
      query(`SELECT * FROM user WHERE uid = ?`, [decode?.uid])
        .then((getUser) => {
          if (getUser.length < 1) {
            return resolve({ success: false, data: {}, message: "Invalid API keys" });
          }
          if (getUser[0]?.api_key !== token) {
            return resolve({ success: false, msg: "Token was expired." });
          }
          resolve({ success: true, data: getUser[0] });
        })
        .catch((dbErr) => {
          console.error("decodeToken DB error:", dbErr);
          resolve({ success: false, message: "Database error while validating API key." });
        });
    });
  });
}

router.post("/send-message", async (req, res) => {
  try {
    const { token } = req.query;
    const { messageObject } = req.body;

    if (!token) {
      return res.json({ success: false, message: "API keys not found" });
    }

    const checkToken = await decodeToken(token);

    if (!checkToken.success) {
      return res.json({ success: false, message: "Invalid API keys found" });
    }

    const user = checkToken.data;

    if (!user.plan || !user?.plan_expire) {
      return res.json({
        success: false,
        message: "Your dont have any plan please buy one.",
      });
    }

    const getDays = getNumberOfDaysFromTimestamp(user?.plan_expire);

    if (getDays < 1) {
      return res.json({
        success: false,
        message: "Your plan was expired please renew your plan.",
      });
    }

    // checking api eligibility
    const plan = JSON.parse(user?.plan);

    if (plan?.allow_api < 1) {
      return res.json({
        success: false,
        message:
          "Your plan does not allow you to use API feature. Please get another plan",
      });
    }

    if (!messageObject) {
      return res.json({
        success: false,
        message: "messageObject key is required as body response.",
      });
    }

    const getMetaApi = await query(`SELECT * FROM meta_api WHERE uid = ?`, [
      user?.uid,
    ]);
    if (getMetaApi.length < 1) {
      return res.json({
        success: false,
        message: "Please provide your META API keys in the profile section",
      });
    }

    const waToken = getMetaApi[0]?.access_token;
    const waNumId = getMetaApi[0]?.business_phone_number_id;

    if (!waToken || !waNumId) {
      return res.json({
        success: false,
        message: "Please provide your META API keys in the profile section",
      });
    }

    const sendMsg = await sendAPIMessage(messageObject, waNumId, waToken);

    // adding logs
    if (req.body?.enableLog) {
      await query(
        `INSERT INTO beta_api_logs (uid, msg_id, request, response, status) VALUES (?,?,?,?,?)`,
        [
          user?.uid,
          sendMsg?.data?.id,
          JSON.stringify(messageObject),
          JSON.stringify(sendMsg),
          sendMsg?.data?.id ? "processing" : "failed",
        ]
      );
    }

    res.json(sendMsg);
  } catch (err) {
    console.log(err);
    res.json({ err, success: false, msg: "Something went wrong" });
  }
});

// send templet
router.post("/send_templet", async (req, res) => {
  try {
    let dynamicMedia;
    const { sendTo, templetName, exampleArr, token, mediaUri } = req.body;

    // checking plan
    if (!token) {
      return res.json({ success: false, message: "API keys not found" });
    }

    const checkToken = await decodeToken(token);

    if (!checkToken.success) {
      return res.json({ success: false, message: "Invalid API keys found" });
    }

    const user = checkToken.data;

    if (!user.plan || !user?.plan_expire) {
      return res.json({
        success: false,
        message: "Your dont have any plan please buy one.",
      });
    }

    const getDays = getNumberOfDaysFromTimestamp(user?.plan_expire);

    if (getDays < 1) {
      return res.json({
        success: false,
        message: "Your plan was expired please renew your plan.",
      });
    }

    // checking api eligibility
    const plan = JSON.parse(user?.plan);

    if (plan?.allow_api < 1) {
      return res.json({
        success: false,
        message:
          "Your plan does not allow you to use API feature. Please get another plan",
      });
    }

    // checking plan end

    // getting user meta keys
    const getMetaApi = await query(`SELECT * FROM meta_api WHERE uid = ?`, [
      user?.uid,
    ]);
    if (getMetaApi.length < 1) {
      return res.json({
        success: false,
        message: "Please provide your META API keys in the profile section",
      });
    }

    const waToken = getMetaApi[0]?.access_token;
    const waNumId = getMetaApi[0]?.business_phone_number_id;

    if (!waToken || !waNumId) {
      return res.json({
        success: false,
        message: "Please update Api Settings in your user panel",
      });
    }

    if (!sendTo) {
      return res.json({
        message: "Please provide `sendTo` key",
        success: false,
      });
    }

    if (!templetName) {
      return res.json({
        message: "Please provide `templetName`",
        success: false,
      });
    }

    // exampleArr is optional — templates with no variables don't need it.
    // Default to empty array so downstream code always gets an array.
    const safeExampleArr = Array.isArray(exampleArr) ? exampleArr : (exampleArr ? [exampleArr] : []);

    const templet = await getMetaTempletByName(templetName, getMetaApi[0]);

    if (templet.error || templet?.data?.length < 1) {
      return res.json({
        success: false,
        message: templet.error?.message || "Unable to fetch template from Meta. Check that the template name is correct and approved.",
      });
    }

    if (mediaUri) {
      dynamicMedia = mediaUri;
    } else {
      dynamicMedia = null;
    }

    const resp = await sendMetatemplet(
      sendTo?.replace("+", ""),
      waNumId,
      waToken,
      templet?.data[0],
      safeExampleArr,
      dynamicMedia
    );

    function returnMetMsgId(resp) {
      try {
        return resp?.messages[0]?.id || null;
      } catch (err) {
        return null;
      }
    }

    if (req.body?.enableLog) {
      await query(
        `INSERT INTO beta_api_logs (uid, msg_id, request, response, status) VALUES (?,?,?,?,?)`,
        [
          user?.uid,
          returnMetMsgId(resp),
          JSON.stringify({
            sendTo: sendTo?.replace("+", ""),
            templetName,
            exampleArr: safeExampleArr,
            mediaUri: dynamicMedia,
          }),
          JSON.stringify(resp),
          returnMetMsgId(resp) ? "processing" : "failed",
        ]
      );
    }

    if (resp.error) {
      res.json({
        success: false,
        metaResponse: resp,
      });
    } else {
      res.json({
        success: true,
        metaResponse: resp,
      });
    }
  } catch (err) {
    console.log(err);
    res.json({
      err: err?.toString(),
      success: false,
      msg: "Something went wrong",
    });
  }
});

// get logs
router.get("/get_logs", validateUser, async (req, res) => {
  try {
    const data = await query(`SELECT * FROM beta_api_logs WHERE uid = ?`, [
      req.decode.uid,
    ]);
    res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.log(err);
    res.json({ err, success: false, msg: "Something went wrong" });
  }
});

// delete logs
router.post("/delete_logs", validateUser, async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.json({
        success: false,
        msg: "Invalid or missing log IDs",
      });
    }

    // Create placeholders for SQL query
    const placeholders = ids.map(() => "?").join(",");

    // Delete logs but ensure they belong to the user
    const result = await query(
      `DELETE FROM beta_api_logs WHERE id IN (${placeholders}) AND uid = ?`,
      [...ids, req.decode.uid]
    );

    res.json({
      success: true,
      message: "Logs deleted successfully",
      count: result.affectedRows,
    });
  } catch (err) {
    console.log(err);
    res.json({ err, success: false, msg: "Something went wrong" });
  }
});

// ── Helper: extract API token from Authorization header OR ?token= query param
function extractToken(req) {
  const authHeader = req.headers?.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  return req.query?.token || null;
}

// ── Helper: plan guard (shared between /send and /send-message)
async function checkApiPlan(user) {
  if (!user.plan || !user.plan_expire) {
    return "Your account does not have an active plan. Please purchase one.";
  }
  const days = getNumberOfDaysFromTimestamp(user.plan_expire);
  if (days < 1) {
    return "Your plan has expired. Please renew to continue using the API.";
  }
  try {
    const plan = typeof user.plan === "string" ? JSON.parse(user.plan) : user.plan;
    if (plan?.allow_api < 1) {
      return "Your current plan does not include API access. Please upgrade.";
    }
  } catch (_) {
    return "Could not read your plan details. Please contact support.";
  }
  return null; // no error
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/send  ← simplified friendly endpoint used by the dashboard UI
// Auth: Bearer token in Authorization header OR ?token= query param
// Body: { to, message, type?, mediaUrl?, caption?, token? }
//   type: "text" (default) | "image" | "template"
//   For template: { to, templateName, languageCode?, components? }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/send", async (req, res) => {
  try {
    const token = extractToken(req) || req.body?.token;
    if (!token) {
      return res.json({ success: false, message: "API key not found. Provide it as ?token= or Authorization: Bearer header." });
    }

    const checkToken = await decodeToken(token);
    if (!checkToken.success) {
      return res.json({ success: false, message: checkToken.message || checkToken.msg || "Invalid API key." });
    }

    const user = checkToken.data;
    const planError = await checkApiPlan(user);
    if (planError) {
      return res.json({ success: false, message: planError });
    }

    const { to, message, type = "text", mediaUrl, caption } = req.body;
    if (!to) {
      return res.json({ success: false, message: "The `to` field (phone with country code) is required." });
    }

    // Build the Meta messageObject based on type
    let messageObject;
    if (type === "image") {
      if (!mediaUrl) {
        return res.json({ success: false, message: "The `mediaUrl` field is required for image messages." });
      }
      messageObject = {
        to: String(to).replace("+", ""),
        type: "image",
        image: { link: mediaUrl, ...(caption ? { caption } : {}) },
      };
    } else if (type === "video") {
      if (!mediaUrl) return res.json({ success: false, message: "The `mediaUrl` field is required for video messages." });
      messageObject = { to: String(to).replace("+", ""), type: "video", video: { link: mediaUrl, ...(caption ? { caption } : {}) } };
    } else if (type === "audio") {
      if (!mediaUrl) return res.json({ success: false, message: "The `mediaUrl` field is required for audio messages." });
      messageObject = { to: String(to).replace("+", ""), type: "audio", audio: { link: mediaUrl } };
    } else if (type === "document") {
      if (!mediaUrl) return res.json({ success: false, message: "The `mediaUrl` field is required for document messages." });
      messageObject = { to: String(to).replace("+", ""), type: "document", document: { link: mediaUrl, ...(caption ? { filename: caption } : {}) } };
    } else if (type === "location") {
      const { latitude, longitude, name: locName, address } = req.body;
      if (!latitude || !longitude) return res.json({ success: false, message: "The `latitude` and `longitude` fields are required for location messages." });
      messageObject = { to: String(to).replace("+", ""), type: "location", location: { latitude, longitude, ...(locName ? { name: locName } : {}), ...(address ? { address } : {}) } };
    } else if (type === "reaction") {
      const { messageId, emoji } = req.body;
      if (!messageId || !emoji) return res.json({ success: false, message: "The `messageId` and `emoji` fields are required for reaction messages." });
      messageObject = { to: String(to).replace("+", ""), type: "reaction", reaction: { message_id: messageId, emoji } };
    } else if (type === "contact" || type === "contacts") {
      const { contacts } = req.body;
      if (!contacts) return res.json({ success: false, message: "The `contacts` array is required for contact messages." });
      messageObject = { to: String(to).replace("+", ""), type: "contacts", contacts };
    } else if (type === "list" || type === "button" || type === "interactive") {
      const { interactive } = req.body;
      if (!interactive) return res.json({ success: false, message: "The `interactive` object is required for interactive messages." });
      messageObject = { to: String(to).replace("+", ""), type: "interactive", interactive };
    } else {
      // default: text
      if (!message) {
        return res.json({ success: false, message: "The `message` field is required for text messages." });
      }
      messageObject = {
        to: String(to).replace("+", ""),
        type: "text",
        text: { body: message },
      };
    }

    // Get user's Meta credentials
    const getMetaApi = await query(`SELECT * FROM meta_api WHERE uid = ?`, [user.uid]);
    if (getMetaApi.length < 1) {
      return res.json({ success: false, message: "No Meta API credentials found. Please link your WhatsApp account first." });
    }
    const waToken = getMetaApi[0]?.access_token;
    const waNumId = getMetaApi[0]?.business_phone_number_id;
    if (!waToken || !waNumId) {
      return res.json({ success: false, message: "Meta API credentials are incomplete. Please update them in Link Meta WhatsApp." });
    }

    const sendMsg = await sendAPIMessage(messageObject, waNumId, waToken);

    // Save log entry
    try {
      await query(
        `INSERT INTO beta_api_logs (uid, msg_id, request, response, status) VALUES (?,?,?,?,?)`,
        [
          user.uid,
          sendMsg?.data?.id || null,
          JSON.stringify({ to, type, message, mediaUrl, caption }),
          JSON.stringify(sendMsg),
          sendMsg?.data?.id ? "processing" : "failed",
        ]
      );
    } catch (logErr) {
      console.error("Log save error:", logErr);
    }

    res.json(sendMsg);
  } catch (err) {
    console.error("/api/v1/send error:", err);
    res.json({ err: err?.toString(), success: false, msg: "Something went wrong" });
  }
});

module.exports = router;
