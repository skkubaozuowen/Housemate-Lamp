import { LightRenderer } from './lib/renderer.js';
import { SessionController } from './lib/controller.js';
import { setupResearch } from './lib/research.js';
import { createPlan } from './lib/catalog.js';
import { planLocal } from './lib/planner.js';
import { setupHardware } from './lib/hardware.js';
import { setupDinoVoice } from './lib/dino-voice.js';
const $ = id => document.getElementById(id);
const input = $('question');
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let hardware = null;
let lightDark = false;
let coverIdle = true, coverVoice = false;
function updateCover(frame) {
  // The original pastel cover is page decoration. The matrix and USB still
  // receive the exact white idle frame, including the complete return fade.
  const visible = coverIdle && !coverVoice && $('view').value !== 'grid'
    && frame?.length > 0 && frame.every(channel => channel === 255);
  document.body.classList.toggle('cover-idle', Boolean(visible));
}
function updateLightContrast(frame) {
  if (!frame?.length || frame.length % 3) return;
  let brightness = 0;
  for (let i = 0; i < frame.length; i += 3) brightness += frame[i] * .2126 + frame[i + 1] * .7152 + frame[i + 2] * .0722;
  brightness /= frame.length / 3;
  // Follow the visible crossfade, including a paused frame. Separate thresholds
  // keep a few twinkling pixels from repeatedly changing the text treatment.
  const dark = brightness < (lightDark ? 144 : 116);
  if (dark === lightDark) return;
  lightDark = dark;
  document.body.classList.toggle('light-dark', dark);
}
const renderer = new LightRenderer($('light'), { gridCanvas: $('grid'), onFrame:frame => {
  updateLightContrast(frame);
  updateCover(frame);
  hardware?.offer(frame);
} });
hardware = setupHardware(renderer);
renderer.setReducedMotion(motionQuery.matches);
motionQuery.addEventListener('change', e => renderer.setReducedMotion(e.matches));
let refreshResearch = () => {}, aiAvailable = false;
function update(state) {
  coverIdle = state.phase === 'idle' && state.plan.responseType === 'idle' && state.plan.motionPrimitive === 'hold';
  document.body.classList.toggle('cover-paused', state.paused);
  updateCover(renderer.frame);
  $('welcome').hidden = Boolean(state.lastText);
  $('moment').hidden = !state.lastText;
  $('moment').textContent = state.lastText;
  $('motion').textContent = state.paused ? 'Resume light' : 'Pause light';
  $('motion').setAttribute('aria-pressed', String(state.paused));
  const demo = state.mode === 'demo' || Boolean(state.fallback);
  $('mode-banner').hidden = !demo;
  $('mode-message').textContent = state.fallback?.reason === 'simulated' ? 'Failure preview · The local light is responding.' : state.fallback ? 'AI is unavailable. The local demo is responding.' : 'Local demo · Light follows the examples and familiar phrases.';
  $('retry').hidden = !state.fallback?.retryable;
  $('retry').textContent = state.mode === 'ai' ? 'Retry AI' : 'Try again';
  $('privacy').textContent = state.mode === 'ai' ? 'Text you share is sent to OpenAI. No saved conversation.' : 'Local light demo. No saved conversation.';
  const descriptions = { received:'Moment received.', processing:'Connecting this moment to light.', responding:'The light is responding.', error:'Connection interrupted. Retry is available; local demo will respond.', waiting:'There is room for another thought.', idle:'Light is ready.', preview:'Previewing a light study.' };
  $('live-status').textContent = descriptions[state.phase] || 'Light is ready.';
  refreshResearch(state);
  hardware?.emit();
}
async function requestPlan(body, signal) {
  const response = await fetch('/api/plan', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal:AbortSignal.any([signal, AbortSignal.timeout(30000)]) });
  if (!response.ok) throw new Error('Light planning is unavailable.');
  return response.json();
}
const controller = new SessionController({ renderer, requestPlan, onChange:update });
refreshResearch = setupResearch(controller, renderer, { aiAvailable, simulateFailure: () => {
  // Exercise the same error/retry path as a real failed AI request, with no outbound request.
  controller.cancel(); controller.lastText = 'A moment to try again.';
  controller.source = 'demo'; controller.phase = 'error';
  controller.fallback = {reason:'simulated',retryable:true};
  controller.afterError = planLocal('Stay with me for a while.', { preferences:controller.preferences, currentPlan:controller.plan }).plan;
  controller.display(createPlan('error', { paletteFamily:controller.plan.paletteFamily }));
} });
controller.emit();
function count() { $('counter').textContent = `${input.value.length} / 2000`; }
const speech = setupDinoVoice({
  onState:state => {
    coverVoice = ['starting','listening','finishing'].includes(state.phase);
    renderer.setVoiceInput({active:coverVoice, level:state.level});
    updateCover(renderer.frame);
  },
  onSubmit:text => controller.submit(text, {fromVoice:true})
});
$('composer').addEventListener('submit', event => {
  event.preventDefault();
  speech?.cancel();
  const text = input.value.trim();
  if (!text || text.length > 2000) return;
  void controller.submit(text);
  input.value = ''; count();
  input.focus({preventScroll:true});
});
input.addEventListener('input',count);
input.addEventListener('keydown',event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('composer').requestSubmit(); } });
for (const example of document.querySelectorAll('[data-example]')) example.addEventListener('click', () => { speech?.cancel(); input.value=example.dataset.example; count(); input.focus({preventScroll:true}); });
$('clear').addEventListener('click', () => { speech?.off(); controller.reset(); $('view').value='diffusion'; renderer.setGrid(false); $('workshop-note').value=''; input.value=''; count(); input.focus({preventScroll:true}); });
$('motion').addEventListener('click', () => controller.setPaused(!controller.paused));
$('retry').addEventListener('click', () => { speech?.cancel(); if (controller.lastText) void controller.submit(controller.lastText,{retry:true}); });
// Follow the visible phone viewport without interfering with accessibility zoom.
const phone = matchMedia('(max-width: 600px)');
function syncViewport() {
  const viewport = window.visualViewport;
  if (!phone.matches) { document.documentElement.style.removeProperty('--mobile-height'); document.body.classList.remove('keyboard-open'); return; }
  if (viewport && viewport.scale > 1.05) return;
  const height = viewport?.height || innerHeight;
  document.documentElement.style.setProperty('--mobile-height', `${height}px`);
  document.body.classList.toggle('keyboard-open', document.activeElement === input && (innerHeight-height > 100 || height < 500));
}
window.visualViewport?.addEventListener('resize',syncViewport); window.addEventListener('resize',syncViewport);
input.addEventListener('focus',syncViewport); input.addEventListener('blur',syncViewport); syncViewport();
window.addEventListener('pagehide', () => { speech?.destroy(); hardware?.destroy(); controller.cancel(); renderer.destroy(); },{once:true});

// Configuration never blocks the input or takes over an interaction already begun.
const initialSequence = controller.sequence;
void (async () => {
  try {
    const response = await fetch('/api/config', { signal:AbortSignal.timeout(5000) });
    const config = await response.json();
    aiAvailable = Boolean(config.aiAvailable);
    const option = $('understanding').querySelector('option[value=ai]');
    option.textContent = aiAvailable ? 'AI + local boundaries' : 'AI unavailable · demo fallback';
    if (controller.sequence === initialSequence) controller.setMode(aiAvailable ? 'ai' : 'demo');
  } catch { /* The labelled local demo remains fully usable. */ }
})();
