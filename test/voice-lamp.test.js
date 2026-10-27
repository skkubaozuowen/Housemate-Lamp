import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {LightRenderer, renderFrame, renderVoiceFrame} from '../public/lib/renderer.js';
import {LampBridge} from '../public/lib/hardware.js';
import {SessionController} from '../public/lib/controller.js';
import {createPlan} from '../public/lib/catalog.js';
import {selectPalette} from '../public/lib/palettes.js';
import {LampService, crc16, mapFrame} from '../lamp-bridge.js';

const flush = async () => {for (let i = 0; i < 16; i++) await Promise.resolve();};
class Clock {
  time = 0; next = 1; jobs = new Map();
  setTimeout = (callback, delay) => {const id = this.next++; this.jobs.set(id, {callback, at:this.time + delay}); return id;};
  clearTimeout = id => this.jobs.delete(id);
  async tick(duration) {
    const end = this.time + duration;
    for (let i = 0; i < 1000; i++) {
      const next = [...this.jobs].filter(([, job]) => job.at <= end).sort((a,b) => a[1].at - b[1].at)[0];
      if (!next) {this.time = end; await flush(); return;}
      const [id, job] = next; this.time = job.at; this.jobs.delete(id); job.callback(); await flush();
    }
    throw new Error('Unexpectedly unbounded lamp frame scheduling.');
  }
}

function browserHarness() {
  const names = ['window','document','requestAnimationFrame','cancelAnimationFrame','ResizeObserver'];
  const originals = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const events = new Map(), queue = new Map(); let id = 1;
  const canvas = () => {
    const context = {createImageData:(w,h) => ({data:new Uint8ClampedArray(w*h*4)}), putImageData(){}, fillRect(){}, drawImage(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}};
    return {width:0, height:0, getContext:() => context, getBoundingClientRect:() => ({width:640,height:480})};
  };
  globalThis.document = {hidden:false, createElement:canvas, addEventListener:(name, fn) => events.set(name, fn), removeEventListener:name => events.delete(name)};
  globalThis.window = {devicePixelRatio:1, addEventListener(){}, removeEventListener(){}};
  globalThis.ResizeObserver = class {observe(){} disconnect(){}};
  globalThis.requestAnimationFrame = callback => {const next = id++; queue.set(next, callback); return next;};
  globalThis.cancelAnimationFrame = next => queue.delete(next);
  return {canvas, queue, tick(now) {const pending = [...queue.values()]; queue.clear(); for (const callback of pending) callback(now);},
    restore() {for (const name of names) {const original = originals.get(name); if (original) Object.defineProperty(globalThis, name, original); else delete globalThis[name];}}};
}

/** The serial endpoint is simulated; no device path is ever opened. */
class Serial extends EventEmitter {
  writes = []; pending = []; holdFrames = false;
  async start() {}
  write(bytes) {
    assert.equal(bytes.subarray(0, 4).toString(), 'HML1');
    assert.equal(bytes.readUInt16LE(6), bytes.length - 10);
    assert.equal(bytes.readUInt16LE(bytes.length - 2), crc16(bytes.subarray(4, -2)));
    const entry = {command:String.fromCharCode(bytes[4]), sequence:bytes[5], payload:Buffer.from(bytes.subarray(8, -2))};
    this.writes.push(entry);
    if (entry.command === 'F' && this.holdFrames) this.pending.push(entry);
    else queueMicrotask(() => {
      if (entry.command === 'H') this.emit('data', Buffer.from('HML READY 1 256 6 3\n'));
      this.ack(entry);
    });
  }
  ack(entry = this.pending.shift()) {if (entry) this.emit('data', Buffer.from(`ACK ${entry.sequence}\n`));}
  close() {this.closed = true;}
}

async function fixture(t, {connect = true} = {}) {
  const browser = browserHarness(), clock = new Clock(), serial = new Serial(), calls = [], painted = [];
  const port = '/dev/cu.usbserial-simulated';
  const service = new LampService({enabled:true, now:() => clock.time, scanPorts:async () => [{path:port,label:'Simulated matrix'}], transportFactory:() => serial});
  const response = (value, status = 200) => ({ok:status === 200, status, json:async () => value});
  const fetcher = async (url, options) => {
    calls.push({url, headers:{...options.headers}, body:options.body instanceof Uint8Array ? new Uint8Array(options.body) : options.body, at:clock.time});
    const token = options.headers['X-Lamp-Token'];
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    try {
      if (url.endsWith('/connect')) {
        const result = await service.connect(body.port, {takeover:body.takeover});
        clearInterval(service.timer); service.timer = null;
        return response(result);
      }
      if (url.endsWith('/lease')) {
        let detach, ended = false;
        const stream = new ReadableStream({
          start(controller) {
            detach = service.attachLease(token, () => {if (!ended) {ended = true; controller.close();}});
            controller.enqueue(new TextEncoder().encode(': connected\n\n'));
            options.signal.addEventListener('abort', () => {detach(); if (!ended) {ended = true; controller.close();}}, {once:true});
          },
          cancel() {ended = true; detach?.();}
        });
        return {ok:true, headers:new Headers({'Content-Type':'text/event-stream'}), body:stream};
      }
      if (url.endsWith('/frame')) return response(await service.sendFrame(token, Buffer.from(body)));
      if (url.endsWith('/disconnect')) return response(await service.disconnect(token));
      if (url.endsWith('/heartbeat')) return response(service.heartbeat(token));
      if (url.endsWith('/configure')) return response(await service.configure(token, body));
      if (url.endsWith('/test')) return response(await service.test(token, body.color));
      return response(await service.getStatus());
    } catch (error) {return response({error:error.message}, error.status || 503);}
  };
  const bridge = new LampBridge({fetcher, timers:clock, now:() => clock.time});
  const renderer = new LightRenderer(browser.canvas(), {gridCanvas:browser.canvas(), onFrame:frame => {painted.push(new Uint8Array(frame)); bridge.offer(frame);}});
  t.after(async () => {
    renderer.destroy();
    while (serial.pending.length) {serial.ack(); await flush();}
    await bridge.disconnect(); bridge.destroy(); await service.shutdown(); browser.restore();
  });
  if (connect) await bridge.connect(port);
  const raf = async (after = 0) => {await clock.tick(after); browser.tick(clock.time); await clock.tick(0);};
  const voice = async level => {renderer.setVoiceInput({active:true,level}); await raf(); await raf(500);};
  const requests = () => calls.filter(call => call.url.endsWith('/frame'));
  return {browser, clock, serial, calls, painted, service, bridge, renderer, port, raf, voice, requests};
}

function assertWireMatches(harness) {
  const request = harness.requests().at(-1), wire = harness.serial.writes.filter(entry => entry.command === 'F').at(-1);
  assert.ok(request); assert.ok(wire);
  assert.equal(request.headers['Content-Type'], 'application/octet-stream');
  assert.equal(request.headers['X-Lamp-Token'], harness.bridge.token);
  assert.equal(request.body.length, 768);
  assert.deepEqual(request.body, harness.painted.at(-1), 'The USB request contains the actual displayed renderer frame.');
  assert.equal(wire.payload.length, 769); assert.equal(wire.payload[0], 3, 'Voice does not raise the Arduino brightness cap.');
  assert.deepEqual(wire.payload.subarray(1), mapFrame(request.body, harness.service.mapping));
}

test('voice halo RGB travels through renderer, authenticated HTTP and mapped serial packets', async t => {
  const harness = await fixture(t);
  harness.renderer.setPlan(createPlan('idle', {motionPrimitive:'hold', transitionMs:0})); await harness.raf();
  const token = harness.bridge.token, initial = harness.renderer.frame.slice();
  await harness.voice(.1); assertWireMatches(harness);
  const quiet = harness.renderer.frame.slice();
  assert.notDeepEqual(quiet, initial);
  harness.renderer.setVoiceInput({active:true,level:.95}); await harness.raf(); await harness.clock.tick(125);
  assert.notDeepEqual(harness.renderer.frame, quiet, 'Actual microphone level changes RGB pixels, not just CSS.');
  assertWireMatches(harness);
  assert.equal(harness.bridge.token, token); assert.equal(harness.service.status().leaseConnected, true);
  assert.equal(harness.service.maxBrightness, 3); assert.equal(harness.service.brightness, 3);
  assert.equal(harness.calls.some(call => /\/(configure|test)$/.test(call.url)), false);
});

test('an unacknowledged voice frame holds one request and sends only the newest completed RGB frame next', async t => {
  const harness = await fixture(t);
  harness.renderer.setPlan(createPlan('idle', {motionPrimitive:'hold', transitionMs:0})); await harness.raf();
  await harness.voice(.1);
  const before = harness.requests().length;
  harness.serial.holdFrames = true;
  harness.renderer.setVoiceInput({active:true,level:.3}); await harness.raf(); await harness.clock.tick(125);
  assert.equal(harness.requests().length, before + 1); assert.equal(harness.serial.pending.length, 1);
  const countBeforeAck = harness.bridge.status.frameCount;
  for (const level of [.4,.5,.8,1]) {harness.renderer.setVoiceInput({active:true,level}); await harness.raf(50);}
  const newest = new Uint8Array(harness.renderer.frame);
  assert.equal(harness.requests().length, before + 1, 'An outstanding serial ACK prevents a second in-flight frame.');
  assert.equal(harness.bridge.status.frameCount, countBeforeAck);
  harness.serial.ack(); await flush(); await harness.clock.tick(125);
  assert.equal(harness.requests().length, before + 2);
  assert.deepEqual(harness.requests().at(-1).body, newest);
  harness.serial.ack(); await flush();
  assert.equal(harness.bridge.status.frameCount, countBeforeAck + 2);
});

test('manual Pause light freezes voice packets, then resumes the latest level without creating extra render loops', async t => {
  const harness = await fixture(t);
  harness.renderer.setPlan(createPlan('idle', {motionPrimitive:'hold', transitionMs:0})); await harness.raf(); await harness.voice(.1);
  await harness.clock.tick(125);
  const frame = harness.renderer.frame.slice(), requests = harness.requests().length, paints = harness.painted.length;
  harness.renderer.setPaused(true);
  for (const level of [.3,.7,1]) harness.renderer.setVoiceInput({active:true,level});
  await harness.raf(1000);
  assert.deepEqual(harness.renderer.frame, frame); assert.equal(harness.painted.length, paints);
  assert.equal(harness.requests().length, requests); assert.equal(harness.browser.queue.size, 0);
  harness.renderer.setPaused(false); await harness.raf(); await harness.raf(500); await harness.clock.tick(125);
  assert.notDeepEqual(harness.renderer.frame, frame); assert.ok(harness.browser.queue.size <= 1); assertWireMatches(harness);
});

test('held and reduced-motion scenes still transport changed voice levels with a single renderer RAF', async t => {
  const harness = await fixture(t);
  harness.renderer.setPlan(createPlan('idle', {motionPrimitive:'hold', transitionMs:0}));
  harness.renderer.setReducedMotion(true); await harness.raf();
  await harness.voice(.2); assert.equal(harness.browser.queue.size, 0);
  for (const level of [.4,.6,.8,1]) harness.renderer.setVoiceInput({active:true,level});
  assert.equal(harness.browser.queue.size, 1);
  await harness.raf(); await harness.clock.tick(125);
  assert.deepEqual(harness.renderer.frame, renderVoiceFrame(1, 0, {reducedMotion:true}));
  assert.equal(harness.browser.queue.size, 0); assertWireMatches(harness);
});

test('voice output does not alter emotion state and exiting restores the latest controller plan to the lamp', async t => {
  const harness = await fixture(t);
  const controller = new SessionController({renderer:harness.renderer, requestPlan:async () => {throw new Error('No AI request is needed.');}});
  const before = controller.snapshot(); await harness.voice(.8);
  assert.deepEqual(controller.snapshot(), before);
  const next = createPlan('idle', {paletteFamily:'named_pink', motionPrimitive:'hold', transitionMs:0});
  controller.preview(next); const plan = harness.renderer.plan;
  await harness.raf(100);
  assert.deepEqual(harness.renderer.frame, renderVoiceFrame(.8, 600), 'A new emotion plan does not replace the active microphone display.');
  harness.renderer.setVoiceInput({active:false}); await harness.raf(); await harness.raf(500); await harness.clock.tick(125);
  assert.equal(harness.renderer.plan, plan);
  assert.deepEqual(harness.renderer.frame, renderFrame(plan, harness.renderer.elapsedMs, {colors:selectPalette(plan, controller.preferences)}));
  assert.equal(controller.snapshot().historyCount, 0); assertWireMatches(harness);
});

test('voice never connects USB or bypasses a held calibration color automatically', async t => {
  const harness = await fixture(t, {connect:false});
  harness.renderer.setPlan(createPlan('idle', {motionPrimitive:'hold', transitionMs:0})); await harness.voice(1);
  assert.equal(harness.calls.length, 0, 'Speaking alone cannot claim the physical lamp.');
  await harness.bridge.connect(harness.port); await harness.bridge.test('blue');
  const count = harness.requests().length;
  harness.renderer.setVoiceInput({active:true,level:.2}); await harness.raf(); await harness.clock.tick(500);
  assert.equal(harness.requests().length, count, 'The user must explicitly resume page sync after calibration.');
  harness.bridge.resume(harness.renderer.frame); await harness.clock.tick(0); assertWireMatches(harness);
});
