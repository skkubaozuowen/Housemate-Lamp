import { normalizeComposition } from './composition.js';

// These are prototype design hypotheses, to be compared and revised in workshops.
export const MOTION_PRIMITIVES = Object.freeze(['hold', 'slow_drift', 'pass', 'expand', 'converge', 'separate', 'alternate', 'blend', 'settle', 'interrupt_return', 'local_echo']);
export const NEXT_STATES = Object.freeze(['idle', 'hold', 'waiting', 'accompany', 'withdraw']);
export const EXPRESSIONS = Object.freeze(['default', 'quiet', 'renew', 'fulfilled', 'tense', 'anticipation', 'neutral', 'bittersweet']);

// The study repertoire: five exchange states and six everyday situations.
export const SCENE_RESPONSE_TYPES = Object.freeze(['celebrate', 'setback', 'rest', 'upcoming', 'mixed', 'everyday']);
export const SCENE_DURATION_LIMITS = Object.freeze([10000, 15000]);
export const VISIBLE_RESPONSE_TYPES = Object.freeze(['greet', 'acknowledge', 'processing', 'clarify', 'farewell', 'celebrate', 'setback', 'rest', 'upcoming', 'mixed', 'everyday']);

const legacyDefinitions = [
  ['B01','idle','Idle','待机','대기','A static, uniform white field remains available between exchanges.','A quiet neutral baseline separates a finished response from the next exchange.','neutral_gray','hold',0,.23,0,12000,true,450,'idle',false],
  ['B02','acknowledge','Received','接收确认','수신 확인','One soft cloud blooms locally, lifts slightly and settles.','A single local light nod may mark receipt without agreement.','lilac_blush','pass',.42,1.1,.6,1200,false,260,'hold',false],
  ['B03','processing','Processing','处理中','처리 중','Two compact color fields orbit while a request is pending.','A small continuous loop may distinguish pending work from a completed response.','sea_glass','converge',.4,.7,.55,1800,true,350,'hold',false],
  ['B04','greet','Welcome','问候','인사','One open arc travels outward from the side.','A single outward opening may be read as welcoming.','peach_amber','expand',.5,.75,.78,2200,false,650,'idle',false],
  ['B05','affirm','Accept','肯定','긍정','Two fields meet and form a clear shared area.','Joining and a visible completion point may communicate acceptance of a known choice.','sea_glass','converge',.5,.8,.75,1600,false,500,'hold',false],
  ['B06','decline','Decline','否定','부정','Two upright fields move apart like opening gates, then settle.','Separation may communicate a limit without the abruptness of a system error.','mauve_sand','separate',.4,.65,.7,1600,false,500,'hold',false],
  ['B07','clarify','Clarify','请求澄清','이해 확인','Two areas take turns once, then remain still.','A short alternation followed by stillness may invite clarification.','rose_lavender','alternate',.42,.6,.65,2100,false,600,'waiting',true],
  ['B08','wait','Wait','等待继续','응답 기다림','Two areas gather into one quiet central pool.','A settled field may leave time for the person to continue without repeated prompts.','sage_cream','settle',.32,.4,.48,1900,false,650,'waiting',true],
  ['B09','notify','Gentle notice','轻度提醒','주의 환기','Two local halos appear in succession, then stop.','Two limited increases may be noticeable without becoming an alarm.','peach_amber','local_echo',.58,.75,.6,2200,false,450,'hold',false],
  ['B10','complete','Complete','完成确认','완료 확인','Three areas dock together below the center.','Consolidation may make the end of a small interaction legible.','sage_cream','converge',.46,.65,.7,1800,false,600,'hold',false],
  ['B11','farewell','Farewell','告别','작별','Color slowly returns to the edges and the base field.','A slow retreat may suggest closure while remaining available.','rose_lavender','separate',.32,.36,.7,3300,false,950,'idle',false],
  ['B12','error','Retry','系统异常','오류 알림','A soft cloud follows a short arc, hesitates and gently returns.','A hesitation and return may distinguish a retry from an intentional refusal.','coral_clay','interrupt_return',.46,.8,.72,2600,false,420,'waiting',true],
  ['R01','empathize','Receive a feeling','共情承接','공감 표현','A pause, then separated areas gradually find a connection.','A pause and gradual connection may acknowledge a feeling without endorsing its content.','mauve_sand','blend',.4,.38,.7,5200,false,1000,'hold',false],
  ['R02','accompany','Stay together','安静陪伴','조용한 동행','Three soft, curved waves flow continuously across the light field.','A slow, continuous water-like rhythm may offer company when explicitly invited; this association remains a design hypothesis.','mist_blue','slow_drift',.4,.28,.62,8500,true,1200,'accompany',false],
  ['R03','soothe','Ease into quiet','尝试安抚','안정 지원','Slightly irregular movement becomes organized and slow.','Moving toward regularity is an optional calming attempt, not a health claim.','sea_glass','settle',.43,.4,.72,6800,false,1100,'hold',false],
  ['R04','encourage','Encourage','鼓励','응원','Three connected fields rise diagonally in successive steps.','Directional growth may support an upcoming action without implying that it is complete.','peach_amber','expand',.56,.62,.8,4200,false,850,'hold',false],
  ['R05','celebrate','Celebrate','庆祝','축하','Three controlled openings share a brief moment.','A finite sequence of openings may share an event without persistent high energy.','apricot_rose','expand',.62,.65,.75,4200,false,1400,'idle',false],
  ['R06','receive_thanks','Receive thanks','接受感谢','감사에 대한 응답','A small local circuit in the current palette.','A limited return gesture may receive thanks and leave room for closure.','lilac_blush','local_echo',.38,.7,.48,1200,false,350,'hold',false],
  ['R07','withdraw','Give space','尊重独处','혼자 있는 시간 존중','Motion gradually stops while the color remains.','Stillness without compulsory dimming may respect an explicit boundary.','lilac_blush','settle',.24,.28,.46,3000,false,750,'withdraw',true],
  ['R08','repair','Revise','道歉与修正','사과와 수정','A diagonal sweep visibly replaces the previous field.','A visible parameter change may make correction tangible; preferences must actually persist.','rose_lavender','blend',.42,.45,.62,2300,false,650,'hold',false],
];
const frameworkDefinitions = [
  ['B01','greet','Listening','开始倾听','듣기 시작','A small irregular blue-green glow opens once, then remains available for listening and follows the voice until submission.','A visible opening and a shared field mark availability.','sea_glass','expand',.5,.58,.8,1400,false,300,'hold',false],
  ['B02','acknowledge','Received','收到表达','발화 수신','The current glow gathers gently and releases one pulse, carrying its color into the next response.','One continuous gesture marks receipt without implying agreement.','luminous_current','expand',.52,.8,.82,850,false,240,'idle',false],
  ['B03','processing','Thinking','正在处理','처리 중','Two soft luminous balls separate from the received glow and orbit together while a real request is pending.','Continuous paired movement makes thinking visible and can unfold into the next situation.','luminous_current','slow_drift',.5,1.65,.75,2400,true,350,'idle',false],
  ['B04','clarify','A little more?','等待补充','조금 더 들려주세요','One soft glow probes to a side, hesitates and returns, then leaves uniform white light available for more input.','An interrupted exploratory movement leaves room for continuation.','sea_glass','alternate',.45,.6,.7,2000,false,400,'idle',true],
  ['B05','farewell','Until next time','交流结束','대화 마무리','The glow gathers once and returns to ordinary ambient light.','A gathering gesture closes the exchange without a blackout.','sea_glass','converge',.4,.58,.75,1800,false,450,'idle',false],
  ['S01','celebrate','Good news & anticipation','好事与期待','좋은 일과 기대','Warm apricot, gold and rose bloom in layered ripples, fade gently, and leave blue-violet-green twinkles within one finite response before returning to white.','Shared delight and positive anticipation can range from quiet recognition to an expansive celebration with a gentle ambient tail.','apricot_rose','expand',.76,.72,.88,12000,false,1000,'idle',false],
  ['S02','setback','A difficult moment','不顺与接纳','속상한 순간','Violet and rose-red waves flow beneath differently sized red and blue glows that softly appear, drift and disappear in staggered cycles. When gentle support is appropriate, gold can enter after the violet waves and become warm yellow with gentle star-like twinkles.','Continuing waves with passing red and blue glows stay with discomfort; gradually emerging gold offers optional support after receiving the difficulty, without requiring a declaration of trying again or claiming the difficulty is resolved.','dusk_indigo','slow_drift',.52,.34,.78,12000,false,1100,'idle',false],
  ['S03','rest','After a tiring day','疲惫与休息','지친 하루','A broad sloping cyan veil opens, lowers and gradually slows into a spacious resting field.','Opening space and easing downward distinguish rest from the recurring tide of a difficult moment.','mist_blue','slow_drift',.5,.3,.76,12000,false,1200,'idle',false],
  ['S04','upcoming','A little courage','紧张时给予勇气','긴장에 용기를','A wavering violet glow settles as peach-gold warmth rises through it and opens into a broad, steady breathing field.','A single connected gesture acknowledges expressed nervousness and offers courage without predicting an outcome.','horizon_glow','settle',.56,.4,.72,12000,false,1000,'idle',false],
  ['S05','mixed','Interwoven feelings','交织的感受','겹쳐진 감정','Luminous color gradients travel along the light field, gradually replacing neighboring colors through soft continuous transitions.','Several feelings can coexist and interweave through color, flow and space without requiring a single label or a fixed dominant color.','mixed_warm_cool','blend',.62,.4,.8,12000,false,1200,'idle',false],
  ['S06','everyday','Everyday sharing','日常分享','일상 이야기','Three scattered warm pinpoints ripple once to acknowledge the words, then blend into two broad cream-apricot lights that breathe and wander independently.','A restrained acknowledgment receives ordinary facts and plans when no distinct feeling or support need is expressed.','peach_amber','local_echo',.4,.42,.5,12000,false,850,'idle',false],
];
// Keep older saved scenes and internal control states readable, without showing
// the previous twenty-item repertoire as the current design framework.
const definitions = [...frameworkDefinitions, ...legacyDefinitions.filter(row => !VISIBLE_RESPONSE_TYPES.includes(row[1]))];
export const RESPONSE_TYPES = Object.freeze(definitions.map(row => row[1]));
export const CATALOG = Object.freeze(Object.fromEntries(definitions.map(([id,responseType,label,zh,ko,description,hypothesis,paletteFamily,motionPrimitive,energy,speed,amplitude,durationMs,loop,transitionMs,nextState,requiresUserInput]) => [responseType,Object.freeze({id,label,zh,ko,description,hypothesis,paletteFamily,motionPrimitive,energy,speed,amplitude,durationMs,loop,transitionMs,nextState,requiresUserInput})])));

// These native responses keep a quieter moving tail within their finite
// 10–15 second clip. The controller then returns to uniform white idle.
// A custom primitive or explicit hold retains its own visual construction.
export function hasAmbientTail(plan) {
  if (!plan || plan.loop || plan.motionPrimitive !== CATALOG[plan.responseType]?.motionPrimitive) return false;
  return ['mixed','everyday','setback','upcoming'].includes(plan.responseType)
    || (plan.responseType === 'celebrate' && plan.expression !== 'quiet');
}

let sequence = 0;
export function createPlan(type = 'idle', overrides = {}) {
  const responseType = RESPONSE_TYPES.includes(type) ? type : 'clarify';
  const {id,label,zh,ko,description,hypothesis,...parameters} = CATALOG[responseType];
  // One seed per plan, never per frame. Explicit seeds make workshop runs repeatable.
  const seed = ((Date.now() & 0xffffffff) ^ Math.imul(++sequence, 2654435761)) >>> 0;
  return {version:1,responseType,...parameters,expression:'default',paletteVariant:'balanced',colorCount:['mixed','upcoming'].includes(responseType) ? 4 : 3,
    feelingPrimary:'joy',feelingSecondary:responseType === 'mixed' ? 'sadness' : 'none',feelingBalance:.7,
    mixedMode:'paired',feelingTertiary:'none',seed,...overrides,composition:normalizeComposition(overrides.composition)};
}
