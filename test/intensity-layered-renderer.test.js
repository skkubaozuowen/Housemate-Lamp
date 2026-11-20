import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createPlan,RESPONSE_TYPES} from '../public/lib/catalog.js';
import {createScenePlan} from '../public/lib/planner.js';
import {normalizeComposition,COMPOSITION_LIMITS} from '../public/lib/composition.js';
import {NAMED_COLOR_FAMILIES,selectPalette,colorGroup} from '../public/lib/palettes.js';
import {renderFrame,renderVoiceFrame} from '../public/lib/renderer.js';

const layered=overrides=>createScenePlan('mixed','bittersweet',{
  seed:4589,mixedMode:'layered',feelingPrimary:'sadness',feelingSecondary:'joy',feelingTertiary:'hope',...overrides
});
const pixels=frame=>Array.from({length:256},(_,i)=>frame.slice(i*3,i*3+3));
const maxDelta=(a,b)=>Math.max(...a.map((value,index)=>Math.abs(value-b[index])));
const checksum=plan=>{
  const hash=createHash('sha256');
  for(const p of [0,.19,.52,1,1.8])hash.update(renderFrame(plan,plan.durationMs*p));
  return hash.digest('hex');
};

test('missing and midpoint intensity retain the saved layered RGB baseline byte for byte',()=>{
  const plan=layered({feelingPrimary:'joy',feelingSecondary:'sadness'}),missing={...plan};delete missing.intensity;
  const original='d1a597642813dd7b15489c65d70bca5724db1214eb97bec7aa636377915dd198';
  assert.equal(checksum(missing),original);
  assert.equal(checksum({...plan,intensity:.5}),original);
  assert.equal(checksum({...plan,intensity:NaN}),original);
});

test('intensity widens existing layered ribbons while their ridge count, locations and feelings stay fixed',()=>{
  const plan=layered({amplitude:0,energy:.55,composition:normalizeComposition({accentWeight:.35,accentScale:.65})});
  const saved=structuredClone(plan),options={colors:[[110,155,235]]};
  const frames=[.2,.5,.9].map(intensity=>renderFrame({...plan,intensity},9000,options));
  const profiles=frames.map(frame=>Array.from({length:16},(_,x)=>255-frame[(8*16+x)*3]));
  const peaks=profile=>profile.flatMap((value,x)=>x>0&&x<15&&value>=profile[x-1]&&value>profile[x+1]?[x]:[]);
  const ridges=profiles.map(peaks),widths=profiles.map(profile=>profile.filter(value=>value>25).length);
  assert.ok(ridges.every(ridge=>ridge.length===ridges[0].length),'degree does not add a new ribbon ridge');
  for(const ridge of ridges)for(let i=0;i<ridge.length;i++)assert.ok(Math.abs(ridge[i]-ridges[0][i])<=1,'the same ridge remains in place, within matrix rounding');
  assert.ok(widths[0]<widths[1]&&widths[1]<widths[2],'light, medium and strong degree broaden the same ribbon');
  assert.deepEqual(plan,saved,'degree never rewrites the supplied feelings or composition');
});

test('the thickness difference survives the current gamma correction and conservative brightness-three quantization',()=>{
  const plan=layered({amplitude:0,energy:.55});
  // Adafruit gamma8 uses the rounded 2.6 curve; the firmware then rounds its
  // gamma-corrected byte times the capped brightness. The cap stays unchanged.
  const physical=frame=>frame.map(value=>Math.floor((Math.round(255*(value/255)**2.6)*3+127)/255));
  const frames=[.2,.5,.9].map(intensity=>physical(renderFrame({...plan,intensity},9000)));
  const colored=frames.map(frame=>pixels(frame).filter(rgb=>Math.max(...rgb)>Math.min(...rgb)).length);
  assert.ok(colored[1]>=colored[0]+20&&colored[2]>=colored[1]+20,'all three degrees occupy visibly different areas after quantization');
  for(const frame of frames) {
    assert.ok(frame.every(value=>value>=0&&value<=3));
    assert.ok(pixels(frame).every(rgb=>Math.max(...rgb)===3),'the added presence preserves the luminous surface');
  }
});

test('layered degree preserves explicit named colors and declined intermediate hue protection',()=>{
  for(const [hue,paletteFamily] of Object.entries(NAMED_COLOR_FAMILIES))for(const intensity of [.2,.5,.9]) {
    const plan=layered({paletteFamily,intensity}),colors=selectPalette(plan);
    for(const elapsed of [3000,9000,15000])assert.ok(pixels(renderFrame(plan,elapsed,{colors})).every(rgb=>['neutral',hue].includes(colorGroup(rgb))),`locked ${hue} is not recolored by degree`);
  }
  for(const intensity of [.2,.5,.9])for(const side of [0,1]) {
    const composition=normalizeComposition(Object.fromEntries(Object.entries(COMPOSITION_LIMITS).map(([key,limits])=>[key,limits[side]])));
    const plan=layered({intensity,composition});
    const colors=[[80,150,255],[238,120,218]],avoidedColors=['purple'];
    for(const elapsed of [2500,6000,14000])assert.ok(pixels(renderFrame(plan,elapsed,{colors,avoidedColors})).every(rgb=>colorGroup(rgb)!=='purple'),'a wider ribbon cannot mix the declined hue back in');
  }
});

test('layered intensity is smooth in time and at its midpoint, and keeps reduced-motion or zero-amplitude fields still',()=>{
  for(const intensity of [.2,.5,.9])for(const side of [0,1]) {
    const composition=normalizeComposition(Object.fromEntries(Object.entries(COMPOSITION_LIMITS).map(([key,limits])=>[key,limits[side]])));
    const plan=layered({intensity,composition,speed:2,amplitude:1});
    for(const elapsed of [100,2500,6000,11000,16000])assert.ok(maxDelta(renderFrame(plan,elapsed),renderFrame(plan,elapsed+1))<=2,'ribbon widening introduces no temporal edge or flash');
    assert.deepEqual(renderFrame(plan,0,{reducedMotion:true}),renderFrame(plan,60000,{reducedMotion:true}));
    const still={...plan,amplitude:0};
    assert.deepEqual(renderFrame(still,plan.durationMs),renderFrame(still,plan.durationMs+30000));
  }
  const plan=layered();
  assert.ok(maxDelta(renderFrame({...plan,intensity:.5-.00001},6000),renderFrame({...plan,intensity:.5+.00001},6000))<=1,'the original midpoint has no branch discontinuity');
});

test('intensity does not alter other expressions, paired or open feelings, manual primitives, or voice',()=>{
  for(const type of RESPONSE_TYPES)for(const expression of type==='celebrate'?['default','quiet']:type==='setback'?['default','renew']:type==='rest'?['default','fulfilled']:['default']) {
    const plan=createPlan(type,{seed:4589,expression,mixedMode:'paired'});
    for(const elapsed of [0,3000,13000])assert.deepEqual(renderFrame({...plan,intensity:.2},elapsed),renderFrame({...plan,intensity:.9},elapsed),`${type}/${expression} keeps its original rendering`);
  }
  for(const overrides of [{mixedMode:'open'},{motionPrimitive:'hold'}]) {
    const plan=layered(overrides);
    assert.deepEqual(renderFrame({...plan,intensity:.2},6000),renderFrame({...plan,intensity:.9},6000));
  }
  assert.deepEqual(renderVoiceFrame(.7,2400,{intensity:.2}),renderVoiceFrame(.7,2400,{intensity:.9}));
});
