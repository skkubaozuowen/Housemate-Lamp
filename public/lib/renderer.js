import {CATALOG, MOTION_PRIMITIVES} from './catalog.js';
import {selectPalette} from './palettes.js';

export const LED_SIZE = 16;
const TAU = Math.PI * 2;
const clamp = (value,min=0,max=1) => Math.min(max,Math.max(min,value));
const number = (value,fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const ease = value => { const p=clamp(value); return p*p*(3-2*p); };
const mix = (a,b,p) => a+(b-a)*p;
const pulse = (p,center,width) => Math.exp(-(((p-center)/width)**2));
const phaseFor = seed => ((Math.imul((seed>>>0)^0x9e3779b9,1664525)>>>0)/4294967296)*TAU;
const gaussian = (x,y,shape) => Math.exp(-(((x-shape.x)/shape.rx)**2+((y-shape.y)/shape.ry)**2)*1.9);

function addField(scene,x,y,rx,ry,color,strength=1) { scene.push({kind:'field',x,y,rx,ry,color,strength}); }
function addRing(scene,x,y,radius,width,color,strength=1) { scene.push({kind:'ring',x,y,radius,width,color,strength}); }
function addBand(scene,position,width,angle,color,strength=1) { scene.push({kind:'band',position,width,angle,color,strength}); }
function addArc(scene,x,y,radius,width,direction,color,strength=1) { scene.push({kind:'arc',x,y,radius,width,direction,color,strength}); }
function addStroke(scene,x,y,x2,y2,width,color,strength=1) { scene.push({kind:'stroke',x,y,x2,y2,width,color,strength}); }

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
        const breath=(Math.sin(clock*.75+phase)+1)/2*(amp/.62);
        addBand(scene,.17+Math.sin(drift*.9)*amp*.28,.18+breath*.035,-.22,0,base*.88);
        addBand(scene,.86+Math.sin(drift*.9+2.1)*amp*.25,.22-breath*.025,-.22,1,base*.83);
        addField(scene,.58,.98,.4,.21,2,base*.32);
      } else {
        // Availability wanders at the edges; company occupies traveling bands.
        addField(scene,-.035+Math.sin(drift)*amp*.19,.4+Math.cos(drift)*amp*.22,.34,.36,0,base);
        addField(scene,1.04+Math.cos(drift*.83)*amp*.18,.73+Math.sin(drift*.83)*amp*.2,.32,.38,1,base*.95);
        addField(scene,.58,.99+Math.sin(drift*.6)*amp*.1,.3,.22,2,base*.32);
      }
      break;
    case 'pass':
      restingFields(scene,phase,0,base*.38);
      addStroke(scene,mix(-.4,1.18,open),.62,mix(-.16,1.42,open),.56,.105,0,base*1.05*Math.sin(Math.PI*p));
      addField(scene,mix(-.34,1.24,open),.63,.16,.1,1,base*.45*Math.sin(Math.PI*p));
      break;
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
      restingFields(scene,phase,0,base*.38);
      let x,strength=1;
      if(p<.36) x=mix(.1,.79,ease(p/.36));
      else if(p<.5) {x=.79;strength=.16;}
      else x=mix(.79,.13,ease((p-.5)/.5));
      addField(scene,x,.55,.16,.15,0,base*1.1*strength);
      if(p>=.36&&p<.5) {
        addStroke(scene,.28,.56,.43,.56,.065,1,base*.55);
        addStroke(scene,.63,.56,.77,.56,.065,1,base*.55);
      } else addStroke(scene,clamp(x-.24,.08,.78),.56,x,.56,.065,1,base*.65);
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

export function renderFrame(plan = {}, elapsedMs = 0, {reducedMotion=false,colors} = {}) {
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
  // Finite motions stay at their endpoint even if the parent retains the plan.
  const localTime=reducedMotion ? duration : loop ? elapsed : Math.min(elapsed,duration);
  const clock=localTime/1000*speed;
  const staticPrimitive=reducedMotion && ['slow_drift','pass','interrupt_return','local_echo'].includes(primitive) ? 'hold' : primitive;
  const scene=primitiveScene(staticPrimitive,{p,clock,phase,amp,energy,type});
  // Seed shifts a scene's origin without changing its recognizable gesture.
  // Duration controls the finite gesture; speed controls its bounded local flow.
  // The flow envelope is zero at both endpoints, so it cannot postpone settling.
  const sway=!loop&&staticPrimitive!=='hold' ? Math.sin(Math.PI*p)**2*amp*.038 : 0;
  const originX=Math.sin(phase)*.055,originY=Math.cos(phase*.79)*.045;
  const flowX=Math.sin(clock*1.55+phase)*sway,flowY=Math.cos(clock*1.3+phase)*sway*.8;
  for(const shape of scene) {
    if(shape.kind==='band')shape.position+=originY+flowY;
    else {
      shape.x+=originX+flowX;shape.y+=originY+flowY;
      if(shape.kind==='stroke'){shape.x2+=originX+flowX;shape.y2+=originY+flowY;}
    }
  }
  const selected=Array.isArray(colors)&&colors.length ? colors : selectPalette(plan);
  const palette=selected.slice(0,4).map(color=>Array.from({length:3},(_,i)=>clamp(number(color?.[i],240),0,255)));
  const frame=new Uint8ClampedArray(LED_SIZE*LED_SIZE*3);
  for(let y=0;y<LED_SIZE;y++) for(let x=0;x<LED_SIZE;x++) {
    const nx=(x+.5)/LED_SIZE,ny=(y+.5)/LED_SIZE;
    let total=0,r=0,g=0,b=0;
    for(const shape of scene) {
      let weight;
      if(shape.kind==='field') weight=gaussian(nx,ny,shape);
      else if(shape.kind==='ring'||shape.kind==='arc') {
        weight=Math.exp(-(((Math.hypot(nx-shape.x,ny-shape.y)-shape.radius)/shape.width)**2)*1.6);
        if(shape.kind==='arc')weight*=ease((Math.cos(Math.atan2(ny-shape.y,nx-shape.x)-shape.direction)+.25)/1.25);
      } else if(shape.kind==='stroke') {
        const dx=shape.x2-shape.x,dy=shape.y2-shape.y;
        const along=clamp(((nx-shape.x)*dx+(ny-shape.y)*dy)/(dx*dx+dy*dy||1));
        const distance=Math.hypot(nx-(shape.x+along*dx),ny-(shape.y+along*dy));
        weight=Math.exp(-((distance/shape.width)**2)*1.6);
      } else {
        const distance=ny*Math.cos(shape.angle)+nx*Math.sin(shape.angle)-shape.position;
        weight=Math.exp(-((distance/shape.width)**2)*1.6);
      }
      weight*=Math.max(0,shape.strength);
      const color=palette[shape.color%palette.length];
      total+=weight;r+=color[0]*weight;g+=color[1]*weight;b+=color[2]*weight;
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
  setPlan(plan,{colors,preserveProgress=false}={}) {
    if(this._destroyed)return;
    const next={plan,colors:colors?.map(color=>[...color]),preserveProgress};
    if(this._paused){this._pending=next;return;}
    this._applyPlan(next);this._schedule();
  }
  _applyPlan({plan,colors,preserveProgress=false}) {
    const prior=this._plan,from=this._frame.slice();
    this._plan=plan;this._colors=colors;this._elapsed=preserveProgress&&prior ? this._elapsed : 0;
    this._completed=false;this._lastNow=null;
    const duration=this._reducedMotion ? 0 : clamp(number(plan.transitionMs,1500),0,5000);
    this._transition=prior&&duration>0 ? {from,duration,elapsed:0} : null;
    this._compose();this._paint();
  }
  setPaused(value) {
    const paused=Boolean(value);if(paused===this._paused||this._destroyed)return;
    this._paused=paused;this._lastNow=null;
    if(paused){this._cancel();return;}
    if(this._pending){const pending=this._pending;this._pending=null;this._applyPlan(pending);}
    this._schedule();
  }
  setReducedMotion(value) {
    const reduced=Boolean(value);if(reduced===this._reducedMotion)return;
    this._reducedMotion=reduced;
    if(!this._paused){this._transition=null;this._compose();this._paint();this._schedule();}
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
    if(!this._plan)return;
    const target=renderFrame(this._plan,this._elapsed,{reducedMotion:this._reducedMotion,colors:this._colors});
    if(this._transition) {
      const progress=ease(this._transition.elapsed/this._transition.duration);
      this._frame=target.map((value,index)=>mix(this._transition.from[index],value,progress));
      if(progress>=1)this._transition=null;
    } else this._frame=target;
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
    this._raf=null;if(this._destroyed||this._paused||document.hidden||!this._plan)return;
    // Hidden time and paused time are excluded; ordinary elapsed time is absolute.
    const delta=this._lastNow===null ? 0 : Math.max(0,now-this._lastNow);this._lastNow=now;
    this._elapsed+=delta;if(this._transition)this._transition.elapsed+=delta;
    this._compose();this._paint();
    if(!this._plan.loop&&!this._completed&&this._elapsed>=number(this._plan.durationMs,2000)) {
      this._completed=true;const completedPlan=this._plan;this.onComplete?.(completedPlan);
    }
    this._schedule();
  }
  _schedule(){
    if(this._raf!==null||this._destroyed||this._paused||document.hidden||!this._plan)return;
    // A settled finite scene and a static/reduced-motion loop need no redraws.
    // Finite reduced-motion scenes still run their lifecycle completion clock.
    const isLoop=Boolean(this._plan.loop);
    if(!this._transition&&((!isLoop&&this._completed)||(isLoop&&(this._reducedMotion||this._plan.motionPrimitive==='hold'))))return;
    this._raf=requestAnimationFrame(this._tick);
  }
  _cancel(){if(this._raf!==null){cancelAnimationFrame(this._raf);this._raf=null;}}
  destroy(){this._destroyed=true;this._cancel();this._observer?.disconnect();window.removeEventListener('resize',this._resize);document.removeEventListener('visibilitychange',this._visibility);this._pending=null;}
}
