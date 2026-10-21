import { LightRenderer } from './lib/renderer.js';
import { SessionController } from './lib/controller.js';
import { setupResearch } from './lib/research.js';
import { createPlan } from './lib/catalog.js';
import { planLocal } from './lib/planner.js';
const $ = id => document.getElementById(id);
const input = $('question');
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const renderer = new LightRenderer($('light'), { gridCanvas: $('grid') });
renderer.setReducedMotion(motionQuery.matches);
motionQuery.addEventListener('change', e => renderer.setReducedMotion(e.matches));
let refreshResearch = () => {}, aiAvailable = false;
function update(state) {
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
  $('privacy').textContent = state.mode === 'ai' ? 'AI moments are sent to OpenAI. No saved conversation.' : 'Local demo. Your words stay in this browser.';
  const descriptions = { received:'Moment received.', processing:'Connecting this moment to light.', responding:'The light is responding.', error:'Connection interrupted. Retry is available; local demo will respond.', waiting:'There is room for another thought.', idle:'Light is ready.', preview:'Previewing a light study.' };
  $('live-status').textContent = descriptions[state.phase] || 'Light is ready.';
  refreshResearch(state);
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
$('composer').addEventListener('submit', event => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || text.length > 2000) return;
  void controller.submit(text);
  input.value = ''; count();
  input.focus({preventScroll:true});
});
input.addEventListener('input',count);
input.addEventListener('keydown',event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('composer').requestSubmit(); } });
for (const example of document.querySelectorAll('[data-example]')) example.addEventListener('click', () => { input.value=example.dataset.example; count(); input.focus({preventScroll:true}); });
$('clear').addEventListener('click', () => { controller.reset(); renderer.setGrid(false); $('view').value='diffusion'; $('workshop-note').value=''; input.value=''; count(); input.focus({preventScroll:true}); });
$('motion').addEventListener('click', () => controller.setPaused(!controller.paused));
$('retry').addEventListener('click', () => { if (controller.lastText) void controller.submit(controller.lastText,{retry:true}); });
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
window.addEventListener('pagehide', () => { controller.cancel(); renderer.destroy(); },{once:true});

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
