/**
 * Push live call updates to the owning user over the existing socket.io server.
 * Never throws: UI updates are best effort.
 */
function emitCall(uid, payload) {
  try {
    const { sendToUid } = require("../../../socket");
    sendToUid(uid, payload, "vc_call");
  } catch (e) {
    /* socket not ready */
  }
}

module.exports = { emitCall };
