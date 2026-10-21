import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlan } from '../public/lib/catalog.js';
import { PALETTE_FAMILIES, NAMED_COLOR_FAMILIES, selectPalette, resolvePaletteFamily, isPaletteAllowed } from '../public/lib/palettes.js';
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
  assert.deepEqual(normalizePreferences({ avoidedColors: ['blue', 'script', 'blue'], rejectedPalettes: ['bad', 'mist_blue', 'mist_blue', 2], lockedPalette: {paletteFamily:'bad'}, speedScale: -20 }), { avoidedColors: ['blue'], rejectedPalettes: ['mist_blue'], lockedPalette: null, speedScale: .2, amplitudeScale: 1 });
});

test('finite gestures cannot gain infinite loops through plan parameters', () => {
  const plan = applyPreferences(createPlan('celebrate', { loop: true }), {});
  assert.equal(plan.loop, false);
  assert.equal(planLocal('你好', { currentPlan: createPlan('idle', { seed: 4 }) }).plan.seed, planLocal('你好', { currentPlan: createPlan('idle', { seed: 4 }) }).plan.seed);
});

test('rejecting the current color overrides its lock and stays rejected in later turns', () => {
  const currentPlan = createPlan('accompany', { paletteFamily: 'lilac_blush', seed: 77 });
  const preferences = normalizePreferences({ lockedPalette: { paletteFamily: 'lilac_blush', paletteVariant: 'balanced', colorCount: 3 } });
  for (const text of ['不要这个颜色', '这个配色我不喜欢', '换个颜色', "I don't like this color", "I don't want this color", 'I dislike this color', '别用这个配色', '不用这个颜色', '이 색 말고']) {
    const result = planLocal(text, { currentPlan, preferences, stableState: 'accompany' });
    assert.equal(result.priority, true, text);
    assert.equal(result.plan.responseType, 'repair', text);
    assert.equal(result.preferences.lockedPalette, null, text);
    assert.deepEqual(result.preferences.rejectedPalettes, ['lilac_blush'], text);
    assert.notEqual(result.plan.paletteFamily, 'lilac_blush', text);
    assert.notDeepEqual(selectPalette(result.plan, result.preferences), selectPalette(currentPlan, preferences), text);
    for (const later of ['今天生日', '陪我待一会儿', '谢谢']) {
      const next = planLocal(later, { currentPlan: result.plan, preferences: result.preferences });
      assert.notEqual(next.plan.paletteFamily, 'lilac_blush', later);
      assert.equal(resolvePaletteFamily(next.plan, next.preferences), next.plan.paletteFamily, later);
    }
  }
});

test('rejection follows the palette actually shown when an old plan has different metadata', () => {
  const currentPlan = createPlan('empathize', { paletteFamily: 'mauve_sand' });
  const preferences = normalizePreferences({ lockedPalette: { paletteFamily: 'mist_blue', paletteVariant: 'accented', colorCount: 2 } });
  const result = planLocal('不要这个颜色', { currentPlan, preferences });
  assert.deepEqual(result.preferences.rejectedPalettes, ['mist_blue']);
  assert.notEqual(result.plan.paletteFamily, 'mist_blue');
  assert.notDeepEqual(selectPalette(result.plan, result.preferences), selectPalette(currentPlan, preferences));
});

test('explicit named colors replace this moment and clear old locks, bans and rejections', () => {
  const currentPlan = createPlan('accompany', { paletteFamily: 'lilac_blush' });
  const preferences = normalizePreferences({ avoidedColors: ['blue'], rejectedPalettes: [NAMED_COLOR_FAMILIES.blue], lockedPalette: { paletteFamily: 'peach_amber', paletteVariant: 'misted', colorCount: 3 } });
  for (const [text, hue] of [['我要蓝色', 'blue'], ['要蓝色', 'blue'], ['换成红色', 'red'], ['change the color to blue', 'blue'], ['make it pink', 'pink'], ['파란색으로 바꿔줘', 'blue']]) {
    const result = planLocal(text, { currentPlan, preferences });
    const family = NAMED_COLOR_FAMILIES[hue];
    assert.equal(result.priority, true, text);
    assert.equal(result.plan.responseType, 'repair', text);
    assert.equal(result.plan.paletteFamily, family, text);
    assert.equal(result.preferences.lockedPalette, null, text);
    assert.ok(!result.preferences.avoidedColors.includes(hue), text);
    assert.ok(!result.preferences.rejectedPalettes.includes(family), text);
    const later = planLocal('今天生日', { currentPlan: result.plan, preferences: result.preferences });
    assert.equal(later.plan.paletteFamily, createPlan('celebrate').paletteFamily, text);
    assert.equal(applyPreferences(createPlan('celebrate'), result.preferences).paletteFamily, createPlan('celebrate').paletteFamily, text);
  }
});

test('color bans, positive replacement and motion correction compose in one local repair', () => {
  const currentPlan = createPlan('accompany', { paletteFamily: 'mist_blue', speed: .3, amplitude: .6 });
  const preferences = normalizePreferences({ lockedPalette: { paletteFamily: 'mist_blue', paletteVariant: 'balanced', colorCount: 3 } });
  for (const text of ['不要蓝色改成粉色，慢一点', '不要蓝色，改成粉色，慢一点', 'No blue, change the color to pink and slow down', '파란색 말고 분홍색으로 바꿔줘, 천천히']) {
    const result = planLocal(text, { currentPlan, preferences });
    assert.equal(result.plan.responseType, 'repair', text);
    assert.equal(result.priority, true, text);
    assert.deepEqual(result.preferences.avoidedColors, ['blue'], text);
    assert.equal(result.plan.paletteFamily, NAMED_COLOR_FAMILIES.pink, text);
    assert.equal(result.preferences.lockedPalette, null, text);
    assert.ok(result.plan.speed < currentPlan.speed, text);
    assert.ok(result.plan.amplitude < currentPlan.amplitude, text);
    assert.ok(result.plan.amplitude > 0, text);
    const later = planLocal('陪我待一会儿', { currentPlan: result.plan, preferences: result.preferences });
    assert.notEqual(later.plan.paletteFamily, NAMED_COLOR_FAMILIES.pink, text);
    assert.ok(!PALETTE_FAMILIES[later.plan.paletteFamily].tags.includes('blue'), text);
  }
  const active = planLocal('换个颜色，太单调了，活跃一点', { currentPlan, preferences });
  assert.equal(active.plan.responseType, 'repair');
  assert.notEqual(active.plan.paletteFamily, 'mist_blue');
  assert.ok(active.plan.speed > currentPlan.speed);
  assert.ok(active.plan.amplitude > currentPlan.amplitude);
});

test('color words in feelings, possessions or unrelated dislikes do not change preferences', () => {
  const currentPlan = createPlan('idle', { paletteFamily: 'lilac_blush' });
  const preferences = normalizePreferences({});
  for (const text of ['I feel blue', "I'm not blue", '我没有蓝色衣服', "I don't like being tired", "I don't like feeling blue", '我不喜欢蓝色衣服', '蓝色让我难过我不喜欢今天', 'Please change the color of my blue jacket']) {
    const result = planLocal(text, { currentPlan, preferences });
    assert.deepEqual(result.preferences, preferences, text);
  }
  const result = planLocal('Use blue without pink', { currentPlan });
  assert.deepEqual(result.preferences.avoidedColors, ['pink']);
  assert.equal(result.preferences.lockedPalette, null);
  assert.equal(result.plan.paletteFamily, NAMED_COLOR_FAMILIES.blue);
});

test('contrastive color requests keep the desired hue and reject only its alternative', () => {
  const currentPlan = createPlan('idle', { paletteFamily: 'lilac_blush' });
  for (const text of ['我要蓝色不要粉色', '换成蓝色而不是粉色', 'Use blue not pink', 'Use blue instead of pink']) {
    const result = planLocal(text, { currentPlan });
    assert.equal(result.priority, true, text);
    assert.equal(result.plan.responseType, 'repair', text);
    assert.equal(result.plan.paletteFamily, NAMED_COLOR_FAMILIES.blue, text);
    assert.equal(result.preferences.lockedPalette, null, text);
    assert.deepEqual(result.preferences.avoidedColors, ['pink'], text);
  }
  assert.deepEqual(planLocal('蓝色不要', { currentPlan }).preferences.avoidedColors, ['blue']);
  assert.deepEqual(planLocal('파란색 말고', { currentPlan }).preferences.avoidedColors, ['blue']);
});

test('named color lasts for the current moment; only explicit keep locks subsequent emotion colors', () => {
  const currentPlan = createPlan('idle', { paletteFamily: 'lilac_blush' });
  const blue = planLocal('想要蓝色', { currentPlan });
  assert.equal(blue.plan.paletteFamily, NAMED_COLOR_FAMILIES.blue);
  assert.equal(blue.preferences.lockedPalette, null);
  for (const text of ['谢谢', '慢一点']) {
    const continuation = planLocal(text, { currentPlan: blue.plan, preferences: blue.preferences });
    assert.equal(continuation.plan.paletteFamily, NAMED_COLOR_FAMILIES.blue, text);
    assert.equal(continuation.preferences.lockedPalette, null, text);
  }
  const joy = planLocal('我很开心', { currentPlan: blue.plan, preferences: blue.preferences });
  assert.equal(joy.plan.responseType, 'celebrate');
  assert.equal(joy.plan.paletteFamily, createPlan('celebrate').paletteFamily);
  const kept = planLocal('保持这个颜色', { currentPlan: blue.plan, preferences: blue.preferences });
  assert.equal(kept.preferences.lockedPalette.paletteFamily, NAMED_COLOR_FAMILIES.blue);
  assert.equal(planLocal('我很开心', { currentPlan: kept.plan, preferences: kept.preferences }).plan.paletteFamily, NAMED_COLOR_FAMILIES.blue);
  for (const text of ['换成蓝色并保持这个颜色', 'Make it pink and keep this color']) {
    const hue = text.includes('pink') ? 'pink' : 'blue';
    const result = planLocal(text, { currentPlan });
    assert.equal(result.plan.responseType, 'repair');
    assert.equal(result.plan.paletteFamily, NAMED_COLOR_FAMILIES[hue]);
    assert.equal(result.preferences.lockedPalette.paletteFamily, NAMED_COLOR_FAMILIES[hue]);
    assert.equal(planLocal('我很开心', { currentPlan: result.plan, preferences: result.preferences }).plan.paletteFamily, NAMED_COLOR_FAMILIES[hue]);
  }
});

test('boundaries win over color commands and old rejection history rolls over without freezing', () => {
  const currentPlan = createPlan('accompany', { paletteFamily: 'mist_blue' });
  const boundary = planLocal('让我一个人待着，不要蓝色改成粉色', { currentPlan });
  assert.equal(boundary.plan.responseType, 'withdraw');
  assert.deepEqual(boundary.preferences.avoidedColors, []);
  const preferences = normalizePreferences({ rejectedPalettes: Object.keys(PALETTE_FAMILIES).filter(family => family !== 'mist_blue') });
  const result = planLocal('不要这个颜色', { currentPlan, preferences });
  assert.ok(validatePlan(result.plan));
  assert.notEqual(result.plan.paletteFamily, 'mist_blue');
  assert.deepEqual(result.preferences.rejectedPalettes, ['mist_blue']);
  assert.equal(isPaletteAllowed(result.plan.paletteFamily, result.preferences), true);
});

test('when every hue is excluded and only gray remains, rejection asks for a different choice honestly', () => {
  const currentPlan = createPlan('idle', { paletteFamily: 'neutral_gray' });
  const preferences = normalizePreferences({ avoidedColors: ['blue', 'pink', 'purple', 'green', 'orange', 'red', 'yellow'] });
  const result = planLocal('不要这个颜色', { currentPlan, preferences });
  assert.equal(result.plan.responseType, 'clarify');
  assert.equal(result.understood, false);
  assert.equal(result.plan.paletteFamily, 'neutral_gray');
  assert.ok(validatePlan(result.plan));
  assert.ok(!result.preferences.rejectedPalettes.includes('neutral_gray'));
  assert.deepEqual(selectPalette(result.plan), selectPalette(result.plan, result.preferences));
});
