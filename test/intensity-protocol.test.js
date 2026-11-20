import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlan, SCENE_RESPONSE_TYPES } from '../public/lib/catalog.js';
import { COMPOSITION_DEFAULTS } from '../public/lib/composition.js';
import { orchestrateIntensity } from '../public/lib/intensity.js';
import { PLAN_SCHEMA, applyPreferences, createScenePlan, normalizePlan, normalizePreferences, validatePlan } from '../public/lib/planner.js';
import { SessionController } from '../public/lib/controller.js';
import { colorGroup, selectPalette } from '../public/lib/palettes.js';
import { renderFrame } from '../public/lib/renderer.js';
import { extractPlan, requestPlan } from '../response-api.js';

const expressions = [
  ['S01-1', 'celebrate', 'default'],
  ['S01-2', 'celebrate', 'quiet'],
  ['S02-1', 'setback', 'default'],
  ['S02-2', 'setback', 'renew'],
  ['S03-1', 'rest', 'default'],
  ['S03-2', 'rest', 'fulfilled'],
  ['S04', 'upcoming', 'default'],
  ['S05-1', 'mixed', 'bittersweet', { mixedMode:'open' }],
  ['S05-2', 'mixed', 'bittersweet', { mixedMode:'paired', feelingPrimary:'joy', feelingSecondary:'sadness', feelingBalance:.75 }],
  ['S05-3', 'mixed', 'bittersweet', { mixedMode:'layered', feelingPrimary:'joy', feelingSecondary:'sadness', feelingTertiary:'anxiety', feelingBalance:.5 }],
  ['S06', 'everyday', 'default']
];
const degrees = [.2, .55, .9];
const semanticKeys = ['responseType', 'expression', 'mixedMode', 'feelingPrimary', 'feelingSecondary', 'feelingTertiary', 'feelingBalance', 'paletteFamily', 'motionPrimitive'];
const modelPlan = ([, type, expression, feelings = {}], intensity = .5) => createScenePlan(type, expression, {
  seed:4589, intensity, energy:.52, speed:type === 'celebrate' && expression === 'default' ? .6 : .4, amplitude:.7, durationMs:12000, transitionMs:1200,
  composition:{ ...COMPOSITION_DEFAULTS, waveCount:3, spotCount:4, stagger:1.1, supportDelay:.31, supportStrength:.8, elongation:1.1 },
  ...feelings
});
const completed = plan => ({ status:'completed', output:[{ content:[{ type:'output_text', text:JSON.stringify(plan) }] }] });
async function remote(suggested, preferences = {}, localPlan = suggested) {
  let request;
  const result = await requestPlan({
    key:'test-key', model:'test-model', text:'这是一轮研究中的表达', history:[], context:{ preferences },
    local:{ plan:localPlan, preferences:normalizePreferences(preferences), understood:true, priority:false },
    fetchImpl:async (_url, options) => {
      request = JSON.parse(options.body);
      return { ok:true, json:async () => completed(suggested) };
    }
  });
  assert.ok(result.plan, result.reason);
  return { ...result, request };
}
const semantic = plan => Object.fromEntries(semanticKeys.map(key => [key, plan[key]]));
const pixels = frame => Array.from({ length:256 }, (_, i) => frame.slice(i * 3, i * 3 + 3));

test('intensity has strict new-output validation while old saved plans retain their exact geometry', () => {
  assert.deepEqual(PLAN_SCHEMA.properties.intensity, { type:'number', minimum:0, maximum:1 });
  assert.ok(PLAN_SCHEMA.required.includes('intensity'));
  for (const fixture of expressions) {
    const current = modelPlan(fixture);
    assert.equal(current.intensity, .5);
    const old = { ...current };
    delete old.intensity;
    assert.equal(validatePlan(old), false, 'new AI output must include its degree');
    assert.equal(extractPlan(completed(old)), null);
    const imported = normalizePlan(old);
    assert.ok(validatePlan(imported));
    assert.equal(imported.intensity, .5);
    assert.deepEqual(imported.composition, current.composition, 'importing must not orchestrate an old composition again');
    assert.deepEqual(normalizePlan({}, old), imported, 'old fallback plans are readable too');
    for (const elapsed of [0, 3000, 11000]) assert.deepEqual(renderFrame(imported, elapsed), renderFrame(old, elapsed));
  }
  const scene = modelPlan(expressions[0]);
  for (const intensity of [-.01, 1.01, NaN, Infinity, '0.5', null]) {
    assert.equal(validatePlan({ ...scene, intensity }), false, String(intensity));
    assert.equal(extractPlan(completed({ ...scene, intensity })), null, String(intensity));
  }
  for (const intensity of [0, .5, 1]) assert.ok(validatePlan({ ...scene, intensity }));
});

test('degree mapping preserves semantic branches and leaves independent model choices available', () => {
  for (const fixture of expressions) for (const intensity of degrees) {
    const raw = modelPlan(fixture, intensity), before = structuredClone(raw);
    const mapped = orchestrateIntensity(raw);
    assert.deepEqual(raw, before, 'mapping never mutates the model or a saved plan');
    assert.deepEqual(semantic(mapped), semantic(raw), `${fixture[0]}: intensity cannot invent a different meaning`);
    for (const key of ['waveCount', 'spotCount', 'stagger', 'supportDelay', 'supportStrength', 'elongation']) {
      assert.equal(mapped.composition[key], raw.composition[key], `${fixture[0]} retains independent ${key}`);
    }
    assert.equal(mapped.amplitude, raw.amplitude, 'degree does not override a separate motion preference');
    if (fixture[1] !== 'rest') assert.equal(mapped.speed, raw.speed, 'degree does not force non-fatigue scenes to speed up');
    if (fixture[3]?.mixedMode === 'layered') assert.deepEqual(mapped.composition, raw.composition, 'three-strand degree changes thickness without rescaling its fixed weaving pattern');
  }
  const raw = modelPlan(expressions[2], .9);
  const alternate = { ...raw, composition:{ ...raw.composition, waveCount:1, spotCount:7, stagger:.7 } };
  assert.notDeepEqual(orchestrateIntensity(raw).composition, orchestrateIntensity(alternate).composition, 'equal degree still permits different same-family compositions');
  const resting = degrees.map(intensity => orchestrateIntensity(modelPlan(expressions[4], intensity)));
  assert.ok(resting[0].speed > resting[1].speed && resting[1].speed > resting[2].speed, 'stronger fatigue receives a slower resting gesture');
});

test('mocked AI low, middle and strong outputs reach all eleven expressions without semantic or lifecycle drift', async () => {
  for (const fixture of expressions) for (const intensity of degrees) {
    const suggested = modelPlan(fixture, intensity);
    const { plan, request } = await remote(suggested);
    const expected = normalizePlan(orchestrateIntensity(suggested));
    assert.ok(validatePlan(plan), fixture[0]);
    assert.deepEqual(semantic(plan), semantic(suggested), `${fixture[0]} keeps its selected expression and feeling strands`);
    for (const key of ['intensity', 'energy', 'speed', 'amplitude', 'composition']) assert.deepEqual(plan[key], expected[key], `${fixture[0]}:${intensity}:${key}`);
    assert.equal(plan.loop, false);
    assert.equal(plan.nextState, 'idle');
    assert.ok(plan.durationMs >= 10000 && plan.durationMs <= 15000);
    assert.equal(request.store, false);
    assert.equal(request.text.format.strict, true);
    assert.ok(request.text.format.schema.required.includes('intensity'));
  }
});

test('session speed, amplitude, locked palette and hue bans remain authoritative after degree mapping', async () => {
  const preferences = { speedScale:.5, amplitudeScale:.6, avoidedColors:['blue'], lockedPalette:{ paletteFamily:'named_pink', paletteVariant:'misted', colorCount:2 } };
  for (const fixture of expressions) for (const intensity of degrees) {
    const suggested = modelPlan(fixture, intensity);
    const unpreferred = (await remote(suggested)).plan;
    const preferred = (await remote(suggested, preferences)).plan;
    assert.deepEqual(preferred, applyPreferences(unpreferred, preferences), `${fixture[0]} applies preferences after the new mapping, once`);
    assert.equal(preferred.intensity, intensity);
    assert.equal(preferred.paletteFamily, 'named_pink');
    assert.equal(preferred.paletteVariant, 'misted');
    assert.equal(preferred.colorCount, 2);
    assert.equal(preferred.durationMs, 15000);
    const colors = selectPalette(preferred, preferences);
    for (const elapsed of [1500, 6000, 13000]) {
      const groups = pixels(renderFrame(preferred, elapsed, { colors, avoidedColors:preferences.avoidedColors })).map(colorGroup);
      assert.ok(groups.every(group => group === 'pink' || group === 'neutral'), `${fixture[0]}: degree cannot introduce a different named hue`);
    }
  }
});

test('mixed geometry follows the final supported mode when model and local evidence disagree', async () => {
  const open = modelPlan(expressions[7], .9), layered = modelPlan(expressions[9], .9);
  const { plan:keptOpen } = await remote(layered, {}, open);
  assert.equal(keptOpen.mixedMode, 'open');
  assert.equal(keptOpen.feelingTertiary, 'none');
  assert.deepEqual(keptOpen.composition, orchestrateIntensity({ ...layered, mixedMode:'open' }).composition, 'a mistaken three-strand proposal must not disable the final open field-size anchor');
  const { plan:keptLayered } = await remote(open, {}, layered);
  assert.equal(keptLayered.mixedMode, 'layered');
  assert.equal(keptLayered.feelingTertiary, layered.feelingTertiary);
  assert.deepEqual(keptLayered.composition, layered.composition, 'three genuinely supported strands keep the original fixed weaving period');
});

test('basic exchanges and manual states have degree zero and keep their engineered geometry', async () => {
  for (const type of ['idle', 'greet', 'acknowledge', 'processing', 'clarify', 'farewell', 'repair', 'withdraw']) {
    const raw = createPlan(type, { intensity:.9 });
    const mapped = orchestrateIntensity(raw);
    assert.equal(createPlan(type).intensity, 0);
    assert.equal(mapped.intensity, 0);
    assert.deepEqual(mapped.composition, raw.composition);
    assert.equal(normalizePlan(raw).intensity, 0);
    const old = { ...raw }; delete old.intensity;
    assert.equal(normalizePlan(old).intensity, 0);
  }
  for (const type of ['greet', 'clarify', 'farewell']) {
    const suggested = createPlan(type, { intensity:.9 });
    const { plan } = await remote(suggested);
    assert.equal(plan.intensity, 0);
    assert.equal(plan.durationMs, createPlan(type).durationMs);
    assert.deepEqual(plan.composition, COMPOSITION_DEFAULTS);
  }
});

class StudyRenderer {
  setPlan(plan, options) { this.plan = plan; this.options = options; }
  setPaused() {}
  frameAt(elapsed) { return renderFrame(this.plan, elapsed, this.options); }
}

test('study save, export, repeated normalization and restoration preserve the mapped degree and exact RGB', async () => {
  for (const fixture of expressions) {
    const plan = (await remote(modelPlan(fixture, .9))).plan;
    const renderer = new StudyRenderer(), controller = new SessionController({ renderer });
    controller.preview(plan);
    const displayed = structuredClone(controller.plan);
    const frames = [1500, 6000, 11000].map(elapsed => renderer.frameAt(elapsed));
    controller.saveScene();
    const exported = controller.exportScene();
    assert.deepEqual(exported.plan, displayed);
    assert.equal(exported.plan.intensity, .9);
    assert.deepEqual(normalizePlan(normalizePlan(displayed)), displayed, 'normalization never repeats the intensity anchor');
    controller.preview(createScenePlan('everyday'));
    controller.restoreScene(0);
    assert.deepEqual(controller.plan, displayed, `${fixture[0]}: restored geometry has no cumulative mapping`);
    for (const [i, elapsed] of [1500, 6000, 11000].entries()) assert.deepEqual(renderer.frameAt(elapsed), frames[i], `${fixture[0]}: restored RGB at ${elapsed}ms`);
    exported.plan.intensity = .2;
    exported.plan.composition.fieldScale = .75;
    assert.deepEqual(controller.plan, displayed, 'exported data is detached from the live and stored scene');
    renderer.onComplete(controller.plan);
    assert.equal(controller.plan.responseType, 'idle');
    assert.equal(controller.plan.intensity, 0);
    assert.ok(renderer.frameAt(12000).every(value => value === 255), 'finishing a stronger response still returns to uniform white');
  }
});

// This reproduces Adafruit gamma8 (the rounded exponent-2.6 table) followed by
// the installed firmware's conservative 3/255 brightness rounding. It changes
// no hardware setting. White pixels are [3,3,3], so count color/shape changes
// rather than merely counting powered pixels.
const physicalFrame = frame => frame.map(value => Math.floor((Math.round(255 * (value / 255) ** 2.6) * 3 + 127) / 255));
const changedPixels = (a, b) => pixels(a).filter((rgb, i) => rgb.some((value, c) => value !== b[i * 3 + c])).length;
const coloredArea = frame => pixels(frame).filter(rgb => Math.max(...rgb) !== Math.min(...rgb)).length;

test('all eleven AI expressions retain low, middle and strong spatial differences after real low-brightness quantization', async () => {
  assert.ok(SCENE_RESPONSE_TYPES.length === 6 && expressions.length === 11);
  for (const fixture of expressions) {
    const plans = await Promise.all(degrees.map(async degree => (await remote(modelPlan(fixture, degree))).plan));
    const changes = [0, 0, 0], areas = [0, 0, 0];
    let samples = 0;
    for (let elapsed = 125; elapsed <= 12000; elapsed += 125) {
      const frames = plans.map(plan => physicalFrame(renderFrame(plan, elapsed)));
      changes[0] += changedPixels(frames[0], frames[1]);
      changes[1] += changedPixels(frames[1], frames[2]);
      changes[2] += changedPixels(frames[0], frames[2]);
      for (let i = 0; i < 3; i++) areas[i] += coloredArea(frames[i]);
      samples++;
    }
    assert.ok(changes[0] / samples > 16 && changes[1] / samples > 16, `${fixture[0]}: adjacent degrees must change more than a few LED pixels on average`);
    assert.ok(changes[2] / samples > 40, `${fixture[0]}: low and strong cannot collapse to the same hardware frame`);
    assert.ok((areas[1] - areas[0]) / samples > 8 && (areas[2] - areas[1]) / samples > 8, `${fixture[0]}: visible colored area must increase across all three degrees`);
  }
});
