/**
 * One live AI phone call (one Twilio Media Stream).
 *
 * Flow: [language choice] -> greeting -> loop { caller speaks -> STT -> LLM -> TTS }
 *       -> end -> hang up -> post-call extraction -> save.
 */
const { query } = require("../../../database/dbpromise.js");
const store = require("./store.js");
const audio = require("./audio.js");
const stt = require("./stt.js");
const tts = require("./tts.js");
const llm = require("./llm.js");
const prompts = require("./prompts.js");
const twilioClient = require("./twilioClient.js");
const { emitCall } = require("./notify.js");

const SILENCE_MS = 8000;
const LANG_MENU_WAIT_MS = 8000;
const MAX_HISTORY = 24;

class CallSession {
  /**
   * @param {object} p
   * @param {import("ws")} p.ws
   * @param {string} p.streamSid
   * @param {object} p.call     vc_calls row
   * @param {object} p.agent    vc_agents row
   * @param {object|null} p.lead vc_leads row
   * @param {object} p.settings raw admin settings
   */
  constructor({ ws, streamSid, call, agent, lead, settings }) {
    this.ws = ws;
    this.streamSid = streamSid;
    this.call = call;
    this.agent = agent;
    this.lead = lead;
    this.settings = settings;

    this.lang = prompts.normalizeLang(lead?.language, "");
    this.langChosen = !!this.lang;
    this.defaultLang = prompts.normalizeLang(agent.default_language, "en");

    this.transcript = []; // {role:'assistant'|'user', text, lang, t}
    this.state = "starting"; // starting | lang_menu | running | ending | done
    this.queue = [];
    this.busy = false;
    this.silenceCount = 0;
    this.userSpoke = false;
    this.dnc = false;
    this.endRequested = false;
    this.error = null;
    this.finalized = false;

    this.playing = false;
    this._playResolve = null;
    this._playTimer = null;
    this._silenceTimer = null;
    this._menuTimer = null;
    this._maxTimer = null;
    this._menuTries = 0;

    this.vad = new audio.Vad({
      onSpeechStart: () => this._onSpeechStart(),
      onUtterance: (pcm) => this._enqueueUtterance(pcm),
    });
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────
  async start() {
    await query(`UPDATE vc_calls SET status = 'in-progress' WHERE call_id = ?`, [
      this.call.call_id,
    ]);
    this._emit("in-progress");

    const maxMs = Math.max(30, Number(this.agent.max_duration_sec) || 300) * 1000;
    this._maxTimer = setTimeout(() => this.finish("max_duration"), maxMs);

    try {
      if (this.langChosen) {
        await this._beginConversation();
      } else {
        await this._languageMenu();
      }
    } catch (e) {
      await this._fail(e);
    }
  }

  /** Incoming Twilio stream messages. */
  onMedia(ulawBuf) {
    this.vad.push(ulawBuf);
  }

  onDtmf(digit) {
    if (this.state !== "lang_menu") return;
    if (digit === "1") this._chooseLanguage("en");
    else if (digit === "2") this._chooseLanguage("te");
  }

  onMark(name) {
    if (name && name.startsWith("play_") && this._playResolve) this._resolvePlay();
  }

  /** Called when Twilio closes the stream (caller hung up or call ended). */
  async onClose() {
    this._clearTimers();
    this._resolvePlay();
    if (this.state !== "done") await this._finalize(this.endRequested ? "ended" : "hangup");
  }

  // ── language menu ─────────────────────────────────────────────────────────
  async _languageMenu() {
    this.state = "lang_menu";
    this.vad.setPaused(false);
    await this._playText(prompts.LINES.chooseLanguage.en, "en", { log: false });
    if (this.state === "lang_menu" && !this._interrupted) {
      await this._playText(prompts.LINES.chooseLanguage.te, "te", { log: false });
    }
    this._interrupted = false;
    if (this.state === "lang_menu") this._armMenuTimer();
  }

  _armMenuTimer() {
    clearTimeout(this._menuTimer);
    this._menuTimer = setTimeout(() => {
      if (this.state !== "lang_menu") return;
      this._menuTries += 1;
      if (this._menuTries >= 2) {
        this._chooseLanguage(this.defaultLang);
      } else {
        this._languageMenu().catch((e) => this._fail(e));
      }
    }, LANG_MENU_WAIT_MS);
  }

  _chooseLanguage(lang) {
    if (this.state !== "lang_menu") return;
    clearTimeout(this._menuTimer);
    this._stopPlayback();
    this.lang = lang;
    this.langChosen = true;
    this._beginConversation().catch((e) => this._fail(e));
  }

  async _handleMenuUtterance(pcm) {
    let text = "";
    try {
      text = await stt.transcribe(pcm, "auto", this.settings);
    } catch (e) {
      console.log("[voicecall] menu STT error:", e.message);
    }
    const t = text.toLowerCase();
    if (/telugu|తెలుగు|telagu/.test(t)) return this._chooseLanguage("te");
    if (/english|ఇంగ్లీష్|ఇంగ్లిష్/.test(t)) return this._chooseLanguage("en");
    if (this.state === "lang_menu") this._armMenuTimer();
  }

  // ── conversation ──────────────────────────────────────────────────────────
  async _beginConversation() {
    this.state = "running";
    await query(`UPDATE vc_calls SET language = ? WHERE call_id = ?`, [
      this.lang,
      this.call.call_id,
    ]);
    if (this.lead?.id) {
      await query(`UPDATE vc_leads SET language = ? WHERE id = ?`, [this.lang, this.lead.id]);
    }
    const greeting = prompts.buildGreeting(this.agent, this.lang, this.lead);
    await this._say(greeting);
    this._armSilenceTimer();
  }

  _onSpeechStart() {
    clearTimeout(this._silenceTimer);
    // barge-in: stop AI audio the moment the caller starts talking
    if (this.playing) {
      this._interrupted = true;
      this._stopPlayback();
    }
  }

  _enqueueUtterance(pcm) {
    if (this.state !== "running" && this.state !== "lang_menu") return;
    this.queue.push(pcm);
    this._drain();
  }

  async _drain() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queue.length && (this.state === "running" || this.state === "lang_menu")) {
        const pcm = this.queue.shift();
        if (this.state === "lang_menu") await this._handleMenuUtterance(pcm);
        else await this._turn(pcm);
      }
    } catch (e) {
      await this._fail(e);
    } finally {
      this.busy = false;
    }
  }

  async _turn(pcm) {
    let userText = "";
    try {
      userText = await stt.transcribe(pcm, this.lang, this.settings);
    } catch (e) {
      console.log("[voicecall] STT error:", e.message);
      this.error = e.message;
      return this._apologiseAndEnd();
    }
    if (!userText) {
      this._armSilenceTimer();
      return;
    }

    this.userSpoke = true;
    this.silenceCount = 0;
    this.transcript.push({ role: "user", text: userText, lang: this.lang, t: Date.now() });
    this._emit("in-progress");

    let reply;
    try {
      reply = await this._askLlm();
    } catch (e) {
      console.log("[voicecall] LLM error:", e.message);
      this.error = e.message;
      return this._apologiseAndEnd();
    }

    const parsed = prompts.parseReply(reply);
    if (parsed.dnc) this.dnc = true;
    if (parsed.text) await this._say(parsed.text);
    if (parsed.lang && parsed.lang !== this.lang) {
      this.lang = parsed.lang;
      await query(`UPDATE vc_calls SET language = ? WHERE call_id = ?`, [
        this.lang,
        this.call.call_id,
      ]);
      if (this.lead?.id) {
        await query(`UPDATE vc_leads SET language = ? WHERE id = ?`, [this.lang, this.lead.id]);
      }
    }
    if (parsed.end || parsed.dnc) {
      if (parsed.dnc && !parsed.text) await this._say(prompts.LINES.stopAck[this.lang]);
      return this.finish(parsed.dnc ? "do_not_call" : "goal_reached", { skipClosing: true });
    }
    this._armSilenceTimer();
  }

  async _askLlm() {
    const system = prompts.buildSystemPrompt({
      agent: this.agent,
      lang: this.lang,
      lead: this.lead,
    });
    const history = this.transcript.slice(-MAX_HISTORY).map((t) => ({
      role: t.role,
      content: t.text,
    }));
    const messages = [{ role: "system", content: system }, ...history];
    try {
      return await llm.chat({ messages, settings: this.settings, timeoutMs: 8000 });
    } catch (first) {
      // one retry
      return await llm.chat({ messages, settings: this.settings, timeoutMs: 8000 });
    }
  }

  // ── silence handling ──────────────────────────────────────────────────────
  _armSilenceTimer() {
    clearTimeout(this._silenceTimer);
    if (this.state !== "running") return;
    this._silenceTimer = setTimeout(async () => {
      if (this.state !== "running" || this.busy) return;
      this.silenceCount += 1;
      if (this.silenceCount === 1) {
        await this._say(prompts.LINES.reprompt[this.lang]);
        this._armSilenceTimer();
      } else {
        this.finish("silence");
      }
    }, SILENCE_MS);
  }

  // ── speaking ──────────────────────────────────────────────────────────────
  /** Speak and record in the transcript. */
  async _say(text) {
    this.transcript.push({ role: "assistant", text, lang: this.lang, t: Date.now() });
    this._emit("in-progress");
    await this._playText(text, this.lang, { log: true });
  }

  async _playText(text, lang, { log = true } = {}) {
    if (!text) return;
    let ulaw;
    try {
      ulaw = await tts.synthesize(text, lang, this.settings);
    } catch (e) {
      console.log("[voicecall] TTS error:", e.message);
      this.error = e.message;
      throw e;
    }
    if (this.ws.readyState !== 1) return;
    await this._sendAudio(ulaw);
    void log;
  }

  _sendAudio(ulaw) {
    return new Promise((resolve) => {
      this.playing = true;
      this._playResolve = resolve;
      const markName = `play_${Date.now()}`;
      // 20 ms frames
      for (let i = 0; i < ulaw.length; i += 160) {
        this._send({
          event: "media",
          streamSid: this.streamSid,
          media: { payload: ulaw.subarray(i, i + 160).toString("base64") },
        });
      }
      this._send({ event: "mark", streamSid: this.streamSid, mark: { name: markName } });
      // safety: resolve after the audio should have finished
      const ms = Math.ceil((ulaw.length / 8000) * 1000) + 2500;
      this._playTimer = setTimeout(() => this._resolvePlay(), ms);
    });
  }

  _resolvePlay() {
    clearTimeout(this._playTimer);
    this.playing = false;
    const r = this._playResolve;
    this._playResolve = null;
    if (r) r();
  }

  _stopPlayback() {
    if (this.playing) this._send({ event: "clear", streamSid: this.streamSid });
    this._resolvePlay();
  }

  _send(obj) {
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  // ── ending ────────────────────────────────────────────────────────────────
  async _apologiseAndEnd() {
    try {
      await this._playText(prompts.LINES.apology[this.lang || this.defaultLang], this.lang || this.defaultLang);
    } catch {
      /* ignore */
    }
    await this.finish("provider_error", { skipClosing: true });
  }

  async finish(reason, { skipClosing = false } = {}) {
    if (this.state === "ending" || this.state === "done") return;
    this.state = "ending";
    this.endRequested = true;
    this.endReason = reason;
    this._clearTimers();
    try {
      if (!skipClosing && this.userSpoke) {
        await this._playText(prompts.LINES.closing[this.lang || this.defaultLang], this.lang || this.defaultLang);
      }
    } catch {
      /* ignore */
    }
    try {
      await twilioClient.hangup(this.settings, this.call.twilio_sid);
    } catch (e) {
      console.log("[voicecall] hangup error:", e.message);
    }
    await this._finalize(reason);
  }

  async _fail(e) {
    console.log("[voicecall] session error:", e.message);
    this.error = this.error || e.message;
    await this._apologiseAndEnd();
  }

  _clearTimers() {
    clearTimeout(this._silenceTimer);
    clearTimeout(this._menuTimer);
    clearTimeout(this._maxTimer);
  }

  /** Save transcript + AI analysis. Idempotent. */
  async _finalize(reason) {
    if (this.finalized) return;
    this.finalized = true;
    this.state = "done";
    this._clearTimers();
    this._resolvePlay();

    let extraction = { summary: null, outcome: null, answers: {} };
    if (this.transcript.some((t) => t.role === "user")) {
      try {
        const raw = await llm.chat({
          messages: prompts.buildExtractionPrompt({
            agent: this.agent,
            transcript: this.transcript,
          }),
          settings: this.settings,
          maxTokens: 500,
          temperature: 0,
          json: true,
          timeoutMs: 15000,
        });
        extraction = prompts.parseExtraction(raw);
      } catch (e) {
        console.log("[voicecall] extraction error:", e.message);
      }
    }

    let outcome = extraction.outcome;
    if (this.dnc || reason === "do_not_call") outcome = "do_not_call";
    if (!outcome) outcome = this.userSpoke ? null : "no_answer";
    if (this.error && !this.userSpoke) outcome = "failed";

    await query(
      `UPDATE vc_calls SET transcript = ?, summary = ?, outcome = ?, answers = ?,
         error = ?, language = COALESCE(?, language)
       WHERE call_id = ?`,
      [
        JSON.stringify(this.transcript),
        extraction.summary,
        outcome,
        JSON.stringify(extraction.answers || {}),
        this.error,
        this.lang || null,
        this.call.call_id,
      ],
    );

    if (this.lead?.id && !this.call.is_test) {
      const status = outcome === "do_not_call" ? "dnc" : "done";
      await query(
        `UPDATE vc_leads SET status = ?, outcome = ?, locked_until = NULL WHERE id = ?`,
        [status, outcome, this.lead.id],
      );
      if (outcome === "do_not_call") {
        await query(
          `INSERT IGNORE INTO vc_dnc (uid, phone_e164, reason) VALUES (?,?,?)`,
          [this.call.uid, this.lead.phone_e164, "Asked not to be called (AI call)"],
        );
      }
    }
    this._emit("analysed", { outcome });
  }

  _emit(status, extra = {}) {
    emitCall(this.call.uid, {
      call_id: this.call.call_id,
      campaign_id: this.call.campaign_id,
      lead_id: this.call.lead_id,
      status,
      language: this.lang || null,
      ...extra,
    });
  }
}

module.exports = { CallSession };
