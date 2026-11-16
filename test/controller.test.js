import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionController } from '../public/lib/controller.js';
import { createPlan } from '../public/lib/catalog.js';
import { PALETTE_FAMILIES, colorGroup, selectPalette } from '../public/lib/palettes.js';
class Renderer {
  constructor() { this.elapsed = 0; this.calls = []; }
  setPlan(plan, { colors, accentColors, avoidedColors, preserveProgress = false } = {}) {
    this.plan = plan; this.colors = colors; this.accentColors = accentColors; this.avoidedColors = avoidedColors;
    if (!preserveProgress) this.elapsed = 0;
    this.calls.push({ plan, preserveProgress });
  }
  setPaused(paused) { this.paused = paused; }
  finish() { this.elapsed = Math.max(this.elapsed, this.plan.durationMs); this.onComplete(this.plan); }
}
const deferred = () => { let resolve,reject; const promise=new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; };
function session(requestPlan = async () => ({plan:createPlan('setback'),mode:'ai',source:'ai'}),mode='demo') {
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
  r.finish(); assert.equal(c.phase,'idle'); assert.equal(c.stableState,'hold');
});
test('only an outstanding real request displays processing', async () => {
  const d=deferred(); const {controller:c,renderer:r}=session(()=>d.promise,'ai');
  const sent=c.submit('今天真是糟透了，我只想说说。');
  r.finish(); assert.equal(c.phase,'processing'); assert.equal(c.plan.responseType,'processing');
  d.resolve({plan:createPlan('setback'),mode:'ai',source:'ai'}); await sent;
  assert.equal(c.plan.responseType,'setback'); assert.equal(c.phase,'responding');
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
  await c.submit('陪我待一会儿'); r.finish(); assert.equal(c.plan.responseType,'rest');
  await c.submit('停'); assert.equal(c.plan.responseType,'withdraw'); r.finish();
  await c.submit('谢谢'); r.finish(); assert.equal(c.plan.responseType,'receive_thanks');
  const palette=c.plan.paletteFamily; r.finish();
  assert.equal(c.stableState,'withdraw'); assert.equal(c.plan.paletteFamily,palette);
  assert.notEqual(c.plan.responseType,'rest');
  await c.submit('我回来了'); r.finish(); assert.equal(c.plan.responseType,'greet');
});
test('failed AI request has error gesture, retry path, and valid local continuation', async () => {
  const {controller:c,renderer:r}=session(async()=>{throw new Error('Offline');},'ai');
  await c.submit('我有点紧张，想缓一缓'); r.finish();
  assert.equal(c.plan.responseType,'error'); assert.equal(c.fallback.retryable,true);
  r.finish(); assert.equal(c.plan.responseType,'upcoming'); assert.equal(c.source,'demo');
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
  d.resolve({plan:createPlan('setback'),mode:'ai'}); await sent;
  assert.equal(c.plan.responseType,'setback'); assert.equal(c.paused,true); assert.equal(r.paused,true);
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
  assert.equal(c.plan.responseType,'rest'); assert.ok(speed<0.22);
  c.setMode('ai'); assert.equal(c.plan.speed,speed);
});

test('color repair replaces a kept palette through closure; a later AI emotion uses its catalog palette', async () => {
  let requests=0;
  const {controller:c,renderer:r}=session(async()=>{requests++; return {plan:createPlan('celebrate'),mode:'ai',source:'ai'};},'ai');
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
  assert.equal(c.plan.paletteFamily,kept);
  assert.equal(c.preferences.lockedPalette,null,'a requested color is not implicitly kept');
  await c.submit('谢谢'); r.finish();
  assert.equal(c.plan.responseType,'receive_thanks'); assert.equal(c.plan.paletteFamily,kept);
  r.finish(); assert.equal(c.plan.paletteFamily,kept);
  await c.submit('慢一点');
  assert.equal(c.plan.responseType,'repair'); assert.equal(c.plan.paletteFamily,kept);
  assert.ok(r.colors.every(color=>colorGroup(color)==='pink'));
  r.finish(); assert.equal(c.plan.paletteFamily,kept);
  await c.submit('今天很开心'); r.finish();
  assert.equal(requests,1,'explicit color commands skip the AI, later emotional sharing uses it');
  assert.equal(c.plan.responseType,'celebrate');
  assert.equal(c.plan.paletteFamily,'apricot_rose');
  assert.equal(c.preferences.lockedPalette,null);
  assert.deepEqual(r.colors,selectPalette(c.plan,c.preferences));
  r.finish(); assert.equal(c.plan.paletteFamily,'apricot_rose');
  c.reset(); assert.deepEqual(c.preferences.rejectedPalettes,[]); assert.equal(c.preferences.lockedPalette,null);
});

test('a requested demo color survives settling and small follow-ups, then yields to a new emotional response', async () => {
  const {controller:c,renderer:r}=session();
  await c.submit('想要蓝色');
  assert.equal(c.plan.responseType,'repair'); assert.equal(c.plan.paletteFamily,'named_blue');
  assert.equal(c.preferences.lockedPalette,null);
  r.finish(); assert.equal(c.phase,'idle'); assert.equal(c.plan.paletteFamily,'named_blue');
  assert.ok(r.colors.every(color=>colorGroup(color)==='blue'));
  await c.submit('慢一点');
  assert.equal(c.plan.responseType,'repair'); assert.equal(c.plan.paletteFamily,'named_blue');
  r.finish(); assert.equal(c.plan.paletteFamily,'named_blue');
  await c.submit('谢谢'); r.finish();
  assert.equal(c.plan.responseType,'receive_thanks'); assert.equal(c.plan.paletteFamily,'named_blue');
  r.finish(); assert.equal(c.plan.paletteFamily,'named_blue');
  await c.submit('我很开心'); r.finish();
  assert.equal(c.plan.responseType,'celebrate'); assert.equal(c.plan.paletteFamily,'apricot_rose');
  assert.equal(c.preferences.lockedPalette,null);
  assert.deepEqual(r.colors,selectPalette(c.plan,c.preferences));
  r.finish(); assert.equal(c.phase,'idle'); assert.equal(c.plan.paletteFamily,'apricot_rose');
});

test('only explicit keep carries a requested color into new emotions; another named color releases it', async () => {
  const {controller:c,renderer:r}=session();
  await c.submit('想要蓝色'); r.finish();
  assert.equal(c.preferences.lockedPalette,null);
  await c.submit('保持这个颜色'); r.finish(); r.finish();
  assert.equal(c.preferences.lockedPalette.paletteFamily,'named_blue');
  await c.submit('我很开心'); r.finish();
  assert.equal(c.plan.responseType,'celebrate'); assert.equal(c.plan.paletteFamily,'named_blue');
  assert.ok(r.colors.every(color=>colorGroup(color)==='blue'));
  r.finish(); assert.equal(c.plan.paletteFamily,'named_blue');
  await c.submit('换成粉色');
  assert.equal(c.plan.responseType,'repair'); assert.equal(c.plan.paletteFamily,'named_pink');
  assert.equal(c.preferences.lockedPalette,null,'a new named request releases the previous explicit lock');
  r.finish(); assert.equal(c.plan.paletteFamily,'named_pink');
  await c.submit('我很开心'); r.finish();
  assert.equal(c.plan.responseType,'celebrate'); assert.equal(c.plan.paletteFamily,'apricot_rose');
  r.finish(); assert.equal(c.plan.paletteFamily,'apricot_rose');
});

test('latest color correction aborts an older AI response before it can restore old colors', async () => {
  const d=deferred(); const {controller:c,renderer:r}=session(()=>d.promise,'ai');
  const previous=c.submit('今天过得怎么样呢'); r.finish();
  await c.submit('换成蓝色');
  assert.ok(r.colors.every(color=>colorGroup(color)==='blue'));
  d.resolve({plan:createPlan('setback',{paletteFamily:'rose_lavender'}),source:'ai',mode:'ai'}); await previous;
  assert.ok(r.colors.every(color=>colorGroup(color)==='blue'));
  assert.equal(c.plan.responseType,'repair');
});

test('manual color preview replaces an old lock while restoring a saved scene preserves its preferences', async () => {
  const {controller:c,renderer:r}=session();
  await c.submit('换成蓝色'); r.finish();
  await c.submit('保持这个颜色'); r.finish(); r.finish();
  assert.equal(c.preferences.lockedPalette.paletteFamily,'named_blue');
  c.saveScene();
  const savedPreferences=structuredClone(c.preferences);
  c.preview(createPlan('upcoming',{paletteFamily:'named_pink',expression:'tense'}));
  assert.equal(c.plan.paletteFamily,'named_pink'); assert.equal(c.preferences.lockedPalette,null);
  assert.ok(r.colors.every(color=>colorGroup(color)==='pink'));
  await c.submit('不要这个颜色');
  assert.ok(c.preferences.rejectedPalettes.includes('named_pink'));
  assert.notEqual(c.plan.paletteFamily,'named_pink');
  c.restoreScene(0);
  assert.deepEqual(c.preferences,savedPreferences);
  assert.ok(r.colors.every(color=>colorGroup(color)==='blue'));
});


test('celebration accents are explicit rendering data and respect quiet, named, and wider palette choices', () => {
  const {controller:c,renderer:r}=session();
  c.preview(createPlan('celebrate',{seed:83}));
  assert.equal(r.accentColors.length,3);
  assert.deepEqual(r.accentColors,PALETTE_FAMILIES.dream_sparkles.variants.balanced.slice(0,3).map(hex=>hex.match(/[a-f\d]{2}/gi).map(value=>parseInt(value,16))));
  assert.deepEqual(c.rendering,{colors:r.colors,accentColors:r.accentColors});
  const exported=c.exportScene();
  assert.deepEqual(exported,{version:1,plan:c.plan,rendering:c.rendering});
  exported.rendering.colors[0][0]=0;
  assert.notDeepEqual(exported.rendering.colors,c.rendering.colors,'export is a detached reproducible snapshot');
  for(const overrides of [{expression:'quiet'},{paletteFamily:'named_blue'},{colorCount:4}]) {
    c.preview(createPlan('celebrate',overrides));
    assert.deepEqual(r.accentColors,[]);
  }
});

test('late celebration accents cannot bypass a kept palette and filter each declined hue separately', async () => {
  const {controller:c,renderer:r}=session();
  c.preview(createPlan('celebrate',{seed:83}));
  await c.submit('保持这个颜色'); r.finish(); r.finish();
  assert.equal(c.preferences.lockedPalette.paletteFamily,'apricot_rose');
  await c.submit('今天很开心'); r.finish();
  assert.equal(c.plan.responseType,'celebrate');
  assert.equal(c.plan.paletteFamily,'apricot_rose');
  assert.deepEqual(r.accentColors,[],'even a kept warm palette may not acquire an unrequested extra hue');
  c.reset();
  await c.submit('我不喜欢蓝色'); r.finish();
  assert.ok(c.preferences.avoidedColors.includes('blue'));
  await c.submit('今天很开心'); r.finish();
  assert.equal(c.plan.responseType,'celebrate');
  assert.equal(c.plan.paletteFamily,'apricot_rose');
  assert.equal(r.accentColors.length,2,'blue is removed while allowed purple and green can still twinkle');
  assert.ok(r.accentColors.every(color=>colorGroup(color)!=='blue'));
  assert.ok(r.accentColors.some(color=>colorGroup(color)==='purple'));
  assert.ok(r.accentColors.some(color=>colorGroup(color)==='green'));
  await c.submit('不要紫色，不要绿色'); r.finish();
  await c.submit('今天很开心'); r.finish();
  assert.deepEqual(r.accentColors,[],'none of the three optional tail hues can bypass its individual ban');
});

test('scene exports contain exact main and accent colors without the private conversation', async () => {
  const {controller:c,renderer:r}=session();
  const privateText='今天很开心，这是只存在于当前会话的私密文字';
  await c.submit(privateText); r.finish();
  const exported=c.exportScene();
  assert.equal(exported.rendering.accentColors.length,3);
  assert.deepEqual(exported.rendering,{colors:r.colors,accentColors:r.accentColors});
  assert.ok(!JSON.stringify(exported).includes(privateText));
  assert.equal(Object.hasOwn(exported,'history'),false);
  assert.equal(Object.hasOwn(exported,'lastText'),false);
  c.saveScene();
  assert.deepEqual(c.savedScenes[0].rendering,exported.rendering);
  assert.ok(!JSON.stringify(c.savedScenes).includes(privateText));
});


test('native ambient responses retain their animation after the finite introduction', async () => {
  for(const [text,type] of [
    ['今天很开心，终于完成了！','celebrate'],
    ['今天生日，我很开心，同时也有点孤单。','mixed'],
    ['今天去散步了。','everyday'],
    ['今天好伤心，事情没成功。','setback'],
    ['失败了，但我想再试一次。','setback'],
    ['明天发表，好紧张。','upcoming'],
    ['明天有面试，很期待。','celebrate'],
    ['明天发表。','everyday']
  ]) {
    const {controller:c,renderer:r}=session();
    await c.submit(text); r.finish();
    assert.equal(c.plan.responseType,type);
    assert.equal(c.plan.loop,false,'the full introduction must not repeat as a loop');
    const original=c.plan;
    const calls=r.calls.length;
    r.finish();
    assert.equal(c.phase,'idle');
    assert.equal(c.stableState,'hold');
    assert.equal(c.plan.responseType,type);
    assert.equal(c.stablePlan.responseType,type);
    assert.equal(c.stablePlan.motionPrimitive,original.motionPrimitive,'tail keeps the native scene rather than a static hold');
    assert.ok(c.stablePlan.energy>0);
    assert.ok(c.stablePlan.amplitude>0);
    assert.equal(r.calls.length,calls,'completing the introduction does not restart the renderer clock');
    assert.equal(r.elapsed,original.durationMs);
    r.elapsed+=4500;
    c.setMode('ai');
    assert.equal(c.stablePlan.responseType,type);
    assert.equal(r.plan.motionPrimitive,original.motionPrimitive);
    assert.equal(r.elapsed,original.durationMs+4500,'switching AI/demo preserves the tail instead of replaying its introduction');
    c.setMode('demo');
    assert.equal(r.elapsed,original.durationMs+4500);
  }
});

test('quiet celebration finishes in stillness rather than acquiring the vivid celebration tail', async () => {
  const {controller:c,renderer:r}=session();
  c.preview(createPlan('celebrate',{expression:'quiet'}));
  r.finish();
  assert.equal(c.stablePlan.motionPrimitive,'hold');
  assert.equal(c.stablePlan.energy,0);
  assert.deepEqual(r.accentColors,[]);
});

test('stop, a direct color repair, and a new receipt each replace an ambient tail and reject its stale completion', async () => {
  for(const intro of ['今天很开心','今天去散步了。','今天好难过','明天发表，好紧张'])for(const [nextText,expectedType] of [['停','withdraw'],['换成蓝色','repair'],['明天发表，好紧张啊','acknowledge']]) {
    const {controller:c,renderer:r}=session();
    await c.submit(intro); r.finish();
    const completedIntro=c.plan;
    r.finish(); r.elapsed+=3000;
    await c.submit(nextText);
    assert.equal(c.plan.responseType,expectedType);
    assert.equal(r.plan.responseType,expectedType);
    assert.equal(r.elapsed,0,'a new command starts its own light instead of continuing the former tail clock');
    r.onComplete(completedIntro);
    assert.equal(c.plan.responseType,expectedType,'a stale completion cannot restore a cancelled tail');
    if(expectedType==='repair') {
      assert.ok(r.colors.every(color=>colorGroup(color)==='blue'));
      assert.deepEqual(r.accentColors,[]);
    }
    if(expectedType==='withdraw') { r.finish(); assert.equal(c.stablePlan.motionPrimitive,'hold'); }
  }
});


test('rejecting the sparkle color family also suppresses the optional finishing colors', async () => {
  const {controller:c,renderer:r}=session();
  c.preview(createPlan('mixed',{paletteFamily:'dream_sparkles',colorCount:3}));
  await c.submit('不要这个颜色');
  assert.ok(c.preferences.rejectedPalettes.includes('dream_sparkles'));
  r.finish();
  await c.submit('今天很开心'); r.finish();
  assert.equal(c.plan.responseType,'celebrate');
  assert.equal(c.plan.paletteFamily,'apricot_rose');
  assert.deepEqual(r.accentColors,[]);
});

test('receipt and real processing carry the current semantic colors into the eventual situation', async () => {
  const pending=deferred();
  const {controller:c,renderer:r}=session(()=>pending.promise,'ai');
  c.preview(createPlan('mixed',{feelingPrimary:'hope',feelingSecondary:'anxiety',feelingBalance:.82}));
  const previous=r.colors.map(color=>[...color]);
  const sent=c.submit('我想说说刚才经历的一件事。');
  assert.equal(c.plan.responseType,'acknowledge');
  assert.deepEqual(r.colors,previous,'receipt does not introduce a disconnected fixed palette');
  r.finish();
  assert.equal(c.plan.responseType,'processing');
  assert.deepEqual(r.colors,previous);
  assert.equal(c.plan.feelingPrimary,'hope');
  assert.equal(c.plan.feelingSecondary,'anxiety');
  pending.resolve({plan:createPlan('celebrate'),source:'ai',mode:'ai'});
  await sent;
  assert.equal(c.plan.responseType,'celebrate');
  assert.equal(c.plan.paletteFamily,'apricot_rose');
  assert.deepEqual(r.colors,selectPalette(c.plan,c.preferences));
});

test('voice receipt starts from the listening colors and a fast response skips processing', async () => {
  const {controller:c,renderer:r}=session();
  c.preview(createPlan('mixed',{feelingPrimary:'anger',feelingSecondary:'sadness'}));
  const calls=r.calls.length;
  await c.submit('虽然一个人过生日，但我真的很开心。',{fromVoice:true});
  assert.equal(c.plan.responseType,'acknowledge');
  assert.equal(c.plan.paletteFamily,'sea_glass');
  r.finish();
  assert.equal(c.plan.responseType,'celebrate');
  assert.equal(r.calls.slice(calls).some(call=>call.plan.responseType==='processing'),false);
});

test('keeping a semantic palette retains its actual colors with exclusions across new feelings and restoration', async () => {
  const {controller:c,renderer:r}=session();
  c.preferences.avoidedColors=['blue'];
  c.preview(createPlan('mixed',{feelingPrimary:'sadness',feelingSecondary:'joy',feelingBalance:.84}),{replacePalette:false});
  const previous=r.colors.map(color=>[...color]);
  assert.ok(previous.every(color=>colorGroup(color)!=='blue'));
  await c.submit('保持这个颜色'); r.finish();
  assert.equal(c.preferences.lockedPalette.feelingPrimary,'sadness');
  assert.equal(c.preferences.lockedPalette.feelingBalance,.84);
  assert.deepEqual(r.colors,previous);
  c.saveScene();
  await c.submit('今天真的很开心'); r.finish();
  assert.equal(c.plan.responseType,'celebrate');
  assert.deepEqual(r.colors,previous,'an explicit keep freezes the semantic pair too');
  await c.submit('换成蓝色');
  assert.equal(c.preferences.lockedPalette,null);
  assert.ok(r.colors.every(color=>colorGroup(color)==='blue'));
  c.restoreScene(0);
  assert.deepEqual(r.colors,previous);
  assert.ok(c.preferences.avoidedColors.includes('blue'));
  assert.equal(c.plan.feelingPrimary,'sadness');
});

test('an open interwoven scene can be kept, restored and exported without inventing a dominant feeling', async () => {
  const {controller:c,renderer:r}=session();
  await c.submit('今天心情五味杂陈，说不清是什么感觉。'); r.finish();
  assert.equal(c.plan.responseType,'mixed');
  assert.equal(c.plan.mixedMode,'open');
  assert.equal(c.plan.feelingBalance,.5);
  const colors=structuredClone(r.colors);
  const savedPlan=structuredClone(c.plan);
  c.saveScene();
  const exported=c.exportScene();
  assert.equal(exported.plan.mixedMode,'open');
  assert.deepEqual(exported.rendering.colors,colors);
  assert.ok(!JSON.stringify(exported).includes('五味杂陈'));
  await c.submit('保持这个颜色'); r.finish();
  assert.equal(c.preferences.lockedPalette.mixedMode,'open');
  await c.submit('今天很开心'); r.finish();
  assert.equal(c.plan.responseType,'celebrate');
  assert.deepEqual(r.colors,colors);
  c.restoreScene(0);
  assert.equal(c.plan.mixedMode,'open');
  assert.equal(c.plan.feelingBalance,savedPlan.feelingBalance);
  assert.deepEqual(r.colors,colors);
});

test('three-feeling color settings survive receipt and processing but a new moment releases them', async () => {
  const pending=deferred();
  const {controller:c,renderer:r}=session(()=>pending.promise,'ai');
  c.preview(createPlan('mixed',{mixedMode:'layered',feelingPrimary:'joy',feelingSecondary:'sadness',feelingTertiary:'hope',feelingBalance:.5}));
  const colors=structuredClone(r.colors);
  const sent=c.submit('我还有一件事情想聊聊。');
  assert.equal(c.plan.mixedMode,'layered');
  assert.equal(c.plan.feelingTertiary,'hope');
  assert.deepEqual(r.colors,colors);
  r.finish();
  assert.equal(c.plan.responseType,'processing');
  assert.equal(c.plan.feelingTertiary,'hope');
  assert.deepEqual(r.colors,colors);
  pending.resolve({plan:createPlan('celebrate'),source:'ai',mode:'ai'}); await sent;
  assert.equal(c.plan.responseType,'celebrate');
  assert.equal(c.plan.feelingTertiary,'none');
  assert.equal(c.plan.paletteFamily,'apricot_rose');
});

test('declined hues are also passed to continuous gradients and captured for exact exported replay', () => {
  const {controller:c,renderer:r}=session();
  c.preferences.avoidedColors=['purple'];
  c.preview(createPlan('mixed',{mixedMode:'open'}),{replacePalette:false});
  assert.deepEqual(r.avoidedColors,['purple']);
  const exported=c.exportScene();
  assert.deepEqual(exported.rendering.avoidedColors,['purple']);
  exported.rendering.avoidedColors.push('pink');
  assert.deepEqual(c.preferences.avoidedColors,['purple']);
  assert.deepEqual(c.rendering.avoidedColors,['purple']);
  c.saveScene();
  c.preferences.avoidedColors=[];
  c.restoreScene(0);
  assert.deepEqual(r.avoidedColors,['purple']);
});
