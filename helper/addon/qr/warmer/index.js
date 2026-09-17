const { checkQr, getSession, isExists } = require("../index");
const { query } = require("../../../../database/dbpromise");
const {
  mergeObjects,
  getWarmerFromDB,
  getRandomElementFromArray,
  timeoutPromise,
  sendTyping,
  delayRandom,
  checkWarmerPlan,
} = require("./functions");

// ── Pacing config ────────────────────────────────────────────────────────────
// Warming is about looking HUMAN, not fast. These control how often a warm
// message is sent per user and how long we wait between full sweeps.
const PACING = {
  // Delay (seconds) between two warm messages for the SAME user in one sweep.
  perMessageMin: 25,
  perMessageMax: 90,
  // How many messages a single user may send in one sweep (kept low + random).
  maxMessagesPerUserPerSweep: 2,
  // Idle wait (seconds) between full sweeps over all users.
  sweepIntervalMin: 120,
  sweepIntervalMax: 300,
};

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Send ONE warm message from one of the user's devices to another.
 * Returns true if a message was sent, false otherwise.
 */
async function sendOneWarmMessage(instanceArr, scriptArr) {
  const instanceFrom = getRandomElementFromArray(instanceArr);
  const instanceTo = getRandomElementFromArray(instanceArr, instanceFrom);
  const script = getRandomElementFromArray(scriptArr);

  if (!instanceFrom || !instanceTo || !script?.message) return false;

  // Resolve the target device (need its phone number).
  const instanceToObj = await query(
    `SELECT * FROM instance WHERE uniqueId = ?`,
    [instanceTo],
  );
  if (!instanceToObj || instanceToObj.length < 1 || !instanceToObj[0]?.number) {
    return false;
  }

  // Grab the sending session from memory.
  let session;
  try {
    session = await timeoutPromise(getSession(instanceFrom), 15000);
  } catch (error) {
    console.log(`[warmer] session error for ${instanceFrom}:`, error?.message);
    return false;
  }
  if (!session) return false;

  const to = `${instanceToObj[0].number}@s.whatsapp.net`;
  const msg = { text: script.message };

  try {
    await sendTyping(session, instanceToObj[0].number);
    await timeoutPromise(session.sendMessage(to, msg), 10000);
    return true;
  } catch (error) {
    console.log(`[warmer] send error to ${to}:`, error?.message);
    return false;
  }
}

async function runWarmer(warmer) {
  try {
    const allowed = await checkWarmerPlan({ uid: warmer?.uid });
    if (!allowed) return;

    let instanceArr = [];
    try {
      instanceArr = JSON.parse(warmer?.instances || "[]");
    } catch {
      instanceArr = [];
    }
    const scriptArr = Array.isArray(warmer?.script) ? warmer.script : [];

    // A warmer needs at least 2 devices and at least 1 script line.
    if (instanceArr.length < 2 || scriptArr.length < 1) return;

    // Send a small, random number of messages this sweep, spaced out so it
    // looks like real back-and-forth rather than a burst.
    const count = randInt(1, PACING.maxMessagesPerUserPerSweep);
    for (let i = 0; i < count; i++) {
      const sent = await sendOneWarmMessage(instanceArr, scriptArr);
      if (sent && i < count - 1) {
        await delayRandom(PACING.perMessageMin, PACING.perMessageMax);
      }
    }
  } catch (err) {
    console.log("Error found in runWarmer", err);
  }
}

async function warmerLoopInit() {
  try {
    // Skip entirely if the QR addon isn't available.
    const qrCheck = checkQr();
    if (!qrCheck) return;

    const warmers = await getWarmerFromDB();
    if (warmers.length > 0) {
      // Sequential per user (not a parallel burst) so overall traffic stays
      // gentle. allSettled-style isolation is kept by the try/catch in runWarmer.
      for (const warmer of warmers) {
        await runWarmer(warmer);
      }
    }
  } catch (err) {
    console.log("Error in warmerLoopInit:", err);
  } finally {
    // Wait a couple of minutes between sweeps regardless of how the last one went.
    await delayRandom(PACING.sweepIntervalMin, PACING.sweepIntervalMax);
    warmerLoopInit();
  }
}

module.exports = { warmerLoopInit };
