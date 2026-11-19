import {CATALOG, MOTION_PRIMITIVES, hasAmbientTail} from './catalog.js';
import {selectPalette,colorGroup} from './palettes.js';
import {normalizeComposition} from './composition.js';

export const LED_SIZE = 16;
const TAU = Math.PI * 2;
const clamp = (value,min=0,max=1) => Math.min(max,Math.max(min,value));
const number = (value,fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const ease = value => { const p=clamp(value); return p*p*(3-2*p); };
const mix = (a,b,p) => a+(b-a)*p;
const pulse = (p,center,width) => Math.exp(-(((p-center)/width)**2));
const phaseFor = seed => ((Math.imul((seed>>>0)^0x9e3779b9,1664525)>>>0)/4294967296)*TAU;

// Overall scale changes stay inside the scene's existing soft geometry. This
// only runs on native everyday scenes; basic signals and manual primitives keep
// their original controls and every default multiplication is skipped.
function adaptSceneGeometry(scene,composition) {
  const {fieldScale,spread,elongation}=composition;
  for(const shape of scene) {
    if(fieldScale!==1) {
      if(shape.rx!==undefined){shape.rx*=fieldScale;shape.ry*=fieldScale;}
      if(shape.kind==='mixedGradient'&&shape.mode==='layered')shape.weaveScale*=fieldScale;
      if(shape.radius!==undefined)shape.radius*=fieldScale;
      if(shape.width!==undefined)shape.width*=fieldScale;
    }
    if(spread!==1) {
      if(shape.x!==undefined&&shape.kind!=='wave')shape.x=.5+(shape.x-.5)*spread;
      if(shape.y!==undefined)shape.y=.5+(shape.y-.5)*spread;
      if(shape.kind==='mixedGradient'){shape.rx*=spread;shape.ry*=spread;if(shape.mode==='layered')shape.weaveScale*=spread;}
    }
    if(elongation!==1&&shape.rx!==undefined){
      shape.rx*=elongation;shape.ry/=Math.sqrt(elongation);
      if(shape.kind==='mixedGradient'&&shape.mode==='layered')shape.weaveScale*=elongation;
    }
  }
}
const gaussian = (x,y,shape) => {
  if(typeof shape.angle==='number') {
    const dx=x-shape.x,dy=y-shape.y,cos=Math.cos(shape.angle),sin=Math.sin(shape.angle);
    return Math.exp(-(((dx*cos+dy*sin)/shape.rx)**2+((-dx*sin+dy*cos)/shape.ry)**2)*1.9);
  }
  return Math.exp(-(((x-shape.x)/shape.rx)**2+((y-shape.y)/shape.ry)**2)*1.9);
};

function addField(scene,x,y,rx,ry,color,strength=1) { scene.push({kind:'field',x,y,rx,ry,color,strength}); }
function addVeil(scene,x,y,rx,ry,angle,color,strength=1) { scene.push({kind:'field',x,y,rx,ry,angle,color,strength}); }
function addRing(scene,x,y,radius,width,color,strength=1) { scene.push({kind:'ring',x,y,radius,width,color,strength}); }
function addBand(scene,position,width,angle,color,strength=1) { scene.push({kind:'band',position,width,angle,color,strength}); }
function addWave(scene,y,width,bend,phase,flow,color,strength=1) { scene.push({kind:'wave',x:0,y,width,bend,phase,flow,color,strength}); }
function addArc(scene,x,y,radius,width,direction,color,strength=1) { scene.push({kind:'arc',x,y,radius,width,direction,color,strength}); }
function addStroke(scene,x,y,x2,y2,width,color,strength=1) { scene.push({kind:'stroke',x,y,x2,y2,width,color,strength}); }

// A continuous pigment gradient keeps the original co-design's luminous color
// transitions. Sampling a single veil avoids averaging several opaque RGB blobs.
function gradientColor(palette,position,balance,avoidedSegments=[],{travel=0,ripple=0,cycle=false}={}) {
  let p=clamp(position);
  // A reflected color sequence travels along the existing axis without a
  // last-to-first jump. Contextual compositions keep their feeling boundary;
  // a traveling ripple replaces nearby shades inside each allotted region.
  if(cycle)p=1-Math.abs(1-(((position-travel)%2+2)%2));
  if(typeof balance==='number')p=p<balance ? p/balance*.5 : .5+(p-balance)/(1-balance)*.5;
  if(ripple)p=clamp(p+ripple*Math.sin(TAU*p)*Math.sin(TAU*p*2-travel*TAU));
  const t=p*(palette.length-1),i=Math.floor(t),a=palette[i],b=palette[Math.min(i+1,palette.length-1)];
  const fraction=t-i;
  const color=avoidedSegments[i]
    ? fraction<.5 ? a.map(channel=>mix(channel,255,fraction*2)) : b.map(channel=>mix(255,channel,(fraction-.5)*2))
    : a.map((channel,c)=>mix(channel,b[c],fraction));
  const peak=Math.max(...color);
  const achromatic=a.every(channel=>channel===a[0])&&b.every(channel=>channel===b[0]);
  return peak&&!achromatic ? color.map(channel=>channel/peak*255) : color;
}


// Allowed pigments can mix into a declined intermediate hue. Fade that contact
// smoothly through the existing white light surface instead of introducing a
// gray seam, snapping to another hue, or painting a hard white pixel mask.
const HUE_SPANS = {red:[345,375],orange:[15,45],yellow:[45,75],green:[75,170],blue:[170,255],purple:[255,290],pink:[290,345]};
function respectDeclinedHues(rgb,avoidedColors) {
  const high=Math.max(...rgb),low=Math.min(...rgb),chroma=high-low;
  if(chroma<=12)return rgb;
  const [r,g,b]=rgb;
  let hue=(high===r?((g-b)/chroma)%6:high===g?(b-r)/chroma+2:(r-g)/chroma+4)*60;
  hue=(hue+360)%360;
  let distance=Infinity;
  for(const group of avoidedColors) {
    const span=HUE_SPANS[group];
    if(!span)continue;
    for(const value of [hue-360,hue,hue+360])distance=Math.min(distance,value<span[0]?span[0]-value:value>span[1]?value-span[1]:0);
  }
  if(distance>=12)return rgb;
  const shoulder=1-ease(distance/12),keep=1-shoulder*(1-12/chroma);
  return rgb.map(channel=>mix(255,channel,keep));
}

function restingFields(scene,phase=0,amplitude=.25,strength=.85) {
  addField(scene,.015+Math.sin(phase)*amplitude*.11,.44+Math.cos(phase)*amplitude*.13,.37,.38,0,strength);
  addField(scene,1.015+Math.cos(phase*.83)*amplitude*.1,.74+Math.sin(phase*.83)*amplitude*.13,.35,.4,1,strength*.95);
  addField(scene,.6,.98+Math.sin(phase*.6)*amplitude*.06,.29,.24,2,strength*.25);
}

// Each primitive emits the same small set of abstract fields. Scene-specific
// timing below gives responses their own signature without separate render loops.
function primitiveScene(primitive,{p,clock,phase,amp,energy,type}) {
  const scene=[], open=ease(p), drift=clock*.4+phase;
  const base=.45+energy*.95;
  switch (primitive) {
    case 'hold':
      restingFields(scene,phase,0,base); break;
    case 'slow_drift':
      if(type==='accompany') {
        // A continuous clock carries the curves through every loop boundary.
        // Amplitude zero freezes their flow, while retaining the water-like form.
        const flow=clock*2.15*(amp/.62),bend=.085+amp*.025;
        addWave(scene,.22,.12,bend,phase,flow,0,base);
        addWave(scene,.53,.145,bend,phase+.7,flow+.24,1,base*.95);
        addWave(scene,.84,.125,bend*.9,phase+1.4,flow+.48,2,base*.8);
      } else {
        // Availability wanders at the edges; company occupies traveling bands.
        addField(scene,-.035+Math.sin(drift)*amp*.19,.4+Math.cos(drift)*amp*.22,.34,.36,0,base);
        addField(scene,1.04+Math.cos(drift*.83)*amp*.18,.73+Math.sin(drift*.83)*amp*.2,.32,.38,1,base*.95);
        addField(scene,.58,.99+Math.sin(drift*.6)*amp*.1,.3,.22,2,base*.32);
      }
      break;
    case 'pass': {
      // Receipt is one soft local nod, with no rigid length or cross-screen pass.
      const bloom=Math.sin(Math.PI*p)**2,spread=bloom*amp;
      const x=.46+Math.sin(Math.PI*p)*amp*.035,y=.59-Math.sin(Math.PI*p)*amp*.065;
      restingFields(scene,phase,0,base*.43);
      addField(scene,x,y,.2+spread*.15,.22+spread*.15,0,base*.95*bloom);
      addField(scene,x+amp*.1,y+amp*.07,.23+spread*.13,.24+spread*.1,1,base*.6*bloom);
      addField(scene,x-amp*.07,y-amp*.06,.21+spread*.1,.23+spread*.12,2,base*.32*bloom);
      break;
    }
    case 'expand': {
      if(type==='encourage') {
        restingFields(scene,phase,0,base*.35);
        // Three connected rising stages support a next action, without ripples.
        const first=ease(p/.46),second=ease((p-.19)/.49),third=ease((p-.48)/.5);
        addField(scene,mix(.12,.25,first),mix(.87,.69,first),mix(.12,.24,first),.19,0,base*.95);
        addField(scene,mix(.24,.5,second),mix(.72,.48,second),.23,.19,1,base*.95*second);
        addField(scene,mix(.5,.76,third),mix(.5,.27,third),.22,.2,2,base*.95*third);
        addStroke(scene,.2,.75,mix(.2,.71,open),mix(.75,.32,open),.075,0,base*.32*open);
      } else if(type==='celebrate') {
        restingFields(scene,phase,0,base*.4);
        for(let i=0;i<3;i++) {
          const q=(p-i*.17)/.62;
          if(q>=0&&q<=1) addRing(scene,.45+i*.035,.52-i*.045,.02+ease(q)*.69,.1+i*.008,i,base*.82*Math.sin(Math.PI*q));
        }
      } else {
        restingFields(scene,phase,0,base*.42);
        addArc(scene,.1,.58,.035+open*.95,.14,-.08,0,base*1.15*Math.sin(Math.PI*p));
        addField(scene,.1,.58,.17+open*.21,.18+open*.19,1,base*.62*(1-open));
      }
      break;
    }
    case 'converge':
      if(type==='processing') {
        const orbit=clock*2.1+phase;
        const radius=amp*(.13+.095/.55);
        restingFields(scene,phase,0,base*.31);
        addField(scene,.49+Math.cos(orbit)*radius,.57+Math.sin(orbit)*radius*.75,.135,.13,0,base*1.12);
        addField(scene,.49+Math.cos(orbit+Math.PI)*radius,.57+Math.sin(orbit+Math.PI)*radius*.75,.115,.12,1,base*.92);
        addField(scene,.49,.57,.14,.13,2,base*.25);
      } else if(type==='complete') {
        for(let i=0;i<3;i++) {
          const gathered=ease((p-i*.07)/(1-i*.07));
          const origins=[[.12,.22],[.87,.3],[.5,.9]],dockX=.47+i*.035;
          addField(scene,mix(origins[i][0],dockX,gathered),mix(origins[i][1],.64,gathered),mix(.15,.29,gathered),mix(.17,.23,gathered),i,base*.85);
        }
        addField(scene,.52,.64,.32,.13,0,base*.4*ease((p-.62)/.38));
      } else {
        addField(scene,mix(.1,.37,open),.51,.23,.27,0,base);
        addField(scene,mix(.9,.63,open),.51,.23,.27,1,base);
        addStroke(scene,.35,.51,mix(.35,.65,ease((p-.35)/.5)),.51,.105,2,base*.95*ease((p-.35)/.5));
      }
      break;
    case 'separate':
      if(type==='farewell') {
        addField(scene,mix(.29,-.09,open),mix(.46,.37,open),mix(.32,.22,open),.42,0,base*(1-open*.4));
        addField(scene,mix(.71,1.09,open),mix(.65,.77,open),mix(.32,.22,open),.42,1,base*(1-open*.4));
      } else {
        addField(scene,mix(.43,.14,open),.51,mix(.13,.17,open),.36,0,base);
        addField(scene,mix(.57,.86,open),.51,mix(.13,.17,open),.36,1,base);
      }
      break;
    case 'alternate': {
      const left=pulse(p,.23,.17),right=pulse(p,.6,.17),end=ease((p-.78)/.22);
      addField(scene,.28,.45,.21,.31,0,base*(.22+left*.95+end*.28));
      addField(scene,.74,.64,.21,.31,1,base*(.22+right*.95+end*.28));
      break;
    }
    case 'blend':
      if(type==='empathize') {
        const connected=ease((p-.22)/.7);
        addField(scene,mix(.09,.33,connected),.62,mix(.22,.28,connected),.3,0,base*.95);
        addField(scene,mix(.91,.67,connected),.47,mix(.22,.28,connected),.3,1,base*.9);
        addStroke(scene,.27,.6,.73,.49,mix(.025,.12,connected),2,connected*base*.68);
      } else {
        restingFields(scene,phase,0,base*.78);
        addBand(scene,mix(-.22,1.62,open),.17,.65,2,base*1.15*Math.sin(Math.PI*p));
        addField(scene,mix(-.17,1.17,open),mix(.13,.88,open),.2,.23,0,base*.62*Math.sin(Math.PI*p));
      }
      break;
    case 'settle': {
      const movement=type==='withdraw' ? 1-ease(p) : type==='soothe' ? 1-ease(p/.86) : 1-ease(p/.72);
      // Integrated deceleration makes the path end without a snap back to zero.
      const integrated=1-(1-p)**3;
      const settledPhase=phase+integrated*amp*1.6;
      if(type==='soothe') {
        const irregular=Math.sin(clock*2.4+phase)*movement*amp*.2;
        addBand(scene,.27+irregular,.18+open*.025,-.32*movement+irregular,0,base*.95);
        addBand(scene,.79-irregular,.2,.3*movement-irregular,1,base*.9);
        addField(scene,.58+irregular,.55,.15,.14,2,base*.4*movement);
      } else if(type==='wait') {
        const gathered=ease(p/.8);
        addField(scene,mix(.16,.5,gathered),mix(.64,.58,gathered),mix(.19,.3,gathered),.29,0,base*1.05);
        addField(scene,mix(.85,.55,gathered),mix(.4,.58,gathered),.19,.23,1,base*.72*(1-gathered));
        addField(scene,.5,.58,.17,.17,0,base*.25*gathered);
      } else {
        addField(scene,.06+Math.sin(settledPhase)*amp*.2,.43+Math.cos(settledPhase)*amp*.2,.3,.39,0,base);
        addField(scene,.94+Math.cos(settledPhase*.83)*amp*.18,.72+Math.sin(settledPhase*.83)*amp*.18,.29,.39,1,base*.95);
        addField(scene,.57,.99,.29,.22,2,base*.32);
      }
      break;
    }
    case 'interrupt_return': {
      // A continuous light cloud hesitates and returns along a curved path.
      // Diffusion marks the pause without broken lines or an abrupt dark flash.
      const outward=ease(p/.4),returning=ease((p-.58)/.42),reach=outward*(1-returning);
      const hesitation=ease((p-.3)/.12)*(1-ease((p-.56)/.2));
      const x=.35+amp*.38*reach;
      const y=.6-amp*.22*reach-amp*.08*Math.sin(Math.PI*outward)*(1-returning)+amp*.06*Math.sin(Math.PI*returning);
      restingFields(scene,phase,0,base*.44);
      addField(scene,x,y,.21+amp*.1*hesitation,.23+amp*.08*hesitation,0,base*.95*(1-.22*hesitation));
      addField(scene,x-amp*.085,y+amp*.075,.25+amp*.08*hesitation,.26+amp*.07*hesitation,1,base*.56);
      addField(scene,x+amp*.065,y-amp*.055,.23,.25,2,base*.28);
      break;
    }
    case 'local_echo': {
      restingFields(scene,phase,0,base*.66);
      if(type==='notify') {
        const strength=pulse(p,.24,.12)+pulse(p,.62,.12);
        addRing(scene,.74,.49,.15+strength*.065,.075,0,base*1.1*strength);
        addField(scene,.74,.49,.11,.12,1,base*.38*strength);
      } else {
        const angle=TAU*ease(p),fade=Math.sin(Math.PI*p);
        const radius=amp*(.18+.05/.48);
        addField(scene,.7+Math.cos(angle)*radius,.61+Math.sin(angle)*radius,.145,.14,0,base*1.12*fade);
        addRing(scene,.7,.61,radius,.065,1,base*.35*fade);
      }
      break;
    }
    default: restingFields(scene,phase,0,base);
  }
  return scene;
}

// The final repertoire shares a soft field language, but each response has a
// different spatial and temporal structure. A manual primitive selection still
// uses primitiveScene; these compositions are the catalog's native gestures.
function processingAnchors(clock,phase,amp) {
  const turn=amp===0 ? 0 : clock*TAU/4,angle=phase+turn;
  const orbit=.18*Math.min(1.35,amp/.58);
  return [0,1].map(i=>({x:.5+Math.cos(angle+i*Math.PI)*orbit,y:.49+Math.sin(angle+i*Math.PI)*orbit}));
}

function responseScene({type,expression,p,clock,phase,amp,energy,speed,loop,accentIndices,primaryCount,feelingBalance,mixedMode,composition}) {
  const scene=[],base=.58+energy*.92,open=ease(p),finiteMotion=Math.sin(Math.PI*p)**2;
  const c=composition;
  switch(type) {
    case 'greet': {
      const emerge=ease(p/.38),breathe=Math.sin(clock*1.9+phase)*amp*.018*finiteMotion;
      const radius=.105+emerge*.105+breathe;
      addField(scene,.455+Math.sin(clock+phase)*amp*.024*finiteMotion,.435,radius,radius*1.16,0,base*(.38+emerge*.62));
      addField(scene,.555,.48+Math.cos(clock*.8+phase)*amp*.027*finiteMotion,radius*.96,radius*.91,1,base*.9*emerge);
      addField(scene,.49,.53,radius*1.15,radius*.7,2,base*.35*emerge);
      return scene;
    }
    case 'acknowledge': {
      // One listening cloud gives a gentle nod. Its two closely overlapping
      // color lobes are already the two lights that can separate into thinking.
      const nod=Math.sin(Math.PI*p)**2,spread=nod*amp*.07;
      const x=.5,y=.465-Math.sin(Math.PI*p)*amp*.028;
      addField(scene,x-.025,y,.205+spread,.225+spread,0,base*(.62+nod*.38));
      addField(scene,x+.035,y+.02,.205+spread,.21+spread,1,base*(.58+nod*.26));
      addField(scene,x,y+.025,.27+spread,.245+spread,2,base*.23);
      addRing(scene,x,y,.035+open*(.33+amp*.1),.095,1,base*.35*Math.sin(Math.PI*p));
      return scene;
    }
    case 'processing': {
      // Filled luminous clouds, with a soft center-to-edge gradient, share
      // one clear orbit. There are no ring outlines or hollow centers.
      const anchors=processingAnchors(clock,phase,amp);
      for(let i=0;i<anchors.length;i++) {
        const {x,y}=anchors[i],color=i===0?0:2;
        addField(scene,x,y,.182,.19,color,base*1.24);
        addField(scene,x-.018,y-.018,.115,.12,1,base*.48);
        addField(scene,x,y,.255,.26,color,base*.19);
      }
      return scene;
    }
    case 'clarify': {
      // Advance, visibly hesitate, retreat a little, then try a new opening.
      // The final quarter leaves an actual unmoving invitation to continue.
      const advance=ease(p/.26),retreat=ease((p-.4)/.13),other=ease((p-.53)/.22);
      const x=.43+amp*(advance*.21-retreat*.11-other*.13);
      const y=.57+amp*(-advance*.13+retreat*.075-other*.17);
      const radius=.17+amp*(advance*.035-retreat*.018+other*.025);
      addField(scene,x,y,radius,radius*1.09,0,base*.99);
      addField(scene,x-.025,y+.02,radius*.86,radius*.92,1,base*.49);
      addField(scene,x+.03,y-.02,radius*1.38,radius*1.3,2,base*.18);
      return scene;
    }
    case 'farewell': {
      const gather=ease(p/.64),ambient=ease((p-.58)/.42);
      addField(scene,mix(mix(.2,.47,gather),.04,ambient),mix(.4,.56,gather),mix(.25,.36,ambient),mix(.27,.39,ambient),0,base*.8);
      addField(scene,mix(mix(.8,.53,gather),.98,ambient),mix(.68,.56,gather),mix(.25,.35,ambient),mix(.27,.4,ambient),1,base*.75);
      addField(scene,.52,mix(.56,.92,ambient),.28,.2,2,base*(.3+.18*ambient));
      return scene;
    }
    case 'celebrate': {
      if(expression==='quiet') {
        const spread=ease(p/.86),drift=Math.sin(clock*.7+phase)*amp*.035*finiteMotion;
        addField(scene,.47+drift,.54-spread*.04,.14+spread*.28,.16+spread*.29,0,base*(.7+spread*.18));
        addField(scene,.59,.55,.13+spread*.24,.16+spread*.22,1,base*.68*spread);
        addField(scene,.42,.65,.16+spread*.19,.15+spread*.17,2,base*.42*spread);
      } else {
        const spread=ease(p/.64),life=1-ease((p-.57)/.27);
        addField(scene,.48,.54,.09+spread*.48,.11+spread*.49,0,base*.78*life);
        addField(scene,.58,.47,.12+spread*.34,.13+spread*.35,1,base*.55*spread*life);
        addField(scene,.4,.61,.12+spread*.36,.14+spread*.32,2,base*.46*spread*life);
        for(let i=0;i<c.rippleCount;i++) {
          const start=c.rippleCount===3?[.025,.16,.46][i]:.025+i*.435/Math.max(1,c.rippleCount-1);
          const entrance=.025+(start-.025)*c.stagger;
          const width=Math.min(c.rippleCount===3?[.55,.58,.35][i]:.55-i*.2/Math.max(1,c.rippleCount-1),.84-entrance);
          const q=(p-entrance)/width;
          if(q>=0&&q<=1)addRing(scene,.46+i*.028,.55-i*.035,(.025+ease(q)*(.55+amp*.2))*c.spread,
            (.075+i*.014)*c.waveWidth,i%3,base*.9*Math.sin(Math.PI*q));
        }
        // The expansion ends once. Independent pinpoint glimmers continue on
        // their own clocks; they never restart the warm opening or leave a wash.
        // Only caller-approved accent colors are used. A kept/named palette
        // supplies its own colors for the same closing gesture instead.
        const accents=accentIndices.length ? accentIndices : Array.from({length:Math.min(primaryCount,3)},(_,i)=>i);
        const anchors=[[.16,.24],[.72,.18],[.42,.75],[.82,.61],[.3,.43],[.64,.84],[.54,.34],[.16,.73],[.85,.37]];
        for(let i=0;i<anchors.length;i++) {
          const slot=i%accents.length;
          // Fade the warm field away before the second and third accent hues
          // enter, keeping no more than four colors active in the transition.
          const reveal=ease((p-(accentIndices.length&&slot>0 ? .84 : .72))/.13);
          const travel=clock*(.55+i*.037)+phase+i*1.73;
          const glimmer=(.5+.5*Math.sin(clock*(1.2+i*.13)+phase+i*2.41))**3;
          const x=anchors[i][0]+Math.sin(travel)*amp*.075;
          const y=anchors[i][1]+Math.cos(travel*.79+i)*amp*.065;
          const radius=(.042+amp*(.009+.009*Math.sin(travel*.61+i)))*c.accentScale;
          addField(scene,x,y,radius,radius*(1.1+.1*Math.cos(travel)*amp),accents[slot],base*(.2+1.85*(.38+amp*(glimmer-.38)))*reveal*c.accentWeight);
        }
      }
      return scene;
    }
    case 'setback': {
      const flow=clock*amp*1.35,bend=.065+amp*.07,fold=Math.sin(clock*.55+phase)*amp*.045;
      const renewal=expression==='renew',coolStart=.48+(c.supportDelay-.28);
      const coolLife=renewal?1-ease((p-coolStart)/Math.min(.4,1-coolStart)):1;
      const spots=renewal?0:ease((p-.34)/.22),waveLife=coolLife*(1-spots*.2);
      for(let i=0;i<c.waveCount;i++) {
        const y=c.waveCount===2?[.3,.7][i]:c.waveCount===1?.5:.17+i*.66/(c.waveCount-1);
        const direction=i%2===0?1:-1,color=i%2;
        addWave(scene,y+fold*direction,(i%2===0?.145:.16)*c.waveWidth,bend*(i%2===0?1:.85),
          phase+i*1.9,flow+i*.9,color,base*(i%2===0?.94:.9)*waveLife*(color===1?c.accentWeight:1));
      }
      addField(scene,.12,.61,.35,.28,0,base*.2*coolLife);
      if(!renewal) {
        // Diffused spots surface within the tide, bloom and disappear on
        // staggered clocks. A cycle changes position and size only while its
        // spot is invisible; the surrounding waves keep flowing throughout.
        const t=clock*(amp/.78);
        const anchors=[[.52,.39,.17,1],[.24,.68,.15,2],[.77,.27,.085,1],[.7,.65,.19,2],[.47,.78,.095,1],[.19,.35,.12,1],[.86,.79,.13,2]];
        for(const [i,[sx,sy,radius,color]] of anchors.slice(0,c.spotCount).entries()) {
          const cycle=t/((1.5+i*.13)*c.stagger)+phase/TAU+i*.287,round=Math.floor(cycle),q=cycle-round;
          const bloom=Math.sin(Math.PI*clamp(q/.8))**2;
          const variation=phase+i*2.3+round*2.399;
          const x=sx+Math.sin(variation)*amp*.08+Math.sin(t*.63+i)*amp*.025;
          const y=sy+Math.cos(variation*.87)*amp*.07+Math.cos(t*.57+i)*amp*.025;
          const size=radius*(.9+.15*Math.sin(variation))*(.78+.22*bloom)*c.accentScale;
          addField(scene,x,y,size,size*(1.08+.09*Math.cos(variation)),color,base*2.1*bloom*spots*c.accentWeight);
          addField(scene,x,y,size*1.65,size*1.75,color,base*.17*bloom*spots*c.accentWeight);
        }
      }
      if(expression==='renew') {
        // Gold gently enters the violet tide from the side, opens into warmth,
        // then leaves a quiet constellation. The opening never restarts.
        const warmth=ease((p-c.supportDelay)/.36),starStart=Math.max(.76,c.supportDelay+.36);
        const stars=ease((p-starStart)/Math.min(.22,1-starStart)),resident=1-stars*.88;
        const warmGain=c.supportStrength*c.accentWeight;
        const t=clock*amp*.9+phase;
        addVeil(scene,1.12-warmth*.63,.56+Math.sin(t*.43)*amp*.035,(.1+warmth*.55)*c.accentScale,(.13+warmth*.25)*c.accentScale,-.28,2,base*.92*warmth*resident*warmGain);
        addVeil(scene,.97-warmth*.43,.37+Math.cos(t*.37)*amp*.03,(.08+warmth*.36)*c.accentScale,(.11+warmth*.22)*c.accentScale,-.2,3,base*.54*warmth*resident*warmGain);
        for(const [i,[sx,sy]] of [[.20,.27],[.67,.22],[.82,.47],[.58,.66],[.29,.73],[.44,.40],[.15,.50]].entries()) {
          const glimmer=(.5+.5*Math.sin(t*(1.2+i*.11)+i*2.17))**3;
          const x=sx+Math.sin(t*.4+i)*amp*.018,y=sy+Math.cos(t*.36+i)*amp*.018;
          const radius=(.041+glimmer*amp*.019)*c.accentScale,color=2+i%2;
          addField(scene,x,y,radius,radius*1.08,color,base*(.18+2.1*(.3+amp*(glimmer-.3)))*stars*warmGain);
          addField(scene,x,y,radius*1.8,radius*1.9,color,base*.12*glimmer*stars*warmGain);
        }
      }
      return scene;
    }
    case 'rest': {
      // One sloping, spacious veil opens downward and eases into the lower
      // field. It does not repeat the two tidal folds of a difficult moment.
      const settle=loop ? 1 : 1-(1-p)**3;
      const drift=loop ? amp : amp*(1-settle),current=clock*.85+phase;
      const x=.48+Math.sin(current*.73)*drift*.055;
      const y=.26+settle*.48+Math.sin(current)*drift*.045;
      const tilt=.3-settle*.18+Math.sin(current*.67)*drift*.035;
      addVeil(scene,x,y,.63+settle*.1,(.17+settle*.17)*c.waveWidth,tilt,0,base*(.98-settle*.19));
      addVeil(scene,.14+settle*.1,.65+settle*.22,.5,(.26+settle*.09)*c.waveWidth,-.22+settle*.1,1,base*.48);
      addField(scene,.56,1.08,.65,.35,0,base*.24);
      if(expression==='fulfilled') {
        const warmth=loop ? 1 : ease((p-(.19+c.supportDelay-.28))/.58);
        const warmGain=c.supportStrength*c.accentWeight;
        addField(scene,.71,.47,.17*c.accentScale,.19*c.accentScale,2,base*.65*warmth*warmGain);
        addField(scene,.77,.5,.12*c.accentScale,.13*c.accentScale,3,base*.22*warmth*warmGain);
      }
      return scene;
    }
    case 'upcoming': {
      // Receive nervousness, then offer an opening and a steady warm breath.
      // The violet trembling eases as peach/gold rises from within the same
      // cloud. This is encouragement, rather than a prediction or celebration.
      const delay=c.supportDelay-.28,steadyStart=.5+delay;
      const enter=ease(p/.24),support=ease((p-(.2+delay))/.48),steady=ease((p-steadyStart)/Math.min(.4,1-steadyStart));
      const t=clock*(amp/.72),unsettled=amp*(1-steady);
      const wobble=Math.sin(t*3.7+phase)*unsettled*.045;
      const sway=Math.sin(t*.46+phase)*amp*.025;
      addVeil(scene,.43-support*.25+sway,.57-support*.18+wobble,.20+enter*.075,.25+enter*.04,
        -.24+wobble*2,0,base*(.9-support*.35));
      addVeil(scene,.57+support*.25+sway,.5+support*.08-wobble,.19+enter*.065,.23+enter*.055,
        .24-wobble*2,1,base*(.78-support*.3));
      const breath=.5-.5*Math.cos(t*1.65+phase),swell=amp*steady*breath;
      const x=.5+sway,y=.78-support*.27-swell*.045,warmGain=c.supportStrength*c.accentWeight;
      addVeil(scene,x-.035,y+.025,(.16+support*.18+swell*.13)*c.accentScale,(.15+support*.12+swell*.10)*c.accentScale,
        -.3,2,base*.92*support*(.82+steady*breath*.28)*warmGain);
      addVeil(scene,x+.045,y-.08,(.12+support*.15+swell*.11)*c.accentScale,(.15+support*.095+swell*.085)*c.accentScale,
        -.25,3,base*.7*support*(.9+steady*breath*.15)*warmGain);
      return scene;
    }
    case 'mixed': {
      // Reference D05: one airy diagonal cyan/aqua/pink/lime gradient. D04's
      // fragments become gently bending color ribbons with clean white gaps.
      // These continuous fields replace separate, heavily overlapping balls.
      const mode=['paired','layered','open'].includes(mixedMode)?mixedMode:'paired';
      const unfold=ease(p/.24),tail=1-.2*ease((p-.65)/.35);
      const t=clock*amp*.85+phase,motion=amp*tail;
      const breath=.94+Math.sin(t*.71)*motion*.065;
      scene.push({kind:'mixedGradient',mode,x:.49+Math.sin(t*.51)*motion*.035,y:.48+Math.cos(t*.43)*motion*.035,
        rx:(.26+.105*unfold)*breath,ry:(.25+.1*unfold)*breath,
        angle:mode==='layered' ? Math.sin(t*.19)*motion*.085 : .595+Math.sin(t*.23)*motion*.08,
        shift:mode==='open'?0:Math.sin(t*.79)*motion*.025,curve:Math.sin(t*.51)*motion*.065*c.waveWidth,weaveScale:c.waveWidth,
        colorTravel:clock*amp*.18,colorRipple:mode==='open'?0:motion*.12*c.waveWidth,
        flow:t,balance:mode==='open'?undefined:clamp(feelingBalance,.5,.9),color:0,region:0,
        strength:base*(.53+.29*unfold)*(mode==='layered'?.87:1)*(1+Math.sin(t*.67)*motion*.075)});
      if(mode==='layered')for(let i=0;i<3;i++) {
        const glimmer=(.5+.5*Math.sin(t*(.71+i*.17)+i*2.1*c.stagger))**4;
        const x=.18+i*.29+Math.sin(t*.61+i)*motion*.045,y=.22+i*.24+Math.cos(t*.47+i)*motion*.04;
        addField(scene,x,y,.025*c.accentScale,.028*c.accentScale,i%primaryCount,base*.65*glimmer*unfold*c.accentWeight);
        scene[scene.length-1].region=i;
      }
      return scene;
    }
    case 'everyday': {
      const nod=Math.sin(Math.PI*p)**2,travel=Math.sin(Math.PI*p)*amp*.045;
      // Three local warm echoes acknowledge the ordinary words once, then
      // yield to the two broad lights and their independent continuous paths.
      const resident=.2+.8*ease((p-.24)/.38);
      const echoes=[[.22,.3],[.76,.38],[.48,.76],[.19,.72],[.79,.77]];
      for(const [i,[x,y]] of echoes.slice(0,c.rippleCount).entries()) {
        const q=(p-.04-i*.09*c.stagger)/.4;
        if(q>=0&&q<=1) {
          const echo=Math.sin(Math.PI*q)**2,radius=.025+ease(q)*amp*.2;
          addField(scene,x,y,.065,.07,i,base*1.12*echo);
          addRing(scene,x,y,radius*c.spread,.038*c.waveWidth,i,base*.9*echo);
        }
      }
      const settle=ease((p-.35)/.6),flow=clock*(amp/.5),t=flow*2.1+phase;
      const breathA=Math.sin(t),breathB=Math.sin(t+.72);
      let wanderAX=.29+Math.sin(flow*.62+phase)*amp*.22;
      let wanderAY=.48+Math.sin(flow*.43+phase*.7+.4)*amp*.34;
      let wanderBX=.73+Math.sin(flow*.47+phase+2.4)*amp*.2;
      let wanderBY=.52+Math.sin(flow*.57+phase*.83+2.1)*amp*.34;
      const dx=wanderBX-wanderAX,dy=wanderBY-wanderAY,distance=Math.hypot(dx,dy);
      const space=Math.max(0,.46-distance)/2;
      wanderAX-=dx/distance*space;wanderAY-=dy/distance*space;
      wanderBX+=dx/distance*space;wanderBY+=dy/distance*space;
      const xA=mix(.47,wanderAX,settle),yA=mix(.57-travel,wanderAY,settle);
      const xB=mix(.56,wanderBX,settle),yB=mix(.59-travel*.6,wanderBY,settle);
      const radiusA=.18+nod*.075+settle*.11+breathA*amp*.045*settle;
      const radiusB=.17+nod*.055+settle*.105+breathB*amp*.04*settle;
      addField(scene,xA,yA,radiusA,radiusA+.01,0,base*(.55+nod*.25+breathA*amp*.16*settle)*resident);
      addField(scene,xB,yB,radiusB,radiusB,1,base*(.38+settle*.08+breathB*amp*.15*settle)*resident);
      addField(scene,mix(.51,xA,settle),mix(.64,yA,settle),.15,.13,2,base*.16*(1-settle)*resident);
      return scene;
    }
    default:return null;
  }
}

// A transition starts from the previous cloud locations, then grows into the
// incoming composition. Wave and band fields acquire their extended form as
// they unfold. Native standalone previews remain unchanged by this bridge.
function unfoldScene(scene,{anchors,progress},type) {
  const amount=ease(progress);
  for(const shape of scene) {
    const slot=type==='mixed' ? (shape.region??Math.floor(shape.color/2)) : shape.color;
    const anchor=anchors[slot%anchors.length];
    if(shape.kind==='field'||shape.kind==='mixedGradient') {
      shape.x=mix(anchor.x,shape.x,amount);shape.y=mix(anchor.y,shape.y,amount);
      shape.rx=mix(.17,shape.rx,amount);shape.ry=mix(.18,shape.ry,amount);
      if(shape.angle)shape.angle*=amount;
    } else if(shape.kind==='ring'||shape.kind==='arc') {
      shape.x=mix(anchor.x,shape.x,amount);shape.y=mix(anchor.y,shape.y,amount);
      shape.radius*=amount;shape.width=mix(.16,shape.width,amount);
    } else if(shape.kind==='wave'||shape.kind==='band') {
      shape.entry={x:mix(anchor.x,.5,amount),y:mix(anchor.y,shape.kind==='wave'?shape.y:shape.position,amount),
        rx:mix(.17,.75,amount),ry:mix(.18,shape.width,amount),amount:ease((amount-.25)/.75)};
    }
  }
}

/** accentColors contains up to three already preference-filtered closing hues. */
export function renderFrame(plan = {}, elapsedMs = 0, {reducedMotion=false,colors,accentColors=[],avoidedColors=[],handoff} = {}) {
  const defaults = CATALOG[plan.responseType] || CATALOG.idle;
  const type = CATALOG[plan.responseType] ? plan.responseType : 'idle';
  const duration=clamp(number(plan.durationMs,defaults.durationMs),400,20000);
  const elapsed=Math.max(0,number(elapsedMs,0));
  const loop=typeof plan.loop==='boolean' ? plan.loop : defaults.loop;
  const p=reducedMotion ? 1 : loop ? (elapsed%duration)/duration : clamp(elapsed/duration);
  const speed=clamp(number(plan.speed,defaults.speed),.05,2);
  const amp=clamp(number(plan.amplitude,defaults.amplitude));
  const energy=clamp(number(plan.energy,defaults.energy));
  const primitive=MOTION_PRIMITIVES.includes(plan.motionPrimitive) ? plan.motionPrimitive : defaults.motionPrimitive;
  const phase=phaseFor(number(plan.seed,0));
  // Ordinary finite motions hold their endpoint. Selected native responses
  // retain a continuing ambient tail while their finite opening runs only once.
  const ambientTail=hasAmbientTail({...plan,responseType:type,motionPrimitive:primitive,loop});
  const localTime=reducedMotion ? duration : loop||ambientTail ? elapsed : Math.min(elapsed,duration);
  const clock=localTime/1000*speed;
  const staticPrimitive=reducedMotion && ['slow_drift','pass','interrupt_return','local_echo'].includes(primitive)
    && !(type==='accompany'&&primitive==='slow_drift') ? 'hold' : primitive;
  const selected=Array.isArray(colors)&&colors.length ? colors : selectPalette(plan);
  const palette=selected.slice(0,4).map(color=>Array.from({length:3},(_,i)=>clamp(number(color?.[i],240),0,255)));
  const primaryCount=palette.length,accentIndices=[];
  if(type==='celebrate'&&Array.isArray(accentColors))for(const accent of accentColors.slice(0,3)) {
    accentIndices.push(palette.length);
    palette.push(Array.from({length:3},(_,i)=>clamp(number(accent?.[i],240),0,255)));
  }
  const avoidedSegments=type==='mixed'&&avoidedColors.length ? palette.map((a,i)=>{
    const b=palette[Math.min(i+1,palette.length-1)];
    return Array.from({length:31},(_,j)=>(j+1)/32).some(p=>avoidedColors.includes(colorGroup(a.map((channel,c)=>mix(channel,b[c],p)))));
  }) : [];
  const native=primitive===defaults.motionPrimitive;
  const composition=normalizeComposition(plan.composition);
  const composed=native ? responseScene({type,expression:plan.expression||'default',p,clock,phase,amp,energy,speed,loop,accentIndices,primaryCount,feelingBalance:number(plan.feelingBalance,.7),mixedMode:plan.mixedMode,composition}) : null;
  if(composed&&['celebrate','setback','rest','upcoming','mixed','everyday'].includes(type))adaptSceneGeometry(composed,composition);
  const scene=composed||primitiveScene(staticPrimitive,{p,clock,phase,amp,energy,type});
  const luminousJoin=Boolean(composed)&&(type==='upcoming'||type==='setback'&&plan.expression==='renew');
  // Complementary regions keep the stronger local hue instead of producing a
  // broad muddy RGB average. Coverage still uses the original soft fields.
  const separateHues=Boolean(composed)&&(type==='setback'||type==='rest'&&plan.expression==='fulfilled');
  // Seed shifts a scene's origin without changing its recognizable gesture.
  // Duration controls the finite gesture; speed controls its bounded local flow.
  // The flow envelope is zero at both endpoints, so it cannot postpone settling.
  const sway=!composed&&!loop&&staticPrimitive!=='hold' ? Math.sin(Math.PI*p)**2*amp*.038 : 0;
  const originX=Math.sin(phase)*.055,originY=Math.cos(phase*.79)*.045;
  const flowX=Math.sin(clock*1.55+phase)*sway,flowY=Math.cos(clock*1.3+phase)*sway*.8;
  for(const shape of scene) {
    if(shape.kind==='band')shape.position+=originY+flowY;
    else {
      shape.x+=originX+flowX;shape.y+=originY+flowY;
      if(shape.kind==='stroke'){shape.x2+=originX+flowX;shape.y2+=originY+flowY;}
    }
  }
  if(composed&&handoff&&!reducedMotion&&Array.isArray(handoff.anchors)&&handoff.anchors.length&&handoff.progress<1)unfoldScene(scene,handoff,type);
  const frame=new Uint8ClampedArray(LED_SIZE*LED_SIZE*3);
  for(let y=0;y<LED_SIZE;y++) for(let x=0;x<LED_SIZE;x++) {
    const nx=(x+.5)/LED_SIZE,ny=(y+.5)/LED_SIZE;
    let total=0,colorTotal=0,r=0,g=0,b=0;
    let coolWeight=0,warmWeight=0,coolR=0,coolG=0,coolB=0,warmR=0,warmG=0,warmB=0;
    const regionWeights=[0,0,0];
    for(const shape of scene) {
      let weight,color;
      if(shape.kind==='field') weight=gaussian(nx,ny,shape);
      else if(shape.kind==='mixedGradient') {
        const dx=nx-shape.x,dy=ny-shape.y,cos=Math.cos(shape.angle),sin=Math.sin(shape.angle);
        const u=dx*cos+dy*sin,v=-dx*sin+dy*cos;
        const bend=Math.sin(v*6+shape.flow)*shape.curve;
        const radius=((u+bend)/shape.rx)**2+(v/shape.ry)**2;
        if(shape.mode==='layered') {
          const crest=.5+.5*Math.cos((u+bend)/(.29*3*(shape.weaveScale??1))*TAU-shape.flow*.55);
          weight=crest**2.2*Math.exp(-((v/(shape.ry*2.7))**4)*.2);
        } else weight=Math.exp(-(radius**1.13)*.8);
        color=gradientColor(palette,(u+bend)/(shape.mode==='layered'?.73:shape.mode==='open'?.74:.89)+.5+shape.shift,shape.balance,avoidedSegments,
          {travel:shape.colorTravel,ripple:shape.colorRipple,cycle:shape.mode==='open'});
      }
      else if(shape.kind==='ring'||shape.kind==='arc') {
        weight=Math.exp(-(((Math.hypot(nx-shape.x,ny-shape.y)-shape.radius)/shape.width)**2)*1.6);
        if(shape.kind==='arc')weight*=ease((Math.cos(Math.atan2(ny-shape.y,nx-shape.x)-shape.direction)+.25)/1.25);
      } else if(shape.kind==='stroke') {
        const dx=shape.x2-shape.x,dy=shape.y2-shape.y;
        const along=clamp(((nx-shape.x)*dx+(ny-shape.y)*dy)/(dx*dx+dy*dy||1));
        const distance=Math.hypot(nx-(shape.x+along*dx),ny-(shape.y+along*dy));
        weight=Math.exp(-((distance/shape.width)**2)*1.6);
      } else if(shape.kind==='wave') {
        const along=nx-shape.x,main=along*TAU*.8+shape.phase*.3-shape.flow;
        const crest=along*TAU*1.5+shape.phase-shape.flow;
        const center=shape.y+Math.sin(main)*shape.bend+Math.sin(crest)*.032;
        const slope=Math.cos(main)*TAU*.8*shape.bend+Math.cos(crest)*TAU*1.5*.032;
        const distance=(ny-center)/Math.sqrt(1+slope*slope);
        weight=Math.exp(-((distance/shape.width)**2)*1.6);
      } else {
        const distance=ny*Math.cos(shape.angle)+nx*Math.sin(shape.angle)-shape.position;
        weight=Math.exp(-((distance/shape.width)**2)*1.6);
      }
      if(shape.entry)weight=mix(gaussian(nx,ny,shape.entry),weight,shape.entry.amount);
      weight*=Math.max(0,shape.strength);
      color??=palette[shape.color%palette.length];
      // A tiny glimmer must not reintroduce a declined intermediate hue when
      // it overlays a different allowed ribbon. White retains that ribbon hue.
      if(composed&&type==='mixed'&&avoidedColors.length&&shape.kind==='field')color=[255,255,255];
      const colorWeight=separateHues ? weight*weight : composed&&type==='mixed' ? weight**1.35 : weight;
      total+=weight;colorTotal+=colorWeight;r+=color[0]*colorWeight;g+=color[1]*colorWeight;b+=color[2]*colorWeight;
      if(luminousJoin) {
        if(shape.color<2){coolWeight+=colorWeight;coolR+=color[0]*colorWeight;coolG+=color[1]*colorWeight;coolB+=color[2]*colorWeight;}
        else {warmWeight+=colorWeight;warmR+=color[0]*colorWeight;warmG+=color[1]*colorWeight;warmB+=color[2]*colorWeight;}
      }
      if(composed&&type==='mixed')regionWeights[shape.region??(shape.color<2?0:1)]+=weight;
    }
    let coverage=1-Math.exp(-total*1.3);
    if(luminousJoin&&coolWeight>1e-12&&warmWeight>1e-12) {
      const cool=[coolR/coolWeight,coolG/coolWeight,coolB/coolWeight];
      const warm=[warmR/warmWeight,warmG/warmWeight,warmB/warmWeight];
      const shoulder=ease((Math.hypot(...cool.map((channel,i)=>channel-warm[i]))-20)/60);
      if(shoulder>0) {
        // Violet and gold meet through a luminous white shoulder rather than
        // a gray/beige RGB average. All hues still come from the chosen palette.
        const share=warmWeight/(coolWeight+warmWeight),color=share<.5?cool:warm;
        const presence=Math.abs(share*2-1);
        r=mix(r,mix(255,color[0],presence)*colorTotal,shoulder);
        g=mix(g,mix(255,color[1],presence)*colorTotal,shoulder);
        b=mix(b,mix(255,color[2],presence)*colorTotal,shoulder);
      }
    }
    const regionTotal=regionWeights.reduce((sum,value)=>sum+value,0);
    if(regionTotal) {
      // A light shoulder lets distinct colors touch without a dark RGB seam.
      // The same rule supports two or three regions; it does not invent a hue.
      const largest=Math.max(...regionWeights)/regionTotal;
      const contact=clamp((1-largest)*2);
      coverage*=1-contact**3*.3;
    }
    const index=(y*LED_SIZE+x)*3;
    const emitted=[colorTotal?mix(255,r/colorTotal,coverage):255,
      colorTotal?mix(255,g/colorTotal,coverage):255,colorTotal?mix(255,b/colorTotal,coverage):255];
    const output=avoidedColors.length?respectDeclinedHues(emitted,avoidedColors):emitted;
    frame[index]=output[0];frame[index+1]=output[1];frame[index+2]=output[2];
    if(avoidedColors.length) {
      // Uint8 rounding can move a nearly neutral shoulder pixel back across a
      // hue boundary. Leave a small chroma margin in the actual emitted bytes.
      const emitted=[frame[index],frame[index+1],frame[index+2]],group=colorGroup(emitted);
      if(group!=='neutral'&&avoidedColors.includes(group)) {
        const keep=12/(Math.max(...emitted)-Math.min(...emitted));
        for(let channel=0;channel<3;channel++)frame[index+channel]=mix(255,emitted[channel],keep);
      }
    }
  }
  return frame;
}

/** The voice field is real matrix data, using the same white-ground diffusion. */
export function renderVoiceFrame(level=0,elapsedMs=0,{reducedMotion=false}={}) {
  const energy=clamp(number(level,0)),time=Math.max(0,number(elapsedMs,0))/1000;
  // This slow drift is an ambient gesture, separate from microphone amplitude.
  // Offset ellipses exchange blue, turquoise, and mint rather than outlining an orb.
  const phase=reducedMotion ? 0 : time*TAU/10;
  const radius=reducedMotion ? .22 : .22+energy*.08;
  const gain=1.1+energy*.7;
  const scene=[
    {x:.445+Math.sin(phase)*.026,y:.375+Math.cos(phase)*.018,
      rx:radius*(1+.13*Math.sin(phase+.4)),ry:radius*(1.1+.12*Math.cos(phase+.9)),color:[108,170,253],strength:gain},
    {x:.56+Math.cos(phase+.7)*.025,y:.42+Math.sin(phase+1.1)*.022,
      rx:radius*(.96+.12*Math.cos(phase+1.2)),ry:radius*(.95+.14*Math.sin(phase+.5)),color:[116,230,166],strength:gain*1.05},
    {x:.49+Math.sin(phase+2)*.024,y:.46+Math.cos(phase+1.5)*.016,
      rx:radius*(1.08+.1*Math.sin(phase+1.6)),ry:radius*(.72+.09*Math.cos(phase)),color:[108,220,230],strength:gain*.44},
    {x:.51,y:.405,rx:radius*1.4,ry:radius*1.3,color:[181,242,225],strength:gain*.35}
  ];
  const frame=new Uint8ClampedArray(LED_SIZE*LED_SIZE*3);
  for(let y=0;y<LED_SIZE;y++)for(let x=0;x<LED_SIZE;x++) {
    const nx=(x+.5)/LED_SIZE,ny=(y+.5)/LED_SIZE;
    let total=0,r=0,g=0,b=0;
    for(const field of scene) {
      const weight=gaussian(nx,ny,field)*field.strength;
      total+=weight;r+=field.color[0]*weight;g+=field.color[1]*weight;b+=field.color[2]*weight;
    }
    const coverage=1-Math.exp(-total*1.3),index=(y*LED_SIZE+x)*3;
    frame[index]=total ? mix(255,r/total,coverage) : 255;
    frame[index+1]=total ? mix(255,g/total,coverage) : 255;
    frame[index+2]=total ? mix(255,b/total,coverage) : 255;
  }
  return frame;
}

/** Owns one cancellable RAF. The 16×16 RGB frame is the only light source. */
export class LightRenderer {
  constructor(canvas,{gridCanvas,onComplete,onFrame}={}) {
    if(!canvas?.getContext) throw new TypeError('A canvas is required.');
    this.canvas=canvas;this.gridCanvas=gridCanvas;this.onComplete=onComplete;this.onFrame=onFrame;
    this.context=canvas.getContext('2d',{alpha:false});
    this.gridContext=gridCanvas?.getContext('2d',{alpha:false});
    this.source=document.createElement('canvas');this.source.width=LED_SIZE;this.source.height=LED_SIZE;
    this.sourceContext=this.source.getContext('2d',{alpha:false});
    this._plan=null;this._elapsed=0;this._frame=new Uint8ClampedArray(LED_SIZE*LED_SIZE*3).fill(255);
    this._paused=false;this._reducedMotion=false;this._grid=false;this._destroyed=false;
    this._lastNow=null;this._raf=null;this._transition=null;this._pending=null;this._completed=false;
    this._voiceActive=false;this._voiceLevel=0;this._voiceElapsed=0;this._voiceDirty=false;this._pendingVoice=null;this._redrawOnResume=false;
    this._tick=this._tick.bind(this);
    this._resize=()=>{this._measure();this._paint();};
    this._visibility=()=>{this._lastNow=null;if(document.hidden)this._cancel();else this._schedule();};
    this._observer=typeof ResizeObserver!=='undefined' ? new ResizeObserver(this._resize) : null;
    this._observer?.observe(canvas);if(gridCanvas)this._observer?.observe(gridCanvas);
    window.addEventListener('resize',this._resize,{passive:true});
    document.addEventListener('visibilitychange',this._visibility);
    this._measure();this._paint();
  }
  get plan(){return this._pending?.plan||this._plan;}
  get elapsedMs(){return this._elapsed;}
  get frame(){return this._frame;}
  get paused(){return this._paused;}
  setPlan(plan,{colors,accentColors=[],avoidedColors=[],preserveProgress=false}={}) {
    if(this._destroyed)return;
    const next={plan,colors:colors?.map(color=>[...color]),accentColors:accentColors.map(color=>[...color]),avoidedColors:[...avoidedColors],preserveProgress};
    if(this._paused){this._pending=next;return;}
    this._applyPlan(next);this._schedule();
  }
  _applyPlan({plan,colors,accentColors=[],avoidedColors=[],preserveProgress=false},{paint=true}={}) {
    const prior=this._plan,from=this._frame.slice(),priorElapsed=this._elapsed;
    const priorColors=this._colors,priorAccents=this._accentColors,priorAvoided=this._avoidedColors;
    this._plan=plan;this._colors=colors;this._accentColors=accentColors;this._avoidedColors=avoidedColors;this._elapsed=preserveProgress&&prior ? this._elapsed : 0;
    this._completed=false;
    // A plan may arrive while Dino is listening. Keep its new timeline pending
    // beneath the voice field, without replacing that field or its entry fade.
    if(this._voiceActive)return;
    this._lastNow=null;
    const voiceExit=Boolean(this._transition?.voice);
    const duration=voiceExit ? 450 : this._reducedMotion ? 0 : clamp(number(plan.transitionMs,1500),0,5000);
    const fromType=voiceExit ? 'voice' : prior?.responseType;
    const flowing=['voice','greet','acknowledge','processing'].includes(fromType)
      &&['acknowledge','processing','clarify','farewell','celebrate','setback','rest','upcoming','mixed','everyday'].includes(plan.responseType)
      &&plan.motionPrimitive===CATALOG[plan.responseType]?.motionPrimitive&&!preserveProgress;
    let source;
    if(flowing) {
      const phase=phaseFor(number(prior?.seed,0)),amp=clamp(number(prior?.amplitude,.58));
      const offset={x:Math.sin(phase)*.055,y:Math.cos(phase*.79)*.045};
      const anchors=fromType==='processing'
        ? processingAnchors(priorElapsed/1000*number(prior?.speed,.9),phase,amp).map(point=>({x:point.x+offset.x,y:point.y+offset.y}))
        : [{x:.475+(voiceExit?0:offset.x),y:.45+(voiceExit?0:offset.y)},{x:.535+(voiceExit?0:offset.x),y:.475+(voiceExit?0:offset.y)}];
      source={plan:prior,elapsed:priorElapsed,colors:priorColors,accentColors:priorAccents,avoidedColors:priorAvoided,anchors,voice:voiceExit,voiceElapsed:this._voiceElapsed,voiceLevel:this._voiceLevel};
    }
    this._transition=(prior||voiceExit)&&duration>0 ? {from,duration,elapsed:0,...(voiceExit?{voice:true}:{}),...(source?{source}:{})} : null;
    if(paint){this._compose();this._paint();}
  }
  setVoiceInput({active=false,level=0}={}) {
    if(this._destroyed)return;
    const next={active:Boolean(active),level:active ? clamp(number(level,0)) : 0};
    const current=this._pendingVoice||{active:this._voiceActive,level:this._voiceLevel};
    // Standby still measures the microphone. It must not repaint or restart a
    // settled lamp when the voice field itself is inactive.
    if(next.active===current.active&&next.level===current.level)return;
    if(this._paused){this._pendingVoice=next;return;}
    this._applyVoiceInput(next);this._schedule();
  }
  _applyVoiceInput({active,level}) {
    if(active!==this._voiceActive) {
      this._transition={from:this._frame.slice(),duration:450,elapsed:0,voice:true};
      this._lastNow=null;
      if(active)this._voiceElapsed=0;
    }
    this._voiceActive=active;this._voiceLevel=level;this._voiceDirty=true;
  }
  setPaused(value) {
    const paused=Boolean(value);if(paused===this._paused||this._destroyed)return;
    this._paused=paused;this._lastNow=null;
    if(paused){this._cancel();return;}
    const pending=this._pending,pendingVoice=this._pendingVoice;this._pending=this._pendingVoice=null;
    if(pending)this._applyPlan(pending,{paint:false});
    if(pendingVoice)this._applyVoiceInput(pendingVoice);
    if(pending||pendingVoice||this._redrawOnResume){this._redrawOnResume=false;this._compose();this._paint();}
    this._schedule();
  }
  setReducedMotion(value) {
    const reduced=Boolean(value);if(reduced===this._reducedMotion)return;
    this._reducedMotion=reduced;
    if(this._paused){this._redrawOnResume=true;return;}
    if(!this._voiceActive&&!this._transition?.voice)this._transition=null;
    this._compose();this._paint();this._schedule();
  }
  setGrid(value){this._grid=Boolean(value);this._paint();}
  _measure() {
    const ratio=Math.min(window.devicePixelRatio||1,1.75);
    for(const target of [this.canvas,this.gridCanvas]) {
      if(!target)continue;
      const rect=target.getBoundingClientRect();
      const width=Math.max(1,Math.round(rect.width*ratio)),height=Math.max(1,Math.round(rect.height*ratio));
      if(target.width!==width)target.width=width;
      if(target.height!==height)target.height=height;
    }
  }
  _compose() {
    if(!this._plan&&!this._voiceActive&&!this._transition)return;
    const transition=this._transition;
    const progress=transition ? ease(transition.elapsed/transition.duration) : 1;
    const handoff=transition?.source&&!this._voiceActive ? {anchors:transition.source.anchors,progress} : undefined;
    const target=this._voiceActive ? renderVoiceFrame(this._voiceLevel,this._voiceElapsed,{reducedMotion:this._reducedMotion})
      : this._plan ? renderFrame(this._plan,this._elapsed,{reducedMotion:this._reducedMotion,colors:this._colors,accentColors:this._accentColors,avoidedColors:this._avoidedColors,handoff})
        : new Uint8ClampedArray(LED_SIZE*LED_SIZE*3).fill(255);
    if(transition) {
      let source=transition.from;
      if(transition.source&&!this._reducedMotion&&!this._voiceActive) {
        const state=transition.source;
        const live=state.voice ? renderVoiceFrame(state.voiceLevel,state.voiceElapsed+transition.elapsed)
          : renderFrame(state.plan,state.elapsed+transition.elapsed,{colors:state.colors,accentColors:state.accentColors,avoidedColors:state.avoidedColors});
        // Keep the exact displayed first frame even if a network result arrives
        // during an earlier handoff; then let its outgoing light keep moving.
        const release=ease(transition.elapsed/180);
        source=live.map((value,index)=>mix(transition.from[index],value,release));
      }
      this._frame=target.map((value,index)=>mix(source[index],value,progress));
      if(progress>=1)this._transition=null;
    } else this._frame=target;
    this._voiceDirty=false;
  }
  _paint() {
    if(!this.context)return;
    const pixels=this.sourceContext.createImageData(LED_SIZE,LED_SIZE);
    for(let i=0;i<LED_SIZE*LED_SIZE;i++) {
      pixels.data[i*4]=this._frame[i*3];pixels.data[i*4+1]=this._frame[i*3+1];pixels.data[i*4+2]=this._frame[i*3+2];pixels.data[i*4+3]=255;
    }
    this.sourceContext.putImageData(pixels,0,0);
    const ctx=this.context,w=this.canvas.width,h=this.canvas.height;
    ctx.filter='none';ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
    if(this._grid)this._paintGrid(ctx,w,h);
    else {
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
      const blur=Math.min(w,h)*.017;
      ctx.filter=`blur(${blur}px)`;
      ctx.drawImage(this.source,-blur*2,-blur*2,w+blur*4,h+blur*4);
      ctx.filter='none';
    }
    if(this.gridContext&&this.gridCanvas.width>1)this._paintGrid(this.gridContext,this.gridCanvas.width,this.gridCanvas.height);
    this.onFrame?.(this._frame,this._elapsed);
  }
  _paintGrid(ctx,w,h) {
    ctx.filter='none';ctx.imageSmoothingEnabled=false;
    ctx.drawImage(this.source,0,0,w,h);
    ctx.strokeStyle='rgba(52,40,68,.09)';ctx.lineWidth=Math.max(1,w/450);
    ctx.beginPath();for(let i=1;i<LED_SIZE;i++){ctx.moveTo(i*w/LED_SIZE,0);ctx.lineTo(i*w/LED_SIZE,h);ctx.moveTo(0,i*h/LED_SIZE);ctx.lineTo(w,i*h/LED_SIZE);}ctx.stroke();
  }
  _tick(now) {
    this._raf=null;if(this._destroyed||this._paused||document.hidden||(!this._plan&&!this._voiceActive&&!this._transition))return;
    // Hidden time and paused time are excluded; ordinary elapsed time is absolute.
    const delta=this._lastNow===null ? 0 : Math.max(0,now-this._lastNow);this._lastNow=now;
    if(this._voiceActive)this._voiceElapsed+=delta;else this._elapsed+=delta;
    if(this._transition)this._transition.elapsed+=delta;
    this._compose();this._paint();
    if(!this._voiceActive&&this._plan&&!this._plan.loop&&!this._completed&&this._elapsed>=number(this._plan.durationMs,2000)) {
      this._completed=true;const completedPlan=this._plan;this.onComplete?.(completedPlan);
    }
    this._schedule();
  }
  _schedule(){
    if(this._raf!==null||this._destroyed||this._paused||document.hidden)return;
    if(this._voiceActive) {
      if(!this._transition&&!this._voiceDirty&&this._reducedMotion)return;
      this._raf=requestAnimationFrame(this._tick);return;
    }
    if(!this._plan&&!this._transition)return;
    // A settled finite scene and a static/reduced-motion loop need no redraws.
    // Finite reduced-motion scenes still run their lifecycle completion clock.
    const isLoop=Boolean(this._plan?.loop);
    const ambientTail=this._plan&&hasAmbientTail(this._plan)&&!this._reducedMotion;
    if(!this._transition&&(!this._plan||(!isLoop&&this._completed&&!ambientTail)||(isLoop&&(this._reducedMotion||this._plan.motionPrimitive==='hold'))))return;
    this._raf=requestAnimationFrame(this._tick);
  }
  _cancel(){if(this._raf!==null){cancelAnimationFrame(this._raf);this._raf=null;}}
  destroy(){this._destroyed=true;this._cancel();this._observer?.disconnect();window.removeEventListener('resize',this._resize);document.removeEventListener('visibilitychange',this._visibility);this._pending=this._pendingVoice=null;this._voiceActive=false;this._voiceDirty=false;}
}
