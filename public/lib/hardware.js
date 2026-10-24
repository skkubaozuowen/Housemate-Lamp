const FRAME_BYTES = 16 * 16 * 3;
const FRAME_INTERVAL_MS = 125;

/** A local USB session: no stored credentials, reconnects, or queued old frames. */
export class LampBridge {
  constructor({ fetcher = (...args) => fetch(...args), timers = globalThis, now = () => performance.now(), onChange = () => {} } = {}) {
    this.fetcher = fetcher; this.timers = timers; this.now = now; this.onChange = onChange;
    this.status = { enabled:false, connected:false, ready:false, ports:[], frameCount:0, error:null };
    this.token = null; this.syncing = true; this.pending = null;
    this.frameTimer = null; this.inFlight = false; this.frameDone = null; this.commandBusy = false; this.leaseBusy = false;
    this.leaseController = null; this.leaseReader = null; this.leaseHandshakeTimer = null; this.leaseConnected = false;
    this.lastFrameAt = -Infinity; this.generation = 0; this.statusRevision = 0; this.destroyed = false;
  }
  get active() { return Boolean(this.token && this.status.connected && this.status.ready && this.leaseConnected && !this.destroyed); }
  emit() { this.onChange({ ...this.status, active:this.active, connecting:Boolean(this.token && this.status.connected && !this.leaseConnected), syncing:this.syncing }); }
  async request(path, { body, binary = false, token = this.token, keepalive = false } = {}) {
    const headers = {};
    if (token) headers['X-Lamp-Token'] = token;
    if (body !== undefined) headers['Content-Type'] = binary ? 'application/octet-stream' : 'application/json';
    const response = await this.fetcher(`/api/lamp${path}`, {
      method:body === undefined ? 'GET' : 'POST', headers,
      ...(body === undefined ? {} : { body:binary ? body : JSON.stringify(body) }),
      ...(keepalive ? { keepalive:true } : { signal:AbortSignal.timeout(path === '/connect' ? 12000 : 5000) })
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(typeof result.error === 'string' ? result.error : 'The lamp did not respond. Try connecting again.');
      error.status = response.status; throw error;
    }
    return result;
  }
  apply(result) {
    const { token:ignored, ...status } = result;
    this.status = { ...this.status, ...status }; this.statusRevision++; this.emit();
  }
  async refresh() {
    if (this.refreshTask) return this.refreshTask;
    const generation = this.generation, revision = this.statusRevision;
    const task = (async () => {
      try { const result = await this.request(''); if (generation === this.generation && revision === this.statusRevision) this.apply(result); }
      catch (error) { if (generation === this.generation && revision === this.statusRevision) { this.status.error = error.message; this.emit(); } }
      return this.status;
    })();
    this.refreshTask = task;
    try { return await task; }
    finally { if (this.refreshTask === task) this.refreshTask = null; }
  }
  async connect(port, { takeover = false } = {}) {
    if (this.destroyed) return;
    this.endSession();
    const generation = this.generation;
    const result = await this.request('/connect', { body:{ port, takeover:takeover === true }, token:null });
    if (generation !== this.generation || this.destroyed) return;
    if (!result.token || !result.ready || !result.connected) throw new Error('USB opened, but the lamp has not acknowledged its firmware.');
    this.token = result.token; this.syncing = true; this.apply(result);
    try { await this.openLease(generation); }
    catch (error) {
      if (generation !== this.generation || this.destroyed) return;
      const token = this.token;
      const failure = new Error(`The lamp's page connection could not start. ${error.message}`);
      this.fail(failure);
      // A successful serial connection must never be left without its owner.
      try { await this.request('/disconnect', { body:{}, token }); } catch { /* The server also closes an expired or aborted lease. */ }
      throw failure;
    }
  }
  async openLease(generation) {
    const controller = new AbortController();
    this.leaseController = controller;
    const timer = this.leaseHandshakeTimer = this.timers.setTimeout(() => controller.abort(), 5000);
    try {
      // This is intentionally not request(): a whole-request timeout would
      // terminate a healthy streaming lease after a few seconds.
      const response = await this.fetcher('/api/lamp/lease', {
        method:'POST', headers:{ 'Content-Type':'application/json', 'X-Lamp-Token':this.token },
        body:'{}', signal:controller.signal
      });
      this.timers.clearTimeout(timer);
      if (this.leaseHandshakeTimer === timer) this.leaseHandshakeTimer = null;
      if (generation !== this.generation || this.destroyed) { controller.abort(); return; }
      if (!response.ok) {
        const result = await response.json();
        throw new Error(typeof result.error === 'string' ? result.error : 'The local connection was refused.');
      }
      if (!response.headers?.get('content-type')?.startsWith('text/event-stream') || !response.body?.getReader) throw new Error('A persistent local connection is unavailable.');
      const reader = response.body.getReader();
      this.leaseReader = reader; this.leaseConnected = true; this.emit();
      this.leaseTask = this.readLease(reader, generation);
    } catch (error) { controller.abort(); throw error; }
    finally {
      this.timers.clearTimeout(timer);
      if (this.leaseHandshakeTimer === timer) this.leaseHandshakeTimer = null;
    }
  }
  async readLease(reader, generation) {
    try {
      for (;;) {
        const { done } = await reader.read();
        if (generation !== this.generation || this.destroyed) return;
        if (done) throw new Error('The page connection ended. Connect the lamp again to resume.');
      }
    } catch (error) { if (generation === this.generation && !this.destroyed) this.fail(error); }
    finally { reader.releaseLock(); }
  }
  endSession() {
    this.generation++; this.token = null; this.pending = null; this.lastFrameAt = -Infinity;
    if (this.frameTimer !== null) this.timers.clearTimeout(this.frameTimer);
    if (this.leaseHandshakeTimer !== null) this.timers.clearTimeout(this.leaseHandshakeTimer);
    const controller = this.leaseController, reader = this.leaseReader;
    this.frameTimer = null; this.leaseHandshakeTimer = null; this.leaseController = null; this.leaseReader = null; this.leaseConnected = false;
    controller?.abort();
    if (reader) void reader.cancel().catch(() => {});
  }
  fail(error) {
    this.endSession(); this.status = { ...this.status, connected:false, ready:false, error:error.message }; this.emit();
  }
  offer(frame) {
    if (!this.active || !this.syncing || !frame || frame.length !== FRAME_BYTES) return;
    // Renderer reuses its frame storage. Copy only the newest complete frame.
    this.pending = new Uint8Array(frame); this.schedule();
  }
  schedule() {
    if (!this.active || !this.syncing || !this.pending || this.inFlight || this.commandBusy || this.frameTimer !== null) return;
    const delay = Math.max(0, FRAME_INTERVAL_MS - (this.now() - this.lastFrameAt));
    this.frameTimer = this.timers.setTimeout(() => { this.frameTimer = null; void this.sendFrame(); }, delay);
  }
  async sendFrame() {
    if (!this.active || !this.syncing || !this.pending || this.inFlight || this.commandBusy) return;
    const frame = this.pending; this.pending = null;
    const generation = this.generation;
    let complete;
    const completion = new Promise(resolve => { complete = resolve; });
    this.frameDone = completion;
    this.inFlight = true; this.lastFrameAt = this.now();
    try {
      const result = await this.request('/frame', { body:frame, binary:true });
      if (generation === this.generation) this.apply(result);
    } catch (error) {
      if (generation === this.generation) {
        if (error.status === 409) {
          // A local configuration or ping can briefly own the serial command.
          // Keep a newer offered frame, or retry this last complete frame.
          if (this.active && this.syncing && !this.pending) this.pending = frame;
        } else this.fail(error);
      }
    } finally {
      this.inFlight = false;
      if (this.frameDone === completion) this.frameDone = null;
      complete(); this.schedule();
    }
  }
  async heartbeat() {
    if (!this.active || this.leaseBusy) return;
    const generation = this.generation; this.leaseBusy = true;
    try {
      const result = await this.request('/heartbeat', { body:{} });
      if (generation === this.generation) {
        this.apply(result);
        if (!this.status.connected || !this.status.ready) this.fail(new Error(this.status.error || 'The lamp disconnected. Connect again to resume.'));
      }
    } catch (error) { if (generation === this.generation && error.status !== 409) this.fail(error); }
    finally { this.leaseBusy = false; }
  }
  async configure(settings) {
    if (!this.active) return;
    await this.command('/configure', settings);
  }
  async command(path, body) {
    if (this.commandBusy) throw new Error('Another lamp adjustment is finishing. Try again in a moment.');
    const generation = this.generation;
    this.commandBusy = true;
    try {
      await this.frameDone;
      if (generation !== this.generation || !this.active) return;
      const result = await this.request(path, { body });
      if (generation === this.generation) this.apply(result);
    } finally { this.commandBusy = false; this.schedule(); }
  }
  async test(color) {
    if (!this.active) return;
    // Keep the calibration color visible until Sync with page is pressed.
    this.syncing = false; this.pending = null;
    if (this.frameTimer !== null) this.timers.clearTimeout(this.frameTimer);
    this.frameTimer = null; this.emit();
    await this.command('/test', { color });
  }
  resume(frame) { this.syncing = true; this.emit(); this.offer(frame); }
  async disconnect({ keepalive = false } = {}) {
    const token = this.token; this.endSession();
    const generation = this.generation;
    this.status = { ...this.status, connected:false, ready:false }; this.emit();
    if (token) {
      try { const result = await this.request('/disconnect', { body:{}, token, keepalive }); if (generation === this.generation) this.apply(result); }
      catch (error) { if (!keepalive && generation === this.generation) { this.status.error = error.message; this.emit(); } }
    }
  }
  destroy() { this.stopWatchingPage?.(); void this.disconnect({ keepalive:true }); this.destroyed = true; }
}

/** Visibility refreshes status only; moving between pages never claims a lamp. */
export function watchHardwarePage(bridge, { document:doc = document, window:win = window } = {}) {
  const refresh = () => { bridge.emit(); if (!doc.hidden && !bridge.destroyed) void bridge.refresh(); };
  win.addEventListener('focus', refresh);
  doc.addEventListener('visibilitychange', refresh);
  return () => { win.removeEventListener('focus', refresh); doc.removeEventListener('visibilitychange', refresh); };
}

export function setupHardware(renderer, { document:doc = document, bridgeOptions = {} } = {}) {
  const byId = id => doc.getElementById(id);
  const section = byId('lamp-hardware');
  if (!section) return null;
  const ports = byId('lamp-port'), status = byId('lamp-status'), details = byId('lamp-detail');
  let busy = false;
  const bridge = new LampBridge({ ...bridgeOptions, onChange:state => {
    const available = Boolean(state.enabled), active = state.active;
    const selected = ports.value;
    ports.replaceChildren();
    for (const port of state.ports || []) {
      const option = doc.createElement('option'); option.value = port.path; option.textContent = port.label || port.path;
      ports.append(option);
    }
    if (![...ports.options].length) { const option = doc.createElement('option'); option.value = ''; option.textContent = 'No USB board found'; ports.append(option); }
    const preferred = state.connected && state.port ? state.port : selected;
    if ([...ports.options].some(option => option.value === preferred)) ports.value = preferred;
    ports.disabled = busy || !available || state.connected;
    byId('lamp-connect').disabled = busy || !available || active || state.connecting || !ports.value;
    byId('lamp-connect').textContent = state.connected && !active && !state.connecting ? 'Use lamp here' : 'Connect lamp';
    byId('lamp-disconnect').disabled = busy || !active;
    byId('lamp-refresh').disabled = busy;
    for (const control of section.querySelectorAll('[data-lamp-control]')) control.disabled = busy || !active;
    byId('lamp-sync').disabled = busy || !active || state.syncing;
    const max = state.maxBrightness || 3;
    byId('lamp-brightness').max = String(max);
    if (state.brightness !== undefined && doc.activeElement !== byId('lamp-brightness')) byId('lamp-brightness').value = String(state.brightness);
    byId('lamp-brightness-value').textContent = `${byId('lamp-brightness').value} / 255`;
    if (state.mapping) {
      if (doc.activeElement !== byId('lamp-serpentine')) byId('lamp-serpentine').checked = state.mapping.serpentine;
      if (doc.activeElement !== byId('lamp-rotation')) byId('lamp-rotation').value = String(state.mapping.rotation);
      if (doc.activeElement !== byId('lamp-mirror')) byId('lamp-mirror').checked = state.mapping.mirrorX;
    }
    const following = !state.syncing ? 'calibration held' : renderer.paused ? 'paused' : doc.hidden ? 'background holds current light' : 'following this page';
    const statusText = state.error ? state.error : !available ? 'USB control is available on the local computer only.' : state.connecting ? 'Starting the lamp’s page connection…' : active ? `Lamp connected · ${following}` : state.connected ? 'Another page controls the lamp. Choose Use lamp here to switch to this page.' : 'Connect the USB board to start.';
    if (status.textContent !== statusText) status.textContent = statusText;
    status.dataset.state = state.error ? 'error' : active ? 'connected' : 'idle';
    details.textContent = active ? `${state.pixels || 256} pixels · D${state.pin || 6} · ${state.frameCount || 0} frames acknowledged${state.lastAckAt ? ' · Lamp responding' : ''}` : available ? 'Start at low brightness. Test one pixel, then sync the light.' : 'Open this project at localhost to connect the Arduino.';
    const main = byId('lamp-page-controls');
    if (main) {
      main.hidden = !available;
      main.dataset.state = active ? 'connected' : state.connected ? 'other' : 'idle';
      const mainText = state.connecting ? 'USB lamp · connecting…' : active ? `USB lamp · ${following}` : state.connected ? 'USB lamp · another page is in control' : 'USB lamp · disconnected';
      if (byId('lamp-page-status').textContent !== mainText) byId('lamp-page-status').textContent = mainText;
      byId('lamp-page-action').textContent = state.connecting ? 'Connecting…' : active ? 'Light controls' : state.connected ? 'Use lamp here' : 'Connect lamp';
      byId('lamp-page-action').disabled = busy || state.connecting;
    }
  } });
  async function action(callback) {
    if (busy) return;
    busy = true; bridge.emit();
    try { await callback(); }
    catch (error) { if (error.status === 409) await bridge.refresh(); bridge.status.error = error.message; }
    finally { busy = false; bridge.emit(); }
  }
  const openControls = () => {
    if (!byId('research').open) byId('open-research').click();
    section.scrollIntoView({block:'start'});
    (bridge.active ? byId('lamp-disconnect') : ports.disabled ? byId('lamp-connect') : ports).focus({preventScroll:true});
  };
  const connectHere = async () => {
    const takeover = Boolean(bridge.status.connected && !bridge.active);
    await bridge.connect(ports.value, {takeover});
    bridge.offer(renderer.frame);
  };
  byId('lamp-refresh').addEventListener('click', () => { void action(() => bridge.refresh()); });
  byId('lamp-connect').addEventListener('click', () => { void action(connectHere); });
  byId('lamp-page-action')?.addEventListener('click', () => {
    if (bridge.active) { openControls(); return; }
    const availablePorts = bridge.status.ports || [];
    if (availablePorts.length !== 1) { openControls(); return; }
    ports.value = availablePorts[0].path;
    void action(connectHere);
  });
  byId('lamp-disconnect').addEventListener('click', () => { void action(() => bridge.disconnect()); });
  const configure = () => action(async () => {
    await bridge.configure({ brightness:Number(byId('lamp-brightness').value), mapping:{ serpentine:byId('lamp-serpentine').checked, rotation:Number(byId('lamp-rotation').value), mirrorX:byId('lamp-mirror').checked } });
    if (bridge.syncing) bridge.offer(renderer.frame);
  });
  byId('lamp-brightness').addEventListener('input', () => { byId('lamp-brightness-value').textContent = `${byId('lamp-brightness').value} / 255`; });
  for (const id of ['lamp-brightness','lamp-serpentine','lamp-rotation','lamp-mirror']) byId(id).addEventListener('change', () => { void configure(); });
  for (const button of section.querySelectorAll('[data-lamp-test]')) button.addEventListener('click', () => { void action(() => bridge.test(button.dataset.lampTest)); });
  byId('lamp-sync').addEventListener('click', () => bridge.resume(renderer.frame));
  bridge.stopWatchingPage = watchHardwarePage(bridge, {document:doc,window:doc.defaultView || window});
  void bridge.refresh();
  return bridge;
}
