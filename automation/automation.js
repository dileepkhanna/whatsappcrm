const flowProcessor = require("./functions");
const { query } = require("../database/dbpromise");

async function processFlow({
  nodes,
  edges,
  uid,
  flowId,
  message,
  incomingText,
  user,
  sessionId,
  origin,
  chatId,
  element,
  webhookVariables = {},
  loopDetection = { visitedNodes: new Map(), startTime: Date.now() }, // Add loop detection
}) {
  console.log("⚙️ processFlow STARTED:", {
    flowId,
    nodesCount: nodes?.length,
    edgesCount: edges?.length,
    senderMobile: message?.senderMobile,
    incomingText,
    origin,
    chatId,
  });

  // ===== LOOP PROTECTION START =====
  const MAX_ITERATIONS = 50; // Maximum total iterations
  const MAX_NODE_VISITS = 3; // Maximum visits to same node
  const MAX_EXECUTION_TIME = 30000; // 30 seconds max execution time

  // Check total execution time
  const executionTime = Date.now() - loopDetection.startTime;
  if (executionTime > MAX_EXECUTION_TIME) {
    console.error("⚠️ Flow execution timeout - exceeded 30 seconds", {
      flowId,
      uid,
      senderMobile: message.senderMobile,
      executionTime,
    });

    // Clean up the session to prevent future issues
    await query(
      `DELETE FROM flow_session 
       WHERE uid = ? AND flow_id = ? AND sender_mobile = ?
       LIMIT 1`,
      [uid, flowId, message.senderMobile],
    );

    return console.log("Flow terminated due to timeout");
  }

  // Check total iterations
  const totalIterations = Array.from(
    loopDetection.visitedNodes.values(),
  ).reduce((sum, count) => sum + count, 0);

  if (totalIterations >= MAX_ITERATIONS) {
    console.error("⚠️ Infinite loop detected - exceeded max iterations", {
      flowId,
      uid,
      senderMobile: message.senderMobile,
      totalIterations,
      visitedNodes: Object.fromEntries(loopDetection.visitedNodes),
    });

    // Clean up the session
    await query(
      `DELETE FROM flow_session 
       WHERE uid = ? AND flow_id = ? AND sender_mobile = ?
       LIMIT 1`,
      [uid, flowId, message.senderMobile],
    );

    return console.log("Flow terminated due to infinite loop");
  }
  // ===== LOOP PROTECTION END =====

  let result = { moveToNextNode: false };
  const flowSession = await flowProcessor.getFlowSession({
    flowId,
    message,
    uid,
    nodes,
    incomingText,
    edges,
    sessionId,
    origin,
    webhookVariables,
  });

  console.log("📝 Flow session retrieved:", {
    hasSession: !!flowSession,
    hasData: !!flowSession?.data,
    hasNode: !!flowSession?.data?.node,
    sessionId: flowSession?.id,
  });

  // returning if chat is disabled
  const checkIfDisabled = await flowProcessor.checkIfChatDisabled({
    flowSession,
  });

  if (checkIfDisabled && flowSession?.data?.disableChat?.timestamp) {
    return console.log("Chat found disabled", { checkIfDisabled });
  }

  // checking if its assigned to ai
  const checkIfAssignedToAi = flowSession?.data?.assignedToAi;
  if (checkIfAssignedToAi) {
    console.log("Chat is assigned to AI, ai flow processing");
    await flowProcessor.processAiTransfer({
      chatId,
      message,
      node: flowSession?.data?.assignedToAi?.node,
      origin,
      sessionId,
      user,
      nodes,
      edges,
      flowSession,
      element,
      variablesObj,
      incomingText,
    });
    return;
  }

  console.log("🔍 Checking flow session node:", {
    hasNode: !!flowSession?.data?.node,
    origin,
    willRetry: !flowSession?.data?.node && origin !== "webhook_automation",
  });

  if (!flowSession?.data?.node && origin !== "webhook_automation") {
    console.log(
      "Flow looks incomplete trying to delete session and try again ",
    );
    if (origin === "qr") {
      await query(
        `DELETE FROM flow_session WHERE uid = ? AND origin = ? AND origin_id = ? AND flow_id = ? AND sender_mobile = ? LIMIT 1`,
        [uid, origin, sessionId, flowId, message.senderMobile],
      );
    } else if (origin?.toLowerCase() === "webhook_automation") {
      await query(
        `DELETE FROM flow_session WHERE uid = ? AND origin = ? AND flow_id = ? AND sender_mobile = ? LIMIT 1`,
        [uid, origin, flowId, message.senderMobile],
      );
    } else {
      await query(
        `DELETE FROM flow_session WHERE uid = ? AND origin = ? AND origin_id = ? AND flow_id = ? AND sender_mobile = ? LIMIT 1`,
        [uid, "meta", "META", flowId, message.senderMobile],
      );
    }
    await processFlow({
      nodes,
      edges,
      uid,
      flowId: element.flow_id,
      message,
      incomingText,
      user,
      sessionId,
      origin,
      chatId,
      element,
      loopDetection, // Pass loop detection
    });
    return;
  }

  const { node: oldNode } = flowSession?.data;
  const variablesObj = flowSession?.data?.variables || {};

  // ===== TRACK NODE VISITS =====
  const currentNodeId = oldNode?.id;
  if (currentNodeId) {
    const visitCount = (loopDetection.visitedNodes.get(currentNodeId) || 0) + 1;
    loopDetection.visitedNodes.set(currentNodeId, visitCount);

    if (visitCount > MAX_NODE_VISITS) {
      console.error(
        "⚠️ Infinite loop detected - same node visited too many times",
        {
          flowId,
          uid,
          senderMobile: message.senderMobile,
          nodeId: currentNodeId,
          nodeType: oldNode?.type,
          visitCount,
          allVisits: Object.fromEntries(loopDetection.visitedNodes),
        },
      );

      // Clean up the session
      await query(
        `DELETE FROM flow_session 
         WHERE uid = ? AND flow_id = ? AND sender_mobile = ?
         LIMIT 1`,
        [uid, flowId, message.senderMobile],
      );

      return console.log("Flow terminated - node visited too many times");
    }
  }
  // ===== END TRACK NODE VISITS =====

  // updating variables
  let node;

  node = {
    ...oldNode,
    data: {
      ...oldNode?.data,
      content: flowProcessor.replaceVariables(
        oldNode?.data?.content,
        variablesObj,
      ),
    },
  };

  switch (node.type) {
    case "SEND_MESSAGE":
    case "message": // ✅ Support lowercase 'message' type from beta flows
      console.log("📨 Processing message node...");
      result = await flowProcessor.processSendMessage({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "SET_CHAT_LABEL":
      result = await flowProcessor.processSetChatLabel({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "SEND_WA_FORM":
    case "waForm": // ✅ Support lowercase 'waForm' type from beta flow builder
      result = await flowProcessor.processSendWaForm({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "SEND_WA_TEMPLATE":
    case "waTemplate": // ✅ Support lowercase 'waTemplate' type from beta flow builder
      result = await flowProcessor.processSendWaTemplate({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "CONDITION":
    case "condition": // ✅ Support lowercase from beta flow builder
      result = await flowProcessor.processCondition({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "RESPONSE_SAVER":
    case "responseSaver": // ✅ Support camelCase from beta flow builder
      result = await flowProcessor.processResponseSaver({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "DISABLE_AUTOREPLY":
    case "disableAutoReply": // ✅ Support camelCase from beta flow builder
      result = await flowProcessor.processDisableAutoReply({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "MAKE_REQUEST":
    case "httpRequest": // ✅ Support camelCase from beta flow builder
      result = await flowProcessor.processMakeRequest({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "DELAY":
    case "delay": // ✅ Support lowercase from beta flow builder
      result = await flowProcessor.processDelay({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "SPREADSHEET":
    case "googleSheets": // ✅ Support camelCase from beta flow builder
      result = await flowProcessor.processSpreadSheet({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "EMAIL":
    case "sendEmail": // ✅ Support camelCase from beta flow builder
      result = await flowProcessor.processSendEmail({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "AGENT_TRANSFER":
    case "agentTransfer": // ✅ Support camelCase from beta flow builder
      result = await flowProcessor.processAgentTransfer({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "AI_TRANSFER":
    case "aiTransfer": // ✅ Support camelCase from beta flow builder
      result = await flowProcessor.processAiTransfer({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "MYSQL_QUERY":
    case "mysqlQuery": // ✅ Support camelCase from beta flow builder
      result = await flowProcessor.processMysqlQuery({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "RESET":
    case "resetSession": // ✅ Support camelCase from beta flow builder
      result = await flowProcessor.processResetSession({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    case "SET_CHAT_LABEL":
    case "chatLabels": // ✅ Support camelCase from beta flow builder
      result = await flowProcessor.processSetChatLabel({
        chatId,
        message,
        node,
        origin,
        sessionId,
        user,
        nodes,
        edges,
        flowSession,
        element,
        variablesObj,
        incomingText,
      });
      break;

    default:
      console.log("⚠️ Unknown node type:", {
        nodeType: node.type,
        nodeId: node.id,
        availableTypes: ["SEND_MESSAGE", "message", "CONDITION", "RESPONSE_SAVER", "etc..."]
      });
      break;
  }

  // console.log({ s: result?.moveToNextNode, type: node.type });

  if (result?.moveToNextNode) {
    setTimeout(async () => {
      await processFlow({
        nodes,
        edges,
        uid,
        flowId: element.flow_id,
        message,
        incomingText,
        user,
        sessionId,
        origin,
        chatId,
        element,
        webhookVariables,
        loopDetection, // ✅ Pass loop detection to next iteration
      });
    }, 1000);
  }
  
  console.log("✅ processFlow COMPLETED:", {
    flowId,
    nodeType: node?.type,
    moveToNextNode: result?.moveToNextNode,
  });
}

async function processAutomation({
  uid,
  message,
  user,
  sessionId,
  origin,
  chatId,
}) {
  const incomingText = flowProcessor.extractBodyText(message);

  const { senderMobile, senderName } = message;
  
  // ✅ Skip chatbot flows - they are handled by processWebhook
  // Get all active automation flows (NOT chatbots)
  const automationFlows = await query(
    `SELECT * FROM beta_flows 
     WHERE uid = ? AND is_active = 1 AND source = 'automation'`,
    [uid]
  );

  if (automationFlows?.length < 1) {
    return console.log("User does not have any active automation flow");
  }

  if (!senderMobile) {
    return console.log("Invalid message found", message);
  }

  automationFlows.forEach(async (element) => {
    try {
      const flowData = JSON.parse(element.data) || {};
      const nodes = flowData?.nodes || [];
      const edges = flowData?.edges || [];

      if (nodes?.length < 1 || edges?.length < 1) {
        return console.log(
          "Either nodes or edges length is zero of this automation flow with id:",
          element.flow_id,
        );
      }

      await processFlow({
        nodes,
        edges,
        uid,
        flowId: element.flow_id,
        message,
        incomingText,
        user,
        sessionId,
        origin,
        chatId,
        element,
        loopDetection: { visitedNodes: new Map(), startTime: Date.now() },
      });
    } catch (err) {
      console.log("[processAutomation] forEach error:", err);
    }
  });
}

async function processWebhookAutomation({ webhook, data, type }) {
  try {
    const { uid } = webhook;
    const userFlows = await flowProcessor.getActiveFlows({
      uid: webhook?.uid,
      origin: "webhook_automation",
      webhook,
    });

    if (userFlows?.length < 1) {
      return console.log("User does not have any active automation flow");
    }

    const originData = userFlows[0]?.origin
      ? JSON.parse(userFlows[0]?.origin)
      : {};
    if (originData?.data?.webhook_id !== webhook?.webhook_id) {
      return console.log("This was not for this webhook");
    }

    userFlows.forEach(async (element) => {
      try {
        const flowData = JSON.parse(element.data) || {};
        const nodes = flowData?.nodes || [];
        const edges = flowData?.edges || [];

        const initialNode = nodes?.find((x) => x.id === "initialNode");
        if (!initialNode) {
          return console.log("Initial node not found in webhook hit");
        }

        const mobileNumberFromPath = flowProcessor.getNestedValue(
          initialNode?.data?.whPhonePath,
          data,
        );

        if (!mobileNumberFromPath) {
          return console.log("No number was passed in the webhook");
        }

        const message = { senderMobile: mobileNumberFromPath };
        const { senderMobile } = message;

        if (!senderMobile || !uid) {
          return console.log("Invalid webhook found", { message, webhook });
        }

        if (nodes?.length < 1 || edges?.length < 1) {
          return console.log(
            "Either nodes or edges length is zero of this automation flow with id:",
            element.flow_id,
          );
        }

        const [user] = await query(`SELECT * FROM user WHERE uid = ? LIMIT 1`, [
          uid,
        ]);

        if (user) {
          await processFlow({
            nodes,
            edges,
            uid,
            flowId: element.flow_id,
            message,
            incomingText: "",
            user,
            sessionId: "",
            origin: "webhook_automation",
            chatId: "",
            element,
            webhookVariables: data || {},
            loopDetection: { visitedNodes: new Map(), startTime: Date.now() }, // ✅ Initialize
          });
        }
      } catch (err) {
        console.log(err);
      }
    });
  } catch (err) {
    console.log(err);
  }
}

module.exports = { processAutomation, processWebhookAutomation, processFlow };
