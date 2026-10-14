const form = document.querySelector('#composer');
const input = document.querySelector('#question');
const send = document.querySelector('#send');
const sendLabel = document.querySelector('#send-label');
const messages = document.querySelector('#messages');
const welcome = document.querySelector('#welcome');
const clear = document.querySelector('#clear');
const counter = document.querySelector('#counter');
let history = []; let active = null;
function scroll() { messages.scrollTop = messages.scrollHeight; }
function element(tag, className, text) { const e = document.createElement(tag); e.className = className; if (text) e.textContent = text; return e; }
function count() { counter.textContent = `${input.value.length} / 2000`; }
function busy(value) { input.readOnly = value; sendLabel.textContent = value ? 'Stop' : 'Share'; send.setAttribute('aria-label', value ? 'Stop' : 'Share your moment'); }
const lightStatus = document.querySelector('#light-status');
const motion = document.querySelector('#motion');
const emotionLabels = { '开心':'Joy', '幸福':'Happiness', '忧郁':'Melancholy', '平静':'Calm', '疲惫':'Tiredness', '难过':'Sadness', '孤独':'Loneliness', '焦虑':'Anxiety', '生气':'Anger', '复杂':'Mixed feelings', '不明确':'Open' };
const lightScenes = {
  '幸福': ['joy', 'A warm, golden glow.'],
  '忧郁': ['melancholy', 'A little lavender light.'],
  '开心': ['joy', 'A bright, golden glow.'],
  '平静': ['calm', 'A soft green breath.'],
  '疲惫': ['rest', 'Warm light. Take your time.'],
  '难过': ['melancholy', 'Soft blue. A little room to feel.'],
  '孤独': ['melancholy', 'A quiet lavender glow.'],
  '焦虑': ['steady', 'Soft light, moving gently.'],
  '生气': ['steady', 'A gentle, steady glow.'],
  '复杂': ['mixed', 'Different feelings. One moment.']
};
function setLight(analysis) {
  const emotion = analysis?.emotion;
  const labels = [...new Set([emotion, ...(analysis?.secondary || [])])].filter(e => lightScenes[e]);
  const scenes = [...new Set(labels.map(e => lightScenes[e][0]))];
  if (!scenes.length) scenes.push('default');
  const layers = document.querySelectorAll('.light-layer');
  layers.forEach(layer => {
    const index = scenes.indexOf(layer.dataset.light);
    layer.classList.toggle('active', index !== -1);
    layer.dataset.position = index === 0 ? 'primary' : 'secondary';
  });
  document.querySelector('#ambient').classList.toggle('multi', scenes.length > 1);
  document.body.dataset.scene = scenes.join('+');
  lightStatus.textContent = labels.length > 1
    ? `${labels.map(e => emotionLabels[e]).join(' + ')} · Light, together.`
    : lightScenes[emotion]?.[1] || (emotion ? 'A little space to feel.' : 'Soft light. Room to feel.');
}
motion.addEventListener('click', () => {
  const paused = !document.body.classList.contains('light-paused');
  document.body.classList.toggle('light-paused', paused);
  motion.setAttribute('aria-pressed', String(paused));
  motion.textContent = paused ? 'Resume light' : 'Pause light';
});
function renderAnalysis(a, container) {
  setLight(a);
  container.append(element('div', 'assistant-label', 'HOUSEMATE'), element('div', 'reply', a.response));
  const card = element('section', 'analysis'); card.setAttribute('aria-label','Feelings in this moment');
  const tags = element('div','tags'); tags.append(element('span','emotion',emotionLabels[a.emotion] || 'Open'));
  a.secondary.forEach(e => tags.append(element('span','secondary',emotionLabels[e] || e))); card.append(tags);
  const insight = element('details','insight');
  insight.append(element('summary','','A little reflection'), element('p','explanation',a.explanation));
  card.append(insight); container.append(card);
}
form.addEventListener('submit', async event => {
  event.preventDefault(); if (active) { active.abort(); return; }
  const text = input.value.trim(); if (!text) { input.focus(); return; }
  welcome.remove(); messages.append(element('div','message user',text)); input.value = ''; count();
  const answer = element('div','message assistant'); messages.append(answer);
  const status = element('div','status'); status.append(element('span','spinner'),document.createTextNode('Listening…')); answer.append(status);
  const controller = new AbortController(); active = controller; busy(true); scroll();
  try {
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [...history.slice(-10), { role: 'user', content: text }] }), signal: controller.signal });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    status.remove(); renderAnalysis(data.analysis, answer);
    history.push({ role: 'user', content: text }, { role: 'assistant', content: JSON.stringify(data.analysis) }); history = history.slice(-10);
  } catch(error) {
    status.remove(); answer.append(element('div','error',error.name === 'AbortError' ? 'Stopped. Take your time, then try again.' : error.message)); input.value = text; count();
  } finally { active = null; busy(false); scroll(); input.focus(); }
});
input.addEventListener('input',count);
input.addEventListener('keydown',event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); } });
document.querySelectorAll('.examples button').forEach(button => button.addEventListener('click',() => { if(active) return; input.value = button.textContent; count(); input.focus(); }));
clear.addEventListener('click',() => { if(active) { active.abort(); return; } history = []; setLight(null); messages.replaceChildren(welcome); input.value = ''; count(); input.focus(); });
