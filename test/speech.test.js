import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechInput, setupSpeechInput } from '../public/lib/speech.js';

class Clock {
  time = 0; next = 1; jobs = new Map();
  setTimeout = (callback, delay) => {const id = this.next++; this.jobs.set(id, {callback, at:this.time + delay}); return id;};
  clearTimeout = id => this.jobs.delete(id);
  tick(duration) {
    const end = this.time + duration;
    for (let i = 0; i < 100; i++) {
      const next = [...this.jobs].filter(([, job]) => job.at <= end).sort((a,b) => a[1].at - b[1].at)[0];
      if (!next) {this.time = end; return;}
      const [id, job] = next; this.time = job.at; this.jobs.delete(id); job.callback();
    }
    throw new Error('Speech timers unexpectedly restarted repeatedly.');
  }
}
class Recognition {
  starts = 0; stops = 0; aborts = 0;
  start() {this.starts++;}
  stop() {this.stops++;}
  abort() {this.aborts++;}
}
const results = (...segments) => ({results:segments.map(([transcript, isFinal = false]) => Object.assign([{transcript}], {isFinal})), resultIndex:0});
function fixture(t, options = {}) {
  const instances = [], text = [], states = [], clock = new Clock();
  const speech = new SpeechInput({
    recognitionFactory:() => {const recognition = new Recognition(); instances.push(recognition); return recognition;},
    onText:(value, meta) => text.push({value, meta}), onState:state => states.push({...state}), timers:clock, ...options
  });
  t.after(() => speech.destroy());
  return {speech, instances, text, states, clock, value:() => text.at(-1)?.value};
}
function listening(harness, options = {}) {
  assert.equal(harness.speech.start({text:'', language:'zh-CN', ...options}), true);
  const recognition = harness.instances.at(-1); recognition.onstart(); return recognition;
}

test('unsupported speech leaves text entry usable and never attempts microphone capture', t => {
  const {speech, instances, text} = fixture(t, {recognitionFactory:null});
  assert.equal(speech.supported, false); assert.equal(speech.state.phase, 'unsupported');
  assert.equal(speech.start({text:'Keep my draft', language:'zh-CN'}), false);
  speech.stop(); speech.cancel();
  assert.equal(speech.active, false); assert.equal(instances.length, 0); assert.deepEqual(text, []);
});

test('recognition is lazy, starts only when requested, and exposes accurate listening state', t => {
  const {speech, instances} = fixture(t);
  assert.equal(speech.supported, true); assert.equal(speech.active, false); assert.equal(instances.length, 0);
  assert.equal(speech.start({text:'', language:'ko-KR'}), true);
  const recognition = instances[0];
  assert.equal(recognition.starts, 1); assert.equal(recognition.lang, 'ko-KR');
  assert.equal(recognition.continuous, true); assert.equal(recognition.interimResults, true); assert.equal(recognition.maxAlternatives, 1);
  assert.equal(speech.state.phase, 'starting'); assert.equal(speech.active, true);
  assert.equal(speech.start({text:'', language:'en-US'}), false); assert.equal(instances.length, 1);
  recognition.onstart(); assert.equal(speech.state.phase, 'listening'); assert.equal(speech.active, true);
});

test('all supported languages configure the recognition service without silently auto-restarting it', t => {
  const harness = fixture(t);
  for (const language of ['zh-CN', 'ko-KR', 'en-US']) {
    const recognition = listening(harness, {language});
    assert.equal(recognition.lang, language); recognition.onend();
    assert.equal(harness.speech.active, false); assert.equal(recognition.starts, 1);
  }
  assert.equal(harness.instances.length, 3);
  if (harness.speech.start({text:'', language:'invalid-language'})) assert.ok(['zh-CN', 'ko-KR', 'en-US'].includes(harness.instances.at(-1).lang));
});

test('cumulative speech results replace interim guesses and never duplicate finalized segments', t => {
  const harness = fixture(t), recognition = listening(harness);
  recognition.onresult(results(['今天'])); assert.equal(harness.value(), '今天');
  recognition.onresult(results(['今天天气'])); assert.equal(harness.value(), '今天天气');
  recognition.onresult(results(['今天天气', true], ['很好'])); assert.equal(harness.value(), '今天天气很好');
  const repeated = results(['今天天气', true], ['很好']); repeated.resultIndex = 1;
  recognition.onresult(repeated); assert.equal(harness.value(), '今天天气很好');
  recognition.onresult(results(['今天天气', true], ['特别好', true])); assert.equal(harness.value(), '今天天气特别好');
  recognition.onresult(results(['今天天气', true], ['特别好', true])); assert.equal(harness.value(), '今天天气特别好');
});

test('a removed interim result disappears from the draft instead of becoming permanent text', t => {
  const harness = fixture(t), recognition = listening(harness, {language:'en-US'});
  recognition.onresult(results(['Today', true], ['was difficult'])); assert.equal(harness.value(), 'Today was difficult');
  recognition.onresult(results(['Today', true])); assert.equal(harness.value(), 'Today');
  recognition.onresult(results(['Today', true], ['was wonderful', true])); assert.equal(harness.value(), 'Today was wonderful');
});

test('English and Korean segments are separated while Chinese segments remain connected', t => {
  const harness = fixture(t);
  for (const [language, segments, expected] of [
    ['en-US', [['I feel', true], ['happy', true]], 'I feel happy'],
    ['ko-KR', [['오늘', true], ['행복해요', true]], '오늘 행복해요'],
    ['zh-CN', [['今天', true], ['很开心', true]], '今天很开心']
  ]) {
    const recognition = listening(harness, {language}); recognition.onresult(results(...segments));
    assert.equal(harness.value(), expected); harness.speech.cancel();
  }
});

test('dictation replaces only the selected text and subsequent results reuse the original caret anchors', t => {
  const harness = fixture(t), recognition = listening(harness, {text:'Hello world!', selectionStart:6, selectionEnd:11, language:'en-US'});
  recognition.onresult(results(['friend'])); assert.equal(harness.value(), 'Hello friend!');
  recognition.onresult(results(['everyone', true])); assert.equal(harness.value(), 'Hello everyone!');
  harness.speech.cancel();
  const chinese = listening(harness, {text:'今天：。', selectionStart:3, selectionEnd:3});
  chinese.onresult(results(['很开心', true])); assert.equal(harness.value(), '今天：很开心。');
});

test('the 2000-character limit includes the existing draft and stops capture when filled', t => {
  const harness = fixture(t), recognition = listening(harness, {text:'x'.repeat(1998), selectionStart:1998, selectionEnd:1998});
  recognition.onresult(results(['快乐每一天']));
  assert.equal(harness.value().length, 2000); assert.equal(harness.value(), 'x'.repeat(1998) + '快乐');
  assert.equal(recognition.stops + recognition.aborts > 0, true);
});

test('repeated interim results at the limit do not discard the final correction while Stop is pending', t => {
  const harness = fixture(t, {maxLength:3}), recognition = listening(harness, {language:'en-US'});
  recognition.onresult(results(['abcde'])); assert.equal(harness.value(), 'abc'); assert.equal(recognition.stops, 1);
  const finalResult = recognition.onresult;
  recognition.onresult(results(['abcf']));
  finalResult(results(['xyz', true]));
  assert.equal(harness.value(), 'xyz'); assert.equal(recognition.stops, 1);
});

test('replacing a selection frees capacity without discarding the untouched draft', t => {
  const harness = fixture(t), recognition = listening(harness, {text:'x'.repeat(2000), selectionStart:1990, selectionEnd:2000, language:'en-US'});
  recognition.onresult(results(['abc', true]));
  assert.equal(harness.value(), 'x'.repeat(1990) + 'abc'); assert.equal(harness.value().length, 1993);
});

test('Stop waits for a late final result and end preserves the reviewable draft', t => {
  const harness = fixture(t), recognition = listening(harness);
  recognition.onresult(results(['我很开']));
  harness.speech.stop(); assert.equal(recognition.stops, 1); assert.equal(harness.speech.state.phase, 'stopping');
  recognition.onresult(results(['我很开心', true])); assert.equal(harness.value(), '我很开心');
  recognition.onend();
  assert.equal(harness.speech.active, false); assert.equal(harness.speech.state.phase, 'idle'); assert.equal(harness.value(), '我很开心');
  assert.equal(recognition.starts, 1, 'A completed utterance must never silently resume recording.');
});

test('Stop during pending permission cancels and ignores a delayed browser start or result', t => {
  const harness = fixture(t);
  harness.speech.start({text:'Original draft', language:'en-US'});
  const recognition = harness.instances[0], lateStart = recognition.onstart, lateResult = recognition.onresult;
  harness.speech.stop(); assert.equal(harness.speech.active, false); assert.equal(recognition.aborts, 1);
  lateStart(); lateResult(results(['must not appear', true]));
  assert.equal(harness.speech.active, false); assert.deepEqual(harness.text, []);
});

test('cancel retains visible draft and invalidates all late events after reset, edit or submission', t => {
  for (const reason of ['New moment', 'Manual edit', 'Share', 'Language changed', 'Page hidden']) {
    const harness = fixture(t), recognition = listening(harness);
    recognition.onresult(results(['已经说的文字']));
    const late = {start:recognition.onstart, result:recognition.onresult, error:recognition.onerror, end:recognition.onend};
    harness.speech.cancel(reason);
    const count = harness.text.length;
    late.start(); late.result(results(['过期识别结果', true])); late.error({error:'network'}); late.end();
    assert.equal(harness.value(), '已经说的文字'); assert.equal(harness.text.length, count);
    assert.equal(harness.speech.active, false); assert.equal(recognition.aborts, 1);
  }
});

test('late events from a cancelled session cannot change the replacement session', t => {
  const harness = fixture(t), old = listening(harness);
  const stale = {start:old.onstart, result:old.onresult, error:old.onerror, end:old.onend};
  harness.speech.cancel();
  const current = listening(harness, {language:'en-US'});
  stale.start(); stale.result(results(['stale text', true])); stale.error({error:'not-allowed'}); stale.end();
  assert.equal(harness.speech.state.phase, 'listening'); assert.deepEqual(harness.text, []);
  current.onresult(results(['Current speech', true])); assert.equal(harness.value(), 'Current speech');
});

test('end without a final result keeps the visible interim draft for manual review', t => {
  const harness = fixture(t), recognition = listening(harness);
  recognition.onresult(results(['还没完全识别的文字'])); recognition.onend();
  assert.equal(harness.value(), '还没完全识别的文字'); assert.equal(harness.speech.active, false);
  harness.clock.tick(120000); assert.equal(harness.instances.length, 1); assert.equal(recognition.starts, 1);
});

test('permission, device and recognition errors preserve the draft and do not expose raw browser messages', t => {
  for (const error of ['not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'no-speech', 'language-not-supported', 'aborted', 'unknown-code']) {
    const harness = fixture(t), recognition = listening(harness, {language:'en-US'});
    recognition.onresult(results(['Keep this draft']));
    recognition.onerror({error, message:'raw provider diagnostic must not appear'});
    assert.equal(harness.value(), 'Keep this draft'); assert.equal(harness.speech.active, false);
    assert.equal(typeof harness.speech.state.message, 'string');
    assert.equal(harness.speech.state.message.includes('raw provider diagnostic'), false);
    const message = harness.speech.state.message;
    recognition.onend?.(); assert.equal(harness.speech.state.message, message);
    harness.clock.tick(120000); assert.equal(harness.instances.length, 1); assert.equal(recognition.starts, 1);
  }
});

test('constructor and start failures settle without capture retries or draft mutation', t => {
  for (const failure of ['factory', 'start']) {
    let created = 0;
    const harness = fixture(t, {recognitionFactory:() => {
      created++;
      if (failure === 'factory') throw new Error('private constructor diagnostic');
      const recognition = new Recognition(); recognition.start = () => {throw new Error('private start diagnostic');}; return recognition;
    }});
    assert.equal(harness.speech.start({text:'Keep original', language:'en-US'}), false);
    assert.equal(harness.speech.active, false); assert.deepEqual(harness.text, []);
    assert.equal(harness.speech.state.message.includes('private'), false);
    harness.clock.tick(120000); assert.equal(created, 1);
  }
});

test('recording duration and stalled Stop are bounded independently of browser events', t => {
  const harness = fixture(t), recognition = listening(harness);
  recognition.onresult(results(['待确认的文字']));
  harness.clock.tick(59999); assert.equal(recognition.stops, 0);
  harness.clock.tick(1); assert.equal(recognition.stops, 1); assert.equal(harness.speech.state.phase, 'stopping');
  const lateResult = recognition.onresult;
  harness.clock.tick(2999); assert.equal(harness.speech.active, true);
  harness.clock.tick(1); assert.equal(harness.speech.active, false); assert.equal(recognition.aborts, 1);
  lateResult(results(['too late', true])); assert.equal(harness.value(), '待确认的文字');
  assert.equal(harness.clock.jobs.size, 0);
});

test('cancel and destroy clear recording timers and prevent old speech callbacks from changing text', t => {
  const harness = fixture(t), recognition = listening(harness);
  recognition.onresult(results(['保留这些文字']));
  const lateResult = recognition.onresult;
  harness.speech.destroy();
  assert.equal(harness.speech.active, false); assert.equal(harness.clock.jobs.size, 0);
  lateResult(results(['不要覆盖', true])); harness.clock.tick(120000);
  assert.equal(harness.value(), '保留这些文字'); assert.equal(recognition.aborts, 1); assert.equal(recognition.stops, 0);
});

class Element extends EventTarget {
  value = ''; textContent = ''; disabled = false; maxLength = 2000; selectionStart = 0; selectionEnd = 0;
  dataset = {}; attributes = new Map(); classes = new Set();
  classList = {toggle:(name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name)};
  setAttribute(name, value) {this.attributes.set(name, value);}
  setSelectionRange(start, end) {this.selectionStart = start; this.selectionEnd = end;}
}
function domFixture(t, {secure = true, supported = true} = {}) {
  const instances = [], elements = new Map(['question', 'voice-button', 'voice-label', 'voice-language', 'voice-status', 'composer'].map(id => [id, new Element()]));
  const doc = new EventTarget(); doc.getElementById = id => elements.get(id); doc.hidden = false;
  elements.get('voice-language').value = 'zh-CN';
  class PrefixedRecognition extends Recognition {constructor() {super(); instances.push(this);}}
  const win = {isSecureContext:secure, ...(supported ? {webkitSpeechRecognition:PrefixedRecognition} : {})};
  let changes = 0;
  const speech = setupSpeechInput({document:doc, window:win, onText:() => {changes++;}});
  t.after(() => speech.destroy());
  const fire = (target, type, fields = {}) => target.dispatchEvent(Object.assign(new Event(type), fields));
  return {speech, doc, elements, instances, fire, changes:() => changes};
}

test('DOM adapter detects prefixed browsers lazily and updates draft/counter without cancelling its own recognition', t => {
  const {speech, elements, instances, fire, changes} = domFixture(t);
  const input = elements.get('question'), button = elements.get('voice-button'), label = elements.get('voice-label');
  assert.equal(instances.length, 0); assert.equal(button.disabled, false); assert.equal(label.textContent, 'Speak');
  fire(button, 'click'); const recognition = instances[0];
  assert.equal(recognition.starts, 1); assert.equal(label.textContent, 'Cancel');
  recognition.onstart(); assert.equal(label.textContent, 'Stop'); assert.equal(button.attributes.get('aria-pressed'), 'true');
  assert.equal(elements.get('composer').classes.has('voice-active'), true);
  let inputEvents = 0; input.addEventListener('input', () => {inputEvents++;});
  recognition.onresult(results(['今天很开心']));
  assert.equal(input.value, '今天很开心'); assert.equal(input.selectionStart, input.value.length);
  assert.equal(changes(), 1); assert.equal(inputEvents, 0); assert.equal(speech.active, true);
  const lateResult = recognition.onresult;
  input.value = 'Manually edited'; fire(input, 'input'); lateResult(results(['不要覆盖', true]));
  assert.equal(input.value, 'Manually edited'); assert.equal(speech.active, false); assert.equal(recognition.aborts, 1);
});

test('DOM language, background and Escape actions cancel capture and destroyed bindings cannot restart it', t => {
  const {speech, doc, elements, instances, fire} = domFixture(t);
  const button = elements.get('voice-button'), language = elements.get('voice-language');
  for (const action of ['language', 'background', 'escape']) {
    fire(button, 'click'); const recognition = instances.at(-1); recognition.onstart();
    if (action === 'language') {language.value = 'ko-KR'; fire(language, 'change');}
    else if (action === 'background') {doc.hidden = true; fire(doc, 'visibilitychange');}
    else fire(doc, 'keydown', {key:'Escape'});
    assert.equal(speech.active, false); assert.equal(recognition.aborts, 1); doc.hidden = false;
  }
  const count = instances.length; speech.destroy(); fire(button, 'click');
  assert.equal(instances.length, count); assert.equal(speech.active, false);
});

test('unsupported and insecure DOM contexts disable only voice controls and never construct recognition', t => {
  for (const options of [{supported:false}, {secure:false}]) {
    const {speech, elements, instances, fire} = domFixture(t, options);
    assert.equal(speech.supported, false); assert.equal(elements.get('voice-button').disabled, true);
    assert.equal(elements.get('voice-language').disabled, true);
    assert.equal(elements.get('question').disabled, false); assert.equal(elements.get('composer').disabled, false);
    elements.get('question').value = 'Typing still works'; fire(elements.get('voice-button'), 'click');
    assert.equal(instances.length, 0); assert.equal(elements.get('question').value, 'Typing still works');
    if (options.secure === false) assert.match(elements.get('voice-status').textContent, /HTTPS|localhost/);
  }
});
