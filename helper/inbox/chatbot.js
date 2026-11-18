const { query } = require("../../database/dbpromise");
const { processFlow } = require("../../automation/automation");
const { getActiveFlows } = require("../../automation/functions");
const { normalizePhoneFromId } = require("../../functions/phone.js");

// Runs every active chatbot bound to the channel the message came in on.
// ctx.sessionId: QR instance uniqueId / Instagram user_id / Telegram session id
// ctx.chatId: the inbox chat id the channel handler built (required off-Meta)
async function processWebhook(newMessage, user, ctx = {}) {
  try {
    console.log("🔵 processWebhook called with:", {
      hasMsgContext: !!newMessage?.msgContext,
      origin: newMessage?.origin,
      senderMobile: newMessage?.senderMobile,
      uid: user?.uid,
    });

    if (!newMessage || !user) {
      return console.log("❌ Missing newMessage or user in processWebhook");
    }

    const { senderMobile, origin } = newMessage;
    const uid = user.uid;

    if (!senderMobile || !uid) {
      return console.log("❌ Invalid message data in processWebhook", {
        senderMobile,
        uid,
      });
    }

    // Check user's plan allows chatbot
    const plan = user.plan ? JSON.parse(user.plan) : {};
    console.log("📋 User plan check:", {
      uid,
      allow_chatbot: plan.allow_chatbot,
    });

    if (plan.allow_chatbot <= 0) {
      return console.log("❌ User plan does not allow chatbot");
    }

    // Extract incoming text from message
    const incomingText =
      newMessage?.msgContext?.text?.body ||
      newMessage?.msgContext?.interactive?.body?.text ||
      newMessage?.msgContext?.image?.caption ||
      newMessage?.msgContext?.video?.caption ||
      newMessage?.msgContext?.document?.caption ||
      "";

    console.log("📨 Incoming message:", {
      text: incomingText,
      origin,
      type: newMessage?.type,
    });

    const channel = String(origin || "").toLowerCase();
    const SUPPORTED = ["meta", "qr", "telegram", "instagram", "instagram_comment", "webchat"];
    if (!SUPPORTED.includes(channel)) {
      return console.log("❌ processWebhook: unsupported channel", origin);
    }
    const sessionId = channel === "meta" ? "" : String(ctx.sessionId || "");
    if (channel !== "meta" && !sessionId) {
      return console.log(`❌ processWebhook: no session id for ${channel} message`);
    }
    const chatId =
      channel === "meta"
        ? `meta_${normalizePhoneFromId(senderMobile)}_${uid}`
        : ctx.chatId;
    if (!chatId) {
      return console.log(`❌ processWebhook: no chat id for ${channel} message`);
    }

    // Active chatbots bound to this channel (Meta, a QR number, an Instagram
    // account…) joined with their active flows of the matching source.
    let flows = [];
    try {
      flows = await getActiveFlows({ uid, origin: channel, sessionId });
    } catch (e) {
      return console.log("❌ processWebhook: getActiveFlows failed", e?.message);
    }

    console.log("📊 Found chatbot flows:", {
      channel,
      sessionId: sessionId || undefined,
      count: flows?.length,
      flowIds: flows?.map((f) => f.flow_id),
    });

    if (!flows?.length) {
      return console.log(`❌ No active chatbot flows for ${channel}`, uid);
    }

    // Process each flow
    for (const flow of flows) {
      try {
        const flowData = JSON.parse(flow.data || "{}");
        const nodes = flowData?.nodes || [];
        const edges = flowData?.edges || [];

        console.log("🔧 Flow structure:", {
          flowId: flow.flow_id,
          nodesCount: nodes?.length,
          edgesCount: edges?.length,
        });

        if (nodes?.length < 2 || edges?.length < 1) {
          console.log(
            `⚠️ Flow ${flow.flow_id} does not have enough nodes/edges`,
          );
          continue;
        }

        console.log("🤖 Processing beta chatbot flow:", {
          flowId: flow.flow_id,
          senderMobile,
          incomingText,
          chatId,
        });

        // Process the flow
        await processFlow({
          nodes,
          edges,
          uid,
          flowId: flow.flow_id,
          message: newMessage,
          incomingText,
          user,
          sessionId,
          origin: channel,
          chatId,
          element: flow,
          webhookVariables: ctx.variables || {},
          loopDetection: { visitedNodes: new Map(), startTime: Date.now() },
        });
      } catch (err) {
        console.log(`❌ Error processing flow ${flow.flow_id}:`, err);
      }
    }
  } catch (err) {
    console.log("❌ Error in processWebhook:", err);
  }
}

module.exports = { processWebhook };
