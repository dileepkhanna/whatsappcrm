/**
 * WebSocket endpoint for Twilio Media Streams: wss://<host>/twilio-media
 *
 * Uses noServer mode and only handles upgrade requests for its own path, so
 * socket.io's upgrades on /socket.io/ are left untouched.
 */
const { WebSocketServer } = require("ws");
const { query } = require("../../../database/dbpromise.js");
const store = require("./store.js");
const twilioClient = require("./twilioClient.js");
const { CallSession } = require("./callSession.js");

const PATH = "/twilio-media";
const sessions = new Map(); // callId -> CallSession

function activeCount(uid) {
  let n = 0;
  for (const s of sessions.values()) {
    if (!uid || s.call.uid === uid) n++;
  }
  return n;
}

function attach(httpServer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 64 });

  httpServer.on("upgrade", (req, socket, head) => {
    const pathname = String(req.url || "").split("?")[0];
    if (pathname !== PATH) return; // not ours (socket.io etc.)
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (ws) => {
    let session = null;
    let callId = null;

    // Twilio sends "start" immediately. Drop connections that never do.
    const startTimeout = setTimeout(() => {
      if (!session) ws.close();
    }, 10000);

    ws.on("message", async (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      try {
        switch (msg.event) {
          case "start": {
            if (session) return;
            const params = msg.start?.customParameters || {};
            callId = String(params.callId || "");
            if (!twilioClient.verifyStreamToken(callId, params.token)) {
              console.log("[voicecall] rejected media stream: bad token");
              return ws.close();
            }

            const [call] = await query(`SELECT * FROM vc_calls WHERE call_id = ?`, [callId]);
            if (!call) return ws.close();
            const [agent] = await query(`SELECT * FROM vc_agents WHERE agent_id = ?`, [
              call.agent_id,
            ]);
            if (!agent) return ws.close();
            let lead = null;
            if (call.lead_id) {
              [lead] = await query(`SELECT * FROM vc_leads WHERE id = ?`, [call.lead_id]);
            } else {
              // test call: no lead row, use the language chosen when the call was created
              lead = { name: "", language: call.language || null };
            }
            const settings = await store.getAdminSettingsRaw();

            session = new CallSession({
              ws,
              streamSid: msg.start.streamSid,
              call,
              agent,
              lead: lead || null,
              settings,
            });
            sessions.set(callId, session);
            clearTimeout(startTimeout);
            session.start().catch((e) => console.log("[voicecall] start error:", e.message));
            break;
          }
          case "media":
            if (session && msg.media?.track !== "outbound") {
              session.onMedia(Buffer.from(msg.media.payload, "base64"));
            }
            break;
          case "dtmf":
            if (session) session.onDtmf(msg.dtmf?.digit);
            break;
          case "mark":
            if (session) session.onMark(msg.mark?.name);
            break;
          case "stop":
            ws.close();
            break;
          default:
            break;
        }
      } catch (e) {
        console.log("[voicecall] media message error:", e.message);
      }
    });

    ws.on("close", async () => {
      clearTimeout(startTimeout);
      if (callId) sessions.delete(callId);
      if (session) {
        try {
          await session.onClose();
        } catch (e) {
          console.log("[voicecall] close error:", e.message);
        }
      }
    });

    ws.on("error", (e) => console.log("[voicecall] ws error:", e.message));
  });

  console.log(`✅ AI Phone Calling media server ready at ${PATH}`);
  return wss;
}

module.exports = { attach, activeCount, PATH };
