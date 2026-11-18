const router = require("express").Router();
const { query } = require("../database/dbpromise.js");
const randomstring = require("randomstring");
const bcrypt = require("bcrypt");
const {
  isValidEmail,
  getFileExtension,
  makeRequest,
  readJsonFromFile,
} = require("../functions/function.js");
const { sign } = require("jsonwebtoken");
const validateUser = require("../middlewares/user.js");
const { checkPlan } = require("../middlewares/plan.js");

function hasPropertyWithValue(arr, property, value) {
  return arr.some((item) => item[property] === value);
}

router.post("/add_chatbot", validateUser, checkPlan, async (req, res) => {
  try {
    const { title, chats, flow, for_all, origin: originRaw = {} } = req.body;

    const origin = {
      title: "Meta",
      code: "META",
      data: {},
      ...originRaw,
    };

    if (req.plan?.allow_chatbot < 1) {
      return res.json({
        success: false,
        msg: "Your plan does not allow you to set a chatbot",
      });
    }

    if (!origin?.code) {
      return res.json({ msg: "Please select a chatbot Origin" });
    }

    if (!title || chats.length < 1 || !flow) {
      return res.json({
        success: false,
        msg: "Please provide the all fields! title, chats, flow are required",
      });
    }

    // checking for qr chatbot if they used a flow which contain interactive buttons
    if (origin?.code !== "META") {
      const flowPath = `${__dirname}/../flow-json/nodes/${req.decode.uid}/${flow?.flow_id}.json`;
      const nodeData = readJsonFromFile(flowPath);
      const checkBtn = hasPropertyWithValue(nodeData, "type", "BUTTON");
      const checkList = hasPropertyWithValue(nodeData, "type", "LIST");
      if (checkBtn || checkList) {
        return res.json({
          msg: "Please select another flow which does not contain interactive buttons",
        });
      }
    }

    await query(
      `INSERT INTO chatbot (uid, title, for_all, chats, flow, flow_id, active, origin) VALUES (?,?,?,?,?,?,?,?)`,
      [
        req.decode.uid,
        title,
        for_all ? 1 : 0,
        JSON.stringify(chats),
        JSON.stringify(flow),
        flow?.id,
        1,
        JSON.stringify(origin),
      ],
    );

    res.json({ success: true, msg: "Chatbot was added" });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

// update chatbot
router.post("/update_chatbot", validateUser, checkPlan, async (req, res) => {
  try {
    const {
      title,
      chats,
      flow,
      for_all,
      id,
      origin: originRaw = {},
    } = req.body;

    const origin = {
      title: "Meta",
      code: "META",
      data: {},
      ...originRaw,
    };

    if (req.plan?.allow_chatbot < 1) {
      return res.json({
        success: false,
        msg: "Your plan does not allow you to set a chatbot",
      });
    }

    if (!title || chats.length < 1 || !flow) {
      return res.json({
        success: false,
        msg: "Please provide the all fields! title, chats, flow are required",
      });
    }

    if (!origin?.code) {
      return res.json({ msg: "Please select a chatbot Origin" });
    }

    // checking for qr chatbot if they used a flow which contain interactive buttons
    if (origin?.code !== "META") {
      const flowPath = `${__dirname}/../flow-json/nodes/${req.decode.uid}/${flow?.flow_id}.json`;
      const nodeData = readJsonFromFile(flowPath);
      const checkBtn = hasPropertyWithValue(nodeData, "type", "BUTTON");
      const checkList = hasPropertyWithValue(nodeData, "type", "LIST");
      if (checkBtn || checkList) {
        return res.json({
          msg: "Please select another flow which does not contain interactive buttons",
        });
      }
    }

    await query(
      `UPDATE chatbot SET title = ?, for_all = ?, chats = ?, flow = ?, flow_id = ?, origin = ? WHERE id = ?`,
      [
        title,
        for_all ? 1 : 0,
        JSON.stringify(chats),
        JSON.stringify(flow),
        flow?.id,
        JSON.stringify(origin),
        id,
      ],
    );

    res.json({ success: true, msg: "Chatbot was updated" });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

// get my chatbots
router.get("/get_chatbot", validateUser, async (req, res) => {
  try {
    const data = await query(`SELECT * FROM chatbot WHERE uid = ?`, [
      req.decode.uid,
    ]);
    res.json({ data, success: true });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

// change bot status
router.post("/change_bot_status", validateUser, checkPlan, async (req, res) => {
  try {
    const { id, status } = req.body;

    if (req.plan?.allow_chatbot < 1) {
      return res.json({
        success: false,
        msg: "Your plan does not allow you to set a chatbot",
      });
    }

    await query(`UPDATE chatbot SET active = ? WHERE uid = ? AND id = ?`, [
      status ? 1 : 0,
      req.decode.uid,
      id,
    ]);

    res.json({ success: true, msg: "Chatbot was updated" });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

// del chatbot
router.post("/del_chatbot", validateUser, async (req, res) => {
  try {
    const { id } = req.body;
    await query(`DELETE FROM chatbot WHERE id = ? AND uid = ?`, [
      id,
      req.decode.uid,
    ]);
    res.json({ success: true, msg: "Chatbot was deleted" });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

// try to make a request
router.post("/make_request_api", validateUser, checkPlan, async (req, res) => {
  try {
    const { url, body, headers, type } = req.body;

    if (!url || !type) {
      return res.json({ msg: "Url is required" });
    }

    const resp = await makeRequest({
      method: type,
      url,
      body,
      headers,
    });

    res.json(resp);
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

router.post("/add_beta_chatbot", validateUser, checkPlan, async (req, res) => {
  try {
    const { title, origin, flow } = req.body;
    if (!title || !origin || !flow?.id) {
      return res.json({ msg: "Please fill all required fields" });
    }

    if (req.plan?.allow_chatbot < 1) {
      return res.json({
        success: false,
        msg: "Your plan does not allow you to set a chatbot",
      });
    }

    const { flow_id } = flow;
    const [getFlow] = await query(
      `SELECT * FROM beta_flows WHERE flow_id = ? AND uid = ?`,
      [flow_id, req.decode.uid],
    );
    if (!getFlow) {
      return res.json({ msg: "This flow is not existed" });
    }

    const flowNodesEdges = getFlow?.data ? JSON.parse(getFlow.data) : null;
    if (!flowNodesEdges || flowNodesEdges?.nodes?.length < 2) {
      return res.json({
        msg: "This flow does not have enough nodes to start, Please complete the flow",
      });
    }

    const { nodes, edges } = flowNodesEdges;

    // Interactive messages only work on META and the website chat (shown
    // there as clickable options) — block for others
    if (origin?.code !== "META" && origin?.code !== "WEBSITE") {
      const hasButtons = nodes.some(
        (node) =>
          node.data?.type?.type === "button" ||
          (node.data?.content?.type === "interactive" &&
            node.data?.content?.interactive?.type === "button"),
      );
      const hasLists = nodes.some(
        (node) =>
          node.data?.type?.type === "list" ||
          (node.data?.content?.type === "interactive" &&
            node.data?.content?.interactive?.type === "list"),
      );

      if (hasButtons || hasLists) {
        const originLabel =
          origin.code === "TELEGRAM"
            ? "Telegram"
            : origin.code === "INSTAGRAM"
              ? "Instagram"
              : "QR";
        return res.json({
          success: false,
          msg: `Interactive buttons and lists are not supported for ${originLabel} origin.`,
        });
      }
    }

    const validOrigins = [
      "QR",
      "META",
      "WEBHOOK_AUTOMATION",
      "TELEGRAM",
      "INSTAGRAM",
      "INSTAGRAM_COMMENT",
      "WEBSITE",
    ];
    if (!validOrigins.includes(origin.code)) {
      return res.json({ msg: `Selected Origin not found ${origin?.code}` });
    }

    // ── resolve the channel from THIS user's own records ────────────────────
    // (never trust ids sent by the browser). Also builds the compact origin
    // stored in beta_chatbot.origin, a varchar(100) column.
    let resolvedOriginId = null;
    let storedOrigin = null;
    const short = (v) => String(v ?? "").slice(0, 40);
    if (origin.code === "META") {
      resolvedOriginId = "META";
      storedOrigin = { code: "META", title: "Meta" };
    } else if (origin.code === "QR") {
      const uniqueId = origin.data?.uniqueId;
      const [inst] = uniqueId
        ? await query(`SELECT uniqueId, number, title, status FROM instance WHERE uid = ? AND uniqueId = ?`, [req.decode.uid, uniqueId])
        : [];
      if (!inst) return res.json({ success: false, msg: "That WhatsApp QR number was not found in your account" });
      resolvedOriginId = inst.uniqueId;
      storedOrigin = { code: "QR", title: short(inst.number || inst.title || inst.uniqueId) };
    } else if (origin.code === "TELEGRAM") {
      const tgId = origin.data?.id;
      const [tg] = tgId
        ? await query(`SELECT id, phone FROM telegram_session WHERE uid = ? AND id = ?`, [req.decode.uid, tgId])
        : [];
      if (!tg) return res.json({ success: false, msg: "No Telegram session found in your account" });
      resolvedOriginId = String(origin.data?.session_id || tg.id);
      storedOrigin = { code: "TELEGRAM", title: short(tg.phone || `Telegram ${tg.id}`) };
    } else if (origin.code === "INSTAGRAM" || origin.code === "INSTAGRAM_COMMENT") {
      const igId = origin.data?.user_id;
      const [ig] = igId
        ? await query(`SELECT user_id, username FROM instagram_accounts WHERE uid = ? AND user_id = ?`, [req.decode.uid, igId])
        : [];
      if (!ig) return res.json({ success: false, msg: "No Instagram account found in your account" });
      resolvedOriginId = ig.user_id;
      storedOrigin = { code: origin.code, title: short(`@${ig.username || ig.user_id}`) };
    } else if (origin.code === "WEBSITE") {
      const widgetId = origin.data?.unique_id;
      const [w] = widgetId
        ? await query(`SELECT unique_id, title, mode FROM chat_widget WHERE uid = ? AND unique_id = ?`, [req.decode.uid, widgetId])
        : [];
      if (!w) return res.json({ success: false, msg: "That website chat widget was not found in your account" });
      // A website bot needs the in-page chat window, so switch the widget to it.
      if (w.mode !== "live") {
        await query(`UPDATE chat_widget SET mode = 'live' WHERE uid = ? AND unique_id = ?`, [req.decode.uid, w.unique_id]);
      }
      resolvedOriginId = w.unique_id;
      storedOrigin = { code: "WEBSITE", title: short(w.title || "Website") };
    }

    // ── duplicate check ─────────────────────────────────────────────────────
    const getAllChatbots = await query(
      `SELECT * FROM beta_chatbot WHERE uid = ?`,
      [req.decode.uid],
    );
    const parseOrigin = (raw) => {
      try {
        return JSON.parse(raw) || {};
      } catch {
        return {};
      }
    };
    const chatbots = getAllChatbots?.map((x) => parseOrigin(x.origin)) || [];

    // ✅ Allow multiple chatbots for the same origin type (META, QR, etc.)
    // Only check if the EXACT same origin configuration already exists
    // Removed: Single META chatbot restriction
    
    // Check if exact same origin already exists (same code AND same configuration)
    if (origin?.code === "META") {
      // For META, allow multiple chatbots (each can have different flows)
      // Only block if trying to use the exact same flow_id
      const existingMetaChatbot = getAllChatbots.find(
        (x) => x.flow_id === flow_id && parseOrigin(x.origin).code === "META"
      );
      if (existingMetaChatbot) {
        return res.json({
          msg: "A META chatbot with this flow already exists. Please select a different flow.",
        });
      }
    } else if (
      resolvedOriginId &&
      getAllChatbots.some((x) => x.origin_id === resolvedOriginId && parseOrigin(x.origin).code === origin.code && x.flow_id === flow_id)
    ) {
      // Same channel + same flow already exists
      return res.json({
        msg: "A chatbot with this channel and flow already exists",
      });
    } else if (
      !resolvedOriginId &&
      chatbots.find((x) => x.title === origin?.title && x.code === origin?.code)
    ) {
      // For other origins (QR, Telegram, Instagram), check by title and code
      return res.json({
        msg: "A chatbot with this origin already exists",
      });
    }

    // ── resolve origin_id ───────────────────────────────────────────────────
    let origin_id;
    if (resolvedOriginId) {
      origin_id = resolvedOriginId;
    } else if (origin.code === "META") {
      origin_id = "META";
    } else if (origin.code === "TELEGRAM") {
      origin_id = origin.data?.session_id || origin.data?.id;
    } else if (origin.code === "QR") {
      origin_id = origin.data?.uniqueId;
    } else if (origin.code === "INSTAGRAM") {
      origin_id = origin.data?.user_id;
    } else if (origin.code === "INSTAGRAM_COMMENT") {
      origin_id = origin.data?.user_id; // ✅ FIXED
    } else {
      origin_id = null;
    }

    // ── resolve source ──────────────────────────────────────────────────────
    let source;
    if (origin?.code === "WEBHOOK_AUTOMATION") {
      source = "webhook_automation";
    } else if (origin?.code === "INSTAGRAM") {
      source = "instagram_chatbot";
    } else if (origin?.code === "INSTAGRAM_COMMENT") {
      source = "instagram_comment"; // ✅ FIXED
    } else {
      source = "wa_chatbot";
    }

    // One active chatbot per channel: if this channel already has an active
    // bot, save the new one paused so customers don't get two replies.
    const [activeOnChannel] = await query(
      `SELECT id FROM beta_chatbot WHERE uid = ? AND source = ? AND (origin_id <=> ?) AND active = 1 LIMIT 1`,
      [req.decode.uid, source, origin_id],
    );
    const startActive = activeOnChannel ? 0 : 1;

    await query(
      `INSERT INTO beta_chatbot (uid, source, title, flow_id, origin, origin_id, active) VALUES (?,?,?,?,?,?,?)`,
      [
        req.decode.uid,
        source,
        title,
        flow_id,
        // Compact record for known channels; webhook-automation origins keep
        // their full object (matched with LIKE on webhook_id at runtime).
        JSON.stringify(storedOrigin || origin),
        origin_id,
        startActive,
      ],
    );

    res.json({
      success: true,
      active: !!startActive,
      msg: startActive
        ? "Chatbot was added and is live"
        : "Chatbot was added paused, because another chatbot is already active on this channel. Turn it on to switch.",
    });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

// get all chatbots beta
router.get("/get_beta_chatbots", validateUser, async (req, res) => {
  try {
    const { type } = req.query;
    const data = await query(
      `SELECT * FROM beta_chatbot WHERE uid = ? AND source = ?`,
      [req.decode.uid, type],
    );
    res.json({ data, success: true });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

// change bot status
router.post("/change_beta_bot_status", validateUser, async (req, res) => {
  try {
    const { id, status } = req.body;

    const [bot] = await query(
      `SELECT id, source, origin_id FROM beta_chatbot WHERE id = ? AND uid = ?`,
      [id, req.decode.uid],
    );
    if (!bot) {
      return res.json({ success: false, msg: "Chatbot not found" });
    }

    // One active chatbot per channel: activating this one turns off the
    // others on the SAME channel only (Meta, a QR number, an Instagram
    // account…), not the user's bots on other channels.
    if (status) {
      await query(
        `UPDATE beta_chatbot SET active = 0
         WHERE uid = ? AND id != ? AND source = ? AND (origin_id <=> ?)`,
        [req.decode.uid, bot.id, bot.source, bot.origin_id]
      );
    }
    
    // Now activate/deactivate the target chatbot
    await query(`UPDATE beta_chatbot SET active = ? WHERE uid = ? AND id = ?`, [
      status ? 1 : 0,
      req.decode.uid,
      id,
    ]);
    
    res.json({ msg: "Status changed", success: true });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

// del beta chatbot
router.post("/del_beta_chatbot", validateUser, async (req, res) => {
  try {
    const { id } = req.body;
    await query(`DELETE FROM beta_chatbot WHERE id = ? AND uid = ?`, [
      id,
      req.decode.uid,
    ]);
    res.json({ msg: "Chatbot was deleted", success: true });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

// update beta chatbot (title / flow)
router.post("/update_beta_chatbot", validateUser, async (req, res) => {
  try {
    const { id, title, flow } = req.body;
    if (!id || !title || !flow?.flow_id) {
      return res.json({ msg: "Please fill all required fields" });
    }

    // make sure the chatbot belongs to this user
    const [existing] = await query(
      `SELECT * FROM beta_chatbot WHERE id = ? AND uid = ?`,
      [id, req.decode.uid],
    );
    if (!existing) {
      return res.json({ msg: "Chatbot not found" });
    }

    // validate the selected flow exists and has enough nodes
    const [getFlow] = await query(
      `SELECT * FROM beta_flows WHERE flow_id = ? AND uid = ?`,
      [flow.flow_id, req.decode.uid],
    );
    if (!getFlow) {
      return res.json({ msg: "This flow is not existed" });
    }
    const flowNodesEdges = getFlow?.data ? JSON.parse(getFlow.data) : null;
    if (!flowNodesEdges || flowNodesEdges?.nodes?.length < 2) {
      return res.json({
        msg: "This flow does not have enough nodes to start, Please complete the flow",
      });
    }

    await query(
      `UPDATE beta_chatbot SET title = ?, flow_id = ? WHERE id = ? AND uid = ?`,
      [title, flow.flow_id, id, req.decode.uid],
    );

    res.json({ success: true, msg: "Chatbot was updated successfully" });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Something went wrong", err });
  }
});

module.exports = router;
