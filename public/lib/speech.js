const LANGUAGES = new Set(['zh-CN', 'ko-KR', 'en-US']);
const HINT = 'Choose a language, then tap Speak. Review the text before sharing.';
const ERRORS = {
  'not-allowed':'Microphone access was blocked. Allow it in your browser’s site settings, then try Speak again.',
  'service-not-allowed':'The browser’s speech service is unavailable. Check its speech permissions, or type your message.',
  'audio-capture':'No microphone is available. Check the microphone and its system permissions.',
  'no-speech':'No speech was detected. Tap Speak to try again, or type your message.',
  network:'The speech service could not connect. Check your internet connection, or type your message.',
  'language-not-supported':'That voice language is unavailable. Choose another language, or type your message.',
  aborted:'Voice input stopped. You can edit the text before sharing.'
};
function clip(text, limit) {
  const value = text.slice(0, Math.max(0, limit));
  return /[\uD800-\uDBFF]$/.test(value) ? value.slice(0, -1) : value;
}

/** Speech writes a draft only. It has no planner, network-upload or Share action. */
export class SpeechInput {
  constructor({ recognitionFactory = null, onText = () => {}, onState = () => {}, maxLength = 2000, timers = globalThis, maxDurationMs = 60000, stopTimeoutMs = 3000, unsupportedMessage = 'Voice input is unavailable in this browser. Try Chrome, or type your message.' } = {}) {
    this.factory = recognitionFactory; this.onText = onText; this.onState = onState;
    this.maxLength = maxLength; this.timers = timers; this.maxDurationMs = maxDurationMs; this.stopTimeoutMs = stopTimeoutMs;
    this.current = null; this.sequence = 0; this.destroyed = false;
    this.state = { supported:Boolean(recognitionFactory), active:false, phase:recognitionFactory ? 'idle' : 'unsupported', message:recognitionFactory ? HINT : unsupportedMessage, error:false };
    this.onState({ ...this.state });
  }
  get supported() { return this.state.supported; }
  get active() { return Boolean(this.current && !this.destroyed); }
  publish(phase, message, error = false) {
    this.state = { ...this.state, phase, message, error, active:this.active };
    this.onState({ ...this.state });
  }
  valid(session) { return !this.destroyed && this.current === session && session.id === this.sequence; }
  start({ text = '', selectionStart = text.length, selectionEnd = selectionStart, language = 'zh-CN' } = {}) {
    if (!this.supported || this.destroyed || this.active) return false;
    const draft = String(text);
    const start = Math.max(0, Math.min(draft.length, Number(selectionStart) || 0));
    const end = Math.max(start, Math.min(draft.length, Number(selectionEnd) || 0));
    if (draft.length - (end - start) >= this.maxLength) {
      this.publish('idle', `The ${this.maxLength}-character limit is reached. Make room in the text before using Speak.`, true);
      return false;
    }
    const session = { id:++this.sequence, before:draft.slice(0, start), after:draft.slice(end), language:LANGUAGES.has(language) ? language : 'zh-CN', heard:false, started:false, limit:false, recordingTimer:null, stopTimer:null, recognition:null };
    this.current = session;
    this.publish('starting', 'Starting the microphone… Allow microphone access if your browser asks.');
    try {
      const recognition = session.recognition = this.factory();
      recognition.lang = session.language; recognition.continuous = true; recognition.interimResults = true; recognition.maxAlternatives = 1;
      recognition.onstart = () => {
        if (!this.valid(session)) return;
        session.started = true;
        this.publish('listening', 'Listening… Tap Stop when you’re done. Nothing is shared automatically.');
      };
      recognition.onresult = event => this.result(session, event);
      recognition.onerror = event => {
        if (!this.valid(session)) return;
        this.finish(session, ERRORS[event.error] || 'Voice input could not finish. You can still edit or type your message.', true, true);
      };
      recognition.onend = () => {
        if (!this.valid(session)) return;
        this.finish(session, session.limit ? `The ${this.maxLength}-character limit is reached. Review the text before sharing.` : session.heard ? 'Voice text added. Review it, then Share.' : ERRORS['no-speech']);
      };
      recognition.start();
      if (this.valid(session)) session.recordingTimer = this.timers.setTimeout(() => { if (this.valid(session)) this.stop(); }, this.maxDurationMs);
      return true;
    } catch (error) {
      const code = error?.name === 'NotAllowedError' || error?.name === 'SecurityError' ? 'not-allowed' : 'audio-capture';
      this.finish(session, ERRORS[code], true, true);
      return false;
    }
  }
  result(session, event) {
    if (!this.valid(session) || !event?.results) return;
    const parts = []; let interim = false;
    // results is cumulative; provisional segments may change or disappear.
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i], transcript = result?.[0]?.transcript;
      if (typeof transcript !== 'string') continue;
      const text = transcript.trim();
      if (text) parts.push(text);
      if (!result.isFinal) interim = true;
    }
    const transcript = parts.join(session.language === 'zh-CN' ? '' : ' ');
    const room = this.maxLength - session.before.length - session.after.length;
    const inserted = clip(transcript, room);
    const value = session.before + inserted + session.after;
    session.heard ||= Boolean(inserted);
    this.onText(value, { caret:session.before.length + inserted.length, interim });
    if (transcript.length >= room && transcript.length > 0) {
      session.limit = true;
      if (this.state.phase !== 'stopping') this.stop();
    }
  }
  stop() {
    const session = this.current;
    if (!session || !this.valid(session)) return;
    // Cancelling a pending permission/start request must never begin listening later.
    if (!session.started || this.state.phase === 'stopping') { this.cancel('Voice input stopped. Review the text before sharing.'); return; }
    this.timers.clearTimeout(session.recordingTimer);
    this.publish('stopping', 'Finishing voice input…');
    try {
      session.recognition.stop();
      if (this.valid(session)) session.stopTimer = this.timers.setTimeout(() => {
        if (this.valid(session)) this.finish(session, 'Voice input stopped. Review the text before sharing.', false, true);
      }, this.stopTimeoutMs);
    } catch { this.finish(session, 'Voice input stopped. Review the text before sharing.', false, true); }
  }
  finish(session, message, error = false, abort = false) {
    if (!this.valid(session)) return;
    this.current = null; this.sequence++;
    this.timers.clearTimeout(session.recordingTimer); this.timers.clearTimeout(session.stopTimer);
    const recognition = session.recognition;
    if (recognition) {
      recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null;
      if (abort) { try { recognition.abort(); } catch { /* Already stopped. */ } }
    }
    this.publish('idle', message, error);
  }
  cancel(message = 'Voice input stopped. You can edit the text before sharing.') {
    if (this.current) this.finish(this.current, message, false, true);
  }
  destroy() { this.cancel(); this.destroyed = true; }
}

export function setupSpeechInput({ document:doc = document, window:win = window, onText = () => {} } = {}) {
  const input = doc.getElementById('question'), button = doc.getElementById('voice-button');
  if (!input || !button) return null;
  const label = doc.getElementById('voice-label'), language = doc.getElementById('voice-language'), status = doc.getElementById('voice-status'), form = doc.getElementById('composer');
  const Recognition = win.SpeechRecognition || win.webkitSpeechRecognition;
  const secure = win.isSecureContext !== false;
  const speech = new SpeechInput({
    recognitionFactory:typeof Recognition === 'function' && secure ? () => new Recognition() : null,
    unsupportedMessage:!secure ? 'Voice input needs HTTPS or a localhost page. You can still type your message.' : 'Voice input is unavailable in this browser. Try Chrome, or type your message.',
    maxLength:input.maxLength > 0 ? input.maxLength : 2000,
    onText:(value, meta) => { input.value = value; input.setSelectionRange(meta.caret, meta.caret); onText(); },
    onState:state => {
      button.disabled = !state.supported;
      button.dataset.state = state.phase; button.setAttribute('aria-pressed', String(state.active));
      button.setAttribute('aria-label', state.active ? 'Stop voice input' : 'Start voice input');
      button.title = state.supported ? 'Add speech to this draft. Review it before sharing.' : state.message;
      label.textContent = state.active ? state.phase === 'starting' ? 'Cancel' : 'Stop' : 'Speak';
      language.disabled = !state.supported;
      status.textContent = state.message; status.dataset.state = state.error ? 'error' : state.phase;
      form.classList.toggle('voice-active', state.active);
    }
  });
  const bindings = [];
  const bind = (target, type, listener) => { target.addEventListener(type, listener); bindings.push(() => target.removeEventListener(type, listener)); };
  bind(button, 'click', () => {
    if (speech.active) speech.stop();
    else speech.start({ text:input.value, selectionStart:input.selectionStart, selectionEnd:input.selectionEnd, language:language.value });
  });
  // Programmatic dictation writes above do not dispatch input, so manual edits
  // can cancel the microphone without cancelling its own transcript updates.
  bind(input, 'input', () => speech.cancel('Voice stopped so you can edit. Tap Speak to continue dictating.'));
  bind(language, 'change', () => speech.cancel('Language changed. Tap Speak to start again.'));
  bind(doc, 'visibilitychange', () => { if (doc.hidden) speech.cancel('Voice stopped while this page was in the background. Review the draft before sharing.'); });
  bind(doc, 'keydown', event => { if (event.key === 'Escape') speech.cancel(); });
  const destroy = speech.destroy.bind(speech);
  speech.destroy = () => { for (const cleanup of bindings) cleanup(); destroy(); };
  return speech;
}
