import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from '../server.js';
import { SessionController } from '../public/lib/controller.js';
import { CATALOG, VISIBLE_RESPONSE_TYPES, createPlan } from '../public/lib/catalog.js';
import { createScenePlan, planLocal, validatePlan } from '../public/lib/planner.js';
import { colorGroup } from '../public/lib/palettes.js';

class Renderer {
  constructor() { this.events = []; }
  setPlan(plan, { colors } = {}) { this.plan = plan; this.colors = colors; this.events.push({ ...plan }); }
  setPaused(value) { this.paused = value; }
  finish() { this.onComplete(this.plan); }
}
const completed = plan => ({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(plan) }] }] }) });
const examples = [
  ['今天很开心，终于完成了！', 'celebrate', 'default'],
  ['明天是我生日。', 'celebrate', 'default'],
  ['Tomorrow is my birthday.', 'celebrate', 'default'],
  ['내일 제 생일이에요.', 'celebrate', 'default'],
  ['今天我好伤心，事情没有成功。', 'setback', 'default'],
  ['我好倒霉，下雨了。', 'setback', 'default'],
  ['今天累了一整天，终于回家想休息。', 'rest', 'default'],
  ['明天发表，好紧张啊。', 'upcoming', 'default'],
  ['明天有面试，好期待。', 'celebrate', 'default'],
  ['我明天要发表。', 'everyday', 'default'],
  ['今天生日很开心，但也有点孤单。', 'mixed', 'bittersweet'],
  ['今天晚饭吃了面条。', 'everyday', 'default'],
];

async function fixture(t, fetchImpl) {
  let requests = 0;
  const server = createServer({ keyProvider: async () => 'test-key', fetchImpl: async (...args) => { requests++; return fetchImpl(...args); } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const renderer = new Renderer();
  const controller = new SessionController({ renderer, mode: 'ai', requestPlan: async (payload, signal) => {
    const response = await fetch(`${origin}/api/plan`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(payload), signal,
    });
    assert.equal(response.status, 200);
    return response.json();
  } });
  return { controller, renderer, requests: () => requests };
}

const sceneForText = text => {
  const match = examples.find(([example]) => example === text);
  if (match) return createScenePlan(match[1], match[2], { seed: 812 });
  if (/开心/.test(text)) return createScenePlan('celebrate', 'default', { seed: 812 });
  if (/伤心/.test(text)) return createScenePlan('setback', 'default', { seed: 812 });
  return createScenePlan('rest', 'default', { seed: 812 });
};
const textFromRequest = options => JSON.parse(JSON.parse(options.body).input.at(-1).content).currentUserText;

test('each canonical scenario travels through receipt, HTTP planning, response, and stable closure', async t => {
  const { controller: c, renderer: r, requests } = await fixture(t, async (_url, options) => completed(sceneForText(textFromRequest(options))));
  assert.equal(VISIBLE_RESPONSE_TYPES.length, 11);
  for (const [text, type, expression] of examples) {
    c.reset();
    const submitted = c.submit(text);
    assert.equal(c.phase, 'received', text);
    assert.equal(c.plan.responseType, 'acknowledge', text);
    assert.equal(c.plan.paletteFamily, 'luminous_current', 'short receipt uses the common blue-cyan-violet language');
    await submitted;
    r.finish();
    assert.equal(c.phase, 'responding', text);
    assert.equal(c.plan.responseType, type, text);
    assert.equal(c.plan.expression, expression, text);
    assert.equal(c.plan.paletteFamily, CATALOG[type].paletteFamily, text);
    assert.equal(c.plan.loop, false, 'daily sharing does not implicitly request ongoing company');
    assert.ok(validatePlan(c.plan));
    if (type === 'mixed') assert.equal(c.plan.colorCount, 4, 'both warm and cool regions remain in the plan');
    assert.ok(c.plan.durationMs >= 10000 && c.plan.durationMs <= 15000);
    r.finish();
    assert.equal(c.phase, 'idle', text);
    assert.equal(c.stableState, CATALOG[type].nextState, text);
    assert.equal(c.plan.responseType, 'idle', 'the complete response returns to the basic lamp');
    assert.deepEqual(r.colors, [[255,255,255]], 'closure returns neutral white rather than retaining a scene palette');
  }
  assert.equal(requests(), examples.length);
});

test('a real pending HTTP plan carries the current field through receipt and thinking before the tense-event response', async t => {
  let release;
  let started;
  const didStart = new Promise(resolve => { started = resolve; });
  const upstream = new Promise(resolve => { release = resolve; });
  const { controller: c, renderer: r } = await fixture(t, async () => { started(); return upstream; });
  c.preview(createPlan('celebrate', { paletteFamily: 'apricot_rose' }));
  const submitted = c.submit('明天发表，好紧张啊。');
  assert.equal(c.plan.responseType, 'acknowledge');
  assert.equal(c.plan.paletteFamily, 'apricot_rose');
  await didStart;
  r.finish();
  assert.equal(c.phase, 'processing');
  assert.equal(c.plan.responseType, 'processing');
  assert.equal(c.plan.paletteFamily, 'apricot_rose');
  assert.equal(c.plan.loop, true);
  release(completed(createScenePlan('upcoming', 'tense', { seed: 812 })));
  await submitted;
  assert.equal(c.phase, 'responding');
  assert.equal(c.plan.responseType, 'upcoming');
  assert.equal(c.plan.expression, 'default');
  assert.equal(c.plan.paletteFamily, 'horizon_glow');
  assert.equal(c.plan.colorCount, 4);
  assert.equal(c.plan.durationMs, 12000);
  assert.equal(c.plan.loop, false);
  assert.equal(c.plan.nextState, 'idle');
  r.finish();
  assert.equal(c.stableState, 'idle');
  assert.deepEqual(r.colors, [[255,255,255]]);
  assert.equal(c.phase, 'idle');
});

test('temporary color changes yield to the next joyful or difficult sharing without a persistent lock', async t => {
  const { controller: c, renderer: r, requests } = await fixture(t, async (_url, options) => completed(sceneForText(textFromRequest(options))));
  await c.submit('想要蓝色');
  assert.equal(c.plan.responseType, 'repair');
  assert.equal(c.plan.paletteFamily, 'named_blue');
  assert.ok(r.colors.every(color => colorGroup(color) === 'blue'));
  assert.equal(c.preferences.lockedPalette, null);
  r.finish();
  for (const [text, type, family] of [
    ['我很开心', 'celebrate', 'apricot_rose'],
    ['我好伤心', 'setback', 'dusk_indigo'],
  ]) {
    const previousFamily = c.plan.responseType === 'idle' ? CATALOG.acknowledge.paletteFamily : c.plan.paletteFamily;
    const submitted = c.submit(text);
    assert.equal(c.plan.responseType, 'acknowledge');
    assert.equal(c.plan.paletteFamily, previousFamily);
    await submitted;
    r.finish();
    assert.equal(c.plan.responseType, type);
    assert.equal(c.plan.paletteFamily, family);
    assert.equal(c.preferences.lockedPalette, null);
    r.finish();
    assert.equal(c.plan.responseType, 'idle');
    assert.deepEqual(r.colors, [[255,255,255]]);
  }
  assert.equal(requests(), 2, 'the direct hue request bypasses AI, both later scenes use the HTTP planner');
});

test('open and three-strand S05 plans survive receipt, server interpretation, composition and scene export', async t => {
  const {controller:c,renderer:r}=await fixture(t,async(_url,options)=>completed(planLocal(textFromRequest(options)).plan));
  for(const [text,mode,third] of [
    ['生日很开心，但也有点孤单。','paired','none'],
    ['毕业让我开心，又舍不得朋友，还有点担心未来。','layered','anxiety'],
    ['今天发生了好多事，心里五味杂陈，说不清是什么感觉。','open','none']
  ]) {
    c.reset();
    const submitted=c.submit(text);
    assert.equal(c.plan.responseType,'acknowledge');
    await submitted;
    r.finish();
    assert.equal(c.plan.responseType,'mixed',text);
    assert.equal(c.plan.mixedMode,mode,text);
    assert.equal(c.plan.feelingTertiary,third,text);
    assert.equal(c.plan.loop,false);
    assert.ok(validatePlan(c.plan));
    const exported=c.exportScene();
    assert.equal(exported.plan.mixedMode,mode);
    assert.equal(exported.plan.feelingTertiary,third);
    assert.equal(exported.rendering.colors.length,4,'all compositions remain within the RGB source color budget');
    assert.equal(JSON.stringify(exported).includes(text),false,'a scene export does not contain the personal disclosure');
  }
});

test('explicit company is the rest scene with an ongoing state; ordinary fatigue remains finite', async () => {
  const renderer = new Renderer();
  const c = new SessionController({ renderer, mode: 'demo', requestPlan: async () => { throw new Error('Local company must not need AI'); } });
  await c.submit('陪我待一会儿');
  renderer.finish();
  assert.equal(c.plan.responseType, 'rest');
  assert.equal(c.plan.loop, true);
  assert.equal(c.plan.nextState, 'accompany');
  assert.equal(c.stableState, 'accompany');
  renderer.finish();
  assert.equal(c.plan.responseType, 'rest');
  assert.equal(c.plan.loop, true);
  assert.equal(c.plan.nextState, 'accompany');
  await c.submit('今天累了一整天，终于回家想休息。');
  renderer.finish();
  assert.equal(c.plan.responseType, 'rest');
  assert.equal(c.plan.loop, false);
  assert.equal(c.plan.nextState, 'idle');
});
