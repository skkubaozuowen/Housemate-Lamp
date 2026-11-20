import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlan,SCENE_RESPONSE_TYPES} from '../public/lib/catalog.js';
import {createScenePlan} from '../public/lib/planner.js';
import {LightRenderer,renderFrame} from '../public/lib/renderer.js';

const mean=frame=>frame.reduce((sum,value)=>sum+value,0)/frame.length;
const white=frame=>frame.every(value=>value===255);
const delta=(left,right)=>Math.max(...left.map((value,index)=>Math.abs(value-right[index])));

function browserHarness() {
  const originals=Object.fromEntries(['window','document','requestAnimationFrame','cancelAnimationFrame','ResizeObserver'].map(key=>[key,globalThis[key]]));
  const queue=new Map(),events=new Map();let next=0;
  const canvas=()=>({width:0,height:0,getBoundingClientRect:()=>({width:600,height:600}),getContext:()=>({
    createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},fillRect(){},drawImage(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}
  })});
  globalThis.document={hidden:false,createElement:canvas,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  globalThis.window={devicePixelRatio:1,addEventListener(){},removeEventListener(){}};
  globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  globalThis.requestAnimationFrame=fn=>{const id=++next;queue.set(id,fn);return id;};
  globalThis.cancelAnimationFrame=id=>queue.delete(id);
  return {canvas,queue,tick(at){const pending=[...queue.values()];queue.clear();for(const fn of pending)fn(at);},
    hidden(value){document.hidden=value;events.get('visibilitychange')?.();},
    restore(){for(const[key,value]of Object.entries(originals))if(value===undefined)delete globalThis[key];else globalThis[key]=value;}};
}

test('native idle is exactly static white, including saved palettes, color exclusions and the emitted matrix',()=>{
  const idle=createPlan('idle',{seed:817,paletteFamily:'named_blue'});
  for(const elapsed of [0,1000,60000])for(const reducedMotion of [false,true])
    assert.ok(white(renderFrame(idle,elapsed,{colors:[[10,20,90]],accentColors:[[255,0,0]],avoidedColors:['blue'],reducedMotion})));
  const browser=browserHarness();
  try {
    const frames=[],renderer=new LightRenderer(browser.canvas(),{onFrame:frame=>frames.push(frame.slice())});
    renderer.setPlan(idle,{colors:[[10,20,90]]});
    assert.ok(white(renderer.frame));assert.ok(white(frames.at(-1)));assert.equal(browser.queue.size,0);
    renderer.destroy();
  } finally {browser.restore();}
});

test('celebration and renewal star endings darken only their neutral surface and keep luminous local points',()=>{
  for(const [type,expression] of [['celebrate','default'],['setback','renew']]) {
    const plan=createScenePlan(type,expression,{seed:4589});
    const early=renderFrame(plan,plan.durationMs*.7),middle=renderFrame(plan,plan.durationMs*.88),late=renderFrame(plan,plan.durationMs);
    assert.ok(mean(middle)<mean(early)-25,`${type} neutral surface recedes gradually`);
    assert.ok(mean(late)<mean(middle)-35,`${type} finishes on a dark star surface`);
    assert.equal(Math.min(...late),8,'the star backdrop remains a neutral near-black, not a blackout');
    const pixels=Array.from({length:256},(_,i)=>late.slice(i*3,i*3+3));
    assert.ok(pixels.filter(rgb=>Math.max(...rgb)<25).length>120,'dark empty space separates the stars');
    assert.ok(pixels.filter(rgb=>Math.max(...rgb)>90&&Math.max(...rgb)-Math.min(...rgb)>35).length>=4,'colored points remain genuinely luminous');
    assert.ok(delta(renderFrame(plan,plan.durationMs*.88),renderFrame(plan,plan.durationMs*.88+1))<=1,'the backdrop never switches abruptly');
  }
  const quiet=createScenePlan('celebrate','quiet',{seed:4589});
  assert.ok(mean(renderFrame(quiet,quiet.durationMs))>210,'quiet recognition retains its own warm, white-ground unfolding');
});

test('every scenario returns through one continuous dim and white rise, then stops its RAF',()=>{
  const browser=browserHarness();
  try {
    for(const type of SCENE_RESPONSE_TYPES) {
      const output=[],renderer=new LightRenderer(browser.canvas(),{onFrame:frame=>output.push(frame.slice())});
      const scene=createScenePlan(type,'default',{seed:4589,transitionMs:0});
      renderer.setPlan(scene);browser.tick(0);browser.tick(scene.durationMs);
      const ending=renderer.frame.slice();
      renderer.setPlan(createPlan('idle',{transitionMs:2000}));
      assert.deepEqual(renderer.frame,ending,'the first return frame is the actual visible scene');
      assert.equal(browser.queue.size,1);browser.tick(scene.durationMs);
      let before=renderer.frame.slice(),atDip;
      for(let step=1;step<120;step++) {
        const elapsed=step*1000/60;
        browser.tick(scene.durationMs+elapsed);
        assert.equal(browser.queue.size,1,'one return transition owns one RAF');
        assert.ok(delta(before,renderer.frame)<=12,`${type} at ${elapsed}: ${delta(before,renderer.frame)} channel step`);
        assert.ok(Math.min(...renderer.frame)>=1,'the dip does not insert a full-black frame');
        before=renderer.frame.slice();if(elapsed>=900&&!atDip)atDip=before;
      }
      browser.tick(scene.durationMs+2001);
      assert.ok(mean(atDip)<mean(ending)*.2,`${type} visibly dims before white light rises`);
      assert.ok(white(renderer.frame));assert.ok(white(output.at(-1)),'onFrame uses the same final white hardware data');
      assert.equal(browser.queue.size,0,'a static idle lamp has no stale scene loop');
      renderer.destroy();
    }
  } finally {browser.restore();}
});

test('a dark star ending does not preflash white before the return dip',()=>{
  const browser=browserHarness();
  try {
    for(const [type,expression] of [['celebrate','default'],['setback','renew']]) {
      const renderer=new LightRenderer(browser.canvas()),scene=createScenePlan(type,expression,{seed:4589,transitionMs:0});
      renderer.setPlan(scene);browser.tick(0);browser.tick(scene.durationMs);
      const dark=mean(renderer.frame);renderer.setPlan(createPlan('idle',{transitionMs:2000}));browser.tick(scene.durationMs);
      for(const elapsed of [100,300,600,900]) {
        browser.tick(scene.durationMs+elapsed);
        assert.ok(mean(renderer.frame)<=dark+1,'the outgoing stars dim without a bright backing field appearing');
      }
      browser.tick(scene.durationMs+2000);assert.ok(white(renderer.frame));renderer.destroy();
    }
  } finally {browser.restore();}
});

test('new input replaces a return transition from its visible frame without retaining the old scene',()=>{
  const browser=browserHarness();
  try {
    const renderer=new LightRenderer(browser.canvas()),scene=createScenePlan('mixed','bittersweet',{seed:4589,transitionMs:0});
    renderer.setPlan(scene);browser.tick(0);browser.tick(scene.durationMs);
    renderer.setPlan(createPlan('idle',{transitionMs:2000}));browser.tick(scene.durationMs);browser.tick(scene.durationMs+600);
    const visible=renderer.frame.slice(),receipt=createPlan('acknowledge',{seed:72,transitionMs:240});
    renderer.setPlan(receipt);assert.deepEqual(renderer.frame,visible);assert.equal(browser.queue.size,1);
    browser.tick(scene.durationMs+610);browser.tick(scene.durationMs+850);
    assert.deepEqual(renderer.frame,renderFrame(receipt,240),'the new receipt owns the field once its short handoff ends');
    assert.equal(browser.queue.size,1);renderer.destroy();assert.equal(browser.queue.size,0);
  } finally {browser.restore();}
});

test('return ramps exclude hidden and paused time, and reduced motion bypasses the return even when set during pause',()=>{
  const browser=browserHarness();
  try {
    const renderer=new LightRenderer(browser.canvas()),scene=createScenePlan('rest','default',{seed:4589,transitionMs:0});
    renderer.setPlan(scene);browser.tick(0);browser.tick(scene.durationMs);
    renderer.setPlan(createPlan('idle',{transitionMs:2000}));browser.tick(scene.durationMs);browser.tick(scene.durationMs+400);
    const frozen=renderer.frame.slice();renderer.setPaused(true);browser.tick(50000);assert.deepEqual(renderer.frame,frozen);
    renderer.setPaused(false);browser.tick(50001);assert.deepEqual(renderer.frame,frozen);
    browser.hidden(true);browser.tick(100000);assert.deepEqual(renderer.frame,frozen);browser.hidden(false);browser.tick(100001);assert.deepEqual(renderer.frame,frozen);
    browser.tick(100101);assert.ok(mean(renderer.frame)<mean(frozen),'only the visible 100ms continues the dim');
    renderer.setPaused(true);renderer.setReducedMotion(true);assert.equal(browser.queue.size,0);
    renderer.setPaused(false);assert.ok(white(renderer.frame));assert.equal(browser.queue.size,0);renderer.destroy();
  } finally {browser.restore();}
});

test('voice listening remains continuous through long speech and exits smoothly into the short receipt',()=>{
  const browser=browserHarness();
  try {
    const renderer=new LightRenderer(browser.canvas());renderer.setPlan(createPlan('idle'));
    renderer.setVoiceInput({active:true,level:.3});browser.tick(0);browser.tick(500);browser.tick(5000);
    assert.ok(!white(renderer.frame),'ongoing speech keeps its listening light');assert.equal(renderer.elapsedMs,0,'listening freezes the underlying timeline');
    const listening=renderer.frame.slice();renderer.setVoiceInput({active:false});
    const receipt=createPlan('acknowledge',{seed:72});renderer.setPlan(receipt);assert.deepEqual(renderer.frame,listening);
    browser.tick(5010);browser.tick(5250);
    assert.deepEqual(renderer.frame,renderFrame(receipt,240),'voice handoff leaves enough of the 850ms receipt visible');
    assert.equal(browser.queue.size,1);renderer.destroy();
  } finally {browser.restore();}
});
