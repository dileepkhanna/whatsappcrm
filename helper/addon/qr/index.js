/**
 * WhatsApp QR Code Implementation using Baileys
 * Full working implementation for WhatsCRM
 */

const fs = require("fs");
const path = require("path");
const pino = require("pino");
const { toDataURL } = require("qrcode");
const { query } = require("../../../database/dbpromise");
const makeWASocket = require("baileys").default;
const {
  useMultiFileAuthState,
  DisconnectReason,
  makeInMemoryStore,
  Browsers,
  delay,
  fetchLatestBaileysVersion,
} = require("baileys");

// Cache the WA Web version so we don't refetch on every session.
let cachedWaVersion = null;
async function getWaVersion() {
  if (cachedWaVersion) return cachedWaVersion;
  try {
    const { version } = await fetchLatestBaileysVersion();
    cachedWaVersion = version;
    console.log("✅ Baileys WA version:", version);
  } catch (e) {
    console.error("⚠️ fetchLatestBaileysVersion failed, using default:", e.message);
    cachedWaVersion = undefined; // let Baileys use its bundled default
  }
  return cachedWaVersion;
}

// Import socket functions
const { getConnectionsByUid, sendToSocket } = require("../../../socket");

// Store for active sessions
const sessions = new Map();
const retries = new Map();

// Socket.IO instance (will be set from socket.js)
let io = null;

// Session storage directory
const SESSION_DIR = path.resolve(__dirname, "../../../auth_info_baileys");

// Ensure session directory exists
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

// Logger
const logger = pino({ level: "silent" });

/**
 * Set Socket.IO instance
 */
function setSocketIO(socketIO) {
  io = socketIO;
  console.log("✅ Socket.IO attached to QR module [QR-ENGINE v2: version-fetch + buffer]");
}

/**
 * Get session storage path
 */
function getSessionPath(sessionId) {
  return path.join(SESSION_DIR, sessionId);
}

/**
 * Check if session exists
 */
function isSessionExists(sessionId) {
  return sessions.has(sessionId);
}

/**
 * Get session
 */
function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

/**
 * Create WhatsApp session with QR code
 */
async function createSession(sessionId, isReconnect = false) {
  try {
    console.log(`🚀 Creating session: ${sessionId} (reconnect: ${isReconnect})`);

    // If a live socket is already in the map, close it WITHOUT deleting auth
    // files — we want to reuse the credentials so we don't restart the whole
    // QR handshake and cause a loop.
    const existing = sessions.get(sessionId);
    if (existing) {
      try {
        existing.ev.removeAllListeners("connection.update");
        existing.end?.(undefined);
      } catch (_) {}
      sessions.delete(sessionId);
    }

    // Get auth state
    const sessionPath = getSessionPath(sessionId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    // The correct WA Web version is REQUIRED on Baileys 7.x — without it the
    // socket stalls in "connecting" and never emits a QR.
    const version = await getWaVersion();

    // Create socket
    const socket = makeWASocket({
      auth: state,
      version,
      logger,
      browser: Browsers.ubuntu("Chrome"),
      // Keep each QR on screen longer so it doesn't churn while the user scans.
      qrTimeout: 45_000,
      connectTimeoutMs: 60_000,
      keepAliveIntervalMs: 25_000,
      getMessage: async (key) => {
        return { conversation: "" };
      },
    });

    // Store session
    sessions.set(sessionId, socket);
    retries.set(sessionId, 0);

    // Handle credentials update
    socket.ev.on("creds.update", saveCreds);

    // Handle connection updates
    socket.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // ── QR received → convert and emit to the frontend immediately ──
      if (qr) {
        try {
          const qrDataURL = await toDataURL(qr);
          if (io) {
            const payload = { sessionId, qr: qrDataURL, timestamp: Date.now() };
            io.emit("qr", payload);
            io.emit(`qr-${sessionId}`, payload);
          }
          // A fresh QR means the socket is healthy; reset the retry counter so
          // a later expiry gets a full set of fresh attempts.
          retries.set(sessionId, 0);
          console.log(`📱 QR emitted for ${sessionId}`);
        } catch (error) {
          console.error(`❌ QR encode error for ${sessionId}:`, error.message);
        }
      }

      // Handle connection state
      if (connection === "open") {
        console.log(`✅ Session ${sessionId} connected successfully!`);
        retries.delete(sessionId);

        // Update database
        await query(
          "UPDATE instance SET status = ?, number = ? WHERE uniqueId = ?",
          ["connected", socket.user?.id?.split(":")[0] || "", sessionId]
        );

        // Emit connection success
        if (io) {
          io.emit("session-update", {
            sessionId,
            isConnected: true,
            phoneNumber: socket.user?.id?.split(":")[0] || "",
          });
        }
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        const restartRequired = statusCode === DisconnectReason.restartRequired;

        console.log(
          `❌ Session ${sessionId} closed. statusCode: ${statusCode}, loggedOut: ${loggedOut}`
        );

        // ── restartRequired (515): normal right after a successful QR scan /
        //    pairing. Restart the socket immediately, REUSING the saved creds
        //    (do NOT count as a retry, do NOT wipe auth) so it comes up online.
        if (restartRequired) {
          console.log(`🔁 Restart required for ${sessionId} — reconnecting with saved creds`);
          await delay(1000);
          await createSession(sessionId, true);
          return;
        }

        // ── Logged out (401): the pairing was rejected or the device was
        //    unlinked. Clean everything up.
        if (loggedOut) {
          console.log(`🚪 Session ${sessionId} logged out`);
          sessions.delete(sessionId);
          retries.delete(sessionId);

          await query("UPDATE instance SET status = ? WHERE uniqueId = ?", [
            "disconnected",
            sessionId,
          ]);

          // Clean up session files so the next attempt starts fresh
          const sessionPath = getSessionPath(sessionId);
          if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
          }
          return;
        }

        // ── Any other close (network blip, QR expired unscanned, etc.).
        //    Retry a limited number of times WITHOUT deleting auth. If the
        //    session had never paired, this just re-shows a fresh QR.
        const currentRetries = retries.get(sessionId) || 0;
        if (currentRetries < 3) {
          retries.set(sessionId, currentRetries + 1);
          console.log(
            `🔄 Reconnecting ${sessionId} (attempt ${currentRetries + 1}/3)...`
          );
          await delay(2000);
          await createSession(sessionId, true);
        } else {
          console.log(`⏹️ Giving up on ${sessionId} after 3 attempts`);
          retries.delete(sessionId);
          sessions.delete(sessionId);
          await query("UPDATE instance SET status = ? WHERE uniqueId = ?", [
            "disconnected",
            sessionId,
          ]);
        }
      }
    });

    // Handle messages
    socket.ev.on("messages.upsert", async ({ messages, type }) => {
      // Only log if there are actual messages (not just status updates)
      const hasRealMessages = messages.some(m => m.message);
      if (hasRealMessages) {
        console.log(`📩 Message received in ${sessionId}:`, {
          count: messages.length,
          type,
        });
      }
      
      // Process each message
      for (const message of messages) {
        try {
          // Skip logging for messages without message field (status receipts, etc.)
          if (message.message) {
            console.log(`🔍 Processing message:`, JSON.stringify(message.key));
            console.log(`📦 Message structure:`, JSON.stringify(message.message));
          }
          
          // Get user data from instance
          const instanceResult = await query(
            "SELECT uid FROM instance WHERE uniqueId = ?",
            [sessionId]
          );
          
          const instanceData = Array.isArray(instanceResult[0]) 
            ? instanceResult[0][0] 
            : instanceResult[0];
          
          if (!instanceData || !instanceData.uid) {
            console.error(`❌ No user found for session ${sessionId}`);
            console.error(`   Instance result:`, instanceResult);
            continue;
          }
          
          const uid = instanceData.uid;
          console.log(`✅ Found uid: ${uid}`);
          
          // Get user details
          const userResult = await query(
            "SELECT * FROM user WHERE uid = ?",
            [uid]
          );
          
          const userData = Array.isArray(userResult[0])
            ? userResult[0][0]
            : userResult[0];
          
          if (!userData) {
            console.error(`❌ User data not found for uid ${uid}`);
            console.error(`   User result:`, userResult);
            continue;
          }
          
          console.log(`✅ Found user: ${userData.email || userData.name}`);
          
          // Import processMessageQr function
          const { processMessageQr } = require("./processThings");
          
          // Process and save the message
          const result = await processMessageQr({
            type,
            message,
            sessionId,
            getSession,
            userData,
            uid,
          });
          
          // Only log if we actually saved a message (not status updates)
          if (result && result.newMessage) {
            console.log(`✅ Message processed and saved for ${sessionId}`);
            console.log(`   Result:`, { 
              hasNewMessage: !!result.newMessage, 
              chatId: result.chatId,
              route: result?.newMessage?.route 
            });
            
            // 🔥 Only emit socket events for INCOMING messages to avoid duplicates
            // Frontend already shows outgoing messages optimistically
            if (result?.newMessage && result?.newMessage?.route === "INCOMING") {
              // Notify frontend via Socket.IO
              const socketConnections = getConnectionsByUid(uid, true) || [];
              console.log(`🔌 Found ${socketConnections.length} socket connection(s) for uid: ${uid}`);
              
              if (socketConnections.length === 0) {
                console.log(`⚠️  No active socket connections - user may not be logged in or page not open`);
              }
              
              socketConnections.forEach(async (socket) => {
                // Request chat list update
                sendToSocket(
                  socket?.socketId,
                  { chatId: result?.chatId },
                  "request_update_chat_list"
                );
                console.log(`   📤 Sent "request_update_chat_list" to socket ${socket?.socketId}`);
                
                // Ring notification for new incoming messages
                sendToSocket(socket?.socketId, {}, "ring");
                console.log(`   🔔 Sent "ring" notification to socket ${socket?.socketId}`);
              });
              
              if (socketConnections.length > 0) {
                console.log(`✅ Socket events emitted for incoming message`);
              }
            }
          } else if (message.message) {
            console.log(`⚠️  Message processed but no result returned`);
          }
        } catch (error) {
          console.error(`❌ Error processing message:`, error);
          console.error(`   Stack:`, error.stack);
        }
      }
    });

    return socket;
  } catch (error) {
    console.error(`❌ Error creating session ${sessionId}:`, error);
    sessions.delete(sessionId);
    throw error;
  }
}

/**
 * Delete session
 */
async function deleteSession(sessionId) {
  try {
    const socket = sessions.get(sessionId);

    if (socket) {
      await socket.logout();
      sessions.delete(sessionId);
      console.log(`✅ Session ${sessionId} deleted`);
    }

    // Clean up session files
    const sessionPath = getSessionPath(sessionId);
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      console.log(`🗑️ Session files deleted for ${sessionId}`);
    }

    retries.delete(sessionId);
  } catch (error) {
    console.error(`❌ Error deleting session ${sessionId}:`, error);
  }
}

/**
 * Send message
 */
async function sendMessage(sessionId, to, message) {
  const socket = sessions.get(sessionId);

  if (!socket) {
    throw new Error(`Session ${sessionId} not found`);
  }

  try {
    const jid = formatPhone(to);
    const sent = await socket.sendMessage(jid, message);
    return sent;
  } catch (error) {
    console.error(`❌ Error sending message:`, error);
    throw error;
  }
}

/**
 * Check if number exists on WhatsApp
 */
async function isExists(sessionId, jid) {
  const socket = sessions.get(sessionId);

  if (!socket) {
    return false;
  }

  try {
    const [result] = await socket.onWhatsApp(jid);
    return result?.exists || false;
  } catch (error) {
    console.error(`❌ Error checking if exists:`, error);
    return false;
  }
}

/**
 * Format phone number
 */
function formatPhone(phone) {
  if (phone.endsWith("@s.whatsapp.net")) return phone;
  let formatted = phone.replace(/\D/g, "");
  return formatted + "@s.whatsapp.net";
}

/**
 * Format group JID
 */
function formatGroup(group) {
  if (group.endsWith("@g.us")) return group;
  let formatted = group.replace(/[^\d-]/g, "");
  return formatted + "@g.us";
}

/**
 * Initialize - load existing sessions
 */
async function init() {
  console.log("🚀 Initializing QR WhatsApp system...");

  try {
    // Get all connected instances from database
    let instances = [];
    try {
      const result = await query(
        "SELECT uniqueId, status FROM instance WHERE status = 'connected' OR status = 'healthy'"
      );
      // query() resolves to the rows array directly for SELECTs.
      instances = Array.isArray(result) ? result : [];
    } catch (error) {
      console.error('❌ Error querying instances:', error.message);
      instances = [];
    }

    console.log(`📋 Found ${instances.length} existing session(s)`);

    // Restore sessions
    for (const instance of instances) {
      const sessionPath = getSessionPath(instance.uniqueId);

      // Check if session files exist
      if (fs.existsSync(sessionPath)) {
        console.log(`🔄 Restoring session: ${instance.uniqueId}`);
        try {
          await createSession(instance.uniqueId);
          await delay(2000); // Delay between sessions
        } catch (error) {
          console.error(
            `❌ Error restoring session ${instance.uniqueId}:`,
            error
          );
        }
      } else {
        console.log(
          `⚠️ Session files not found for ${instance.uniqueId}, marking as disconnected`
        );
        await query("UPDATE instance SET status = ? WHERE uniqueId = ?", [
          "disconnected",
          instance.uniqueId,
        ]);
      }
    }

    console.log("✅ QR WhatsApp system initialized");
  } catch (error) {
    console.error("❌ Error initializing QR system:", error);
  }
}

/**
 * Cleanup - close all sessions
 */
async function cleanup() {
  console.log("🧹 Cleaning up QR WhatsApp sessions...");

  for (const [sessionId, socket] of sessions.entries()) {
    try {
      await socket.end();
      console.log(`✅ Session ${sessionId} closed`);
    } catch (error) {
      console.error(`❌ Error closing session ${sessionId}:`, error);
    }
  }

  sessions.clear();
  retries.clear();
  console.log("✅ QR WhatsApp cleanup complete");
}

// Placeholder functions for compatibility
function downloadMediaMessage() {
  // Implement media download if needed
}

function getUrlInfo() {
  // Implement URL preview if needed
}

function generateProfilePicture() {
  // Implement profile picture generation if needed
}

function getGroupData() {
  // Implement group data retrieval if needed
}

function checkQr() {
  return true; // QR is enabled
}

async function getStorageConfig() {
  return {
    method: "file",
    path: SESSION_DIR,
  };
}

module.exports = {
  setSocketIO,
  isSessionExists,
  createSession,
  getSession,
  deleteSession,
  isExists,
  sendMessage,
  formatPhone,
  formatGroup,
  cleanup,
  init,
  getGroupData,
  getUrlInfo,
  downloadMediaMessage,
  checkQr,
  generateProfilePicture,
  getStorageConfig,
};
