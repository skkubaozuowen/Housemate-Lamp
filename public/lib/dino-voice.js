import { MicrophoneMeter } from './voice-audio.js';

const languages = ['zh-CN', 'ko-KR', 'en-US'];
const clamp = n => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
const clip = (text, limit) => {
  const value = String(text).slice(0, limit);
  return /[\uD800-\uDBFF]$/.test(value) ? value.slice(0, -1) : value;
};
const separators = /^[\s,，.。!！?？~～:：;；—-]+/u;
// A greeting at the beginning of an utterance, never a substring of a narrative.
export function extractWake(text) {
  const value = String(text || '').trim();
  const match = /^(?:hi|hey|hello|嗨|嘿|哈[喽囉啰罗]|你好|하이|헤이|안녕)[\s,，~～.!！-]*(?:dino|迪[诺諾]|戴[诺諾]|蒂[诺諾]|디노)(?=$|[\s,，.。!！?？~～:：;；—-]|[\u4e00-\u9fff\uac00-\ud7af])/iu.exec(value);
  return match ? { matched:true, text:value.slice(match[0].length).replace(separators, '') } : { matched:false, text:value };
}

/** One explicit, visible browser voice session. No audio is recorded or stored here. */
export class DinoVoice {
  constructor({ recognitionFactory = null, meter = null, onState = () => {}, onSubmit = async () => {},
    timers = globalThis, now = Date.now, silenceMs = 2000, finalizeMs = 1200, maxTurnMs = 60000, maxLength = 2000 } = {}) {
    Object.assign(this, { recognitionFactory, meter, onState, onSubmit, timers, now, silenceMs, finalizeMs, maxTurnMs, maxLength });
    this.generation = 0; this.turn = 0; this.recognition = null; this.retryCount = 0;
    this.jobs = new Set(); this.tickJob = null; this.finalJob = null; this.restartJob = null;
    this.destroyed = false; this.lastVoiceAt = null; this.turnStartedAt = null;
    this.state = { enabled:false, phase:'off', transcript:'', level:0, silenceRemaining:null,
      language:'zh-CN', message:'Auto-sends after 2 seconds of silence. Say “Hi Dino” to speak again while voice is on.' };
    this.emit();
  }
  get supported() { return typeof this.recognitionFactory === 'function' && Boolean(this.meter) && this.meter.supported !== false; }
  get enabled() { return this.state.enabled; }
  emit(patch = {}) { Object.assign(this.state, patch); this.onState({ ...this.state, supported:this.supported }); }
  later(callback, delay) {
    const id = this.timers.setTimeout(() => { this.jobs.delete(id); callback(); }, delay);
    this.jobs.add(id); return id;
  }
  clearJob(id) { if (id != null) { this.timers.clearTimeout(id); this.jobs.delete(id); } }
  clearJobs() { for (const id of this.jobs) this.timers.clearTimeout(id); this.jobs.clear(); this.tickJob = this.finalJob = this.restartJob = null; }
  detach() {
    const track = this.recognition; this.recognition = null;
    if (track) { try { track.native.abort(); } catch { /* Already ended. */ } }
  }
  async enable({ language = this.state.language } = {}) {
    if (this.destroyed) return false;
    if (this.enabled) { this.beginTurn(); return true; }
    if (!this.supported) { this.emit({ phase:'error', message:'Dino voice needs microphone access and speech recognition. Try Chrome, or keep typing below.' }); return false; }
    const generation = ++this.generation;
    this.clearJobs(); this.retryCount = 0;
    this.emit({ enabled:true, phase:'starting', transcript:'', level:0, silenceRemaining:null,
      language:languages.includes(language) ? language : 'zh-CN', message:'Allow the microphone to talk to Dino.' });
    try {
      const active = await this.meter.start();
      if (generation !== this.generation || !this.enabled || this.destroyed) return false;
      if (!active) { this.audioFailure('Microphone audio could not start. Check permission, then try again.'); return false; }
      this.beginTurn(); return this.enabled;
    } catch { if (generation === this.generation) this.audioFailure('Microphone audio could not start. Check permission, then try again.'); return false; }
  }
  beginTurn() {
    if (!this.enabled || this.state.phase === 'starting' && !this.meter.active || this.state.phase === 'sending') return false;
    this.clearJobs(); this.detach(); this.turn++; this.retryCount = 0;
    this.lastVoiceAt = null; this.turnStartedAt = this.now();
    this.emit({ phase:'listening', transcript:'', silenceRemaining:null, message:'Speak naturally. I’ll send after 2 seconds of quiet.' });
    this.startRecognition(''); this.scheduleTick(); return true;
  }
  scheduleTick() {
    if (!this.enabled || this.state.phase !== 'listening') return;
    this.tickJob = this.later(() => {
      if (!this.enabled || this.state.phase !== 'listening') return;
      const remaining = this.lastVoiceAt == null ? null : Math.max(0, this.silenceMs - (this.now() - this.lastVoiceAt));
      this.emit({ silenceRemaining:this.state.transcript.trim() ? remaining : null });
      if (this.state.transcript.trim() && remaining === 0) this.stopTurn({send:true});
      else if (this.now() - this.turnStartedAt >= this.maxTurnMs) this.stopTurn({send:Boolean(this.state.transcript.trim())});
      else this.scheduleTick();
    }, 100);
  }
  handleLevel({ level = 0, voiced = false } = {}) {
    if (!this.enabled) return;
    // Meter timestamps may use performance.now(); use this clock consistently.
    if (this.state.phase === 'listening' && voiced) this.lastVoiceAt = this.now();
    this.emit({ level:clamp(level) });
  }
  join(parts, language = this.state.language) { return parts.filter(Boolean).join(language === 'zh-CN' ? '' : ' ').trim(); }
  startRecognition(base = '') {
    if (!this.enabled || !['listening','standby'].includes(this.state.phase) || this.recognition) return;
    const generation = this.generation;
    let native;
    try { native = this.recognitionFactory(); } catch { this.audioFailure('Speech recognition could not start. Try voice again, or type below.'); return; }
    const recognitionLanguage = this.state.phase === 'standby' ? 'en-US' : this.state.language;
    const track = { native, generation, base, skip:0, stripWake:false, startedAt:this.now(), interims:[], language:recognitionLanguage };
    this.recognition = track;
    const current = () => this.recognition === track && this.generation === generation && this.enabled;
    // An English wake recognizer avoids zh-CN hearing “Hi Dino” as “海底捞”.
    // The user's chosen language is restored for the actual conversation turn.
    native.lang = recognitionLanguage; native.continuous = true; native.interimResults = true; native.maxAlternatives = 1;
    native.onstart = () => { if (current()) this.emit(); };
    native.onspeechstart = () => { if (current() && this.state.phase === 'listening') this.lastVoiceAt = this.now(); };
    native.onresult = event => {
      if (!current()) return;
      this.retryCount = 0;
      const segments = Array.from(event.results || [], result => String(result?.[0]?.transcript || '').trim());
      if (this.state.phase === 'standby') {
        // resultIndex separates a new utterance from older, unrelated final results.
        const changed = Math.max(0, event.resultIndex || 0);
        const previousGreeting = /^(?:hi|hey|hello|嗨|嘿|哈[喽囉啰罗]|你好|하이|헤이|안녕)[\s,，~～.!！-]*$/iu.test(segments[changed - 1] || '');
        for (let index = previousGreeting ? changed - 1 : changed; index < segments.length; index++) {
          const wake = extractWake(this.join(segments.slice(index), track.language));
          if (!wake.matched) continue;
          this.clearJobs(); this.turn++; this.turnStartedAt = this.now(); this.lastVoiceAt = null;
          track.base = ''; track.skip = index; track.stripWake = true;
          this.emit({ phase:'listening', transcript:'', silenceRemaining:null, message:'I’m here. What’s on your mind?' });
          this.scheduleTick();
          if (track.language !== this.state.language) {
            const remainder = clip(wake.text, this.maxLength), turn = this.turn;
            this.detach();
            if (remainder) this.lastVoiceAt = this.now();
            this.emit({transcript:remainder});
            this.restartJob = this.later(() => {
              if (this.generation === generation && this.turn === turn && this.state.phase === 'listening') this.startRecognition(remainder);
            }, 150);
            return;
          }
          break;
        }
        if (this.state.phase === 'standby') return;
      }
      if (!['listening','finishing'].includes(this.state.phase)) return;
      let heard = this.join(segments.slice(track.skip));
      // Revisions of the wake utterance reuse its anchor; the greeting is never submitted.
      if (track.stripWake) { const wake = extractWake(heard); heard = wake.matched ? wake.text : ''; }
      const text = clip(this.join([track.base, heard]), this.maxLength);
      const changingInterim = Array.from(event.results || []).some((result, index) => index >= track.skip && !result.isFinal && segments[index] !== track.interims[index]);
      track.interims = Array.from(event.results || [], (result, index) => result.isFinal ? null : segments[index]);
      // Recognition is also an activity fallback for quiet speech below the RMS gate.
      // A late finalized correction alone must not extend the silence deadline.
      if (text && (this.lastVoiceAt == null || changingInterim && text !== this.state.transcript)) this.lastVoiceAt = this.now();
      this.emit({ transcript:text });
      if (text.length >= this.maxLength && this.state.phase === 'listening') this.stopTurn({send:true});
    };
    native.onerror = event => {
      if (!current()) return;
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      const messages = {
        'not-allowed':'Microphone or speech access was denied. Allow it in Chrome, then turn voice on again.',
        'service-not-allowed':'The browser’s speech service is unavailable. Try Chrome, or type below.',
        'audio-capture':'The microphone is unavailable. Check its connection, then turn voice on again.',
        network:'Speech recognition lost its connection. Check your internet, then turn voice on again.',
        'language-not-supported':'This voice language is unavailable. Choose another language, then try again.'
      };
      this.audioFailure(messages[event.error] || 'Speech recognition stopped. Turn voice on again, or type below.');
    };
    native.onend = () => {
      if (!current()) return;
      this.recognition = null;
      if (this.state.phase === 'finishing') { this.commit(); return; }
      if (!['listening','standby'].includes(this.state.phase)) return;
      // A normal service timeout is healthy standby, not a failed startup. Only
      // repeated immediate disconnects exhaust retries and require a new click.
      this.retryCount = this.now() - track.startedAt >= 2000 ? 1 : this.retryCount + 1;
      if (this.retryCount > 8) { this.audioFailure('The browser keeps ending speech recognition. Turn voice on again, or type below.'); return; }
      const pendingText = this.state.phase === 'listening' ? this.state.transcript : '';
      this.restartJob = this.later(() => {
        if (this.generation === generation) this.startRecognition(pendingText);
      }, Math.min(2000, 250 * 2 ** (this.retryCount - 1)));
    };
    try { native.start(); } catch { if (current()) this.audioFailure('Speech recognition could not start. Turn voice on again, or type below.'); }
  }
  stopTurn({ send = false } = {}) {
    if (!this.enabled || this.state.phase === 'sending') return;
    if (this.state.phase === 'starting') { this.off(); return; }
    this.clearJobs();
    if (!send) {
      this.turn++; this.detach(); this.lastVoiceAt = null;
      this.emit({ phase:'standby', transcript:'', level:0, silenceRemaining:null, message:'Voice is on. Say “Hi Dino” to talk again.' });
      this.startRecognition(); return;
    }
    if (this.state.phase === 'finishing') { this.commit(); return; }
    this.emit({ phase:'finishing', silenceRemaining:0, message:'Finishing your words…' });
    this.finalJob = this.later(() => this.commit(), this.finalizeMs);
    if (!this.recognition) { this.commit(); return; }
    try { this.recognition.native.stop(); } catch { this.commit(); }
  }
  commit() {
    if (!this.enabled || this.state.phase !== 'finishing') return;
    this.clearJobs(); this.detach();
    const text = this.state.transcript.trim();
    if (!text) { this.stopTurn(); return; }
    const generation = this.generation, turn = this.turn;
    this.emit({ phase:'sending', level:0, message:'Turning your words into light…' });
    let result;
    try { result = this.onSubmit(text); } catch { result = Promise.reject(new Error('Submission failed')); }
    void Promise.resolve(result).then(() => {
      if (generation !== this.generation || turn !== this.turn || !this.enabled) return;
      this.emit({ phase:'standby', transcript:'', silenceRemaining:null, message:'Voice is on. Say “Hi Dino” to talk again.' });
      this.startRecognition();
    }, () => {
      if (generation === this.generation && turn === this.turn) this.audioFailure('Your words could not be shared. Please try again, or type below.');
    });
  }
  release(phase, message) {
    this.generation++; this.turn++; this.clearJobs(); this.detach(); this.meter?.stop();
    this.lastVoiceAt = null;
    this.emit({ enabled:false, phase, level:0, silenceRemaining:null, message });
  }
  off() { this.release('off', 'Voice is off. Your text input is ready.'); }
  pause(reason = 'Voice paused while this page is hidden. Tap Talk to Dino to resume.') { this.release('paused', reason); }
  audioFailure(message) { this.release('error', message || 'Microphone audio stopped. Turn voice on again, or type below.'); }
  cancel() { if (this.enabled && this.state.phase !== 'sending') this.stopTurn(); }
  destroy() { this.destroyed = true; this.off(); }
}

export function setupDinoVoice({ document:doc = globalThis.document, window:win = globalThis.window, onSubmit = async () => {}, onState = () => {} } = {}) {
  const $ = id => doc.getElementById(id);
  const button = $('voice-button'), stage = $('dino-stage');
  if (!button || !stage) return null;
  const Recognition = win.SpeechRecognition || win.webkitSpeechRecognition;
  const put = (id, text) => { const el = $(id); if (el && el.textContent !== text) el.textContent = text; };
  let voice;
  const meter = new MicrophoneMeter({ mediaDevices:win.navigator?.mediaDevices,
    AudioContextClass:win.AudioContext || win.webkitAudioContext, raf:win.requestAnimationFrame?.bind(win), cancelRaf:win.cancelAnimationFrame?.bind(win), document:doc,
    onLevel:sample => voice?.handleLevel(sample), onError:error => voice?.audioFailure(error.message) });
  const render = state => {
    const shown = ['starting','listening','finishing','sending'].includes(state.phase);
    stage.hidden = !shown; stage.dataset.phase = state.phase;
    doc.body.classList.toggle('dino-speaking', shown);
    put('dino-title', ({starting:'Hello, I’m Dino.',listening:'I’m listening.',finishing:'One moment.',sending:'A little light for you.'})[state.phase] || 'I’m here.');
    put('dino-transcript', state.transcript || (state.phase === 'starting' ? 'Waiting for microphone permission…' : 'Say what’s on your mind.'));
    put('dino-caption', state.message);
    put('dino-countdown', state.phase === 'listening' && state.transcript && state.silenceRemaining != null ? `Sending in ${Math.ceil(state.silenceRemaining / 1000)}s` : '');
    put('voice-status', state.message);
    put('voice-label', state.enabled ? (state.phase === 'standby' ? 'Talk now' : 'Voice on') : 'Talk to Dino');
    button.disabled = !state.supported || ['starting','finishing','sending'].includes(state.phase);
    button.setAttribute('aria-pressed', String(state.enabled));
    button.setAttribute('aria-label', state.enabled ? 'Talk to Dino now' : 'Start Dino voice');
    $('dino-controls').hidden = !state.enabled;
    put('dino-wake-status', state.phase === 'standby' ? 'Mic on · Say “Hi Dino”, then speak when the blue glow appears' : state.phase === 'sending' ? 'Voice on · Preparing light' : 'Mic on · Listening to you');
    $('dino-listen').disabled = state.phase !== 'standby';
    $('dino-send').disabled = state.phase !== 'listening' || !state.transcript.trim();
    $('dino-cancel').disabled = state.phase === 'sending';
    $('voice-language').disabled = state.enabled;
    if (!state.supported) put('voice-status', 'Dino voice is unavailable here. Try Chrome with microphone access, or keep typing.');
    // The shared 16×16 renderer owns the light; this adapter owns only controls.
    onState(state);
  };
  voice = new DinoVoice({ recognitionFactory:Recognition && win.isSecureContext ? () => new Recognition() : null, meter, onState:render, onSubmit });
  const bindings = [];
  const on = (element, event, action) => { element?.addEventListener(event, action); bindings.push(() => element?.removeEventListener(event, action)); };
  on(button, 'click', () => { if (voice.enabled) voice.beginTurn(); else void voice.enable({language:$('voice-language').value}); });
  on($('dino-listen'), 'click', () => voice.beginTurn());
  on($('dino-off'), 'click', () => voice.off());
  on($('dino-send'), 'click', () => voice.stopTurn({send:true}));
  on($('dino-cancel'), 'click', () => voice.stopTurn());
  on($('dino-type'), 'click', () => { voice.cancel(); $('question').focus({preventScroll:true}); });
  on($('question'), 'input', () => { if (['listening','finishing'].includes(voice.state.phase)) voice.cancel(); });
  on(doc, 'visibilitychange', () => { if (doc.hidden && voice.enabled) voice.pause(); });
  on(doc, 'keydown', event => { if (event.key === 'Escape' && voice.enabled) { voice.off(); } });
  const destroy = voice.destroy.bind(voice);
  voice.destroy = () => { for (const unbind of bindings) unbind(); destroy(); };
  return voice;
}
