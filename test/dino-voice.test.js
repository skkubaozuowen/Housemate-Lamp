import test from 'node:test';
import assert from 'node:assert/strict';
import { DinoVoice, extractWake } from '../public/lib/dino-voice.js';

const flush = async () => {for (let i = 0; i < 8; i++) await Promise.resolve();};
class Clock {
  time = 0; next = 1; jobs = new Map();
  setTimeout = (callback, delay) => {const id = this.next++; this.jobs.set(id, {callback, at:this.time + delay}); return id;};
  clearTimeout = id => this.jobs.delete(id);
  async tick(duration) {
    const end = this.time + duration;
    for (let i = 0; i < 10000; i++) {
      const next = [...this.jobs].filter(([, job]) => job.at <= end).sort((a,b) => a[1].at - b[1].at)[0];
      if (!next) {this.time = end; await flush(); return;}
      const [id, job] = next; this.time = job.at; this.jobs.delete(id); job.callback(); await flush();
    }
    throw new Error('Voice timer unexpectedly scheduled an unbounded loop.');
  }
}
class Recognition {
  starts = 0; stops = 0; aborts = 0;
  start() {this.starts++; this.onstart?.();}
  stop() {this.stops++;}
  abort() {this.aborts++;}
}
function event(segments, resultIndex = 0) {
  return {resultIndex, results:segments.map(([transcript, isFinal = false]) => Object.assign([{transcript}], {isFinal}))};
}
function fixture(t, options = {}) {
  const clock = new Clock(), instances = [], submits = [], states = [];
  const meter = {supported:true, active:false, starts:0, stops:0,
    async start() {this.starts++; this.active = true; return true;},
    stop() {this.stops++; this.active = false;}};
  const voice = new DinoVoice({recognitionFactory:() => {const native = new Recognition(); instances.push(native); return native;},
    meter, timers:clock, now:() => clock.time, onState:state => states.push({...state}),
    onSubmit:async text => {submits.push(text); return options.submit?.(text);}, ...options});
  t.after(() => voice.destroy());
  return {voice, clock, instances, meter:options.meter || meter, submits, states, current:() => instances.at(-1)};
}
async function enabled(t, options = {}) {
  const harness = fixture(t, options); assert.equal(await harness.voice.enable({language:'en-US'}), true); return harness;
}

test('voice starts only after explicit enable and configures one continuous recognizer', async t => {
  const harness = fixture(t);
  assert.equal(harness.voice.state.phase, 'off'); assert.equal(harness.meter.starts, 0); assert.equal(harness.instances.length, 0);
  assert.equal(harness.voice.beginTurn(), false);
  assert.equal(await harness.voice.enable({language:'ko-KR'}), true);
  assert.equal(harness.meter.starts, 1); assert.equal(harness.voice.state.phase, 'listening');
  const native = harness.current();
  assert.equal(native.lang, 'ko-KR'); assert.equal(native.continuous, true); assert.equal(native.interimResults, true); assert.equal(native.maxAlternatives, 1);
});

test('unsupported voice and denied microphone startup leave capture disabled', async t => {
  const unavailable = fixture(t, {recognitionFactory:null});
  assert.equal(await unavailable.voice.enable(), false); assert.equal(unavailable.meter.starts, 0);
  assert.equal(unavailable.voice.enabled, false); assert.equal(unavailable.voice.state.phase, 'error');
  const meter = {supported:true, active:false, stops:0, async start() {return false;}, stop() {this.stops++;}};
  const denied = fixture(t, {meter});
  assert.equal(await denied.voice.enable(), false); assert.equal(denied.instances.length, 0); assert.equal(meter.stops, 1);
  assert.equal(denied.voice.enabled, false);
});

test('off, pause and destroy during pending microphone permission cannot later start speech recognition', async t => {
  for (const action of ['off', 'pause', 'destroy']) {
    let grantPermission;
    const permission = new Promise(resolve => {grantPermission = resolve;});
    // Model MicrophoneMeter's own generation guard for a stream arriving late.
    const meter = {supported:true, active:false, generation:0, starts:0,
      async start() {this.starts++; const generation = ++this.generation; await permission; if (generation !== this.generation) return false; this.active = true; return true;},
      stop() {this.generation++; this.active = false;}};
    const harness = fixture(t, {meter});
    const starting = harness.voice.enable();
    assert.equal(harness.voice.state.phase, 'starting'); assert.equal(meter.starts, 1);
    assert.equal(harness.voice.beginTurn(), false);
    harness.voice[action](); grantPermission();
    assert.equal(await starting, false); assert.equal(meter.active, false); assert.equal(harness.instances.length, 0);
    await harness.clock.tick(70000); assert.deepEqual(harness.submits, []); assert.equal(harness.clock.jobs.size, 0);
  }
});

test('cumulative interim transcripts are replaced, removed and finalized without duplication', async t => {
  const {voice, current} = await enabled(t);
  const native = current();
  native.onresult(event([['Today']])); assert.equal(voice.state.transcript, 'Today');
  native.onresult(event([['Today is']])); assert.equal(voice.state.transcript, 'Today is');
  native.onresult(event([['Today is', true], ['wonderful']])); assert.equal(voice.state.transcript, 'Today is wonderful');
  native.onresult(event([['Today is', true]], 1)); assert.equal(voice.state.transcript, 'Today is');
  native.onresult(event([['Today is', true], ['wonderful', true]], 1));
  native.onresult(event([['Today is', true], ['wonderful', true]], 1)); assert.equal(voice.state.transcript, 'Today is wonderful');
});

test('actual microphone activity postpones the five-second quiet boundary and the text is submitted once', async t => {
  const harness = await enabled(t), native = harness.current();
  native.onresult(event([['A happy day']]));
  harness.voice.handleLevel({level:.7, voiced:true, at:12});
  await harness.clock.tick(4000);
  harness.voice.handleLevel({level:.4, voiced:true, at:123});
  await harness.clock.tick(4999); assert.equal(harness.voice.state.phase, 'listening'); assert.equal(harness.submits.length, 0);
  await harness.clock.tick(1); assert.equal(harness.voice.state.phase, 'finishing'); assert.equal(native.stops, 1);
  native.onresult(event([['A very happy day', true]]));
  await harness.clock.tick(1200); assert.deepEqual(harness.submits, ['A very happy day']);
  assert.equal(harness.voice.state.phase, 'standby');
  await harness.clock.tick(10000); assert.equal(harness.submits.length, 1);
});

test('meter timestamps use a different clock safely and unvoiced noise does not postpone sending', async t => {
  const harness = await enabled(t), native = harness.current();
  native.onresult(event([['Quietly spoken', true]]));
  harness.voice.handleLevel({level:.6, voiced:true, at:1700000000000});
  await harness.clock.tick(4000);
  harness.voice.handleLevel({level:.2, voiced:false, at:1700000004000});
  await harness.clock.tick(1000); assert.equal(harness.voice.state.phase, 'finishing');
  await harness.clock.tick(1200); assert.deepEqual(harness.submits, ['Quietly spoken']);
});

test('changed interim speech supplies activity fallback while final corrections do not reset quiet timing', async t => {
  const interim = await enabled(t), native = interim.current();
  native.onresult(event([['I feel']]));
  await interim.clock.tick(4000); native.onresult(event([['I feel happy']]));
  await interim.clock.tick(4999); assert.equal(interim.voice.state.phase, 'listening');
  await interim.clock.tick(1); assert.equal(interim.voice.state.phase, 'finishing');
  const final = await enabled(t), finalNative = final.current();
  finalNative.onresult(event([['I feel']]));
  await final.clock.tick(1000); final.voice.handleLevel({level:.4, voiced:true});
  await final.clock.tick(4000); finalNative.onresult(event([['I feel happy', true]]));
  await final.clock.tick(999); assert.equal(final.voice.state.phase, 'listening');
  await final.clock.tick(1); assert.equal(final.voice.state.phase, 'finishing');
});

test('a finalized correction beside an unchanged interim segment does not extend the silence deadline', async t => {
  const harness = await enabled(t), native = harness.current();
  native.onresult(event([['I think', true], ['today']]));
  await harness.clock.tick(4000);
  native.onresult(event([['I believe', true], ['today']], 0));
  await harness.clock.tick(1000); assert.equal(harness.voice.state.phase, 'finishing');
  await harness.clock.tick(1200); assert.deepEqual(harness.submits, ['I believe today']);
});

test('a natural recognition end during finalization commits the latest text without waiting or duplicating', async t => {
  const harness = await enabled(t), native = harness.current();
  native.onresult(event([['The draft']])); await harness.clock.tick(5000);
  native.onresult(event([['The final words', true]])); native.onend(); await flush();
  assert.deepEqual(harness.submits, ['The final words']); assert.equal(harness.voice.state.phase, 'standby');
  await harness.clock.tick(5000); assert.equal(harness.submits.length, 1);
});

test('cancel-to-standby discards only the voice turn and rejects stale results without an automatic submission', async t => {
  const harness = await enabled(t), old = harness.current();
  old.onresult(event([['Do not send this']]));
  const lateResult = old.onresult, lateEnd = old.onend;
  harness.voice.stopTurn({send:false});
  assert.equal(harness.voice.state.phase, 'standby'); assert.equal(harness.voice.enabled, true); assert.equal(harness.meter.active, true);
  lateResult(event([['Stale final text', true]])); lateEnd();
  await harness.clock.tick(12000);
  assert.deepEqual(harness.submits, []); assert.equal(harness.voice.state.transcript, '');
});

test('a new manual voice turn discards previous standby chatter', async t => {
  const harness = await enabled(t);
  harness.voice.stopTurn();
  const old = harness.current(); old.onresult(event([['Unrelated ambient speech', true]]));
  assert.equal(harness.voice.state.phase, 'standby');
  assert.equal(harness.voice.beginTurn(), true);
  harness.current().onresult(event([['Only this moment', true]]));
  await harness.clock.tick(6200); assert.deepEqual(harness.submits, ['Only this moment']);
});

test('wake matching requires an utterance prefix and excludes names embedded inside ordinary narration', () => {
  for (const [text, expected] of [
    ['Hi Dino, I feel happy.', 'I feel happy.'], ['HEY DINO! Hello again', 'Hello again'],
    ['哈喽迪诺，我今天很开心', '我今天很开心'], ['你好戴诺。今天真好', '今天真好'], ['하이 디노, 오늘 행복해요', '오늘 행복해요']
  ]) assert.deepEqual(extractWake(text), {matched:true, text:expected});
  for (const text of ['I said Hi Dino yesterday', 'A dinosaur is here', 'Hi dinosaur', '你好朋友，迪诺今天好吗']) assert.equal(extractWake(text).matched, false);
  assert.deepEqual(extractWake('Hi Dino'), {matched:true, text:''});
});

test('wake-only speech never reaches the AI and repeated wake revisions open just one clean turn', async t => {
  const harness = await enabled(t); harness.voice.stopTurn();
  const wake = harness.current();
  wake.onresult(event([['Hi Dino']])); assert.equal(harness.voice.state.phase, 'listening'); assert.equal(harness.voice.state.transcript, '');
  wake.onresult(event([['Hi Dino I feel good']]));
  wake.onresult(event([['Hi Dino I feel wonderful', true]]));
  assert.equal(harness.voice.state.transcript, 'I feel wonderful');
  await harness.clock.tick(6200); assert.deepEqual(harness.submits, ['I feel wonderful']);
  const secondWake = harness.current(); secondWake.onresult(event([['Hi Dino', true]]));
  await harness.clock.tick(61200); assert.equal(harness.submits.length, 1);
});

test('earlier non-wake final results in standby do not block a new wake utterance', async t => {
  const harness = await enabled(t); harness.voice.stopTurn();
  const wake = harness.current();
  wake.onresult(event([['Just testing the room', true]])); assert.equal(harness.voice.state.phase, 'standby');
  wake.onresult(event([['Just testing the room', true], ['Hi Dino, I am excited']], 1));
  assert.equal(harness.voice.state.phase, 'listening'); assert.equal(harness.voice.state.transcript, 'I am excited');
  await harness.clock.tick(6200); assert.deepEqual(harness.submits, ['I am excited']);
});

test('a wake greeting split across consecutive recognition segments still strips the whole prefix', async t => {
  const harness = await enabled(t); harness.voice.stopTurn();
  const wake = harness.current();
  wake.onresult(event([['Hi', true]])); assert.equal(harness.voice.state.phase, 'standby');
  wake.onresult(event([['Hi', true], ['Dino, I had a good day']], 1));
  assert.equal(harness.voice.state.transcript, 'I had a good day');
  await harness.clock.tick(6200); assert.deepEqual(harness.submits, ['I had a good day']);
});

test('Chinese and Korean turns use English wake detection, then restore the chosen language without stale wake text', async t => {
  for (const [language, words] of [['zh-CN', '把灯光换成蓝色'], ['ko-KR', '조명을 파란색으로 바꿔 줘']]) {
    const harness = fixture(t);
    assert.equal(await harness.voice.enable({language}), true); assert.equal(harness.current().lang, language);
    harness.voice.stopTurn();
    const wake = harness.current();
    assert.equal(wake.lang, 'en-US'); assert.equal(harness.voice.state.language, language);
    const stale = {result:wake.onresult, end:wake.onend, error:wake.onerror};
    const count = harness.instances.length;
    wake.onresult(event([['Hi Dino', true]]));
    assert.equal(harness.voice.state.phase, 'listening'); assert.equal(harness.voice.state.transcript, ''); assert.equal(wake.aborts, 1);
    await harness.clock.tick(149); assert.equal(harness.instances.length, count);
    await harness.clock.tick(1); const content = harness.current();
    assert.equal(harness.instances.length, count + 1); assert.equal(content.lang, language);
    stale.result(event([['Hi Dino, stale English words', true]])); stale.error({error:'network'}); stale.end();
    assert.equal(harness.voice.state.phase, 'listening'); assert.equal(harness.voice.state.transcript, '');
    // The 150 ms handoff places speech between the 100 ms silence polling ticks.
    content.onresult(event([[words, true]])); await harness.clock.tick(6300);
    assert.deepEqual(harness.submits, [words]); assert.equal(harness.current().lang, 'en-US');
    assert.equal(harness.voice.state.language, language);
  }
});

test('batched English wake segments keep their word boundaries when the chosen content language is Chinese', async t => {
  const harness = fixture(t); await harness.voice.enable({language:'zh-CN'}); harness.voice.stopTurn();
  harness.current().onresult(event([['Hi Dino', true], ['I feel happy']]));
  assert.equal(harness.voice.state.phase, 'listening'); assert.equal(harness.voice.state.transcript, 'I feel happy');
  await harness.clock.tick(150); assert.equal(harness.current().lang, 'zh-CN');
  await harness.clock.tick(6050); assert.deepEqual(harness.submits, ['I feel happy']);
});

test('the cross-language handoff preserves recognized remainder while excluding the wake prefix', async t => {
  const harness = fixture(t); await harness.voice.enable({language:'zh-CN'}); harness.voice.stopTurn();
  harness.current().onresult(event([['Hi Dino, 我很开心', true]]));
  assert.equal(harness.voice.state.transcript, '我很开心');
  await harness.clock.tick(150);
  harness.current().onresult(event([['今天是我的生日', true]]));
  assert.equal(harness.voice.state.transcript, '我很开心今天是我的生日');
  await harness.clock.tick(6200); assert.deepEqual(harness.submits, ['我很开心今天是我的生日']);
});

test('off, pause, destroy and turn cancellation during a language handoff cannot start a stale content recognizer', async t => {
  for (const action of ['off', 'pause', 'destroy', 'cancel']) {
    const harness = fixture(t); await harness.voice.enable({language:'zh-CN'}); harness.voice.stopTurn();
    const wake = harness.current(); wake.onresult(event([['Hi Dino', true]]));
    harness.voice[action]();
    const count = harness.instances.length;
    await harness.clock.tick(7000);
    assert.equal(harness.instances.length, count); assert.deepEqual(harness.submits, []);
    if (action === 'cancel') {assert.equal(harness.voice.state.phase, 'standby'); assert.equal(harness.current().lang, 'en-US');}
    else assert.equal(harness.voice.enabled, false);
  }
});

test('a mistaken Chinese restaurant name is not accepted as a broad wake alias', async t => {
  const harness = fixture(t); await harness.voice.enable({language:'zh-CN'}); harness.voice.stopTurn();
  harness.current().onresult(event([['海底捞把那个光换成蓝色', true]]));
  await harness.clock.tick(7000);
  assert.equal(harness.voice.state.phase, 'standby'); assert.equal(harness.voice.state.transcript, ''); assert.deepEqual(harness.submits, []);
  assert.equal(extractWake('海底捞把那个光换成蓝色').matched, false);
});

test('sending suspends speech recognition and an asynchronous completion returns to wake standby once', async t => {
  let complete;
  const pending = new Promise(resolve => {complete = resolve;});
  const harness = await enabled(t, {submit:() => pending}), old = harness.current();
  old.onresult(event([['A single turn', true]])); await harness.clock.tick(6200);
  assert.equal(harness.voice.state.phase, 'sending'); assert.equal(harness.instances.length, 1);
  assert.equal(harness.voice.beginTurn(), false);
  await harness.clock.tick(20000); assert.equal(harness.submits.length, 1); assert.equal(harness.instances.length, 1);
  complete(); await flush();
  assert.equal(harness.voice.state.phase, 'standby'); assert.equal(harness.instances.length, 2);
});

test('off while submission is pending prevents its completion from reopening the microphone', async t => {
  let complete;
  const harness = await enabled(t, {submit:() => new Promise(resolve => {complete = resolve;})});
  harness.current().onresult(event([['Do not reopen', true]])); await harness.clock.tick(6200);
  harness.voice.off(); complete(); await flush(); await harness.clock.tick(10000);
  assert.equal(harness.voice.state.phase, 'off'); assert.equal(harness.voice.enabled, false);
  assert.equal(harness.instances.length, 1); assert.equal(harness.meter.active, false); assert.equal(harness.clock.jobs.size, 0);
});

test('submission failure releases capture without retrying the same words automatically', async t => {
  const harness = await enabled(t, {submit:async () => {throw new Error('raw private provider error');}});
  harness.current().onresult(event([['Try this once', true]])); await harness.clock.tick(6200);
  assert.equal(harness.voice.enabled, false); assert.equal(harness.voice.state.phase, 'error'); assert.equal(harness.meter.active, false);
  assert.equal(harness.voice.state.message.includes('private provider'), false);
  await harness.clock.tick(20000); assert.deepEqual(harness.submits, ['Try this once']);
});

test('natural recognition endings restart with bounded backoff and retain text without duplication', async t => {
  const harness = await enabled(t, {silenceMs:100000, maxTurnMs:100000});
  const delays = [250, 500, 1000, 2000, 2000];
  harness.current().onresult(event([['First part', true]]));
  for (const delay of delays) {
    const count = harness.instances.length; harness.current().onend();
    await harness.clock.tick(delay - 1); assert.equal(harness.instances.length, count);
    await harness.clock.tick(1); assert.equal(harness.instances.length, count + 1);
  }
  harness.current().onresult(event([['second part', true]]));
  assert.equal(harness.voice.state.transcript, 'First part second part');
});

test('healthy repeated service timeouts preserve wake standby, while a rapid disconnect loop stops capture', async t => {
  const healthy = await enabled(t, {silenceMs:100000, maxTurnMs:100000}); healthy.voice.stopTurn();
  for (let i = 0; i < 10; i++) {
    await healthy.clock.tick(2000); const count = healthy.instances.length;
    healthy.current().onend(); await healthy.clock.tick(250);
    assert.equal(healthy.instances.length, count + 1); assert.equal(healthy.voice.enabled, true); assert.equal(healthy.voice.state.phase, 'standby');
  }
  const broken = await enabled(t, {silenceMs:100000, maxTurnMs:100000}); broken.voice.stopTurn();
  for (let i = 0; i < 12 && broken.voice.enabled; i++) {
    broken.current().onend(); await broken.clock.tick(2000);
  }
  assert.equal(broken.voice.enabled, false); assert.equal(broken.voice.state.phase, 'error'); assert.equal(broken.meter.active, false);
  assert.equal(broken.clock.jobs.size, 0); assert.deepEqual(broken.submits, []);
});

test('recognizer construction and startup failures release the already-acquired microphone', async t => {
  for (const failure of ['construction', 'start']) {
    const harness = fixture(t, {recognitionFactory:() => {
      if (failure === 'construction') throw new Error('raw constructor diagnostic');
      const native = new Recognition(); native.start = () => {throw new Error('raw start diagnostic');}; return native;
    }});
    assert.equal(await harness.voice.enable(), false); assert.equal(harness.voice.enabled, false);
    assert.equal(harness.voice.state.phase, 'error'); assert.equal(harness.meter.active, false);
    assert.equal(harness.voice.state.message.includes('raw '), false);
    await harness.clock.tick(10000); assert.deepEqual(harness.submits, []); assert.equal(harness.clock.jobs.size, 0);
  }
});

test('permission and network failures stop meter, retries and all stale recognizer callbacks', async t => {
  for (const error of ['not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'language-not-supported']) {
    const harness = await enabled(t), old = harness.current();
    const stale = {result:old.onresult, end:old.onend, start:old.onstart};
    old.onerror({error, message:'raw private diagnostic'});
    assert.equal(harness.voice.state.phase, 'error'); assert.equal(harness.voice.enabled, false); assert.equal(harness.meter.active, false);
    stale.start(); stale.result(event([['Too late', true]])); stale.end(); await harness.clock.tick(20000);
    assert.equal(harness.instances.length, 1); assert.deepEqual(harness.submits, []); assert.equal(harness.clock.jobs.size, 0);
    assert.equal(harness.voice.state.message.includes('private diagnostic'), false);
  }
});

test('pause and destroy release capture and never resume just because timers or stale events run', async t => {
  for (const action of ['pause', 'destroy']) {
    const harness = await enabled(t), old = harness.current();
    const lateResult = old.onresult, lateEnd = old.onend;
    old.onresult(event([['Do not send', true]])); harness.voice[action]();
    lateResult(event([['Stale correction', true]])); lateEnd(); await harness.clock.tick(70000);
    assert.equal(harness.voice.enabled, false); assert.equal(harness.meter.active, false); assert.deepEqual(harness.submits, []);
    assert.equal(harness.clock.jobs.size, 0); assert.equal(harness.instances.length, 1);
    if (action === 'destroy') assert.equal(await harness.voice.enable(), false);
  }
});

test('a turn is bounded by both maximum length and maximum recording duration', async t => {
  const length = await enabled(t, {maxLength:4});
  length.current().onresult(event([['abcdef']])); assert.equal(length.voice.state.transcript, 'abcd'); assert.equal(length.voice.state.phase, 'finishing');
  await length.clock.tick(1200); assert.deepEqual(length.submits, ['abcd']);
  const duration = await enabled(t, {maxTurnMs:1000});
  duration.current().onresult(event([['One bounded thought', true]]));
  await duration.clock.tick(999); assert.equal(duration.voice.state.phase, 'listening');
  await duration.clock.tick(1); assert.equal(duration.voice.state.phase, 'finishing');
  await duration.clock.tick(1200); assert.deepEqual(duration.submits, ['One bounded thought']);
});

test('invalid or excessive amplitude values cannot create an invalid orb level', async t => {
  const {voice} = await enabled(t);
  for (const [level, expected] of [[NaN,0], [Infinity,0], [-1,0], [2,1], [.4,.4]]) {
    voice.handleLevel({level, voiced:false}); assert.equal(voice.state.level, expected);
  }
});
