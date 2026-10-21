import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionController } from '../public/lib/controller.js';
import { createPlan } from '../public/lib/catalog.js';
import { colorGroup, selectPalette } from '../public/lib/palettes.js';
class Renderer {
  setPlan(plan, { colors } = {}) { this.plan = plan; this.colors = colors; }
  setPaused(paused) { this.paused = paused; }
  finish() { this.onComplete(this.plan); }
}
const deferred = () => { let resolve,reject; const promise=new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; };
function session(requestPlan = async () => ({plan:createPlan('empathize'),mode:'ai',source:'ai'}),mode='demo') {
  const renderer = new Renderer();
  const controller = new SessionController({ renderer, requestPlan, mode });
  return {renderer,controller};
}
test('acknowledgement is not agreement; local paths skip fake processing', async () => {
  let requests=0;
  const {controller:c,renderer:r}=session(async()=>{requests++;},'ai');
  await c.submit('你好');
  assert.equal(c.plan.responseType,'acknowledge');
  r.finish(); assert.equal(c.plan.responseType,'greet'); assert.equal(requests,0);
  r.finish(); assert.equal(c.plan.responseType,'idle');
});
test('only an outstanding real request displays processing', async () => {
  const d=deferred(); const {controller:c,renderer:r}=session(()=>d.promise,'ai');
  const sent=c.submit('今天真是糟透了，我只想说说。');
  r.finish(); assert.equal(c.phase,'processing'); assert.equal(c.plan.responseType,'processing');
  d.resolve({plan:createPlan('empathize'),mode:'ai',source:'ai'}); await sent;
  assert.equal(c.plan.responseType,'empathize'); assert.equal(c.phase,'responding');
});
test('new input cancels old request and late replies cannot overwrite the light', async () => {
  const d=deferred(); let aborted;
  const {controller:c,renderer:r}=session((_,signal)=>{aborted=signal;return d.promise;},'ai');
  const old=c.submit('今天糟透了'); r.finish();
  await c.submit('停'); assert.equal(aborted.aborted,true); assert.equal(c.plan.responseType,'withdraw');
  d.resolve({plan:createPlan('celebrate'),mode:'ai'}); await old;
  assert.equal(c.plan.responseType,'withdraw');
});
test('thanks after withdrawal returns to stillness without resuming accompaniment', async () => {
  const {controller:c,renderer:r}=session();
  await c.submit('陪我待一会儿'); r.finish(); assert.equal(c.plan.responseType,'accompany');
  await c.submit('停'); assert.equal(c.plan.responseType,'withdraw'); r.finish();
  await c.submit('谢谢'); r.finish(); assert.equal(c.plan.responseType,'receive_thanks');
  const palette=c.plan.paletteFamily; r.finish();
  assert.equal(c.stableState,'withdraw'); assert.equal(c.plan.paletteFamily,palette);
  assert.notEqual(c.plan.responseType,'accompany');
  await c.submit('我回来了'); r.finish(); assert.equal(c.plan.responseType,'greet');
});
test('failed AI request has error gesture, retry path, and valid local continuation', async () => {
  const {controller:c,renderer:r}=session(async()=>{throw new Error('Offline');},'ai');
  await c.submit('我有点紧张，想缓一缓'); r.finish();
  assert.equal(c.plan.responseType,'error'); assert.equal(c.fallback.retryable,true);
  r.finish(); assert.equal(c.plan.responseType,'soothe'); assert.equal(c.source,'demo');
});
test('New moment invalidates requests and clears preferences, notes and session scenes', async () => {
  const d=deferred(); const {controller:c,renderer:r}=session(()=>d.promise,'ai');
  await c.submit('不要蓝色'); c.saveScene(); c.recordFeedback('like','Gentle');
  const pending=c.submit('今天难过'); r.finish();
  c.reset(); assert.equal(c.history.length,0); assert.deepEqual(c.preferences.avoidedColors,[]);
  assert.equal(c.savedScenes.length,0); assert.equal(c.feedback.length,0); assert.equal(c.plan.responseType,'idle');
  d.resolve({plan:createPlan('celebrate'),mode:'ai'}); await pending;
  assert.equal(c.plan.responseType,'idle'); assert.equal(c.lastText,'');
});
test('empty or oversized submissions do not interrupt a valid scene', async () => {
  const {controller:c}=session(); const before=c.plan;
  assert.equal(await c.submit('   '),false); assert.equal(await c.submit('a'.repeat(2001)),false);
  assert.equal(c.plan,before); assert.equal(c.history.length,0);
});
test('pause is a renderer choice; valid network responses still arrive', async () => {
  const d=deferred(); const {controller:c,renderer:r}=session(()=>d.promise,'ai');
  const sent=c.submit('今天有点难过'); r.finish(); c.setPaused(true);
  d.resolve({plan:createPlan('empathize'),mode:'ai'}); await sent;
  assert.equal(c.plan.responseType,'empathize'); assert.equal(c.paused,true); assert.equal(r.paused,true);
  c.setPaused(false); assert.equal(r.paused,false);
});
test('slower and avoided colors persist into subsequent requests; exports exclude transcript', async () => {
  const {controller:c,renderer:r}=session();
  await c.submit('刚才太活跃了，慢一点'); assert.ok(c.preferences.speedScale<1);
  await c.submit('我不喜欢蓝色'); assert.ok(c.preferences.avoidedColors.includes('blue'));
  await c.submit('陪我待一会儿'); r.finish(); assert.ok(c.plan.speed<0.22);
  c.saveScene(); c.recordFeedback('change','slower');
  assert.ok(!JSON.stringify(c.savedScenes).includes('陪我待一会儿'));
  assert.ok(!JSON.stringify(c.feedback).includes('我不喜欢蓝色'));
});

test('mode changes never restart a completed withdrawal or retain a stale retry banner', async () => {
  const {controller:c,renderer:r}=session();
  await c.submit('停'); r.finish();
  c.fallback={retryable:true}; c.setMode('ai');
  assert.equal(c.plan.motionPrimitive,'hold'); assert.equal(c.plan.loop,true);
  assert.equal(c.fallback,null); assert.equal(c.stableState,'withdraw');
});
test('repair respects scaled motion when returning to company and changing mode', async () => {
  const {controller:c,renderer:r}=session();
  await c.submit('陪我待一会儿'); r.finish();
  await c.submit('慢一点'); r.finish();
  const speed=c.plan.speed;
  assert.equal(c.plan.responseType,'accompany'); assert.ok(speed<0.22);
  c.setMode('ai'); assert.equal(c.plan.speed,speed);
});

test('color repair visibly replaces a kept palette and persists through closure and later AI', async () => {
  let requests=0;
  const {controller:c,renderer:r}=session(async()=>{requests++; return {plan:createPlan('celebrate',{paletteFamily:'mist_blue'}),mode:'ai',source:'ai'};},'ai');
  const original=r.colors.map(color=>[...color]);
  await c.submit('保持现在的颜色'); r.finish(); r.finish();
  await c.submit('不要这个颜色');
  assert.equal(c.plan.responseType,'repair'); assert.equal(c.source,'local_rule');
  assert.equal(c.preferences.lockedPalette,null);
  assert.notDeepEqual(r.colors,original);
  assert.deepEqual(r.colors,selectPalette(c.plan,c.preferences));
  const rejected=[...c.preferences.rejectedPalettes];
  r.finish(); assert.ok(!rejected.includes(c.plan.paletteFamily));
  await c.submit('不要蓝色改成粉色，慢一点');
  assert.equal(c.plan.responseType,'repair');
  assert.ok(c.preferences.speedScale<1);
  assert.ok(r.colors.every(color=>colorGroup(color)==='pink'));
  const kept=c.plan.paletteFamily;
  r.finish();
  await c.submit('今天很开心'); r.finish();
  assert.equal(requests,1,'explicit color commands skip the AI, later emotional sharing uses it');
  assert.equal(c.plan.paletteFamily,kept);
  assert.ok(r.colors.every(color=>colorGroup(color)==='pink'));
  c.reset(); assert.deepEqual(c.preferences.rejectedPalettes,[]); assert.equal(c.preferences.lockedPalette,null);
});

test('latest color correction aborts an older AI response before it can restore old colors', async () => {
  const d=deferred(); const {controller:c,renderer:r}=session(()=>d.promise,'ai');
  const previous=c.submit('今天过得怎么样呢'); r.finish();
  await c.submit('换成蓝色');
  assert.ok(r.colors.every(color=>colorGroup(color)==='blue'));
  d.resolve({plan:createPlan('empathize',{paletteFamily:'rose_lavender'}),source:'ai',mode:'ai'}); await previous;
  assert.ok(r.colors.every(color=>colorGroup(color)==='blue'));
  assert.equal(c.plan.responseType,'repair');
});

test('manual color preview replaces an old lock while restoring a saved scene preserves its preferences', async () => {
  const {controller:c,renderer:r}=session();
  await c.submit('换成蓝色'); c.saveScene();
  const savedPreferences=structuredClone(c.preferences);
  c.preview(createPlan('soothe',{paletteFamily:'named_pink'}));
  assert.equal(c.plan.paletteFamily,'named_pink'); assert.equal(c.preferences.lockedPalette,null);
  assert.ok(r.colors.every(color=>colorGroup(color)==='pink'));
  await c.submit('不要这个颜色');
  assert.ok(c.preferences.rejectedPalettes.includes('named_pink'));
  assert.notEqual(c.plan.paletteFamily,'named_pink');
  c.restoreScene(0);
  assert.deepEqual(c.preferences,savedPreferences);
  assert.ok(r.colors.every(color=>colorGroup(color)==='blue'));
});
