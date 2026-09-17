const admin = require("firebase-admin");
const { query } = require("../../../database/dbpromise");

// ─────────────────────────────────────────────────────────────────────────────
// Firebase (FCM) sending engine — admin "Web Notification" / "Manual Web Push"
//
// This uses a DEDICATED, NAMED firebase-admin app ("web-fcm") so it never
// collides with the default app that functions/function.js creates from the
// mobile_app service account. The web-push credentials come from web_private
// (fcm_projectId, fcm_clientEmail, fcm_privateKey).
// ─────────────────────────────────────────────────────────────────────────────

const WEB_FCM_APP_NAME = "web-fcm";
let webFcmApp = null;
let webFcmFingerprint = null; // detect credential changes and re-init

/**
 * Normalize a service-account private key. Keys copied from JSON often arrive
 * with literal "\n" sequences instead of real newlines; firebase-admin needs
 * real newlines.
 */
function normalizePrivateKey(key = "") {
  return String(key).replace(/\\n/g, "\n").trim();
}

/**
 * Get (or lazily create) the named firebase-admin app for web push.
 * Re-initializes if the stored credentials changed since last time.
 */
function getWebFcmApp({ fcm_projectId, fcm_clientEmail, fcm_privateKey }) {
  const privateKey = normalizePrivateKey(fcm_privateKey);
  const fingerprint = `${fcm_projectId}::${fcm_clientEmail}::${privateKey.length}`;

  // Return cached app if credentials are unchanged.
  if (webFcmApp && webFcmFingerprint === fingerprint) {
    return webFcmApp;
  }

  // If an app with this name already exists (e.g. credentials changed at
  // runtime), delete it before recreating.
  const existing = admin.apps.find((a) => a && a.name === WEB_FCM_APP_NAME);
  if (existing) {
    try {
      existing.delete();
    } catch (_) {
      /* ignore */
    }
    webFcmApp = null;
  }

  webFcmApp = admin.initializeApp(
    {
      credential: admin.credential.cert({
        projectId: fcm_projectId,
        clientEmail: fcm_clientEmail,
        privateKey,
      }),
    },
    WEB_FCM_APP_NAME,
  );
  webFcmFingerprint = fingerprint;
  return webFcmApp;
}

/**
 * Send an FCM push to a list of device tokens.
 * Returns { success, successCount, failureCount, totalSent, results }.
 */
async function sendFcmPushNotification({
  fcm_projectId,
  fcm_clientEmail,
  fcm_privateKey,
  tokens,
  notification,
}) {
  try {
    if (!fcm_projectId || !fcm_clientEmail || !fcm_privateKey) {
      return { success: false, msg: "FCM credentials are incomplete." };
    }

    const tokenList = (Array.isArray(tokens) ? tokens : [])
      .filter((t) => typeof t === "string" && t.trim().length > 0)
      .map((t) => t.trim());

    if (tokenList.length === 0) {
      return { success: false, msg: "No valid recipient tokens." };
    }

    if (!notification?.title || !notification?.body) {
      return {
        success: false,
        msg: "Notification title and body are required.",
      };
    }

    const app = getWebFcmApp({
      fcm_projectId,
      fcm_clientEmail,
      fcm_privateKey,
    });
    const messaging = admin.messaging(app);

    const imageUrl = notification.imageUrl || notification.image || undefined;
    const link = notification.url || notification.link || "/";

    const baseMessage = {
      notification: {
        title: notification.title,
        body: notification.body,
        ...(imageUrl ? { imageUrl } : {}),
      },
      data: {
        url: String(link),
        ...(notification.data
          ? Object.fromEntries(
              Object.entries(notification.data).map(([k, v]) => [
                k,
                String(v),
              ]),
            )
          : {}),
      },
      webpush: {
        notification: {
          title: notification.title,
          body: notification.body,
          icon: notification.icon || "/favicon.svg",
          ...(imageUrl ? { image: imageUrl } : {}),
        },
        fcmOptions: { link: String(link) },
      },
    };

    // sendEachForMulticast handles up to 500 tokens per call.
    const results = [];
    let successCount = 0;
    let failureCount = 0;
    const invalidTokens = [];

    const CHUNK = 500;
    for (let i = 0; i < tokenList.length; i += CHUNK) {
      const chunk = tokenList.slice(i, i + CHUNK);
      const resp = await messaging.sendEachForMulticast({
        ...baseMessage,
        tokens: chunk,
      });

      successCount += resp.successCount;
      failureCount += resp.failureCount;

      resp.responses.forEach((r, idx) => {
        const token = chunk[idx];
        results.push({
          token,
          success: r.success,
          error: r.error ? r.error.message : null,
        });
        if (!r.success) {
          const code = r.error?.code || "";
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token" ||
            code === "messaging/invalid-argument"
          ) {
            invalidTokens.push(token);
          }
        }
      });
    }

    // Best-effort cleanup of dead tokens from fcm_tokens table.
    if (invalidTokens.length > 0) {
      try {
        await query(
          `DELETE FROM fcm_tokens WHERE token IN (${invalidTokens
            .map(() => "?")
            .join(",")})`,
          invalidTokens,
        );
      } catch (e) {
        console.error("FCM dead-token cleanup failed:", e.message);
      }
    }

    return {
      success: true,
      successCount,
      failureCount,
      totalSent: tokenList.length,
      results,
    };
  } catch (err) {
    console.error("sendFcmPushNotification error:", err);
    return {
      success: false,
      msg: err?.message || "Failed to send FCM notification.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Native (VAPID) push on new inbound message.
//
// inbox.js calls processWebPushMessageNotificaion() for every INCOMING message.
// We build a friendly notification and dispatch it through the native web-push
// engine defined in routes/webPush.js (sendPushToUser). Both the user and any
// assigned agents receive it.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a { title, body, imageUrl } notification from a stored message object.
 * Mirrors the message-type handling used elsewhere in the inbox pipeline.
 */
const generateNotificationFromMessage = (msg, langData = {}) => {
  if (!msg) {
    return { title: "New Message", body: "You have a new message", imageUrl: null };
  }

  const sender = msg.senderName || msg.senderMobile || "Unknown";
  let title = sender;
  let body = "";
  let imageUrl = msg.profileImage || null;
  const ctx = msg.msgContext || {};

  switch (msg.type) {
    case "text":
      body = ctx?.text?.body || "New text message";
      break;
    case "image":
      body = ctx?.image?.caption
        ? `📷 ${ctx.image.caption}`
        : `📷 ${langData?.photo || "Photo"}`;
      if (ctx?.image?.link) imageUrl = ctx.image.link;
      break;
    case "video":
      body = ctx?.video?.caption
        ? `🎥 ${ctx.video.caption}`
        : `🎥 ${langData?.videoo || "Video"}`;
      break;
    case "audio":
      body = `🎵 ${langData?.audioMsgg || "Voice message"}`;
      break;
    case "document":
      body =
        ctx?.document?.caption || ctx?.document?.filename
          ? `📄 ${ctx.document.caption || ctx.document.filename}`
          : `📄 ${langData?.document || "Document"}`;
      break;
    case "location":
      body = `📍 ${langData?.locShared || "Location shared"}`;
      break;
    case "contact":
      body = `👤 ${langData?.contactt || "Contact"}`;
      break;
    case "reaction":
      body = msg.reaction || ctx?.reaction?.emoji
        ? `Reacted ${msg.reaction || ctx.reaction.emoji}`
        : `${langData?.reacted || "Reacted to your message"}`;
      break;
    case "sticker":
      body = `🎨 ${langData?.stickerSent || "Sticker"}`;
      break;
    case "button":
    case "list":
      body =
        ctx?.interactive?.body?.text ||
        ctx?.button?.text ||
        `${langData?.buttonMsg || "Interactive message"}`;
      break;
    default:
      body = langData?.unkwnMsg || "New message";
      break;
  }

  if (body.length > 120) body = body.substring(0, 117) + "...";

  return { title, body, imageUrl };
};

/**
 * Fire a native web push to the account owner (uid) and any assigned agents
 * when a new inbound message is processed.
 */
async function processWebPushMessageNotificaion({
  uid,
  message,
  user,
  sessionId,
  origin,
  chatId,
}) {
  try {
    // Lazy require to avoid a circular dependency at module load time.
    const { sendPushToUser } = require("../../../routes/webPush");
    if (typeof sendPushToUser !== "function") return;

    const noti = generateNotificationFromMessage(message);
    const url = chatId ? `/user/inbox?chat=${encodeURIComponent(chatId)}` : "/user/inbox";

    // Notify the account owner. Note: the native web-push endpoints
    // (/api/webpush/*) are guarded by validateUser (role === "user"), so only
    // account owners can hold native subscriptions. Agents receive their alerts
    // through the FCM/mobile path (processMobileNotificaion in inbox.js).
    await sendPushToUser({
      uid,
      title: noti.title,
      body: noti.body,
      icon: noti.imageUrl || "/favicon.svg",
      url,
      type: "notify_messages",
    });
  } catch (err) {
    console.error("processWebPushMessageNotificaion error:", err.message);
  }
}

function checkWebPush() {
  return true;
}

module.exports = {
  checkWebPush,
  sendFcmPushNotification,
  generateNotificationFromMessage,
  processWebPushMessageNotificaion,
};
