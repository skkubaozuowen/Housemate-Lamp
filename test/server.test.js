import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { createServer } from '../server.js';
import { CATALOG, createPlan } from '../public/lib/catalog.js';
import { validatePlan } from '../public/lib/planner.js';
import { selectPalette, colorGroup } from '../public/lib/palettes.js';

async function fixture(t, options = {}) {
  const server = createServer(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = (body, headers = {}) => fetch(`${origin}/api/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return { origin, post };
}
const completed = plan => ({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(plan) }] }] }) });

test('config exposes only availability and missing-key path is explicit, fully usable demo', async t => {
  let networkCalls = 0;
  const { origin, post } = await fixture(t, { keyProvider: async () => '', fetchImpl: () => { networkCalls++; } });
  assert.deepEqual(await (await fetch(`${origin}/api/config`)).json(), { aiAvailable: false });
  const result = await (await post({ text: 'Stay with me', mode: 'ai' })).json();
  assert.equal(result.mode, 'demo'); assert.equal(result.source, 'demo'); assert.equal(result.reason, 'unconfigured');
  assert.equal(result.plan.responseType, 'accompany'); assert.ok(validatePlan(result.plan)); assert.equal(networkCalls, 0);
  assert.equal((await fetch(`${origin}/?research=1`)).status, 200);
  assert.equal((await fetch(`${origin}/API%20Key.txt`)).status, 404);
});

test('explicit demo and priority boundaries never call AI', async t => {
  let networkCalls = 0;
  const { post } = await fixture(t, { keyProvider: async () => 'test-key', fetchImpl: () => { networkCalls++; } });
  const demo = await (await post({ text: 'Today was awful', mode: 'demo' })).json();
  assert.equal(demo.mode, 'demo'); assert.equal(demo.plan.responseType, 'empathize');
  const local = await (await post({ text: 'I am nervous, but leave me alone', mode: 'ai' })).json();
  assert.equal(local.source, 'local_rule'); assert.equal(local.plan.responseType, 'withdraw'); assert.equal(networkCalls, 0);
});

test('AI returns only a constrained plan and sends no persistent-storage request', async t => {
  let upstreamBody;
  const { origin, post } = await fixture(t, { keyProvider: async () => 'test-key', fetchImpl: async (_url, options) => { upstreamBody = JSON.parse(options.body); return completed(createPlan('empathize', { seed: 42 })); } });
  assert.deepEqual(await (await fetch(`${origin}/api/config`)).json(), { aiAvailable: true });
  const response = await post({ text: 'Today was hard and I want to share', mode: 'ai' });
  const result = await response.json();
  assert.equal(result.mode, 'ai'); assert.equal(result.source, 'ai'); assert.ok(validatePlan(result.plan)); assert.equal(result.plan.seed, 42);
  assert.equal(upstreamBody.store, false); assert.equal(upstreamBody.text.format.strict, true); assert.equal(upstreamBody.text.format.type, 'json_schema');
  assert.equal(JSON.stringify(result).includes('test-key'), false);
});

test('rejected, malformed, incomplete and refused AI outputs give retryable local plans', async t => {
  const upstreams = [
    { ok: false, json: async () => ({ error: { message: 'test-key' } }) },
    { ok: true, json: async () => ({ status: 'incomplete', output: [] }) },
    { ok: true, json: async () => ({ status: 'completed', output: [{content:[{type:'refusal',refusal:'no'}]}] }) },
    completed({ responseType: 'invalid' }),
    { ok: true, json: async () => { throw new Error('test-key'); } },
    completed(createPlan('affirm'))
  ];
  const { post } = await fixture(t, { keyProvider: async () => 'test-key', fetchImpl: async () => upstreams.shift() });
  for (let i = 0; i < 6; i++) {
    const response = await post({ text: 'I am useless', mode: 'ai' });
    const result = await response.json();
    assert.equal(response.status, 200); assert.equal(result.mode, 'demo'); assert.equal(result.source, 'demo'); assert.equal(result.retryable, true);
    assert.equal(result.reason, i === 0 ? 'unavailable' : 'invalid_output'); assert.equal(result.plan.responseType, 'empathize');
    assert.equal(JSON.stringify(result).includes('test-key'), false);
  }
});

test('deadline prevents a stalled request from keeping the light in processing', async t => {
  let signal;
  const { post } = await fixture(t, { timeoutMs: 25, keyProvider: async () => 'test-key', fetchImpl: async (_url, options) => { signal = options.signal; return new Promise(() => {}); } });
  const result = await (await post({ text: 'I feel sad', mode: 'ai' })).json();
  assert.equal(result.reason, 'timeout'); assert.equal(result.mode, 'demo'); assert.equal(result.retryable, true); assert.equal(signal.aborted, true); assert.ok(validatePlan(result.plan));
});

test('client disconnect aborts the pending upstream request', async t => {
  let started;
  let aborted;
  const didStart = new Promise(resolve => { started = resolve; });
  const didAbort = new Promise(resolve => { aborted = resolve; });
  const { origin } = await fixture(t, { keyProvider: async () => 'test-key', fetchImpl: async (_url, options) => {
    started();
    options.signal.addEventListener('abort', aborted, { once: true });
    return new Promise(() => {});
  } });
  const request = http.request(`${origin}/api/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin } });
  request.on('error', () => {});
  request.end(JSON.stringify({ text: 'Today was awful', mode: 'ai' }));
  await didStart;
  request.destroy();
  await Promise.race([didAbort, new Promise((_resolve, reject) => setTimeout(() => reject(new Error('Upstream was not aborted')), 500).unref())]);
});

test('transport errors are replaced with safe local fallback without exposing upstream text', async t => {
  const { post } = await fixture(t, { keyProvider: async () => 'test-key', fetchImpl: async () => { throw new Error('test-key upstream raw details'); } });
  const result = await (await post({ text: 'Today was awful', mode: 'ai' })).json();
  assert.equal(result.reason, 'unavailable');
  assert.equal(result.plan.responseType, 'empathize');
  assert.equal(JSON.stringify(result).includes('test-key'), false);
});

test('origin, input and size are validated before the AI request', async t => {
  const { post } = await fixture(t, { keyProvider: async () => '' });
  assert.equal((await post({ text: 'hello' }, { Origin: 'https://other.example' })).status, 403);
  for (const body of [{text:' '},{text:'x'.repeat(2001)},{text:'hello',mode:'other'},{text:'hello',history:[{role:'assistant',content:'bad'}]}, '{bad']) assert.equal((await post(body)).status, 400);
  assert.equal((await post('x'.repeat(100001))).status, 413);
});

test('AI suggestions retain catalog shape, closure and finite gesture timing', async t => {
  const { post } = await fixture(t, { keyProvider: async () => 'test-key', fetchImpl: async () => completed(createPlan('empathize', { motionPrimitive:'hold',durationMs:20000,nextState:'accompany',loop:true,seed:10 })) });
  const result = await (await post({text:'Today was hard and I want to share',mode:'ai'})).json();
  assert.equal(result.mode,'ai'); assert.equal(result.plan.motionPrimitive,'blend');
  assert.equal(result.plan.loop,false); assert.equal(result.plan.nextState,'hold');
  assert.ok(result.plan.durationMs<=6500);
});

test('HTTP color corrections supersede locks and compose bans, target hue and motion without AI', async t => {
  let upstreamCalls=0;
  const {post}=await fixture(t,{keyProvider:async()=>'test-key',fetchImpl:async()=>{upstreamCalls++; throw new Error('Color commands must stay local');}});
  const currentPlan=createPlan('accompany',{paletteFamily:'mist_blue',paletteVariant:'balanced',colorCount:3,seed:12});
  const preferences={lockedPalette:{paletteFamily:'mist_blue',paletteVariant:'balanced',colorCount:3}};
  const rejected=await (await post({text:'不要这个颜色',mode:'ai',context:{currentPlan,preferences,stableState:'accompany'}})).json();
  assert.equal(rejected.source,'local_rule'); assert.equal(rejected.plan.responseType,'repair');
  assert.equal(rejected.preferences.lockedPalette,null);
  assert.notDeepEqual(selectPalette(rejected.plan,rejected.preferences),selectPalette(currentPlan,preferences));
  const pink=await (await post({text:'不要蓝色改成粉色，慢一点',mode:'ai',context:{currentPlan,preferences,stableState:'accompany'}})).json();
  assert.deepEqual(pink.preferences.avoidedColors,['blue']);
  assert.ok(pink.preferences.speedScale<1);
  assert.ok(selectPalette(pink.plan,pink.preferences).every(color=>colorGroup(color)==='pink'));
  assert.ok(validatePlan(pink.plan)); assert.equal(upstreamCalls,0);
});

test('AI emotional themes replace temporary colors even when model history suggests keeping the old hue', async t => {
  let responseType='celebrate',sentBody;
  const {post}=await fixture(t,{keyProvider:async()=>'test-key',fetchImpl:async(_url,options)=>{
    sentBody=JSON.parse(options.body);
    return completed(createPlan(responseType,{paletteFamily:'named_blue',paletteVariant:'misted',colorCount:1}));
  }});
  const blue=await (await post({text:'想要蓝色',mode:'ai'})).json();
  assert.equal(blue.plan.paletteFamily,'named_blue'); assert.equal(blue.preferences.lockedPalette,null);
  const context={currentPlan:blue.plan,preferences:blue.preferences,stableState:'idle'};
  for(const type of ['celebrate','empathize','soothe','encourage','accompany']) {
    responseType=type;
    const result=await (await post({text:'A new moment to share.',mode:'ai',context,history:[{role:'user',content:'想要蓝色'}]})).json();
    assert.equal(result.source,'ai'); assert.equal(result.plan.paletteFamily,CATALOG[type].paletteFamily,type);
    assert.equal(result.plan.paletteVariant,'balanced'); assert.equal(result.plan.colorCount,3);
    assert.equal(result.preferences.lockedPalette,null);
  }
  assert.ok(sentBody.input.some(item=>item.content==='想要蓝色'),'useful history is retained; it cannot silently lock a palette');
  responseType='celebrate';
  const kept=await (await post({text:'保持这个颜色',mode:'ai',context})).json();
  const locked=await (await post({text:'我很开心',mode:'ai',context:{currentPlan:kept.plan,preferences:kept.preferences,stableState:'idle'}})).json();
  assert.equal(locked.plan.paletteFamily,'named_blue','only explicit Keep persists into the new emotion');
});
