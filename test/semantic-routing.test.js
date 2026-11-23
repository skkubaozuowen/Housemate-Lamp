import test from 'node:test';
import assert from 'node:assert/strict';
import {requestPlan} from '../response-api.js';
import {CATALOG,createPlan} from '../public/lib/catalog.js';
import {createScenePlan,planLocal,validatePlan} from '../public/lib/planner.js';

const semanticPlan=(type,expression='default',overrides={})=>createScenePlan(type,expression,{seed:417,intensity:.6,...overrides});
const openPlan=()=>semanticPlan('mixed','bittersweet',{mixedMode:'open'});

// These are deterministic transport/normalization contracts with a mocked
// semantic interpretation, rather than claims about a live model's accuracy.
async function interpret(text,suggested,{hint,history=[],context={}}={}) {
  const session={currentPlan:createPlan('idle',{seed:9}),stableState:'idle',...context};
  const local=planLocal(text,session);
  if(hint) {
    local.plan=semanticPlan(hint.type,hint.expression||'default',hint.fields);
    local.understood=true;
  }
  assert.equal(local.priority,false,'semantic narratives reach the model');
  assert.ok(validatePlan(suggested),'the mocked model uses the same strict plan schema');
  let calls=0,body;
  const result=await requestPlan({key:'mock-key',model:'mock-model',text,history,context:session,local,
    fetchImpl:async(_url,options)=>{
      calls++;body=JSON.parse(options.body);
      return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(suggested)}]}]})};
    }});
  assert.equal(calls,1);assert.ok(result.plan,'a valid interpretation survives the service boundary');
  assert.ok(validatePlan(result.plan));
  assert.equal(result.plan.loop,false,'situational interpretations retain finite playback');
  assert.equal(result.plan.nextState,'idle');
  assert.ok(result.plan.durationMs>=10000&&result.plan.durationMs<=15000);
  assert.equal(result.plan.motionPrimitive,CATALOG[result.plan.responseType].motionPrimitive);
  const input=JSON.parse(body.input.at(-1).content);
  assert.equal(input.currentUserText,text);
  if(hint) {
    assert.equal(input.localUnderstood,true);
    assert.equal(input.localSuggestion.responseType,hint.type,'the test includes the conflicting understood local suggestion');
  }
  return {plan:result.plan,body,input};
}

test('birthday solitude can retain contextually intertwined feelings without an explicit happiness word',async()=>{
  const {plan}=await interpret('今天生日，却只有我一个人，有点孤独，心里说不出的滋味。',openPlan(),{hint:{type:'setback'}});
  assert.equal(plan.responseType,'mixed');assert.equal(plan.mixedMode,'open');
  assert.equal(plan.feelingBalance,.5);assert.equal(plan.feelingTertiary,'none');
});

test('a supported birthday contrast can use the model pair instead of the local setback family',async()=>{
  const suggested=semanticPlan('mixed','bittersweet',{mixedMode:'paired',feelingPrimary:'hope',feelingSecondary:'sadness',feelingBalance:.62});
  const {plan}=await interpret('期待了好久的生日到了，可是只能一个人过，也有点孤独。',suggested,{hint:{type:'setback'}});
  assert.equal(plan.responseType,'mixed');assert.equal(plan.mixedMode,'paired');
  assert.equal(plan.feelingPrimary,'hope');assert.equal(plan.feelingSecondary,'sadness');assert.equal(plan.feelingBalance,.62);
});

test('receiving an offer with an empty feeling may override a local good-news suggestion',async()=>{
  const {plan}=await interpret('终于收到了录取通知，但心里空落落的，说不清是什么滋味。',openPlan(),{hint:{type:'celebrate'}});
  assert.equal(plan.responseType,'mixed');assert.equal(plan.mixedMode,'open');
});

test('quoted distress is not forced into the local sadness family when the current speaker is only reporting it',async()=>{
  const {plan}=await interpret('她说“我今天特别难过”，我只是转述一下，我自己现在没什么特别的感觉。',semanticPlan('everyday'),{hint:{type:'setback'}});
  assert.equal(plan.responseType,'everyday');
});

test('negated current tiredness can replace a stale rest suggestion with neutral sharing',async()=>{
  const {plan}=await interpret('其实我现在并不累，只是说起昨天加班的事情。',semanticPlan('everyday'),{hint:{type:'rest'}});
  assert.equal(plan.responseType,'everyday');assert.equal(plan.expression,'default');
});

test('past sadness does not override the currently expressed positive anticipation',async()=>{
  const {plan}=await interpret('以前这件事让我很难过，现在放下了，很期待明天的新开始。',semanticPlan('celebrate'),{hint:{type:'setback'}});
  assert.equal(plan.responseType,'celebrate');
});

test('pressure after an already completed setback remains receiving rather than becoming a future challenge',async()=>{
  const {plan}=await interpret('刚才事情已经弄砸了，真烦，压力一下子上来了。',semanticPlan('setback'),{hint:{type:'upcoming'}});
  assert.equal(plan.responseType,'setback');assert.equal(plan.expression,'default');
});

test('fatigue with fulfilment retains the single rest-family fulfilled expression',async()=>{
  const {plan}=await interpret('今天很累，但做完任务很满足。',semanticPlan('rest','fulfilled'));
  assert.equal(plan.responseType,'rest');assert.equal(plan.expression,'fulfilled');
  assert.equal(plan.paletteFamily,'rest_glow');
});

test('ordinary anticipation plus presentation tension can remain one encouragement gesture',async()=>{
  const {plan}=await interpret('明天发表，很期待，也有点紧张。',semanticPlan('upcoming'));
  assert.equal(plan.responseType,'upcoming');assert.equal(plan.expression,'default');
  assert.equal(plan.paletteFamily,'horizon_glow');
});

test('a neutral future plan has no invented nervousness or emotional mixture',async()=>{
  const {plan}=await interpret('明天去超市买点菜。',semanticPlan('everyday'));
  assert.equal(plan.responseType,'everyday');assert.equal(plan.feelingSecondary,'none');
});

test('explicit happiness while alone can stay celebratory rather than inferring a second feeling from solitude',async()=>{
  const {plan}=await interpret('虽然一个人过生日，但我真的很开心。',semanticPlan('celebrate'));
  assert.equal(plan.responseType,'celebrate');assert.equal(plan.feelingSecondary,'none');
});

test('current unnamed complexity keeps the open non-diagnostic composition instead of accepting invented named feelings',async()=>{
  const text='今天心情很复杂，具体是什么感觉，我说不清。';
  const local=planLocal(text);assert.equal(local.plan.responseType,'mixed');assert.equal(local.plan.mixedMode,'open');assert.equal(local.understood,true);
  const named=semanticPlan('mixed','bittersweet',{mixedMode:'paired',feelingPrimary:'anger',feelingSecondary:'hope',feelingBalance:.85});
  const {plan}=await interpret(text,named);
  assert.equal(plan.responseType,'mixed');assert.equal(plan.mixedMode,'open');
  assert.equal(plan.feelingPrimary,'joy');assert.equal(plan.feelingSecondary,'sadness');
  assert.equal(plan.feelingTertiary,'none');assert.equal(plan.feelingBalance,.5,'open uses ignored legacy placeholders rather than the proposed anger/hope diagnosis');
});

test('conversation history can give a short birthday disclosure a complex meaning despite an understood local celebration hint',async()=>{
  const history=[{role:'user',content:'最近一直很孤独。生日快到了，我怕到时候还是没有人一起过。'}];
  const {plan,body}=await interpret('今天生日。',openPlan(),{history,hint:{type:'celebrate'},context:{currentPlan:semanticPlan('setback')}});
  assert.deepEqual(body.input[0],history[0],'the model receives the relevant prior disclosure');
  assert.equal(plan.responseType,'mixed');assert.equal(plan.mixedMode,'open');
});

test('semantic interpretation may revise an understood local pair into three supported strands without a mixture lock',async()=>{
  const suggested=semanticPlan('mixed','bittersweet',{mixedMode:'layered',feelingPrimary:'calm',feelingSecondary:'sadness',feelingTertiary:'hope',feelingBalance:.5});
  const hint={type:'mixed',expression:'bittersweet',fields:{mixedMode:'paired',feelingPrimary:'joy',feelingSecondary:'anger',feelingBalance:.8}};
  const {plan}=await interpret('新工作终于有盼头，离开旧工作也松了一口气，却又舍不得旧团队。',suggested,{hint});
  assert.equal(plan.mixedMode,'layered');assert.equal(plan.feelingPrimary,'calm');
  assert.equal(plan.feelingSecondary,'sadness');assert.equal(plan.feelingTertiary,'hope');assert.equal(plan.feelingBalance,.5);
});

test('negated complexity, causal uncertainty and past listen-only wording do not override the current semantic interpretation',async()=>{
  const cases=[
    {text:'我不是心情复杂，只是今天很开心',suggested:semanticPlan('celebrate'),type:'celebrate',expression:'default'},
    {text:'我不知道为什么，但今天很开心',suggested:semanticPlan('celebrate'),type:'celebrate',expression:'default'},
    {text:'昨天我只想你听我说，但今天很难过，希望你安慰我',suggested:semanticPlan('setback','renew'),type:'setback',expression:'renew'}
  ];
  for(const {text,suggested,type,expression} of cases) {
    const {plan}=await interpret(text,suggested);
    assert.equal(plan.responseType,type,text);assert.equal(plan.expression,expression,text);
  }
});
