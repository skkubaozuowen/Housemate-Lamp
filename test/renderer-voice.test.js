import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {RESPONSE_TYPES,createPlan} from '../public/lib/catalog.js';
import {LightRenderer,renderFrame,renderVoiceFrame} from '../public/lib/renderer.js';

const difference=(a,b)=>a.reduce((sum,value,index)=>sum+Math.abs(value-b[index]),0)/a.length;
function browserHarness() {
  const originals=Object.fromEntries(['window','document','requestAnimationFrame','cancelAnimationFrame','ResizeObserver'].map(key=>[key,globalThis[key]]));
  const queue=new Map(),events=new Map();let next=0;
  function canvas() {
    const context={lastImage:null,drawn:[],createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(image){this.lastImage=image;},fillRect(){},drawImage(source){this.drawn.push(source);},beginPath(){},moveTo(){},lineTo(){},stroke(){}};
    return {width:0,height:0,getContext:()=>context,getBoundingClientRect:()=>({width:600,height:600}),context};
  }
  globalThis.document={hidden:false,createElement:canvas,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  globalThis.window={devicePixelRatio:1,addEventListener(){},removeEventListener(){}};
  globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  globalThis.requestAnimationFrame=fn=>{const id=++next;queue.set(id,fn);return id;};
  globalThis.cancelAnimationFrame=id=>queue.delete(id);
  return {canvas,queue,tick(at){const callbacks=[...queue.values()];queue.clear();for(const fn of callbacks)fn(at);},
    hidden(value){document.hidden=value;events.get('visibilitychange')?.();},
    restore(){for(const[key,value]of Object.entries(originals))if(value===undefined)delete globalThis[key];else globalThis[key]=value;}};
}

test('voice frames are compact blue and mint diffusion with organic flow and amplitude response',()=>{
  const quiet=renderVoiceFrame(0),loud=renderVoiceFrame(.9),center=(6*16+7)*3;
  for(const frame of[quiet,loud,renderVoiceFrame(NaN,Infinity)]) {
    assert.ok(frame instanceof Uint8ClampedArray);assert.equal(frame.length,768);assert.ok(frame.every(Number.isFinite));
    assert.ok(Math.min(...frame)>=100);assert.ok(Math.max(...frame)<=255);
  }
  assert.deepEqual(quiet,renderVoiceFrame(0));
  assert.ok(quiet[center+2]-quiet[center]>60,'quiet retains a visible colored center');
  assert.ok(quiet[(15*16)*3]>245,'the distant edge fades into the white field');
  const colors=frame=>Array.from({length:256},(_,i)=>[...frame.slice(i*3,i*3+3)]);
  const coloredArea=frame=>colors(frame).filter(color=>Math.max(...color)-Math.min(...color)>25).length;
  assert.ok(coloredArea(quiet)<=78,'quiet occupies less area than the former 104-pixel blue wash');
  for(const at of[0,2500,5000,7500]) {
    const frame=renderVoiceFrame(0,at),palette=colors(frame);
    assert.ok(palette.filter(([r,g,b])=>b-g>12&&b-r>25).length>=10,'blue remains distinct');
    assert.ok(palette.filter(([r,g,b])=>g-b>8&&g-r>25).length>=5,'mint green remains distinct');
    const next=renderVoiceFrame(0,at+1000/60);
    assert.ok(Math.max(...frame.map((value,index)=>Math.abs(value-next[index])))<=2,'ambient flow has no per-frame pop');
  }
  assert.ok(difference(quiet,renderVoiceFrame(0,2500))>1,'quiet still has deliberate ambient flow');
  assert.ok(coloredArea(loud)>coloredArea(quiet)*1.4,'real amplitude enlarges the flowing gradient');
  assert.ok(difference(quiet,loud)>7);
  // Gaussian fields have no flat filled disk or hard ring around a sphere.
  const centerRow=Array.from({length:16},(_,x)=>quiet[(6*16+x)*3]);
  assert.ok(new Set(centerRow).size>=12,'the light fades continuously across the matrix');
});

test('reduced motion fixes voice geometry in time while measured levels still change color strength',()=>{
  const quiet=renderVoiceFrame(.1,0,{reducedMotion:true}),loud=renderVoiceFrame(.9,0,{reducedMotion:true});
  assert.deepEqual(loud,renderVoiceFrame(.9,60000,{reducedMotion:true}));
  assert.ok(difference(quiet,loud)>1);
  const darkest=frame=>Array.from({length:256},(_,i)=>frame[i*3]).indexOf(Math.min(...Array.from({length:256},(_,i)=>frame[i*3])));
  assert.equal(darkest(quiet),darkest(loud),'level changes never displace the center');
});

test('the other 19 scene frames remain byte-for-byte unchanged by the R02 water-flow revision',()=>{
  const hash=createHash('sha256');
  // Captured from HEAD before revising R02. Its intentionally changed geometry
  // is excluded; the other responses retain their existing exact RGB frames.
  for(const type of RESPONSE_TYPES.filter(type=>type!=='accompany')){const plan=createPlan(type,{seed:4589});for(const p of[0,.17,.42,.8,1,3])hash.update(renderFrame(plan,plan.durationMs*p));}
  assert.equal(hash.digest('hex'),'3364b056fbef1a80e4a614c74a13039f6b530926305b89717fa48490b58abc5b');
});

test('voice shares one renderer RAF, source pixels, grid and emitted RGB while freezing the base timeline',()=>{
  const browser=browserHarness();
  try {
    const completed=[],frames=[],canvas=browser.canvas(),grid=browser.canvas();
    const renderer=new LightRenderer(canvas,{gridCanvas:grid,onComplete:plan=>completed.push(plan),onFrame:frame=>frames.push(frame.slice())});
    renderer.setPlan(createPlan('celebrate',{seed:4589}));browser.tick(0);browser.tick(1000);
    const before=renderer.frame.slice(),elapsed=renderer.elapsedMs;
    renderer.setVoiceInput({active:true,level:.2});assert.deepEqual(renderer.frame,before);assert.equal(browser.queue.size,1);
    browser.tick(1010);browser.tick(1510);assert.equal(renderer.elapsedMs,elapsed);assert.equal(completed.length,0);
    assert.ok(difference(renderer.frame,before)>5);assert.deepEqual(frames.at(-1),renderer.frame);
    const rgba=renderer.source.context.lastImage.data;
    for(let i=0;i<256;i++)assert.deepEqual([...rgba.slice(i*4,i*4+3)],[...renderer.frame.slice(i*3,i*3+3)]);
    assert.equal(canvas.context.drawn.at(-1),renderer.source);assert.equal(grid.context.drawn.at(-1),renderer.source);
    for(const level of[.4,.8,.6])renderer.setVoiceInput({active:true,level});assert.equal(browser.queue.size,1);
    browser.tick(9000);assert.equal(renderer.elapsedMs,elapsed);assert.equal(completed.length,0);
    renderer.destroy();assert.equal(browser.queue.size,0);
  } finally {browser.restore();}
});

test('voice exit and a newly arriving plan both fade from the actual visible voice frame',()=>{
  const browser=browserHarness();
  try {
    const renderer=new LightRenderer(browser.canvas());renderer.setPlan(createPlan('idle'));browser.tick(0);
    renderer.setVoiceInput({active:true,level:.75});browser.tick(10);browser.tick(510);
    const voice=renderer.frame.slice();
    const hiddenPlan=createPlan('celebrate',{seed:72});renderer.setPlan(hiddenPlan);
    assert.deepEqual(renderer.frame,voice,'a plan arriving underneath voice cannot replace it');assert.equal(renderer.plan,hiddenPlan);assert.equal(renderer.elapsedMs,0);
    renderer.setVoiceInput({active:false});assert.deepEqual(renderer.frame,voice);
    const next=createPlan('acknowledge',{seed:41});renderer.setPlan(next);assert.deepEqual(renderer.frame,voice,'the next plan captures the voice output, not a stale emotion frame');
    browser.tick(520);assert.deepEqual(renderer.frame,voice);browser.tick(970);
    assert.deepEqual(renderer.frame,renderFrame(next,450));assert.equal(renderer.elapsedMs,450);
    renderer.destroy();
  } finally {browser.restore();}
});

test('manual pause freezes voice and keeps only the latest pending voice level and base plan',()=>{
  const browser=browserHarness();
  try {
    const frames=[];const renderer=new LightRenderer(browser.canvas(),{onFrame:frame=>frames.push(frame.slice())});
    renderer.setPlan(createPlan('idle',{motionPrimitive:'hold'}));renderer.setPaused(true);
    const frozen=renderer.frame.slice(),count=frames.length;
    renderer.setVoiceInput({active:true,level:.1});renderer.setVoiceInput({active:true,level:.9});
    const next=createPlan('celebrate');renderer.setPlan(next);browser.tick(10000);
    assert.deepEqual(renderer.frame,frozen);assert.equal(frames.length,count);assert.equal(browser.queue.size,0);
    renderer.setPaused(false);assert.deepEqual(renderer.frame,frozen);assert.equal(renderer.plan,next);assert.equal(browser.queue.size,1);
    browser.tick(10010);browser.tick(10510);assert.deepEqual(renderer.frame,renderVoiceFrame(.9,500));assert.equal(renderer.elapsedMs,0);
    renderer.setPaused(true);const voice=renderer.frame.slice();renderer.setVoiceInput({active:false});browser.tick(40000);assert.deepEqual(renderer.frame,voice);
    renderer.setPaused(false);browser.tick(40010);browser.tick(40510);assert.deepEqual(renderer.frame,renderFrame(next,500));
    renderer.destroy();
  } finally {browser.restore();}
});

test('reduced-motion voice updates a held base through onFrame and stops redrawing between real inputs',()=>{
  const browser=browserHarness();
  try {
    let paints=0;const renderer=new LightRenderer(browser.canvas(),{onFrame:()=>paints++});
    renderer.setReducedMotion(true);renderer.setPlan(createPlan('wait',{motionPrimitive:'hold',loop:true}));assert.equal(browser.queue.size,0);
    const basePaints=paints;for(const level of[0,.2,.9])renderer.setVoiceInput({active:false,level});assert.equal(paints,basePaints);assert.equal(browser.queue.size,0);
    renderer.setVoiceInput({active:true,level:.2});assert.equal(browser.queue.size,1);browser.tick(0);browser.tick(500);
    assert.deepEqual(renderer.frame,renderVoiceFrame(.2,0,{reducedMotion:true}));assert.equal(browser.queue.size,0);
    renderer.setVoiceInput({active:true,level:.8});assert.equal(browser.queue.size,1);browser.tick(1000);
    assert.deepEqual(renderer.frame,renderVoiceFrame(.8,0,{reducedMotion:true}));assert.equal(browser.queue.size,0);assert.ok(paints>basePaints);
    renderer.destroy();
  } finally {browser.restore();}
});

test('hidden exit resumes its fade without hidden elapsed time and destroy ignores late voice levels',()=>{
  const browser=browserHarness();
  try {
    const renderer=new LightRenderer(browser.canvas());const base=createPlan('wait',{motionPrimitive:'hold',loop:true});renderer.setPlan(base);
    renderer.setVoiceInput({active:true,level:.8});browser.tick(0);browser.tick(500);browser.hidden(true);renderer.setVoiceInput({active:false});
    assert.equal(browser.queue.size,0);const voice=renderer.frame.slice();browser.tick(100000);assert.deepEqual(renderer.frame,voice);
    browser.hidden(false);assert.equal(browser.queue.size,1);browser.tick(100010);assert.deepEqual(renderer.frame,voice);browser.tick(100510);
    assert.deepEqual(renderer.frame,renderFrame(base,500));assert.equal(renderer.elapsedMs,500);assert.equal(browser.queue.size,0);
    renderer.destroy();const final=renderer.frame.slice();renderer.setVoiceInput({active:true,level:1});browser.tick(200000);assert.deepEqual(renderer.frame,final);assert.equal(browser.queue.size,0);
  } finally {browser.restore();}
});

test('a motion preference changed during manual pause takes effect once on resume',()=>{
  const browser=browserHarness();
  try {
    const renderer=new LightRenderer(browser.canvas());renderer.setPlan(createPlan('wait',{motionPrimitive:'hold',loop:true}));
    renderer.setVoiceInput({active:true,level:.7});browser.tick(0);browser.tick(500);renderer.setPaused(true);
    const frozen=renderer.frame.slice();renderer.setReducedMotion(true);assert.deepEqual(renderer.frame,frozen);assert.equal(browser.queue.size,0);
    renderer.setPaused(false);assert.deepEqual(renderer.frame,renderVoiceFrame(.7,500,{reducedMotion:true}));assert.equal(browser.queue.size,0);
    renderer.destroy();
  } finally {browser.restore();}
});
