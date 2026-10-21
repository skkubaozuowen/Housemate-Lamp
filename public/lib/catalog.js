// These are prototype design hypotheses, to be compared and revised in workshops.
export const MOTION_PRIMITIVES = Object.freeze(['hold', 'slow_drift', 'pass', 'expand', 'converge', 'separate', 'alternate', 'blend', 'settle', 'interrupt_return', 'local_echo']);
export const NEXT_STATES = Object.freeze(['idle', 'hold', 'waiting', 'accompany', 'withdraw']);

const definitions = [
  ['B01','idle','Idle','待机','대기','Slow color fields wander along the edges.','Space and very slow drift may suggest availability without asking for attention.','lilac_blush','slow_drift',.25,.23,.38,14000,true,1000,'idle',false],
  ['B02','acknowledge','Received','接收确认','수신 확인','A single short band passes through a local area.','A local pass can mark receipt without agreement.','lilac_blush','pass',.42,1.1,.6,850,false,200,'hold',false],
  ['B03','processing','Processing','处理中','처리 중','Two compact color fields orbit while a request is pending.','A small continuous loop may distinguish pending work from a completed response.','sea_glass','converge',.4,.7,.55,1800,true,350,'hold',false],
  ['B04','greet','Welcome','问候','인사','One open arc travels outward from the side.','A single outward opening may be read as welcoming.','peach_amber','expand',.5,.75,.78,2200,false,650,'idle',false],
  ['B05','affirm','Accept','肯定','긍정','Two fields meet and form a clear shared area.','Joining and a visible completion point may communicate acceptance of a known choice.','sea_glass','converge',.5,.8,.75,1600,false,500,'hold',false],
  ['B06','decline','Decline','否定','부정','Two upright fields move apart like opening gates, then settle.','Separation may communicate a limit without the abruptness of a system error.','mauve_sand','separate',.4,.65,.7,1600,false,500,'hold',false],
  ['B07','clarify','Clarify','请求澄清','이해 확인','Two areas take turns once, then remain still.','A short alternation followed by stillness may invite clarification.','rose_lavender','alternate',.42,.6,.65,2100,false,600,'waiting',true],
  ['B08','wait','Wait','等待继续','응답 기다림','Two areas gather into one quiet central pool.','A settled field may leave time for the person to continue without repeated prompts.','sage_cream','settle',.32,.4,.48,1900,false,650,'waiting',true],
  ['B09','notify','Gentle notice','轻度提醒','주의 환기','Two local halos appear in succession, then stop.','Two limited increases may be noticeable without becoming an alarm.','peach_amber','local_echo',.58,.75,.6,2200,false,450,'hold',false],
  ['B10','complete','Complete','完成确认','완료 확인','Three areas dock together below the center.','Consolidation may make the end of a small interaction legible.','sage_cream','converge',.46,.65,.7,1800,false,600,'hold',false],
  ['B11','farewell','Farewell','告别','작별','Color slowly returns to the edges and the base field.','A slow retreat may suggest closure while remaining available.','rose_lavender','separate',.32,.36,.7,3300,false,950,'idle',false],
  ['B12','error','Retry','系统异常','오류 알림','A flowing band has one visible break and returns.','An interruption and reversal may distinguish failure from an intentional refusal.','coral_clay','interrupt_return',.46,.8,.72,2100,false,350,'waiting',true],
  ['R01','empathize','Receive a feeling','共情承接','공감 표현','A pause, then separated areas gradually find a connection.','A pause and gradual connection may acknowledge a feeling without endorsing its content.','mauve_sand','blend',.4,.38,.7,5200,false,1000,'hold',false],
  ['R02','accompany','Stay together','安静陪伴','조용한 동행','Wide, slow, continuous bands remain present.','A continuous broad rhythm may offer company when explicitly invited.','mist_blue','slow_drift',.4,.28,.62,8500,true,1200,'accompany',false],
  ['R03','soothe','Ease into quiet','尝试安抚','안정 지원','Slightly irregular movement becomes organized and slow.','Moving toward regularity is an optional calming attempt, not a health claim.','sea_glass','settle',.43,.4,.72,6800,false,1100,'hold',false],
  ['R04','encourage','Encourage','鼓励','응원','Three connected fields rise diagonally in successive steps.','Directional growth may support an upcoming action without implying that it is complete.','peach_amber','expand',.56,.62,.8,4200,false,850,'hold',false],
  ['R05','celebrate','Celebrate','庆祝','축하','Three controlled openings share a brief moment.','A finite sequence of openings may share an event without persistent high energy.','apricot_rose','expand',.62,.65,.75,4200,false,1400,'idle',false],
  ['R06','receive_thanks','Receive thanks','接受感谢','감사에 대한 응답','A small local circuit in the current palette.','A limited return gesture may receive thanks and leave room for closure.','lilac_blush','local_echo',.38,.7,.48,1200,false,350,'hold',false],
  ['R07','withdraw','Give space','尊重独处','혼자 있는 시간 존중','Motion gradually stops while the color remains.','Stillness without compulsory dimming may respect an explicit boundary.','lilac_blush','settle',.24,.28,.46,3000,false,750,'withdraw',true],
  ['R08','repair','Revise','道歉与修正','사과와 수정','A diagonal sweep visibly replaces the previous field.','A visible parameter change may make correction tangible; preferences must actually persist.','rose_lavender','blend',.42,.45,.62,2300,false,650,'hold',false],
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
