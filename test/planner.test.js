import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlan } from '../public/lib/catalog.js';
import { PALETTE_FAMILIES } from '../public/lib/palettes.js';
import { PLAN_SCHEMA, validatePlan, normalizePlan, normalizePreferences, applyPreferences, planLocal } from '../public/lib/planner.js';

test('representative Chinese, English and Korean expressions route by purpose', () => {
  const examples = {
    greet: ['你好', "I'm home", '나 왔어'],
    accompany: ['陪我待一会儿', 'Stay with me', '잠깐 같이 있어 줘'],
    empathize: ['我今天有点难过，只想说说', 'Today was awful.', '오늘 좀 슬프고 말하고 싶어'],
    soothe: ['我有点紧张，想缓一缓', "I'm anxious and want to calm down", '긴장해서 진정하고 싶어'],
    encourage: ['明天发表有点怕，给我打打气', 'Please cheer me on for my presentation tomorrow', '내일 발표가 무서워, 응원해 줘'],
    celebrate: ['论文终于录用了', "It's my birthday today", '오늘 내 생일이야'],
    receive_thanks: ['谢谢', 'Thanks', '고마워'],
    withdraw: ['今天让我一个人待着', "I'd like some time alone.", '혼자 있고 싶어'],
    farewell: ['晚安', 'Good night', '잘 자']
  };
  for (const [expected, texts] of Object.entries(examples)) for (const text of texts) {
    const result = planLocal(text);
    assert.equal(result.plan.responseType, expected, text);
    assert.ok(validatePlan(result.plan), text);
  }
});

test('boundaries precede emotions, and thanks preserves solitude and palette', () => {
  const currentPlan = createPlan('accompany', { seed: 22, paletteFamily: 'sea_glass' });
  for (const text of ['我很紧张，但别安慰我，让我一个人待一会儿', "I'm anxious but leave me alone", 'let me be', 'alone for a while', '停']) {
    const result = planLocal(text, { currentPlan, stableState: 'accompany' });
    assert.equal(result.plan.responseType, 'withdraw');
    assert.equal(result.priority, true);
    assert.equal(result.plan.paletteFamily, 'sea_glass');
    assert.equal(result.plan.loop, false);
  }
  const thanks = planLocal('Thanks', { currentPlan, stableState: 'withdraw' }).plan;
  assert.equal(thanks.responseType, 'receive_thanks');
  assert.equal(thanks.nextState, 'withdraw');
  assert.equal(thanks.paletteFamily, 'sea_glass');
  assert.equal(planLocal("Don't stop, stay with me").plan.responseType, 'accompany');
  for (const text of ["Don't leave me alone", "Please don’t leave me alone, stay with me", "I don't want to be alone", '别让我一个人待着', '혼자 두지 마']) assert.equal(planLocal(text).plan.responseType, 'accompany', text);
  assert.equal(planLocal("Don't leave me alone. Actually, give me some space.").plan.responseType, 'withdraw');
  assert.equal(planLocal("I can't stop crying").plan.responseType, 'clarify');
});

test('negative self-evaluation, uncertain futures and knowledge are never false affirmations', () => {
  assert.equal(planLocal('我太没用了').plan.responseType, 'empathize');
  assert.equal(planLocal('I am useless').plan.responseType, 'empathize');
  for (const text of ['Will my paper be accepted?', 'What is happiness?', 'Why is blue calming?', '幸福是什么？', '宇宙多大？', '未知表达 xyz']) assert.equal(planLocal(text).plan.responseType, 'clarify', text);
  assert.equal(planLocal('今天是我生日，但我一点也不开心').plan.responseType, 'empathize');
  assert.equal(planLocal("It's my birthday tomorrow").plan.responseType, 'encourage');
});

test('feedback changes parameters and subsequent palette choices; lock can be overridden by a ban', () => {
  const currentPlan = createPlan('accompany', { paletteFamily: 'mist_blue', speed: 0.22, amplitude: 0.45, seed: 1 });
  const slower = planLocal('刚才太活跃了，慢一点', { currentPlan, stableState: 'accompany' });
  assert.equal(slower.plan.responseType, 'repair');
  assert.ok(slower.plan.speed < currentPlan.speed);
  assert.ok(slower.plan.amplitude < currentPlan.amplitude);
  assert.ok(slower.plan.durationMs > createPlan('repair').durationMs);
  const slowerCelebration = planLocal('今天生日', { preferences: slower.preferences });
  assert.ok(slowerCelebration.plan.durationMs > createPlan('celebrate').durationMs);
  const calmer = planLocal('再慢一点', { currentPlan: slower.plan, preferences: slower.preferences });
  assert.ok(calmer.plan.speed < slower.plan.speed);
  const active = planLocal('太单调，活跃一点', { currentPlan, preferences: slower.preferences });
  assert.ok(active.preferences.speedScale > slower.preferences.speedScale);
  const locked = planLocal('就保持这个颜色', { currentPlan });
  assert.equal(locked.plan.responseType, 'complete');
  assert.equal(planLocal('今天生日', { preferences: locked.preferences }).plan.paletteFamily, 'mist_blue');
  const avoid = planLocal('我不喜欢蓝色', { currentPlan, preferences: locked.preferences });
  assert.equal(avoid.preferences.lockedPalette, null);
  assert.deepEqual(avoid.preferences.avoidedColors, ['blue']);
  assert.deepEqual(planLocal("I don't like blue, but pink is fine").preferences.avoidedColors, ['blue']);
  assert.deepEqual(planLocal('我喜欢蓝色，不要太快').preferences.avoidedColors, []);
  assert.deepEqual(planLocal('No more blue').preferences.avoidedColors, ['blue']);
  assert.deepEqual(planLocal("I don't like being tired").preferences.avoidedColors, []);
  for (const text of ['陪我待一会儿', '谢谢', '今天生日', '你好']) {
    const plan = planLocal(text, { currentPlan: avoid.plan, preferences: avoid.preferences }).plan;
    assert.ok(!PALETTE_FAMILIES[plan.paletteFamily].tags.includes('blue'), text);
  }
});

test('known palette acceptance needs context and vague correction asks for clarification', () => {
  assert.equal(planLocal('你能用这个配色吗').plan.responseType, 'clarify');
  assert.equal(planLocal('你能用这个配色吗', { currentPlan: createPlan('idle') }).plan.responseType, 'affirm');
  assert.equal(planLocal('我刚才说的那个，不是这个', { currentPlan: createPlan('idle') }).plan.responseType, 'clarify');
  for (const text of ['keep this one', 'this one is fine', '就保持这样', '이대로']) {
    const currentPlan = createPlan('idle', { paletteFamily: 'peach_amber', paletteVariant: 'accented', colorCount: 2 });
    const result = planLocal(text, { currentPlan });
    assert.equal(result.plan.responseType, 'complete', text);
    assert.deepEqual(result.preferences.lockedPalette, { paletteFamily: 'peach_amber', paletteVariant: 'accented', colorCount: 2 });
    assert.equal(planLocal(text).plan.responseType, 'clarify');
  }
});

test('strict schema rejects unknown, malformed, missing and out-of-range values', () => {
  const good = createPlan('empathize', { seed: 123 });
  assert.equal(validatePlan(good), true);
  assert.equal(PLAN_SCHEMA.additionalProperties, false);
  assert.deepEqual(new Set(PLAN_SCHEMA.required), new Set(Object.keys(good)));
  for (const invalid of [null, [], {}, { ...good, script: 'alert(1)' }, { ...good, responseType: 'smile' }, { ...good, version: 2 }, { ...good, colorCount: 5 }, { ...good, colorCount: 1.5 }, { ...good, speed: Infinity }, { ...good, energy: -1 }, { ...good, seed: -1 }, { ...good, durationMs: 99999 }, { ...good, loop: 'true' }]) {
    assert.equal(validatePlan(invalid), false);
    assert.equal(validatePlan(normalizePlan(invalid)), true);
  }
  assert.deepEqual(normalizePreferences({ avoidedColors: ['blue', 'script', 'blue'], lockedPalette: {paletteFamily:'bad'}, speedScale: -20 }), { avoidedColors: ['blue'], lockedPalette: null, speedScale: .2, amplitudeScale: 1 });
});

test('finite gestures cannot gain infinite loops through plan parameters', () => {
  const plan = applyPreferences(createPlan('celebrate', { loop: true }), {});
  assert.equal(plan.loop, false);
  assert.equal(planLocal('你好', { currentPlan: createPlan('idle', { seed: 4 }) }).plan.seed, planLocal('你好', { currentPlan: createPlan('idle', { seed: 4 }) }).plan.seed);
});
