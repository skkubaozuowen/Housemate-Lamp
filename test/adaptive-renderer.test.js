import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPlan} from '../public/lib/catalog.js';
import {createScenePlan} from '../public/lib/planner.js';
import {COMPOSITION_DEFAULTS, COMPOSITION_LIMITS, normalizeComposition} from '../public/lib/composition.js';
import {colorGroup} from '../public/lib/palettes.js';
import {renderFrame, renderVoiceFrame} from '../public/lib/renderer.js';
import {SessionController} from '../public/lib/controller.js';

const fixtures=[
  ['celebrate','default',null,'22b457c3d48e3e52fcc0607a583014279a0b97d7373624584713e7361a4d0620'],
  ['celebrate','quiet',null,'04a6886148034b581bfe8f12c189c3743dfc04199121a323b9ec53233d81f5de'],
  ['setback','default',null,'06739b69aebff5459b9755452d73bcf8c8829966ab8372793a4c5629384a65a7'],
  ['setback','renew',null,'a6939543e68810b6d2ebf69918ccc96355be1fc9fb972611a7028da525be25f1'],
  ['rest','default',null,'90d18bc3dcb0859754fe391df65fc31e31ce48b78338b84050bbdb54892b1803'],
  ['rest','fulfilled',null,'4170425ec73bc3b6d97d5b33406a17c65f42bf052e6aa7adb3e54f473f34a0a6'],
  ['upcoming','default',null,'4a47aa93a918596a479374cd1ac3acc2e2706aafeaa29b868a16d1be7137f2a3'],
  ['mixed','bittersweet','paired','46ddfbb101d392f8f36bdc72f687dab6e083184c51fddc50fac2e3f3cd457633'],
  ['mixed','bittersweet','layered','d0b59d4358e33f32e97d125ae00fae9f4567208d441e1ac5b30acef213e089a4'],
  ['mixed','bittersweet','open','6fbf3b44a0d1c9c5381005311ce450f71cdc11a07cd8bd488264fa806ced07d5'],
  ['everyday','default',null,'beaca4ee3920a18a4586b742e18ace7befeb1a0bfad46a943254a628e322e460'],
];
const scene=([type,expression,mode])=>createScenePlan(type,expression,{seed:4589,
  ...(mode?{mixedMode:mode,feelingTertiary:mode==='layered'?'hope':'none'}:{})});
const configured=(plan,changes)=>({...plan,composition:normalizeComposition(changes)});
const difference=(a,b)=>a.reduce((sum,value,index)=>sum+Math.abs(value-b[index]),0)/a.length;
const checksum=plan=>{
  const hash=createHash('sha256');
  for(const p of [0,.19,.52,1,1.8])hash.update(renderFrame(plan,plan.durationMs*p));
  return hash.digest('hex');
};
const pixels=frame=>Array.from({length:256},(_,i)=>Array.from(frame.slice(i*3,i*3+3)));
const extremes=side=>normalizeComposition(Object.fromEntries(Object.entries(COMPOSITION_LIMITS).map(([key,bounds])=>[key,bounds[side]])));

test('all eleven existing expressions retain byte-identical RGB with missing or default composition',()=>{
  for(const fixture of fixtures) {
    const original=scene(fixture),without={...original};delete without.composition;
    assert.equal(checksum(without),fixture[3],`${fixture.slice(0,3)} legacy rendering`);
    assert.equal(checksum({...original,composition:{...COMPOSITION_DEFAULTS}}),fixture[3],`${fixture.slice(0,3)} explicit defaults`);
  }
});

test('composition does not alter the five basic signals, voice field, or manual primitives',()=>{
  const basic=[
    ['greet','3dc6db6132db44e0c9a53fc952ac854eb456bb5d121c60a2b6c1899fac52dba3'],
    ['acknowledge','72d3a38bbc8b19e22be258c108e016e9740f3caad8be234f7f47d49aff349eb4'],
    ['processing','9641b40b306427a5eb34ea7a347a78bff1837d27f5414c186e2927bcecf960ec'],
    ['clarify','56d619121ad3e86a0312e3d8b58cf523e4db9caab29f907a574837fac55e64be'],
    ['farewell','a0f08580f45e1507166a7a40cbc33b01b1956c8db610a027888e69ef5cda5ec7'],
  ];
  for(const [type,hash] of basic)for(const composition of [undefined,extremes(0),extremes(1)])
    assert.equal(checksum(createPlan(type,{seed:4589,composition})),hash,type);
  for(const fixture of fixtures) {
    const original={...scene(fixture),motionPrimitive:'hold'};
    assert.deepEqual(renderFrame(original,5000),renderFrame({...original,composition:extremes(1)},5000));
  }
  assert.equal(createHash('sha256').update(renderVoiceFrame(.5,2400)).digest('hex'),
    'b70bc1feb4eee7cb1c1f4f1996365a2ae01a92826af5528aa30365c8e25e3af7');
});

test('field scale changes every expression while preserving its scenario and semantic branch',()=>{
  for(const fixture of fixtures) {
    const original=scene(fixture),before=structuredClone(original);
    const small=configured(original,{fieldScale:.75}),large=configured(original,{fieldScale:1.25});
    assert.ok(difference(renderFrame(small,original.durationMs*.52),renderFrame(large,original.durationMs*.52))>1,
      `${fixture.slice(0,3)} responds to bounded field size`);
    assert.deepEqual(original,before,'rendering never mutates the saved plan');
    assert.equal(small.responseType,large.responseType);assert.equal(small.expression,large.expression);
  }
});

test('wave count, thickness, glow count, glow size and red-accent weight independently change the setback tide',()=>{
  const original=scene(fixtures[2]);
  for(const [key,min,max,elapsed] of [
    ['waveCount',1,4,2000],['waveWidth',.7,1.4,2000],['spread',.8,1.2,6000],
    ['spotCount',2,7,8000],['accentScale',.65,1.5,8000],['accentWeight',.35,1.5,8000],['stagger',.65,1.5,8000]
  ]) {
    const a=configured(original,{[key]:min}),b=configured(original,{[key]:max});
    assert.ok(difference(renderFrame(a,elapsed),renderFrame(b,elapsed))>.4,`${key} changes actual 16×16 emission`);
  }
});

test('celebration and everyday echoes vary in count and spacing without replaying their introduction in the tail',()=>{
  for(const fixture of [fixtures[0],fixtures[10]]) {
    const original=scene(fixture);
    for(const key of ['rippleCount','stagger']) {
      const [min,max]=COMPOSITION_LIMITS[key],a=configured(original,{[key]:min}),b=configured(original,{[key]:max});
      assert.ok(difference(renderFrame(a,original.durationMs*.28),renderFrame(b,original.durationMs*.28))>.2,`${fixture[0]} ${key}`);
      assert.deepEqual(renderFrame(a,original.durationMs*2),renderFrame(b,original.durationMs*2),
        'count and entrance spacing affect the finite introduction, while the original ambient tail remains intact');
    }
  }
  const quiet=scene(fixtures[1]);
  assert.deepEqual(renderFrame(configured(quiet,{rippleCount:1,stagger:.65}),3500),
    renderFrame(configured(quiet,{rippleCount:5,stagger:1.5}),3500),'quiet recognition never acquires celebration ripples');
});

test('warm support responds to delay, strength and area only in branches that already express support',()=>{
  for(const fixture of [fixtures[3],fixtures[5],fixtures[6]]) {
    const original=scene(fixture);
    for(const [key,elapsed] of [['supportDelay',original.durationMs*.4],['supportStrength',original.durationMs*.7],['accentScale',original.durationMs*.7]]) {
      const [min,max]=COMPOSITION_LIMITS[key];
      assert.ok(difference(renderFrame(configured(original,{[key]:min}),elapsed),renderFrame(configured(original,{[key]:max}),elapsed))>.15,
        `${fixture.slice(0,2)} ${key} changes its existing warm region`);
    }
  }
  for(const fixture of [fixtures[2],fixtures[4]]) {
    const original=scene(fixture);
    const controls={supportDelay:.15,supportStrength:1.1};
    for(const elapsed of [2000,6000,16000])assert.deepEqual(renderFrame(configured(original,controls),elapsed),renderFrame(original,elapsed),
      'parameter intensity cannot invent retry intention or fulfilment');
  }
});

test('open, paired, and layered mixed feelings all support scale, spread, elongation and interweaving controls',()=>{
  for(const fixture of fixtures.slice(7,10)) {
    const original=scene(fixture);
    for(const key of ['fieldScale','spread','elongation','waveWidth']) {
      const [min,max]=COMPOSITION_LIMITS[key];
      assert.ok(difference(renderFrame(configured(original,{[key]:min}),14000),renderFrame(configured(original,{[key]:max}),14000))>.05,
        `${fixture[2]} ${key} changes the existing light field`);
    }
  }
});

test('composition boundaries remain deterministic, luminous and bounded for all eleven expressions',()=>{
  for(const fixture of fixtures)for(const composition of [extremes(0),extremes(1)]) {
    const original={...scene(fixture),composition};
    for(const p of [0,.17,.42,.78,1,1.8]) {
      const elapsed=original.durationMs*p,frame=renderFrame(original,elapsed);
      assert.ok(frame instanceof Uint8ClampedArray);assert.equal(frame.length,768);
      assert.ok(frame.every(value=>value>30&&value<=255),'no invalid geometry produces black or non-finite emissions');
      assert.deepEqual(frame,renderFrame(original,elapsed),'same saved plan and time give the same matrix');
    }
  }
});

test('reduced motion and zero amplitude remain still even with the strongest composition settings',()=>{
  for(const fixture of fixtures) {
    const original={...scene(fixture),composition:extremes(1)};
    assert.deepEqual(renderFrame(original,0,{reducedMotion:true}),renderFrame(original,120000,{reducedMotion:true}),`${fixture.slice(0,3)} reduced motion`);
    const still={...original,amplitude:0};
    assert.deepEqual(renderFrame(still,still.durationMs*1.5),renderFrame(still,still.durationMs*3),`${fixture.slice(0,3)} zero amplitude`);
  }
});

test('adaptive events and finite-to-ambient boundaries do not introduce discontinuous RGB jumps',()=>{
  for(const fixture of fixtures) {
    const original={...scene(fixture),composition:extremes(1),speed:2,amplitude:1};
    for(const elapsed of [0,original.durationMs*.15,original.durationMs*.52,original.durationMs,16000,24000,32000]) {
      const before=renderFrame(original,Math.max(0,elapsed-.5)),after=renderFrame(original,elapsed+.5);
      assert.ok(Math.max(...before.map((value,i)=>Math.abs(value-after[i])))<=4,`${fixture.slice(0,3)} continuous local time`);
      assert.ok(difference(before,after)<.5,`${fixture.slice(0,3)} no global flash`);
    }
  }
});

test('size and timing orchestration respect a named palette and S05 declined intermediate hues',()=>{
  for(const fixture of fixtures)for(const composition of [extremes(0),extremes(1)]) {
    const original={...scene(fixture),composition,paletteFamily:'named_blue'};
    for(const elapsed of [3000,9000,22000])assert.ok(pixels(renderFrame(original,elapsed)).every(rgb=>['neutral','blue'].includes(colorGroup(rgb))),
      'new geometry adds no hardcoded warm, red, purple or green pixels to an explicit blue selection');
  }
  const colors=[[80,150,255],[238,120,218]],avoidedColors=['purple'];
  for(const fixture of fixtures.slice(7,10))for(const composition of [extremes(0),extremes(1)]) {
    const original={...scene(fixture),composition};
    for(const elapsed of [2500,6000,18000])assert.ok(pixels(renderFrame(original,elapsed,{colors,avoidedColors})).every(rgb=>colorGroup(rgb)!=='purple'),
      'adaptive mixing retains the white shoulder across a declined intermediate hue');
  }
});


test('permitted violet and mint stars cannot mix back into a declined blue when their size increases',()=>{
  const renderer={setPlan(){},setPaused(){}};
  const controller=new SessionController({renderer,mode:'demo'});
  controller.preferences.avoidedColors=['blue'];
  controller.display(createScenePlan('celebrate','default',{seed:1827,composition:extremes(1)}));
  assert.equal(controller.rendering.accentColors.length,2,'only the allowed violet and mint accents are supplied');
  const unrestricted=renderFrame(controller.plan,9000,{...controller.rendering,avoidedColors:[]});
  assert.ok(pixels(unrestricted).some(rgb=>colorGroup(rgb)==='blue'),'the regression concerns an intermediate mix, not a forbidden source pigment');
  for(const elapsed of [8984,9000,9016,14000,24000]) {
    const frame=renderFrame(controller.plan,elapsed,controller.rendering);
    assert.ok(pixels(frame).every(rgb=>colorGroup(rgb)!=='blue'),'the actual exported/hardware RGB obeys the declined hue');
    assert.ok(pixels(frame).filter(rgb=>Math.max(...rgb)-Math.min(...rgb)>18).length>10,'the allowed colored star field remains visible');
  }
  const before=renderFrame(controller.plan,8984,controller.rendering),after=renderFrame(controller.plan,9016,controller.rendering);
  assert.ok(Math.max(...before.map((value,i)=>Math.abs(value-after[i])))<=8,'the white shoulder does not snap into a hard pixel mask');
  assert.ok(difference(before,after)<.5,'the field stays temporally soft at the previous hue-crossing point');
});

test('support fields use a luminous shoulder instead of generating a declined intermediate yellow',()=>{
  const original=scene(fixtures[5]);
  const colors=[[100,180,255],[110,230,165],[255,150,120],[255,190,140]],avoidedColors=['yellow'];
  assert.ok(colors.every(rgb=>colorGroup(rgb)!=='yellow'),'all supplied source pigments are allowed');
  for(const composition of [extremes(0),extremes(1)])for(const elapsed of [5000,9000,18000]) {
    const frame=renderFrame({...original,composition},elapsed,{colors,avoidedColors});
    assert.ok(pixels(frame).every(rgb=>colorGroup(rgb)!=='yellow'));
    assert.ok(pixels(frame).some(rgb=>colorGroup(rgb)!=='neutral'),'the correction retains allowed colors');
  }
});


test('final Uint8 rounding cannot reintroduce declined red, yellow, or pink at a neutral shoulder boundary',()=>{
  const renderer={setPlan(){},setPaused(){}};
  for(const [type,expression,composition,avoided,elapsed] of [
    ['celebrate','quiet',COMPOSITION_DEFAULTS,'red',5000],
    ['rest','fulfilled',extremes(1),'yellow',9000],
    ['rest','fulfilled',extremes(1),'yellow',20000],
    ['setback','default',extremes(1),'pink',0],
    ['setback','default',extremes(1),'pink',9000],
    ['setback','renew',extremes(1),'pink',0],
    ['setback','renew',extremes(1),'pink',5000],
  ]) {
    const controller=new SessionController({renderer,mode:'demo'});
    controller.preferences.avoidedColors=[avoided];
    controller.display(createScenePlan(type,expression,{seed:1827,composition}));
    const frame=renderFrame(controller.plan,elapsed,controller.rendering);
    assert.ok(pixels(frame).every(rgb=>colorGroup(rgb)!==avoided),`${type}/${expression} final quantized bytes avoid ${avoided}`);
  }
});
