import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import http from 'node:http';
import { LampService, crc16, packet, mapFrame, isLocalLampRequest } from '../lamp-bridge.js';
import { createServer } from '../server.js';

const PORT = '/dev/cu.usbserial-test';
const ports = [{ path:PORT, label:'Test Arduino' }];
const flush = () => new Promise(resolve => setImmediate(resolve));
const frame = value => Buffer.alloc(768, value);

class FakeTransport extends EventEmitter {
  constructor({ hello = 'both', cap = 3 } = {}) {
    super(); this.hello = hello; this.cap = cap; this.writes = []; this.hold = new Set(); this.closed = false;
  }
  async start() { this.started = true; }
  write(bytes) {
    assert.equal(bytes.subarray(0, 4).toString(), 'HML1');
    assert.equal(bytes.readUInt16LE(6), bytes.length - 10);
    assert.equal(bytes.readUInt16LE(bytes.length - 2), crc16(bytes.subarray(4, -2)));
    const message = { command:String.fromCharCode(bytes[4]), sequence:bytes[5], payload:Buffer.from(bytes.subarray(8, -2)) };
    this.writes.push(message);
    if (this.hold.has(message.command)) return;
    queueMicrotask(() => {
      if (message.command === 'H' && this.hello !== 'ack') this.text(`HML READY 1 256 6 ${this.cap}\n`);
      if (message.command !== 'H' || this.hello !== 'ready') this.ack(message);
    });
  }
  text(text) { this.emit('data', Buffer.from(text)); }
  ack(message = this.writes.at(-1)) { this.text(`ACK ${message.sequence}\n`); }
  close() { this.closed = true; }
}

function fixture(t, options = {}) {
  const transport = options.transport || new FakeTransport();
  const service = new LampService({ enabled:true, scanPorts:async () => ports, transportFactory:() => transport, commandTimeout:35, ...options });
  t.after(() => service.release());
  return { service, transport };
}
async function connected(t, options) {
  const fixture_ = fixture(t, options);
  const { token } = await fixture_.service.connect(PORT);
  // Lease tests advance the injected clock explicitly; no real-time polling is needed.
  clearInterval(fixture_.service.timer); fixture_.service.timer = null;
  return { ...fixture_, token };
}

test('CRC-16/CCITT-FALSE and packet framing match the documented wire format', () => {
  assert.equal(crc16(Buffer.from('123456789')), 0x29b1);
  const payload = Buffer.concat([Buffer.from([3]), frame(127)]);
  const encoded = packet('F', 254, payload);
  assert.equal(encoded.length, 779);
  assert.equal(encoded.subarray(0, 4).toString(), 'HML1');
  assert.deepEqual([...encoded.subarray(4, 8)], [70, 254, 1, 3]);
  assert.deepEqual(encoded.subarray(8, -2), payload);
  assert.equal(encoded.readUInt16LE(777), crc16(encoded.subarray(4, 777)));
  assert.equal(packet('O', 0).length, 10);
});

test('pixel mapping is a permutation for every orientation and preserves RGB channels', () => {
  const input = Buffer.alloc(768);
  for (let i = 0; i < 256; i++) input.set([i, i % 16, Math.floor(i / 16)], i * 3);
  for (const serpentine of [false, true]) for (const mirrorX of [false, true]) for (const rotation of [0,90,180,270]) {
    const output = mapFrame(input, { serpentine, mirrorX, rotation });
    const seen = new Set();
    for (let i = 0; i < 256; i++) {
      const identity = output[i * 3]; seen.add(identity);
      assert.deepEqual([...output.subarray(i * 3, i * 3 + 3)], [identity, identity % 16, Math.floor(identity / 16)]);
    }
    assert.equal(seen.size, 256);
  }
  assert.equal(mapFrame(input)[31 * 3], 16, 'Odd rows reverse in a serpentine matrix.');
  assert.equal(mapFrame(input, {serpentine:false, mirrorX:false, rotation:90})[15 * 3], 0);
  assert.equal(mapFrame(input, {serpentine:false, mirrorX:false, rotation:180})[255 * 3], 0);
  assert.equal(mapFrame(input, {serpentine:false, mirrorX:true, rotation:0})[15 * 3], 0);
  assert.throws(() => mapFrame(Buffer.alloc(3)), error => error.status === 400);
});

test('connection is not granted until firmware identity, hello ACK and off ACK are received', async t => {
  const { service, transport } = fixture(t);
  transport.hold.add('H'); transport.hold.add('O');
  const connecting = service.connect(PORT);
  await flush();
  const hello = transport.writes.at(-1);
  assert.equal(hello.command, 'H'); assert.equal(service.status().connected, false);
  transport.text('HML RE'); transport.text('ADY 1 256 6 3\n');
  assert.equal(service.ready, true); assert.equal(service.connected, false);
  transport.ack(hello); await flush();
  assert.equal(transport.writes.at(-1).command, 'O');
  assert.equal(service.token, null); assert.equal(service.connected, false);
  transport.ack();
  const status = await connecting;
  assert.equal(status.connected, true); assert.equal(status.ready, true);
  assert.match(status.token, /^[a-f0-9]{48}$/);
  assert.equal(Object.hasOwn(service.status(), 'token'), false);
  await assert.rejects(service.connect(PORT), error => error.status === 409);
});

test('ACKs without a matching firmware identity cannot open a lamp session', async t => {
  const transport = new FakeTransport({hello:'ack'});
  const { service } = fixture(t, {transport});
  await assert.rejects(service.connect(PORT), /firmware/);
  assert.equal(service.connected, false); assert.equal(service.token, null); assert.equal(transport.closed, true);
  assert.equal(transport.writes.some(message => message.command === 'O'), false);
});

test('a transport constructor failure clears ownership so a later connection can succeed', async t => {
  let constructions = 0;
  const transport = new FakeTransport();
  const {service} = fixture(t, {transportFactory:() => {
    if (++constructions === 1) throw new Error('Simulated process setup failure');
    return transport;
  }});
  await assert.rejects(service.connect(PORT), /connect/i);
  assert.equal(service.connecting, false); assert.equal(service.transport, null);
  assert.equal((await service.connect(PORT)).connected, true);
});

test('a firmware brightness declaration can lower the safety cap but cannot raise it', async t => {
  const {service} = await connected(t, {transport:new FakeTransport({cap:255})});
  assert.equal(service.maxBrightness, 3); assert.equal(service.brightness, 3);
});

test('firmware READY without a hello acknowledgement cannot bypass the handshake', async t => {
  const transport = new FakeTransport({hello:'ready'});
  const { service } = fixture(t, {transport, commandTimeout:5});
  await assert.rejects(service.connect(PORT), /firmware|acknowledg|connect/i);
  assert.equal(service.connected, false); assert.equal(service.token, null);
});

test('tokens, exact frame size and brightness caps are checked before any light command', async t => {
  const { service, transport, token } = await connected(t, {transport:new FakeTransport({cap:2})});
  assert.equal(service.maxBrightness, 2); assert.equal(service.brightness, 2);
  const before = transport.writes.length;
  assert.throws(() => service.heartbeat('wrong'), error => error.status === 401);
  assert.throws(() => service.heartbeat('é'.repeat(token.length)), error => error.status === 401);
  await assert.rejects(service.sendFrame(token, Buffer.alloc(767)), error => error.status === 400);
  await assert.rejects(service.configure(token, {brightness:3, mapping:{serpentine:true, mirrorX:false, rotation:0}}), error => error.status === 400);
  assert.equal(transport.writes.length, before);
});

test('a frame resolves and is counted only after its own physical acknowledgement', async t => {
  const { service, transport, token } = await connected(t);
  transport.hold.add('F');
  let settled = false;
  const sending = service.sendFrame(token, frame(40)).then(status => { settled = true; return status; });
  await flush();
  const sent = transport.writes.at(-1);
  assert.equal(sent.command, 'F'); assert.equal(sent.payload.length, 769); assert.equal(sent.payload[0], 3);
  assert.equal(service.frameCount, 0); assert.equal(settled, false);
  transport.text(`ACK ${(sent.sequence + 1) & 255}\n`); await flush();
  assert.equal(settled, false, 'An unrelated ACK does not finish the frame.');
  transport.ack(sent);
  assert.equal((await sending).frameCount, 1);
  assert.equal(service.connected, true);
});

test('concurrent frames cannot overwrite the cache with a frame rejected by backpressure', async t => {
  const { service, transport, token } = await connected(t);
  transport.hold.add('P'); transport.hold.add('F');
  const ping = service.command('P');
  const first = service.sendFrame(token, frame(11));
  const second = service.sendFrame(token, frame(22));
  const rejected = assert.rejects(second, error => error.status === 409);
  transport.ack(); await ping; await flush();
  assert.equal(transport.writes.filter(message => message.command === 'F').length, 1);
  transport.ack(); await first; await rejected;
  assert.deepEqual(service.lastFrame, frame(11), 'Rejected input must not become the displayed-frame cache.');
  assert.equal(service.connected, true);
});

test('RGB tests affect only physical pixel zero, independent of page orientation', async t => {
  const { service, transport, token } = await connected(t);
  await service.configure(token, { brightness:1, mapping:{serpentine:true, mirrorX:true, rotation:180} });
  for (const [color, expected] of [['red',[255,0,0]], ['green',[0,255,0]], ['blue',[0,0,255]], ['off',[0,0,0]]]) {
    const status = await service.test(token, color);
    const sent = transport.writes.at(-1);
    assert.equal(sent.command, 'F'); assert.equal(sent.payload[0], 1);
    assert.deepEqual([...sent.payload.subarray(1, 4)], expected);
    assert.equal(sent.payload.subarray(4).some(byte => byte !== 0), false);
    assert.equal(status.testColor, color);
  }
  await assert.rejects(service.test(token, 'white'), error => error.status === 400);
});

test('independent browser leases preserve a paused frame and blank the lamp after page loss', async t => {
  let now = 0;
  const { service, transport, token } = await connected(t, {now:() => now, leaseMs:4500});
  await service.sendFrame(token, frame(12));
  now = 1000; await service.tick();
  assert.equal(transport.writes.at(-1).command, 'P');
  now = 4000; service.heartbeat(token);
  now = 8000; await service.tick();
  assert.equal(service.connected, true, 'Heartbeat maintains a session even without another animation frame.');
  now = 8501; await service.tick();
  assert.equal(transport.writes.at(-1).command, 'O');
  assert.equal(transport.closed, true); assert.equal(service.connected, false); assert.equal(service.token, null);
  assert.match(service.error, /page disconnected/i);
});

test('serial removal rejects the pending frame and revokes the old session', async t => {
  const { service, transport, token } = await connected(t);
  transport.hold.add('F');
  const sending = service.sendFrame(token, frame(80));
  const rejected = assert.rejects(sending, /session ended|disconnected/i);
  transport.emit('failure', new Error('USB removed'));
  await rejected;
  assert.equal(service.connected, false); assert.equal(transport.closed, true);
  assert.throws(() => service.heartbeat(token), error => error.status === 401);
});

test('only enumerated USB devices can be opened, and hardware stays disabled by default', async t => {
  let opens = 0, scans = 0;
  const { service } = fixture(t, {enabled:false, scanPorts:async () => {scans++; return ports;}, transportFactory:() => {opens++;}});
  assert.equal((await service.getStatus()).enabled, false);
  await assert.rejects(service.connect(PORT), error => error.status === 403);
  assert.equal(scans, 0); assert.equal(opens, 0);
  service.enabled = true;
  await assert.rejects(service.connect('/dev/tty.other-device'), error => error.status === 400);
  assert.equal(opens, 0);
});

test('physical control accepts only loopback connections with a local host name', () => {
  const request = (remoteAddress, host) => ({socket:{remoteAddress}, headers:{host}});
  for (const [remote, host] of [['127.0.0.1','localhost:3000'], ['::1','[::1]:3000'], ['::ffff:127.0.0.1','127.0.0.1:3000']]) assert.equal(isLocalLampRequest(request(remote, host)), true);
  for (const [remote, host] of [['192.168.1.3','localhost:3000'], ['127.0.0.1','attacker.example:3000'], ['127.0.0.1','user@localhost:3000'], ['::1','[broken']]) assert.equal(isLocalLampRequest(request(remote, host)), false);
});

async function httpFixture(t, {enabled = true} = {}) {
  const {service, transport} = fixture(t, {enabled});
  const server = createServer({keyProvider:async () => '', lampBridge:service});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => {server.closeAllConnections(); server.close(resolve);}));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body = {}, headers = {}) => fetch(`${origin}/api/lamp/${path}`, {
    method:'POST', headers:{Origin:origin, 'Content-Type':'application/json', ...headers},
    body:Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body)
  });
  return {service, transport, server, origin, post};
}

test('HTTP hardware routes enforce same-origin JSON or exact binary payloads and session tokens', async t => {
  const {origin, post, transport} = await httpFixture(t);
  const hostileHostStatus = await new Promise((resolve, reject) => {
    const request = http.get(`${origin}/api/lamp`, {headers:{Host:'attacker.example'}}, response => {response.resume(); resolve(response.statusCode);});
    request.on('error', reject);
  });
  assert.equal(hostileHostStatus, 403);
  for (const headers of [{Origin:''}, {Origin:'https://attacker.example'}, {'Sec-Fetch-Site':'cross-site'}]) assert.equal((await post('connect', {port:PORT}, headers)).status, 403);
  assert.equal((await post('connect', {port:PORT}, {'Content-Type':'text/plain'})).status, 415);
  assert.equal((await post('connect', '{bad')).status, 400);
  assert.equal((await post('connect', ' '.repeat(4097))).status, 413);
  assert.equal((await post('connect', {port:'/dev/tty.other-device'})).status, 400);
  assert.equal(transport.started, undefined);
  const connected_ = await (await post('connect', {port:PORT})).json();
  assert.equal(connected_.ready, true); assert.ok(connected_.token);
  const status = await (await fetch(`${origin}/api/lamp`)).json();
  assert.equal(Object.hasOwn(status, 'token'), false);
  assert.equal((await post('heartbeat')).status, 401);
  assert.equal((await post('test', {color:'red'}, {'X-Lamp-Token':'wrong'})).status, 401);
  const headers = {'X-Lamp-Token':connected_.token, 'Content-Type':'application/octet-stream'};
  assert.equal((await post('frame', frame(4), headers)).status, 200);
  assert.equal((await post('frame', Buffer.alloc(767), headers)).status, 400);
  assert.equal((await post('frame', Buffer.alloc(769), headers)).status, 413);
  assert.equal((await post('unrecognized', {}, {'X-Lamp-Token':connected_.token})).status, 404);
  assert.equal((await post('disconnect', {}, {'X-Lamp-Token':connected_.token})).status, 200);
  assert.equal((await post('heartbeat', {}, {'X-Lamp-Token':connected_.token})).status, 401);
});

test('disabled hardware exposes availability without scanning or opening any USB device', async t => {
  const {origin, post} = await httpFixture(t, {enabled:false});
  const status = await (await fetch(`${origin}/api/lamp`)).json();
  assert.equal(status.enabled, false); assert.deepEqual(status.ports, []);
  assert.equal((await post('connect', {port:PORT})).status, 403);
  assert.deepEqual(await (await fetch(`${origin}/api/config`)).json(), {aiAvailable:false});
});
