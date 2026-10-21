import test from 'node:test';
import assert from 'node:assert/strict';
import {CATALOG,RESPONSE_TYPES,createPlan} from '../public/lib/catalog.js';
import {PALETTE_FAMILIES,PALETTE_VARIANTS,NAMED_COLOR_FAMILIES,selectPalette,colorGroup} from '../public/lib/palettes.js';
import {renderFrame,LightRenderer} from '../public/lib/renderer.js';

const fixed = type => createPlan(type,{seed:4589,paletteFamily:'lilac_blush',paletteVariant:'balanced'});
const difference = (a,b) => a.reduce((total,value,index)=>total+Math.abs(value-b[index]),0)/a.length;

test('20 catalog scenes produce deterministic, bounded 16×16 RGB data',()=>{
  assert.equal(RESPONSE_TYPES.length,20);
  for(const type of RESPONSE_TYPES) {
    const plan=fixed(type),at=plan.durationMs*.37;
    const frame=renderFrame(plan,at);
    assert.ok(frame instanceof Uint8ClampedArray,type);
    assert.equal(frame.length,16*16*3,type);
    assert.deepEqual(frame,renderFrame(plan,at),`${type} reproducibility`);
    assert.ok(frame.every(Number.isFinite),type);
    assert.ok(Math.min(...frame)>=100,`${type} keeps the bright diffuse language`);
    assert.ok(Math.max(...frame)-Math.min(...frame)>8,`${type} retains spatial color contrast`);
  }
});

test('communication pairs have different motion signatures even in the same palette',()=>{
  const pairs=[['acknowledge','affirm'],['decline','error'],['accompany','withdraw'],['encourage','celebrate'],['wait','processing']];
  for(const [left,right] of pairs) {
    const a=fixed(left),b=fixed(right);
    const deltas=[.2,.45,.7,.95].map(progress=>difference(renderFrame(a,a.durationMs*progress),renderFrame(b,b.durationMs*progress)));
    assert.ok(deltas.reduce((sum,value)=>sum+value,0)/deltas.length>2,`${left} / ${right} differences: ${deltas}`);
  }
});

test('finite scenes stop and hold; reduced-motion scenes do not keep drifting',()=>{
  for(const type of ['withdraw','wait','clarify','affirm','soothe']) {
    const plan=fixed(type);
    assert.deepEqual(renderFrame(plan,plan.durationMs),renderFrame(plan,plan.durationMs+60000),type);
  }
  for(const type of RESPONSE_TYPES) {
    const plan=fixed(type);
    assert.deepEqual(renderFrame(plan,0,{reducedMotion:true}),renderFrame(plan,60000,{reducedMotion:true}),type);
  }
  const hold=createPlan('accompany',{seed:100,motionPrimitive:'hold'});
  assert.deepEqual(renderFrame(hold,100),renderFrame(hold,7000));
});

test('finite gesture speed changes its bounded flow and seed varies the spatial origin',()=>{
  const plan=fixed('greet');
  assert.ok(difference(renderFrame({...plan,speed:.1},1100),renderFrame({...plan,speed:1.8},1100))>.1);
  assert.ok(difference(renderFrame({...plan,seed:12},1100),renderFrame({...plan,seed:739},1100))>.1);
  assert.deepEqual(renderFrame({...plan,speed:.1},plan.durationMs),renderFrame({...plan,speed:1.8},plan.durationMs),'speed does not change the finite endpoint');
});

test('every palette variant respects all declined hue groups, including a conflicting lock',()=>{
  assert.equal(Object.keys(PALETTE_FAMILIES).length,19);
  const groups=['blue','pink','purple','green','yellow','orange','red'];
  const combinations=[...groups.map(group=>[group]),['blue','purple','pink'],groups];
  for(const family of Object.keys(PALETTE_FAMILIES)) for(const variant of PALETTE_VARIANTS) for(const avoidedColors of combinations) {
    const plan=createPlan('greet',{paletteFamily:family,paletteVariant:variant,colorCount:4});
    const colors=selectPalette(plan,{avoidedColors,lockedPalette:{paletteFamily:family,paletteVariant:variant,colorCount:4}});
    assert.equal(colors.length,4);
    for(const color of colors) {
      assert.equal(color.length,3);
      assert.ok(color.every(value=>Number.isInteger(value)&&value>=0&&value<=255));
      assert.ok(!avoidedColors.includes(colorGroup(color)),`${family}/${variant} must avoid ${avoidedColors}`);
    }
  }
});

test('named color remains recognizable after white-field mixing in the actual RGB frame',()=>{
  for(const [hue,paletteFamily] of Object.entries(NAMED_COLOR_FAMILIES)) {
    const plan=createPlan('repair',{paletteFamily,paletteVariant:'balanced',seed:1827});
    const frame=renderFrame(plan,plan.durationMs);
    let colored=0;
    for(let i=0;i<frame.length;i+=3) {
      const group=colorGroup(Array.from(frame.slice(i,i+3)));
      if(group==='neutral')continue;
      colored++;
      assert.equal(group,hue,`${hue} should remain its requested hue after diffusion`);
    }
    assert.ok(colored>30,`${hue} must be visibly present rather than an all-white frame`);
  }
});

function browserHarness() {
  const originals=Object.fromEntries(['window','document','requestAnimationFrame','cancelAnimationFrame','ResizeObserver'].map(key=>[key,globalThis[key]]));
  const events=new Map(),queue=new Map();let next=1;
  function canvas() {
    const context={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},fillRect(){},drawImage(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}};
    return {width:0,height:0,getContext:()=>context,getBoundingClientRect:()=>({width:800,height:600})};
  }
  globalThis.document={hidden:false,createElement:canvas,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  globalThis.window={devicePixelRatio:3,addEventListener(){},removeEventListener(){}};
  globalThis.ResizeObserver=class {observe(){} disconnect(){}};
  globalThis.requestAnimationFrame=fn=>{const id=next++;queue.set(id,fn);return id;};
  globalThis.cancelAnimationFrame=id=>queue.delete(id);
  return {
    canvas,queue,
    tick(now){const pending=[...queue.values()];queue.clear();for(const fn of pending)fn(now);},
    visibility(hidden){document.hidden=hidden;events.get('visibilitychange')?.();},
    restore(){for(const [key,value] of Object.entries(originals))if(value===undefined)delete globalThis[key];else globalThis[key]=value;},
  };
}

test('one renderer loop, smooth captured transitions and one completion per finite plan',()=>{
  const browser=browserHarness();
  try {
    const completed=[],canvas=browser.canvas();
    const renderer=new LightRenderer(canvas,{onComplete:plan=>completed.push(plan)});
    const first=fixed('idle');renderer.setPlan(first);browser.tick(0);browser.tick(200);
    const captured=renderer.frame.slice(),second=fixed('affirm');renderer.setPlan(second);
    assert.deepEqual(renderer.frame,captured,'a new plan starts at the actual displayed frame');
    assert.equal(browser.queue.size,1,'no second RAF is created by replacing a plan');
    browser.tick(300);browser.tick(2000);browser.tick(4000);
    assert.deepEqual(completed,[second],'completion uses the exact plan identity and fires once');
    assert.equal(canvas.width,1400,'DPR is capped at 1.75');
    assert.equal(browser.queue.size,0,'a completed finite endpoint stops redrawing');
    renderer.setPlan(createPlan('idle',{motionPrimitive:'hold',transitionMs:0}));
    assert.equal(browser.queue.size,0,'a static loop needs no RAF');
    renderer.setPlan(fixed('accompany'));renderer.setReducedMotion(true);
    assert.equal(browser.queue.size,1,'an already scheduled frame may finish');
    browser.tick(5000);assert.equal(browser.queue.size,0,'reduced-motion loops stop after their single paint');
    renderer.destroy();assert.equal(browser.queue.size,0);
  } finally {browser.restore();}
});

test('pause freezes frame and crossfade, queues the latest network result, and excludes hidden time',()=>{
  const browser=browserHarness();
  try {
    let completions=0;
    const renderer=new LightRenderer(browser.canvas(),{onComplete:()=>completions++});
    renderer.setPlan(fixed('accompany'));browser.tick(100);browser.tick(500);
    renderer.setPlan(fixed('celebrate'));browser.tick(600);browser.tick(900);
    renderer.setPaused(true);
    const frozen=renderer.frame.slice(),elapsed=renderer.elapsedMs;
    browser.tick(8000);
    assert.deepEqual(renderer.frame,frozen);assert.equal(renderer.elapsedMs,elapsed);
    renderer.setPlan(fixed('error'));
    const latest=fixed('withdraw');renderer.setPlan(latest);
    assert.equal(renderer.plan,latest);assert.deepEqual(renderer.frame,frozen);assert.equal(completions,0);
    renderer.setPaused(false);assert.deepEqual(renderer.frame,frozen);
    browser.tick(10000);browser.tick(10200);
    assert.equal(renderer.elapsedMs,200,'pause time is excluded and queued plan starts anew');
    browser.visibility(true);assert.equal(browser.queue.size,0);
    browser.visibility(false);browser.tick(50000);browser.tick(50200);
    assert.equal(renderer.elapsedMs,400,'hidden time is excluded');
    renderer.destroy();
  } finally {browser.restore();}
});
