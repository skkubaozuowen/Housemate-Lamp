import { CATALOG, RESPONSE_TYPES, MOTION_PRIMITIVES, NEXT_STATES, createPlan } from './catalog.js';
import { PALETTE_FAMILIES, PALETTE_VARIANTS } from './palettes.js';

export const PLAN_LIMITS = Object.freeze({
  colorCount: [1, 4], energy: [0, 1], speed: [0.05, 2], amplitude: [0, 1],
  durationMs: [400, 20000], transitionMs: [150, 5000], seed: [0, 4294967295]
});
const INTEGER_FIELDS = new Set(['colorCount', 'durationMs', 'transitionMs', 'seed']);
const ENUM_FIELDS = { responseType: RESPONSE_TYPES, paletteFamily: Object.keys(PALETTE_FAMILIES), paletteVariant: PALETTE_VARIANTS, motionPrimitive: MOTION_PRIMITIVES, nextState: NEXT_STATES };
const PLAN_FIELDS = ['version', ...Object.keys(ENUM_FIELDS), ...Object.keys(PLAN_LIMITS), 'loop', 'requiresUserInput'];
const COLOR_NAMES = ['blue', 'pink', 'purple', 'green', 'orange', 'red', 'yellow', 'neutral'];
export const DEFAULT_PREFERENCES = Object.freeze({ avoidedColors: [], lockedPalette: null, speedScale: 1, amplitudeScale: 1 });

export const PLAN_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    version: { type: 'integer', enum: [1] },
    ...Object.fromEntries(Object.entries(ENUM_FIELDS).map(([key, values]) => [key, { type: 'string', enum: values }])),
    ...Object.fromEntries(Object.entries(PLAN_LIMITS).map(([key, [minimum, maximum]]) => [key, { type: INTEGER_FIELDS.has(key) ? 'integer' : 'number', minimum, maximum }])),
    loop: { type: 'boolean' }, requiresUserInput: { type: 'boolean' }
  },
  required: PLAN_FIELDS
};

function inRange(value, key) {
  return typeof value === 'number' && Number.isFinite(value) && value >= PLAN_LIMITS[key][0] && value <= PLAN_LIMITS[key][1] && (!INTEGER_FIELDS.has(key) || Number.isInteger(value));
}
export function validatePlan(raw) {
  return Boolean(raw && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length === PLAN_FIELDS.length && PLAN_FIELDS.every(key => Object.hasOwn(raw, key)) && raw.version === 1 && Object.entries(ENUM_FIELDS).every(([key, values]) => values.includes(raw[key])) && Object.keys(PLAN_LIMITS).every(key => inRange(raw[key], key)) && typeof raw.loop === 'boolean' && typeof raw.requiresUserInput === 'boolean');
}
export function normalizePlan(raw, fallback = null) {
  const candidate = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const defaultType = RESPONSE_TYPES.includes(fallback?.responseType) ? fallback.responseType : 'idle';
  const type = RESPONSE_TYPES.includes(candidate.responseType) ? candidate.responseType : defaultType;
  const base = { ...createPlan(type), ...(validatePlan(fallback) ? fallback : {}) };
  const result = { version: 1 };
  for (const [key, values] of Object.entries(ENUM_FIELDS)) result[key] = values.includes(candidate[key]) ? candidate[key] : base[key];
  for (const key of Object.keys(PLAN_LIMITS)) result[key] = inRange(candidate[key], key) ? candidate[key] : base[key];
  for (const key of ['loop', 'requiresUserInput']) result[key] = typeof candidate[key] === 'boolean' ? candidate[key] : base[key];
  return result;
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function normalizePreferences(raw = {}) {
  const safe = raw && typeof raw === 'object' ? raw : {};
  const lock = safe.lockedPalette;
  return {
    avoidedColors: [...new Set(Array.isArray(safe.avoidedColors) ? safe.avoidedColors.filter(color => COLOR_NAMES.includes(color)) : [])],
    lockedPalette: lock && Object.hasOwn(PALETTE_FAMILIES, lock.paletteFamily) && PALETTE_VARIANTS.includes(lock.paletteVariant) && inRange(lock.colorCount, 'colorCount') ? { paletteFamily: lock.paletteFamily, paletteVariant: lock.paletteVariant, colorCount: lock.colorCount } : null,
    speedScale: Number.isFinite(safe.speedScale) ? clamp(safe.speedScale, 0.2, 2) : 1,
    amplitudeScale: Number.isFinite(safe.amplitudeScale) ? clamp(safe.amplitudeScale, 0.1, 2) : 1
  };
}
function paletteAllowed(family, prefs) {
  return !PALETTE_FAMILIES[family]?.tags?.some(tag => prefs.avoidedColors.includes(tag));
}
export function applyPreferences(rawPlan, rawPreferences, currentPlan = null) {
  const plan = normalizePlan(rawPlan);
  const prefs = normalizePreferences(rawPreferences);
  const lock = prefs.lockedPalette;
  if (lock && paletteAllowed(lock.paletteFamily, prefs)) Object.assign(plan, lock);
  if (!paletteAllowed(plan.paletteFamily, prefs)) {
    const currentFamily = currentPlan?.paletteFamily;
    plan.paletteFamily = currentFamily && paletteAllowed(currentFamily, prefs) ? currentFamily : Object.keys(PALETTE_FAMILIES).find(family => paletteAllowed(family, prefs)) || 'neutral_haze';
  }
  plan.speed = clamp(plan.speed * prefs.speedScale, ...PLAN_LIMITS.speed);
  plan.amplitude = clamp(plan.amplitude * prefs.amplitudeScale, ...PLAN_LIMITS.amplitude);
  if (!['idle', 'acknowledge', 'processing', 'error', 'withdraw'].includes(plan.responseType)) plan.durationMs = clamp(Math.round(plan.durationMs / prefs.speedScale), ...PLAN_LIMITS.durationMs);
  // Finite gestures end; only an explicitly invited accompaniment or engine state may loop.
  if (!['idle', 'processing', 'accompany'].includes(plan.responseType)) plan.loop = false;
  if (plan.responseType === 'withdraw') { plan.nextState = 'withdraw'; plan.requiresUserInput = false; }
  if (['clarify', 'wait'].includes(plan.responseType)) { plan.nextState = 'waiting'; plan.requiresUserInput = true; }
  return plan;
}

export function seedFromText(text) {
  let seed = 2166136261;
  for (const char of text) { seed ^= char.codePointAt(0); seed = Math.imul(seed, 16777619); }
  return seed >>> 0;
}
const colorTerms = {
  blue: /蓝|藍|\bblue\b|파란|파랑|청색|하늘색|푸른/i,
  pink: /粉|\bpink\b|분홍|핑크/i,
  purple: /紫|\b(?:purple|lavender)\b|보라|자주/i,
  green: /绿|綠|\bgreen\b|초록|녹색|민트/i,
  orange: /橙|\borange\b|주황/i,
  red: /红|紅|\bred\b|빨간|빨강|적색/i,
  yellow: /黄|黃|\byellow\b|노란|노랑/i
};
const isQuestion = text => /[?？]|吗|嗎|是否|能不能|可不可以|할 수|인가|까요|나요|\b(can|could|will|would|is|are|do|does|what|why|how|when|where)\b/i.test(text);
const stableReturn = context => NEXT_STATES.includes(context.stableState) ? context.stableState : 'idle';

export function planLocal(input, context = {}) {
  const text = typeof input === 'string' ? input.trim().slice(0, 2000) : '';
  const current = context.currentPlan ? normalizePlan(context.currentPlan) : null;
  const prefs = normalizePreferences(context.preferences);
  const seed = seedFromText(`${text}:${current?.seed || 0}`);
  let priority = false;
  let understood = true;
  const keep = current ? { paletteFamily: current.paletteFamily, paletteVariant: current.paletteVariant, colorCount: current.colorCount } : {};
  const make = (type, overrides = {}) => {
    const plan = createPlan(type, { seed, paletteVariant: PALETTE_VARIANTS[seed % PALETTE_VARIANTS.length], ...overrides });
    return { plan: applyPreferences(plan, prefs, current), preferences: normalizePreferences(prefs), priority, understood };
  };
  if (!text) { understood = false; return make('clarify'); }

  // Explicit boundaries precede emotional words, invitations, and all remote interpretation.
  const doNotLeave = /\b(?:don['’]t|do not|never) leave me alone\b|\bi (?:don['’]t|do not) want to be alone\b|别让我.{0,5}一个人|不要让我.{0,5}一个人|혼자.{0,4}두지\s*마/gi;
  const stopText = text.replace(/\b(?:don['’]t|do not|never) stop\b|不要停|别停|別停|멈추지\s*마/gi, '').replace(doNotLeave, '');
  if (/^(停|停止|不要了|不用了|算了)[。！!\s]*$|^(?:please\s+)?stop(?!\s+(?:using|showing|the colou?r))\b|\b(?:can|could) you stop\b|^no (?:more|need)[.!\s]*$|让我.{0,5}(一个人|独处)|让.{0,4}自己待|别.{0,3}(安慰|陪|打扰)|不要.{0,3}(安慰|陪|打扰)|\b(leave me alone|give me (?:some )?space|i want to be alone|time alone|let me be|alone for a while|no need to (?:comfort|stay|continue)|don't comfort|do not comfort|don't bother|do not bother)\b|혼자.{0,8}(있|두|싶)|그만|멈춰|위로하지\s*마|방해하지\s*마/i.test(stopText)) {
    priority = true;
    return make('withdraw', { ...keep, nextState: 'withdraw' });
  }

  const colorBans = new Set();
  for (const clause of text.split(/[,，。.!！;；]|\bbut\b|但是|但|不过|대신/iu)) {
    if (/不喜欢|不喜歡|不要|别用|別用|避免|讨厌|討厭|\b(?:don't like|do not like|dislike|avoid|no|without|hate|stop using)\b|싫|말고|빼|쓰지\s*마/i.test(clause)) {
      for (const [name, pattern] of Object.entries(colorTerms)) if (pattern.test(clause)) colorBans.add(name);
    }
  }
  if (colorBans.size) {
    priority = true;
    for (const name of colorBans) if (!prefs.avoidedColors.includes(name)) prefs.avoidedColors.push(name);
    if (prefs.lockedPalette && !paletteAllowed(prefs.lockedPalette.paletteFamily, prefs)) prefs.lockedPalette = null;
    return make('repair', { ...keep, nextState: stableReturn(context) });
  }
  if (/保持.{0,5}(颜色|配色)|保留.{0,5}(颜色|配色)|就这个颜色|就保持这样|\b(?:keep|stay with|hold|save).{0,20}(?:colou?r|palette)\b|\b(?:keep this one|this one is fine)\b|이\s*(색|팔레트).{0,6}(유지|그대로)|색.{0,6}(유지|그대로)|이대로/i.test(text)) {
    priority = true;
    if (!current) { understood = false; return make('clarify'); }
    prefs.lockedPalette = { ...keep };
    return make('complete', { ...keep, nextState: stableReturn(context) });
  }
  const slower = /慢一点|慢点|慢一些|安静一点|太活跃|太快|太激烈|太吵|平静一点|\b(slower|slow down|too (?:active|fast|much)|less (?:movement|active)|quieter|calmer)\b|천천히|너무.{0,5}(활발|빠|시끄)|조용히|움직임.{0,4}줄/i.test(text);
  const moreActive = /太单调|太單調|太静|太静止|活跃一点|活泼一点|多动一点|\b(too (?:dull|still|plain)|more (?:active|movement|lively)|livelier)\b|너무.{0,4}(단조|정적)|더.{0,4}(활발|움직)/i.test(text);
  const change = /不是这样|不是这样|不是这个|不对|不對|换一种|换一个|換一|不喜欢.{0,5}(颜色|配色)|\b(not like that|not this|something else|another (?:one|colou?r|palette)|change (?:it|the colou?r|palette))\b|이게\s*아니|그게\s*아니|다른\s*(색|걸|것)|바꿔/i.test(text);
  if (slower || moreActive || change) {
    priority = true;
    const oldSpeedScale = prefs.speedScale;
    const oldAmplitudeScale = prefs.amplitudeScale;
    if (slower) { prefs.speedScale = clamp(prefs.speedScale * 0.65, 0.2, 2); prefs.amplitudeScale = clamp(prefs.amplitudeScale * 0.7, 0.1, 2); }
    if (moreActive) { prefs.speedScale = clamp(prefs.speedScale * 1.25, 0.2, 2); prefs.amplitudeScale = clamp(prefs.amplitudeScale * 1.3, 0.1, 2); }
    const overrides = { ...keep, nextState: stableReturn(context), energy: moreActive ? clamp((current?.energy ?? 0.2) + 0.15, 0, 1) : slower ? Math.min(current?.energy ?? 0.2, 0.22) : CATALOG.repair.energy };
    if (current && (slower || moreActive)) {
      overrides.speed = clamp(current.speed / oldSpeedScale, ...PLAN_LIMITS.speed);
      overrides.amplitude = clamp(current.amplitude / oldAmplitudeScale, ...PLAN_LIMITS.amplitude);
    }
    if (change && !slower && !moreActive) {
      if (/刚才说的|刚说|之前.{0,4}那个|\b(?:the one i (?:said|meant)|what i meant|the previous one)\b|아까.{0,6}(말|그)/i.test(text)) { understood = false; return make('clarify', keep); }
      prefs.lockedPalette = null;
      const allowed = Object.keys(PALETTE_FAMILIES).filter(family => family !== current?.paletteFamily && paletteAllowed(family, prefs));
      overrides.paletteFamily = allowed[seed % Math.max(allowed.length, 1)] || 'neutral_haze';
    }
    return make('repair', overrides);
  }

  doNotLeave.lastIndex = 0;
  if (doNotLeave.test(text) || /陪我|陪陪我|一起待|跟我待|\b(stay with me|keep me company|sit with me|be with me|continue (?:with me|keeping me company))\b|같이.{0,8}(있|머물)|곁에.{0,5}있/i.test(text)) { priority = true; return make('accompany'); }
  if (/^(你好|您好|嗨|哈喽|我回来了|我回来啦|回来啦|hey|hi|hello|i['’]?m home|i am home|i['’]?m back|i am back|안녕|안녕하세요|나 왔어|다녀왔어)[!！。.\s]*$/i.test(text) || /我回来了|我回来啦|\bi['’]?m (?:back|home)\b|나\s*왔어/i.test(text)) { priority = true; return make('greet'); }
  if (/谢谢|謝謝|感谢|感謝|\b(thanks|thank you|thank u)\b|고마워|고맙|감사/i.test(text)) { priority = true; return make('receive_thanks', { ...keep, nextState: stableReturn(context) }); }
  if (/晚安|再见|再見|拜拜|\b(good ?night|goodbye|bye|see you)\b|잘\s*자|안녕히|잘\s*있어/i.test(text)) { priority = true; return make('farewell', keep); }
  if (/等.{0,5}(我|一下)|我还没说完|让我说完|\b(wait (?:for me|a (?:second|moment))|let me finish|i['’]?m not done)\b|잠깐만|기다려|아직.{0,4}안\s*끝/i.test(text)) { priority = true; return make('wait', keep); }

  // Yes/no is limited to a visible palette or this lamp's explicit capabilities.
  if (isQuestion(text) && /这个.{0,3}(配色|颜色)|这套.{0,3}(配色|颜色)|\b(this|current).{0,12}(palette|colou?r)|이\s*(색|팔레트)/i.test(text)) {
    priority = true;
    if (!current) { understood = false; return make('clarify'); }
    const accepted = !prefs.avoidedColors.some(color => PALETTE_FAMILIES[current.paletteFamily]?.tags?.includes(color));
    return make(accepted ? 'affirm' : 'decline', { ...keep, nextState: stableReturn(context) });
  }
  if (isQuestion(text) && /控制.{0,6}(实体|实际|家里|房间|硬件|灯)|连接.{0,5}(蓝牙|串口|硬件)|\b(control|connect).{0,25}(physical|real |bluetooth|arduino|hardware|room light)|실제.{0,6}(조명|램프)|블루투스|아두이노/i.test(text)) { priority = true; return make('decline', keep); }
  if (isQuestion(text) && /能.{0,6}(陪我|变换颜色|回应)|\bcan you.{0,15}(?:keep me company|change colou?rs|respond with light)|빛으로.{0,5}(답|반응)/i.test(text)) { priority = true; return make('affirm', keep); }
  if (/(是什么|是什麼|为什么|為什麼|怎么定义|如何定义|多少|多大|谁是|誰是)|\b(?:what (?:is|are|was)|why (?:is|are|does|do)|how (?:does|do|many|much)|who (?:is|was))\b|무엇|뭐예요|뭔가요|왜.{0,12}(인가|해|하|지)|얼마/i.test(text)) { understood = false; return make('clarify', keep); }

  // Emotion sharing is an invitation to a response, never agreement with a harmful judgment.
  if (/没用|没价值|一无是处|不值得|\b(useless|worthless|a failure|hate myself)\b|쓸모없|가치.{0,3}없|내가.{0,3}싫/i.test(text)) return make('empathize');
  if (/给我.{0,4}(打气|鼓励)|鼓励我|打打气|为我加油|\b(encourage|cheer me on|wish me luck|give me (?:some )?(?:courage|encouragement))\b|응원|힘을?\s*줘/i.test(text)) return make('encourage');
  if (/明天|下周|将要|即将|\b(tomorrow|next week|about to|upcoming)\b|내일|다음\s*주|곧/i.test(text) && /发表|演讲|面试|考试|紧张|害怕|\b(present|talk|interview|exam|nervous|afraid)\b|발표|면접|시험|긴장|무서/i.test(text)) return make('encourage');
  if (/想缓|缓一缓|放松|安抚我|平静下来|\b(?:calm down|settle down|unwind|relax|take a breath|help me calm)\b|진정|마음.{0,4}가라|숨.{0,4}(고르|돌리)|쉬고\s*싶/i.test(text) && /紧张|焦虑|慌|压力|\b(?:nervous|anxious|tense|stress|overwhelm|panic)\b|긴장|불안|초조|스트레스/i.test(text)) return make('soothe');
  if (/难过|难受|糟透|伤心|孤独|沮丧|疲惫|不开心|不高兴|\b(sad|awful|rough|terrible|lonely|upset|exhausted|unhappy|not happy)\b|슬프|우울|외롭|힘들|속상|지쳤|최악/i.test(text)) return make('empathize');
  const celebratory = /终于.{0,15}(完成|录用|录取|成功|通过|结束)|论文.{0,8}(录用|录取)|今天.{0,6}生日|我生日|\b(?:it['’]?s my birthday|my birthday (?:is )?today|(?:finally|just).{0,25}(?:finished|accepted|done|passed|won)|(?:paper|thesis).{0,12}accepted|i did it|i got (?:the job|accepted))\b|생일|드디어.{0,12}(끝|완성|해냈|통과|합격)|논문.{0,8}(게재|승인)/i.test(text);
  const unknowable = isQuestion(text) && /会|能|是否|\b(will|would|do you think|am i going to)\b|될까|할까|까요/i.test(text);
  if (celebratory && !unknowable) return make(/明天|下周|将要|即将|\b(tomorrow|next week|upcoming)\b|내일|다음\s*주/i.test(text) ? 'encourage' : 'celebrate');
  if (/紧张|焦虑|压力很大|\b(nervous|anxious|stressed|overwhelmed)\b|긴장|불안|스트레스/i.test(text)) return make('empathize');
  if (/开心|幸福|高兴|快乐|\b(happy|joyful|proud|delighted)\b|행복|기뻐|즐거/i.test(text) && !isQuestion(text)) return make('celebrate');
  understood = false;
  return make('clarify', keep);
}
