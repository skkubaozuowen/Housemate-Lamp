import { createPlan, hasAmbientTail } from './catalog.js';
import { planLocal, normalizePlan, validatePlan, normalizePreferences, applyPreferences, SCENE_TYPES } from './planner.js';
import { PALETTE_FAMILIES, selectPalette, colorGroup, isPaletteAllowed, isSemanticMixedPalette, paletteSettings, resolvePaletteFamily } from './palettes.js';

/** Coordinates one request and one rendering timeline. No transcript is persisted. */
export class SessionController {
  constructor({ renderer, requestPlan, onChange = () => {}, mode = 'demo', seed = 1827 }) {
    this.renderer = renderer;
    this.requestPlan = requestPlan;
    this.onChange = onChange;
    this.initialSeed = seed;
    this.sequence = 0;
    this.mode = mode;
    this.history = [];
    this.preferences = normalizePreferences({});
    this.stableState = 'idle';
    this.stablePlan = createPlan('idle', { seed });
    this.plan = this.stablePlan;
    this.phase = 'idle';
    this.source = 'demo';
    this.lastText = '';
    this.fallback = null;
    this.paused = false;
    this.savedScenes = [];
    this.feedback = [];
    renderer.onComplete = plan => this.complete(plan);
    this.display(this.plan);
  }
  snapshot() {
    return { plan: this.plan, phase: this.phase, stableState: this.stableState,
      preferences: structuredClone(this.preferences), mode: this.mode, source: this.source,
      lastText: this.lastText, fallback: this.fallback, paused: this.paused,
      savedScenes: this.savedScenes, feedback: this.feedback, historyCount: this.history.length };
  }
  emit() { this.onChange(this.snapshot()); }
  display(plan, { preserveProgress = false } = {}) {
    this.plan = normalizePlan(plan);
    const basicLight = this.plan.responseType === 'idle';
    // The exported/current plan must describe the palette actually on screen,
    // including a session lock or a fallback after a declined color.
    const lock = this.preferences.lockedPalette;
    if (!basicLight && lock && (isPaletteAllowed(lock.paletteFamily, this.preferences)
      || isSemanticMixedPalette(lock) && !this.preferences.rejectedPalettes.includes(lock.paletteFamily))) Object.assign(this.plan, lock);
    this.plan.paletteFamily = basicLight ? 'neutral_gray' : resolvePaletteFamily(this.plan, this.preferences) || 'neutral_gray';
    if (basicLight) this.plan.colorCount = 1;
    // The ordinary lamp is white. Color preferences remain in the session for
    // the next expression without tinting the resting lamp between turns.
    const colors = basicLight ? [[255,255,255]] : selectPalette(this.plan, this.preferences);
    // Late celebration flecks are optional: a named/kept palette or a declined
    // hue must never acquire an extra color behind the user's choice.
    const allowStars = this.plan.responseType === 'celebrate' && this.plan.expression !== 'quiet'
      && this.plan.paletteFamily === 'apricot_rose' && this.plan.colorCount === 3
      && !lock && !this.preferences.rejectedPalettes.includes('dream_sparkles');
    // Filter individual star hues: declining blue can leave violet and mint,
    // rather than removing the whole finishing gesture or slipping blue back in.
    const stars = PALETTE_FAMILIES.dream_sparkles?.variants[this.plan.paletteVariant] || [];
    const accentColors = allowStars ? stars.slice(0, 3)
      .map(hex => hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16)))
      .filter(color => !this.preferences.avoidedColors.includes(colorGroup(color))) : [];
    this.rendering = { colors, accentColors,
      ...(this.preferences.avoidedColors.length ? { avoidedColors:[...this.preferences.avoidedColors] } : {}) };
    this.renderer.setPlan(this.plan, { ...this.rendering, preserveProgress });
    this.emit();
  }
  cancel() {
    this.sequence += 1;
    this.abort?.abort();
    this.abort = null;
    this.pending = null;
    this.requesting = false;
    this.afterError = null;
  }
  async submit(rawText, { retry = false, fromVoice = false } = {}) {
    const text = rawText.trim();
    if (!text || text.length > 2000) return false;
    this.cancel();
    const token = this.sequence;
    this.lastText = text;
    this.fallback = null;
    this.phase = 'received';
    const context = { preferences: this.preferences, currentPlan: this.plan,
      stableState: this.stableState, history: this.history.slice(-10) };
    const local = planLocal(text, context);
    this.preferences = normalizePreferences(local.preferences);
    if (!retry) this.history = [...this.history, { role: 'user', content: text }].slice(-10);
    // A receipt belongs to the same exchange: keep the listening/current
    // field's colors while it gathers and splits into the pending light.
    const bridgePalette = fromVoice ? { paletteFamily:'sea_glass', paletteVariant:'balanced', colorCount:3 }
      : this.plan.responseType === 'idle' ? {} : paletteSettings(this.plan);
    const receipt = createPlan('acknowledge', { ...bridgePalette, seed: local.plan.seed });
    // Boundaries and corrections should start changing light immediately.
    const immediate = local.priority && ['withdraw', 'repair'].includes(local.plan.responseType);
    if (immediate) {
      this.source = this.mode === 'demo' ? 'demo' : 'local_rule';
      this.respond(local.plan);
      return true;
    }
    this.display(receipt);
    if (this.mode === 'demo' || local.priority) {
      this.source = this.mode === 'demo' ? 'demo' : 'local_rule';
      this.pending = { plan: local.plan };
      this.emit();
      return true;
    }
    const abort = new AbortController();
    this.abort = abort;
    this.requesting = true;
    this.source = 'ai';
    try {
      const result = await this.requestPlan({ text, history: context.history, context, mode: 'ai' }, abort.signal);
      if (token !== this.sequence || abort.signal.aborted) return false;
      const invalid = !validatePlan(result.plan);
      this.preferences = normalizePreferences(result.preferences || this.preferences);
      const plan = invalid ? local.plan : normalizePlan(result.plan);
      this.source = invalid ? 'demo' : (result.source || result.mode || 'ai');
      this.pending = { plan, error: invalid || Boolean(result.retryable), reason: invalid ? 'invalid_output' : result.reason };
      if (result.mode === 'demo' || invalid) this.fallback = { reason: this.pending.reason || 'unavailable', retryable: true };
    } catch (error) {
      if (token !== this.sequence || abort.signal.aborted) return false;
      this.pending = { plan: local.plan, error: true, reason: 'unavailable' };
      this.source = 'demo';
      this.fallback = { reason: 'unavailable', retryable: true };
    } finally {
      if (token === this.sequence) {
        this.requesting = false;
        this.abort = null;
        if (this.phase === 'processing') this.resolvePending();
        this.emit();
      }
    }
    return true;
  }
  resolvePending() {
    if (!this.pending) return;
    const result = this.pending;
    this.pending = null;
    if (result.error) {
      this.afterError = result.plan;
      this.phase = 'error';
      this.display(createPlan('error', { paletteFamily: this.plan.paletteFamily, seed: this.plan.seed }));
    } else this.respond(result.plan);
  }
  respond(rawPlan) {
    const plan = normalizePlan(rawPlan);
    this.phase = 'responding';
    this.display(plan);
    // Preserve the pre-thanks boundary state; ephemeral thanks never re-opens it.
    if (plan.responseType !== 'receive_thanks') {
      this.stableState = plan.responseType === 'withdraw' ? 'withdraw' : plan.nextState;
      this.stablePlan = plan;
    }
  }
  complete(completedPlan) {
    if (completedPlan !== this.renderer.plan && completedPlan !== this.plan) return;
    if (this.phase === 'received') {
      if (this.pending) this.resolvePending();
      else if (this.requesting) {
        this.phase = 'processing';
        this.display(createPlan('processing', { ...paletteSettings(this.plan), seed: this.plan.seed }));
      }
      return;
    }
    if (this.phase === 'processing') return;
    if (this.phase === 'error' && this.afterError) {
      const next = this.afterError;
      this.afterError = null;
      this.respond(next);
      return;
    }
    const returnsToBasic = ['clarify','farewell',...SCENE_TYPES].includes(this.plan.responseType)
      && !(this.plan.responseType === 'rest' && this.plan.nextState === 'accompany');
    // An explicit manual color/movement correction may keep the adjusted lamp.
    // The finite B/S expressions still return to their ordinary white baseline.
    const next = returnsToBasic ? 'idle' : this.plan.responseType === 'receive_thanks' ? this.stableState
      : this.plan.responseType === 'repair' && this.plan.nextState === 'idle' ? 'hold' : this.plan.nextState;
    this.settle(next);
  }
  settle(next = 'hold') {
    const palette = { ...paletteSettings(this.plan), seed: this.plan.seed };
    this.stableState = next;
    this.phase = next === 'waiting' ? 'waiting' : 'idle';
    let stable;
    if (next === 'accompany') stable = createPlan('rest', { ...palette, loop:true, nextState:'accompany' });
    else if (next === 'idle') stable = createPlan('idle', {
      seed:this.plan.seed, transitionMs:SCENE_TYPES.includes(this.plan.responseType) ? 2000 : 450 });
    else stable = createPlan(next === 'withdraw' ? 'withdraw' : 'wait', {
      ...palette, motionPrimitive: 'hold', energy: 0, amplitude: 0, loop: true,
      nextState: next, requiresUserInput: next === 'waiting', transitionMs: 900 });
    // The opening gesture finishes once; these scenes retain a living ambient
    // tail instead of restarting the burst or freezing the final frame.
    if (next === 'hold' && hasAmbientTail(this.plan)) {
      this.stablePlan = this.plan;
      this.emit();
      return;
    }
    // Other finite responses retain their actual endpoint.
    if (next === 'hold' || next === 'withdraw' || next === 'waiting') {
      this.stablePlan = normalizePlan({ ...this.plan, motionPrimitive: 'hold', loop: true, energy: 0, amplitude: 0, nextState: next });
      this.emit();
    } else {
      this.stablePlan = next === 'idle' ? stable : applyPreferences(stable, this.preferences, this.plan);
      this.display(this.stablePlan);
    }
  }
  setPaused(value) {
    this.paused = value;
    this.renderer.setPaused(value);
    this.emit();
  }
  setMode(mode) {
    const stable = this.stablePlan || createPlan('idle');
    const preserveProgress = hasAmbientTail(this.plan) && hasAmbientTail(stable)
      && stable.responseType === this.plan.responseType && stable.seed === this.plan.seed;
    this.cancel();
    this.mode = mode === 'ai' ? 'ai' : 'demo';
    this.fallback = null;
    this.phase = 'idle';
    this.display(stable, { preserveProgress });
  }
  preview(plan, { replacePalette = true } = {}) {
    this.cancel();
    this.fallback = null;
    this.phase = 'preview';
    this.source = 'preview';
    const preview = normalizePlan(plan);
    if (replacePalette) {
      // A deliberate study preview is also a new color choice. Old session
      // locks must not silently make the controls preview a different palette.
      const tags = isSemanticMixedPalette(preview)
        ? selectPalette(preview, { ...this.preferences, lockedPalette:null }).map(colorGroup) : PALETTE_FAMILIES[preview.paletteFamily].tags;
      this.preferences = normalizePreferences({ ...this.preferences, lockedPalette:null,
        avoidedColors:this.preferences.avoidedColors.filter(color => !tags.includes(color)),
        rejectedPalettes:this.preferences.rejectedPalettes.filter(family => family !== preview.paletteFamily) });
    }
    this.display(preview);
  }
  stopPreview() {
    this.cancel();
    this.phase = 'idle';
    this.display(createPlan('wait', { ...this.plan, responseType: 'wait', motionPrimitive: 'hold', loop: true, energy: 0, amplitude: 0 }));
  }
  reset() {
    this.cancel();
    this.history = [];
    this.preferences = normalizePreferences({});
    this.paused = false;
    this.renderer.setPaused(false);
    this.lastText = '';
    this.fallback = null;
    this.stableState = 'idle';
    this.phase = 'idle';
    this.source = this.mode === 'ai' ? 'local_rule' : 'demo';
    this.savedScenes = [];
    this.feedback = [];
    this.stablePlan = createPlan('idle', { seed: this.initialSeed });
    this.display(this.stablePlan);
  }
  saveScene() {
    const scene = { name: `Study ${this.savedScenes.length + 1}`, plan: structuredClone(this.plan),
      preferences: structuredClone(this.preferences), rendering:structuredClone(this.rendering) };
    this.savedScenes.push(scene);
    this.emit();
  }
  exportScene() {
    // The optional late accent is captured along with the main palette, so an
    // exported study records the exact colors rather than just a family name.
    return { version:1, plan:structuredClone(this.plan), rendering:structuredClone(this.rendering) };
  }
  restoreScene(index) {
    const scene = this.savedScenes[index];
    if (!scene) return;
    this.preferences = normalizePreferences(scene.preferences);
    this.preview(scene.plan, { replacePalette:false });
  }
  recordFeedback(rating, note = '') {
    this.feedback.push({ rating, note: note.slice(0, 1000), plan: structuredClone(this.plan),
      designStatus: 'Prototype hypothesis — pending workshop validation' });
    this.emit();
  }
}
