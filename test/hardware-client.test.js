import test from 'node:test';
import assert from 'node:assert/strict';
import { LampBridge } from '../public/lib/hardware.js';

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
class Clock {
  time = 0; nextId = 1; jobs = new Map();
  setTimeout = (callback, delay) => { const id = this.nextId++; this.jobs.set(id, { callback, at:this.time + delay, interval:0 }); return id; };
  clearTimeout = id => this.jobs.delete(id);
  setInterval = (callback, delay) => { const id = this.nextId++; this.jobs.set(id, { callback, at:this.time + delay, interval:delay }); return id; };
  clearInterval = this.clearTimeout;
  async tick(ms) {
    const end = this.time + ms;
    for (;;) {
      const next = [...this.jobs].filter(([,job]) => job.at <= end).sort((a,b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id,job] = next; this.time = job.at;
      if (job.interval) job.at += job.interval; else this.jobs.delete(id);
      job.callback(); await flush();
    }
    this.time = end; await flush();
  }
}
function harness({ holdFrames = false, connectReady = true, badLease = false } = {}) {
  const clock = new Clock(), calls = [], frames = [], leases = [];
  let count = 0;
  const status = { enabled:true, connected:true, ready:connectReady, ports:[{path:'/dev/cu.usbserial-test',label:'Arduino'}], pixels:256, pin:6, maxBrightness:3, brightness:3, frameCount:0, error:null };
  const response = body => ({ ok:true, json:async () => body });
  const fetcher = async (url, options) => {
    calls.push({ url, options, at:clock.time });
    if (url.endsWith('/connect')) return response({ ...status, token:'memory-only-token' });
    if (url.endsWith('/lease')) {
      if (badLease) return {ok:false,status:503,json:async () => ({error:'Streaming unavailable.'})};
      const lease = {signal:options.signal,closed:false,cancelled:false};
      const body = new ReadableStream({
        start(controller) {
          lease.controller = controller;
          controller.enqueue(new TextEncoder().encode(': connected\n\n'));
          options.signal.addEventListener('abort', () => {
            if (!lease.closed) { lease.closed = true; controller.error(new DOMException('Aborted', 'AbortError')); }
          }, {once:true});
        },
        cancel() { lease.cancelled = true; lease.closed = true; }
      });
      lease.close = () => { if (!lease.closed) { lease.closed = true; lease.controller.close(); } };
      leases.push(lease);
      return {ok:true,headers:new Headers({'Content-Type':'text/event-stream'}),body};
    }
    if (url.endsWith('/disconnect')) return response({ ...status, connected:false, ready:false });
    if (url.endsWith('/frame')) {
      const ack = () => response({ ...status, frameCount:++count, lastAckAt:clock.time });
      if (holdFrames) return new Promise(resolve => frames.push({ resolve:() => resolve(ack()), options }));
      return ack();
    }
    return response({ ...status, frameCount:count });
  };
  const bridge = new LampBridge({ fetcher, timers:clock, now:() => clock.time });
  return { bridge, clock, calls, frames, leases };
}
const frame = value => new Uint8Array(768).fill(value);

test('USB frames require an explicitly connected, acknowledged session', async () => {
  const { bridge, clock, calls } = harness();
  bridge.offer(frame(100)); await clock.tick(1000);
  assert.equal(calls.length, 0);
  await bridge.connect('/dev/cu.usbserial-test');
  assert.equal(bridge.active, true);
  assert.equal('token' in bridge.status, false);
  assert.equal(calls[0].options.headers['X-Lamp-Token'], undefined);
  const lease = calls.find(call => call.url.endsWith('/lease'));
  assert.equal(lease.options.headers['X-Lamp-Token'], 'memory-only-token');
  assert.equal(lease.options.method, 'POST');
  assert.equal(lease.options.body, '{}');
  bridge.offer(new Uint8Array(12)); await clock.tick(0);
  assert.equal(calls.filter(call => call.url.endsWith('/frame')).length, 0);
  bridge.destroy();
  const unready = harness({ connectReady:false });
  await assert.rejects(unready.bridge.connect('/dev/cu.usbserial-test'), /acknowledged/);
  assert.equal(unready.bridge.active, false);
});

test('stream copies the latest frame, caps 8 fps, and allows only one pending frame request', async () => {
  const { bridge, clock, calls, frames } = harness({ holdFrames:true });
  await bridge.connect('/dev/cu.usbserial-test');
  const first = frame(10); bridge.offer(first); first.fill(99); await clock.tick(0);
  assert.equal(frames.length, 1);
  assert.equal(frames[0].options.body[0], 10);
  assert.equal(frames[0].options.headers['X-Lamp-Token'], 'memory-only-token');
  assert.equal(bridge.status.frameCount, 0, 'Sending bytes is not counted as a physical acknowledgement.');
  bridge.offer(frame(20)); bridge.offer(frame(30)); await clock.tick(500);
  assert.equal(frames.length, 1);
  frames[0].resolve(); await flush(); await clock.tick(0);
  assert.equal(frames.length, 2);
  assert.equal(frames[1].options.body[0], 30);
  assert.equal(bridge.status.frameCount, 1);
  frames[1].resolve(); await flush(); bridge.offer(frame(40)); await clock.tick(124);
  assert.equal(frames.length, 2);
  await clock.tick(1); assert.equal(frames.length, 3);
  assert.deepEqual(calls.filter(call => call.url.endsWith('/frame')).map(call => call.at), [0,500,625]);
  bridge.destroy();
});

test('persistent lease owns a held scene without animation frames or heartbeat timers', async () => {
  const { bridge, clock, calls, leases } = harness();
  await bridge.connect('/dev/cu.usbserial-test');
  await bridge.test('blue');
  bridge.offer(frame(80)); await clock.tick(180000);
  assert.equal(bridge.syncing, false);
  assert.equal(calls.filter(call => call.url.endsWith('/frame')).length, 0);
  assert.equal(calls.filter(call => call.url.endsWith('/heartbeat')).length, 0);
  assert.equal(calls.filter(call => call.url.endsWith('/lease')).length, 1);
  assert.equal(leases[0].signal.aborted, false, 'A healthy lease has no whole-stream timeout.');
  assert.equal(bridge.active, true);
  assert.deepEqual(JSON.parse(calls.find(call => call.url.endsWith('/test')).options.body), {color:'blue'});
  bridge.resume(frame(45)); await clock.tick(0);
  assert.equal(calls.filter(call => call.url.endsWith('/frame')).length, 1);
  assert.equal(calls.find(call => call.url.endsWith('/frame')).options.body[0], 45);
  bridge.destroy();
});

test('disconnect drops unsent frames and ignores a late acknowledgement from the old session', async () => {
  const { bridge, clock, calls, frames } = harness({holdFrames:true});
  await bridge.connect('/dev/cu.usbserial-test');
  bridge.offer(frame(1)); await clock.tick(0); bridge.offer(frame(2));
  await bridge.disconnect();
  frames[0].resolve(); await flush(); await clock.tick(2000);
  assert.equal(bridge.active, false); assert.equal(bridge.token, null);
  assert.equal(bridge.pending, null); assert.equal(bridge.status.frameCount, 0);
  assert.equal(calls.filter(call => call.url.endsWith('/frame')).length, 1);
  assert.equal(calls.filter(call => call.url.endsWith('/heartbeat')).length, 0);
});

test('a failed frame stops streaming without an automatic retry or reconnect', async () => {
  const { bridge, clock, calls } = harness();
  const original = bridge.fetcher;
  bridge.fetcher = (url, options) => url.endsWith('/frame') ? Promise.reject(new Error('USB removed')) : original(url, options);
  await bridge.connect('/dev/cu.usbserial-test'); bridge.offer(frame(22)); await clock.tick(0);
  assert.equal(bridge.active, false); assert.equal(bridge.status.error, 'USB removed');
  bridge.offer(frame(33)); await clock.tick(5000);
  assert.equal(calls.filter(call => call.url.endsWith('/connect')).length, 1);
  assert.equal(calls.filter(call => call.url.endsWith('/heartbeat')).length, 0);
  assert.equal(bridge.pending, null);
});

test('closing the page sends a best-effort authenticated disconnect and clears timers', async () => {
  const { bridge, clock, calls, leases } = harness();
  await bridge.connect('/dev/cu.usbserial-test'); bridge.destroy(); await flush();
  const disconnect = calls.find(call => call.url.endsWith('/disconnect'));
  assert.equal(disconnect.options.keepalive, true);
  assert.equal(disconnect.options.headers['X-Lamp-Token'], 'memory-only-token');
  assert.equal(bridge.token, null); assert.equal(bridge.active, false);
  assert.equal(leases[0].signal.aborted, true);
  assert.equal(clock.jobs.size, 0);
});

test('refreshing status in the owning page keeps its in-memory session token', async () => {
  const { bridge, calls } = harness();
  await bridge.connect('/dev/cu.usbserial-test'); await bridge.refresh();
  assert.equal(bridge.active, true); assert.equal(bridge.token, 'memory-only-token');
  await bridge.test('red');
  assert.equal(calls.find(call => call.url.endsWith('/test')).options.headers['X-Lamp-Token'], 'memory-only-token');
  assert.equal('token' in bridge.status, false);
  bridge.destroy();
});

test('a transient busy frame retries only the latest image without losing ownership', async () => {
  const { bridge, clock, calls } = harness();
  const original = bridge.fetcher;
  let releaseBusy, first = true;
  bridge.fetcher = (url, options) => {
    if (url.endsWith('/frame') && first) {
      first = false;
      return new Promise(resolve => { releaseBusy = () => resolve({ok:false,status:409,json:async () => ({error:'A command is finishing.'})}); });
    }
    return original(url, options);
  };
  await bridge.connect('/dev/cu.usbserial-test'); bridge.offer(frame(10)); await clock.tick(0);
  bridge.offer(frame(20)); bridge.offer(frame(30)); releaseBusy(); await flush();
  assert.equal(bridge.active, true); assert.equal(bridge.token, 'memory-only-token');
  await clock.tick(124);
  assert.equal(calls.filter(call => call.url.endsWith('/frame')).length, 0);
  await clock.tick(1);
  assert.equal(calls.filter(call => call.url.endsWith('/frame')).length, 1);
  assert.equal(calls.find(call => call.url.endsWith('/frame')).options.body[0], 30);
  assert.equal(bridge.status.frameCount, 1);
  bridge.destroy();
});

test('configuration and calibration wait for the current frame ACK and block later frames', async () => {
  const { bridge, clock, calls, frames } = harness({holdFrames:true});
  await bridge.connect('/dev/cu.usbserial-test');
  bridge.offer(frame(1)); await clock.tick(0);
  const configure = bridge.configure({brightness:2,mapping:{serpentine:true,rotation:90,mirrorX:false}});
  bridge.offer(frame(2)); await clock.tick(500);
  assert.equal(calls.some(call => call.url.endsWith('/configure')), false);
  assert.equal(frames.length, 1);
  frames[0].resolve(); await flush(); await configure; await clock.tick(0);
  assert.equal(calls.filter(call => call.url.endsWith('/configure')).length, 1);
  assert.equal(frames.length, 2);
  const calibration = bridge.test('green'); bridge.offer(frame(3)); await clock.tick(500);
  assert.equal(calls.some(call => call.url.endsWith('/test')), false);
  frames[1].resolve(); await flush(); await calibration; await clock.tick(2000);
  assert.equal(calls.filter(call => call.url.endsWith('/test')).length, 1);
  assert.equal(frames.length, 2, 'Calibration remains held after the preceding ACK.');
  assert.equal(bridge.syncing, false); assert.equal(bridge.active, true);
  bridge.destroy();
});

test('unexpected lease EOF ends ownership without silently reconnecting the port', async () => {
  const { bridge, clock, calls, leases } = harness();
  await bridge.connect('/dev/cu.usbserial-test');
  leases[0].close(); await flush(); await bridge.leaseTask;
  assert.equal(bridge.active, false); assert.equal(bridge.token, null);
  assert.match(bridge.status.error, /page connection ended/);
  bridge.offer(frame(50)); await clock.tick(60000);
  assert.equal(calls.filter(call => call.url.endsWith('/connect')).length, 1);
  assert.equal(calls.filter(call => call.url.endsWith('/lease')).length, 1);
  assert.equal(calls.filter(call => call.url.endsWith('/frame')).length, 0);
});

test('lease setup failure disconnects the new serial session and drops its token', async () => {
  const { bridge, calls, clock } = harness({badLease:true});
  await assert.rejects(bridge.connect('/dev/cu.usbserial-test'), /Streaming unavailable/);
  assert.equal(bridge.active, false); assert.equal(bridge.token, null);
  const disconnect = calls.find(call => call.url.endsWith('/disconnect'));
  assert.equal(disconnect.options.headers['X-Lamp-Token'], 'memory-only-token');
  assert.equal(clock.jobs.size, 0);
});

test('a non-stream response cannot leave an orphaned connected lamp', async () => {
  const { bridge, calls } = harness();
  const original = bridge.fetcher;
  bridge.fetcher = (url, options) => url.endsWith('/lease')
    ? Promise.resolve({ok:true,headers:new Headers({'Content-Type':'application/json'}),body:null})
    : original(url, options);
  await assert.rejects(bridge.connect('/dev/cu.usbserial-test'), /persistent local connection is unavailable/);
  assert.equal(bridge.token, null);
  assert.equal(calls.filter(call => call.url.endsWith('/disconnect')).length, 1);
});

test('lease response headers have a bounded handshake, without a later stream timeout', async () => {
  const { bridge, calls, clock } = harness();
  const original = bridge.fetcher;
  let leaseSignal;
  bridge.fetcher = (url, options) => {
    if (!url.endsWith('/lease')) return original(url, options);
    leaseSignal = options.signal;
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Handshake timed out', 'AbortError')), {once:true}));
  };
  const connecting = assert.rejects(bridge.connect('/dev/cu.usbserial-test'), /Handshake timed out/);
  await flush(); await clock.tick(4999);
  assert.equal(leaseSignal.aborted, false); assert.equal(bridge.active, false);
  await clock.tick(1); await connecting;
  assert.equal(leaseSignal.aborted, true); assert.equal(bridge.token, null);
  assert.equal(calls.filter(call => call.url.endsWith('/disconnect')).length, 1);
});

test('a cancelled old stream cannot terminate a newer explicit connection', async () => {
  const { bridge, calls } = harness();
  const original = bridge.fetcher;
  let oldReadDone, oldSignal, first = true, cancelled = false;
  bridge.fetcher = (url, options) => {
    if (url.endsWith('/lease') && first) {
      first = false; oldSignal = options.signal;
      const reader = {
        read:() => new Promise(resolve => { oldReadDone = resolve; }),
        cancel:async () => { cancelled = true; }, releaseLock:() => {}
      };
      return Promise.resolve({ok:true,headers:new Headers({'Content-Type':'text/event-stream'}),body:{getReader:() => reader}});
    }
    return original(url, options);
  };
  await bridge.connect('/dev/cu.usbserial-test');
  await bridge.disconnect(); await bridge.connect('/dev/cu.usbserial-test');
  assert.equal(oldSignal.aborted, true); assert.equal(cancelled, true);
  oldReadDone({done:true}); await flush();
  assert.equal(bridge.active, true); assert.equal(bridge.status.error, null);
  assert.equal(calls.filter(call => call.url.endsWith('/connect')).length, 2);
  bridge.destroy();
});
