/**
 * Audio helpers for Twilio Media Streams (8 kHz, mono, G.711 µ-law).
 * Pure functions, no I/O, unit tested.
 */

const BIAS = 0x84;
const CLIP = 32635;

// µ-law byte -> int16 lookup table
const ULAW_TO_PCM = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  const u = ~i & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let sample = ((mantissa << 3) + BIAS) << exponent;
  sample -= BIAS;
  ULAW_TO_PCM[i] = sign ? -sample : sample;
}

function encodeSample(sample) {
  let sign = 0;
  if (sample < 0) {
    sample = -sample;
    sign = 0x80;
  }
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; mask >>= 1) {
    exponent--;
  }
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

/** Buffer of µ-law bytes -> Buffer of little-endian int16 PCM. */
function ulawToPcm16(ulaw) {
  const out = Buffer.alloc(ulaw.length * 2);
  for (let i = 0; i < ulaw.length; i++) {
    out.writeInt16LE(ULAW_TO_PCM[ulaw[i]], i * 2);
  }
  return out;
}

/** Buffer of little-endian int16 PCM -> Buffer of µ-law bytes. */
function pcm16ToUlaw(pcm) {
  const n = Math.floor(pcm.length / 2);
  const out = Buffer.alloc(n);
  for (let i = 0; i < n; i++) out[i] = encodeSample(pcm.readInt16LE(i * 2));
  return out;
}

/** RMS energy of a µ-law frame, on the int16 scale. */
function rmsUlaw(ulaw) {
  if (!ulaw.length) return 0;
  let sum = 0;
  for (let i = 0; i < ulaw.length; i++) {
    const s = ULAW_TO_PCM[ulaw[i]];
    sum += s * s;
  }
  return Math.sqrt(sum / ulaw.length);
}

/** Wrap raw int16 PCM in a WAV container. */
function wavFromPcm16(pcm, sampleRate = 8000) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/**
 * Energy based voice activity detector working on 20 ms µ-law frames
 * (160 bytes). Twilio sends 20 ms frames, but we re-frame defensively.
 *
 * Callbacks:
 *   onSpeechStart()           - first voiced frames of an utterance (for barge-in)
 *   onUtterance(pcm16Buffer)  - utterance finished
 */
class Vad {
  constructor({
    onSpeechStart = () => {},
    onUtterance = () => {},
    threshold = 700,
    startFrames = 4, // 80 ms of voice to trigger
    endSilenceMs = 700,
    minUtteranceMs = 300,
    maxUtteranceMs = 15000,
    preRollFrames = 6,
  } = {}) {
    this.onSpeechStart = onSpeechStart;
    this.onUtterance = onUtterance;
    this.threshold = threshold;
    this.startFrames = startFrames;
    this.endFrames = Math.ceil(endSilenceMs / 20);
    this.minFrames = Math.ceil(minUtteranceMs / 20);
    this.maxFrames = Math.ceil(maxUtteranceMs / 20);
    this.preRollFrames = preRollFrames;

    this.pending = Buffer.alloc(0);
    this.preRoll = [];
    this.speaking = false;
    this.voicedRun = 0;
    this.silenceRun = 0;
    this.frames = [];
    this.paused = false;
  }

  /** Ignore input (e.g. while a language prompt is playing and we do not want barge-in). */
  setPaused(p) {
    this.paused = p;
    if (p) this._reset();
  }

  _reset() {
    this.speaking = false;
    this.voicedRun = 0;
    this.silenceRun = 0;
    this.frames = [];
    this.preRoll = [];
  }

  push(ulawChunk) {
    if (this.paused) return;
    this.pending = Buffer.concat([this.pending, ulawChunk]);
    while (this.pending.length >= 160) {
      const frame = this.pending.subarray(0, 160);
      this.pending = this.pending.subarray(160);
      this._frame(Buffer.from(frame));
    }
  }

  _frame(frame) {
    const voiced = rmsUlaw(frame) >= this.threshold;

    if (!this.speaking) {
      this.preRoll.push(frame);
      if (this.preRoll.length > this.preRollFrames) this.preRoll.shift();
      this.voicedRun = voiced ? this.voicedRun + 1 : 0;
      if (this.voicedRun >= this.startFrames) {
        this.speaking = true;
        this.silenceRun = 0;
        this.frames = [...this.preRoll];
        this.preRoll = [];
        this.onSpeechStart();
      }
      return;
    }

    this.frames.push(frame);
    this.silenceRun = voiced ? 0 : this.silenceRun + 1;
    if (
      this.silenceRun >= this.endFrames ||
      this.frames.length >= this.maxFrames
    ) {
      const voicedFrames = this.frames.length - this.silenceRun;
      const frames = this.frames;
      this._reset();
      if (voicedFrames >= this.minFrames) {
        this.onUtterance(ulawToPcm16(Buffer.concat(frames)));
      }
    }
  }
}

module.exports = {
  ulawToPcm16,
  pcm16ToUlaw,
  rmsUlaw,
  wavFromPcm16,
  Vad,
};
