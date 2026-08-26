const router = require("express").Router();
const crypto = require("crypto");

// ========================================
// WhatsApp Flow Webhook Endpoint
// ========================================

// Webhook verification (GET request)
router.get("/flow", async (req, res) => {
  try {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    // Replace with your actual verify token from Meta settings
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "YOUR_VERIFY_TOKEN";

    console.log("📞 WhatsApp Flow Webhook Verification Request");
    console.log("Mode:", mode);
    console.log("Token:", token);

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("✅ WhatsApp Flow Webhook Verified");
      return res.status(200).send(challenge);
    } else {
      console.log("❌ WhatsApp Flow Webhook Verification Failed");
      return res.status(403).json({ error: "Forbidden" });
    }
  } catch (error) {
    console.error("Error in WhatsApp Flow webhook verification:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Webhook POST endpoint (receives flow data)
router.post("/flow", async (req, res) => {
  try {
    console.log("📨 WhatsApp Flow Webhook Received");
    console.log("Headers:", req.headers);
    console.log("Body:", JSON.stringify(req.body, null, 2));

    // Verify the request signature (optional but recommended)
    const signature = req.headers["x-hub-signature-256"];
    if (signature) {
      const APP_SECRET = process.env.META_APP_SECRET;
      if (APP_SECRET) {
        const expectedSignature = crypto
          .createHmac("sha256", APP_SECRET)
          .update(JSON.stringify(req.body))
          .digest("hex");

        if (signature !== `sha256=${expectedSignature}`) {
          console.log("⚠️ Invalid signature");
          return res.status(403).json({ error: "Invalid signature" });
        }
      }
    }

    // Process the webhook data
    const { entry } = req.body;

    if (entry && entry.length > 0) {
      entry.forEach((item) => {
        const changes = item.changes || [];
        
        changes.forEach((change) => {
          if (change.field === "messages") {
            const value = change.value;
            
            // Handle flow messages
            if (value.messages) {
              value.messages.forEach((message) => {
                console.log("📩 Flow Message:", {
                  from: message.from,
                  type: message.type,
                  timestamp: message.timestamp,
                });

                // Handle interactive flow responses
                if (message.type === "interactive" && message.interactive) {
                  const interactive = message.interactive;
                  
                  if (interactive.type === "nfm_reply") {
                    console.log("🔄 Flow Reply Received:", {
                      flow_token: interactive.nfm_reply.response_json,
                      name: interactive.nfm_reply.name,
                    });

                    // TODO: Process the flow response
                    // You can save this data to your database
                    // or trigger other actions based on the flow response
                  }
                }
              });
            }
          }
        });
      });
    }

    // Always return 200 to acknowledge receipt
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error in WhatsApp Flow webhook:", error);
    // Still return 200 to prevent Meta from retrying
    res.status(200).json({ success: false, error: error.message });
  }
});

module.exports = router;
