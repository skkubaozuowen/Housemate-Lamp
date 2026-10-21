import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isSameOrigin, listenHost } from './deployment.js';
import { planLocal, normalizePreferences, normalizePlan } from './public/lib/planner.js';
import { requestPlan } from './response-api.js';

const root = new URL('./', import.meta.url);
const staticFiles = {
  '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'],
  '/style.css': ['style.css', 'text/css'], '/app.js': ['app.js', 'text/javascript'],
  ...Object.fromEntries(['catalog', 'palettes', 'planner', 'renderer', 'controller', 'research'].map(name => [`/lib/${name}.js`, [`lib/${name}.js`, 'text/javascript']]))
};
function json(res, status, body) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
export async function getKey() {
  if (process.env.OPENAI_API_KEY?.trim()) return process.env.OPENAI_API_KEY.trim();
  try {
    const raw = await readFile(new URL('API Key.txt', root), 'utf8');
    return raw.match(/sk-[A-Za-z0-9_-]+/)?.[0] || raw.trim();
  } catch { return ''; }
}
function sanitizeBody(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.text !== 'string' || !raw.text.trim() || raw.text.length > 2000 || (raw.mode !== undefined && !['ai', 'demo'].includes(raw.mode))) return null;
  const history = raw.history || [];
  if (!Array.isArray(history) || history.length > 20 || history.some(item => !item || item.role !== 'user' || typeof item.content !== 'string' || !item.content.trim() || item.content.length > 2000)) return null;
  const context = raw.context && typeof raw.context === 'object' ? raw.context : {};
  return {
    text: raw.text.trim(), history: history.map(item => ({ role: 'user', content: item.content })), mode: raw.mode || 'ai',
    context: { preferences: normalizePreferences(context.preferences), currentPlan: context.currentPlan ? normalizePlan(context.currentPlan) : null, stableState: ['idle', 'hold', 'waiting', 'accompany', 'withdraw'].includes(context.stableState) ? context.stableState : 'idle' }
  };
}
async function readBody(req) {
  const chunks = []; let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 100000) return { status: 413 };
    chunks.push(chunk);
  }
  try { return { value: JSON.parse(Buffer.concat(chunks).toString('utf8')) }; } catch { return { status: 400 }; }
}

export function createServer({ keyProvider = getKey, fetchImpl = globalThis.fetch, timeoutMs = 24000, model = process.env.OPENAI_MODEL || 'gpt-6-sol' } = {}) {
  const deadline = Math.max(1, Math.min(25000, Number(timeoutMs) || 24000));
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    let pathname;
    try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { return json(res, 400, { error: 'Invalid request.' }); }
    if (req.method === 'GET' && Object.hasOwn(staticFiles, pathname)) {
      const [file, type] = staticFiles[pathname];
      try { const data = await readFile(new URL(`public/${file}`, root)); res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(data); }
      catch { json(res, 500, { error: 'Could not load the page.' }); }
      return;
    }
    if (req.method === 'GET' && pathname === '/api/config') {
      try { return json(res, 200, { aiAvailable: Boolean(await keyProvider()) }); }
      catch { return json(res, 200, { aiAvailable: false }); }
    }
    if (req.method !== 'POST' || pathname !== '/api/plan') return json(res, 404, { error: 'Not found' });
    if (!isSameOrigin(req.headers.origin, req.headers.host)) return json(res, 403, { error: 'Origin not allowed' });
    const cancellation = new AbortController();
    res.once('close', () => { if (!res.writableEnded) cancellation.abort(); });
    let timer;
    let fallback;
    try {
      const parsed = await readBody(req);
      if (parsed.status) return json(res, parsed.status, { error: parsed.status === 413 ? 'This moment is too long.' : 'Invalid request.' });
      const body = sanitizeBody(parsed.value);
      if (!body) return json(res, 400, { error: 'Please enter 1–2000 characters and valid conversation context.' });
      const local = planLocal(body.text, body.context);
      const base = fallback = { plan: local.plan, preferences: local.preferences };
      if (body.mode === 'demo') return json(res, 200, { ...base, mode: 'demo', source: 'demo' });
      let key = '';
      try { key = await keyProvider(); } catch { /* Missing configuration follows the explicit demo route. */ }
      if (!key) return json(res, 200, { ...base, mode: 'demo', source: 'demo', reason: 'unconfigured', retryable: false });
      if (local.priority) return json(res, 200, { ...base, mode: 'ai', source: 'local_rule' });
      if (cancellation.signal.aborted) return;
      let timedOut = false;
      const timeout = new AbortController();
      timer = setTimeout(() => { timedOut = true; timeout.abort(); }, deadline);
      const signal = AbortSignal.any([cancellation.signal, timeout.signal]);
      // Also covers transports that do not promptly honor AbortSignal.
      const result = await Promise.race([
        requestPlan({ ...body, key, model, local, fetchImpl, signal }),
        new Promise(resolve => signal.addEventListener('abort', () => resolve({ reason: timedOut ? 'timeout' : 'unavailable' }), { once: true }))
      ]);
      if (cancellation.signal.aborted || res.destroyed) return;
      if (result.reason) return json(res, 200, { ...base, mode: 'demo', source: 'demo', reason: result.reason, retryable: true });
      json(res, 200, { plan: result.plan, preferences: local.preferences, mode: 'ai', source: 'ai' });
    } catch {
      if (cancellation.signal.aborted || res.destroyed) return;
      // Upstream exception text may contain credentials; never return or log it.
      if (fallback) json(res, 200, { ...fallback, mode: 'demo', source: 'demo', reason: 'unavailable', retryable: true });
      else json(res, 503, { error: 'The light service is unavailable. Try again.' });
    } finally { clearTimeout(timer); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 3000);
  const host = listenHost(process.env);
  createServer().listen(port, host, () => console.log(`Housemate listening on ${host}:${port}`));
}
