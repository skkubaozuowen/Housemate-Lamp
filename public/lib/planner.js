import { CATALOG, RESPONSE_TYPES, MOTION_PRIMITIVES, NEXT_STATES, EXPRESSIONS, createPlan } from './catalog.js';
import { PALETTE_FAMILIES, PALETTE_VARIANTS, NAMED_COLOR_FAMILIES, isPaletteAllowed, isSemanticMixedPalette, resolvePaletteFamily, replacementPalette } from './palettes.js';

export const PLAN_LIMITS = Object.freeze({
  colorCount: [1, 4], energy: [0, 1], speed: [0.05, 2], amplitude: [0, 1],
  durationMs: [400, 20000], transitionMs: [150, 5000], seed: [0, 4294967295], feelingBalance: [.5, .9]
});
export const FEELING_TYPES = Object.freeze(['joy', 'sadness', 'calm', 'anxiety', 'hope', 'anger']);
export const MIXED_MODES = Object.freeze(['paired', 'layered', 'open']);
const INTEGER_FIELDS = new Set(['colorCount', 'durationMs', 'transitionMs', 'seed']);
const ENUM_FIELDS = { responseType: RESPONSE_TYPES, expression: EXPRESSIONS, paletteFamily: Object.keys(PALETTE_FAMILIES), paletteVariant: PALETTE_VARIANTS, motionPrimitive: MOTION_PRIMITIVES, nextState: NEXT_STATES, feelingPrimary: FEELING_TYPES, feelingSecondary: [...FEELING_TYPES, 'none'], feelingTertiary: [...FEELING_TYPES, 'none'], mixedMode: MIXED_MODES };
const PLAN_FIELDS = ['version', ...Object.keys(ENUM_FIELDS), ...Object.keys(PLAN_LIMITS), 'loop', 'requiresUserInput'];
const COLOR_NAMES = ['blue', 'pink', 'purple', 'green', 'orange', 'red', 'yellow', 'neutral'];
export const DEFAULT_PREFERENCES = Object.freeze({ avoidedColors: [], rejectedPalettes: [], lockedPalette: null, speedScale: 1, amplitudeScale: 1 });

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
  if (type === 'mixed' && (result.feelingSecondary === 'none' || result.feelingSecondary === result.feelingPrimary)) result.feelingSecondary = result.feelingPrimary === 'sadness' ? 'joy' : 'sadness';
  if (result.mixedMode !== 'layered' || [result.feelingPrimary, result.feelingSecondary].includes(result.feelingTertiary)) result.feelingTertiary = 'none';
  if (result.mixedMode === 'layered' && result.feelingTertiary === 'none') result.mixedMode = 'paired';
  // Open complexity carries no claim about which emotions are present. These
  // legacy pair values are ignored by the palette helper in open mode.
  if (result.mixedMode === 'open') Object.assign(result, { feelingPrimary:'joy', feelingSecondary:'sadness', feelingTertiary:'none', feelingBalance:.5 });
  return result;
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const paletteLockAllowed = (lock, prefs) => Boolean(lock && (isPaletteAllowed(lock.paletteFamily, prefs) || isSemanticMixedPalette(lock) && !prefs.rejectedPalettes.includes(lock.paletteFamily)));
export function normalizePreferences(raw = {}) {
  const safe = raw && typeof raw === 'object' ? raw : {};
  const lock = safe.lockedPalette;
  return {
    avoidedColors: [...new Set(Array.isArray(safe.avoidedColors) ? safe.avoidedColors.filter(color => COLOR_NAMES.includes(color)) : [])],
    rejectedPalettes: [...new Set(Array.isArray(safe.rejectedPalettes) ? safe.rejectedPalettes.filter(family => typeof family === 'string' && Object.hasOwn(PALETTE_FAMILIES, family)) : [])],
    lockedPalette: lock && Object.hasOwn(PALETTE_FAMILIES, lock.paletteFamily) && PALETTE_VARIANTS.includes(lock.paletteVariant) && inRange(lock.colorCount, 'colorCount') ? {
      paletteFamily: lock.paletteFamily, paletteVariant: lock.paletteVariant, colorCount: lock.colorCount,
      ...(lock.paletteFamily === 'mixed_warm_cool' && FEELING_TYPES.includes(lock.feelingPrimary) && FEELING_TYPES.includes(lock.feelingSecondary) && lock.feelingPrimary !== lock.feelingSecondary && inRange(lock.feelingBalance, 'feelingBalance') ? { feelingPrimary: lock.feelingPrimary, feelingSecondary: lock.feelingSecondary, feelingBalance: lock.feelingBalance, mixedMode:MIXED_MODES.includes(lock.mixedMode) ? lock.mixedMode : 'paired', feelingTertiary:FEELING_TYPES.includes(lock.feelingTertiary) && ![lock.feelingPrimary,lock.feelingSecondary].includes(lock.feelingTertiary) ? lock.feelingTertiary : 'none' } : {})
    } : null,
    speedScale: Number.isFinite(safe.speedScale) ? clamp(safe.speedScale, 0.2, 2) : 1,
    amplitudeScale: Number.isFinite(safe.amplitudeScale) ? clamp(safe.amplitudeScale, 0.1, 2) : 1
  };
}
export function applyPreferences(rawPlan, rawPreferences, currentPlan = null) {
  const plan = normalizePlan(rawPlan);
  const prefs = normalizePreferences(rawPreferences);
  const lock = prefs.lockedPalette;
  if (paletteLockAllowed(lock, prefs)) Object.assign(plan, lock);
  plan.paletteFamily = resolvePaletteFamily(plan, prefs) || resolvePaletteFamily(currentPlan || plan, { ...prefs, rejectedPalettes: [] }) || 'neutral_gray';
  plan.speed = clamp(plan.speed * prefs.speedScale, ...PLAN_LIMITS.speed);
  plan.amplitude = clamp(plan.amplitude * prefs.amplitudeScale, ...PLAN_LIMITS.amplitude);
  if (!['idle', 'acknowledge', 'processing', 'error', 'withdraw'].includes(plan.responseType)) plan.durationMs = clamp(Math.round(plan.durationMs / prefs.speedScale), ...PLAN_LIMITS.durationMs);
  // Finite gestures end; only an explicitly invited accompaniment or engine state may loop.
  if (!['idle', 'processing', 'accompany'].includes(plan.responseType) && !(plan.responseType === 'rest' && plan.nextState === 'accompany')) plan.loop = false;
  if (plan.responseType === 'withdraw') { plan.nextState = 'withdraw'; plan.requiresUserInput = false; }
  if (['clarify', 'wait'].includes(plan.responseType)) { plan.nextState = 'waiting'; plan.requiresUserInput = true; }
  return plan;
}

export const SCENE_TYPES = Object.freeze(['celebrate', 'setback', 'rest', 'upcoming', 'mixed', 'everyday']);
const SCENE_EXPRESSIONS = Object.freeze({
  celebrate: ['default', 'quiet'], setback: ['default', 'renew'], rest: ['default', 'fulfilled'],
  upcoming: ['default'], mixed: ['bittersweet'], everyday: ['default']
});

/** One design per situation, with bounded contextual variations rather than new modes. */
export function createScenePlan(type, expression = 'default', overrides = {}) {
  if (!SCENE_TYPES.includes(type)) return createPlan(type, overrides);
  const allowed = SCENE_EXPRESSIONS[type];
  const resolved = allowed.includes(expression) ? expression : allowed[0];
  const variation = {
    quiet: { energy: .52, speed: .42, amplitude: .64, durationMs: 9000 },
    renew: { paletteFamily: 'renewal_gold', colorCount: 4, durationMs: 12000 },
    fulfilled: { paletteFamily: 'rest_glow', colorCount: 4 },
    bittersweet: { colorCount: 4, mixedMode:'open', feelingBalance:.5 }
  }[resolved] || {};
  // S04 is one connected encouragement gesture for expressed tension. Older
  // expression names remain readable without restoring separate visual modes.
  return createPlan(type, { expression: resolved, paletteVariant: 'balanced', ...variation, ...overrides,
    ...(type === 'upcoming' ? { expression:'default' } : {}) });
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

// Commands are scoped to each named color, so “no blue, use pink” does not reject both.
// Color words in feelings, clothing, or facts do not on their own change preferences.
function parseColorCommands(text) {
  const commands = [];
  for (const clause of text.split(/[,，。.!！;；]|\bbut\b|但是|但|不过|대신/iu)) {
    const tokens = Object.entries(colorTerms).flatMap(([color, pattern]) => [...clause.matchAll(new RegExp(pattern.source, 'gi'))].map(match => ({ color, index: match.index, end: match.index + match[0].length }))).sort((a, b) => a.index - b.index);
    const negative = [...clause.matchAll(/不喜欢|不喜歡|不要|别用|別用|避免|讨厌|討厭|不想(?:要|用)?|不用|而不是|不是|\b(?:don['’]t(?:\s+(?:want|like|use))?|do not(?:\s+(?:want|like|use))?|dislike|avoid|no(?:\s+more)?|not|without|instead of|hate|stop using)\b|싫|말고|빼|쓰지\s*마/gi)].map(match => ({ index: match.index, end: match.index + match[0].length, type: 'ban' }));
    const positive = [...clause.matchAll(/我要|我想要|想要|换成|換成|改成|换为|改为|变成|變成|切换到|切換到|使用|给我|給我|用|要|\b(?:want|would like|change|switch|set|make|use|give me)\b/gi)].filter(match => !negative.some(event => match.index >= event.index && match.index < event.end)).map(match => ({ index: match.index, end: match.index + match[0].length, type: 'select' }));
    const events = [...negative, ...positive].sort((a, b) => a.index - b.index);
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      const suffix = clause.slice(token.end, tokens[index + 1]?.index ?? clause.length);
      // An instruction about a blue jacket or buying red clothing is not a lamp instruction.
      if (/^(?:色(?:的)?\s*)?(?:衣服|衣裳|衬衫|衬衣|裙|裤|鞋|外套|包|车|汽车)|^\s*(?:jacket|shirt|dress|clothes|clothing|shoes|car|bag)\b|^(?:색)?\s*(?:옷|셔츠|재킷|바지|신발)/i.test(suffix)) continue;
      if (/\b(?:i['’]m|i am|i feel|i am feeling)\s+(?:not\s+)?$/i.test(clause.slice(0, token.index))) continue;
      const before = events.filter(event => event.end <= token.index).at(-1);
      if (before && /\b(?:feel|feeling|being|wear|wearing|buy|buying|own)\b|穿|购买|購買|买|옷을?\s*입/i.test(clause.slice(before.end, token.index))) continue;
      // A negative before the next named hue belongs to that next hue. A genuine
      // postfix refusal at the end (“蓝色不要”), or Korean “색 말고”, refers back.
      const afterBan = (!tokens[index + 1] && /^(?:色)?\s*(?:我(?:也)?(?:不喜欢|不喜歡)|不喜欢|不喜歡|不要|不用)\s*$|^\s*(?:i\s+)?(?:dislike|hate)(?:\s+it)?\s*$/i.test(suffix)) || /^(?:색)?\s*(?:은|는|이|가|을|를)?\s*(?:싫|말고|별로|빼)/i.test(suffix);
      const afterSelect = /(?:으로|로).{0,6}(?:바꿔|변경|해\s*줘|해주세요)|\bis fine\b|\binstead\b|就(?:可以|好)/i.test(suffix);
      let type = before?.type;
      if (afterBan && !afterSelect) type = 'ban';
      else if (afterSelect) type = 'select';
      if (type) commands.push({ color: token.color, type });
    }
  }
  return commands;
}
const isQuestion = text => /[?？]|吗|嗎|是否|能不能|可不可以|할 수|인가|까요|나요|^\s*(?:can|could|will|would|is|are|do|does|what|why|how|when|where)\b/i.test(text);
const stableReturn = context => NEXT_STATES.includes(context.stableState) ? context.stableState : 'idle';

// These are bounded light-composition hints, not scores measuring a person's
// emotions. Circumstances such as being alone are deliberately absent: a second
// feeling must be expressed, or interpreted in context by the language model.
function explicitFeelingMix(positiveText, discomfortText, allowCompatible = false) {
  const patterns = {
    joy: /开心|幸福|高兴|快乐|兴奋|喜悦|\b(?:happy|joyful|proud|delighted|excited|thrilled|joy)\b|행복|기뻐|기쁘|즐거|신나/gi,
    sadness: /难过|难受|伤心|孤独|孤单|寂寞|沮丧|失落|不开心|不高兴|舍不得|捨不得|不舍|不捨|留恋|留戀|\b(?:sad|crying|lonely|upset|unhappy|not happy|disappointed|miss(?:ing)? (?:my |the |these |those )?(?:friends|people|place|colleagues)|hard to (?:say goodbye|leave|let go)|reluctant to leave)\b|슬프|슬퍼|우울|외롭|외로|속상|아쉽|아쉬|그리워|섭섭/gi,
    calm: /安心|平静|放松|释然|满足|滿足|松了(?:一)?口气|鬆了(?:一)?口氣|\b(?:calm|peaceful|relieved|relief|content|satisfied)\b|편안|차분|안심|만족|후련|홀가분/gi,
    anxiety: /紧张|焦虑|害怕|好怕|担心|慌|\b(?:nervous|anxious|afraid|scared|tense|worried)\b|긴장|불안|무서|초조|걱정/gi,
    hope: /期待|盼望|有希望|抱有希望|\b(?:hopeful|optimistic|look(?:ing)? forward|eager)\b|희망|설레|기대/gi,
    anger: /生气|愤怒|气愤|恼火|\b(?:angry|furious|frustrated)\b|화가|분노|짜증/gi
  };
  const signals = Object.entries(patterns).flatMap(([feeling, pattern]) => {
    let source = feeling === 'joy' || feeling === 'calm' || feeling === 'hope' ? positiveText : discomfortText;
    if (feeling === 'hope') source = source.replace(/(?:不|没(?:有)?|沒有)(?:太|很|那么|那麼|怎么|怎麼)?(?:期待|盼望|抱有希望)|\b(?:not|don['’]t|do not)\s+(?:really\s+)?(?:look(?:ing)? forward|hopeful|optimistic|eager)\b|기대(?:하지|되지)?\s*않/gi, '');
    const matches = [...source.matchAll(pattern)].filter(match => !/(?:想(?:要|变得|变)?|希望(?:能)?|试着|努力|want to(?: be| feel)?|wish to(?: be| feel)?|trying to(?: be| feel)?|need to(?: be| feel)?)\s*$/i.test(source.slice(Math.max(0, match.index - 30), match.index)));
    if (!matches.length) return [];
    const strength = Math.max(...matches.map(match => {
      const before = source.slice(Math.max(0, match.index - 20), match.index);
      if (/(?:有点|有些|有一点|一点点|稍微|略微|a (?:little|bit)|slightly|somewhat|조금|약간)\s*(?:也|还|still|also)?\s*$/i.test(before)) return .35;
      if (/(?:非常|特别|真的很|真(?:的)?|好|太|很|无比|极其|really|very|so|deeply|extremely|너무|정말|매우)\s*(?:的)?\s*$/i.test(before)) return .85;
      return .6;
    }));
    return [{ feeling, strength }];
  }).sort((a, b) => b.strength - a.strength);
  if (signals.length < 2) return null;
  const [primary, secondary, tertiary] = signals;
  if (!allowCompatible && signals.every(({ feeling }) => ['joy', 'calm', 'hope'].includes(feeling))) return null;
  return {
    feelingPrimary: primary.feeling, feelingSecondary: secondary.feeling,
    feelingTertiary: tertiary?.feeling || 'none', mixedMode:tertiary ? 'layered' : 'paired',
    feelingBalance: Math.round(clamp(.5 + (primary.strength - secondary.strength) * .6, .5, .9) * 100) / 100
  };
}

export function planLocal(input, context = {}) {
  const text = typeof input === 'string' ? input.trim().slice(0, 2000) : '';
  const current = context.currentPlan ? normalizePlan(context.currentPlan) : null;
  const prefs = normalizePreferences(context.preferences);
  const previousPreferences = normalizePreferences(prefs);
  const currentFamily = current ? resolvePaletteFamily(current, prefs) : null;
  const currentPalette = current ? { ...(paletteLockAllowed(prefs.lockedPalette, prefs) ? prefs.lockedPalette : current), paletteFamily: currentFamily || current.paletteFamily } : null;
  const seed = seedFromText(`${text}:${current?.seed || 0}`);
  let priority = false;
  let understood = true;
  const keep = currentPalette ? {
    paletteFamily: currentPalette.paletteFamily, paletteVariant: currentPalette.paletteVariant, colorCount: currentPalette.colorCount,
    ...(currentPalette.paletteFamily === 'mixed_warm_cool' ? { feelingPrimary: currentPalette.feelingPrimary, feelingSecondary: currentPalette.feelingSecondary, feelingTertiary:currentPalette.feelingTertiary, mixedMode:currentPalette.mixedMode, feelingBalance: currentPalette.feelingBalance } : {})
  } : {};
  const make = (type, overrides = {}) => {
    const plan = SCENE_TYPES.includes(type)
      ? createScenePlan(type, overrides.expression, { seed, ...overrides })
      : createPlan(type, { seed, ...overrides });
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

  const colorCommands = parseColorCommands(text);
  const rejectCurrent = /(?:不要|别用|別用|不用)(?:这个|这套|这种|当前|现在的)(?:颜色|配色)|(?:这个|这套|这种|当前的?|现在的)(?:颜色|配色).{0,8}(?:不喜欢|不喜歡|不好看|不满意)|(?:不喜欢|不喜歡).{0,6}(?:这个|这套|当前的?)(?:颜色|配色)|\b(?:(?:don['’]t|do not) (?:like|want|use)|dislike|hate) (?:this|the current) (?:colou?r|palette)\b|\b(?:not|no more) (?:this|the current) (?:colou?r|palette)\b|이\s*(?:색|팔레트).{0,5}(?:말고|싫)/i.test(text);
  const unrelatedColorObject = /\b(?:colou?r|palette) of .{0,60}\b(?:jacket|shirt|dress|clothes|clothing|shoes|car|bag)\b|(?:衣服|外套|裙子|裤子|鞋|包|汽车)(?:的)?(?:颜色|配色)/i.test(text);
  const changeColor = !unrelatedColorObject && /换(?:个|一个|种|一种|套|一套)?(?:颜色|配色)|換(?:個|一個|種|一種|套|一套)?(?:顏色|配色)|\b(?:change|switch) (?:the |this |my )?(?:colou?r|palette)\b|\banother (?:colou?r|palette)\b|다른\s*(?:색|팔레트)/i.test(text);
  const keepRequested = /保持.{0,5}(颜色|配色)|保留.{0,5}(颜色|配色)|就这个颜色|就保持这样|\b(?:keep|stay with|hold|save).{0,20}(?:colou?r|palette)\b|\b(?:keep this one|this one is fine)\b|이\s*(색|팔레트).{0,6}(유지|그대로)|색.{0,6}(유지|그대로)|이대로/i.test(text);
  const slower = /慢一点|慢点|慢一些|安静一点|太活跃|太快|太激烈|太吵|平静一点|\b(slower|slow down|too (?:active|fast|much)|less (?:movement|active)|quieter|calmer)\b|천천히|너무.{0,5}(활발|빠|시끄)|조용히|움직임.{0,4}줄/i.test(text);
  const moreActive = /太单调|太單調|太静|太静止|活跃一点|活泼一点|多动一点|\b(too (?:dull|still|plain)|more (?:active|movement|lively)|livelier)\b|너무.{0,4}(단조|정적)|더.{0,4}(활발|움직)/i.test(text);
  const change = !unrelatedColorObject && /不是这样|不是这样|不是这个|不对|不對|换一种|换一个|換一|不喜欢.{0,5}(颜色|配色)|\b(not like that|not this|something else|another (?:one|colou?r|palette)|change (?:it|the colou?r|palette))\b|이게\s*아니|그게\s*아니|다른\s*(색|걸|것)|바꿔/i.test(text);
  const colorRepair = colorCommands.length > 0 || rejectCurrent || changeColor;
  if (slower || moreActive || change || colorRepair) {
    priority = true;
    if (change && !colorRepair && !slower && !moreActive && /刚才说的|刚说|之前.{0,4}那个|\b(?:the one i (?:said|meant)|what i meant|the previous one)\b|아까.{0,6}(말|그)/i.test(text)) { understood = false; return make('clarify', keep); }
    const oldSpeedScale = prefs.speedScale;
    const oldAmplitudeScale = prefs.amplitudeScale;
    if (slower) { prefs.speedScale = clamp(prefs.speedScale * 0.65, 0.2, 2); prefs.amplitudeScale = clamp(prefs.amplitudeScale * 0.7, 0.1, 2); }
    if (moreActive) { prefs.speedScale = clamp(prefs.speedScale * 1.25, 0.2, 2); prefs.amplitudeScale = clamp(prefs.amplitudeScale * 1.3, 0.1, 2); }
    const overrides = { ...keep, nextState: stableReturn(context), energy: moreActive ? clamp((current?.energy ?? 0.2) + 0.15, 0, 1) : slower ? Math.min(current?.energy ?? 0.2, 0.22) : CATALOG.repair.energy };
    if (current && (slower || moreActive)) {
      overrides.speed = clamp(current.speed / oldSpeedScale, ...PLAN_LIMITS.speed);
      overrides.amplitude = clamp(current.amplitude / oldAmplitudeScale, ...PLAN_LIMITS.amplitude);
    }
    const chooseAnother = rejectCurrent || (changeColor && !colorCommands.some(command => command.type === 'select')) || (change && !colorRepair && !slower && !moreActive);
    if (chooseAnother) {
      prefs.lockedPalette = null;
      if (currentFamily && !prefs.rejectedPalettes.includes(currentFamily)) prefs.rejectedPalettes.push(currentFamily);
    }
    let namedChoice = null;
    for (const { type, color } of colorCommands) {
      if (type === 'ban') {
        if (!prefs.avoidedColors.includes(color)) prefs.avoidedColors.push(color);
        if (prefs.lockedPalette && !paletteLockAllowed(prefs.lockedPalette, prefs)) prefs.lockedPalette = null;
      } else {
        const family = NAMED_COLOR_FAMILIES[color];
        prefs.avoidedColors = prefs.avoidedColors.filter(avoided => avoided !== color);
        prefs.rejectedPalettes = prefs.rejectedPalettes.filter(rejected => rejected !== family);
        // A named color changes this moment. Only an explicit “keep” makes it sticky.
        prefs.lockedPalette = null;
        namedChoice = { paletteFamily: family, paletteVariant: 'balanced', colorCount: current?.colorCount || 3 };
        Object.assign(overrides, namedChoice);
      }
    }
    if (chooseAnother && !prefs.lockedPalette && !namedChoice) {
      let replacement = replacementPalette(current || createPlan('idle', { seed }), prefs, previousPreferences);
      if (!replacement) {
        // After a full tour, forget older rejections while still declining the current field.
        prefs.rejectedPalettes = currentFamily ? [currentFamily] : [];
        replacement = replacementPalette(current || createPlan('idle', { seed }), prefs, previousPreferences);
      }
      if (!replacement) {
        // There is no different color under the remaining hue constraints.
        // Keep the available field and ask for a new choice instead of faking a repair.
        prefs.rejectedPalettes = prefs.rejectedPalettes.filter(family => family !== currentFamily);
        understood = false;
        return make('clarify', { ...keep, paletteFamily: currentFamily || 'neutral_gray' });
      }
      overrides.paletteFamily = replacement;
    }
    if (prefs.lockedPalette) Object.assign(overrides, prefs.lockedPalette);
    if (keepRequested && (current || namedChoice)) {
      const family = resolvePaletteFamily(overrides, prefs);
      if (family) prefs.lockedPalette = { paletteFamily: family, paletteVariant: overrides.paletteVariant || 'balanced', colorCount: overrides.colorCount || 3, ...(family === 'mixed_warm_cool' && overrides.feelingSecondary && overrides.feelingSecondary !== 'none' ? { feelingPrimary: overrides.feelingPrimary, feelingSecondary: overrides.feelingSecondary, feelingTertiary:overrides.feelingTertiary, mixedMode:overrides.mixedMode, feelingBalance: overrides.feelingBalance } : {}) };
    }
    return make('repair', overrides);
  }
  if (keepRequested) {
    priority = true;
    if (!current) { understood = false; return make('clarify'); }
    prefs.lockedPalette = { ...keep };
    return make('complete', { ...keep, nextState: stableReturn(context) });
  }

  doNotLeave.lastIndex = 0;
  const invitationText = text.replace(/(?:没有人|沒有人|没人|沒人|没有|沒有|无人|無人|不想|不要).{0,3}陪我/g, '');
  if (doNotLeave.test(text) || /陪我|陪陪我|一起待|跟我待|\b(stay with me|keep me company|sit with me|be with me|continue (?:with me|keeping me company))\b|같이.{0,8}(있|머물)|곁에.{0,5}있/i.test(invitationText)) { priority = true; return make('rest', { loop: true, nextState: 'accompany' }); }
  if (/^(你好|您好|嗨|哈喽|我回来了|我回来啦|回来啦|hey|hi|hello|i['’]?m home|i am home|i['’]?m back|i am back|안녕|안녕하세요|나 왔어|다녀왔어)[!！。.\s]*$/i.test(text)) { priority = true; return make('greet'); }
  if (/谢谢|謝謝|感谢|感謝|\b(thanks|thank you|thank u)\b|고마워|고맙|감사/i.test(text)) { priority = true; return make('receive_thanks', { ...keep, nextState: stableReturn(context) }); }
  if (/(?:晚安|再见|再見|拜拜|\b(?:good ?night|goodbye|bye|see you)\b|잘\s*자|안녕히|잘\s*있어)(?:[，,\s]*(?:Dino|迪诺|lamp|램프))?[。.!！?？\s]*$/i.test(text) && !/(?:说|說|道).{0,3}(?:再见|再見)|\bsay(?:ing)?\s+(?:a\s+)?goodbye/i.test(text)) { priority = true; return make('farewell', keep); }
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
  const openComplexity = /五味杂陈|五味雜陳|百感交集|(?:心情|情绪|情緒|感受|心里|心裡)(?:真的|很|特别|特別|有点|有點|十分|非常)?复杂|(?:心情|心里|心裡)(?:很|有点|有點)?乱|\b(?:mixed feelings|mixed emotions|bittersweet)\b|(?:마음|감정|기분)(?:이|은|가)?\s*(?:너무|정말|좀|아주)?\s*복잡|만감이?\s*교차/i.test(text);
  const uncertainFeelings = /(?:说不清|說不清|分不清|不知道|不知)(?:楚)?(?:自己|现在|現在|到底|是|我|心里|心裡|心情|什么|什麼|的|一种|一種|感觉|感覺|\s){0,12}(?:开心|開心|难过|難過|感受|感觉|感覺|情绪|情緒)|\b(?:can(?:not|['’]t)|could(?: not|n['’]t)) (?:quite )?(?:tell|say|explain|sort out).{0,45}(?:feel|happy|sad|emotion)|(?:무슨|어떤)\s*(?:감정|기분)인지\s*(?:잘\s*)?모르|(?:기쁜지|좋은지).{0,15}슬픈지.{0,8}모르/i.test(text);
  if (!openComplexity && !uncertainFeelings && /(?:是什么|是什麼|为什么|為什麼|怎么定义|如何定义|多少|多大|谁是|誰是)|\b(?:what (?:is|are|was)|why (?:is|are|does|do)|how (?:does|do|many|much)|who (?:is|was))\b|무엇|뭐예요|뭔가요|왜.{0,12}(인가|해|하|지)|얼마/i.test(text)) { understood = false; return make('clarify', keep); }

  // The same situation can hold different orientations. Classify the whole
  // disclosure before choosing a palette; the final clause does not erase it.
  const joyText = text.replace(/(?:不|没|沒有|没有)(?:再|那么|很|太|一点也|一點也|怎么|怎麼)?(?:开心|高兴|幸福|快乐|兴奋|喜悦|滿足|满足)|\bnot\s+(?:(?:at all|very|really)\s+)?(?:happy|joyful|proud|excited|satisfied)\b|(?:행복|기쁘|즐겁).{0,3}않/gi, '');
  const discomfortText = text.replace(/(?:不|没(?:有)?|沒有)(?:再|太|那么|很|一点也|一點也)?(?:难过|伤心|孤独|孤单|寂寞|紧张|焦虑|害怕|担心)|(?:一点也|一點也)不(?:难过|伤心|孤独|孤单|寂寞)|\b(?:not|no longer)\s+(?:(?:at all|very|really)\s+)?(?:sad|upset|lonely|anxious|nervous|afraid|worried)\b|(?:슬프|외롭|불안하|긴장하|긴장되)지\s*않/gi, '')
    .replace(/(?:不(?:觉得|覺得|算|是)?|没(?:有)?|沒有)(?:再|太|那么|那麼|很)?(?:倒霉|倒楣|不顺|不走运|生气|愤怒|烦躁|讨厌|压力)|\b(?:not|no longer)\s+(?:(?:at all|very|really)\s+)?(?:unlucky|annoyed|angry|frustrated|stressed)\b|안\s*(?:긴장|불안|걱정)|(?:짜증나|걱정되|걱정하|긴장되|긴장하|불안하)지\s*않/gi, '');
  const joyful = /开心|幸福|高兴|快乐|兴奋|喜悦|\b(happy|joyful|proud|delighted|excited|thrilled|joy)\b|행복|기뻐|기쁘|즐거|신나/i.test(joyText);
  const quietAchievement = /满足|滿足|踏实|释然|鬆了一口氣|松了一口气|成就感|\b(satisfied|satisfaction|fulfilled|fulfilment|fulfillment|content|relieved)\b|뿌듯|보람|만족/i.test(joyText);
  const difficult = /没用|没价值|一无是处|不值得|难过|难受|糟透|糟糕|伤心|哭|孤独|孤单|寂寞|沮丧|不开心|不高兴|失落|失败|没做好|做得不好|生气|愤怒|倒霉|倒楣|不顺|不走运|受挫|挫败|委屈|郁闷|烦躁|好烦|真烦|很烦|太烦|烦死|讨厌|泡汤|\b(useless|worthless|a failure|hate myself|sad|crying|cried|awful|rough|terrible|lonely|upset|unhappy|not happy|failed|went wrong|angry|disappointed|unlucky|annoyed|annoying|frustrated|frustrating|miserable|ruined)\b|\b(?:bad luck|(?:nothing|everything) (?:is )?(?:going wrong|goes wrong)|(?:hard|bad|difficult|tough) (?:day|time|moment))\b|\btoday was (?:hard|bad|difficult|tough)\b|쓸모없|가치.{0,3}없|내가.{0,3}싫|슬프|슬퍼|우울|외롭|외로|속상|최악|실패|망쳤|화가|힘들|짜증|재수\s*없|운이?\s*없|뜻대로\s*안|행복하지\s*않|기쁘지\s*않/i.test(discomfortText);
  const tired = /累|疲惫|疲倦|疲乏|筋疲力尽|不想动|\b(tired|exhausted|worn out|drained|long day|spent|weary)\b|피곤|지쳤|지쳐|지친|힘든\s*하루|녹초/i.test(text);
  const tense = /紧张|焦虑|害怕|好怕|慌|压力|担心|\b(nervous|anxious|afraid|scared|tense|stressed|stressful|overwhelmed|panic|worried)\b|긴장|불안|무서|초조|스트레스|걱정/i.test(discomfortText);
  const anticipationText = joyText.replace(/(?:不|没(?:有)?|沒有)(?:再|太|很|那么|那麼|怎么|怎麼)?(?:期待|盼望|等不及)|\b(?:not|don['’]t|do not)\s+(?:really\s+)?(?:look(?:ing)? forward|eager|excited)\b|(?:기대|설레)(?:하지|되지)?\s*않|안\s*(?:기대|설레)/gi, '');
  const positiveAnticipation = /期待|盼望|(?:终于可以|终於可以).{0,10}(?:见面|見面|团聚|團聚|休息|放假|回家)|等不及|\b(look(?:ing)? forward|can['’]?t wait|excited|eager)\b|기대|설레|드디어.{0,8}(만나|볼)/i.test(anticipationText);
  const encouragement = /给我.{0,4}(打气|鼓励)|鼓励我|打打气|为我加油|\b(encourage|cheer me on|wish me luck|give me (?:some )?(?:courage|encouragement))\b|응원|힘을?\s*줘/i.test(text);
  const retryText = text.replace(/不想.{0,5}(再试|尝试|继续)|\b(?:don['’]t|do not) want to (?:try|continue)\b|다시.{0,10}(?:하고|해보고|시도하고)\s*싶지\s*않/gi, '');
  const retry = /(?:想|愿意|決定|决定|还是会|還是會|要).{0,8}(?:再试|再試|尝试|嘗試|继续努力|继续做|振作)|\b(?:want|would like|ready|going|determined|will).{0,14}(?:try again|keep trying|give it another|continue|start again)\b|다시.{0,10}(?:해\s*보|도전|시도)|계속.{0,6}(?:해\s*보|노력)/i.test(retryText);
  const birthday = /生日|\b(?:my birthday|birthday (?:is )?(?:today|tomorrow|next week))\b|생일/i.test(text);
  const solitudeContext = /没有人.{0,5}(一起|陪|庆祝)|没人.{0,5}(一起|陪|庆祝)|一个人|\b(?:alone|no one|nobody|by myself)\b|혼자|아무도/i.test(text);
  const achievement = /终于.{0,15}(完成|录用|录取|成功|通过|结束|做完)|论文.{0,8}(录用|录取)|\b(?:(?:finally|just).{0,25}(?:finished|accepted|done|passed|won)|(?:paper|thesis).{0,12}accepted|i did it|i got (?:the job|accepted))\b|드디어.{0,12}(끝|완성|해냈|통과|합격)|논문.{0,8}(게재|승인)/i.test(text);
  const positiveMilestone = /领(?:到|取)?毕业证|拿(?:到)?毕业证|毕业典礼|(?:我|就要|终于|明天|下周).{0,6}毕业(?!考试|考)|与家人团聚|和家人团聚|跟家人团聚|领(?:奖|结婚证)|\b(?:graduat(?:e|ed|ing|ion)|collect(?:ing)? (?:my |a )?(?:degree|diploma)|reunit(?:e|ed|ing) with (?:my |the )?family|got (?:the|a new) job|won (?:a|the) award)\b|졸업(?:해|하|식|이야|이에|을)|가족.{0,8}(?:다시\s*만나|재회)|취업(?:했|에\s*성공)/i.test(text);
  const feelingMix = explicitFeelingMix(joyText, discomfortText, openComplexity);
  if (uncertainFeelings || openComplexity && !feelingMix) return make('mixed', { expression:'bittersweet', mixedMode:'open', feelingBalance:.5 });
  if (openComplexity && feelingMix) return make('mixed', { expression:'bittersweet', ...feelingMix });
  if (tired && (quietAchievement || joyful) && !/难过|伤心|孤独|孤单|寂寞|\b(?:sad|lonely)\b|슬프|외롭|외로/i.test(discomfortText)) return make('rest', { expression: 'fulfilled' });
  // Worry remains S04 even alongside ordinary anticipation. A second feeling
  // word alone does not imply S05; explicitly complex disclosures are above.
  if (feelingMix?.mixedMode === 'paired' && [feelingMix.feelingPrimary, feelingMix.feelingSecondary].every(feeling => ['hope','anxiety'].includes(feeling)) && !retry) return make('upcoming');
  if (feelingMix && !retry) return make('mixed', { expression: 'bittersweet', ...feelingMix });
  if ((difficult || tense) && (joyful || quietAchievement) && !retry) {
    // Contradictory events do not prove contradictory feelings. Leave this
    // interpretation open to AI instead of pinning it with a broad keyword.
    understood = false;
    return make('mixed', { expression: 'bittersweet' });
  }
  // Classify the meaning of the disclosure before its date: good news and
  // shared delight remain good news when the positive event is in the future.
  if ((birthday || achievement || positiveMilestone || joyful || quietAchievement || positiveAnticipation) && !difficult && !tense && !encouragement && !isQuestion(text)) {
    // "Alone, but really happy" is joy. "Birthday, alone" is contextual data:
    // it can be quiet celebration or wistfulness, and should reach the model.
    if (solitudeContext && !joyful && !quietAchievement) understood = false;
    return make('celebrate', { expression: quietAchievement && !/太开心|好开心|太幸福|太高兴|thrilled|so happy|신나|너무\s*행복/i.test(text) ? 'quiet' : 'default' });
  }
  if (retry && difficult) return make('setback', { expression:'renew' });
  // S04 answers expressed nervousness or a request for courage. A date or
  // event name alone does not establish that the person needs encouragement.
  if (tense || encouragement) return make('upcoming');
  if (tired) return make('rest');
  if (difficult || retry) return make('setback', { expression: retry ? 'renew' : 'default' });
  const plainSchedule = /^(?:我)?(?:明天|下周|后天)(?:我)?(?:有|要|要去|有个|要做)?(?:发表|演讲|面试|考试)(?:了)?[。.!！\s]*$|^(?:(?:i have|i['’]m giving|i am giving|i will give) (?:a |an )?)?(?:a |an |my )?(?:presentation|interview|exam) (?:is )?(?:tomorrow|next week)[.!\s]*$|^(?:내일|다음\s*주)\s*(?:(?:제가|나는|저는)\s*)?(?:발표|면접|시험)(?:가|이|야|이야|이에요|예요|해|해요|를\s*해|를\s*해요|이\s*있어|가\s*있어|이\s*있어요|가\s*있어요)?[.!\s]*$/i.test(text);
  if (plainSchedule) return make('everyday');
  if (!isQuestion(text) && /我|今天|明天|下周|刚刚|刚才|吃了|回家|天气|下雨|\b(?:i |i['’]m|my |today|tomorrow|next week|this morning|had lunch|had dinner|weather|went |came |a day)\b|오늘|내일|다음\s*주|나는|저는|밥|날씨|집에/i.test(text)) {
    // An unfamiliar story is a gentle local fallback, but still reaches the
    // language model for interpretation instead of being locked as ordinary.
    // A meal or weather keyword is not evidence of neutral affect. Keep the
    // local ordinary-sharing fallback open so AI can interpret the full story.
    understood = false;
    return make('everyday');
  }
  understood = false;
  return make('clarify', keep);
}
