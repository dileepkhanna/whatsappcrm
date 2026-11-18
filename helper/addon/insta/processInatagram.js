const axios = require("axios");
const { query } = require("../../../database/dbpromise");

// Instagram DM webhook processing (Instagram API with Instagram Login).
//
// Data contract shared with the send path (helper/socket/function.js sendInstaMsg)
// and automation (origin "instagram", sessionId = our IG user_id):
//   beta_chats.origin              = "instagram"
//   beta_chats.sender_mobile       = the other person's IGSID
//   beta_chats.origin_instance_id  = JSON { id: <our IG user_id>, username, name }
//   instagram_accounts.user_id     = our IG professional account id (= webhook entry.id)

const IG_GRAPH = "https://graph.instagram.com/v21.0";

// Find the connected account a webhook entry belongs to.
async function resolveAccountFromWebhook(igBusinessId) {
  if (!igBusinessId) return null;
  const id = String(igBusinessId);
  const [row] = await query(
    `SELECT * FROM instagram_accounts
     WHERE webhook_id = ? OR user_id = ? OR ig_graph_id = ?
     ORDER BY id DESC LIMIT 1`,
    [id, id, id],
  );
  return row || null;
}

// Best-effort lookup of the customer's name/username (User Profile API).
async function fetchSenderProfile(igsid, accessToken) {
  try {
    const { data } = await axios.get(`${IG_GRAPH}/${igsid}`, {
      params: { fields: "name,username,profile_pic", access_token: accessToken },
      timeout: 8000,
    });
    return data || {};
  } catch {
    return {};
  }
}

// Convert an Instagram webhook message into the CRM's msgContext format.
function toMsgContext(event) {
  const msg = event.message;
  if (event.postback) {
    const text = event.postback.title || event.postback.payload || "";
    return { type: "text", text: { body: text } };
  }
  if (!msg) return null;

  const att = msg.attachments?.[0];
  if (att) {
    const url = att.payload?.url || "";
    switch (att.type) {
      case "image":
        return { type: "image", image: { link: url, caption: msg.text || "" } };
      case "video":
      case "ig_reel":
      case "reel":
        return { type: "video", video: { link: url, caption: msg.text || "" } };
      case "audio":
        return { type: "audio", audio: { link: url } };
      case "file":
        return { type: "document", document: { link: url, caption: "" } };
      default: {
        // share, story_mention, etc. — show as text with the link
        const label = att.type === "story_mention" ? "Mentioned you in a story" : `Shared ${att.type}`;
        return { type: "text", text: { body: url ? `${label}: ${url}` : label } };
      }
    }
  }

  if (msg.quick_reply?.payload && !msg.text) {
    return { type: "text", text: { body: msg.quick_reply.payload } };
  }
  if (typeof msg.text === "string") return { type: "text", text: { body: msg.text } };
  return null;
}

async function processInstaMessage({ body, uid }) {
  const empty = { newMessage: null, chatId: null, sessionId: null };
  try {
    const entry = body?.entry?.[0];
    const event = entry?.messaging?.[0];
    if (!entry || !event) return empty;

    // Ignore delivery/read/reaction-only events.
    if (!event.message && !event.postback) return empty;
    if (event.message?.is_deleted) return empty;

    const igAccount = await resolveAccountFromWebhook(entry.id);
    if (!igAccount || igAccount.uid !== uid) return empty;

    const myId = String(igAccount.user_id || entry.id);
    const isEcho = !!event.message?.is_echo;
    // For echoes (messages we sent, e.g. from the Instagram app) the customer is the recipient.
    const otherId = String(isEcho ? event.recipient?.id : event.sender?.id);
    if (!otherId || otherId === myId) return empty;

    const msgContext = toMsgContext(event);
    if (!msgContext) return empty;

    const mid = event.message?.mid || event.postback?.mid || null;
    const chatId = `instagram_${otherId}_${uid}`;

    // Skip duplicates (Meta retries webhooks; CRM-sent messages also come back as echoes).
    if (mid) {
      const [dup] = await query(
        `SELECT id FROM beta_conversation WHERE metaChatId = ? AND uid = ? LIMIT 1`,
        [mid, uid],
      );
      if (dup) return { ...empty, chatId };
    }

    const [chat] = await query(
      `SELECT * FROM beta_chats WHERE chat_id = ? AND uid = ? LIMIT 1`,
      [chatId, uid],
    );

    let senderName = chat?.sender_name;
    if (!senderName || senderName === "NA" || senderName === "Instagram User") {
      const profile = await fetchSenderProfile(otherId, igAccount.access_token);
      senderName = profile.name || (profile.username ? `@${profile.username}` : "Instagram User");
    }

    const [user] = await query(`SELECT timezone FROM user WHERE uid = ? LIMIT 1`, [uid]);
    const { getCurrentTimestampInTimeZone, saveMessageToConversation } = require("../../../functions/function");
    const timestamp = parseInt(getCurrentTimestampInTimeZone(user?.timezone || "Asia/Kolkata"));

    const route = isEcho ? "OUTGOING" : "INCOMING";
    const messageData = {
      type: msgContext.type,
      metaChatId: mid,
      msgContext,
      reaction: "",
      timestamp,
      senderName: isEcho ? igAccount.username || "me" : senderName,
      senderMobile: otherId,
      star: 0,
      route,
      context: event.message?.reply_to?.mid ? { id: event.message.reply_to.mid } : null,
      origin: "instagram",
    };

    await saveMessageToConversation({
      uid,
      chatId,
      messageData,
      sentBy: isEcho ? "instagram_app" : "instagram",
    });

    const updateFields = {
      last_message: JSON.stringify(messageData),
      sender_name: senderName,
      sender_mobile: otherId,
      origin: "instagram",
    };
    if (!isEcho) updateFields.unread_count = (chat?.unread_count || 0) + 1;

    if (chat) {
      await query(`UPDATE beta_chats SET ? WHERE chat_id = ? AND uid = ?`, [updateFields, chatId, uid]);
    } else {
      await query(`INSERT INTO beta_chats SET ?`, {
        ...updateFields,
        uid,
        chat_id: chatId,
        origin_instance_id: JSON.stringify({
          id: myId,
          username: igAccount.username,
          name: igAccount.name || "",
        }),
        unread_count: isEcho ? 0 : 1,
        assigned_agent: null,
        createdAt: new Date(),
      });
    }

    // Echoes are saved for the inbox but must not trigger chatbots/automation
    // (processMessage runs automation for any returned newMessage).
    if (isEcho) return { newMessage: null, chatId, sessionId: myId };

    return { newMessage: messageData, chatId, sessionId: myId };
  } catch (err) {
    console.error("[Instagram] processInstaMessage error:", err);
    return empty;
  }
}

// Comments are handled inline in routes/insta.js; kept for API compatibility.
async function processInstaComment() {
  return { message: null, chatId: null };
}

module.exports = {
  processInstaMessage,
  resolveAccountFromWebhook,
  processInstaComment,
};
