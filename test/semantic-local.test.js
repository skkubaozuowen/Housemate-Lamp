import test from 'node:test';
import assert from 'node:assert/strict';
import { createScenePlan, currentInteractionText, directInteractionText, planLocal } from '../public/lib/planner.js';

test('negated fatigue and distress remain open ordinary-sharing suggestions in all three languages', () => {
  for (const text of [
    '我今天一点也不累，刚刚吃完饭。',
    '我不累，只是想坐一会儿。',
    'I am not tired at all. I just had dinner.',
    'I am not exhausted, I just came home.',
    '오늘은 전혀 피곤하지 않아. 그냥 저녁 먹었어.',
    '我不难受，只是随便聊聊。',
    '我没失败，我通过了。'
  ]) {
    const result = planLocal(text);
    assert.equal(result.plan.responseType, 'everyday', text);
    assert.equal(result.understood, false, text);
    assert.equal(result.priority, false, text);
  }
  assert.equal(planLocal('我不累，今天很开心。').plan.responseType, 'celebrate');
  assert.equal(planLocal('我不紧张，只是很累。').plan.responseType, 'rest');
  assert.equal(planLocal('今天真的好累，完成了任务，很满足。').plan.expression, 'fulfilled');
});

test('an explicit past-to-current turn does not accumulate old and current feelings into S05', () => {
  for (const [text, expected] of [
    ['昨天累得不行，今天已经恢复了。', 'everyday'],
    ['昨天很紧张，现在已经不紧张了。', 'everyday'],
    ['我以前很害怕，但现在已经放松下来了。', 'everyday'],
    ['I was exhausted last week, but I feel fine today.', 'everyday'],
    ['I was sad yesterday, but today I am happy.', 'celebrate'],
    ['어제는 슬펐지만 오늘은 행복해.', 'celebrate'],
    ['昨天还挺开心，现在心里很难过。', 'setback']
  ]) {
    const result = planLocal(text);
    assert.equal(result.plan.responseType, expected, text);
    assert.equal(result.understood, false, 'the full original timeline remains for AI interpretation');
    assert.equal(result.priority, false);
  }
  assert.equal(planLocal('Bad luck, my walk was ruined by the rain').plan.responseType, 'setback', 'past events can still be meaningful sharing when no recovery/current contrast is asserted');
});

test('other people and their quotations do not become the speaker\'s current emotion', () => {
  for (const text of [
    '朋友说“我累得不想动”，我今天状态还不错。',
    '朋友说她很难过，我只是转述给你。',
    '他说非常不开心但我挺平静。',
    'My friend said she was exhausted. I feel fine today.',
    'He said "I am very sad", but I feel fine today.',
    '친구가 너무 피곤하다고 했어. 나는 오늘 괜찮아.'
  ]) {
    const result = planLocal(text);
    assert.equal(result.plan.responseType, 'everyday', text);
    assert.equal(result.understood, false, text);
    assert.equal(result.priority, false, text);
  }
  const own = planLocal('朋友说她很累，但我今天真的很开心。');
  assert.equal(own.plan.responseType, 'celebrate', 'the speaker\'s separate reaction remains available');
  assert.equal(own.understood, false);
  assert.equal(planLocal('朋友的消息让我很难过。').plan.responseType, 'setback', 'an explicitly described personal reaction is retained');
});

test('reported lamp commands neither act on the lamp nor mutate its preferences', () => {
  const context = { currentPlan:createScenePlan('celebrate'), preferences:{ speedScale:.8, amplitudeScale:.7 } };
  for (const text of [
    '同事对我说“让我一个人待着”，我只是转述一下。',
    '朋友让我一个人待着，我只是转述。',
    'He said "leave me alone". I feel okay today.',
    'My friend said "stop using blue and make it pink".',
    '老师说“太快了，慢一点”，我只是转述。',
    '朋友说“不要蓝色”，我今天只是讲这件事。'
  ]) {
    const result = planLocal(text, context);
    assert.equal(result.priority, false, text);
    assert.ok(!['withdraw', 'repair', 'complete'].includes(result.plan.responseType), text);
    assert.deepEqual(result.preferences, { avoidedColors:[], rejectedPalettes:[], lockedPalette:null, speedScale:.8, amplitudeScale:.7 }, text);
    assert.equal(typeof directInteractionText(text), 'string');
  }
  assert.equal(/别安慰我|leave me alone/i.test(directInteractionText('别人说“别安慰我”，我明天发表，给我打打气。')), false, 'the API can reuse the same projection for listen-only intent');
});

test('direct commands outside reported content retain priority, including a quoted color label', () => {
  const context = { currentPlan:createScenePlan('celebrate') };
  for (const text of ['同事说“别停”。停。', 'He said "do not stop". Stop.', '朋友说她很累，但让我一个人待一会儿。']) {
    const result = planLocal(text, context);
    assert.equal(result.plan.responseType, 'withdraw', text);
    assert.equal(result.priority, true, text);
  }
  for (const text of ['朋友说“不要蓝色”，但请把灯改成粉色。', '请把灯改成“粉色”。']) {
    const result = planLocal(text, context);
    assert.equal(result.plan.responseType, 'repair', text);
    assert.equal(result.plan.paletteFamily, 'named_pink', text);
    assert.equal(result.priority, true, text);
    assert.deepEqual(result.preferences.avoidedColors, [], 'reported bans do not become the speaker\'s preference');
  }
  assert.equal(planLocal('别让我一个人待着').plan.nextState, 'accompany');
  assert.equal(planLocal('我很难过，但别安慰我，让我一个人待着').plan.responseType, 'withdraw');
});

test('positive events with an unresolved turn are suggestions, without inventing an expressed joy strand', () => {
  for (const text of [
    '今天是我的生日，可是只有我一个人。',
    '终于拿到录取通知了，但马上就要离开熟悉的朋友。',
    '我明天毕业，可是以后不能每天见到这些人了。',
    'I got the job, but I have to leave my friends behind.'
  ]) {
    const result = planLocal(text);
    assert.equal(result.understood, false, text);
    assert.equal(result.priority, false, text);
    assert.notEqual(result.plan.responseType, 'mixed', 'event context remains for AI rather than manufacturing an explicit emotion pair');
  }
  assert.equal(planLocal('虽然一个人过生日，但我真的很开心。').plan.responseType, 'celebrate');
  assert.equal(planLocal('生日很开心，但也有点孤单。').plan.responseType, 'mixed');
});

test('past difficulty with pressure is not automatically locked as S04 nervousness', () => {
  for (const text of ['今天工作一件接一件搞砸了，压力很大，真烦。', 'I am frustrated because work was a stressful mess today.']) {
    const result = planLocal(text);
    assert.equal(result.plan.responseType, 'setback', text);
    assert.equal(result.understood, false, text);
    assert.equal(result.priority, false);
  }
  assert.equal(planLocal('明天发表，好紧张。').plan.responseType, 'upcoming');
  assert.equal(planLocal('明天有面试，好期待。').plan.responseType, 'celebrate');
  assert.equal(planLocal('我明天要发表。').plan.responseType, 'everyday');
  const deniedTension = planLocal('我不是紧张，只是累了。');
  assert.equal(deniedTension.plan.responseType, 'rest');
  assert.equal(deniedTension.understood, false);
});

test('a first-person emotional why is a disclosure while general definitions remain clarification', () => {
  for (const [text, type] of [
    ['不知道为什么我很难过。', 'setback'],
    ['为什么我今天这么累？', 'rest'],
    ['I do not know why I am so sad today.', 'setback'],
    ['我不知道为什么，但今天很开心。', 'celebrate'],
    ['I do not know why, but I feel relieved today.', 'celebrate']
  ]) {
    const result = planLocal(text);
    assert.equal(result.plan.responseType, type, text);
    assert.equal(result.understood, false);
  }
  for (const text of ['为什么人会难过？', 'What is sadness?', '什么是疲劳？']) assert.equal(planLocal(text).plan.responseType, 'clarify', text);
});

test('denied complexity cannot establish protected open feelings and past instructions do not govern today', () => {
  for (const text of ['我不是心情复杂，只是今天很开心。', '我没有五味杂陈，就只有开心。', 'I do not have mixed feelings. I am happy today.']) {
    const result = planLocal(text);
    assert.equal(result.plan.responseType, 'celebrate', text);
    assert.equal(result.understood, false);
  }
  const text = '昨天不需要鼓励，只想你听我说。今天我想再试一次，给我打打气。';
  const current = currentInteractionText(text);
  assert.ok(current.includes('给我打打气'));
  assert.equal(/不需要鼓励|只想你听我说/.test(current), false);
  const corrected = planLocal('昨天让我一个人待着。今天还是很难过，但我想再试一次，给我打打气。');
  assert.equal(corrected.priority, false, 'yesterday\'s boundary cannot become a new command');
  assert.equal(corrected.plan.responseType, 'setback');
  assert.equal(corrected.plan.expression, 'renew');
});
