// ─────────────────────────────────────────────────────────────────────────────
// WebRTC call session for WhatsApp AI calling, built on @roamhq/wrtc.
//
// Meta sends us an SDP *offer* in the "connect" webhook event. We:
//   1. create an RTCPeerConnection with a mic source (RTCAudioSource) we control,
//   2. setRemoteDescription(offer), createAnswer(), setLocalDescription(answer),
//   3. hand the answer SDP back to the caller (who sends it to Meta via accept),
//   4. play TTS PCM out through the source, and capture the caller's audio via
//      an RTCAudioSink on the inbound track.
//
// wrtc's non-standard media API:
//   const source = new RTCAudioSource();  const track = source.createTrack();
//   source.onData({ samples: Int16Array, sampleRate, channelCount, ... });
//   const sink = new RTCAudioSink(remoteTrack); sink.ondata = ({samples,...}) => …
//
// WhatsApp negotiates 48kHz mono PCM. We resample our 16kHz TTS up to 48k when
// playing, and store captured audio for STT.
// ─────────────────────────────────────────────────────────────────────────────

const { resampleLinear } = require("./audioUtils");

// Lazy-require wrtc so a machine without the native build doesn't crash on load;
// the failure surfaces only when a call is actually attempted.
let wrtc = null;
function loadWrtc() {
  if (!wrtc) wrtc = require("@roamhq/wrtc");
  return wrtc;
}

const CALL_SAMPLE_RATE = 48000; // WhatsApp WebRTC audio rate
const FRAME_MS = 10; // wrtc expects 10ms frames
const SAMPLES_PER_FRAME = (CALL_SAMPLE_RATE * FRAME_MS) / 1000; // 480

class CallSession {
  constructor({ callId }) {
    this.callId = callId;
    this.pc = null;
    this.audioSource = null;
    this.audioSink = null;
    this.outboundTrack = null;

    // Captured inbound audio (caller voice) as 48k PCM chunks.
    this.capturedChunks = [];
    this.capturing = false;

    // Outbound playback queue: array of Int16 frames pushed at 10ms cadence.
    this._playQueue = [];
    this._playTimer = null;
    this._silenceFrame = new Int16Array(SAMPLES_PER_FRAME); // all zeros
    this._onPlaybackDrained = null;
  }

  /**
   * Build the peer connection, apply the remote offer, and return our SDP answer.
   * @param {string} offerSdp the SDP offer string from Meta's connect event
   * @returns {Promise<string>} our SDP answer
   */
  async createAnswer(offerSdp) {
    const { RTCPeerConnection, RTCAudioSource, nonstandard } = loadWrtc();
    const AudioSource = RTCAudioSource || nonstandard?.RTCAudioSource;

    this.pc = new RTCPeerConnection({
      // WhatsApp media is relayed; STUN helps ICE for the server-side peer.
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    // Outbound audio: a source we push TTS frames into.
    this.audioSource = new AudioSource();
    this.outboundTrack = this.audioSource.createTrack();
    this.pc.addTrack(this.outboundTrack);

    // Inbound audio: capture the caller's track when it arrives.
    this.pc.ontrack = (event) => {
      try {
        const [track] = event.streams?.[0]?.getAudioTracks?.() || [event.track];
        this._attachSink(track || event.track);
      } catch (err) {
        console.error(`[wa-call] ontrack error (${this.callId}):`, err.message);
      }
    };

    await this.pc.setRemoteDescription({ type: "offer", sdp: offerSdp });
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    // Start the 10ms playback pump (sends silence when queue is empty so the
    // RTP stream stays alive and the caller doesn't hear glitches).
    this._startPlaybackPump();

    return this.pc.localDescription.sdp;
  }

  /**
   * Build the peer connection as the OFFERER (business-initiated / outbound
   * calls). WhatsApp requires us to send an SDP offer in the initiateCall
   * `session` param; Meta later returns its answer in the "connect" webhook,
   * which we apply via applyAnswer().
   * @returns {Promise<string>} our SDP offer
   */
  async createOffer() {
    const { RTCPeerConnection, RTCAudioSource, nonstandard } = loadWrtc();
    const AudioSource = RTCAudioSource || nonstandard?.RTCAudioSource;

    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    this.audioSource = new AudioSource();
    this.outboundTrack = this.audioSource.createTrack();
    this.pc.addTrack(this.outboundTrack);

    this.pc.ontrack = (event) => {
      try {
        const [track] = event.streams?.[0]?.getAudioTracks?.() || [event.track];
        this._attachSink(track || event.track);
      } catch (err) {
        console.error(`[wa-call] ontrack error (${this.callId}):`, err.message);
      }
    };

    const offer = await this.pc.createOffer({ offerToReceiveAudio: true });
    await this.pc.setLocalDescription(offer);

    // Wait briefly for ICE candidates to be gathered into the SDP (non-trickle),
    // since we send the SDP once in the REST call.
    await this._waitForIceGathering(2500);

    this._startPlaybackPump();
    return this.pc.localDescription.sdp;
  }

  /** Apply Meta's SDP answer to an outbound call we offered. */
  async applyAnswer(answerSdp) {
    if (!this.pc) throw new Error("No peer connection to apply answer to");
    await this.pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
  }

  // Resolve when ICE gathering completes or after a timeout (whichever first).
  _waitForIceGathering(timeoutMs = 2500) {
    return new Promise((resolve) => {
      if (!this.pc || this.pc.iceGatheringState === "complete") return resolve();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.pc.removeEventListener?.("icegatheringstatechange", onChange);
        resolve();
      };
      const onChange = () => {
        if (this.pc.iceGatheringState === "complete") finish();
      };
      this.pc.addEventListener?.("icegatheringstatechange", onChange);
      setTimeout(finish, timeoutMs);
    });
  }

  _attachSink(track) {
    if (!track) return;
    const { nonstandard, RTCAudioSink } = loadWrtc();
    const Sink = RTCAudioSink || nonstandard?.RTCAudioSink;
    if (!Sink) return;
    this.audioSink = new Sink(track);
    this.audioSink.ondata = (data) => {
      if (!this.capturing) return;
      // data.samples is an Int16Array at data.sampleRate (usually 48k).
      const buf = Buffer.from(
        data.samples.buffer,
        data.samples.byteOffset,
        data.samples.byteLength,
      );
      // Normalize to 48k for consistent storage.
      const pcm48 =
        data.sampleRate === CALL_SAMPLE_RATE
          ? Buffer.from(buf)
          : resampleLinear(Buffer.from(buf), data.sampleRate, CALL_SAMPLE_RATE);
      this.capturedChunks.push(pcm48);
    };
  }

  _startPlaybackPump() {
    if (this._playTimer) return;
    this._playTimer = setInterval(() => {
      if (!this.audioSource) return;
      const frame = this._playQueue.shift();
      const samples = frame || this._silenceFrame;
      try {
        this.audioSource.onData({
          samples,
          sampleRate: CALL_SAMPLE_RATE,
          bitsPerSample: 16,
          channelCount: 1,
          numberOfFrames: samples.length,
        });
      } catch (_) {
        /* source closed */
      }
      if (!frame && this._playQueue.length === 0 && this._onPlaybackDrained) {
        const cb = this._onPlaybackDrained;
        this._onPlaybackDrained = null;
        cb();
      }
    }, FRAME_MS);
  }

  /**
   * Queue 16kHz mono PCM (from ElevenLabs TTS) for playback. It's resampled to
   * 48k and chopped into 10ms frames. Resolves when the whole clip has played.
   * @param {Buffer} pcm16k
   */
  playPcm16k(pcm16k) {
    return new Promise((resolve) => {
      if (!pcm16k || pcm16k.length === 0) return resolve();
      const pcm48 = resampleLinear(pcm16k, 16000, CALL_SAMPLE_RATE);
      const totalSamples = Math.floor(pcm48.length / 2);
      for (let i = 0; i < totalSamples; i += SAMPLES_PER_FRAME) {
        const frame = new Int16Array(SAMPLES_PER_FRAME);
        for (let j = 0; j < SAMPLES_PER_FRAME; j++) {
          const idx = (i + j) * 2;
          frame[j] = idx + 1 < pcm48.length ? pcm48.readInt16LE(idx) : 0;
        }
        this._playQueue.push(frame);
      }
      // Resolve once the queue drains.
      this._onPlaybackDrained = resolve;
    });
  }

  /** Begin buffering inbound caller audio (for a gather step). */
  startCapture() {
    this.capturedChunks = [];
    this.capturing = true;
  }

  /** Stop capturing and return the caller audio as one 16kHz PCM buffer (for STT). */
  stopCapture() {
    this.capturing = false;
    const pcm48 = Buffer.concat(this.capturedChunks);
    this.capturedChunks = [];
    if (pcm48.length === 0) return Buffer.alloc(0);
    return resampleLinear(pcm48, CALL_SAMPLE_RATE, 16000);
  }

  /**
   * Listen for the caller and stop automatically when they go quiet (simple
   * voice-activity detection), rather than a fixed window. This makes the
   * "gather" step feel natural — the AI responds as soon as the caller finishes.
   *
   * @param {Object} opts
   * @param {number} opts.maxMs        hard cap on total listen time
   * @param {number} opts.silenceMs    stop after this much trailing silence
   * @param {number} opts.minSpeechMs  require at least this much speech before silence counts
   * @returns {Promise<Buffer>} captured caller audio as 16kHz mono PCM
   */
  captureUntilSilence({ maxMs = 12000, silenceMs = 1200, minSpeechMs = 300 } = {}) {
    return new Promise((resolve) => {
      this.startCapture();
      const started = Date.now();
      let lastVoiceAt = 0;
      let speechMs = 0;
      const tick = 100; // check every 100ms

      const timer = setInterval(() => {
        // Look at the most recent chunk(s) to gauge energy.
        const recent = this.capturedChunks.slice(-5);
        const energetic = recent.some((buf) => rms16(buf) > 550); // ~voice threshold
        const now = Date.now();
        if (energetic) {
          lastVoiceAt = now;
          speechMs += tick;
        }
        const elapsed = now - started;
        const trailingSilence = lastVoiceAt ? now - lastVoiceAt : elapsed;

        const heardEnough = speechMs >= minSpeechMs;
        const finishedTalking = heardEnough && trailingSilence >= silenceMs;
        const timedOut = elapsed >= maxMs;

        if (finishedTalking || timedOut) {
          clearInterval(timer);
          resolve(this.stopCapture());
        }
      }, tick);
    });
  }

  /**
   * Non-destructive read of all caller audio captured so far, as 16kHz mono PCM.
   * Used for best-effort recording even if the call ended abruptly.
   */
  getCapturedSoFar() {
    if (!this.capturedChunks || this.capturedChunks.length === 0) return Buffer.alloc(0);
    const pcm48 = Buffer.concat(this.capturedChunks);
    if (pcm48.length === 0) return Buffer.alloc(0);
    return resampleLinear(pcm48, CALL_SAMPLE_RATE, 16000);
  }

  /** Tear down everything. */
  close() {
    try {
      if (this._playTimer) clearInterval(this._playTimer);
      this._playTimer = null;
      if (this.audioSink) this.audioSink.stop?.();
      if (this.outboundTrack) this.outboundTrack.stop?.();
      if (this.pc) this.pc.close();
    } catch (err) {
      console.error(`[wa-call] close error (${this.callId}):`, err.message);
    }
  }
}

// Root-mean-square amplitude of a 16-bit PCM buffer — a cheap voice-activity gauge.
function rms16(buf) {
  if (!buf || buf.length < 2) return 0;
  const n = Math.floor(buf.length / 2);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const s = buf.readInt16LE(i * 2);
    sum += s * s;
  }
  return Math.sqrt(sum / n);
}

module.exports = { CallSession, CALL_SAMPLE_RATE };
