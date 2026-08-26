const router = require("express").Router();
const { query } = require("../database/dbpromise.js");
const randomstring = require("randomstring");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");
const {
  isValidEmail,
  getFileExtension,
  saveJsonToFile,
  saveWebhookConversation,
  readJSONFile,
  sendMetaMsg,
  mergeArrays,
  botWebhook,
  sendMetatemplet,
  updateMetaTempletInMsg,
  getUserPlayDays,
  deleteFileIfExists,
  importChatsFromv3,
  importConversationsFromJson,
  parseJson,
  handleWAFormSubmission,
} = require("../functions/function.js");
const { sign } = require("jsonwebtoken");
const validateUser = require("../middlewares/user.js");
const { getIOInstance } = require("../socket.js");
const { checkPlan } = require("../middlewares/plan.js");
const { processMessage } = require("../helper/inbox/inbox.js");
const con = require("../database/config.js");
const { updateMessageStatus } = require("../loops/campaignBeta.js");
const {
  updateMessageStatus: updateMessageStatusAPI,
} = require("../functions/apiMessages");

const { handleCalls } = require("../helper/addon/wacall/wacall.js");
const {
  handleBroadcastCallConnect,
  handleBroadcastCallTerminate,
  outgoingCallStates,
} = require("../helper/addon/wacall/broadcastProcessor.js");

// ✅ File logger — writes to log.txt in same directory
function logToFile(label, data) {
  try {
    const filePath = path.join(__dirname, "log.txt");
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${label}] ${typeof data === "object" ? JSON.stringify(data, null, 2) : data}\n${"─".repeat(80)}\n`;
    fs.appendFileSync(filePath, line, "utf-8");
  } catch (err) {
    // silent fail — never crash the webhook
  }
}

// ✅ Appends a webhook payload object to data.json in the same directory
function appendWebhookToFile(data) {
  try {
    const filePath = path.join(__dirname, "data.json");

    let existing = [];

    // Read existing data if file exists
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      try {
        existing = JSON.parse(raw);
        if (!Array.isArray(existing)) existing = [];
      } catch {
        existing = [];
      }
    }

    // Push new entry with timestamp
    existing.push({
      receivedAt: new Date().toISOString(),
      payload: data,
    });

    // Write back
    fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), "utf-8");
  } catch (err) {
    console.error("❌ Failed to write webhook to data.json:", err);
  }
}

// WhatsApp Webhook Verification
router.get("/embed/webhook/:uid", async (req, res) => {
  try {
    const { uid } = req.params;
    
    // Check if it's a user UID or admin UID
    const [user] = await query(`SELECT uid FROM user WHERE uid = ?`, [uid]);
    const [admin] = await query(`SELECT uid FROM admin WHERE uid = ?`, [uid]);
    
    let VERIFY_TOKEN = null;
    
    if (user) {
      VERIFY_TOKEN = user.uid;
    } else if (admin) {
      VERIFY_TOKEN = admin.uid;
    } else {
      // Fallback to first admin UID for backward compatibility
      const [firstAdmin] = await query(`SELECT uid FROM admin LIMIT 1`);
      if (firstAdmin) {
        VERIFY_TOKEN = firstAdmin.uid;
      }
    }
    
    if (!VERIFY_TOKEN) {
      console.error('❌ No valid UID found for webhook verification');
      return res.sendStatus(400);
    }

    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    console.log('📥 Webhook verification request:', {
      mode,
      token,
      challenge: challenge ? 'exists' : 'missing',
      expectedToken: VERIFY_TOKEN,
      providedUID: uid
    });

    if (!mode || !token) {
      console.error('❌ Missing mode or token in webhook verification');
      return res.sendStatus(400);
    }

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("✅ WHATSAPP WEBHOOK VERIFIED");
      return res.status(200).send(challenge);
    }

    console.error('❌ Webhook verification failed: token mismatch');
    return res.sendStatus(403);
  } catch (err) {
    console.error('❌ Webhook verification error:', err);
    return res.sendStatus(500);
  }
});

router.post("/embed/webhook/:uid", async (req, res) => {
  try {
    const body = req.body;
    res.sendStatus(200);

    const statuses = body?.entry?.[0]?.changes?.[0]?.value?.statuses;

    // Handle message status updates
    if (req.body && req.body.entry) {
      for (const entry of req.body.entry) {
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.value && change.value.statuses) {
              for (const status of change.value.statuses) {
                if (status.id) {
                  await updateMessageStatus(status.id, status.status);
                }
              }
            }
          }
        }
      }
    }

    // updating API logs
    if (statuses?.length > 0) {
      const { status, id } = statuses[0];
      const errorData = JSON.stringify(body);

      if (status === "failed") {
        await query(
          `UPDATE beta_api_logs SET status = ?, err = ? WHERE msg_id = ?`,
          [status, errorData, id],
        );
      } else if (id) {
        await query(`UPDATE beta_api_logs SET status = ? WHERE msg_id = ?`, [
          status,
          id,
        ]);
      }
    }

    if (statuses?.length > 0) {
      const { status, id } = statuses[0];
      const errorData = JSON.stringify(body);

      if (status === "failed") {
        await query(
          `UPDATE beta_campaign_logs SET delivery_status = ?, error_message = ? WHERE meta_msg_id = ?`,
          [status, errorData, id],
        );
      } else if (id) {
        await query(
          `UPDATE beta_campaign_logs SET delivery_status = ? WHERE meta_msg_id = ?`,
          [status, id],
        );
      }
    }

    const changes = body?.entry[0]?.changes[0];
    const phoneNumId = changes?.value?.metadata?.phone_number_id;
    const wabaId = body?.entry[0]?.id;

    logToFile("EXTRACTED_IDS", { phoneNumId, wabaId });

    let userUID = null;

    if (phoneNumId) {
      logToFile("QUERYING_META_API", { wabaId, phoneNumId });

      const getMyMetaApi = await query(
        `SELECT * FROM meta_api WHERE business_phone_number_id = ?`,
        [phoneNumId],
      );

      logToFile("META_API_QUERY_RESULT", getMyMetaApi);

      if (!getMyMetaApi || getMyMetaApi.length < 1) {
        logToFile("BLOCKED", "No meta_api record found for this phoneNumId");
        return;
      }

      // ✅ Match by phoneNumId directly — no ambiguity
      const matchedApi = getMyMetaApi[0];
      userUID = matchedApi.uid;

      logToFile("USER_UID_RESOLVED", { userUID });

      const getDays = await getUserPlayDays(userUID);
      logToFile("USER_PLAY_DAYS", { userUID, getDays });

      if (getDays < 1) {
        logToFile("BLOCKED", "User plan expired");
        return;
      }
    } else {
      logToFile(
        "BLOCKED",
        "phoneNumId is null/undefined — skipping user lookup",
      );
    }

    logToFile("USER_UID_FINAL", { userUID });

    if (!userUID) {
      logToFile("BLOCKED", "userUID is null — returning");
      return;
    }

    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];

    if (!change) {
      logToFile("BLOCKED", "No change data found");
      return;
    }

    logToFile("CHANGE_FIELD", { field: change.field });

    switch (change.field) {
      case "messages":
        logToFile("PROCESSING", "Calling processMessage");
        await processMessage({
          body,
          uid: userUID,
          origin: "meta",
        });
        logToFile("PROCESSING", "processMessage done");

        const messages = change.value?.messages || [];
        for (const message of messages) {
          if (
            message.type === "interactive" &&
            message.interactive?.type === "call_permission_reply"
          ) {
            const reply = message.interactive.call_permission_reply;
            const fromNumber = message.from;

            logToFile("CALL_PERMISSION_REPLY", { fromNumber, reply });

            if (reply.response === "accept") {
              await updateBroadcastContactPermission(
                fromNumber,
                "granted",
                reply,
              );
            } else if (reply.response === "reject") {
              await updateBroadcastContactPermission(
                fromNumber,
                "denied",
                reply,
              );
            }
          }
        }
        break;

      case "calls":
        const callEvents = change.value.calls || [];
        const callStatuses = change.value.statuses || [];

        for (const callEvent of callEvents) {
          const callId = callEvent.id;
          const callbackData = callEvent.biz_opaque_callback_data;

          logToFile("CALL_EVENT", {
            callId,
            event: callEvent.event,
            callbackData,
          });

          let isBroadcastCall = false;
          let parsedCallbackData = null;

          if (callbackData) {
            try {
              parsedCallbackData = JSON.parse(callbackData);
              isBroadcastCall = !!parsedCallbackData.campaign_id;
              logToFile("CALL_CALLBACK_PARSED", {
                callId,
                parsedCallbackData,
                isBroadcastCall,
              });
            } catch (e) {
              logToFile("CALL_CALLBACK_PARSE_ERROR", {
                callId,
                error: e.message,
              });
            }
          }

          if (isBroadcastCall) {
            logToFile("CALL_TYPE", { callId, type: "broadcast" });

            if (callEvent.event === "connect" && callEvent.session) {
              await handleBroadcastCallConnect(
                callId,
                callEvent.session,
                callbackData,
              );
            }

            if (callEvent.event === "terminate") {
              await handleBroadcastCallTerminate(
                callId,
                callEvent.status,
                callEvent.duration,
                callbackData,
              );
            }
          } else {
            logToFile("CALL_TYPE", { callId, type: "incoming" });
            await handleCalls(change, userUID, body);
          }
        }

        for (const status of callStatuses) {
          const callId = status.id;
          const isBroadcastCall = outgoingCallStates.has(callId);

          if (isBroadcastCall) {
            const callState = outgoingCallStates.get(callId);
            if (callState) {
              const { campaignId, contact } = callState;
              logToFile("CALL_STATUS_UPDATE", {
                callId,
                status: status.status,
              });

              if (status.status === "REJECTED") {
                await updateContactInBroadcast(campaignId, contact.mobile, {
                  call_status: "rejected",
                });
              }
            }
          }
        }
        break;

      default:
        logToFile("UNKNOWN_FIELD", { field: change.field });
        break;
    }
  } catch (err) {
    logToFile("FATAL_ERROR", { message: err.message, stack: err.stack });
    res.json({ err, success: false, msg: "Something went wrong" });
  }
});

router.post("/webhook/:uid", async (req, res) => {
  try {
    const body = req.body;
    const userUID = req.params.uid;

    // ✅ ACK immediately
    res.sendStatus(200);

    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];

    if (!change) {
      console.log("⚠️ No change data");
      return;
    }

    switch (change.field) {
      case "messages":
        await handleMessages(change, userUID, body);

        await handleWAFormSubmission(change, userUID);

        // Handle call permission replies for broadcasts
        const messages = change.value?.messages || [];
        for (const message of messages) {
          if (
            message.type === "interactive" &&
            message.interactive?.type === "call_permission_reply"
          ) {
            const reply = message.interactive.call_permission_reply;
            const fromNumber = message.from;

            console.log(`📞 Call permission reply from ${fromNumber}:`, reply);

            if (reply.response === "accept") {
              await updateBroadcastContactPermission(
                fromNumber,
                "granted",
                reply,
              );
            } else if (reply.response === "reject") {
              await updateBroadcastContactPermission(
                fromNumber,
                "denied",
                reply,
              );
            }
          }
        }
        break;

      case "calls":
        const callEvents = change.value.calls || [];
        const statuses = change.value.statuses || [];

        for (const callEvent of callEvents) {
          const callId = callEvent.id;

          const callbackData = callEvent.biz_opaque_callback_data;

          console.log(`🔍 [${callId}] Call event:`, callEvent.event);
          console.log(`🔍 [${callId}] Callback data:`, callbackData);

          let isBroadcastCall = false;
          let parsedCallbackData = null;

          if (callbackData) {
            try {
              parsedCallbackData = JSON.parse(callbackData);
              isBroadcastCall = !!parsedCallbackData.campaign_id;
              console.log(
                `🔍 [${callId}] Parsed callback:`,
                parsedCallbackData,
              );
              console.log(`🔍 [${callId}] Is broadcast call:`, isBroadcastCall);
            } catch (e) {
              console.error(`❌ [${callId}] Failed to parse callback data:`, e);
            }
          }

          if (isBroadcastCall) {
            console.log(`📞 [${callId}] Handling as broadcast call`);

            if (callEvent.event === "connect" && callEvent.session) {
              console.log(`📞 [${callId}] Broadcast call connect event`);
              await handleBroadcastCallConnect(
                callId,
                callEvent.session,
                callbackData,
              );
            }

            if (callEvent.event === "terminate") {
              console.log(`📞 [${callId}] Broadcast call terminate event`);
              await handleBroadcastCallTerminate(
                callId,
                callEvent.status,
                callEvent.duration,
                callbackData,
              );
            }
          } else {
            console.log(`📞 [${callId}] Handling as incoming call`);
            await handleCalls(change, userUID, body);
          }
        }

        for (const status of statuses) {
          const callId = status.id;
          const isBroadcastCall = outgoingCallStates.has(callId);

          if (isBroadcastCall) {
            const callState = outgoingCallStates.get(callId);
            if (callState) {
              const { campaignId, contact } = callState;

              console.log(`📞 [${callId}] Status update:`, status.status);

              if (status.status === "REJECTED") {
                await updateContactInBroadcast(campaignId, contact.mobile, {
                  call_status: "rejected",
                });
              }
            }
          }
        }
        break;

      default:
        console.log(`⚠️ Unknown field: ${change.field}`);
        break;
    }
  } catch (err) {
    console.error("❌ Webhook error:", err);
  }
});

// Helper function to update broadcast contact permission
async function updateBroadcastContactPermission(mobile, status, reply) {
  try {
    console.log(`🔄 Updating permission for ${mobile} to ${status}...`);

    const broadcasts = await query(
      `SELECT * FROM wa_call_broadcasts WHERE status IN ('requesting_permissions', 'ready', 'running', 'draft')`,
    );

    let updated = false;

    for (const broadcast of broadcasts) {
      const contacts = JSON.parse(broadcast.contacts || "[]");
      const contactIndex = contacts.findIndex((c) => c.mobile === mobile);

      if (contactIndex !== -1) {
        if (
          ["pending", "requested"].includes(
            contacts[contactIndex].permission_status,
          )
        ) {
          contacts[contactIndex].permission_status = status;
          contacts[contactIndex].permission_granted_at =
            new Date().toISOString();

          if (status === "granted") {
            contacts[contactIndex].permission_type = reply.is_permanent
              ? "permanent"
              : "temporary";
            contacts[contactIndex].permission_expires_at =
              reply.expiration_timestamp
                ? new Date(reply.expiration_timestamp * 1000).toISOString()
                : null;
          }

          let statsUpdate = {};
          if (status === "granted") {
            statsUpdate.permission_granted =
              (broadcast.permission_granted || 0) + 1;
          } else if (status === "denied") {
            statsUpdate.permission_denied =
              (broadcast.permission_denied || 0) + 1;
          }

          let updateQuery = `UPDATE wa_call_broadcasts SET contacts = ?`;
          let updateParams = [JSON.stringify(contacts)];

          Object.keys(statsUpdate).forEach((key) => {
            updateQuery += `, ${key} = ?`;
            updateParams.push(statsUpdate[key]);
          });

          updateQuery += ` WHERE campaign_id = ?`;
          updateParams.push(broadcast.campaign_id);

          await query(updateQuery, updateParams);

          console.log(
            `✅ Updated permission for ${mobile} in campaign ${broadcast.campaign_id}`,
          );

          updated = true;
        }
      }
    }

    if (!updated) {
      console.log(`⚠️ No matching campaign found for ${mobile}`);
    }
  } catch (err) {
    console.error("❌ Error updating broadcast contact permission:", err);
  }
}

async function handleMessages(change, uid, body) {
  const value = change.value;

  // ✅ Check plan ONLY for messages
  const getDays = await getUserPlayDays(uid);
  if (getDays < 1) {
    console.log("User plan expired");
    return;
  }

  // Handle message status updates
  const statuses = value?.statuses;

  if (statuses && statuses.length > 0) {
    for (const status of statuses) {
      if (status.id) {
        await updateMessageStatus(status.id, status.status);
      }
    }

    // Update API logs
    const { status, id } = statuses[0];
    const errorData = JSON.stringify(body);

    if (status === "failed") {
      await query(
        `UPDATE beta_api_logs SET status = ?, err = ? WHERE msg_id = ?`,
        [status, errorData, id],
      );
    } else if (id) {
      await query(`UPDATE beta_api_logs SET status = ? WHERE msg_id = ?`, [
        status,
        id,
      ]);
    }

    // Update campaign logs
    if (status === "failed") {
      await query(
        `UPDATE beta_campaign_logs SET delivery_status = ?, error_message = ? WHERE meta_msg_id = ?`,
        [status, errorData, id],
      );
    } else if (id) {
      await query(
        `UPDATE beta_campaign_logs SET delivery_status = ? WHERE meta_msg_id = ?`,
        [status, id],
      );
    }
  }

  // Verify phone number
  if (value?.metadata?.phone_number_id) {
    const getMyMetaApi = await query(`SELECT * FROM meta_api WHERE uid = ?`, [
      uid,
    ]);

    if (getMyMetaApi?.length > 0) {
      const checkNumber = value.metadata.phone_number_id;
      const myNumberId = getMyMetaApi[0]?.business_phone_number_id;

      if (checkNumber !== myNumberId) {
        console.log("⚠️ Phone number mismatch");
        return;
      }
    }
  }

  // Save message
  await processMessage({
    body,
    uid,
    origin: "meta",
  });
}

// getting chat lists
router.get("/get_chats", validateUser, async (req, res) => {
  try {
    let data = [];
    // ✅ FIXED: Changed from 'chats' to 'beta_chats' table
    data = await query(`SELECT * FROM beta_chats WHERE uid = ? ORDER BY updatedAt DESC`, [req.decode.uid]);
    const getContacts = await query(`SELECT * FROM contact WHERE uid = ?`, [
      req.decode.uid,
    ]);

    if (data.length > 0 && getContacts.length > 0) {
      data = mergeArrays(getContacts, data);
    } else {
      data = data;
    }

    res.json({ data, success: true });
  } catch (err) {
    console.log(err);
    res.json({ err, success: false, msg: "Something went wrong" });
  }
});

// get chat conversatio
router.post("/get_convo", validateUser, async (req, res) => {
  try {
    const { chatId } = req.body;

    const filePath = `${__dirname}/../conversations/inbox/${req.decode.uid}/${chatId}.json`;
    const data = readJSONFile(filePath, 100);
    res.json({ data, success: true });
  } catch (err) {
    console.log(err);
    res.json({ err, success: false, msg: "Something went wrong" });
  }
});

// adding webhook
router.get("/webhook/:uid", async (req, res) => {
  try {
    const { uid } = req.params;

    const queryParan = req.query;
    const body = req.body;

    // console.log({ query: JSON.stringify(queryParan) });
    // console.log({ body: JSON.stringify(body) });

    const getUser = await query(`SELECT * FROM user WHERE uid = ?`, [uid]);

    let verify_token = "";

    if (getUser.length < 1) {
      verify_token = "NULL";
      res.json({
        success: false,
        msg: "Token not verified",
        webhook: uid,
        token: "NOT FOUND",
      });
    } else {
      verify_token = uid;

      let mode = req.query["hub.mode"];
      let token = req.query["hub.verify_token"];
      let challenge = req.query["hub.challenge"];

      // Check if a token and mode were sent
      if (mode && token) {
        // Check the mode and token sent are correct
        if (mode === "subscribe" && token === verify_token) {
          // Respond with 200 OK and challenge token from the request
          console.log("WEBHOOK_VERIFIED");
          res.status(200).send(challenge);
        } else {
          // Responds with '403 Forbidden' if verify tokens do not match
          res.sendStatus(403);
        }
      } else {
        res.json({
          success: false,
          msg: "Token not verified",
          webhook: uid,
          token: "FOUND",
        });
      }
    }
  } catch (err) {
    console.log(err);
    res.json({ err, success: false, msg: "Something went wrong" });
  }
});

router.get("/", async (req, res) => {
  try {
    const uid = "lWvj6K0xI0FlSKJoyV7ak9DN0mzvKJK8";
    const { msg } = req.query;

    // getting socket id
    const sock = await query(`SELECT * FROM rooms WHERE uid = ?`, [uid]);

    const io = getIOInstance();

    console.log(sock[0]?.socket_id);

    io.to(sock[0]?.socket_id).emit("update_conversations", "msg");

    res.json(msg);
  } catch (err) {
    console.log(err);
    res.json({ err, success: false, msg: "Something went wrong" });
  }
});

// sending templets
router.post("/send_templet", validateUser, checkPlan, async (req, res) => {
  try {
    const { content, toName, toNumber, chatId, msgType } = req.body;

    if (!content || !toName || !toName || !msgType) {
      return res.json({ success: false, msg: "Invalid request" });
    }

    const msgObj = content;

    const savObj = {
      type: msgType,
      metaChatId: "",
      msgContext: content,
      reaction: "",
      timestamp: "",
      senderName: toName,
      senderMobile: toNumber,
      status: "sent",
      star: false,
      route: "OUTGOING",
    };

    const resp = await sendMetaMsg(
      req.decode.uid,
      msgObj,
      toNumber,
      savObj,
      chatId,
    );
    res.json(resp);
  } catch (err) {
    console.log(err);
    res.json({ err, success: false, msg: "Something went wrong" });
  }
});

// send image
router.post("/send_image", validateUser, checkPlan, async (req, res) => {
  try {
    const { url, toNumber, toName, chatId, caption } = req.body;

    if (!url || !toNumber || !toName || !chatId) {
      return res.json({ success: false, msg: "Not enough input provided" });
    }

    const msgObj = {
      type: "image",
      image: {
        link: url,
        caption: caption || "",
      },
    };

    const savObj = {
      type: "image",
      metaChatId: "",
      msgContext: {
        type: "image",
        image: {
          link: url,
          caption: caption || "",
        },
      },
      reaction: "",
      timestamp: "",
      senderName: toName,
      senderMobile: toNumber,
      status: "sent",
      star: false,
      route: "OUTGOING",
    };

    const resp = await sendMetaMsg(
      req.decode.uid,
      msgObj,
      toNumber,
      savObj,
      chatId,
    );
    res.json(resp);
  } catch (err) {
    console.log(err);
    res.json({ err, success: false, msg: "Something went wrong" });
  }
});

// send video
router.post("/send_video", validateUser, checkPlan, async (req, res) => {
  try {
    const { url, toNumber, toName, chatId, caption } = req.body;

    if (!url || !toNumber || !toName || !chatId) {
      return res.json({ success: false, msg: "Not enough input provided" });
    }

    const msgObj = {
      type: "video",
      video: {
        link: url,
        caption: caption || "",
      },
    };

    const savObj = {
      type: "video",
      metaChatId: "",
      msgContext: {
        type: "video",
        video: {
          link: url,
          caption: caption || "",
        },
      },
      reaction: "",
      timestamp: "",
      senderName: toName,
      senderMobile: toNumber,
      status: "sent",
      star: false,
      route: "OUTGOING",
    };

    const resp = await sendMetaMsg(
      req.decode.uid,
      msgObj,
      toNumber,
      savObj,
      chatId,
    );
    res.json(resp);
  } catch (err) {
    console.log(err);
    res.json({ err, success: false, msg: "Something went wrong" });
  }
});

// send document
router.post("/send_doc", validateUser, checkPlan, async (req, res) => {
  try {
    const { url, toNumber, toName, chatId, caption } = req.body;

    if (!url || !toNumber || !toName || !chatId) {
      return res.json({ success: false, msg: "Not enough input provided" });
    }

    const msgObj = {
      type: "document",
      document: {
        link: url,
        caption: caption || "",
      },
    };

    const savObj = {
      type: "document",
      metaChatId: "",
      msgContext: {
        type: "document",
        document: {
          link: url,
          caption: caption || "",
        },
      },
      reaction: "",
      timestamp: "",
      senderName: toName,
      senderMobile: toNumber,
      status: "sent",
      star: false,
      route: "OUTGOING",
    };

    const resp = await sendMetaMsg(
      req.decode.uid,
      msgObj,
      toNumber,
      savObj,
      chatId,
    );
    res.json(resp);
  } catch (err) {
    console.log(err);
    res.json({ err, success: false, msg: "Something went wrong" });
  }
});

// send audio
router.post("/send_audio", validateUser, checkPlan, async (req, res) => {
  try {
    const { url, toNumber, toName, chatId } = req.body;

    if (!url || !toNumber || !toName || !chatId) {
      return res.json({ success: false, msg: "Not enough input provided" });
    }

    const msgObj = {
      type: "audio",
      audio: {
        link: url,
      },
    };

    const savObj = {
      type: "audio",
      metaChatId: "",
      msgContext: {
        type: "audio",
        audio: {
          link: url,
        },
      },
      reaction: "",
      timestamp: "",
      senderName: toName,
      senderMobile: toNumber,
      status: "sent",
      star: false,
      route: "OUTGOING",
    };

    const resp = await sendMetaMsg(
      req.decode.uid,
      msgObj,
      toNumber,
      savObj,
      chatId,
    );
    res.json(resp);
  } catch (err) {
    console.log(err);
    res.json({ err, success: false, msg: "Something went wrong" });
  }
});

// send text message
router.post("/send_text", validateUser, checkPlan, async (req, res) => {
  try {
    const { text, toNumber, toName, chatId } = req.body;

    if (!text || !toNumber || !toName || !chatId) {
      return res.json({ success: false, msg: "Not enough input provided" });
    }

    const msgObj = {
      type: "text",
      text: {
        preview_url: true,
        body: text,
      },
    };

    const savObj = {
      type: "text",
      metaChatId: "",
      msgContext: {
        type: "text",
        text: {
          preview_url: true,
          body: text,
        },
      },
      reaction: "",
      timestamp: "",
      senderName: toName,
      senderMobile: toNumber,
      status: "sent",
      star: false,
      route: "OUTGOING",
    };

    const resp = await sendMetaMsg(
      req.decode.uid,
      msgObj,
      toNumber,
      savObj,
      chatId,
    );
    res.json(resp);
  } catch (err) {
    console.log(err);
    res.json({ err, success: false, msg: "Something went wrong" });
  }
});

// send meta templet
router.post("/send_meta_templet", validateUser, checkPlan, async (req, res) => {
  try {
    const { template, toNumber, toName, chatId, example } = req.body;

    if (!template) {
      return res.json({ success: false, msg: "Please type input" });
    }

    const getMETA = await query(`SELECT * FROM meta_api WHERE uid = ?`, [
      req.decode.uid,
    ]);
    if (getMETA.length < 1) {
      return res.json({
        success: false,
        msg: "Please check your meta API keys [1]",
      });
    }

    const resp = await sendMetatemplet(
      toNumber,
      getMETA[0]?.business_phone_number_id,
      getMETA[0]?.access_token,
      template,
      example,
    );

    if (resp.error) {
      console.log(resp);
      return res.json({
        success: false,
        msg: resp?.error?.error_user_title || "Please check your API",
      });
    } else {
      const savObj = {
        type: "text",
        metaChatId: "",
        msgContext: {
          type: "text",
          text: {
            preview_url: true,
            body: `{{TEMPLET_MESSAGE}} | ${template?.name}`,
          },
        },
        reaction: "",
        timestamp: "",
        senderName: toName,
        senderMobile: toNumber,
        status: "sent",
        star: false,
        route: "OUTGOING",
      };

      await updateMetaTempletInMsg(
        req.decode.uid,
        savObj,
        chatId,
        resp?.messages[0]?.id,
      );
      res.json({ success: true, msg: "The templet message was sent" });
    }
  } catch (err) {
    console.log(err);
    res.json({ err, success: false, msg: "Something went wrong" });
  }
});

// del chat
router.post("/del_chat", validateUser, async (req, res) => {
  try {
    const { chatId } = req.body;
    await query(`DELETE FROM chats WHERE chat_id = ? AND uid = ?`, [
      chatId,
      req.decode.uid,
    ]);
    const filePath = `${__dirname}/../conversations/inbox/${req.decode.uid}/${chatId}`;

    deleteFileIfExists(filePath);

    res.json({ success: true, msg: "Conversation has been deleted" });
  } catch (err) {
    console.log(err);
    res.json({ err, success: false, msg: "Something went wrong" });
  }
});

function groupChatsByNumberArrayFormat(chats) {
  const groupedChats = [];

  chats.forEach((chat) => {
    const number = chat.number;

    // Check if the group for this number already exists
    const existingGroup = groupedChats.find(
      (group) => group.instance === number,
    );

    if (existingGroup) {
      // Add chat to the existing group
      existingGroup.array.push(chat);
    } else {
      // Create a new group for this number
      groupedChats.push({
        instance: number,
        array: [chat],
      });
    }
  });

  return groupedChats;
}

// merge chat
router.post("/merge_chats", validateUser, async (req, res) => {
  try {
  } catch (err) {
    console.log(err);
    res.json({ err, success: false, msg: "Something went wrong" });
  }
});

function convertNumberToRandomString(number) {
  const mapping = {
    0: "i",
    1: "j",
    2: "I",
    3: "u",
    4: "I",
    5: "U",
    6: "S",
    7: "D",
    8: "B",
    9: "j",
  };

  const numStr = number.toString();
  let result = "";
  for (let i = 0; i < numStr.length; i++) {
    const digit = numStr[i];
    result += mapping[digit];
  }
  return result;
}

router.post("/import_convo_from_v3", validateUser, async (req, res) => {
  try {
    const { newChatId, senderName, senderMobile, oldChatId } = req.body;

    if (!newChatId || !senderName || !senderMobile) {
      return res.json({ msg: "Invalid request" });
    }

    if (!oldChatId) {
      return res.json({
        msg: "This chat is from version 4. No converstaion found to be imported",
      });
    }

    const convoPath = `${__dirname}/../conversations/inbox/${req.decode.uid}/${oldChatId}.json`;
    const convoData = readJSONFile(convoPath);

    if (convoData?.length < 1) {
      return res.json({ msg: "No chat messages found to import" });
    }

    res.json({
      success: true,
      msg: "Conversation migrating has been started",
    });

    importConversationsFromJson({
      convos: convoData,
      newChatId,
      senderMobile,
      senderName,
      uid: req.decode.uid,
    });
  } catch (err) {
    console.log(err);
    res.json({ err, success: false, msg: "Something went wrong" });
  }
});

router.get("/import_chats_from_v3", validateUser, async (req, res) => {
  try {
    const chatData = await query(`SELECT * FROM chats`, []);
    if (chatData?.length < 1) {
      return res.json({
        msg: "We could not find any chat list in older version, Please click Cancel icon to delete the [Import chats] button",
      });
    }
    res.json({
      msg: "Chats started importning... Please click Cancel icon to delete the [Import chats] button",
      success: true,
    });

    importChatsFromv3({ chatData });
  } catch (err) {
    console.log(err);
    res.json({ err, success: false, msg: "Something went wrong" });
  }
});

// ✅ START NEW CONVERSATION - Create chat for new number
router.post("/start_new_conversation", validateUser, async (req, res) => {
  try {
    const { phone, name } = req.body;

    if (!phone) {
      return res.json({ success: false, msg: "Phone number is required" });
    }

    // Clean phone number (remove spaces, dashes, plus sign, etc.)
    const cleanPhone = phone.replace(/[^\d]/g, ''); // Remove everything except digits

    // Generate chat_id
    const chatId = `meta_${cleanPhone}_${req.decode.uid}`;

    // Check if chat already exists
    const existingChat = await query(
      `SELECT * FROM beta_chats WHERE chat_id = ? LIMIT 1`,
      [chatId]
    );

    if (existingChat.length > 0) {
      // Chat already exists, return it
      return res.json({
        success: true,
        msg: "Chat already exists",
        chatId: existingChat[0].chat_id,
        data: existingChat[0]
      });
    }

    // Create new chat entry
    const lastMessagePayload = {
      type: "text",
      metaChatId: "",
      msgContext: {
        type: "text",
        text: {
          body: "New conversation started"
        }
      },
      reaction: "",
      timestamp: Math.floor(Date.now() / 1000),
      senderName: name || cleanPhone,
      senderMobile: cleanPhone,
      star: "0",
      route: "OUTGOING",
      context: null,
      origin: "meta"
    };

    await query(
      `INSERT INTO beta_chats 
       (uid, chat_id, sender_mobile, sender_name, last_message, origin, unread_count, createdAt, updatedAt) 
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        req.decode.uid,
        chatId,
        cleanPhone,
        name || cleanPhone,
        JSON.stringify(lastMessagePayload),
        'meta',
        0
      ]
    );

    console.log(`✅ New conversation started: ${chatId}`);

    // Fetch the created chat
    const newChat = await query(
      `SELECT * FROM beta_chats WHERE chat_id = ? LIMIT 1`,
      [chatId]
    );

    res.json({
      success: true,
      msg: "New conversation created successfully",
      chatId: chatId,
      data: newChat[0]
    });
  } catch (err) {
    console.error("Error starting new conversation:", err);
    res.json({ success: false, msg: "Something went wrong", err: err.message });
  }
});

// Start new conversation with template message
router.post("/start_conversation_with_template", validateUser, async (req, res) => {
  try {
    const { phone, name, templateName, templateLanguage, templateVariables } = req.body;

    if (!phone || !templateName) {
      return res.json({ 
        success: false, 
        msg: "Phone number and template name are required" 
      });
    }

    // Clean phone number
    const cleanPhone = phone.replace(/[^\d]/g, '');
    
    if (!cleanPhone) {
      return res.json({
        success: false,
        msg: "Invalid phone number format"
      });
    }

    // Get user's Meta API credentials
    const [metaApi] = await query(
      `SELECT * FROM meta_api WHERE uid = ? LIMIT 1`,
      [req.decode.uid]
    );

    if (!metaApi || !metaApi.access_token || !metaApi.business_phone_number_id) {
      return res.json({
        success: false,
        msg: "Meta WhatsApp API not configured. Please link your Meta WhatsApp first."
      });
    }

    // Generate chat_id
    const chatId = `meta_${cleanPhone}_${req.decode.uid}`;
    
    // Check if chat already exists for this phone number
    const existingChatByPhone = await query(
      `SELECT * FROM beta_chats 
       WHERE uid = ? 
       AND sender_mobile = ? 
       AND origin = 'meta'
       LIMIT 1`,
      [req.decode.uid, cleanPhone]
    );
    
    // If chat exists with different chat_id format, update to new format
    if (existingChatByPhone.length > 0 && existingChatByPhone[0].chat_id !== chatId) {
      console.log(`⚠️ Found existing chat with old format. Updating to new format...`);
      const oldChatId = existingChatByPhone[0].chat_id;
      
      // Update chat_id to new format
      await query(
        `UPDATE beta_chats SET chat_id = ? WHERE chat_id = ? AND uid = ?`,
        [chatId, oldChatId, req.decode.uid]
      );
      
      // Update all conversations with new chat_id
      await query(
        `UPDATE beta_conversation SET chat_id = ? WHERE chat_id = ? AND uid = ?`,
        [chatId, oldChatId, req.decode.uid]
      );
      
      console.log(`✅ Migrated chat from ${oldChatId} to ${chatId}`);
    }

    console.log(`📤 Starting conversation with template: ${templateName} to ${cleanPhone}`);

    // Send template message via Meta API
    const { sendTemplateMessage } = require("../functions/function.js");
    
    const templateResponse = await sendTemplateMessage(
      'v21.0', // API version
      metaApi.business_phone_number_id, // Phone Number ID
      metaApi.access_token, // Access Token
      templateName, // Template Name
      templateLanguage || 'en', // Language
      cleanPhone, // Recipient Phone
      templateVariables || [], // Body Variables
      null, // Header Variable
      [] // Button Variables
    );

    if (!templateResponse || templateResponse.error) {
      console.error('❌ Template send failed:', templateResponse?.error);
      return res.json({
        success: false,
        msg: templateResponse?.error?.message || "Failed to send template message"
      });
    }

    console.log('✅ Template message sent:', templateResponse);

    // Create/Update chat entry
    const existingChat = await query(
      `SELECT * FROM beta_chats WHERE chat_id = ? LIMIT 1`,
      [chatId]
    );

    const lastMessagePayload = {
      type: "template",
      metaChatId: templateResponse.messages?.[0]?.id || "",
      msgContext: {
        type: "template",
        template: {
          name: templateName,
          language: templateLanguage || 'en',
          components: templateVariables || []
        }
      },
      reaction: "",
      timestamp: Math.floor(Date.now() / 1000),
      senderName: name || cleanPhone,
      senderMobile: cleanPhone,
      star: "0",
      route: "OUTGOING",
      context: null,
      origin: "meta"
    };

    if (existingChat.length > 0) {
      // Update existing chat
      await query(
        `UPDATE beta_chats 
         SET last_message = ?, updatedAt = NOW()
         WHERE chat_id = ?`,
        [JSON.stringify(lastMessagePayload), chatId]
      );
    } else {
      // Create new chat
      await query(
        `INSERT INTO beta_chats 
         (uid, chat_id, sender_mobile, sender_name, last_message, origin, unread_count, createdAt, updatedAt) 
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          req.decode.uid,
          chatId,
          cleanPhone,
          name || cleanPhone,
          JSON.stringify(lastMessagePayload),
          'meta',
          0
        ]
      );
    }

    // Save conversation record
    await query(
      `INSERT INTO beta_conversation 
       (uid, chat_id, type, msgContext, timestamp, senderName, senderMobile, route, origin, createdAt) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        req.decode.uid,
        chatId,
        'template',
        JSON.stringify(lastMessagePayload.msgContext),
        lastMessagePayload.timestamp,
        name || cleanPhone,
        cleanPhone,
        'OUTGOING',
        'meta'
      ]
    );

    console.log(`✅ Conversation started with template: ${chatId}`);

    res.json({
      success: true,
      msg: "Template message sent successfully",
      chatId: chatId,
      messageId: templateResponse.messages?.[0]?.id
    });
  } catch (err) {
    console.error("❌ Error starting conversation with template:", err);
    res.json({ 
      success: false, 
      msg: "Something went wrong", 
      error: err.message 
    });
  }
});

module.exports = router;
