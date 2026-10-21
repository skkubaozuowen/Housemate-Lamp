import { CATALOG, RESPONSE_TYPES, MOTION_PRIMITIVES, createPlan } from './catalog.js';
import { PALETTE_FAMILIES, PALETTE_VARIANTS, selectPalette } from './palettes.js';
import { normalizePlan, normalizePreferences } from './planner.js';
const $ = id => document.getElementById(id);
function option(value, label = value) { const el = document.createElement('option'); el.value = value; el.textContent = label; return el; }
function download(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function setupResearch(controller, renderer, { aiAvailable = false, simulateFailure } = {}) {
  const panel = $('research'), form = $('parameters');
  let selectedType = 'idle', draftPlan = controller.plan, draftTouched = false, renderedPlan, sceneCount = -1;
  const notify = message => { $('panel-status').textContent = message; };
  const library = $('response-library');
  for (const type of RESPONSE_TYPES) {
    const entry = CATALOG[type];
    const button = document.createElement('button'); button.type = 'button'; button.className = 'response-choice'; button.dataset.type = type;
    button.setAttribute('aria-pressed', 'false');
    const id = document.createElement('small'); id.textContent = entry.id;
    const label = document.createElement('span'); label.textContent = entry.label;
    button.append(id, label);
    button.addEventListener('click', () => {
      selectedType = type;
      const seed = Number($('seed').value) || 0;
      draftTouched = true;
      draftPlan = createPlan(type, { seed: $('fixed-seed').checked ? seed : Math.floor(Math.random() * 4294967296) });
      writeControls(draftPlan);
      controller.preview(draftPlan);
    });
    library.append(button);
  }
  for (const [id, family] of Object.entries(PALETTE_FAMILIES)) $('palette-family').append(option(id, family.label));
  for (const variant of PALETTE_VARIANTS) $('palette-variant').append(option(variant, variant[0].toUpperCase() + variant.slice(1)));
  for (const primitive of MOTION_PRIMITIVES) $('primitive').append(option(primitive, primitive.replaceAll('_', ' ')));
  const fieldMap = { paletteFamily:'palette-family', paletteVariant:'palette-variant', colorCount:'color-count', seed:'seed', motionPrimitive:'primitive', durationMs:'duration', speed:'speed', amplitude:'amplitude', energy:'energy', transitionMs:'transition' };
  function writeControls(plan) {
    for (const [key, id] of Object.entries(fieldMap)) $(id).value = ['durationMs', 'transitionMs'].includes(key) ? plan[key] / 1000 : plan[key];
    $('loop').checked = plan.loop;
    for (const key of ['energy','amplitude','speed']) $(`${key}-output`).value = Number(plan[key]).toFixed(2);
  }
  function readControls() {
    const plan = { ...draftPlan };
    plan.responseType = selectedType;
    for (const [key, id] of Object.entries(fieldMap)) {
      plan[key] = ['paletteFamily','paletteVariant','motionPrimitive'].includes(key) ? $(id).value : Number($(id).value) * (['durationMs','transitionMs'].includes(key) ? 1000 : 1);
    }
    if (!$('fixed-seed').checked) plan.seed = Math.floor(Math.random() * 4294967296);
    plan.loop = $('loop').checked;
    return normalizePlan(plan);
  }
  form.addEventListener('input', () => { draftTouched = true; });
  form.addEventListener('submit', e => { e.preventDefault(); draftTouched = true; draftPlan = readControls(); controller.preview(draftPlan); notify('Previewing this study.'); });
  // Edits update their numeric readout; only an explicit preview starts a scene.
  for (const key of ['energy','amplitude','speed']) $(key).addEventListener('input', () => { $(`${key}-output`).value = Number($(key).value).toFixed(2); });
  $('use-current').addEventListener('click', () => { draftTouched = true; draftPlan = controller.plan; selectedType = draftPlan.responseType; writeControls(draftPlan); controller.emit(); notify('Current light copied into the study controls.'); });
  $('stop-preview').addEventListener('click', () => { controller.stopPreview(); notify('Light held.'); });
  $('restore-defaults').addEventListener('click', () => { controller.preferences = normalizePreferences({}); draftTouched = true; draftPlan = createPlan(selectedType, { seed: 1827 }); writeControls(draftPlan); controller.preview(draftPlan); notify('Default study restored; session preferences released.'); });
  $('save-palette').addEventListener('click', () => {
    const p = readControls();
    controller.preferences = normalizePreferences({ ...controller.preferences, lockedPalette: { paletteFamily:p.paletteFamily, paletteVariant:p.paletteVariant, colorCount:p.colorCount } });
    draftTouched = true; draftPlan = p; controller.preview(p); notify('Palette kept for this session. Explicit dislikes still take priority.');
  });
  $('release-palette').addEventListener('click', () => { controller.preferences = normalizePreferences({}); controller.emit(); notify('Color and movement preferences released.'); });
  $('view').addEventListener('change', () => renderer.setGrid($('view').value === 'grid'));
  $('understanding').value = controller.mode;
  $('understanding').addEventListener('change', () => { controller.setMode($('understanding').value); notify(controller.mode === 'demo' ? 'Local rules only. Text stays in this browser.' : 'Open-ended moments use the server AI. Boundaries use local rules.'); });
  if (!aiAvailable) $('understanding').querySelector('option[value=ai]').textContent = 'AI unavailable · demo fallback';
  $('simulate-error').addEventListener('click', () => { panel.close(); simulateFailure(); });
  $('save-scene').addEventListener('click', () => { controller.saveScene(); notify('Scene saved in this tab.'); });
  $('copy-plan').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(controller.plan, null, 2)); notify('Plan copied. No conversation text included.'); }
    catch { notify('Clipboard unavailable. Use Export plan instead.'); }
  });
  $('export-plan').addEventListener('click', () => download('housemate-light-plan.json', controller.plan));
  $('export-feedback').addEventListener('click', () => download('housemate-workshop-notes.json', { version:1, notes:controller.feedback }));
  for (const button of document.querySelectorAll('[data-rating]')) button.addEventListener('click', () => {
    controller.recordFeedback(button.dataset.rating, $('workshop-note').value.trim()); $('workshop-note').value = ''; notify('Workshop note saved in this tab.');
  });
  $('open-research').addEventListener('click', () => { panel.showModal(); });
  $('close-research').addEventListener('click', () => { panel.close(); $('open-research').focus(); });
  if (new URLSearchParams(location.search).get('research') === '1') panel.showModal();
  return state => {
    $('phase').textContent = state.phase;
    $('source').textContent = state.source.replaceAll('_', ' ');
    $('paused-state').textContent = state.paused ? 'display paused' : '';
    $('understanding').value = state.mode;
    $('plan-json').textContent = JSON.stringify(state.plan, null, 2);
    if (renderedPlan !== state.plan) {
      if (!draftTouched) { selectedType = state.plan.responseType; draftPlan = state.plan; writeControls(draftPlan); }
      const colors = selectPalette(state.plan, state.preferences);
      $('swatches').replaceChildren(...colors.map(rgb => { const swatch=document.createElement('span'); swatch.style.backgroundColor=`rgb(${rgb.join(',')})`; return swatch; }));
      renderedPlan = state.plan;
    }
    const draftInfo = CATALOG[selectedType];
    $('response-description').textContent = draftInfo.description;
    $('hypothesis').textContent = `Design hypothesis · ${draftInfo.hypothesis}`;
    for (const button of library.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.type === selectedType));
    const prefs = state.preferences;
    $('preference-info').textContent = [prefs.lockedPalette ? 'Palette kept.' : 'Palette can evolve.', prefs.avoidedColors?.length ? `Avoiding ${prefs.avoidedColors.join(', ')}.` : '', `Motion ×${prefs.speedScale.toFixed(2)}.`].filter(Boolean).join(' ');
    $('feedback-count').textContent = state.feedback.length ? `${state.feedback.length} note${state.feedback.length === 1 ? '' : 's'} in this session.` : 'No notes yet.';
    if (state.savedScenes.length !== sceneCount) {
      sceneCount = state.savedScenes.length;
      $('saved-scenes').replaceChildren(...state.savedScenes.map((scene,i) => {
        const b=document.createElement('button'); b.type='button'; b.textContent=`${scene.name} · ${CATALOG[scene.plan.responseType].label}`;
        b.addEventListener('click', () => controller.restoreScene(i)); return b;
      }));
    }
  };
}
