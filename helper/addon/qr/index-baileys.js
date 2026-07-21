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
} = require("baileys");

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
  console.log("✅ Socket.IO attached to QR module");
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
async function createSession(sessionId) {
  try {
    console.log(`🚀 Creating session: ${sessionId}`);

    // Clean up existing session if any
    if (sessions.has(sessionId)) {
      console.log(`⚠️ Session ${sessionId} already exists, cleaning up...`);
      await deleteSession(sessionId);
      await delay(2000);
    }

    // Get auth state
    const sessionPath = getSessionPath(sessionId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    // Create socket
    const socket = makeWASocket({
      auth: state,
      printQRInTerminal: false, // We'll handle QR ourselves
      logger,
      browser: Browsers.ubuntu("Chrome"),
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

      console.log(`📡 Connection update for ${sessionId}:`, {
        connection,
        hasQR: !!qr,
      });

      // Emit QR code to frontend
      if (qr && io) {
        try {
          const qrDataURL = await toDataURL(qr);
          console.log(`📱 QR Code generated for ${sessionId}`);

          // Emit to all connected clients
          io.emit("qr", {
            sessionId,
            qr: qrDataURL,
            timestamp: Date.now(),
          });

          // Also emit with session-specific event
          io.emit(`qr-${sessionId}`, {
            sessionId,
            qr: qrDataURL,
            timestamp: Date.now(),
          });

          console.log(`✅ QR Code emitted via Socket.IO for ${sessionId}`);
        } catch (error) {
          console.error(`❌ Error generating QR code:`, error);
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
        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !==
          DisconnectReason.loggedOut;

        console.log(
          `❌ Session ${sessionId} closed. Reconnect: ${shouldReconnect}`
        );

        if (shouldReconnect) {
          const currentRetries = retries.get(sessionId) || 0;

          if (currentRetries < 5) {
            retries.set(sessionId, currentRetries + 1);
            console.log(
              `🔄 Reconnecting ${sessionId} (attempt ${currentRetries + 1}/5)...`
            );
            await delay(3000);
            await createSession(sessionId);
          } else {
            console.log(`❌ Max retries reached for ${sessionId}`);
            retries.delete(sessionId);
            sessions.delete(sessionId);

            // Update database
            await query(
              "UPDATE instance SET status = ? WHERE uniqueId = ?",
              ["disconnected", sessionId]
            );
          }
        } else {
          // Logged out
          console.log(`🚪 Session ${sessionId} logged out`);
          sessions.delete(sessionId);
          retries.delete(sessionId);

          // Update database
          await query("UPDATE instance SET status = ? WHERE uniqueId = ?", [
            "disconnected",
            sessionId,
          ]);

          // Clean up session files
          const sessionPath = getSessionPath(sessionId);
          if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
          }
        }
      }
    });

    // Handle messages
    socket.ev.on("messages.upsert", async ({ messages, type }) => {
      console.log(`📩 Message received in ${sessionId}:`, {
        count: messages.length,
        type,
      });
      // Message handling will be integrated with existing inbox system
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
    const [instances] = await query(
      "SELECT uniqueId, status FROM instance WHERE status = 'connected' OR status = 'healthy'"
    );

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
