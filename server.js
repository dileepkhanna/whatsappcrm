require("dotenv").config({ silent: true });
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const fileUpload = require("express-fileupload");
const nodeCleanup = require("node-cleanup");
const compression = require("compression");
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
app.use(compression());
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
app.use("/api/wa_call", require("./routes/waCall"));
app.use("/api/telegram", require("./routes/telegram"));
app.use("/api/theme", require("./routes/theme"));
app.use("/api/insta", require("./routes/insta"));
app.use("/api/kaban", require("./routes/kaban"));
app.use("/api/waform", require("./routes/waform"));
app.use("/api/whatsapp", require("./routes/whatsappFlow"));
app.use("/api/automation", require("./routes/automation"));
app.use("/api/advanced_templates", require("./routes/advancedTemplates")); // Carousel & Catalog templates

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
      res.setHeader("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Encoding, Content-Length");
    },
    index: false,
    acceptRanges: true,
  });
};

app.use("/media", createMediaMiddleware("./client/public/media"));
app.use("/meta-media", createMediaMiddleware("./client/public/meta-media"));

// ─── Static & Catch-All ───────────────────────────────────────────────────────
// USE_LEGACY_CLIENT=true  → serve old CRA bundle from client/public
// USE_LEGACY_CLIENT=false (default) → serve new Vite build from frontend/dist
const frontendDistPath = path.resolve(currentDir, "./frontend/dist");
const clientPublicPath = path.resolve(currentDir, "./client/public");

const useLegacy = process.env.USE_LEGACY_CLIENT === "true";
const newFrontendReady = fs.existsSync(path.join(frontendDistPath, "index.html"));

const staticPath  = (!useLegacy && newFrontendReady) ? frontendDistPath : clientPublicPath;
const indexPath   = (!useLegacy && newFrontendReady)
  ? path.join(frontendDistPath, "index.html")
  : path.join(clientPublicPath, "index.html");

console.log(`📂 Serving static files from: ${staticPath}`);

// Serve built assets. Hashed files under /assets are content-addressed, so they
// can be cached long-term. index.html must NEVER be cached, otherwise the browser
// can keep pointing at old chunk hashes that no longer exist after a rebuild
// ("Failed to fetch dynamically imported module").
app.use(
  express.static(staticPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }),
);

app.get("*", function (request, response) {
  // The SPA entry document must always be revalidated so clients pick up new
  // asset hashes immediately after a deploy.
  response.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
  response.sendFile(indexPath);
});

// ─── Server ───────────────────────────────────────────────────────────────────
const server = app.listen(process.env.PORT || 3010, () => {
  console.log(`WaCrm server is running on port ${process.env.PORT}`);
  updateLangJsonFromEnglish();
  
  server.setTimeout(120000);
  
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
    // warmerLoopInit(); // Uncomment if using phone number warmer
    initCampaign(); // ✅ ENABLED - Process campaigns
    // initTele(); // Uncomment if using Telegram
  }, 1000);
});

// ─── Cleanup ──────────────────────────────────────────────────────────────────
nodeCleanup(async (exitCode, signal) => {
  await cleanupTele();
  cleanup();
});
