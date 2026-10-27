import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDinoVoice } from '../public/lib/dino-voice.js';

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const result = text => ({ resultIndex:0, results:[Object.assign([{transcript:text}], {isFinal:true})] });

class Target {
  listeners = new Map();
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  fire(type, values = {}) { for (const fn of [...(this.listeners.get(type) || [])]) fn({type,target:this,...values}); }
}
class Element extends Target {
  hidden = false; disabled = false; value = ''; textContent = ''; dataset = {}; attributes = new Map();
  classes = new Set(); properties = new Map(); focused = false;
  classList = {toggle:(name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name), contains:name => this.classes.has(name)};
  style = {setProperty:(name, value) => this.properties.set(name, value), getPropertyValue:name => this.properties.get(name) || ''};
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name); }
  click() { if (!this.disabled) this.fire('click'); }
  focus(options) { this.focused = true; this.focusOptions = options; }
}
class Clock {
  time = 0; next = 1; jobs = new Map();
  setTimeout = (callback, delay) => { const id = this.next++; this.jobs.set(id, {at:this.time+delay,callback}); return id; };
  clearTimeout = id => this.jobs.delete(id);
  tick(duration) {
    const end = this.time + duration;
    for (let count = 0; count < 1000; count++) {
      const next = [...this.jobs].filter(([,job]) => job.at <= end).sort((a,b) => a[1].at-b[1].at)[0];
      if (!next) { this.time = end; return; }
      const [id,job] = next; this.time = job.at; this.jobs.delete(id); job.callback();
    }
    throw new Error('Unexpected repeated voice restart.');
  }
}
function harness(t, {secure = true, recognition = true, microphone = true, permission} = {}) {
  const ids = ['voice-button','voice-label','voice-status','voice-language','question','dino-stage','dino-title','dino-transcript','dino-caption','dino-countdown','dino-controls','dino-wake-status','dino-listen','dino-off','dino-send','dino-cancel','dino-type'];
  const elements = new Map(ids.map(id => [id,new Element()]));
  const document = Object.assign(new Target(), {hidden:false,body:new Element(),getElementById:id => elements.get(id) || null});
  const window = Object.assign(new Target(), {isSecureContext:secure});
  const instances = [], contexts = [], streams = [], calls = [], submitted = [], states = [], raf = new Map();
  let rafId = 0;
  const makeStream = () => {
    const track = Object.assign(new Target(), {readyState:'live',stops:0,stop(){this.stops++;this.readyState='ended';this.fire('ended');}});
    const stream = {track,getTracks:() => [track],getAudioTracks:() => [track]};
    streams.push(stream); return stream;
  };
  window.navigator = {mediaDevices:microphone ? {getUserMedia(options){calls.push(options); return permission ? permission.promise : Promise.resolve(makeStream());}} : null};
  class Context extends Target {
    state = 'running'; closes = 0; destination = {speaker:true};
    constructor() { super(); contexts.push(this); }
    async resume() { this.state = 'running'; }
    createMediaStreamSource(stream) {
      this.stream = stream;
      return this.source = {connections:[],disconnects:0,connect(node){this.connections.push(node);},disconnect(){this.disconnects++;}};
    }
    createAnalyser() {
      return this.analyser = {fftSize:0,disconnects:0,getFloatTimeDomainData(buffer){for(let i=0;i<buffer.length;i++)buffer[i]=0.07*Math.sin(2*Math.PI*i/32);},disconnect(){this.disconnects++;}};
    }
    async close() { this.closes++; this.state = 'closed'; this.fire('statechange'); }
  }
  window.AudioContext = Context;
  window.requestAnimationFrame = fn => { const id = ++rafId; raf.set(id,fn); return id; };
  window.cancelAnimationFrame = id => raf.delete(id);
  if (recognition) window.SpeechRecognition = class {
    starts = 0; stops = 0; aborts = 0;
    constructor() { instances.push(this); }
    start() { this.starts++; this.onstart?.(); }
    stop() { this.stops++; }
    abort() { this.aborts++; this.onend?.(); }
  };
  elements.get('voice-language').value = 'zh-CN';
  elements.get('question').value = 'Keep this typed draft.';
  const voice = setupDinoVoice({document,window,onSubmit:async text => {submitted.push(text);},onState:state => states.push({...state})});
  const clock = new Clock(); voice.timers = clock; voice.now = () => clock.time;
  t.after(() => voice.destroy());
  return {voice,clock,document,window,instances,contexts,streams,calls,submitted,states,raf,makeStream,$:id => elements.get(id),
    async enable(language = 'zh-CN') { elements.get('voice-language').value=language; elements.get('voice-button').click(); await flush(); },
    sample() { const callbacks=[...raf.values()];raf.clear();for(const fn of callbacks)fn(0); }
  };
}

test('unsupported and insecure Dino leave the typed composer usable without microphone access', async t => {
  for (const options of [{secure:false},{recognition:false},{microphone:false}]) {
    const h = harness(t,options);
    assert.equal(h.$('voice-button').disabled,true);
    assert.equal(h.$('question').disabled,false); assert.equal(h.$('question').value,'Keep this typed draft.');
    assert.equal(h.$('dino-stage').hidden,true); assert.equal(h.$('dino-controls').hidden,true);
    h.$('voice-button').click(); await flush();
    assert.equal(h.calls.length,0); assert.equal(h.instances.length,0);
    assert.match(h.$('voice-status').textContent,/unavailable|Chrome/i);
  }
});

test('explicit Dino enable wires actual meter samples, recognition and inline controls without changing typed text', async t => {
  const h = harness(t);
  assert.equal(h.calls.length,0); assert.equal(h.instances.length,0); assert.equal(h.raf.size,0);
  await h.enable('ko-KR');
  assert.equal(h.calls.length,1); assert.equal(h.calls[0].video,false); assert.ok(h.calls[0].audio);
  assert.equal(h.voice.state.phase,'listening'); assert.equal(h.instances[0].lang,'ko-KR');
  assert.equal(h.instances[0].continuous,true); assert.equal(h.instances[0].interimResults,true);
  assert.equal(h.$('dino-stage').hidden,false); assert.equal(h.document.body.classList.contains('dino-speaking'),true);
  assert.equal(h.$('voice-button').getAttribute('aria-pressed'),'true'); assert.equal(h.$('voice-language').disabled,true);
  assert.equal(h.$('dino-controls').hidden,false); assert.equal(h.$('dino-send').disabled,true);
  h.sample();
  assert.ok(h.states.at(-1).level>0,'The shared light renderer receives amplitude from the supplied PCM samples.');
  assert.equal(h.states.at(-1).phase,'listening');
  assert.deepEqual(h.contexts[0].source.connections,[h.contexts[0].analyser],'No microphone audio is connected to a speaker.');
  h.instances[0].onresult(result('오늘 행복해요'));
  assert.equal(h.$('dino-transcript').textContent,'오늘 행복해요'); assert.equal(h.$('dino-send').disabled,false);
  assert.equal(h.$('question').value,'Keep this typed draft.'); assert.deepEqual(h.submitted,[]);
});

test('manual editing cancels a pending spoken turn to standby and preserves the user draft', async t => {
  const h = harness(t); await h.enable();
  const old = h.instances[0], stale = {result:old.onresult,end:old.onend,error:old.onerror};
  old.onresult(result('今天很开心'));
  h.$('question').value='My corrected typed draft.'; h.$('question').fire('input');
  assert.equal(h.voice.state.phase,'standby'); assert.equal(h.$('dino-stage').hidden,true);
  assert.equal(h.$('question').value,'My corrected typed draft.'); assert.equal(old.aborts,1);
  assert.equal(h.voice.enabled,true); assert.equal(h.streams[0].track.stops,0,'Visible standby intentionally keeps wake listening enabled.');
  assert.equal(h.$('dino-listen').disabled,false);
  stale.result(result('Do not overwrite')); stale.end(); stale.error({error:'network'}); h.clock.tick(10000); await flush();
  assert.equal(h.voice.state.phase,'standby'); assert.equal(h.$('question').value,'My corrected typed draft.'); assert.deepEqual(h.submitted,[]);
});

test('Dino language and send/cancel/type controls operate on the selected turn', async t => {
  const h = harness(t);
  for (const language of ['zh-CN','ko-KR','en-US']) {
    await h.enable(language); assert.equal(h.instances.at(-1).lang,language);
    h.$('dino-off').click(); assert.equal(h.$('voice-language').disabled,false);
  }
  await h.enable('en-US');
  h.instances.at(-1).onresult(result('A cancelled thought')); h.$('dino-cancel').click();
  assert.equal(h.voice.state.phase,'standby'); assert.deepEqual(h.submitted,[]);
  h.$('dino-listen').click(); assert.equal(h.voice.state.phase,'listening');
  const sending = h.instances.at(-1); sending.onresult(result('I feel happy')); h.$('dino-send').click();
  assert.equal(h.voice.state.phase,'finishing'); assert.equal(sending.stops,1);
  sending.onend(); await flush();
  assert.deepEqual(h.submitted,['I feel happy']); assert.equal(h.voice.state.phase,'standby');
  h.$('dino-listen').click(); h.$('dino-type').click();
  assert.equal(h.voice.state.phase,'standby'); assert.equal(h.$('question').focused,true);
  assert.deepEqual(h.$('question').focusOptions,{preventScroll:true});
  assert.equal(h.$('question').value,'Keep this typed draft.');
});

test('hidden, Escape, off and destroy release capture and ignore old callbacks without restarting', async t => {
  for (const mode of ['hidden','escape','off','destroy']) {
    const h = harness(t); await h.enable();
    const old = h.instances[0], stale = {start:old.onstart,result:old.onresult,end:old.onend,error:old.onerror};
    if(mode==='hidden'){h.document.hidden=true;h.document.fire('visibilitychange');}
    if(mode==='escape')h.document.fire('keydown',{key:'Escape'});
    if(mode==='off')h.$('dino-off').click();
    if(mode==='destroy')h.voice.destroy();
    assert.equal(h.voice.enabled,false,mode); assert.equal(h.streams[0].track.stops,1,mode);
    assert.equal(h.states.at(-1).enabled,false,`${mode} releases the shared voice light`);
    assert.equal(h.states.at(-1).level,0,`${mode} clears the last microphone level`);
    assert.equal(h.contexts[0].closes,1,mode); assert.equal(h.raf.size,0,mode); assert.equal(h.clock.jobs.size,0,mode);
    assert.equal(old.aborts,1,mode); assert.equal(h.$('dino-stage').hidden,true,mode);
    assert.equal(h.$('dino-controls').hidden,true,mode); assert.equal(h.document.body.classList.contains('dino-speaking'),false,mode);
    stale.start();stale.result(result('Stale speech'));stale.end();stale.error({error:'network'});
    h.document.hidden=false;h.document.fire('visibilitychange');h.window.fire('focus');h.clock.tick(30000);await flush();
    if(mode==='destroy')h.$('voice-button').click();
    assert.equal(h.calls.length,1,mode); assert.equal(h.instances.length,1,mode); assert.equal(h.voice.enabled,false,mode);
    assert.equal(h.$('question').value,'Keep this typed draft.',mode); assert.deepEqual(h.submitted,[],mode);
  }
});

test('hiding during microphone permission releases a late granted stream without creating recognition', async t => {
  let resolve;
  const permission={promise:new Promise(done => {resolve=done;})};
  const h = harness(t,{permission});
  h.$('voice-button').click(); await flush(); assert.equal(h.voice.state.phase,'starting');
  h.document.hidden=true;h.document.fire('visibilitychange');
  const stream=h.makeStream();resolve(stream);await flush();
  assert.equal(stream.track.stops,1);assert.equal(h.contexts.length,0);assert.equal(h.instances.length,0);
  assert.equal(h.voice.enabled,false);assert.equal(h.voice.state.phase,'paused');assert.equal(h.raf.size,0);
  assert.equal(h.$('question').value,'Keep this typed draft.');
});
