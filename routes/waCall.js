const router = require("express").Router();
const { query } = require("../database/dbpromise.js");
const validateUser = require("../middlewares/user.js");
const Stripe = require("stripe");
const {
  checkPlan,
  checkNote,
  checkTags,
  checkContactLimit,
  checkWaWArmer,
  checkWaCall,
} = require("../middlewares/plan.js");
const { getElevenLabsVoices } = require("../functions/function.js");
const {
  processPermissionRequests,
  processBroadcastCalls,
} = require("../helper/addon/wacall/broadcastProcessor.js");
const leadStore = require("../helper/addon/wacall/leadStore.js");
const leadCaller = require("../helper/addon/wacall/leadCaller.js");
const sheetPoller = require("../helper/addon/wacall/sheetPoller.js");
const axios = require("axios");
const stream = require("stream");
const csv = require("csv-parser");

// Parse an uploaded CSV buffer into an array of row objects (header-keyed).
function parseCsvBuffer(buf) {
  return new Promise((resolve) => {
    if (!buf) return resolve([]);
    const rows = [];
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buf);
    bufferStream
      .pipe(csv())
      .on("data", (d) => rows.push(d))
      .on("end", () => resolve(rows))
      .on("error", () => resolve([]));
  });
}

// Forgiving column picker: matches common header names case-insensitively.
function pickField(row, keys) {
  const lower = {};
  for (const k of Object.keys(row)) lower[k.trim().toLowerCase()] = row[k];
  for (const key of keys) {
    const v = lower[key];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

// Escape a value for CSV output.
function csvCell(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// add new beta
router.post("/insert_flow", validateUser, checkPlan, async (req, res) => {
  try {
    const { name, flow_id, data, source = "wa_call" } = req.body;
    if (!name && !flow_id) {
      return res.json({ msg: "Please type a flow name" });
    }

    const sourceTypes = ["wa_call"];

    if (!sourceTypes.includes(source)) {
      return res.json({ msg: `Unknown flow source found: ${source}` });
    }

    if (data?.nodes?.length < 1 || data?.edges?.length < 1) {
      return res.json({ msg: "Blank flow can ot be saved" });
    }

    // checking with the same id
    const [cehckId] = await query(
      `SELECT * FROM wa_call_flows WHERE flow_id = ?`,
      [flow_id],
    );
    if (cehckId) {
      await query(
        `UPDATE wa_call_flows SET name = ?, data = ?, source = ? WHERE flow_id = ?`,
        [name, JSON.stringify(data), source, flow_id],
      );

      res.json({ msg: "Flows was updated", success: true });
    } else {
      await query(
        `INSERT INTO wa_call_flows (uid, flow_id, source, name, data) VALUES (?,?,?,?,?)`,
        [req.decode.uid, flow_id, source, name, JSON.stringify(data)],
      );

      res.json({ msg: "Flows was saved", success: true });
    }
  } catch (err) {
    res.json({ success: false, msg: "something went wrong" });
    console.log(err);
  }
});

// get flows beta
router.get("/get_flows", validateUser, checkPlan, checkWaCall, async (req, res) => {
  try {
    let data = await query(`SELECT * FROM wa_call_flows WHERE uid = ?`, [
      req.decode.uid,
    ]);

    data = data.map((x) => {
      return {
        ...x,
        data: JSON.parse(x.data),
      };
    });

    res.json({ data, success: true });
  } catch (err) {
    res.json({ success: false, msg: "something went wrong" });
    console.log(err);
  }
});

// del flow beta
router.post("/del_flow", validateUser, async (req, res) => {
  try {
    const { id } = req.body;
    await query(`DELETE FROM wa_call_flows WHERE id = ? AND uid = ?`, [
      id,
      req.decode.uid,
    ]);
    res.json({ msg: "Flow was deleted", success: true });
  } catch (err) {
    res.json({ success: false, msg: "something went wrong" });
    console.log(err);
  }
});

// fetch vocies
router.post("/fetch_el_voice", validateUser, async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) {
      return res.json({ msg: "Please provide Elevenlabs API keys" });
    }

    const voicesDataa = await getElevenLabsVoices({ apiKeys: apiKey });
    res.json(voicesDataa);
  } catch (err) {
    res.json({ success: false, msg: "something went wrong", err });
    console.log(err);
  }
});

// Google Gemini free prebuilt TTS voices. These are fixed voice NAMES the
// Gemini TTS API accepts (voiceName), so no API call/key is needed to list them.
const GEMINI_VOICES = [
  "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Aoede",
  "Leda", "Orus", "Callirrhoe", "Autonoe", "Enceladus", "Iapetus",
];

// Provider-aware voice fetch. Body: { apiKey, provider }.
// provider === "gemini"     → returns the fixed prebuilt voice list (free, no key)
// provider === "elevenlabs" → fetches the account's voices via the API key
router.post("/fetch_voices", validateUser, async (req, res) => {
  try {
    const { apiKey, provider = "gemini" } = req.body;

    if (provider === "elevenlabs") {
      // Fall back to the server's ELEVENLABS_API_KEY so the user doesn't have to
      // re-type a key that's already configured in .env.
      const key = apiKey || process.env.ELEVENLABS_API_KEY;
      if (!key) {
        return res.json({ success: false, msg: "No ElevenLabs API key configured. Add ELEVENLABS_API_KEY in .env or enter one." });
      }
      const voicesDataa = await getElevenLabsVoices({ apiKeys: key });
      return res.json(voicesDataa);
    }

    // Default: Gemini free voices (no key required just to list them).
    const voices = GEMINI_VOICES.map((name) => ({ voice_id: name, name }));
    return res.json({ success: true, voices });
  } catch (err) {
    res.json({ success: false, msg: "something went wrong", err: err.message });
    console.log(err);
  }
});

// get call logs
router.get("/call_logs", validateUser, async (req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM wa_call_logs WHERE uid = ? ORDER BY id DESC`,
      [req.decode.uid],
    );

    // Parse the `data` JSON blob so the frontend gets structured fields
    // (transcript = what the customer said + the AI's replies, flow_id, recordingUrl).
    const data = rows.map((row) => {
      let parsed = {};
      try {
        parsed = row.data ? JSON.parse(row.data) : {};
      } catch {
        parsed = {};
      }
      return {
        ...row,
        transcript: Array.isArray(parsed.transcript) ? parsed.transcript : [],
        flow_id: parsed.flow_id || row.flow_id || null,
        recordingUrl: parsed.recordingUrl || null,
        errorMessage: parsed.error || null,
      };
    });

    res.json({ data, success: true });
  } catch (err) {
    res.json({ success: false, msg: "something went wrong", err });
    console.log(err);
  }
});

// bulk delete call logs
router.post("/bulk_delete", validateUser, async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.json({ success: false, msg: "No IDs provided" });
    }

    // Convert IDs to numbers if they're strings
    const numericIds = ids.map((id) => parseInt(id));

    // Verify all logs belong to the user before deleting
    const placeholders = numericIds.map(() => "?").join(",");
    const verifyQuery = `SELECT id FROM wa_call_logs WHERE id IN (${placeholders}) AND uid = ?`;
    const verifyData = await query(verifyQuery, [
      ...numericIds,
      req.decode.uid,
    ]);

    if (verifyData.length !== numericIds.length) {
      return res.json({
        success: false,
        msg: "Unauthorized deletion attempt or some logs not found",
      });
    }

    // Delete the logs
    const deleteQuery = `DELETE FROM wa_call_logs WHERE id IN (${placeholders}) AND uid = ?`;
    await query(deleteQuery, [...numericIds, req.decode.uid]);

    res.json({
      success: true,
      msg: `${numericIds.length} log(s) deleted successfully`,
      deletedCount: numericIds.length,
    });
  } catch (err) {
    res.json({ success: false, msg: "something went wrong", err: err.message });
    console.log(err);
  }
});

// adding call incoming bot
router.post("/add_in_bot", validateUser, checkPlan, async (req, res) => {
  try {
    const { title, flowId } = req.body;

    if (!title || !flowId) {
      return res.json({ msg: "Please type title and select Flow" });
    }

    const [getFlow] = await query(
      `SELECT * FROM wa_call_flows WHERE uid = ? AND flow_id = ?`,
      [req.decode.uid, flowId],
    );
    if (!getFlow) {
      return res.json({
        msg: "Flow does not exist. Please select valid flow once again",
      });
    }

    const [existFlow] = await query(
      `SELECT * FROM wa_call_bot WHERE active = ? AND uid = ?`,
      [1, req.decode.uid],
    );
    if (existFlow) {
      return res.json({
        msg: "An active flow call bot is already running. Please disable that or delete that",
      });
    }

    await query(
      `INSERT INTO wa_call_bot (uid, title, flow_id, active) VALUES (?,?,?,?)`,
      [req.decode.uid, title, getFlow?.flow_id, 1],
    );

    res.json({ msg: "Call Bot was added", success: true });
  } catch (err) {
    res.json({ success: false, msg: "something went wrong", err: err.message });
    console.log(err);
  }
});

// change wa call bot status
router.post(
  "/change_wa_call_bot_status",
  validateUser,
  checkPlan,
  async (req, res) => {
    try {
      const { id, active } = req.body;

      if (parseInt(active) > 0) {
        const [existFlow] = await query(
          `SELECT * FROM wa_call_bot WHERE active = ? AND uid = ?`,
          [1, req.decode.uid],
        );
        if (existFlow) {
          return res.json({
            msg: "An active flow call bot is already running. Please disable that or delete that",
          });
        }
      }

      await query(
        `UPDATE wa_call_bot SET active = ? WHERE uid = ? AND id = ?`,
        [parseInt(active) > 0 ? 1 : 0, req.decode.uid, id],
      );

      res.json({ success: true, msg: "Status changed" });
    } catch (err) {
      res.json({
        success: false,
        msg: "something went wrong",
        err: err.message,
      });
      console.log(err);
    }
  },
);

// get running bot
router.get("/get_call_bot", validateUser, checkPlan, checkWaCall, async (req, res) => {
  try {
    const data = await query(`SELECT * FROM wa_call_bot WHERE uid = ?`, [
      req.decode.uid,
    ]);
    res.json({ data, success: true });
  } catch (err) {
    res.json({
      success: false,
      msg: "something went wrong",
      err: err.message,
    });
    console.log(err);
  }
});

// del a call in bot
router.post("/del_call_bot", validateUser, checkPlan, async (req, res) => {
  try {
    const { id } = req.body;
    await query(`DELETE FROM wa_call_bot WHERE id = ? AND uid = ?`, [
      id,
      req.decode.uid,
    ]);
    res.json({ msg: "Bot was deleted", success: true });
  } catch (err) {
    res.json({
      success: false,
      msg: "something went wrong",
      err: err.message,
    });
    console.log(err);
  }
});

// Create new broadcast campaign
router.post("/create_broadcast", validateUser, checkPlan, async (req, res) => {
  try {
    const { title, flowId, phonebook, settings = {} } = req.body;

    if (!title || !flowId) {
      return res.json({ msg: "Title and Flow are required" });
    }

    const contacts = await query(
      `SELECT * FROM contact WHERE uid = ? AND phonebook_id = ?`,
      [req.decode.uid, phonebook?.id],
    );

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return res.json({ msg: "At least one contact is required" });
    }

    // Validate flow exists
    const [flow] = await query(
      `SELECT * FROM wa_call_flows WHERE uid = ? AND flow_id = ?`,
      [req.decode.uid, flowId],
    );

    if (!flow) {
      return res.json({ msg: "Selected flow does not exist" });
    }

    // Generate campaign ID
    const campaignId = `BC_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Prepare contacts with initial status
    const preparedContacts = contacts.map((contact, index) => ({
      id: `${campaignId}_${index}`,
      name: contact.name || "",
      mobile: contact.mobile,
      var1: contact.var1 || "",
      var2: contact.var2 || "",
      var3: contact.var3 || "",
      var4: contact.var4 || "",
      var5: contact.var5 || "",
      permission_status: "pending", // pending, requested, granted, denied, expired
      permission_requested_at: null,
      permission_granted_at: null,
      permission_expires_at: null,
      permission_type: null, // temporary, permanent
      call_status: "pending", // pending, ringing, answered, completed, failed, rejected
      call_id: null,
      call_initiated_at: null,
      call_completed_at: null,
      call_duration: null,
      error_message: null,
      retry_count: 0,
    }));

    const campaignData = {
      uid: req.decode.uid,
      campaign_id: campaignId,
      title,
      flow_id: flowId,
      status: "draft",
      contacts: JSON.stringify(preparedContacts),
      call_delay: settings.callDelay || 5000,
      max_concurrent_calls: settings.maxConcurrentCalls || 1,
      retry_failed: settings.retryFailed ? 1 : 0,
      retry_count: settings.retryCount || 0,
      total_contacts: preparedContacts.length,
      logs: JSON.stringify([
        {
          timestamp: new Date().toISOString(),
          type: "campaign_created",
          message: `Campaign created with ${preparedContacts.length} contacts`,
        },
      ]),
      meta_data: JSON.stringify({
        flow_name: flow.name,
        created_by: req.decode.uid,
      }),
    };

    await query(`INSERT INTO wa_call_broadcasts SET ?`, campaignData);

    res.json({
      success: true,
      msg: "Broadcast campaign created successfully",
      campaignId,
    });
  } catch (err) {
    console.error("Error creating broadcast:", err);
    res.json({ success: false, msg: "Failed to create broadcast campaign" });
  }
});

// Get all broadcasts for user
router.get("/get_broadcasts", validateUser, checkPlan, checkWaCall, async (req, res) => {
  try {
    const broadcasts = await query(
      `SELECT * FROM wa_call_broadcasts WHERE uid = ? ORDER BY created_at DESC`,
      [req.decode.uid],
    );

    const formattedBroadcasts = broadcasts.map((b) => ({
      ...b,
      contacts: JSON.parse(b.contacts || "[]"),
      logs: JSON.parse(b.logs || "[]"),
      meta_data: JSON.parse(b.meta_data || "{}"),
    }));

    res.json({ success: true, data: formattedBroadcasts });
  } catch (err) {
    console.error("Error fetching broadcasts:", err);
    res.json({ success: false, msg: "Failed to fetch broadcasts" });
  }
});

// Get single broadcast details
router.get(
  "/get_broadcast/:campaignId",
  validateUser,
  checkPlan,
  async (req, res) => {
    try {
      const { campaignId } = req.params;

      const [broadcast] = await query(
        `SELECT * FROM wa_call_broadcasts WHERE campaign_id = ? AND uid = ?`,
        [campaignId, req.decode.uid],
      );

      if (!broadcast) {
        return res.json({ success: false, msg: "Broadcast not found" });
      }

      const formattedBroadcast = {
        ...broadcast,
        contacts: JSON.parse(broadcast.contacts || "[]"),
        logs: JSON.parse(broadcast.logs || "[]"),
        meta_data: JSON.parse(broadcast.meta_data || "{}"),
      };

      res.json({ success: true, data: formattedBroadcast });
    } catch (err) {
      console.error("Error fetching broadcast:", err);
      res.json({ success: false, msg: "Failed to fetch broadcast" });
    }
  },
);

// Start permission request phase
router.post(
  "/start_permission_request",
  validateUser,
  checkPlan,
  async (req, res) => {
    try {
      const { campaignId } = req.body;

      const [broadcast] = await query(
        `SELECT * FROM wa_call_broadcasts WHERE campaign_id = ? AND uid = ?`,
        [campaignId, req.decode.uid],
      );

      if (!broadcast) {
        return res.json({ success: false, msg: "Broadcast not found" });
      }

      if (broadcast.status !== "draft") {
        return res.json({ success: false, msg: "Campaign already started" });
      }

      // Update status
      await query(
        `UPDATE wa_call_broadcasts SET status = 'requesting_permissions', started_at = NOW() WHERE campaign_id = ?`,
        [campaignId],
      );

      // Add log
      const logs = JSON.parse(broadcast.logs || "[]");
      logs.push({
        timestamp: new Date().toISOString(),
        type: "permission_phase_started",
        message: "Started requesting call permissions from contacts",
      });

      await query(
        `UPDATE wa_call_broadcasts SET logs = ? WHERE campaign_id = ?`,
        [JSON.stringify(logs), campaignId],
      );

      // Trigger permission request process (async)
      setImmediate(() => {
        processPermissionRequests(campaignId, req.decode.uid);
      });

      res.json({
        success: true,
        msg: "Permission request phase started",
      });
    } catch (err) {
      console.error("Error starting permission request:", err);
      res.json({ success: false, msg: "Failed to start permission request" });
    }
  },
);

// Start calling phase (after permissions granted)
router.post("/start_calling", validateUser, checkPlan, async (req, res) => {
  try {
    const { campaignId } = req.body;

    const [broadcast] = await query(
      `SELECT * FROM wa_call_broadcasts WHERE campaign_id = ? AND uid = ?`,
      [campaignId, req.decode.uid],
    );

    if (!broadcast) {
      return res.json({ success: false, msg: "Broadcast not found" });
    }

    if (!["ready", "paused"].includes(broadcast.status)) {
      return res.json({
        success: false,
        msg: "Campaign not ready to start calling",
      });
    }

    // Update status
    await query(
      `UPDATE wa_call_broadcasts SET status = 'running' WHERE campaign_id = ?`,
      [campaignId],
    );

    // Add log
    const logs = JSON.parse(broadcast.logs || "[]");
    logs.push({
      timestamp: new Date().toISOString(),
      type: "calling_phase_started",
      message: "Started making calls to contacts with granted permissions",
    });

    await query(
      `UPDATE wa_call_broadcasts SET logs = ? WHERE campaign_id = ?`,
      [JSON.stringify(logs), campaignId],
    );

    // ✅ FIX: Trigger calling process (async)
    setImmediate(() => {
      processBroadcastCalls(campaignId, req.decode.uid);
    });

    res.json({
      success: true,
      msg: "Calling phase started",
    });
  } catch (err) {
    console.error("Error starting calling:", err);
    res.json({ success: false, msg: "Failed to start calling" });
  }
});

// Pause broadcast
router.post("/pause_broadcast", validateUser, checkPlan, async (req, res) => {
  try {
    const { campaignId } = req.body;

    await query(
      `UPDATE wa_call_broadcasts SET status = 'paused' WHERE campaign_id = ? AND uid = ?`,
      [campaignId, req.decode.uid],
    );

    res.json({ success: true, msg: "Broadcast paused" });
  } catch (err) {
    console.error("Error pausing broadcast:", err);
    res.json({ success: false, msg: "Failed to pause broadcast" });
  }
});

// Delete broadcast
router.post("/delete_broadcast", validateUser, checkPlan, async (req, res) => {
  try {
    const { campaignId } = req.body;

    const [broadcast] = await query(
      `SELECT status FROM wa_call_broadcasts WHERE campaign_id = ? AND uid = ?`,
      [campaignId, req.decode.uid],
    );

    if (!broadcast) {
      return res.json({ success: false, msg: "Broadcast not found" });
    }

    if (broadcast.status === "running") {
      return res.json({
        success: false,
        msg: "Cannot delete running broadcast. Pause it first.",
      });
    }

    await query(
      `DELETE FROM wa_call_broadcasts WHERE campaign_id = ? AND uid = ?`,
      [campaignId, req.decode.uid],
    );

    res.json({ success: true, msg: "Broadcast deleted" });
  } catch (err) {
    console.error("Error deleting broadcast:", err);
    res.json({ success: false, msg: "Failed to delete broadcast" });
  }
});

// Update contact status (called by webhook)
router.post("/update_broadcast_contact", async (req, res) => {
  try {
    const { campaignId, contactMobile, updates } = req.body;

    const [broadcast] = await query(
      `SELECT * FROM wa_call_broadcasts WHERE campaign_id = ?`,
      [campaignId],
    );

    if (!broadcast) {
      return res.json({ success: false, msg: "Broadcast not found" });
    }

    const contacts = JSON.parse(broadcast.contacts || "[]");
    const contactIndex = contacts.findIndex((c) => c.mobile === contactMobile);

    if (contactIndex === -1) {
      return res.json({ success: false, msg: "Contact not found" });
    }

    // Update contact
    contacts[contactIndex] = {
      ...contacts[contactIndex],
      ...updates,
    };

    // Update statistics
    let statsUpdate = {};

    if (updates.permission_status === "requested") {
      statsUpdate.permission_requested = broadcast.permission_requested + 1;
    }
    if (updates.permission_status === "granted") {
      statsUpdate.permission_granted = broadcast.permission_granted + 1;
    }
    if (updates.permission_status === "denied") {
      statsUpdate.permission_denied = broadcast.permission_denied + 1;
    }
    if (updates.call_status === "ringing") {
      statsUpdate.calls_initiated = broadcast.calls_initiated + 1;
    }
    if (updates.call_status === "completed") {
      statsUpdate.calls_completed = broadcast.calls_completed + 1;
    }
    if (updates.call_status === "failed") {
      statsUpdate.calls_failed = broadcast.calls_failed + 1;
    }

    // Build update query
    let updateQuery = `UPDATE wa_call_broadcasts SET contacts = ?`;
    let updateParams = [JSON.stringify(contacts)];

    Object.keys(statsUpdate).forEach((key) => {
      updateQuery += `, ${key} = ?`;
      updateParams.push(statsUpdate[key]);
    });

    updateQuery += ` WHERE campaign_id = ?`;
    updateParams.push(campaignId);

    await query(updateQuery, updateParams);

    res.json({ success: true, msg: "Contact updated" });
  } catch (err) {
    console.error("Error updating contact:", err);
    res.json({ success: false, msg: "Failed to update contact" });
  }
});

// Single endpoint - Check and Enable in ONE request
router.post(
  "/check_and_enable_call_permission",
  validateUser,
  async (req, res) => {
    try {
      const [metaAPI] = await query(`SELECT * FROM meta_api WHERE uid = ?`, [
        req.decode.uid,
      ]);

      if (!metaAPI?.access_token || !metaAPI?.business_phone_number_id) {
        return res.json({
          success: false,
          msg: "Please setup your META API from the profile => META API option",
        });
      }

      const phoneNumberId = metaAPI?.business_phone_number_id;
      const accessToken = metaAPI?.access_token;

      // Try to enable calling directly
      try {
        const enableResponse = await axios.post(
          `https://graph.facebook.com/v20.0/${phoneNumberId}/settings`,
          {
            calling: {
              status: "ENABLED",
              call_icon_visibility: "DEFAULT",
              callback_permission_status: "ENABLED",
            },
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          },
        );

        console.log("Enable response:", enableResponse.data);

        return res.json({
          success: true,
          msg: "✅ WhatsApp calling has been enabled successfully!",
        });
      } catch (enableError) {
        console.error(
          "Error enabling call permission:",
          enableError.response?.data || enableError.message,
        );

        return res.json({
          success: false,
          msg:
            enableError.response?.data?.error?.message ||
            "Failed to enable call feature. Please try again.",
        });
      }
    } catch (error) {
      console.error("Unexpected error:", error);
      res.json({
        success: false,
        msg: "An unexpected error occurred. Please try again.",
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// LEAD AUTO-CALL  (leads from ad campaigns → auto WhatsApp AI call)
// ═════════════════════════════════════════════════════════════════════════════

// ── Settings: get (also returns the webhook URL to paste into ad forms) ────────
router.get("/lead/settings", validateUser, checkPlan, checkWaCall, async (req, res) => {
  try {
    const settings = await leadStore.getSettings(req.decode.uid);
    res.json({ success: true, data: settings });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "something went wrong", err: err.message });
  }
});

// ── Settings: update (auto_call toggle, flow, permission text, sheet config) ───
router.post("/lead/settings", validateUser, checkPlan, checkWaCall, async (req, res) => {
  try {
    const {
      auto_call,
      flow_id,
      permission_text,
      sheet_enabled,
      sheet_url,
      sheet_poll_minutes,
      voice_provider,
      eleven_api_key,
      gemini_api_key,
      openrouter_api_key,
      openrouter_model,
      default_voice_id,
      default_language,
    } = req.body;

    const patch = {};
    if (auto_call !== undefined) patch.auto_call = auto_call ? 1 : 0;
    if (flow_id !== undefined) patch.flow_id = flow_id || null;
    if (permission_text !== undefined) patch.permission_text = permission_text || null;
    if (sheet_enabled !== undefined) patch.sheet_enabled = sheet_enabled ? 1 : 0;
    if (sheet_url !== undefined) patch.sheet_url = sheet_url || null;
    if (sheet_poll_minutes !== undefined)
      patch.sheet_poll_minutes = Math.max(1, parseInt(sheet_poll_minutes) || 5);
    // Global AI-calling keys — saved once, used by every flow.
    if (voice_provider !== undefined) patch.voice_provider = voice_provider || null;
    if (eleven_api_key !== undefined) patch.eleven_api_key = eleven_api_key || null;
    if (gemini_api_key !== undefined) patch.gemini_api_key = gemini_api_key || null;
    if (openrouter_api_key !== undefined) patch.openrouter_api_key = openrouter_api_key || null;
    if (openrouter_model !== undefined) patch.openrouter_model = openrouter_model || null;
    if (default_voice_id !== undefined) patch.default_voice_id = default_voice_id || null;
    if (default_language !== undefined) patch.default_language = default_language || null;

    const settings = await leadStore.updateSettings(req.decode.uid, patch);
    res.json({ success: true, msg: "Settings saved", data: settings });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "something went wrong", err: err.message });
  }
});

// ── Settings: regenerate webhook token (rotate the public URL) ─────────────────
router.post("/lead/regen_token", validateUser, checkPlan, checkWaCall, async (req, res) => {
  try {
    const token = await leadStore.regenerateToken(req.decode.uid);
    res.json({ success: true, token });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "something went wrong", err: err.message });
  }
});

// ── List leads ─────────────────────────────────────────────────────────────────
router.get("/lead/list", validateUser, checkPlan, checkWaCall, async (req, res) => {
  try {
    const data = await leadStore.listLeads(req.decode.uid);
    res.json({ success: true, data });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "something went wrong", err: err.message });
  }
});

// ── Add a single lead manually (optionally auto-call) ──────────────────────────
router.post("/lead/add", validateUser, checkPlan, checkWaCall, async (req, res) => {
  try {
    const { name, mobile, email, extra } = req.body;
    if (!mobile) return res.json({ success: false, msg: "Mobile is required" });

    const { lead, isNew } = await leadStore.insertLead(req.decode.uid, {
      name,
      mobile,
      email,
      source: "manual",
      extra,
    });
    if (!lead) return res.json({ success: false, msg: "Invalid mobile number" });
    if (!isNew) return res.json({ success: false, msg: "Lead with this mobile already exists" });

    // Fire auto-call if enabled.
    leadCaller.onNewLead(req.decode.uid, lead).catch(() => {});
    res.json({ success: true, msg: "Lead added", data: lead });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "something went wrong", err: err.message });
  }
});

// ── Bulk upload leads from CSV file ────────────────────────────────────────────
// Field name: "file". Recognized columns (case-insensitive): name, mobile/phone,
// email; all other columns are stored in each lead's `extra`.
router.post("/lead/upload", validateUser, checkPlan, checkWaCall, async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.json({ success: false, msg: "No file uploaded" });
    }
    const file = req.files.file;
    const name = (file.name || "").toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      return res.json({
        success: false,
        msg: "Excel detected. Please save the sheet as CSV (File → Save As → CSV) and upload that. CSV import is fully supported.",
      });
    }

    const rows = await parseCsvBuffer(file.data);
    if (!rows.length) return res.json({ success: false, msg: "CSV appears empty or invalid" });

    let added = 0;
    let skipped = 0;
    for (const row of rows) {
      const mobile = pickField(row, [
        "mobile", "phone", "number", "phone number", "contact", "whatsapp",
      ]);
      if (!mobile) {
        skipped += 1;
        continue;
      }
      const leadName = pickField(row, ["name", "full name", "fullname", "first name"]);
      const email = pickField(row, ["email", "e-mail", "mail"]);
      const { lead, isNew } = await leadStore.insertLead(req.decode.uid, {
        name: leadName,
        mobile,
        email,
        source: "upload",
        extra: row,
      });
      if (isNew && lead) {
        added += 1;
        leadCaller.onNewLead(req.decode.uid, lead).catch(() => {});
      } else {
        skipped += 1;
      }
    }

    res.json({ success: true, msg: `Imported ${added} lead(s), skipped ${skipped}`, added, skipped });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "something went wrong", err: err.message });
  }
});

// ── Manually (re)trigger a call for one lead ───────────────────────────────────
router.post("/lead/call", validateUser, checkPlan, checkWaCall, async (req, res) => {
  try {
    const { id } = req.body;
    const lead = await leadStore.getLead(id);
    if (!lead || lead.uid !== req.decode.uid) {
      return res.json({ success: false, msg: "Lead not found" });
    }
    const result = await leadCaller.triggerCallForLead(req.decode.uid, lead);
    if (result.started) {
      const msg = result.direct
        ? "Permission already granted — placing the call now."
        : result.waiting
          ? "This person was asked recently. Waiting for them to tap Allow (Meta limits repeat requests)."
          : "Call started — sending WhatsApp permission request. The AI calls once they tap Allow.";
      res.json({ success: true, msg });
    } else {
      const reasons = {
        no_flow: "Select a valid call flow in settings first.",
        no_meta_api: "Configure META API in Profile first.",
        no_mobile: "Lead has no valid mobile number.",
        in_flight: "A call for this lead is already in progress. Wait a moment or restart, then retry.",
        send_failed: result.error
          ? `WhatsApp couldn't send the call request: ${result.error}`
          : "WhatsApp couldn't send the call-permission request. Check META API + that Calling is enabled on your number.",
      };
      res.json({ success: false, msg: reasons[result.reason] || `Could not start call: ${result.error || result.reason}` });
    }
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "something went wrong", err: err.message });
  }
});

// ── Delete a lead ──────────────────────────────────────────────────────────────
router.post("/lead/delete", validateUser, checkPlan, checkWaCall, async (req, res) => {
  try {
    const { id } = req.body;
    await leadStore.deleteLead(req.decode.uid, id);
    res.json({ success: true, msg: "Lead deleted" });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "something went wrong", err: err.message });
  }
});

// ── Export leads as CSV (opens directly in Excel) ──────────────────────────────
router.get("/lead/export", validateUser, checkPlan, checkWaCall, async (req, res) => {
  try {
    const leads = await leadStore.listLeads(req.decode.uid);
    const header = [
      "Name", "Mobile", "Email", "Source", "Status",
      "Permission", "Call Status", "Duration (s)", "Created", "Transcript",
    ];
    const lines = [header.map(csvCell).join(",")];
    for (const l of leads) {
      const transcriptText = (l.transcript || [])
        .map((t) => `${t.role || t.speaker || ""}: ${t.text || t.message || ""}`)
        .join(" | ");
      lines.push(
        [
          l.name, l.mobile, l.email, l.source, l.status,
          l.permission_status, l.call_status, l.call_duration,
          l.createdAt, transcriptText,
        ].map(csvCell).join(","),
      );
    }
    const out = lines.join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="leads.csv"');
    res.send(out);
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "something went wrong", err: err.message });
  }
});

// ── Test a Google Sheet URL (reports rows/columns or the exact problem) ────────
router.post("/lead/sheet_test", validateUser, checkPlan, checkWaCall, async (req, res) => {
  try {
    const { sheet_url } = req.body;
    const url = sheet_url || (await leadStore.getSettings(req.decode.uid)).sheet_url;
    if (!url) return res.json({ success: false, msg: "No sheet URL to test" });
    const result = await sheetPoller.testSheet(url);
    res.json({ success: result.ok, ...result });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "something went wrong", err: err.message });
  }
});

// ── Import sheet rows right now (don't wait for the 60s poller) ────────────────
// Body: { from_start } — when true, resets sheet_last_row to 0 so ALL current
// rows are (re)imported. Otherwise only rows after sheet_last_row are imported.
router.post("/lead/sheet_import_now", validateUser, checkPlan, checkWaCall, async (req, res) => {
  try {
    const uid = req.decode.uid;
    const { from_start } = req.body;
    let settings = await leadStore.getSettings(uid);
    if (!settings.sheet_url) return res.json({ success: false, msg: "No sheet URL configured" });

    // Verify readable first so we can return a helpful error.
    const test = await sheetPoller.testSheet(settings.sheet_url);
    if (!test.ok) return res.json({ success: false, msg: test.msg });

    // Detection is now content-based (dedupe by phone), so from_start is a
    // no-op kept for UI compatibility — every fetch scans all rows and imports
    // only phone numbers not already in the leads table.
    const result = await sheetPoller.pollUserSheet(settings);
    const imported = result?.imported || 0;

    res.json({
      success: true,
      imported,
      msg: imported > 0
        ? `Imported ${imported} new lead(s) from the sheet.`
        : `No new leads found (all ${result?.seen || 0} row(s) are already in your leads list). Add a new row with a new phone number to trigger a call.`,
    });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "something went wrong", err: err.message });
  }
});

// ── PUBLIC webhook: ad forms / Zapier / Make POST leads here (no auth) ──────────
// URL: POST /api/wa_call/lead_hook/:uid/:token
// Body: flexible JSON. We look for name/phone/email in common shapes, including
// Meta Lead Ads `field_data` arrays. Everything else is kept in `extra`.
router.post("/lead_hook/:uid/:token", async (req, res) => {
  try {
    const { uid, token } = req.params;
    const settings = await leadStore.getSettingsByToken(uid, token);
    if (!settings) {
      return res.status(403).json({ success: false, msg: "Invalid webhook token" });
    }

    const body = req.body || {};

    // Flatten Meta Lead Ads style: { field_data: [{ name, values:[...] }, ...] }
    let flat = { ...body };
    if (Array.isArray(body.field_data)) {
      for (const f of body.field_data) {
        const key = (f.name || f.key || "").toLowerCase();
        const val = Array.isArray(f.values) ? f.values[0] : f.value;
        if (key) flat[key] = val;
      }
    }

    const mobile = pickField(flat, [
      "mobile", "phone", "number", "phone_number", "phone number", "contact", "whatsapp",
    ]);
    if (!mobile) {
      return res.json({ success: false, msg: "No phone/mobile field found in payload" });
    }
    const name = pickField(flat, ["name", "full_name", "full name", "fullname", "first_name"]);
    const email = pickField(flat, ["email", "e-mail", "mail"]);

    const { lead, isNew } = await leadStore.insertLead(uid, {
      name,
      mobile,
      email,
      source: "webhook",
      extra: flat,
    });

    if (isNew && lead) {
      leadCaller.onNewLead(uid, lead).catch(() => {});
    }

    res.json({ success: true, isNew, msg: isNew ? "Lead captured" : "Duplicate lead ignored" });
  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "something went wrong", err: err.message });
  }
});

module.exports = router;
