import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { schema, instructions, validateAnalysis } from './emotion.js';
const root = new URL('./', import.meta.url);
const port = Number(process.env.PORT || 3000);
const model = process.env.OPENAI_MODEL || 'gpt-6-sol';
const files = { '/': ['index.html', 'text/html'], '/style.css': ['style.css', 'text/css'], '/app.js': ['app.js', 'text/javascript'] };
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
async function getKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY.trim();
  try {
    const raw = await readFile(new URL('API Key.txt', root), 'utf8');
    const key = raw.match(/sk-[A-Za-z0-9_-]+/)?.[0] || raw.trim();
    if (!key) throw new Error('Empty key');
    return key;
  } catch { throw new Error('Add your API key to API Key.txt, then try again.'); }
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET' && Object.hasOwn(files, req.url)) {
    const [file, type] = files[req.url];
    try { const data = await readFile(new URL(`public/${file}`, root)); res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(data); }
    catch { json(res, 500, { error: 'Could not load the page.' }); }
    return;
  }
  if (req.method !== 'POST' || req.url !== '/api/chat') return json(res, 404, { error: 'Not found' });
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(res, 403, { error: 'Origin not allowed' });
  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  try {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 100000) return json(res, 413, { error: 'This conversation is too long. Please start a new moment.' }); chunks.push(chunk); }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return json(res, 400, { error: 'Invalid request.' }); }
    if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 21 || body.messages.at(-1)?.role !== 'user' || body.messages.some(m => !['user','assistant'].includes(m.role) || typeof m.content !== 'string' || !m.content.trim() || m.content.length > 2000)) return json(res, 400, { error: 'Please enter 1–2000 characters.' });
    const key = await getKey();
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: body.messages, instructions, store: false, max_output_tokens: 2200, reasoning: { effort: 'low' }, text: { format: { type: 'json_schema', name: 'emotion_analysis', strict: true, schema } } }),
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90000)])
    });
    if (!upstream.ok) {
      const data = await upstream.json().catch(() => ({}));
      const message = upstream.status === 401 ? 'Invalid API key. Please check API Key.txt.' : data.error?.code === 'insufficient_quota' ? 'Your API account has insufficient quota. Please check billing.' : upstream.status === 429 ? 'Too many requests. Please try again shortly.' : upstream.status === 404 ? `Model ${model} is unavailable for this API key.` : 'Could not read this moment. Please try again.';
      return json(res, 502, { error: message });
    }
    const data = await upstream.json();
    if (data.status !== 'completed') return json(res, 502, { error: 'The response was incomplete. Please try again.' });
    const parts = (data.output || []).flatMap(item => item.content || []);
    if (parts.some(p => p.type === 'refusal')) return json(res, 422, { error: 'AI could not read this message. Try expressing it another way.' });
    let analysis;
    try { analysis = JSON.parse(parts.filter(p => p.type === 'output_text').map(p => p.text).join('')); } catch { return json(res, 502, { error: 'Unexpected response. Please try again.' }); }
    if (!validateAnalysis(analysis, body.messages.at(-1).content)) return json(res, 502, { error: 'The response could not be verified. Please try again.' });
    json(res, 200, { analysis });
  } catch (error) {
    if (res.destroyed) return;
    json(res, 503, { error: error.message.startsWith('Add your API') ? error.message : 'Could not reach AI. Please check your connection and try again.' });
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Housemate: http://localhost:${port} (${model})`));
