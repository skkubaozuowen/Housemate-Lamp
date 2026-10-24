import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const FRAME_BYTES = 16 * 16 * 3;
const DEFAULT_MAPPING = { serpentine:true, rotation:0, mirrorX:false };
export class LampError extends Error {
  constructor(message, status = 503) { super(message); this.status = status; }
}
export function crc16(bytes) {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ ((crc & 0x8000) ? 0x1021 : 0)) & 0xffff;
  }
  return crc;
}
export function packet(command, sequence, payload = Buffer.alloc(0)) {
  const body = Buffer.alloc(4 + payload.length);
  body[0] = command.charCodeAt(0); body[1] = sequence;
  body.writeUInt16LE(payload.length, 2); payload.copy(body, 4);
  const result = Buffer.alloc(4 + body.length + 2);
  result.write('HML1'); body.copy(result, 4); result.writeUInt16LE(crc16(body), result.length - 2);
  return result;
}
export function mapFrame(frame, mapping = DEFAULT_MAPPING) {
  if (frame.length !== FRAME_BYTES) throw new LampError('A lamp frame must contain 256 RGB pixels.', 400);
  const output = Buffer.alloc(FRAME_BYTES);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let px = mapping.mirrorX ? 15 - x : x, py = y;
    if (mapping.rotation === 90) [px, py] = [15 - py, px];
    else if (mapping.rotation === 180) [px, py] = [15 - px, 15 - py];
    else if (mapping.rotation === 270) [px, py] = [py, 15 - px];
    const index = (py * 16 + (mapping.serpentine && py % 2 ? 15 - px : px)) * 3;
    const source = (y * 16 + x) * 3;
    output[index] = frame[source]; output[index + 1] = frame[source + 1]; output[index + 2] = frame[source + 2];
  }
  return output;
}
export async function listUsbPorts() {
  try {
    return (await readdir('/dev')).filter(name => /^(cu\.(usbserial[-\w]*|usbmodem[-\w]*)|tty(USB|ACM)\d+)$/.test(name))
      .sort().map(name => ({ path:`/dev/${name}`, label:name }));
  } catch { return []; }
}

/** Small POSIX helper owns the device exclusively; Node never shells out. */
export class PythonSerialTransport extends EventEmitter {
  constructor(port, { python = process.env.HOUSEMATE_PYTHON || (process.platform === 'darwin' ? '/usr/bin/python3' : 'python3') } = {}) {
    super(); this.port = port; this.python = python; this.closed = false;
  }
  start() {
    return new Promise((resolve, reject) => {
      let opened = false, lines = '';
      const failure = () => {
        const error = new LampError('USB connection failed. Close other serial monitors and reconnect the board.');
        if (!opened) reject(error);
        if (!this.closed) this.emit('failure', error);
      };
      this.child = spawn(this.python, ['-u', fileURLToPath(new URL('./hardware/serial_transport.py', import.meta.url)), this.port], { stdio:['pipe', 'pipe', 'ignore'] });
      this.closedPromise = new Promise(done => { this.child.once('close', done); this.child.once('error', done); });
      const timer = setTimeout(() => { failure(); this.close(); }, 4000);
      this.child.on('error', failure);
      this.child.on('exit', () => { clearTimeout(timer); if (!this.closed) failure(); });
      this.child.stdin.on('error', () => { if (!this.closed) failure(); });
      this.child.stdout.on('data', chunk => {
        lines += chunk.toString('utf8');
        if (lines.length > 16384) { failure(); this.close(); return; }
        let end;
        while ((end = lines.indexOf('\n')) >= 0) {
          const line = lines.slice(0, end); lines = lines.slice(end + 1);
          let message;
          try { message = JSON.parse(line); } catch { failure(); this.close(); return; }
          if (message.kind === 'open') { opened = true; clearTimeout(timer); resolve(); }
          else if (message.kind === 'data' && typeof message.data === 'string') this.emit('data', Buffer.from(message.data, 'base64'));
          else if (message.kind === 'error') { failure(); this.close(); return; }
        }
      });
    });
  }
  write(bytes) {
    if (this.closed || !this.child?.stdin.writable) throw new LampError('The USB board disconnected.');
    this.child.stdin.write(`${JSON.stringify({ write:bytes.toString('base64') })}\n`);
  }
  close() {
    if (this.closed) return this.closedPromise;
    this.closed = true;
    if (this.child?.stdin.writable) this.child.stdin.end('{"close":true}\n');
    const child = this.child;
    const timer = setTimeout(() => { if (child && child.exitCode === null) child.kill('SIGTERM'); }, 200);
    timer.unref();
    return this.closedPromise;
  }
}

export class LampService {
  constructor({ enabled = process.env.HOUSEMATE_HARDWARE === '1', scanPorts = listUsbPorts, transportFactory = port => new PythonSerialTransport(port), commandTimeout = 1400, leaseMs = 4500, now = Date.now } = {}) {
    this.enabled = enabled; this.scanPorts = scanPorts; this.transportFactory = transportFactory;
    this.commandTimeout = commandTimeout; this.leaseMs = leaseMs; this.now = now;
    this.ports = []; this.transport = null; this.token = null; this.connecting = false; this.claimBusy = false; this.control = false;
    this.connected = false; this.ready = false; this.frameBusy = false; this.port = null; this.maxBrightness = 3; this.brightness = 3;
    this.mapping = { ...DEFAULT_MAPPING }; this.frameCount = 0; this.lastAckAt = null; this.error = null;
    this.sequence = 0; this.lines = ''; this.pending = null; this.generation = 0; this.lastLeaseAt = 0;
    this.lastFrame = null; this.testColor = null; this.lastPingAt = 0;
    this.liveLease = null;
    this.pendingTransportClose = Promise.resolve();
  }
  status() {
    return { enabled:this.enabled, ports:this.ports, connected:this.connected, ready:this.ready, port:this.port,
      pixels:256, pin:6, maxBrightness:this.maxBrightness, brightness:this.brightness, mapping:{ ...this.mapping },
      frameCount:this.frameCount, lastAckAt:this.lastAckAt, error:this.error, testColor:this.testColor, leaseConnected:Boolean(this.liveLease) };
  }
  async getStatus() { if (this.enabled) this.ports = await this.scanPorts(); return this.status(); }
  authorize(token) {
    if (!this.token || typeof token !== 'string' || !/^[a-f0-9]{48}$/.test(token) || !timingSafeEqual(Buffer.from(token), Buffer.from(this.token))) throw new LampError('This lamp session has ended. Connect again.', 401);
    if (this.claimBusy) throw new LampError('Lamp control is moving to another page. Try again.', 409);
    if (!this.connected || !this.ready) throw new LampError('The lamp is not connected.', 409);
    this.lastLeaseAt = this.now();
  }
  checkSession(token, generation) {
    if (generation !== this.generation) throw new LampError('This lamp session has ended. Connect again.', 401);
    this.authorize(token);
  }
  async connect(port, { takeover = false } = {}) {
    if (!this.enabled) throw new LampError('USB control is enabled only on the local computer.', 403);
    if (typeof takeover !== 'boolean') throw new LampError('Invalid lamp control request.', 400);
    if (this.claimBusy || this.connecting || this.control || (this.transport && !takeover)) throw new LampError('USB is already in use. Choose Use lamp here to switch pages.', 409);
    this.claimBusy = true;
    let generation;
    try {
      // Validate first; an unavailable target must not blank the current lamp.
      this.ports = await this.scanPorts();
      if (!this.ports.some(item => item.path === port)) throw new LampError('Select an available USB board.', 400);
      if (this.transport) await this.disconnectInternal();
      await this.pendingTransportClose;
      this.connecting = true; this.error = null; this.port = port; this.lines = ''; this.frameCount = 0;
      this.lastAckAt = null; this.ready = false; this.lastFrame = null; this.testColor = null;
      generation = ++this.generation;
      const transport = this.transport = this.transportFactory(port);
      transport.on('data', bytes => { if (generation === this.generation) this.receive(bytes); });
      transport.on('failure', () => { if (generation === this.generation) this.fail('The USB board disconnected. Reconnect it and try again.'); });
      await transport.start();
      // Opening a Nano resets it. Retry hello while the bootloader hands over.
      let helloAcknowledged = false;
      for (let attempt = 0; attempt < 4 && generation === this.generation; attempt++) {
        try { await this.command('H'); if (this.ready) { helloAcknowledged = true; break; } } catch { /* Retry bootloader/reset window. */ }
      }
      if (generation !== this.generation || !this.ready || !helloAcknowledged) throw new LampError('The board did not recognize Housemate firmware. Upload the Arduino sketch first.');
      await this.command('O');
      this.connected = true; this.connecting = false; this.lastLeaseAt = this.now();
      this.token = randomBytes(24).toString('hex');
      this.timer = setInterval(() => { void this.tick(); }, 250); this.timer.unref();
      return { ...this.status(), token:this.token };
    } catch (error) {
      if (generation !== undefined && generation === this.generation) this.fail(error instanceof LampError ? error.message : 'Could not connect the USB board.');
      throw error instanceof LampError ? error : new LampError('Could not connect the USB board.');
    } finally { this.claimBusy = false; }
  }
  receive(bytes) {
    this.lines += bytes.toString('ascii');
    if (this.lines.length > 2048) { this.fail('The board returned invalid serial data.'); return; }
    let end;
    while ((end = this.lines.indexOf('\n')) >= 0) {
      const line = this.lines.slice(0, end).trim(); this.lines = this.lines.slice(end + 1);
      const ready = /^HML READY 1 256 6 (\d{1,3})$/.exec(line);
      if (ready && Number(ready[1]) >= 1 && Number(ready[1]) <= 255) {
        this.maxBrightness = Math.min(3, Number(ready[1])); this.brightness = Math.min(this.brightness, this.maxBrightness); this.ready = true;
      }
      const reply = /^(ACK|NAK) (\d{1,3})(?: (\w+))?$/.exec(line);
      if (reply && this.pending && Number(reply[2]) === this.pending.sequence) {
        const pending = this.pending; this.pending = null; clearTimeout(pending.timer);
        if (reply[1] === 'ACK') { this.lastAckAt = this.now(); pending.resolve(); }
        else pending.reject(new LampError('The Arduino rejected an incomplete or invalid light frame.'));
      }
    }
  }
  command(command, payload) {
    if (!this.transport) return Promise.reject(new LampError('The USB board is disconnected.'));
    if (this.pending) return Promise.reject(new LampError('The lamp is busy. Try again.', 409));
    const sequence = this.sequence = (this.sequence + 1) & 255;
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    const timer = setTimeout(() => {
      if (this.pending?.sequence !== sequence) return;
      this.pending = null; reject(new LampError('The Arduino stopped acknowledging light frames. Reconnect it.'));
    }, this.commandTimeout);
    this.pending = { sequence, resolve, reject, timer, promise };
    try { this.transport.write(packet(command, sequence, payload)); }
    catch { this.pending = null; clearTimeout(timer); reject(new LampError('The USB board disconnected.')); }
    return promise;
  }
  async exclusive(callback, token, generation) {
    if (this.control) throw new LampError('The lamp is busy. Try again.', 409);
    this.control = true;
    try { if (this.pending) await this.pending.promise; this.checkSession(token, generation); return await callback(); }
    catch (error) { if (generation === this.generation && ![401,409].includes(error.status)) this.fail(error.message); throw error; }
    finally { if (generation === this.generation) this.control = false; }
  }
  async sendFrame(token, frame) {
    this.authorize(token);
    const generation = this.generation;
    if (frame.length !== FRAME_BYTES) throw new LampError('A frame must contain exactly 768 RGB bytes.', 400);
    if (this.control || this.frameBusy) throw new LampError('The lamp is busy. Try again.', 409);
    this.frameBusy = true;
    const image = Buffer.from(frame);
    try {
      // One browser request is in flight. An occasional ping may finish first.
      if (this.pending) await this.pending.promise;
      this.checkSession(token, generation);
      if (this.control) throw new LampError('The lamp is busy. Try again.', 409);
      await this.command('F', this.framePayload(mapFrame(image, this.mapping)));
      this.checkSession(token, generation);
      this.lastFrame = image; this.testColor = null; this.frameCount++;
    }
    catch (error) { if (generation === this.generation && ![401,409].includes(error.status)) this.fail(error.message); throw error; }
    finally { if (generation === this.generation) this.frameBusy = false; }
    return this.status();
  }
  framePayload(frame) { return Buffer.concat([Buffer.from([this.brightness]), frame]); }
  heartbeat(token) { this.authorize(token); return this.status(); }
  attachLease(token, close) {
    this.authorize(token);
    const previous = this.liveLease;
    const lease = { close };
    this.liveLease = lease;
    // Set the new identity first: a late close from the replaced stream must
    // not detach its replacement or revoke the current page's ownership.
    try { previous?.close(); } catch { /* The old response may already be gone. */ }
    return () => {
      if (this.liveLease !== lease) return;
      this.liveLease = null; this.lastLeaseAt = this.now();
    };
  }
  async configure(token, settings) {
    this.authorize(token);
    const generation = this.generation;
    const { brightness, mapping } = settings || {};
    if (!Number.isInteger(brightness) || brightness < 1 || brightness > this.maxBrightness || !mapping || typeof mapping.serpentine !== 'boolean' || typeof mapping.mirrorX !== 'boolean' || ![0,90,180,270].includes(mapping.rotation)) throw new LampError('Invalid brightness or pixel mapping.', 400);
    return this.exclusive(async () => {
      this.brightness = brightness; this.mapping = { serpentine:mapping.serpentine, rotation:mapping.rotation, mirrorX:mapping.mirrorX };
      if (this.testColor) await this.command('F', this.framePayload(this.testFrame(this.testColor)));
      else if (this.lastFrame) { await this.command('F', this.framePayload(mapFrame(this.lastFrame, this.mapping))); this.frameCount++; }
      else await this.command('P');
      return this.status();
    }, token, generation);
  }
  testFrame(color) {
    const frame = Buffer.alloc(FRAME_BYTES);
    if (color !== 'off') frame[{red:0,green:1,blue:2}[color]] = 255;
    return frame;
  }
  async test(token, color) {
    this.authorize(token);
    const generation = this.generation;
    if (!['red','green','blue','off'].includes(color)) throw new LampError('Choose red, green, blue or off.', 400);
    return this.exclusive(async () => { await this.command('F', this.framePayload(this.testFrame(color))); this.testColor = color; this.frameCount++; return this.status(); }, token, generation);
  }
  async tick() {
    if (!this.connected || this.control || this.claimBusy) return;
    // A live HTTP response follows the actual page connection. Unlike a JS
    // timer, it is not paused merely because the page is in the background.
    if (!this.liveLease && this.now() - this.lastLeaseAt > this.leaseMs) { await this.disconnectInternal('The page disconnected. Connect again to resume.'); return; }
    if (!this.pending && this.now() - this.lastPingAt >= 1000) {
      this.lastPingAt = this.now();
      const generation = this.generation;
      try { await this.command('P'); }
      catch { if (generation === this.generation && !this.claimBusy) this.fail('The Arduino stopped responding. Reconnect it.'); }
    }
  }
  async disconnect(token) { this.authorize(token); await this.disconnectInternal(); return this.status(); }
  async disconnectInternal(message = null) {
    if (this.control) throw new LampError('The lamp is busy. Try again.', 409);
    this.control = true;
    try { if (this.pending) await this.pending.promise; if (this.transport && this.ready) await this.command('O'); }
    catch { /* Firmware also blanks the LEDs if the serial link is lost. */ }
    finally { await this.release(); this.error = message; this.control = false; }
  }
  fail(message) { this.release(); this.error = message; }
  release() {
    ++this.generation; clearInterval(this.timer); this.timer = null;
    const lease = this.liveLease; this.liveLease = null;
    try { lease?.close(); } catch { /* Closing the board also ends ownership. */ }
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(new LampError('The USB session ended.')); this.pending = null; }
    const closing = this.transport?.close(); this.transport = null; this.token = null; this.connected = false; this.ready = false; this.connecting = false;
    this.port = null; this.testColor = null; this.frameBusy = false;
    if (closing?.then) this.pendingTransportClose = Promise.allSettled([this.pendingTransportClose, closing]).then(() => {});
    return this.pendingTransportClose;
  }
  async shutdown() { if (this.transport && !this.control) await this.disconnectInternal(); else this.release(); }
}

function openLeaseResponse(req, res, service, token) {
  if (req.aborted || res.destroyed) throw new LampError('The page connection was closed.', 400);
  let timer;
  const detach = service.attachLease(token, () => res.end());
  const cleanup = () => { clearInterval(timer); detach(); };
  res.once('close', cleanup);
  res.once('error', () => { cleanup(); res.destroy(); });
  res.setTimeout(0);
  res.writeHead(200, { 'Content-Type':'text/event-stream; charset=utf-8', 'Cache-Control':'no-store', 'Connection':'keep-alive' });
  res.flushHeaders();
  res.write(': connected\n\n');
  timer = setInterval(() => {
    if (res.destroyed || res.writableEnded) { cleanup(); return; }
    // A frozen reader cannot grow an unbounded server-side write buffer.
    if (res.writableLength > 1024) { res.destroy(); return; }
    res.write(': lamp\n\n');
  }, 15000);
  timer.unref();
}

export function isLocalLampRequest(req) {
  const remote = req.socket.remoteAddress || '';
  if (!(remote === '::1' || /^127\./.test(remote) || /^::ffff:127\./.test(remote))) return false;
  try {
    const url = new URL(`http://${req.headers.host}`);
    return ['localhost','127.0.0.1','[::1]'].includes(url.hostname) && url.username === '' && url.password === '';
  } catch { return false; }
}
export async function handleLampRequest(req, res, pathname, service, json) {
  if (req.method === 'GET' && pathname === '/api/lamp' && !service.enabled) { json(res, 200, service.status()); return; }
  if (!service.enabled || !isLocalLampRequest(req)) { json(res, 403, { error:'USB control is available only on the local computer.' }); return; }
  if (req.method === 'GET' && pathname === '/api/lamp') { json(res, 200, await service.getStatus()); return; }
  if (req.method !== 'POST') { json(res, 404, { error:'Not found' }); return; }
  let origin;
  try { origin = new URL(req.headers.origin); } catch { /* Missing origin is not allowed for physical control. */ }
  if (!origin || !['http:','https:'].includes(origin.protocol) || origin.host !== req.headers.host || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) { json(res, 403, { error:'Origin not allowed' }); return; }
  const binary = pathname === '/api/lamp/frame';
  if ((req.headers['content-type'] || '').split(';')[0].trim() !== (binary ? 'application/octet-stream' : 'application/json')) { json(res, 415, { error:'Invalid content type.' }); return; }
  try {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > (binary ? FRAME_BYTES : 4096)) throw new LampError('The lamp request is too large.', 413);
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    let body;
    if (!binary) { try { body = JSON.parse(bytes.toString('utf8')); } catch { throw new LampError('Invalid request.', 400); } }
    const token = req.headers['x-lamp-token'];
    if (pathname === '/api/lamp/lease') { openLeaseResponse(req, res, service, token); return; }
    let result;
    switch (pathname) {
      case '/api/lamp/connect': result = await service.connect(body?.port, {takeover:body?.takeover === undefined ? false : body.takeover}); break;
      case '/api/lamp/frame': result = await service.sendFrame(token, bytes); break;
      case '/api/lamp/heartbeat': result = service.heartbeat(token); break;
      case '/api/lamp/configure': result = await service.configure(token, body); break;
      case '/api/lamp/test': result = await service.test(token, body?.color); break;
      case '/api/lamp/disconnect': result = await service.disconnect(token); break;
      default: throw new LampError('Not found', 404);
    }
    json(res, 200, result);
  } catch (error) { json(res, error instanceof LampError ? error.status : 503, { error:error instanceof LampError ? error.message : 'The USB connection is unavailable.' }); }
}
