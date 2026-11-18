// ─────────────────────────────────────────────────────────────────────────────
// Audio helpers for the WhatsApp AI calling engine.
//
// The WebRTC layer (@roamhq/wrtc RTCAudioSink/Source) exchanges raw 16-bit PCM
// (little-endian, mono). WhatsApp negotiates 48kHz; ElevenLabs TTS/STT is easier
// at 16kHz. These helpers do the sample-rate conversion and let us persist a
// recording as a standard WAV file for the call logs.
//
// Everything here is pure/synchronous and dependency-free (except fs for saving),
// so it's safe and testable.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");

/**
 * Build a 44-byte canonical WAV header for 16-bit PCM audio.
 * @param {number} dataLength byte length of the PCM payload
 * @param {number} sampleRate e.g. 16000 or 48000
 * @param {number} channels   1 (mono) or 2 (stereo)
 * @returns {Buffer} 44-byte header
 */
function writeWavHeader(dataLength, sampleRate = 16000, channels = 1) {
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const buffer = Buffer.alloc(44);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataLength, 4); // file size - 8
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20); // audio format = PCM
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataLength, 40);

  return buffer;
}

/**
 * Linear-interpolation resampler for 16-bit mono PCM.
 * @param {Buffer} pcm      input PCM (Int16 LE, mono)
 * @param {number} fromRate source sample rate
 * @param {number} toRate   target sample rate
 * @returns {Buffer} resampled PCM (Int16 LE, mono)
 */
function resampleLinear(pcm, fromRate, toRate) {
  if (!pcm || pcm.length < 2 || fromRate === toRate) return pcm || Buffer.alloc(0);

  const inSamples = Math.floor(pcm.length / 2);
  const ratio = toRate / fromRate;
  const outSamples = Math.max(1, Math.floor(inSamples * ratio));
  const out = Buffer.alloc(outSamples * 2);

  for (let i = 0; i < outSamples; i++) {
    const srcPos = i / ratio;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;

    const s0 = idx < inSamples ? pcm.readInt16LE(idx * 2) : 0;
    const s1 = idx + 1 < inSamples ? pcm.readInt16LE((idx + 1) * 2) : s0;

    let sample = Math.round(s0 + (s1 - s0) * frac);
    if (sample > 32767) sample = 32767;
    else if (sample < -32768) sample = -32768;
    out.writeInt16LE(sample, i * 2);
  }
  return out;
}

/**
 * Interleave two mono PCM buffers (agent + caller) into a stereo recording.
 * Pads the shorter side with silence. Both must share the same sample rate.
 */
function mixStereoRecording(leftPcm, rightPcm) {
  const left = leftPcm || Buffer.alloc(0);
  const right = rightPcm || Buffer.alloc(0);
  const leftSamples = Math.floor(left.length / 2);
  const rightSamples = Math.floor(right.length / 2);
  const total = Math.max(leftSamples, rightSamples);
  const out = Buffer.alloc(total * 4); // 2 channels * 2 bytes

  for (let i = 0; i < total; i++) {
    const l = i < leftSamples ? left.readInt16LE(i * 2) : 0;
    const r = i < rightSamples ? right.readInt16LE(i * 2) : 0;
    out.writeInt16LE(l, i * 4);
    out.writeInt16LE(r, i * 4 + 2);
  }
  return out;
}

/**
 * Save a PCM buffer as a WAV file under client/public/meta-media so it can be
 * served/downloaded. Returns the public relative path (or null on failure).
 * @returns {string|null} e.g. "/meta-media/call_<id>.wav"
 */
function saveRecording({ pcm, sampleRate = 16000, channels = 1, fileName }) {
  try {
    if (!pcm || pcm.length === 0) return null;
    const dir = path.resolve(process.cwd(), "./client/public/meta-media");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const name = fileName || `call_${Date.now()}.wav`;
    const filePath = path.join(dir, name);
    const header = writeWavHeader(pcm.length, sampleRate, channels);
    fs.writeFileSync(filePath, Buffer.concat([header, pcm]));
    return `/meta-media/${name}`;
  } catch (err) {
    console.error("[wa-call] saveRecording failed:", err.message);
    return null;
  }
}

/**
 * Wait until an RTCPeerConnection reaches a connected ICE state (or timeout).
 * Resolves true on connect, false on timeout/failure.
 */
function waitForIceConnection(pc, timeoutMs = 15000) {
  return new Promise((resolve) => {
    if (!pc) return resolve(false);
    const good = ["connected", "completed"];
    if (good.includes(pc.iceConnectionState)) return resolve(true);

    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      pc.removeEventListener?.("iceconnectionstatechange", onChange);
      clearTimeout(timer);
      resolve(result);
    };
    const onChange = () => {
      if (good.includes(pc.iceConnectionState)) finish(true);
      else if (["failed", "closed", "disconnected"].includes(pc.iceConnectionState)) finish(false);
    };
    pc.addEventListener?.("iceconnectionstatechange", onChange);
    const timer = setTimeout(() => finish(good.includes(pc.iceConnectionState)), timeoutMs);
  });
}

module.exports = {
  writeWavHeader,
  saveRecording,
  mixStereoRecording,
  resampleLinear,
  waitForIceConnection,
};
