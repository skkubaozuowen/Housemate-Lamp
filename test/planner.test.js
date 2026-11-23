import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlan, VISIBLE_RESPONSE_TYPES, CATALOG, hasAmbientTail } from '../public/lib/catalog.js';
import { PALETTE_FAMILIES, NAMED_COLOR_FAMILIES, selectPalette, resolvePaletteFamily, isPaletteAllowed } from '../public/lib/palettes.js';
import { PLAN_SCHEMA, validatePlan, normalizePlan, normalizePreferences, applyPreferences, planLocal, createScenePlan } from '../public/lib/planner.js';

test('representative Chinese, English and Korean expressions route by purpose', () => {
  const examples = {
    greet: ['你好', "I'm home", '나 왔어'],
    rest: ['陪我待一会儿', 'Stay with me', '잠깐 같이 있어 줘'],
    setback: ['我今天有点难过，只想说说', 'Today was awful.', '오늘 좀 슬프고 말하고 싶어'],
    upcoming: ['我有点紧张，想缓一缓', "I'm anxious and want to calm down", '긴장해서 진정하고 싶어', '明天发表有点怕，给我打打气', 'Please cheer me on for my presentation tomorrow', '내일 발표가 무서워, 응원해 줘'],
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
  assert.equal(planLocal("Don't stop, stay with me").plan.responseType, 'rest');
  for (const text of ["Don't leave me alone", "Please don’t leave me alone, stay with me", "I don't want to be alone", '别让我一个人待着', '혼자 두지 마']) assert.equal(planLocal(text).plan.responseType, 'rest', text);
  assert.equal(planLocal("Don't leave me alone. Actually, give me some space.").plan.responseType, 'withdraw');
  assert.equal(planLocal("I can't stop crying").plan.responseType, 'setback');
});

test('negative self-evaluation, uncertain futures and knowledge are never false affirmations', () => {
  assert.equal(planLocal('我太没用了').plan.responseType, 'setback');
  assert.equal(planLocal('I am useless').plan.responseType, 'setback');
  for (const text of ['Will my paper be accepted?', 'What is happiness?', 'Why is blue calming?', '幸福是什么？', '宇宙多大？', '未知表达 xyz']) assert.equal(planLocal(text).plan.responseType, 'clarify', text);
  assert.equal(planLocal('今天是我生日，但我一点也不开心').plan.responseType, 'setback');
  assert.equal(planLocal("It's my birthday tomorrow").plan.responseType, 'celebrate');
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

test('the final repertoire contains five exchange states and six everyday situations', () => {
  assert.equal(VISIBLE_RESPONSE_TYPES.length, 11);
  assert.deepEqual(VISIBLE_RESPONSE_TYPES.map(type => CATALOG[type].id), ['B01','B02','B03','B04','B05','S01','S02','S03','S04','S05','S06']);
  for (const type of ['idle', 'empathize', 'soothe', 'repair', 'accompany']) assert.ok(validatePlan(createPlan(type)), type);
  const legacy = createPlan('empathize');
  delete legacy.expression;
  assert.equal(normalizePlan(legacy).expression, 'default');
});

test('explicit joy in solitude is celebration; only coexisting feelings make the birthday mixed', () => {
  for (const text of ['今天我生日，好幸福', "It's my birthday today and I am happy", '오늘 생일이라 행복해', '虽然一个人过生日，但我真的很开心', '今天生日，没有人一起，但我还是开心', '今天我生日，但是没有人陪我，但我还是开心', "It's my birthday, nobody is here but I am still happy", '생일인데 혼자지만 그래도 행복해']) {
    assert.equal(planLocal(text).plan.responseType, 'celebrate', text);
  }
  for (const text of ['生日很开心，但也有点孤单', '今天我生日很开心，也觉得孤独', "It's my birthday, I feel happy and a little lonely", '생일이라 행복하지만 조금 외로워']) {
    const { plan, priority } = planLocal(text);
    assert.equal(plan.responseType, 'mixed', text);
    assert.equal(plan.expression, 'bittersweet', text);
    assert.equal(plan.paletteFamily, 'mixed_warm_cool', text);
    assert.equal(plan.colorCount, 4, text);
    assert.equal(priority, false, text);
  }
  assert.equal(planLocal('一个人在家，今天好开心').plan.responseType, 'celebrate', 'solitude alone does not imply sadness');
  for (const text of ['我没有难过，我现在很开心', '我一个人但不孤独，很开心', 'I am not at all sad, I am happy']) assert.equal(planLocal(text).plan.responseType, 'celebrate', text);
  for (const text of ['今天生日，一个人过', '我生日了但是是一个人', "It's my birthday and I am alone", '생일인데 혼자야']) assert.equal(planLocal(text).understood, false, 'unstated feelings remain open to contextual interpretation');
  assert.equal(planLocal('一个人过生日，真的很难过').plan.responseType, 'setback');
});

test('mixed composition records two expressed feelings and a bounded primary area share', () => {
  const joyful = planLocal('生日很开心，但也有点孤单').plan;
  assert.equal(joyful.feelingPrimary, 'joy');
  assert.equal(joyful.feelingSecondary, 'sadness');
  assert.ok(joyful.feelingBalance >= .75 && joyful.feelingBalance <= .85);
  const sad = planLocal('有点开心，但是特别难过').plan;
  assert.equal(sad.feelingPrimary, 'sadness');
  assert.equal(sad.feelingSecondary, 'joy');
  assert.ok(sad.feelingBalance >= .75);
  assert.equal(planLocal('开心又难过').plan.feelingBalance, .5);
  const hopeful = planLocal('我很有希望，但是也有点紧张').plan;
  assert.equal(hopeful.responseType, 'upcoming', 'ordinary anticipation and worry share S04 rather than forcing an S05 mixture');
  assert.equal(planLocal('我有点紧张，想放松').plan.responseType, 'upcoming', 'desired calm is not a second felt emotion');
  assert.equal(planLocal('今天很开心，也很满足').plan.responseType, 'celebrate', 'several compatible positive descriptions are not forced into complexity');
});

test('positive anticipation is S01 while anticipation with nervousness receives courage in S04', () => {
  for (const text of ['明天发表，很期待，也有点紧张', '对新的工作有些期待，也担心自己适应不了', '明天要搬家，有点盼望，也有点害怕', 'I am looking forward to the new job, but I am also worried about fitting in', '새로운 일이 기대되지만 잘 적응할지 걱정돼']) {
    const { plan, understood } = planLocal(text);
    assert.equal(plan.responseType, 'upcoming', text);
    assert.equal(plan.expression, 'default', text);
    assert.equal(understood, true);
  }
  for (const text of ['明天有面试，好期待', 'I am looking forward to tomorrow', '내일이 기대돼']) assert.equal(planLocal(text).plan.responseType, 'celebrate', text);
  for (const text of ['我有点紧张，想放松', 'I am anxious and want to calm down', '不期待明天的发表，有点担心']) {
    assert.equal(planLocal(text).plan.responseType, 'upcoming', text);
    assert.equal(planLocal(text).plan.expression, 'default', text);
  }
});

test('S05 holds intertwined gain and loss or relief and attachment while ordinary composite situations retain their profiles', () => {
  for (const [text, feelings] of [
    ['终于毕业了，开心又舍不得这里的人。', ['joy','sadness']],
    ['终于离开那份工作，松了一口气，却又舍不得。', ['calm','sadness']],
    ['I graduated, happy but it is hard to say goodbye to my friends.', ['joy','sadness']],
    ['졸업해서 기쁘지만 친구들과 헤어지는 건 아쉬워.', ['joy','sadness']]
  ]) {
    const {plan, understood}=planLocal(text);
    assert.equal(plan.responseType,'mixed',text);
    assert.equal(plan.mixedMode,'paired',text);
    assert.deepEqual(new Set([plan.feelingPrimary,plan.feelingSecondary]),new Set(feelings),text);
    assert.equal(understood,true,text);
  }
  assert.equal(planLocal('今天很累，但完成任务很满足。').plan.responseType,'rest');
  assert.equal(planLocal('很难受，但我想再试一次。').plan.responseType,'setback');
});

test('self-described complexity can remain open, use three supported strands, or retain compatible warm feelings', () => {
  for(const text of ['今天发生了好多事，心里五味杂陈，说不清是什么感觉。','我现在心情很复杂。','说不清是开心还是难过。',"I have mixed feelings and cannot tell how I feel.",'마음이 복잡해.','좋은지 슬픈지 모르겠어.']) {
    const {plan,understood}=planLocal(text);
    assert.equal(plan.responseType,'mixed',text);
    assert.equal(plan.mixedMode,'open',text);
    assert.equal(plan.feelingTertiary,'none',text);
    assert.equal(plan.feelingBalance,.5,text);
    assert.equal(understood,true,text);
  }
  const layered=planLocal('毕业让我开心，又舍不得朋友，还有点担心未来。').plan;
  assert.equal(layered.responseType,'mixed');
  assert.equal(layered.mixedMode,'layered');
  assert.deepEqual(new Set([layered.feelingPrimary,layered.feelingSecondary,layered.feelingTertiary]),new Set(['joy','sadness','anxiety']));
  assert.equal(layered.feelingBalance,.5,'equal language does not invent a dominant strand');
  const warm=planLocal('心情很复杂，既有开心，也对接下来充满期待。').plan;
  assert.equal(warm.responseType,'mixed');
  assert.equal(warm.mixedMode,'paired');
  assert.deepEqual(new Set([warm.feelingPrimary,warm.feelingSecondary]),new Set(['joy','hope']));
  assert.equal(createScenePlan('mixed').mixedMode,'open','manual situation preview starts with unspecified complexity');
});

test('feeling plan fields are strict and older saved plans receive safe defaults', () => {
  const plan = createPlan('mixed');
  for (const update of [{ feelingBalance: .49 }, { feelingBalance: .91 }, { feelingBalance: NaN }, { feelingPrimary: 'unknown' }, { feelingSecondary: 'script' }, {feelingTertiary:'invented'}, {mixedMode:'invented'}]) {
    assert.equal(validatePlan({ ...plan, ...update }), false);
    assert.equal(validatePlan(normalizePlan({ ...plan, ...update })), true);
  }
  const legacy = { ...plan };
  delete legacy.feelingPrimary; delete legacy.feelingSecondary; delete legacy.feelingBalance; delete legacy.mixedMode; delete legacy.feelingTertiary;
  assert.deepEqual([normalizePlan(legacy).feelingPrimary, normalizePlan(legacy).feelingSecondary, normalizePlan(legacy).feelingBalance], ['joy', 'sadness', .7]);
  assert.equal(normalizePlan(legacy).mixedMode,'paired','old saved mixtures keep their two-field meaning');
  assert.equal(normalizePlan(legacy).feelingTertiary,'none');
  const duplicate=normalizePlan(createPlan('mixed',{mixedMode:'layered',feelingTertiary:'joy'}));
  assert.equal(duplicate.mixedMode,'paired');
  assert.equal(duplicate.feelingTertiary,'none');
});

test('sharing good news takes precedence over a future date across everyday positive events', () => {
  for (const text of ['我明天生日', '明天是我的生日', '下周我过生日', '明天去领毕业证', '下周就能和家人团聚了，真开心', "It's my birthday tomorrow", 'my birthday is next week', 'birthday tomorrow', 'I got the job and start tomorrow', 'I am graduating tomorrow', 'I am so happy to see my family next week', '내일 내 생일이야', '다음 주에 내 생일이야', '내일 드디어 졸업해']) {
    const result = planLocal(text);
    assert.equal(result.plan.responseType, 'celebrate', text);
    assert.equal(result.plan.paletteFamily, 'apricot_rose', text);
    assert.equal(result.understood, true, text);
  }
  for (const text of ['明天是我生日，但是我很伤心', 'My birthday is tomorrow but I am unhappy', '내일 생일인데 너무 슬퍼', '내일 생일인데 행복하지 않아']) assert.equal(planLocal(text).plan.responseType, 'setback', text);
  for (const text of ['明天生日很开心，但也有点孤单', 'My birthday is tomorrow, I feel lonely but happy', '내일 생일이라 외롭지만 행복해']) assert.equal(planLocal(text).plan.responseType, 'mixed', text);
  assert.equal(planLocal('明天发表，好紧张').plan.expression, 'default');
  assert.equal(planLocal('明天发表').plan.expression, 'default');
  assert.equal(planLocal('明天去一个对我有特别意义的地方').understood, false, 'a date cannot pin an unfamiliar story as S04');
});

test('native situational compositions keep moving after the finite opening while explicit holds stay still', () => {
  for (const type of ['celebrate','mixed','everyday','setback','upcoming']) {
    assert.equal(hasAmbientTail(createPlan(type)), true, type);
    assert.equal(hasAmbientTail(createPlan(type, { motionPrimitive: 'hold' })), false, `${type}: explicit hold`);
  }
  assert.equal(hasAmbientTail(createScenePlan('celebrate', 'quiet')), false);
  assert.equal(hasAmbientTail(createPlan('celebrate', { motionPrimitive: 'hold' })), false);
  assert.equal(hasAmbientTail(createPlan('mixed', { motionPrimitive: 'slow_drift' })), false);
  assert.equal(hasAmbientTail(createPlan('mixed', { loop: true })), false);
  assert.equal(hasAmbientTail(createPlan('everyday', { motionPrimitive: 'hold' })), false);
  assert.equal(hasAmbientTail(createPlan('setback', { motionPrimitive: 'expand' })), false);
  assert.equal(hasAmbientTail(createPlan('upcoming', { motionPrimitive: 'slow_drift' })), false);
  for (const type of ['processing','rest']) assert.equal(hasAmbientTail(createPlan(type)), false, type);
  assert.equal(hasAmbientTail(null), false);
});

test('quiet achievement is distinct from expansive joy and a new scene restores its theme', () => {
  const quiet = planLocal('终于做完了，挺满足').plan;
  const joy = planLocal('太开心了，论文终于录用了').plan;
  assert.equal(quiet.responseType, 'celebrate');
  assert.equal(quiet.expression, 'quiet');
  assert.ok(quiet.amplitude < joy.amplitude);
  assert.ok(quiet.speed < joy.speed);
  const blue = planLocal('想要蓝色');
  for (const text of ['我好伤心', '我很开心', '今天很累', '明天发表好紧张']) {
    const next = planLocal(text, { currentPlan: blue.plan, preferences: blue.preferences }).plan;
    assert.notEqual(next.paletteFamily, 'named_blue', text);
    assert.equal(next.paletteVariant, 'balanced', text);
  }
});

test('setbacks retain violet and rose unless trying again explicitly invites the golden transition', () => {
  for (const text of ['今天没做好，我很难受', 'I failed and feel sad', '오늘 실패해서 속상해', '今天没做好，但我不想再试', "I failed and don't want to try again", '실패했지만 다시 시도하고 싶지 않아']) {
    const plan = planLocal(text).plan;
    assert.equal(plan.responseType, 'setback', text);
    assert.equal(plan.expression, 'default', text);
    assert.equal(plan.paletteFamily, 'dusk_indigo', text);
  }
  for (const text of ['今天没做好，我很难受，但我想再试一次', 'I failed but I want to try again', '실패했지만 다시 해보고 싶어']) {
    const plan = planLocal(text).plan;
    assert.equal(plan.responseType, 'setback', text);
    assert.equal(plan.expression, 'renew', text);
    assert.equal(plan.paletteFamily, 'renewal_gold', text);
    assert.equal(plan.colorCount, 4, text);
    assert.equal(plan.durationMs, 14000, 'the finite gesture leaves time for violet, entering yellow and the warm finish');
    assert.equal(plan.loop, false, 'the warming gesture does not restart');
    assert.equal(plan.nextState, 'idle', 'the finite warm response returns to ordinary white idle');
  }
  assert.deepEqual(PALETTE_FAMILIES.renewal_gold.colors.slice(0,2), PALETTE_FAMILIES.dusk_indigo.colors.slice(0,2), 'renewal begins in the same violet family as an ordinary setback');
});

test('fatigue keeps its easing rhythm while fulfilment adds a small warm field', () => {
  for (const text of ['累得不想动', 'I am exhausted', '오늘 너무 힘든 하루였다']) {
    const plan = planLocal(text).plan;
    assert.equal(plan.responseType, 'rest', text);
    assert.equal(plan.paletteFamily, 'mist_blue', text);
    assert.equal(plan.loop, false, text);
  }
  for (const text of ['很累但很有成就感', 'I am tired but fulfilled', '피곤하지만 뿌듯해']) {
    const plan = planLocal(text).plan;
    assert.equal(plan.responseType, 'rest', text);
    assert.equal(plan.expression, 'fulfilled', text);
    assert.equal(plan.paletteFamily, 'rest_glow', text);
    assert.equal(plan.colorCount, 4, text);
  }
  const invited = planLocal('Stay with me').plan;
  assert.equal(invited.responseType, 'rest');
  assert.equal(invited.loop, true);
  assert.equal(invited.nextState, 'accompany');
});

test('expressed nervousness and requests for courage share one S04 profile; neutral plans and anticipation do not', () => {
  const expected = createScenePlan('upcoming', 'default', { seed:77 });
  assert.equal(expected.paletteFamily, 'horizon_glow');
  assert.equal(expected.colorCount, 4);
  assert.equal(expected.durationMs, 12000);
  for (const text of [
    '明天发表，好紧张', '我有点紧张，想缓一缓', 'My presentation is tomorrow and I am nervous', '내일 발표라 너무 긴장돼',
    '给我打打气', 'Please give me some courage', '응원해 줘',
    '明天发表，很期待，也有点紧张'
  ]) {
    const plan = planLocal(text).plan;
    assert.deepEqual({ ...plan, seed:77 }, expected, `${text}: meaning does not split into a separate visual profile`);
  }
  for (const expression of ['tense','anticipation','neutral']) {
    assert.deepEqual(createScenePlan('upcoming', expression, { expression, seed:77 }), expected, `${expression}: a stale expression override cannot restore a separate S04 branch`);
    const saved = createPlan('upcoming', { expression, paletteFamily:'apricot_rose', colorCount:3, seed:77 });
    assert.deepEqual(normalizePlan(saved), saved, `${expression}: saved legacy plans retain their readable fields`);
    assert.ok(validatePlan(saved));
  }
  assert.equal(planLocal('Will my presentation go well?').plan.responseType, 'clarify');
  for (const text of ['明天不想上班，今天我好伤心', '今天考试失败了，很难过，明天再说', 'Today was awful. We can talk tomorrow.']) {
    assert.equal(planLocal(text).plan.responseType, 'setback', text);
  }
  for (const text of ['明天终于可以见面了', "I can't wait to see them tomorrow", '내일 만날 생각에 설레']) {
    assert.equal(planLocal(text).plan.responseType, 'celebrate', text);
  }
  for (const text of ['明天发表', '我明天要发表', '明天我要面试', 'I have a presentation tomorrow', 'My presentation is tomorrow', 'I will give a presentation tomorrow', '내일 발표가 있어', '내일 발표해요']) {
    const result = planLocal(text);
    assert.equal(result.plan.responseType, 'everyday', text);
    assert.equal(result.understood, true, 'a neutral date or event does not imply nervousness');
  }
});

test('ordinary events retain expressed bad luck, frustration or disappointment instead of overriding them as S06', () => {
  for (const text of [
    '我好倒霉，下雨了', '倒楣透了，出门又下雨', '最近什么都不顺', '下雨了，真烦',
    '下雨了，散步计划泡汤了', '今天天气真讨厌', '今天吃了蛋糕，真糟糕',
    'I am so unlucky, it is raining', 'Bad luck, my walk was ruined by the rain', 'The weather is frustrating today',
    '비가 와서 짜증나', '오늘은 재수 없어, 비까지 와', '오늘 일이 뜻대로 안 돼'
  ]) {
    const result = planLocal(text);
    assert.equal(result.plan.responseType, 'setback', text);
    assert.equal(result.plan.expression, 'default', text);
  }
  for (const text of ['今天下雨了', 'I had lunch at home', '오늘 점심을 먹었어', '今天下雨了，好浪漫', '今天吃了饭，心里却空空的']) {
    const result = planLocal(text);
    assert.equal(result.plan.responseType, 'everyday', text);
    assert.equal(result.understood, false, 'a daily-activity word leaves the full narrative available for AI interpretation');
  }
});

test('negated anticipation or nervousness does not manufacture positive excitement or a need for courage', () => {
  for (const text of ['我很不期待明天的考试', '我不再期待明天的见面', 'I am not looking forward to tomorrow', '내일이 기대되지 않아']) {
    const result = planLocal(text);
    assert.notEqual(result.plan.responseType, 'celebrate', text);
    assert.notEqual(result.plan.responseType, 'upcoming', text);
    assert.equal(result.understood, false, text);
  }
  for (const text of ['我不紧张，只是说明天发表', 'I am not nervous, I have a presentation tomorrow', '내일 발표가 있지만 긴장되지 않아']) {
    const result = planLocal(text);
    assert.equal(result.plan.responseType, 'everyday', text);
    assert.equal(result.understood, false, text);
  }
  for (const text of ['我不紧张，反而很期待', 'I am not nervous, I am looking forward to tomorrow', '내일이 기대돼, 긴장되지 않아']) {
    assert.equal(planLocal(text).plan.responseType, 'celebrate', text);
  }
  assert.equal(planLocal('我终于可以去做手术了').understood, false, 'finally being able to act does not establish delight');
});

test('ordinary narratives get brief acknowledgement and an arrival does not erase the following situation', () => {
  for (const text of ['我刚刚吃过饭', 'I had lunch at home', '오늘 점심을 먹었어']) assert.equal(planLocal(text).plan.responseType, 'everyday', text);
  assert.equal(planLocal('我回来了，今天好累').plan.responseType, 'rest');
  assert.equal(createScenePlan('upcoming', 'fulfilled').expression, 'default');
  assert.equal(createScenePlan('mixed').colorCount, 4);
  assert.equal(planLocal('Today I have something to tell you').understood, false, 'generic narrative remains available for AI interpretation');
});
