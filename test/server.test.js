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
  assert.equal(result.plan.responseType, 'rest'); assert.equal(result.plan.loop,true); assert.equal(result.plan.nextState,'accompany'); assert.ok(validatePlan(result.plan)); assert.equal(networkCalls, 0);
  assert.equal((await fetch(`${origin}/?research=1`)).status, 200);
  assert.equal((await fetch(`${origin}/API%20Key.txt`)).status, 404);
});

test('Dino browser modules are served by the static allowlist without exposing server files', async t => {
  const { origin } = await fixture(t, { keyProvider:async () => '' });
  for (const name of ['speech','dino-voice','voice-audio']) {
    const response = await fetch(`${origin}/lib/${name}.js`);
    assert.equal(response.status, 200, name);
    assert.match(response.headers.get('content-type'), /^text\/javascript; charset=utf-8$/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok((await response.text()).trim().length > 0);
  }
  for (const path of ['/server.js','/response-api.js','/lib/not-allowlisted.js']) assert.equal((await fetch(`${origin}${path}`)).status, 404);
});

test('explicit demo and priority boundaries never call AI', async t => {
  let networkCalls = 0;
  const { post } = await fixture(t, { keyProvider: async () => 'test-key', fetchImpl: () => { networkCalls++; } });
  const demo = await (await post({ text: 'Today was awful', mode: 'demo' })).json();
  assert.equal(demo.mode, 'demo'); assert.equal(demo.plan.responseType, 'setback');
  const local = await (await post({ text: 'I am nervous, but leave me alone', mode: 'ai' })).json();
  assert.equal(local.source, 'local_rule'); assert.equal(local.plan.responseType, 'withdraw'); assert.equal(networkCalls, 0);
});

test('AI returns only a constrained plan and sends no persistent-storage request', async t => {
  let upstreamBody;
  const { origin, post } = await fixture(t, { keyProvider: async () => 'test-key', fetchImpl: async (_url, options) => { upstreamBody = JSON.parse(options.body); return completed(createPlan('setback', { seed: 42 })); } });
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
    assert.equal(result.reason, i === 0 ? 'unavailable' : 'invalid_output'); assert.equal(result.plan.responseType, 'setback');
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
  assert.equal(result.plan.responseType, 'setback');
  assert.equal(JSON.stringify(result).includes('test-key'), false);
});

test('origin, input and size are validated before the AI request', async t => {
  const { post } = await fixture(t, { keyProvider: async () => '' });
  assert.equal((await post({ text: 'hello' }, { Origin: 'https://other.example' })).status, 403);
  for (const body of [{text:' '},{text:'x'.repeat(2001)},{text:'hello',mode:'other'},{text:'hello',history:[{role:'assistant',content:'bad'}]}, '{bad']) assert.equal((await post(body)).status, 400);
  assert.equal((await post('x'.repeat(100001))).status, 413);
});

test('AI suggestions retain catalog shape, closure and finite gesture timing', async t => {
  const { post } = await fixture(t, { keyProvider: async () => 'test-key', fetchImpl: async () => completed(createPlan('setback', { motionPrimitive:'hold',durationMs:20000,nextState:'accompany',loop:true,seed:10 })) });
  const result = await (await post({text:'Today was hard and I want to share',mode:'ai'})).json();
  assert.equal(result.mode,'ai'); assert.equal(result.plan.responseType,'setback');
  assert.equal(result.plan.motionPrimitive,CATALOG.setback.motionPrimitive);
  assert.equal(result.plan.loop,false); assert.equal(result.plan.nextState,'hold');
  assert.ok(result.plan.durationMs >= CATALOG.setback.durationMs * .75);
  assert.ok(result.plan.durationMs <= CATALOG.setback.durationMs * 1.25);
});

test('HTTP color corrections supersede locks and compose bans, target hue and motion without AI', async t => {
  let upstreamCalls=0;
  const {post}=await fixture(t,{keyProvider:async()=>'test-key',fetchImpl:async()=>{upstreamCalls++; throw new Error('Color commands must stay local');}});
  const currentPlan=createPlan('rest',{paletteFamily:'mist_blue',paletteVariant:'balanced',colorCount:3,seed:12,loop:true,nextState:'accompany'});
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
  for(const [type,text] of [
    ['celebrate','今天很开心'], ['setback','今天我好伤心'], ['rest','今天累了一整天，想休息'],
    ['upcoming','明天发表，好紧张啊'], ['mixed','今天生日很开心，但也有点孤单'], ['everyday','今天晚饭吃了面条']
  ]) {
    responseType=type;
    const result=await (await post({text,mode:'ai',context,history:[{role:'user',content:'想要蓝色'}]})).json();
    assert.equal(result.source,'ai'); assert.equal(result.plan.paletteFamily,CATALOG[type].paletteFamily,type);
    assert.equal(result.plan.paletteVariant,'balanced'); assert.equal(result.plan.colorCount,['mixed','upcoming'].includes(type)?4:3);
    assert.equal(result.preferences.lockedPalette,null);
  }
  assert.ok(sentBody.input.some(item=>item.content==='想要蓝色'),'useful history is retained; it cannot silently lock a palette');
  responseType='celebrate';
  const kept=await (await post({text:'保持这个颜色',mode:'ai',context})).json();
  const locked=await (await post({text:'我很开心',mode:'ai',context:{currentPlan:kept.plan,preferences:kept.preferences,stableState:'idle'}})).json();
  assert.equal(locked.plan.paletteFamily,'named_blue','only explicit Keep persists into the new emotion');
});


test('remote legacy relationship names are not silently reintroduced into the six-scenario repertoire', async t => {
  const oldTypes=['empathize','accompany','soothe','encourage'];
  const {post}=await fixture(t,{keyProvider:async()=>'test-key',fetchImpl:async()=>completed(createPlan(oldTypes.shift()))});
  for(let i=0;i<4;i++) {
    const result=await (await post({text:'今天我好伤心，事情没有成功。',mode:'ai'})).json();
    assert.equal(result.source,'demo');
    assert.equal(result.reason,'invalid_output');
    assert.equal(result.retryable,true);
    assert.equal(result.plan.responseType,'setback');
    assert.equal(result.plan.expression,'default');
  }
});

test('known tense-event meaning survives a remote celebration suggestion and uses the common S04 design', async t => {
  const {post}=await fixture(t,{keyProvider:async()=>'test-key',fetchImpl:async()=>completed(createPlan('celebrate',{
    expression:'quiet',paletteFamily:'named_blue',paletteVariant:'misted',durationMs:20000,loop:true,nextState:'accompany',colorCount:1
  }))});
  const result=await (await post({text:'明天发表，好紧张啊。',mode:'ai'})).json();
  assert.equal(result.source,'ai');
  assert.equal(result.plan.responseType,'upcoming');
  assert.equal(result.plan.expression,'default');
  assert.equal(result.plan.paletteFamily,'horizon_glow');
  assert.equal(result.plan.paletteVariant,'balanced');
  assert.equal(result.plan.colorCount,4);
  assert.equal(result.plan.durationMs,12000);
  assert.equal(result.plan.motionPrimitive,CATALOG.upcoming.motionPrimitive);
  assert.equal(result.plan.nextState,'hold');
  assert.equal(result.plan.loop,false);
  assert.ok(validatePlan(result.plan));
});

test('a generic first-person narrative does not force ordinary sharing over the AI interpretation', async t => {
  const {post}=await fixture(t,{keyProvider:async()=>'test-key',fetchImpl:async()=>completed(createPlan('setback',{seed:93}))});
  for(const text of ['I feel like an empty room after everyone left.','我像一间人都走光的空屋子。']) {
    const result=await (await post({text,mode:'ai'})).json();
    assert.equal(result.source,'ai');
    assert.equal(result.plan.responseType,'setback');
    assert.equal(result.plan.paletteFamily,'dusk_indigo');
  }
});

test('ordinary activity keywords do not suppress the AI interpretation of an unfamiliar emotional narrative', async t => {
  let body;
  const {post}=await fixture(t,{keyProvider:async()=>'test-key',fetchImpl:async(_url,options)=>{
    body=JSON.parse(options.body);
    return completed(createPlan('setback',{seed:93}));
  }});
  for(const text of ['今天吃了饭，心里却空空的。','I had lunch but the room felt empty without them.','오늘 점심은 먹었는데 마음 한구석이 텅 빈 느낌이야.']) {
    const result=await (await post({text,mode:'ai'})).json();
    assert.equal(result.source,'ai');
    assert.equal(result.plan.responseType,'setback',text);
    const interpretation=JSON.parse(body.input.at(-1).content);
    assert.equal(interpretation.localSuggestion.responseType,'everyday',text);
    assert.equal(interpretation.localUnderstood,false,'the local fallback is provisional');
  }
});

test('S04 is reserved for nervousness or courage; anticipation, neutral dates and bad luck retain their separate meanings', async t => {
  const {post}=await fixture(t,{keyProvider:async()=>'test-key',fetchImpl:async()=>completed(createPlan('upcoming'))});
  for(const [text,type] of [
    ['明天有面试，好期待。','celebrate'], ['I am looking forward to tomorrow.','celebrate'], ['내일이 기대돼.','celebrate'],
    ['我明天要发表。','everyday'], ['I have a presentation tomorrow.','everyday'], ['내일 발표가 있어.','everyday'],
    ['我好倒霉，下雨了。','setback'], ['Bad luck, my walk was ruined by the rain.','setback'], ['비가 와서 짜증나.','setback'],
    ['明天发表，好紧张啊。','upcoming'], ['Please give me some courage.','upcoming']
  ]) {
    const result=await (await post({text,mode:'ai'})).json();
    assert.equal(result.source,'ai');
    assert.equal(result.plan.responseType,type,text);
    assert.equal(result.plan.paletteFamily,CATALOG[type].paletteFamily,text);
    assert.equal(result.plan.expression,'default',text);
    assert.ok(validatePlan(result.plan),text);
  }
});


test('positive future events are good-news scenes while explicit sadness and mixed feelings keep their own meanings', async t => {
  const {post}=await fixture(t,{keyProvider:async()=>'test-key',fetchImpl:async()=>completed(createPlan('upcoming',{expression:'anticipation'}))});
  for(const [text,type] of [
    ['明天是我生日。','celebrate'], ['Tomorrow is my birthday.','celebrate'], ['내일 제 생일이에요.','celebrate'],
    ['I got the job and start tomorrow.','celebrate'], ['明天去领毕业证。','celebrate'], ['내일 드디어 졸업해.','celebrate'],
    ['明天生日，但我一点也不开心。','setback'], ['明天生日很开心，但也有点孤单。','mixed']
  ]) {
    const result=await (await post({text,mode:'ai'})).json();
    assert.equal(result.source,'ai');
    assert.equal(result.plan.responseType,type,text);
    assert.equal(result.plan.paletteFamily,CATALOG[type].paletteFamily,text);
    assert.equal(result.plan.colorCount,type==='mixed'?4:3);
    assert.ok(validatePlan(result.plan));
  }
});

test('explicit happiness while alone stays celebration even when AI suggests a mixed birthday', async t => {
  const {post}=await fixture(t,{keyProvider:async()=>'test-key',fetchImpl:async()=>completed(createPlan('mixed',{
    feelingPrimary:'sadness',feelingSecondary:'joy',feelingBalance:.8
  }))});
  for (const text of ['虽然一个人过生日，但我真的很开心。', "It is my birthday, nobody is here but I am really happy.", '생일인데 혼자지만 그래도 행복해']) {
    const result=await (await post({text,mode:'ai'})).json();
    assert.equal(result.plan.responseType,'celebrate',text);
    assert.equal(result.plan.feelingSecondary,'none');
    assert.equal(result.plan.paletteFamily,'apricot_rose');
  }
});

test('AI mixed feeling choice and visual balance survive catalog construction and a temporary previous color', async t => {
  const {post}=await fixture(t,{keyProvider:async()=>'test-key',fetchImpl:async()=>completed(createPlan('mixed',{
    feelingPrimary:'joy',feelingSecondary:'sadness',feelingBalance:.8,
    paletteFamily:'named_blue',motionPrimitive:'hold',durationMs:20000,loop:true
  }))});
  const result=await (await post({text:'生日很开心，但也有点孤单。',mode:'ai',context:{currentPlan:createPlan('repair',{paletteFamily:'named_blue'})}})).json();
  assert.equal(result.source,'ai');
  assert.equal(result.plan.responseType,'mixed');
  assert.deepEqual([result.plan.feelingPrimary,result.plan.feelingSecondary,result.plan.feelingBalance],['joy','sadness',.8]);
  assert.equal(result.plan.paletteFamily,'mixed_warm_cool');
  assert.equal(result.plan.motionPrimitive,CATALOG.mixed.motionPrimitive);
  assert.equal(result.plan.loop,false);
  assert.ok(validatePlan(result.plan));
});

test('birthday solitude without expressed affect remains open to contextual AI interpretation', async t => {
  let type='mixed';
  const {post}=await fixture(t,{keyProvider:async()=>'test-key',fetchImpl:async()=>completed(createPlan(type))});
  const mixed=await (await post({text:'我生日了但是是一个人。',mode:'ai'})).json();
  assert.equal(mixed.plan.responseType,'mixed','the local birthday word does not suppress contextual interpretation');
  type='celebrate';
  const quiet=await (await post({text:'今天生日，一个人过。',mode:'ai'})).json();
  assert.equal(quiet.plan.responseType,'celebrate','being alone does not force a sadness region');
});

test('ordinary anticipation and worry retain S04 even if upstream overuses mixed feelings', async t => {
  const {post}=await fixture(t,{keyProvider:async()=>'test-key',fetchImpl:async()=>completed(createPlan('mixed',{
    feelingPrimary:'hope',feelingSecondary:'anxiety',feelingBalance:.65
  }))});
  const result=await (await post({text:'对新的工作有些期待，也担心自己适应不了',mode:'ai'})).json();
  assert.equal(result.source,'ai');
  assert.equal(result.plan.responseType,'upcoming');
  assert.equal(result.plan.expression,'default');
  assert.equal(result.plan.feelingSecondary,'none');
  assert.equal(result.plan.paletteFamily,CATALOG.upcoming.paletteFamily);
});

test('explicit open complexity survives an upstream invented emotion pair without asserting those emotions', async t => {
  let body;
  const {post}=await fixture(t,{keyProvider:async()=>'test-key',fetchImpl:async(_url,options)=>{
    body=JSON.parse(options.body);
    return completed(createPlan('mixed',{mixedMode:'paired',feelingPrimary:'anger',feelingSecondary:'anxiety',feelingBalance:.9}));
  }});
  const result=await(await post({text:'今天发生了好多事，心里五味杂陈，说不清是什么感觉。',mode:'ai'})).json();
  assert.equal(result.plan.responseType,'mixed');
  assert.equal(result.plan.mixedMode,'open');
  assert.equal(result.plan.feelingBalance,.5);
  assert.equal(result.plan.feelingTertiary,'none');
  assert.ok(validatePlan(result.plan));
  assert.ok(body.text.format.schema.required.includes('mixedMode'));
  assert.ok(body.text.format.schema.required.includes('feelingTertiary'));
});

test('three supported feelings survive server profiles and explicit palette locks', async t => {
  const {post}=await fixture(t,{keyProvider:async()=>'test-key',fetchImpl:async()=>completed(createPlan('mixed',{
    mixedMode:'layered',feelingPrimary:'joy',feelingSecondary:'sadness',feelingTertiary:'anxiety',feelingBalance:.5
  }))});
  const result=await(await post({text:'毕业让我开心，又舍不得朋友，还有点担心未来。',mode:'ai'})).json();
  assert.equal(result.plan.mixedMode,'layered');
  assert.equal(result.plan.feelingTertiary,'anxiety');
  const kept=await(await post({text:'保持这个颜色',mode:'ai',context:{currentPlan:result.plan}})).json();
  assert.equal(kept.preferences.lockedPalette.mixedMode,'layered');
  assert.equal(kept.preferences.lockedPalette.feelingTertiary,'anxiety');
  assert.equal(kept.plan.feelingTertiary,'anxiety');
});

test('unfamiliar narratives remain interpretable by AI including open or three-part complexity', async t => {
  const {post}=await fixture(t,{keyProvider:async()=>'test-key',fetchImpl:async()=>completed(createPlan('mixed',{
    mixedMode:'layered',feelingPrimary:'calm',feelingSecondary:'sadness',feelingTertiary:'hope',feelingBalance:.5
  }))});
  const result=await(await post({text:'把钥匙交给新住户的时候，我在门口站了很久。',mode:'ai'})).json();
  assert.equal(result.plan.responseType,'mixed');
  assert.equal(result.plan.mixedMode,'layered');
  assert.equal(result.plan.feelingTertiary,'hope');
});
