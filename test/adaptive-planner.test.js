import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPOSITION_DEFAULTS, COMPOSITION_LIMITS, COMPOSITION_SCHEMA, normalizeComposition, validateComposition } from '../public/lib/composition.js';
import { CATALOG, createPlan } from '../public/lib/catalog.js';
import { PLAN_SCHEMA, createScenePlan, normalizePlan, planLocal, validatePlan } from '../public/lib/planner.js';
import { extractPlan, requestPlan, PLAN_INSTRUCTIONS } from '../response-api.js';

const customComposition = () => ({ ...COMPOSITION_DEFAULTS, fieldScale:1.16, spread:1.12, waveWidth:1.2, waveCount:4, rippleCount:4, spotCount:6, accentScale:1.3, accentWeight:.8, stagger:1.2, supportDelay:.36, supportStrength:.72, elongation:1.15 });
const completed = plan => ({ status:'completed', output:[{ content:[{ type:'output_text', text:JSON.stringify(plan) }] }] });
async function remote(text, suggested, context = {}, local = planLocal(text, context)) {
  let request;
  const result = await requestPlan({ key:'test-key', model:'test-model', text, history:[], context, local, signal:new AbortController().signal,
    fetchImpl:async (_url, options) => { request=JSON.parse(options.body); return { ok:true, json:async()=>completed(suggested) }; }
  });
  return { ...result, request };
}

test('composition normalization is bounded, independent, finite and compatible with missing saved fields', () => {
  const a=createPlan('setback'), b=createPlan('setback');
  assert.deepEqual(a.composition, COMPOSITION_DEFAULTS);
  assert.notEqual(a.composition,b.composition);
  a.composition.waveCount=4;
  assert.equal(b.composition.waveCount,2);
  const normalized=normalizeComposition({ waveCount:30, spotCount:3.7, rippleCount:-10, fieldScale:Infinity, supportDelay:NaN, waveWidth:'1.3', unsupported:1 });
  assert.deepEqual(normalized,{ ...COMPOSITION_DEFAULTS,waveCount:4,spotCount:4,rippleCount:1 });
  assert.ok(validateComposition(normalized));
  assert.equal(Object.hasOwn(normalized,'unsupported'),false);
  const old={ ...b }; delete old.composition;
  assert.equal(validatePlan(old),false,'new model plans must be complete');
  assert.deepEqual(normalizePlan(old).composition,COMPOSITION_DEFAULTS,'old scene imports remain readable');
  assert.deepEqual(normalizePlan({},old).composition,COMPOSITION_DEFAULTS,'old fallback plans also remain usable');
});

test('the nested strict schema rejects unknown, missing, fractional-count and nonfinite values', () => {
  assert.equal(PLAN_SCHEMA.properties.composition,COMPOSITION_SCHEMA);
  assert.equal(COMPOSITION_SCHEMA.additionalProperties,false);
  assert.deepEqual(new Set(COMPOSITION_SCHEMA.required),new Set(Object.keys(COMPOSITION_DEFAULTS)));
  const plan=createPlan('rest');
  const incomplete={ ...plan.composition }; delete incomplete.stagger;
  for(const composition of [null,[],incomplete,{...plan.composition,unknown:1},{...plan.composition,waveCount:2.5},{...plan.composition,spread:Infinity},{...plan.composition,supportDelay:.9}]) {
    assert.equal(validateComposition(composition),false);
    assert.equal(validatePlan({...plan,composition}),false);
    assert.equal(extractPlan(completed({...plan,composition})),null);
    assert.ok(validatePlan(normalizePlan({...plan,composition})));
  }
  for(const [key,[minimum,maximum]] of Object.entries(COMPOSITION_LIMITS)) {
    assert.equal(validateComposition({...COMPOSITION_DEFAULTS,[key]:minimum}),true,key);
    assert.equal(validateComposition({...COMPOSITION_DEFAULTS,[key]:maximum}),true,key);
  }
});

test('real model orchestration survives profile construction without replacing the scene language', async () => {
  const proposed=createScenePlan('setback','default',{ seed:88, energy:.61, speed:.48, amplitude:.81, durationMs:12500, transitionMs:1300, composition:customComposition(), paletteFamily:'named_blue',motionPrimitive:'hold',loop:true,nextState:'withdraw' });
  const {plan,request}=await remote('我很难过，事情没有成功',proposed);
  for(const key of ['energy','speed','amplitude','durationMs','transitionMs','seed']) assert.equal(plan[key],proposed[key],key);
  assert.deepEqual(plan.composition,proposed.composition);
  assert.equal(plan.paletteFamily,'dusk_indigo');
  assert.equal(plan.motionPrimitive,CATALOG.setback.motionPrimitive);
  assert.equal(plan.loop,false);
  assert.equal(plan.nextState,'hold');
  assert.equal(request.store,false);
  assert.equal(request.text.format.strict,true);
});

test('same-family AI expressions are not permanently pinned to a local keyword variant', async () => {
  const cases=[
    ['今天终于完成了，挺满足','celebrate','quiet','default'],
    ['今天我很开心','celebrate','default','quiet'],
    ['今天事情没做好，我很难过','setback','default','renew'],
    ['很难受，但我想再试一次','setback','renew','default'],
    ['今天很累，但做完了很有成就感','rest','fulfilled','default']
  ];
  for(const [text,type,localExpression,modelExpression] of cases) {
    assert.equal(planLocal(text).plan.expression,localExpression,text);
    const {plan}=await remote(text,createScenePlan(type,modelExpression,{seed:3}));
    assert.equal(plan.responseType,type,text);
    assert.equal(plan.expression,modelExpression,text);
  }
});

test('S02 may support after receiving distress without a retry phrase, but a declined supportive turn stays receiving', async () => {
  assert.equal(planLocal('今天事情没做好，我很难过').plan.expression,'default');
  const {plan}=await remote('今天事情没做好，我很难过',createScenePlan('setback','renew',{speed:.29,energy:.4,amplitude:.62,durationMs:14500,composition:{supportDelay:.4,supportStrength:.6}}));
  assert.equal(plan.expression,'renew');
  assert.equal(plan.paletteFamily,'renewal_gold');
  assert.equal(plan.speed,.29,'distress need not become fast');
  assert.equal(plan.energy,.4,'support need not become high energy');
  assert.equal(plan.composition.supportDelay,.4);
  for(const text of ['我很难过，只想你听我说','I feel sad. Just listen, do not encourage me.']) {
    const declined=await remote(text,createScenePlan('setback','renew'));
    assert.equal(declined.plan.expression,'default',text);
    assert.equal(declined.plan.paletteFamily,'dusk_indigo',text);
  }
  assert.equal(planLocal('今天没做好，安慰我一下').plan.expression,'renew');
});

test('local explicit commands and boundaries take priority without model calls or duplicate preference scaling', async () => {
  const context={currentPlan:createPlan('celebrate'),preferences:{speedScale:.5,amplitudeScale:.8}};
  for(const text of ['我很难过，但让我一个人待着','想要蓝色','不要蓝色，改成粉色，慢一点']) {
    const local=planLocal(text,context);
    assert.equal(local.priority,true,text);
    const result=await remote(text,createScenePlan('setback','renew'),context,local);
    assert.equal(result.request,undefined,text);
    assert.deepEqual(result.plan,local.plan,text);
  }
});

test('recognized family boundaries and mixed feeling evidence survive a different model family', async () => {
  const nervous=await remote('明天发表，好紧张',createScenePlan('celebrate','default',{speed:1.9,energy:1,durationMs:400}));
  assert.equal(nervous.plan.responseType,'upcoming');
  assert.equal(nervous.plan.speed,CATALOG.upcoming.speed,'a conflicting party proposal cannot transfer its kinematics');
  const fulfilled=await remote('很累但很有成就感',createScenePlan('celebrate'));
  assert.equal(fulfilled.plan.responseType,'rest');
  assert.equal(fulfilled.plan.expression,'fulfilled');
  const open=await remote('心情复杂，说不清是开心还是难过',createScenePlan('mixed','bittersweet',{mixedMode:'paired',feelingPrimary:'joy',feelingSecondary:'anger'}));
  assert.equal(open.plan.mixedMode,'open');
  assert.equal(open.plan.feelingBalance,.5);
});

test('globally valid scene extremes are clamped to a native aesthetic envelope, invalid bounds are rejected', async () => {
  const proposed=createScenePlan('rest','default',{energy:1,speed:2,amplitude:1,durationMs:400,transitionMs:150,composition:customComposition()});
  const {plan}=await remote('今天真的很累',proposed);
  assert.deepEqual([plan.energy,plan.speed,plan.amplitude,plan.durationMs,plan.transitionMs],[.58,.46,.9,8000,900]);
  assert.equal(plan.composition.spotCount,5);
  for(const update of [{speed:2.1},{composition:{...proposed.composition,waveCount:5}},{composition:{...proposed.composition,stagger:NaN}}]) {
    const bad=await remote('今天真的很累',{...proposed,...update});
    assert.equal(bad.reason,'invalid_output');
  }
});

test('B01–B05 engine lifecycle and timing cannot inherit model scene orchestration', async () => {
  for(const type of ['greet','clarify','farewell']) {
    const proposed=createPlan(type,{speed:2,energy:1,amplitude:1,durationMs:20000,transitionMs:5000,loop:true,composition:customComposition()});
    const local={plan:createPlan('clarify'),preferences:{},understood:false,priority:false};
    const {plan}=await remote('xyz',proposed,{},local);
    for(const key of ['speed','energy','amplitude','durationMs','transitionMs','loop','nextState','requiresUserInput']) assert.equal(plan[key],CATALOG[type][key],`${type}:${key}`);
    assert.deepEqual(plan.composition,COMPOSITION_DEFAULTS);
  }
});

test('user speed, amplitude, hue locks and bans apply after model scene bounds', async () => {
  const suggested=createScenePlan('setback','renew',{speed:.5,amplitude:.8,durationMs:12000});
  const context={preferences:{speedScale:.5,amplitudeScale:.6,avoidedColors:['blue'],lockedPalette:{paletteFamily:'named_pink',paletteVariant:'balanced',colorCount:2}}};
  const {plan}=await remote('今天没做好，我很难过',suggested,context);
  assert.equal(plan.paletteFamily,'named_pink');
  assert.equal(plan.colorCount,2);
  assert.equal(plan.speed,.25);
  assert.equal(plan.amplitude,.48);
  assert.equal(plan.durationMs,20000,'explicit slower preference remains final within global safety bounds');
});


test('same-family curated palette variation survives while family, color budget and user locks retain authority', async () => {
  for(const paletteVariant of ['misted','balanced','accented']) {
    const suggested=createScenePlan('setback','default',{paletteVariant,paletteFamily:'named_blue',colorCount:1});
    const {plan}=await remote('今天没做好，我很难过',suggested);
    assert.equal(plan.paletteVariant,paletteVariant);
    assert.equal(plan.paletteFamily,'dusk_indigo','model variation cannot replace the scene family');
    assert.equal(plan.colorCount,3,'model variation cannot replace the scene color budget');
  }
  const suggested=createScenePlan('setback','default',{paletteVariant:'accented'});
  const context={preferences:{lockedPalette:{paletteFamily:'named_pink',paletteVariant:'misted',colorCount:2},avoidedColors:['blue']}};
  const {plan}=await remote('今天没做好，我很难过',suggested,context);
  assert.equal(plan.paletteVariant,'misted','explicit session lock remains final');
  assert.equal(plan.paletteFamily,'named_pink');
  assert.equal(plan.colorCount,2);
});


test('S02 prompt offers optional density references without flattening disclosure or treating intensity as speed', () => {
  const start=PLAN_INSTRUCTIONS.indexOf('setback / S02:');
  const end=PLAN_INSTRUCTIONS.indexOf('rest / S03:');
  const guidance=PLAN_INSTRUCTIONS.slice(start,end);
  for(const intent of [
    'not keyword mappings or fixed intensity thresholds',
    '1–2 broad waves and 2–3 sparse red-blue spots',
    '3–4 staggered waves and 4–7 red-blue spots',
    'it may still move slowly',
    'must not maximize every parameter',
    'does not automatically erase the expressed intensity',
    'Strong sadness need not copy the denser waves of anger'
  ]) assert.ok(guidance.includes(intent),intent);
});
