const FLOOR_RMS = 0.008;
const FULL_RMS = 0.12;
const VOICED_RMS = 0.012;
const SAMPLE_INTERVAL_MS = 1000 / 30;
const clamp = value => Math.max(0, Math.min(1, value));

/** Measure amplitude, excluding DC offset. Invalid samples cannot create activity. */
export function calculateLevel(samples) {
  if (!samples?.length) return { rms:0, level:0, voiced:false };
  let mean = 0;
  for (const value of samples) {
    if (!Number.isFinite(value)) return { rms:0, level:0, voiced:false };
    mean += Math.max(-1, Math.min(1, value));
  }
  mean /= samples.length;
  let squares = 0;
  for (const value of samples) {
    const centered = Math.max(-1, Math.min(1, value)) - mean;
    squares += centered * centered;
  }
  const measured = Math.sqrt(squares / samples.length);
  const rms = measured < 1e-7 ? 0 : measured;
  return { rms, level:clamp((rms - FLOOR_RMS) / (FULL_RMS - FLOOR_RMS)), voiced:rms >= VOICED_RMS };
}

class MicrophoneError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const audioError = (code, message) => new MicrophoneError(code, message);

function startupError(error) {
  if (error instanceof MicrophoneError) return error;
  if (['NotAllowedError', 'SecurityError'].includes(error?.name)) return audioError('permission', 'Microphone access was denied. Allow the microphone, then turn listening on again.');
  if (error?.name === 'NotFoundError') return audioError('missing', 'No microphone was found. Connect a microphone and try again.');
  if (error?.name === 'NotReadableError') return audioError('unavailable', 'The microphone is unavailable. Close other apps using it and try again.');
  return audioError('startup', 'Microphone audio could not start. Turn listening on again.');
}

function stopTracks(stream) {
  for (const track of stream?.getTracks?.() || []) {
    try { track.stop(); } catch { /* Release every available track. */ }
  }
}

/** A transient, local amplitude meter. No audio destination or recording exists. */
export class MicrophoneMeter {
  constructor({
    mediaDevices = globalThis.navigator?.mediaDevices,
    AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext,
    onLevel = () => {}, onError = () => {},
    raf = globalThis.requestAnimationFrame?.bind(globalThis),
    cancelRaf = globalThis.cancelAnimationFrame?.bind(globalThis),
    now = () => globalThis.performance?.now?.() ?? Date.now(),
    document: documentRef = globalThis.document
  } = {}) {
    this._mediaDevices = mediaDevices;
    this._AudioContextClass = AudioContextClass;
    this._raf = raf;
    this._cancelRaf = cancelRaf;
    this._now = now;
    this._document = documentRef;
    this.onLevel = onLevel;
    this.onError = onError;
    this.active = false;
    this._generation = 0;
    this._startPromise = null;
    this._resources = null;
    this._rafId = null;
    this._lastSampleAt = null;
    this._smoothed = 0;
  }

  static get supported() {
    return typeof globalThis.navigator?.mediaDevices?.getUserMedia === 'function'
      && typeof (globalThis.AudioContext || globalThis.webkitAudioContext) === 'function'
      && typeof globalThis.requestAnimationFrame === 'function'
      && typeof globalThis.cancelAnimationFrame === 'function';
  }

  get supported() {
    return typeof this._mediaDevices?.getUserMedia === 'function'
      && typeof this._AudioContextClass === 'function'
      && typeof this._raf === 'function' && typeof this._cancelRaf === 'function';
  }

  start() {
    if (this.active) return Promise.resolve(true);
    if (this._startPromise) return this._startPromise;
    const generation = ++this._generation;
    const operation = this._start(generation);
    this._startPromise = operation;
    void operation.then(() => {
      if (this._startPromise === operation) this._startPromise = null;
    });
    return operation;
  }

  async _start(generation) {
    let resources;
    try {
      if (!this.supported) throw audioError('unsupported', 'This browser cannot measure microphone audio. Use a browser with microphone and Web Audio support.');
      const stream = await this._mediaDevices.getUserMedia({
        audio:{ echoCancellation:true, noiseSuppression:true, autoGainControl:true }, video:false
      });
      if (generation !== this._generation) { stopTracks(stream); return false; }
      resources = { stream, context:null, source:null, analyser:null, buffer:null, cleanup:[], disposed:false };
      this._resources = resources;
      resources.context = new this._AudioContextClass();
      await resources.context.resume();
      if (generation !== this._generation) { this._dispose(resources); return false; }
      if (resources.context.state !== 'running') throw audioError('suspended', 'Microphone audio is paused. Turn listening on again.');
      const tracks = stream.getAudioTracks?.() || stream.getTracks?.() || [];
      if (!tracks.length || tracks.some(track => track.readyState === 'ended')) throw audioError('ended', 'The microphone disconnected. Turn listening on again.');
      resources.source = resources.context.createMediaStreamSource(stream);
      resources.analyser = resources.context.createAnalyser();
      resources.analyser.fftSize = 1024;
      resources.analyser.smoothingTimeConstant = 0;
      resources.buffer = new Float32Array(resources.analyser.fftSize);
      resources.source.connect(resources.analyser);
      // Analyser output deliberately has no connection to context.destination.
      const ended = () => this._fail(audioError('ended', 'The microphone disconnected. Turn listening on again.'), generation);
      for (const track of tracks) {
        track.addEventListener?.('ended', ended);
        resources.cleanup.push(() => track.removeEventListener?.('ended', ended));
      }
      const stateChanged = () => {
        if (this.active && resources.context.state !== 'running') this._fail(audioError('suspended', 'Microphone audio is paused. Turn listening on again.'), generation);
      };
      resources.context.addEventListener?.('statechange', stateChanged);
      resources.cleanup.push(() => resources.context.removeEventListener?.('statechange', stateChanged));
      const visibilityChanged = () => {
        if (this._document?.hidden) this._fail(audioError('hidden', 'Listening paused while the page is hidden. Turn it on again.'), generation);
      };
      this._document?.addEventListener?.('visibilitychange', visibilityChanged);
      resources.cleanup.push(() => this._document?.removeEventListener?.('visibilitychange', visibilityChanged));
      if (this._document?.hidden) throw audioError('hidden', 'Listening paused while the page is hidden. Turn it on again.');
      this.active = true;
      this._lastSampleAt = null;
      this._smoothed = 0;
      this._schedule(generation);
      return true;
    } catch (error) {
      if (generation !== this._generation) { this._dispose(resources); return false; }
      this._fail(startupError(error), generation);
      return false;
    }
  }

  _schedule(generation) {
    if (!this.active || generation !== this._generation || this._rafId !== null) return;
    this._rafId = this._raf(() => this._sample(generation));
  }

  _sample(generation) {
    if (!this.active || generation !== this._generation) return;
    this._rafId = null;
    const resources = this._resources;
    if (resources.context.state !== 'running') {
      this._fail(audioError('suspended', 'Microphone audio is paused. Turn listening on again.'), generation);
      return;
    }
    const measuredAt = this._now();
    const at = Number.isFinite(measuredAt) ? measuredAt : Date.now();
    const elapsed = this._lastSampleAt === null ? SAMPLE_INTERVAL_MS : at - this._lastSampleAt;
    if (elapsed >= SAMPLE_INTERVAL_MS) {
      try {
        resources.analyser.getFloatTimeDomainData(resources.buffer);
        const sample = calculateLevel(resources.buffer);
        const smoothingMs = sample.level > this._smoothed ? 70 : 150;
        const blend = 1 - Math.exp(-Math.min(elapsed, 250) / smoothingMs);
        this._smoothed += (sample.level - this._smoothed) * blend;
        this._lastSampleAt = at;
        this.onLevel({ rms:sample.rms, level:clamp(this._smoothed), voiced:sample.voiced, at });
      } catch {
        this._fail(audioError('sampling', 'Microphone audio could not be measured. Turn listening on again.'), generation);
        return;
      }
    }
    this._schedule(generation);
  }

  _fail(error, generation) {
    if (generation !== this._generation) return;
    this.stop();
    try { this.onError(error); } catch { /* Cleanup must finish even if the UI closes. */ }
  }

  _dispose(resources) {
    if (!resources || resources.disposed) return;
    resources.disposed = true;
    for (const cleanup of resources.cleanup) {
      try { cleanup(); } catch { /* Continue releasing other resources. */ }
    }
    try { resources.source?.disconnect(); } catch { /* It may already be detached. */ }
    try { resources.analyser?.disconnect(); } catch { /* It has no output connection. */ }
    stopTracks(resources.stream);
    resources.buffer?.fill(0);
    resources.buffer = null;
    try { Promise.resolve(resources.context?.close()).catch(() => {}); } catch { /* A failed context may already be closed. */ }
  }

  stop() {
    ++this._generation;
    this.active = false;
    this._startPromise = null;
    if (this._rafId !== null) this._cancelRaf?.(this._rafId);
    this._rafId = null;
    this._lastSampleAt = null;
    this._smoothed = 0;
    const resources = this._resources;
    this._resources = null;
    this._dispose(resources);
  }
}
