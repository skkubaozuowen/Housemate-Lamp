import { CATALOG, VISIBLE_RESPONSE_TYPES, EXPRESSIONS, MOTION_PRIMITIVES } from './catalog.js';
import { PALETTE_FAMILIES, PALETTE_VARIANTS, selectPalette, paletteSettings, isSemanticMixedPalette, colorGroup } from './palettes.js';
import { normalizePlan, normalizePreferences, createScenePlan, FEELING_TYPES, SCENE_TYPES } from './planner.js';
import { COMPOSITION_DEFAULTS, COMPOSITION_LIMITS, COMPOSITION_INTEGER_FIELDS, normalizeComposition } from './composition.js';
const $ = id => document.getElementById(id);
function option(value, label = value) { const el = document.createElement('option'); el.value = value; el.textContent = label; return el; }
function download(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function setupResearch(controller, renderer, { aiAvailable = false, simulateFailure } = {}) {
  const panel = $('research'), form = $('parameters');
  let selectedType = 'idle', draftPlan = controller.plan, draftTouched = false, renderedPlan, sceneCount = -1, lastMoment = controller.lastText;
  const notify = message => { $('panel-status').textContent = message; };
  const library = $('response-library');
  for (const type of VISIBLE_RESPONSE_TYPES) {
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
      draftPlan = createScenePlan(type, 'default', { seed: $('fixed-seed').checked ? seed : Math.floor(Math.random() * 4294967296) });
      writeControls(draftPlan);
      controller.preview(draftPlan);
    });
    library.append(button);
  }
  for (const [id, family] of Object.entries(PALETTE_FAMILIES)) $('palette-family').append(option(id, family.label));
  for (const variant of PALETTE_VARIANTS) $('palette-variant').append(option(variant, variant[0].toUpperCase() + variant.slice(1)));
  for (const primitive of MOTION_PRIMITIVES) $('primitive').append(option(primitive, primitive.replaceAll('_', ' ')));
  const compositionLabels = { fieldScale:'Light field size', spread:'Spatial spread', waveWidth:'Wave / ripple thickness', waveCount:'Wave count', rippleCount:'Opening ripple count', spotCount:'Red / blue glow count', accentScale:'Accent glow size', accentWeight:'Accent presence', stagger:'Time between appearances', supportDelay:'Warmth entry point', supportStrength:'Warmth presence', elongation:'Shape elongation' };
  const compositionFields = Object.keys(COMPOSITION_DEFAULTS);
  const compositionByScene = {
    celebrate:['fieldScale','spread','waveWidth','rippleCount','accentScale','accentWeight','stagger','elongation'],
    setback:['fieldScale','spread','waveWidth','waveCount','spotCount','accentScale','accentWeight','stagger','supportDelay','supportStrength','elongation'],
    rest:['fieldScale','spread','waveWidth','accentScale','accentWeight','supportDelay','supportStrength','elongation'],
    upcoming:['fieldScale','spread','accentScale','accentWeight','supportDelay','supportStrength','elongation'],
    mixed:['fieldScale','spread','waveWidth','accentScale','accentWeight','stagger','elongation'],
    everyday:['fieldScale','spread','waveWidth','rippleCount','stagger','elongation']
  };
  for (const key of compositionFields) {
    const label = document.createElement('label'); label.dataset.compositionField = key;
    label.append(document.createTextNode(compositionLabels[key]));
    const input = document.createElement('input'); input.id = `composition-${key}`;
    input.type = 'number'; input.min = COMPOSITION_LIMITS[key][0]; input.max = COMPOSITION_LIMITS[key][1];
    input.step = COMPOSITION_INTEGER_FIELDS.includes(key) ? 1 : .01;
    input.value = COMPOSITION_DEFAULTS[key]; label.append(input); $('composition-controls').append(label);
  }
  for (const key of ['primary','secondary','tertiary']) for (const feeling of FEELING_TYPES) $(`feeling-${key}`).append(option(feeling, feeling[0].toUpperCase()+feeling.slice(1)));
  function compositionVisibility() {
    const expression = $('expression').value, mode = $('mixed-mode').value;
    let visible = compositionByScene[selectedType] || [];
    if (selectedType === 'celebrate' && expression === 'quiet') visible = ['fieldScale','spread','elongation'];
    if (selectedType === 'setback') visible = visible.filter(key => expression === 'renew' ? !['spotCount','stagger'].includes(key) : !['supportDelay','supportStrength'].includes(key));
    if (selectedType === 'rest' && expression !== 'fulfilled') visible = visible.filter(key => !['accentScale','accentWeight','supportDelay','supportStrength'].includes(key));
    if (selectedType === 'mixed' && mode !== 'layered') visible = visible.filter(key => !['accentScale','accentWeight','stagger'].includes(key));
    for (const key of compositionFields) $(`composition-${key}`).parentElement.hidden = !visible.includes(key);
  }
  function mixedVisibility() {
    const open = $('mixed-mode').value === 'open';
    for (const label of $('mixed-controls').querySelectorAll('[data-mixed-specific]')) label.hidden = open;
    $('tertiary-control').hidden = open || $('mixed-mode').value !== 'layered';
    compositionVisibility();
  }
  $('mixed-mode').addEventListener('change', mixedVisibility);
  $('feeling-balance').addEventListener('input', () => { $('feeling-balance-output').value = Number($('feeling-balance').value).toFixed(2); });
  const fieldMap = { paletteFamily:'palette-family', paletteVariant:'palette-variant', expression:'expression', colorCount:'color-count', seed:'seed', motionPrimitive:'primitive', durationMs:'duration', speed:'speed', amplitude:'amplitude', energy:'energy', transitionMs:'transition' };
  function writeControls(plan) {
    const labels = { default:'Original expression', quiet:'Quiet recognition', renew:'Acknowledgment into support', fulfilled:'Tired but fulfilled', tense:'Feeling tense', anticipation:'Looking forward', neutral:'No feeling specified', bittersweet:'Coexisting feelings' };
    if (plan.responseType === 'setback') Object.assign(labels, { default:'Flowing waves · red & blue glows', renew:'Acknowledgment into support · violet into warm gold' });
    if (plan.responseType === 'upcoming') labels.default = 'A little courage · violet into a warm breath';
    const expressions = EXPRESSIONS.filter(value => createScenePlan(plan.responseType, value).expression === value);
    $('expression').replaceChildren(...expressions.map(value => option(value, labels[value])));
    for (const [key, id] of Object.entries(fieldMap)) $(id).value = ['durationMs', 'transitionMs'].includes(key) ? plan[key] / 1000 : key === 'expression' && plan.responseType === 'upcoming' ? 'default' : plan[key];
    const finiteSituation = SCENE_TYPES.includes(plan.responseType) && plan.nextState !== 'accompany';
    $('duration').min = finiteSituation ? 10 : .4;
    $('duration').max = finiteSituation ? 15 : 20;
    $('loop').checked = plan.loop;
    $('loop').disabled = finiteSituation;
    for (const key of ['energy','amplitude','speed']) $(`${key}-output`).value = Number(plan[key]).toFixed(2);
    const composition = normalizeComposition(plan.composition);
    for (const key of compositionFields) {
      $(`composition-${key}`).value = composition[key];
    }
    $('composition-details').hidden = !SCENE_TYPES.includes(plan.responseType);
    $('mixed-controls').hidden = plan.responseType !== 'mixed';
    $('mixed-mode').value = plan.mixedMode;
    $('feeling-primary').value = plan.feelingPrimary;
    $('feeling-secondary').value = plan.feelingSecondary === 'none' ? 'sadness' : plan.feelingSecondary;
    $('feeling-tertiary').value = plan.feelingTertiary === 'none' ? FEELING_TYPES.find(feeling => ![plan.feelingPrimary,plan.feelingSecondary].includes(feeling)) : plan.feelingTertiary;
    $('feeling-balance').value = plan.feelingBalance;
    $('feeling-balance-output').value = Number(plan.feelingBalance).toFixed(2);
    mixedVisibility();
    $('composition-note').textContent = plan.responseType === 'setback'
      ? 'Waves and colored glows can vary within this response. Warmth entry applies to the support expression.'
      : 'The response keeps its own movement language. Appearance spacing is separate from the transition between responses.';
  }
  function readControls() {
    const plan = structuredClone(draftPlan);
    plan.responseType = selectedType;
    for (const [key, id] of Object.entries(fieldMap)) {
      plan[key] = ['paletteFamily','paletteVariant','motionPrimitive','expression'].includes(key) ? $(id).value : Number($(id).value) * (['durationMs','transitionMs'].includes(key) ? 1000 : 1);
    }
    if (!$('fixed-seed').checked) plan.seed = Math.floor(Math.random() * 4294967296);
    plan.composition = normalizeComposition(Object.fromEntries(compositionFields.map(key => [key, Number($(`composition-${key}`).value)])));
    if (plan.responseType === 'mixed') {
      Object.assign(plan, { mixedMode:$('mixed-mode').value, feelingPrimary:$('feeling-primary').value,
        feelingSecondary:$('feeling-secondary').value, feelingTertiary:$('mixed-mode').value === 'layered' ? $('feeling-tertiary').value : 'none',
        feelingBalance:Number($('feeling-balance').value) });
    }
    plan.loop = $('loop').checked;
    return normalizePlan(plan);
  }
  form.addEventListener('input', () => { draftTouched = true; });
  $('expression').addEventListener('change', () => {
    draftTouched = true;
    draftPlan = createScenePlan(selectedType, $('expression').value, { seed:Number($('seed').value) || 0 });
    writeControls(draftPlan);
    notify('Expression defaults loaded. Preview to play, or adjust the light first.');
  });
  form.addEventListener('submit', e => { e.preventDefault(); draftTouched = true; draftPlan = readControls(); writeControls(draftPlan); controller.preview(draftPlan); notify('Previewing this study.'); });
  // Edits update their numeric readout; only an explicit preview starts a scene.
  for (const key of ['energy','amplitude','speed']) $(key).addEventListener('input', () => { $(`${key}-output`).value = Number($(key).value).toFixed(2); });
  $('use-current').addEventListener('click', () => { draftTouched = true; draftPlan = controller.plan; selectedType = draftPlan.responseType; writeControls(draftPlan); controller.emit(); notify('Current light copied into the study controls.'); });
  $('stop-preview').addEventListener('click', () => { controller.stopPreview(); notify('Light held.'); });
  $('restore-defaults').addEventListener('click', () => { controller.preferences = normalizePreferences({}); draftTouched = true; draftPlan = createScenePlan(selectedType, 'default', { seed: 1827 }); writeControls(draftPlan); controller.preview(draftPlan); notify('Default study restored; session preferences released.'); });
  $('save-palette').addEventListener('click', () => {
    const p = readControls();
    const tags = isSemanticMixedPalette(p) ? selectPalette(p, { ...controller.preferences, lockedPalette:null }).map(colorGroup) : PALETTE_FAMILIES[p.paletteFamily].tags;
    controller.preferences = normalizePreferences({ ...controller.preferences,
      avoidedColors:controller.preferences.avoidedColors.filter(color => !tags.includes(color)),
      rejectedPalettes:controller.preferences.rejectedPalettes.filter(family => family !== p.paletteFamily),
      lockedPalette: paletteSettings(p) });
    draftTouched = true; draftPlan = p; controller.preview(p, { replacePalette:false }); notify('Palette kept. A new color request can replace it.');
  });
  $('release-palette').addEventListener('click', () => { controller.preferences = normalizePreferences({}); controller.emit(); notify('Color and movement preferences released.'); });
  $('view').addEventListener('change', () => renderer.setGrid($('view').value === 'grid'));
  $('understanding').value = controller.mode;
  $('understanding').addEventListener('change', () => { controller.setMode($('understanding').value); notify(controller.mode === 'demo' ? 'Local rules only. Text stays in this browser.' : 'Open-ended moments use the server AI. Boundaries use local rules.'); });
  if (!aiAvailable) $('understanding').querySelector('option[value=ai]').textContent = 'AI unavailable · demo fallback';
  $('simulate-error').addEventListener('click', () => { panel.close(); simulateFailure(); });
  $('save-scene').addEventListener('click', () => { controller.saveScene(); notify('Scene saved in this tab.'); });
  $('copy-plan').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(controller.exportScene(), null, 2)); notify('Plan and rendered colors copied. No conversation text included.'); }
    catch { notify('Clipboard unavailable. Use Export plan instead.'); }
  });
  $('export-plan').addEventListener('click', () => download('housemate-light-plan.json', controller.exportScene()));
  $('export-feedback').addEventListener('click', () => download('housemate-workshop-notes.json', { version:1, notes:controller.feedback }));
  for (const button of document.querySelectorAll('[data-rating]')) button.addEventListener('click', () => {
    controller.recordFeedback(button.dataset.rating, $('workshop-note').value.trim()); $('workshop-note').value = ''; notify('Workshop note saved in this tab.');
  });
  $('open-research').addEventListener('click', () => { panel.showModal(); });
  $('close-research').addEventListener('click', () => { panel.close(); $('open-research').focus(); });
  if (new URLSearchParams(location.search).get('research') === '1') panel.showModal();
  return state => {
    $('phase').textContent = state.phase;
    if (state.lastText !== lastMoment) { notify(''); lastMoment = state.lastText; }
    $('source').textContent = state.source.replaceAll('_', ' ');
    $('paused-state').textContent = state.paused ? 'display paused' : '';
    $('understanding').value = state.mode;
    $('plan-json').textContent = JSON.stringify(state.plan, null, 2);
    if (renderedPlan !== state.plan) {
      if (!draftTouched) { selectedType = state.plan.responseType; draftPlan = state.plan; writeControls(draftPlan); }
      const colors = controller.rendering?.colors || selectPalette(state.plan, state.preferences);
      $('swatches').replaceChildren(...colors.map(rgb => { const swatch=document.createElement('span'); swatch.style.backgroundColor=`rgb(${rgb.join(',')})`; return swatch; }));
      renderedPlan = state.plan;
    }
    const draftInfo = CATALOG[selectedType];
    $('response-description').textContent = draftInfo.description;
    $('hypothesis').textContent = `Design hypothesis · ${draftInfo.hypothesis}`;
    for (const button of library.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.type === selectedType));
    const prefs = state.preferences;
    $('preference-info').textContent = [prefs.lockedPalette ? 'Palette kept.' : 'Palette can evolve.', prefs.avoidedColors?.length ? `Avoiding ${prefs.avoidedColors.join(', ')}.` : '', prefs.rejectedPalettes?.length ? `Skipping ${prefs.rejectedPalettes.length} declined palette${prefs.rejectedPalettes.length === 1 ? '' : 's'}.` : '', `Motion ×${prefs.speedScale.toFixed(2)}.`].filter(Boolean).join(' ');
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
