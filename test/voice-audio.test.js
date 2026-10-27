import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLevel, MicrophoneMeter } from '../public/lib/voice-audio.js';

function sine(amplitude, dc=0) {
  return Float32Array.from({length:1024}, (_, i) => dc + amplitude * Math.sin(2*Math.PI*i/32));
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve=yes; reject=no; });
  return { promise, resolve, reject };
}
class Events {
  constructor() { this.listeners=new Map(); }
  addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name,new Set()); this.listeners.get(name).add(fn); }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  fire(name) { for (const fn of [...(this.listeners.get(name)||[])]) fn(); }
}
function harness({permission, resumeError, initialState='running', resumeGate, sourceError=false}={}) {
  const tracks=[Object.assign(new Events(),{kind:'audio',readyState:'live',stops:0,stop(){this.stops++;this.readyState='ended';this.fire('ended');}})];
  const stream={getTracks:()=>tracks,getAudioTracks:()=>tracks};
  const levels=[], errors=[], calls=[], contexts=[], queue=new Map();
  let id=0, clock=0, samples=sine(0.03);
  const document=Object.assign(new Events(),{hidden:false});
  class Context extends Events {
    constructor() { super();this.state=initialState;this.closeCalls=0;this.destination={speaker:true};contexts.push(this); }
    async resume() { if(resumeError)throw resumeError;if(resumeGate)await resumeGate.promise; }
    createMediaStreamSource(value) { assert.equal(value,stream);if(sourceError)throw new Error('source failed');this.source={connections:[],disconnections:0,connect(target){this.connections.push(target);},disconnect(){this.disconnections++;}};return this.source; }
    createAnalyser() { this.analyser={fftSize:0,disconnections:0,reads:0,getFloatTimeDomainData(buffer){this.reads++;buffer.set(samples);},disconnect(){this.disconnections++;}};return this.analyser; }
    async close() { this.closeCalls++;this.state='closed';this.fire('statechange'); }
  }
  const mediaDevices={getUserMedia(options){calls.push(options);return permission?permission.promise:Promise.resolve(stream);}};
  const meter=new MicrophoneMeter({mediaDevices,AudioContextClass:Context,onLevel:value=>levels.push(value),onError:error=>errors.push(error),document,
    raf:fn=>{const next=++id;queue.set(next,fn);return next;},cancelRaf:next=>queue.delete(next),now:()=>clock});
  return {meter,stream,tracks,levels,errors,calls,contexts,queue,document,
    sample(value){samples=value;},tick(at){clock=at;const callbacks=[...queue.values()];queue.clear();for(const fn of callbacks)fn(at);}};
}

test('RMS removes DC, uses genuine intensity, and normalizes gentle speech',()=>{
  assert.deepEqual(calculateLevel(new Float32Array(1024).fill(0.75)),{rms:0,level:0,voiced:false});
  const quiet=calculateLevel(sine(0.01)),gentle=calculateLevel(sine(0.035)),loud=calculateLevel(sine(0.18));
  assert.equal(quiet.level,0);assert.equal(quiet.voiced,false);
  assert.ok(quiet.rms<gentle.rms&&gentle.rms<loud.rms);
  assert.ok(gentle.level>0&&gentle.level<loud.level);assert.equal(gentle.voiced,true);assert.equal(loud.level,1);
  assert.ok(Math.abs(gentle.rms-calculateLevel(sine(0.035,0.4)).rms)<1e-7);
  assert.ok(Math.abs(calculateLevel(sine(0.035)).rms-0.035/Math.sqrt(2))<1e-7);
});

test('empty, invalid, and clipped inputs never produce nonfinite levels',()=>{
  for(const sample of [new Float32Array(),new Float32Array([NaN,1]),new Float32Array([Infinity,-Infinity]),undefined]) {
    assert.deepEqual(calculateLevel(sample),{rms:0,level:0,voiced:false});
  }
  const clipped=calculateLevel(new Float32Array([-1e30,1e30]));
  assert.ok(Number.isFinite(clipped.rms));assert.equal(clipped.level,1);
});

test('explicit start attaches an analyser without speakers and emits measured samples at no more than 30 fps',async()=>{
  const h=harness();assert.equal(h.meter.supported,true);assert.equal(h.meter.active,false);assert.equal(h.calls.length,0);
  const first=h.meter.start();assert.equal(first,h.meter.start());assert.equal(await first,true);assert.equal(h.meter.active,true);
  assert.deepEqual(h.calls,[{audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false}]);
  const context=h.contexts[0];assert.deepEqual(context.source.connections,[context.analyser]);assert.equal(context.analyser.fftSize,1024);
  h.tick(0);h.tick(16);h.tick(34);assert.equal(h.levels.length,2);assert.equal(context.analyser.reads,2);
  assert.ok(h.levels.every(value=>value.rms>0&&value.voiced&&value.level>0&&Number.isFinite(value.at)));
  const soft=h.levels.at(-1).level;h.sample(sine(0.18));h.tick(68);h.tick(102);assert.ok(h.levels.at(-1).level>soft);
  h.sample(new Float32Array(1024));h.tick(136);assert.equal(h.levels.at(-1).voiced,false);assert.equal(h.levels.at(-1).rms,0);
  h.meter.stop();h.meter.stop();assert.equal(h.queue.size,0);assert.equal(h.meter.active,false);assert.equal(h.tracks[0].stops,1);
  assert.equal(context.source.disconnections,1);assert.equal(context.analyser.disconnections,1);assert.equal(context.closeCalls,1);assert.equal(h.errors.length,0);
});

test('stop during permission promptly discards the late stream and never creates an audio context',async()=>{
  const permission=deferred(),h=harness({permission});const result=h.meter.start();h.meter.stop();permission.resolve(h.stream);
  assert.equal(await result,false);assert.equal(h.tracks[0].stops,1);assert.equal(h.contexts.length,0);assert.equal(h.queue.size,0);assert.equal(h.errors.length,0);
});

test('resume failure and a context remaining suspended both release microphone resources',async()=>{
  for(const options of [{resumeError:new Error('private driver text')},{initialState:'suspended'},{sourceError:true}]) {
    const h=harness(options);assert.equal(await h.meter.start(),false);assert.equal(h.meter.active,false);assert.equal(h.tracks[0].stops,1);
    assert.equal(h.contexts[0].closeCalls,1);assert.equal(h.queue.size,0);assert.equal(h.errors.length,1);assert.ok(!h.errors[0].message.includes('private driver'));
  }
});

test('stop while AudioContext resume is pending cannot restart sampling',async()=>{
  const resumeGate=deferred(),h=harness({resumeGate});const result=h.meter.start();await Promise.resolve();h.meter.stop();resumeGate.resolve();
  assert.equal(await result,false);assert.equal(h.tracks[0].stops,1);assert.equal(h.contexts[0].closeCalls,1);assert.equal(h.queue.size,0);assert.equal(h.errors.length,0);
});

test('ended tracks and suspended audio fail once, release the stream, and never emit invented activity',async()=>{
  for(const mode of ['ended','suspended','hidden']) {
    const h=harness();await h.meter.start();h.tick(0);const count=h.levels.length;
    if(mode==='ended'){h.tracks[0].fire('ended');h.tracks[0].fire('ended');}
    if(mode==='suspended'){h.contexts[0].state='suspended';h.contexts[0].fire('statechange');h.contexts[0].fire('statechange');}
    if(mode==='hidden'){h.document.hidden=true;h.document.fire('visibilitychange');}
    h.tick(1000);assert.equal(h.errors.length,1);assert.equal(h.meter.active,false);assert.equal(h.tracks[0].stops,1);assert.equal(h.levels.length,count);assert.equal(h.queue.size,0);
  }
});

test('permission denial and missing APIs report safe errors without opening anything else',async()=>{
  const permission=deferred(),h=harness({permission});const result=h.meter.start();permission.reject(Object.assign(new Error('device internals'),{name:'NotAllowedError',code:18}));
  assert.equal(await result,false);assert.equal(h.errors[0].code,'permission');assert.equal(h.contexts.length,0);assert.ok(!h.errors[0].message.includes('internals'));
  const errors=[];const unsupported=new MicrophoneMeter({mediaDevices:null,AudioContextClass:null,onError:error=>errors.push(error)});
  assert.equal(unsupported.supported,false);assert.equal(await unsupported.start(),false);assert.equal(errors[0].code,'unsupported');
});

test('a previously dispatched RAF cannot erase the new session cancellation handle',async()=>{
  const h=harness();await h.meter.start();const stale=[...h.queue.values()][0];h.meter.stop();
  // A new getUserMedia acquisition normally supplies a fresh live track.
  h.tracks[0].readyState='live';await h.meter.start();assert.equal(h.queue.size,1);
  stale();h.meter.stop();assert.equal(h.queue.size,0);assert.equal(h.errors.length,0);
});
