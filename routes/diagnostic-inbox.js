const router = require("express").Router();
const { query } = require("../database/dbpromise.js");
const validateUser = require("../middlewares/user.js");
const axios = require("axios");

/**
 * Diagnostic endpoint to check why inbox is not working for a specific user
 * GET /api/diagnostic/check-inbox/:uid
 */
router.get("/check-inbox/:uid", async (req, res) => {
  try {
    const { uid } = req.params;
    const diagnostics = {
      uid,
      timestamp: new Date().toISOString(),
      checks: {},
      issues: [],
      recommendations: [],
    };

    // 1. Check if user exists
    const [user] = await query(`SELECT * FROM user WHERE uid = ?`, [uid]);
    if (!user) {
      diagnostics.checks.userExists = false;
      diagnostics.issues.push("User not found in database");
      return res.json(diagnostics);
    }
    diagnostics.checks.userExists = true;
    diagnostics.checks.userPlan = user.plan || "unknown";
    diagnostics.checks.userTimezone = user.timezone || "not set";

    // 2. Check Meta API configuration
    const [metaApi] = await query(`SELECT * FROM meta_api WHERE uid = ?`, [uid]);
    if (!metaApi) {
      diagnostics.checks.metaApiConfigured = false;
      diagnostics.issues.push("No Meta API configuration found for this user");
      diagnostics.recommendations.push("User needs to connect Meta WhatsApp API");
      return res.json(diagnostics);
    }
    diagnostics.checks.metaApiConfigured = true;
    diagnostics.checks.metaApi = {
      waba_id: metaApi.waba_id || "not set",
      business_phone_number_id: metaApi.business_phone_number_id || "not set",
      app_id: metaApi.app_id || "not set",
      login_type: metaApi.login_type || "not set",
      has_access_token: !!metaApi.access_token,
      platform_type: metaApi.platform_type || "not set",
      is_coexistence: metaApi.is_coexistence || false,
    };

    // 3. Check webhook subscriptions via Meta API
    if (metaApi.access_token && metaApi.waba_id) {
      try {
        const webhookResponse = await axios.get(
          `https://graph.facebook.com/v19.0/${metaApi.waba_id}/subscribed_apps`,
          {
            headers: { Authorization: `Bearer ${metaApi.access_token}` },
          }
        );

        diagnostics.checks.webhookSubscribed = true;
        diagnostics.checks.webhookFields = webhookResponse.data?.data || [];

        // Check if 'messages' field is subscribed
        const hasMessagesField = webhookResponse.data?.data?.some(
          (app) => app.subscribed_fields?.includes("messages")
        );
        diagnostics.checks.messagesFieldSubscribed = hasMessagesField;

        if (!hasMessagesField) {
          diagnostics.issues.push(
            "Webhook is NOT subscribed to 'messages' field"
          );
          diagnostics.recommendations.push(
            "Subscribe webhook to 'messages' field in Meta App Dashboard"
          );
        }
      } catch (webhookError) {
        diagnostics.checks.webhookSubscribed = false;
        diagnostics.checks.webhookError = webhookError.response?.data || webhookError.message;
        diagnostics.issues.push(
          `Failed to check webhook subscriptions: ${webhookError.message}`
        );
        diagnostics.recommendations.push(
          "Check if access token is valid and has necessary permissions"
        );
      }
    }

    // 4. Check if user has any chats in beta_chats
    const chats = await query(
      `SELECT COUNT(*) as count FROM beta_chats WHERE uid = ? AND origin = 'meta'`,
      [uid]
    );
    diagnostics.checks.chatCount = chats[0]?.count || 0;

    if (chats[0]?.count === 0) {
      diagnostics.issues.push("No Meta chats found for this user");
      diagnostics.recommendations.push(
        "Send a test message to the WhatsApp number to create a chat"
      );
    }

    // 5. Check recent conversations
    const recentMessages = await query(
      `SELECT COUNT(*) as count FROM beta_conversation 
       WHERE uid = ? AND origin = 'meta' AND createdAt > DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
      [uid]
    );
    diagnostics.checks.recentMessageCount = recentMessages[0]?.count || 0;

    if (recentMessages[0]?.count === 0) {
      diagnostics.issues.push("No messages received in last 24 hours");
    }

    // 6. Check latest beta_chats entries
    const latestChats = await query(
      `SELECT chat_id, sender_name, sender_mobile, last_message, origin, createdAt, updatedAt 
       FROM beta_chats WHERE uid = ? ORDER BY updatedAt DESC LIMIT 5`,
      [uid]
    );
    diagnostics.checks.latestChats = latestChats.map((chat) => ({
      chat_id: chat.chat_id,
      sender_name: chat.sender_name,
      sender_mobile: chat.sender_mobile,
      origin: chat.origin,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      has_last_message: !!chat.last_message,
    }));

    // 7. Summary
    if (diagnostics.issues.length === 0) {
      diagnostics.status = "OK";
      diagnostics.summary = "All checks passed. Inbox should be working.";
    } else {
      diagnostics.status = "ISSUES_FOUND";
      diagnostics.summary = `Found ${diagnostics.issues.length} issue(s)`;
    }

    res.json(diagnostics);
  } catch (err) {
    console.error("Diagnostic error:", err);
    res.status(500).json({
      success: false,
      error: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
});

/**
 * Compare two users to identify differences
 * GET /api/diagnostic/compare-users/:uid1/:uid2
 */
router.get("/compare-users/:uid1/:uid2", async (req, res) => {
  try {
    const { uid1, uid2 } = req.params;
    const comparison = {
      uid1,
      uid2,
      differences: [],
    };

    // Get both users' meta_api configs
    const [meta1] = await query(`SELECT * FROM meta_api WHERE uid = ?`, [uid1]);
    const [meta2] = await query(`SELECT * FROM meta_api WHERE uid = ?`, [uid2]);

    if (!meta1 || !meta2) {
      return res.json({
        error: "One or both users don't have Meta API configured",
        meta1: !!meta1,
        meta2: !!meta2,
      });
    }

    // Compare fields
    const fieldsToCompare = [
      "waba_id",
      "business_phone_number_id",
      "app_id",
      "login_type",
      "platform_type",
      "is_coexistence",
    ];

    comparison.user1 = {};
    comparison.user2 = {};

    fieldsToCompare.forEach((field) => {
      comparison.user1[field] = meta1[field];
      comparison.user2[field] = meta2[field];

      if (meta1[field] !== meta2[field]) {
        comparison.differences.push({
          field,
          user1_value: meta1[field],
          user2_value: meta2[field],
        });
      }
    });

    // Compare chat counts
    const [chats1] = await query(
      `SELECT COUNT(*) as count FROM beta_chats WHERE uid = ? AND origin = 'meta'`,
      [uid1]
    );
    const [chats2] = await query(
      `SELECT COUNT(*) as count FROM beta_chats WHERE uid = ? AND origin = 'meta'`,
      [uid2]
    );

    comparison.user1.chatCount = chats1.count;
    comparison.user2.chatCount = chats2.count;

    if (chats1.count !== chats2.count) {
      comparison.differences.push({
        field: "chatCount",
        user1_value: chats1.count,
        user2_value: chats2.count,
      });
    }

    res.json(comparison);
  } catch (err) {
    console.error("Comparison error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
