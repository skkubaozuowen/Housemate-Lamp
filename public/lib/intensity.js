import { COMPOSITION_DEFAULTS, normalizeComposition } from './composition.js';

const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const mix=(a,b,t)=>a+(b-a)*t;
const scenes=new Set(['celebrate','setback','rest','upcoming','mixed','everyday']);
const anchors=(level,[low,middle,high])=>level<=.5?mix(low,middle,level*2):mix(middle,high,(level-.5)*2);
const energies={
  celebrate:[.5,.76,.9],quiet:[.3,.52,.64],setback:[.3,.52,.68],renew:[.38,.52,.7],
  rest:[.22,.5,.58],upcoming:[.35,.56,.7],mixed:[.35,.62,.75],everyday:[.25,.4,.58]
};

/** One mapping at interpretation time. Saved and manually edited plans already
 * contain the resulting geometry and must never be orchestrated a second time. */
export function orchestrateIntensity(raw={}) {
  const type=raw.responseType;
  const intensity=scenes.has(type)?clamp(Number.isFinite(raw.intensity)?raw.intensity:.5):0;
  const composition=normalizeComposition(raw.composition);
  const result={...raw,intensity,composition};
  if(!scenes.has(type))return result;
  const key=type==='celebrate'&&raw.expression==='quiet'?'quiet':type==='setback'&&raw.expression==='renew'?'renew':type;
  const energy=energies[key];
  // Geometry provides the visible degree; energy adds restrained chromatic
  // presence, without changing the USB brightness or deciding the tempo.
  result.energy=clamp(anchors(intensity,energy)+.18*((Number.isFinite(raw.energy)?raw.energy:energy[1])-energy[1]),energy[0],energy[2]);
  const set=(field,range,residual=.15)=>{
    composition[field]=anchors(intensity,range)+residual*(composition[field]-COMPOSITION_DEFAULTS[field]);
  };
  if(type==='mixed'&&raw.mixedMode==='layered') {
    // The renderer varies ribbon thickness at a fixed period. Scaling the
    // weaving pattern here would change its structure instead of its presence.
  } else set('fieldScale',[.75,1,1.25]);
  if(type==='celebrate') {
    if(key!=='quiet') {
      set('rippleCount',[1,3,5]);
      set('waveWidth',[.7,1,1.35]);
      set('accentScale',[.65,1,1.5]);
      set('accentWeight',[.5,1,1.45]);
    }
  } else if(type==='setback') {
    set('waveWidth',[.8,1,1.35]);
    if(key!=='renew') {
      set('accentScale',[.65,1,1.5]);
      set('accentWeight',[.5,1,1.45]);
    }
  } else if(type==='rest') {
    set('waveWidth',[.85,1,1.4]);
    // Depletion gets a wider, slower resting gesture. Fulfilment's warm
    // accent remains an independent semantic choice with its own controls.
    result.speed=clamp(anchors(intensity,[.42,.3,.15])+.2*((Number.isFinite(raw.speed)?raw.speed:.3)-.3),.15,.46);
  } else if(type==='everyday') {
    set('spread',[.9,1,1.15]);
    set('rippleCount',[1,2,3]);
  }
  result.composition=normalizeComposition(composition);
  return result;
}
