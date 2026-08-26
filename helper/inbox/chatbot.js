const { query } = require("../../database/dbpromise");
const { processFlow } = require("../../automation/automation");

async function processWebhook(newMessage, user) {
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

    // Get active beta chatbots for this origin
    let chatbots = [];
    if (origin === "meta") {
      chatbots = await query(
        `SELECT flow_id, uid, origin_id FROM beta_chatbot 
         WHERE uid = ? AND origin_id = ? AND active = 1`,
        [uid, "META"],
      );
    }

    console.log("🤖 Found beta chatbots:", {
      count: chatbots?.length,
      origin,
      uid,
    });

    if (chatbots?.length < 1) {
      return console.log(
        "❌ No active beta chatbots found for META origin",
        uid,
      );
    }

    // Get flow IDs from chatbots
    const flowIds = chatbots.map((c) => c.flow_id);

    console.log("🔍 Looking for flows:", {
      flowIds,
      uid,
      source: "wa_chatbot",
    });

    // Get active flows
    const flows = await query(
      `SELECT * FROM beta_flows 
       WHERE uid = ? AND is_active = 1 AND source = ? 
       AND flow_id IN (?)`,
      [uid, "wa_chatbot", flowIds],
    );

    console.log("📊 Found flows:", {
      count: flows?.length,
      flowIds: flows?.map((f) => f.flow_id),
    });

    if (flows?.length < 1) {
      return console.log("❌ No active flows found for chatbots");
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

        // Generate chatId based on origin
        const chatId = `meta_${senderMobile.replace(/\D/g, "")}_${uid}`;

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
          sessionId: "",
          origin: "meta",
          chatId,
          element: flow,
          webhookVariables: {},
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
