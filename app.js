require("dotenv").config({ silent: true });
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const fileUpload = require("express-fileupload");
const nodeCleanup = require("node-cleanup");
const { initCampaign } = require("./loops/campaignBeta.js");
const { init, cleanup } = require("./helper/addon/qr");
const { warmerLoopInit } = require("./helper/addon/qr/warmer/index.js");
const { initTele, cleanupTele } = require("./helper/addon/telegram/tele.js");
const { updateLangJsonFromEnglish } = require("./utils/fun.js");
const app = express();
const currentDir = process.cwd();
// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(cors());
app.use(fileUpload());

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/user", require("./routes/user"));
app.use("/api/web", require("./routes/web"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/phonebook", require("./routes/phonebook"));
app.use("/api/chat_flow", require("./routes/chatFlow"));
app.use("/api/inbox", require("./routes/inbox"));
app.use("/api/templet", require("./routes/templet"));
app.use("/api/chatbot", require("./routes/chatbot"));
app.use("/api/broadcast", require("./routes/broadcast"));
app.use("/api/v1", require("./routes/apiv2"));
app.use("/api/agent", require("./routes/agent"));
app.use("/api/qr", require("./routes/qr"));
app.use("/api/ai", require("./routes/ai"));
app.use("/api/webhook", require("./routes/webhook"));
app.use("/api/webpush", require("./routes/webPush"));
app.use("/api/ai_settings", require("./routes/aiSettings"));
app.use("/api/wa_call", require("./routes/waCall"));
app.use("/api/telegram", require("./routes/telegram"));
app.use("/api/theme", require("./routes/theme"));
app.use("/api/insta", require("./routes/insta"));
app.use("/api/kaban", require("./routes/kaban"));
app.use("/api/waform", require("./routes/waform"));
// Public Chat Widget loader + config (serves /widget.js and /api/widget/config/:id).
app.use("/", require("./routes/widget"));

// ─── Media Streaming Middleware ───────────────────────────────────────────────
const createMediaMiddleware = (folderPath) => {
  const mimeTypes = {
    // Video
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    // Audio
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".opus": "audio/opus",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
  };

  return express.static(path.resolve(currentDir, folderPath), {
    setHeaders: (res, filePath) => {
      res.setHeader("Accept-Ranges", "bytes");

      const ext = path.extname(filePath).toLowerCase();
      if (mimeTypes[ext]) {
        res.setHeader("Content-Type", mimeTypes[ext]);
      }

      res.setHeader("Cache-Control", "public, max-age=31536000");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Range");
    },
    index: false,
    acceptRanges: true,
  });
};

app.use("/media", createMediaMiddleware("./client/public/media"));
app.use("/meta-media", createMediaMiddleware("./client/public/meta-media"));

// ─── Static & Catch-All ───────────────────────────────────────────────────────
// Serve the current Vite build from frontend/dist (produced by `npm run build`).
// The legacy client/public bundle is kept only for its media folders (served
// above) and is NOT used for the app shell. Fall back to client/public if a
// dist build hasn't been produced yet, so the server still boots.
const distDir = path.resolve(currentDir, "./frontend/dist");
const legacyDir = path.resolve(currentDir, "./client/public");
const webRoot = fs.existsSync(path.join(distDir, "index.html")) ? distDir : legacyDir;

app.use(express.static(webRoot));

app.get("*", function (request, response) {
  response.sendFile(path.resolve(webRoot, "index.html"));
});

// ─── Server ───────────────────────────────────────────────────────────────────
const server = app.listen(process.env.PORT || 3010, () => {
  console.log(`WaCrm server is running on port ${process.env.PORT}`);
  updateLangJsonFromEnglish();
  
  // ─── Socket.IO MUST be initialized BEFORE QR module ──────────────────────────
  const { initializeSocket } = require("./socket");
  const io = initializeSocket(server);
  
  console.log("🔍 DEBUG: io type =", typeof io);
  console.log("🔍 DEBUG: io exists =", !!io);
  
  // ─── Connect QR Module to Socket.IO ───────────────────────────────────────────
  const qrModule = require("./helper/addon/qr");
  qrModule.setSocketIO(io);
  console.log("✅ QR Module connected to Socket.IO");
  
  // ─── NOW initialize QR sessions (AFTER Socket.IO is connected) ────────────────
  init(); // ✅ QR code initialization - ENABLED for QR WhatsApp
  
  setTimeout(() => {
    warmerLoopInit(); // ✅ ENABLED - WhatsApp number warmer (QR devices only)
    initCampaign(); // ✅ ENABLED - Process campaigns
    // initTele(); // Uncomment if using Telegram

    // ✅ Lead Auto-Call: poll published Google Sheets for new ad-campaign leads.
    try {
      require("./helper/addon/wacall/sheetPoller.js").startSheetPoller();
    } catch (e) {
      console.error("Failed to start Lead Auto-Call sheet poller:", e.message);
    }
  }, 1000);
});

// Export io for other modules
module.exports = server;

// ─── Cleanup ──────────────────────────────────────────────────────────────────
nodeCleanup(async (exitCode, signal) => {
  await cleanupTele();
  cleanup();
});
