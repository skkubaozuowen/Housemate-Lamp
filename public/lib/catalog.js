// These are prototype design hypotheses, to be compared and revised in workshops.
export const MOTION_PRIMITIVES = Object.freeze(['hold', 'slow_drift', 'pass', 'expand', 'converge', 'separate', 'alternate', 'blend', 'settle', 'interrupt_return', 'local_echo']);
export const NEXT_STATES = Object.freeze(['idle', 'hold', 'waiting', 'accompany', 'withdraw']);

const definitions = [
  ['B01','idle','Idle','待机','대기','An available, slowly drifting field.','Space and very slow drift may suggest availability without asking for attention.','lilac_blush','slow_drift',.18,.18,.28,14000,true,1800,'idle',false],
  ['B02','acknowledge','Received','接收确认','수신 확인','A single short band passes through a local area.','A local pass can mark receipt without agreement.','lilac_blush','pass',.34,1,.5,850,false,200,'hold',false],
  ['B03','processing','Processing','处理中','처리 중','A restrained local circulation while a request is pending.','A small continuous loop may distinguish pending work from a completed response.','neutral_haze','converge',.24,.55,.28,1800,true,350,'hold',false],
  ['B04','greet','Welcome','问候','인사','One soft wave opens out from a local origin.','A single outward opening may be read as welcoming.','peach_amber','expand',.45,.65,.68,2200,false,900,'idle',false],
  ['B05','affirm','Accept','肯定','긍정','Two fields meet and form a clear shared area.','Joining and a visible completion point may communicate acceptance of a known choice.','sea_glass','converge',.42,.75,.64,1600,false,700,'hold',false],
  ['B06','decline','Decline','否定','부정','Two fields gently move apart and settle.','Separation may communicate a limit without the abruptness of a system error.','mauve_sand','separate',.3,.6,.55,1600,false,700,'hold',false],
  ['B07','clarify','Clarify','请求澄清','이해 확인','Two areas take turns once, then remain still.','A short alternation followed by stillness may invite clarification.','rose_lavender','alternate',.3,.5,.5,2100,false,900,'waiting',true],
  ['B08','wait','Wait','等待继续','응답 기다림','Flow comes to rest around a stable area.','A settled field may leave time for the person to continue without repeated prompts.','sage_cream','settle',.24,.35,.38,1900,false,900,'waiting',true],
  ['B09','notify','Gentle notice','轻度提醒','주의 환기','A local area strengthens twice, then stops.','Two limited increases may be noticeable without becoming an alarm.','peach_amber','local_echo',.5,.7,.5,2200,false,700,'hold',false],
  ['B10','complete','Complete','完成确认','완료 확인','Several areas gather into a single stable field.','Consolidation may make the end of a small interaction legible.','sage_cream','converge',.36,.55,.58,1800,false,900,'hold',false],
  ['B11','farewell','Farewell','告别','작별','Color slowly returns to the edges and the base field.','A slow retreat may suggest closure while remaining available.','rose_lavender','separate',.22,.3,.55,3300,false,1800,'idle',false],
  ['B12','error','Retry','系统异常','오류 알림','A flowing band has one visible break and returns.','An interruption and reversal may distinguish failure from an intentional refusal.','coral_clay','interrupt_return',.4,.75,.6,2100,false,450,'waiting',true],
  ['R01','empathize','Receive a feeling','共情承接','공감 표현','A pause, then separated areas gradually find a connection.','A pause and gradual connection may acknowledge a feeling without endorsing its content.','mauve_sand','blend',.28,.3,.55,5200,false,1800,'hold',false],
  ['R02','accompany','Stay together','安静陪伴','조용한 동행','Wide, slow, continuous bands remain present.','A continuous broad rhythm may offer company when explicitly invited.','mist_blue','slow_drift',.3,.22,.45,8500,true,2200,'accompany',false],
  ['R03','soothe','Ease into quiet','尝试安抚','안정 지원','Slightly irregular movement becomes organized and slow.','Moving toward regularity is an optional calming attempt, not a health claim.','sea_glass','settle',.32,.35,.6,6800,false,2000,'hold',false],
  ['R04','encourage','Encourage','鼓励','응원','A local field progressively opens toward a larger space.','Directional growth may support an upcoming action without implying that it is complete.','peach_amber','expand',.5,.55,.7,4200,false,1500,'hold',false],
  ['R05','celebrate','Celebrate','庆祝','축하','Three controlled openings share a brief moment.','A finite sequence of openings may share an event without persistent high energy.','apricot_rose','expand',.62,.65,.75,4200,false,1400,'idle',false],
  ['R06','receive_thanks','Receive thanks','接受感谢','감사에 대한 응답','A small local circuit in the current palette.','A limited return gesture may receive thanks and leave room for closure.','lilac_blush','local_echo',.28,.65,.35,1200,false,550,'hold',false],
  ['R07','withdraw','Give space','尊重独处','혼자 있는 시간 존중','Motion gradually stops while the color remains.','Stillness without compulsory dimming may respect an explicit boundary.','lilac_blush','settle',.2,.25,.38,3000,false,1200,'withdraw',true],
  ['R08','repair','Revise','道歉与修正','사과와 수정','The previous scene is interrupted by a smooth corrected field.','A visible parameter change may make correction tangible; preferences must actually persist.','rose_lavender','blend',.3,.35,.45,2300,false,1600,'hold',false],
];
export const RESPONSE_TYPES = Object.freeze(definitions.map(row => row[1]));
export const CATALOG = Object.freeze(Object.fromEntries(definitions.map(([id,responseType,label,zh,ko,description,hypothesis,paletteFamily,motionPrimitive,energy,speed,amplitude,durationMs,loop,transitionMs,nextState,requiresUserInput]) => [responseType,Object.freeze({id,label,zh,ko,description,hypothesis,paletteFamily,motionPrimitive,energy,speed,amplitude,durationMs,loop,transitionMs,nextState,requiresUserInput})])));

let sequence = 0;
export function createPlan(type = 'idle', overrides = {}) {
  const responseType = RESPONSE_TYPES.includes(type) ? type : 'clarify';
  const {id,label,zh,ko,description,hypothesis,...parameters} = CATALOG[responseType];
  // One seed per plan, never per frame. Explicit seeds make workshop runs repeatable.
  const seed = ((Date.now() & 0xffffffff) ^ Math.imul(++sequence, 2654435761)) >>> 0;
  return {version:1,responseType,...parameters,paletteVariant:'balanced',colorCount:3,seed,...overrides};
}
