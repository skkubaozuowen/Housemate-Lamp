import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionController } from '../public/lib/controller.js';
import { createPlan } from '../public/lib/catalog.js';
import { createScenePlan } from '../public/lib/planner.js';

class Renderer {
  constructor() { this.calls = []; this.elapsedMs = 0; }
  setPlan(plan, rendering = {}) {
    this.plan = plan; this.rendering = rendering;
    if (!rendering.preserveProgress) this.elapsedMs = 0;
    this.calls.push(plan);
  }
  setPaused(value) { this.paused = value; }
  finish() { const plan = this.plan; this.elapsedMs = plan.durationMs; this.onComplete(plan); }
}
function session(requestPlan, mode = 'demo') {
  const renderer = new Renderer();
  const controller = new SessionController({ renderer, requestPlan, mode });
  return { controller, renderer };
}
const expressions = [
  ['celebrate','default'], ['celebrate','quiet'], ['setback','default'], ['setback','renew'],
  ['rest','default'], ['rest','fulfilled'], ['upcoming','default'],
  ['mixed','bittersweet','open'], ['mixed','bittersweet','paired'], ['mixed','bittersweet','layered'],
  ['everyday','default']
];

test('the basic lamp starts white and all eleven expressions return to white once', () => {
  for (const [type, expression, mixedMode] of expressions) {
    const {controller:c,renderer:r} = session();
    assert.equal(c.plan.responseType,'idle');
    assert.equal(c.plan.motionPrimitive,'hold');
    assert.deepEqual(r.rendering.colors,[[255,255,255]]);
    const plan = createScenePlan(type,expression,{
      ...(mixedMode ? {mixedMode} : {}),
      ...(mixedMode === 'layered' ? {feelingTertiary:'hope'} : {})
    });
    c.preview(plan);
    assert.ok(c.plan.durationMs >= 10000 && c.plan.durationMs <= 15000);
    assert.equal(c.plan.loop,false);
    const outgoing = c.plan;
    r.finish();
    assert.equal(c.plan.responseType,'idle',`${type}/${expression}/${mixedMode}`);
    assert.equal(c.stableState,'idle');
    assert.equal(c.plan.transitionMs,2000);
    assert.deepEqual(r.rendering.colors,[[255,255,255]]);
    const count = r.calls.length;
    c.complete(outgoing);
    assert.equal(r.calls.length,count,'a stale scene completion never starts a second return');
    c.setMode('ai');
    assert.equal(c.plan.responseType,'idle','a finished expression never restarts on a mode change');
  }
});

test('B04 and B05 each play once and return promptly to the white lamp', () => {
  for (const type of ['clarify','farewell']) {
    const {controller:c,renderer:r} = session();
    c.respond(createPlan(type));
    assert.ok(c.plan.durationMs <= 2000);
    if(type === 'clarify')assert.equal(c.plan.requiresUserInput,true);
    r.finish();
    assert.equal(c.plan.responseType,'idle');
    assert.equal(c.plan.transitionMs,450);
    assert.deepEqual(r.rendering.colors,[[255,255,255]]);
  }
});

test('B01 opens once and keeps its listening field available for the next words', () => {
  const {controller:c,renderer:r} = session();
  c.respond(createPlan('greet'));
  assert.equal(c.plan.durationMs,1400);
  const opening = c.plan;
  r.finish();
  assert.equal(c.stableState,'hold');
  assert.equal(c.plan.responseType,'greet');
  assert.equal(c.stablePlan.motionPrimitive,'hold');
  assert.equal(r.plan,opening,'there is no inserted white idle between opening and listening');
});

test('short receipt and thinking do not insert a false idle before a pending answer', async () => {
  let resolve;
  const pending = new Promise(done => {resolve = done;});
  const {controller:c,renderer:r} = session(() => pending,'ai');
  const sent = c.submit('今天特别累，只想休息。');
  assert.equal(c.plan.responseType,'acknowledge');
  assert.equal(c.plan.durationMs,850);
  r.finish();
  assert.equal(c.plan.responseType,'processing');
  assert.equal(c.plan.loop,true);
  const count = r.calls.length;
  r.finish();
  assert.equal(c.plan.responseType,'processing');
  assert.equal(r.calls.length,count,'a pending request keeps thinking rather than replaying B01 or white');
  resolve({plan:createScenePlan('rest'),source:'ai'});
  await sent;
  assert.equal(c.plan.responseType,'rest');
  r.finish();
  assert.equal(c.plan.responseType,'idle');
});

test('white between turns preserves the kept expression palette for the next response', async () => {
  const {controller:c,renderer:r} = session();
  c.preferences.lockedPalette = {paletteFamily:'named_pink',paletteVariant:'balanced',colorCount:3};
  c.preview(createScenePlan('rest'),{replacePalette:false});
  assert.equal(c.plan.paletteFamily,'named_pink');
  r.finish();
  assert.equal(c.plan.paletteFamily,'neutral_gray');
  assert.equal(c.plan.colorCount,1);
  assert.deepEqual(r.rendering.colors,[[255,255,255]]);
  assert.equal(c.preferences.lockedPalette.paletteFamily,'named_pink');
  await c.submit('今天收到一个好消息，很开心。');
  r.finish();
  assert.equal(c.plan.responseType,'celebrate');
  assert.equal(c.plan.paletteFamily,'named_pink');
});

test('manual hold, explicit boundaries and invited company remain meaningful', async () => {
  const {controller:c,renderer:r} = session();
  c.preview(createScenePlan('setback','renew'));
  c.stopPreview();
  assert.equal(c.plan.motionPrimitive,'hold');
  assert.equal(c.plan.responseType,'wait');
  assert.equal(c.plan.loop,true);
  await c.submit('陪我待一会儿'); r.finish();
  assert.equal(c.plan.responseType,'rest');
  assert.equal(c.plan.nextState,'accompany');
  assert.equal(c.plan.loop,true);
  await c.submit('停');
  assert.equal(c.plan.responseType,'withdraw');
  r.finish();
  assert.equal(c.stableState,'withdraw');
  assert.equal(c.stablePlan.motionPrimitive,'hold');
});
