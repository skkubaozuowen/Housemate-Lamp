import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlan} from '../public/lib/catalog.js';
import {createScenePlan} from '../public/lib/planner.js';
import {selectPalette,colorGroup} from '../public/lib/palettes.js';
import {renderFrame} from '../public/lib/renderer.js';

const plan=(type,overrides={})=>createPlan(type,{seed:4589,...overrides});
const at=(scene,p,options)=>renderFrame(scene,scene.durationMs*p,options);
const difference=(a,b)=>a.reduce((sum,value,index)=>sum+Math.abs(value-b[index]),0)/a.length;
const pixels=frame=>Array.from({length:256},(_,i)=>Array.from(frame.slice(i*3,i*3+3)));
const area=frame=>pixels(frame).filter(color=>Math.max(...color)-Math.min(...color)>18).length;
const warm=rgb=>rgb[0]-rgb[2]>15;
const cool=rgb=>rgb[2]-rgb[0]>15||rgb[1]-rgb[0]>15;

test('good news spreads from a local center; quiet recognition unfolds without celebration ripples',()=>{
  const celebration=plan('celebrate'),quiet={...celebration,expression:'quiet'};
  assert.ok(area(at(celebration,.5))>area(at(celebration,.08))*5,'celebration opens into the surrounding field');
  assert.ok(area(at(quiet,.7))>area(at(quiet,.08))*2,'quiet recognition still unfolds');
  assert.ok(difference(at(celebration,.33),at(quiet,.33))>8,'quiet recognition differs visibly from a full celebration');
  const center=(8*16+8)*3,early=at(celebration,.08);
  assert.ok(early[center+2]<early[2]-15,'the first warm bloom originates near the center rather than an edge');
});

test('celebration accents are optional, late and do not leak into a quiet or custom-color scene',()=>{
  const scene=plan('celebrate'),accentColors=selectPalette({paletteFamily:'sea_glass',colorCount:1});
  assert.deepEqual(at(scene,.7,{accentColors}),at(scene,.7),'no accent arrives before the closing fifth');
  const late=at(scene,.95,{accentColors});
  assert.ok(difference(late,at(scene,.95))>.5,'the permitted late accent changes actual matrix pixels');
  assert.ok(pixels(late).filter(rgb=>colorGroup(rgb)==='green').length>=3,'blue-green accents remain visibly chromatic');
  assert.deepEqual(at({...scene,expression:'quiet'},.95,{accentColors}),at({...scene,expression:'quiet'},.95));
  const blue=plan('celebrate',{paletteFamily:'named_blue'});
  assert.ok(pixels(at(blue,.95)).every(rgb=>['neutral','blue'].includes(colorGroup(rgb))),'the renderer adds no unrequested colors');
});

test('the warm celebration fades into continuing separated blue, violet and green glimmers',()=>{
  const scene=plan('celebrate'),accentColors=selectPalette({paletteFamily:'dream_sparkles',colorCount:3});
  for(const elapsed of [scene.durationMs,20000,26000,34000]) {
    const frame=renderFrame(scene,elapsed,{accentColors}),colors=pixels(frame);
    assert.equal(colors.filter(rgb=>['yellow','orange','red','pink'].includes(colorGroup(rgb))).length,0,'the warm opening never leaves a yellow wash or restarts');
    assert.ok(area(frame)>8&&area(frame)<65,'the ambient tail is made of localized glimmers rather than a broad field');
    for(const hue of ['blue','purple','green'])assert.ok(colors.filter(rgb=>colorGroup(rgb)===hue).length>=2,`${hue} remains independently visible at ${elapsed}ms`);
  }
  const late=renderFrame(scene,20000,{accentColors}),later=renderFrame(scene,24000,{accentColors});
  assert.ok(difference(late,later)>1,'pinpoints drift and twinkle after the finite expansion has finished');
  const still={...scene,amplitude:0};
  assert.deepEqual(renderFrame(still,20000,{accentColors}),renderFrame(still,40000,{accentColors}),'zero amplitude stops ambient movement and twinkling');
  const quiet={...scene,expression:'quiet'};
  assert.deepEqual(renderFrame(quiet,scene.durationMs,{accentColors}),renderFrame(quiet,40000,{accentColors}),'quiet recognition keeps its finite unfolding');
});

test('renewal lets gold enter violet, opens into warmth and finishes with quiet warm twinkles',()=>{
  const base=createScenePlan('setback','default',{seed:4589});
  const renewal=createScenePlan('setback','renew',{seed:4589});
  assert.deepEqual(renderFrame(base,3000),renderFrame(renewal,3000),'intention to try again begins with the same cool acknowledgment');
  const ordinary=at(base,.95),entering=pixels(renderFrame(renewal,6000)),warmField=pixels(renderFrame(renewal,10000));
  assert.ok(pixels(ordinary).filter(rgb=>colorGroup(rgb)==='red').length>35,'the difficult moment keeps a clearly visible rose-red wave');
  assert.ok(pixels(ordinary).filter(rgb=>colorGroup(rgb)==='purple').length>35,'violet remains clearly present beside the red');
  assert.equal(pixels(ordinary).filter(rgb=>['yellow','orange'].includes(colorGroup(rgb))).length,0,'discomfort alone does not trigger the encouraging gold transition');
  assert.ok(entering.filter(warm).length>10&&entering.filter(cool).length>50,'gold enters while the violet tide is still present');
  assert.ok(warmField.filter(warm).length>100,'the new warmth gradually takes over');
  assert.equal(warmField.filter(rgb=>['blue','purple','green'].includes(colorGroup(rgb))).length,0,'renewal finishes in warm yellow rather than the former mint');
  for(const elapsed of [14000,20000,24000]) {
    const frame=pixels(renderFrame(renewal,elapsed));
    assert.ok(frame.filter(rgb=>Math.max(...rgb)-Math.min(...rgb)>40).length<35,'the ending becomes sparse star points instead of a flat yellow wash');
    assert.ok(frame.filter(rgb=>Math.max(...rgb)-Math.min(...rgb)>40).length>=4,'the warm twinkles remain clearly visible');
    assert.equal(frame.filter(cool).length,0,'the violet opening does not restart');
  }
  assert.ok(difference(renderFrame(base,16000),renderFrame(base,19000))>1,'the cool tide continues after its finite opening');
  assert.ok(difference(renderFrame(renewal,20000),renderFrame(renewal,23000))>.5,'star points keep twinkling after the finite opening');
});

test('rest eases its current down, retains fulfilment as a small accent and can flow continuously when invited',()=>{
  const rest=plan('rest');
  const early=difference(at(rest,.1),at(rest,.15)),late=difference(at(rest,.8),at(rest,.85));
  assert.ok(early>late*2,'the late current moves less over the same elapsed interval');
  const fulfilled=plan('rest',{expression:'fulfilled',paletteFamily:'rest_glow',colorCount:4});
  const final=pixels(at(fulfilled,1)),warmPixels=final.filter(warm).length;
  assert.ok(warmPixels>=5&&warmPixels<45,'fulfilment remains a local accent');
  assert.ok(final.filter(cool).length>100,'fatigue retains the spacious cool field');
  const continuous={...rest,loop:true},seam=continuous.durationMs;
  assert.ok(difference(renderFrame(continuous,seam-8),renderFrame(continuous,seam+8))<.3,'continuous flow does not reset at the loop boundary');
  assert.ok(difference(renderFrame(continuous,500),renderFrame(continuous,4000))>1,'invited company continues moving');
});

test('red and blue soft spots surface in different sizes, fade away and return over the continuing setback tide',()=>{
  const scene=createScenePlan('setback','default',{seed:4589});
  // Isolate the blue role from the two wave colors to observe its lifetime.
  const options={colors:[[255,255,255],[255,255,255],[110,175,255]]};
  const blueArea=ms=>pixels(renderFrame(scene,ms,options)).filter(rgb=>colorGroup(rgb)==='blue').length;
  assert.equal(blueArea(3000),0,'the waves open before the scattered glows arrive');
  assert.ok(blueArea(8000)>30,'blue spots bloom over the waves');
  assert.equal(blueArea(16000),0,'the spots can disappear completely instead of remaining fixed balls');
  assert.ok(blueArea(24000)>30,'spots reappear after the finite introduction without restarting the scene');
  const mask=new Set(pixels(renderFrame(scene,8000,options)).flatMap((rgb,i)=>colorGroup(rgb)==='blue'?[i]:[])),sizes=[];
  while(mask.size) {
    const first=mask.values().next().value,queue=[first];let size=0;mask.delete(first);
    while(queue.length) {
      const i=queue.pop();size++;
      for(const next of [i%16>0?i-1:-1,i%16<15?i+1:-1,i-16,i+16])if(mask.has(next)){mask.delete(next);queue.push(next);}
    }
    sizes.push(size);
  }
  assert.ok(sizes.length>=2&&Math.max(...sizes)>Math.min(...sizes)*1.2,'separate diffused spots have visibly different footprints');
  const still={...scene,amplitude:0};
  assert.deepEqual(renderFrame(still,16000),renderFrame(still,24000),'zero amplitude freezes both the waves and the spot cycles');
  assert.deepEqual(renderFrame(scene,0,{reducedMotion:true}),renderFrame(scene,24000,{reducedMotion:true}));
  for(const ms of [5000,8000,12000,16000,24000]) {
    const before=renderFrame(scene,ms),after=renderFrame(scene,ms+1000/60);
    assert.ok(Math.max(...before.map((channel,i)=>Math.abs(channel-after[i])))<=6,'appearing and disappearing spots retain soft frame transitions');
  }
});

test('a difficult moment has tidal folds while rest opens downward as one spacious veil, even with identical colors',()=>{
  const common={seed:4589,speed:.4,amplitude:.7,energy:.5,durationMs:10000};
  const setback=plan('setback',common),rest=plan('rest',common),options={colors:[[110,155,235]]};
  const rows=frame=>Array.from({length:16},(_,y)=>{
    let total=0;for(let x=0;x<16;x++)total+=255-frame[(y*16+x)*3];return total/16;
  });
  const centerY=values=>values.reduce((sum,value,y)=>sum+value*(y+.5)/16,0)/values.reduce((sum,value)=>sum+value,0);
  const lateFolds=rows(at(setback,.9,options)),lateVeil=rows(at(rest,.9,options));
  assert.ok(centerY(lateVeil)-centerY(lateFolds)>.16,'rest settles into the lower field instead of repeating the same wave composition');
  assert.ok(centerY(lateVeil)-centerY(rows(at(rest,.1,options)))>.15,'the veil visibly opens downward');
  const peaks=lateFolds.flatMap((value,y)=>y>0&&y<15&&value>lateFolds[y-1]&&value>=lateFolds[y+1]&&value>40?[y]:[]);
  assert.ok(peaks.some((y,i)=>peaks.slice(i+1).some(other=>other-y>=5)),'setback retains separated tidal folds');
  const mean=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
  assert.ok(mean(lateVeil.slice(9))>mean(lateVeil.slice(0,7))*4,'rest leaves spacious light above its settling veil');
});

test('nervousness opens from violet into a rising warm breath that continues offering courage',()=>{
  const scene=createScenePlan('upcoming','default',{seed:4589});
  const initial=pixels(renderFrame(scene,1500)),entering=pixels(renderFrame(scene,6000));
  assert.ok(initial.filter(cool).length>30&&initial.filter(warm).length===0,'violet receives nervousness before encouragement opens');
  assert.ok(entering.filter(cool).length>20&&entering.filter(warm).length>10,'warm support grows within the violet gesture');
  const warmCenterY=frame=>{
    const positions=pixels(frame).flatMap((rgb,i)=>warm(rgb)?[(Math.floor(i/16)+.5)/16]:[]);
    return positions.reduce((sum,y)=>sum+y,0)/positions.length;
  };
  assert.ok(warmCenterY(renderFrame(scene,6000))-warmCenterY(renderFrame(scene,10000))>.08,'warmth lifts upward rather than entering as S02’s sideways yellow tide');
  for(const elapsed of [12000,20000,24000]) {
    const frame=pixels(renderFrame(scene,elapsed));
    assert.ok(frame.filter(warm).length>frame.filter(cool).length,'the settled response offers warmth with a little violet at the sides');
    assert.ok(frame.filter(rgb=>Math.min(...rgb)>245).length>60,'the warm breath retains luminous breathing space');
    assert.equal(frame.filter(rgb=>colorGroup(rgb)==='green').length,0,'the native support does not return to a green clump');
  }
  const warmAreas=Array.from({length:21},(_,i)=>pixels(renderFrame(scene,14000+i*500)).filter(warm).length);
  assert.ok(Math.max(...warmAreas)>Math.min(...warmAreas)*1.6,'the settled warm light visibly opens and releases with a steady breath');
  const monochrome={colors:[[110,155,235]]};
  assert.ok(difference(renderFrame(scene,15000,monochrome),renderFrame(createScenePlan('setback','renew',{seed:4589}),15000,monochrome))>8,'encouragement has its own broad breath rather than the retry constellation, even without color cues');
  for(const legacyExpression of ['tense','anticipation','neutral'])for(const elapsed of [2000,7000,15000]) {
    assert.deepEqual(renderFrame({...scene,expression:legacyExpression},elapsed),renderFrame(scene,elapsed),'legacy expression names no longer select separate geometries');
  }
  assert.ok(difference(renderFrame(scene,16000),renderFrame(scene,19000))>1,'the supportive breath continues after completion');
});

test('renewal and encouragement respect static access settings and have smooth color transitions',()=>{
  const scene=createScenePlan('upcoming','default',{seed:4589});
  for(const current of [scene,createScenePlan('setback','renew',{seed:4589})]) {
    assert.deepEqual(renderFrame({...current,amplitude:0},16000),renderFrame({...current,amplitude:0},24000));
    assert.deepEqual(renderFrame(current,0,{reducedMotion:true}),renderFrame(current,24000,{reducedMotion:true}));
    for(const elapsed of [3100,4000,6500,9000,11000,12000,20000]) {
      const frame=renderFrame(current,elapsed),next=renderFrame(current,elapsed+1000/60);
      assert.ok(Math.max(...frame.map((channel,i)=>Math.abs(channel-next[i])))<=6,'color transitions and stars never flash between neighboring frames');
    }
  }
});

test('mixed feelings preserve spatially distinct warm and cool regions through the ending',()=>{
  const mixed=plan('mixed');
  for(const progress of [.15,.45,.8,1]) {
    const colors=pixels(at(mixed,progress));
    const warmXs=[],coolXs=[];
    colors.forEach((rgb,i)=>{if(warm(rgb))warmXs.push((i%16+.5)/16);if(cool(rgb))coolXs.push((i%16+.5)/16);});
    assert.ok(warmXs.length>80&&coolXs.length>25,`primary feeling and its smaller companion remain visible at ${progress}`);
    const mean=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
    assert.ok(mean(coolXs)-mean(warmXs)>.25,'the two palettes are not averaged across one global gradient');
  }
  const first=at(mixed,.2),second=at(mixed,.55);
  const halfDifference=side=>{let delta=0;for(let i=0;i<256;i++)if((i%16<8)===side)for(let c=0;c<3;c++)delta+=Math.abs(first[i*3+c]-second[i*3+c]);return delta/384;};
  assert.ok(halfDifference(true)>.3&&halfDifference(false)>.3,'both regions keep moving');
  assert.ok(Math.abs(halfDifference(true)-halfDifference(false))>.2,'the regions have independent rhythms');
  const late=renderFrame(mixed,20000),later=renderFrame(mixed,24000);
  assert.ok(difference(late,later)>3,'the ambient mixed response remains visibly flowing after the opening');
  for(const frame of [late,later,renderFrame(mixed,34000)]) {
    assert.ok(pixels(frame).filter(warm).length>80&&pixels(frame).filter(cool).length>20,'both feelings continue through the ambient tail');
  }
  let seamStep=0,seamTotal=0,seamSamples=0;
  for(let y=3;y<13;y++)for(let x=5;x<11;x++)for(let c=0;c<3;c++) {
    const step=Math.abs(late[(y*16+x)*3+c]-late[(y*16+x+1)*3+c]);
    seamStep=Math.max(seamStep,step);seamTotal+=step;seamSamples++;
  }
  assert.ok(seamStep<=48&&seamTotal/seamSamples<12,'the saturated complementary fields meet through a soft light shoulder');
});

test('mixed emotion emphasis changes relative area while keeping a smaller companion and user color choices',()=>{
  const counts=balance=>{
    const scene=plan('mixed',{feelingPrimary:'joy',feelingSecondary:'sadness',feelingBalance:balance});
    const frame=pixels(at(scene,.5));return {warm:frame.filter(warm).length,cool:frame.filter(cool).length};
  };
  const equal=counts(.5),dominant=counts(.8);
  assert.ok(equal.warm/equal.cool<1.7&&equal.warm/equal.cool>.6,'balanced visual emphasis retains two comparable regions');
  assert.ok(dominant.warm>equal.warm&&dominant.cool<equal.cool,'stronger primary feeling expands its area while the secondary contracts');
  assert.ok(dominant.cool>=10,'the secondary feeling remains a visible companion rather than disappearing');
  const reversed=plan('mixed',{feelingPrimary:'sadness',feelingSecondary:'joy',feelingBalance:.8});
  const reversePixels=pixels(at(reversed,.5));
  assert.ok(reversePixels.filter(cool).length>reversePixels.filter(warm).length*2,'sadness can equally be the dominant field');
  const requested=plan('mixed',{paletteFamily:'named_blue',feelingPrimary:'joy',feelingSecondary:'sadness',feelingBalance:.8});
  assert.ok(pixels(at(requested,.5)).every(rgb=>['neutral','blue'].includes(colorGroup(rgb))),'semantic feelings introduce no colors outside an explicit requested palette');
});

test('an open mixed response carries the co-designed cyan, pink and lime gradient without an invented emotional hierarchy',()=>{
  const scene=plan('mixed',{mixedMode:'open',feelingPrimary:'none',feelingSecondary:'none',feelingTertiary:'none',feelingBalance:.5});
  const aqua=([r,g,b])=>g-r>12&&b-r>12;
  const orchid=([r,g,b])=>r-g>8&&b-g>15;
  const lime=([r,g,b])=>g-b>15&&g-r>8;
  const colorCounts=[];
  for(const elapsed of [2000,6000,13000,24000,34000,44000]) {
    const colors=pixels(renderFrame(scene,elapsed));
    const counts=[aqua,orchid,lime].map(hue=>colors.filter(hue).length);
    colorCounts.push(counts);
    assert.ok(colors.filter(rgb=>Math.min(...rgb)>242).length>=16,'the diagonal field retains clean white breathing space');
    assert.ok(colors.every(rgb=>Math.max(...rgb)>=253),'the gradient is luminous rather than a darkened average of overlapping blobs');
    assert.deepEqual(renderFrame(scene,elapsed),renderFrame({...scene,feelingBalance:.9},elapsed),'an unknown emotional balance does not resize the open regions');
  }
  for(let i=0;i<3;i++) {
    const presence=colorCounts.map(counts=>counts[i]);
    assert.ok(Math.max(...presence)>20,'each reference color travels into a clearly visible region');
    assert.ok(Math.max(...presence)-Math.min(...presence)>20,'color regions gradually replace one another instead of staying fixed');
  }
  const early=renderFrame(scene,2500),late=renderFrame(scene,7600);
  const regionDelta=(x0,x1,y0,y1)=>{
    let sum=0,count=0;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)for(let c=0;c<3;c++) {
      sum+=Math.abs(early[(y*16+x)*3+c]-late[(y*16+x)*3+c]);count++;
    }
    return sum/count;
  };
  const changes=[regionDelta(1,7,2,8),regionDelta(8,15,2,8),regionDelta(4,12,9,15)];
  assert.ok(changes.every(change=>change>2),'the diagonal gradient visibly stretches and moves across the field');
  assert.ok(Math.max(...changes)-Math.min(...changes)>1,'their rhythms are not one global pulse');
});

test('the open field carries neighboring colors forward along its existing diagonal',()=>{
  const scene=plan('mixed',{mixedMode:'open',feelingPrimary:'none',feelingSecondary:'none',feelingTertiary:'none'});
  const hue=(frame,x,y)=>{
    const tint=Array.from(frame.slice((y*16+x)*3,(y*16+x)*3+3),channel=>255-channel);
    const sum=tint.reduce((a,b)=>a+b,0);
    return {channels:tint.map(value=>value/(sum||1)),sum};
  };
  for(const elapsed of [4000,11000,24000]) {
    const early=renderFrame(scene,elapsed),later=renderFrame(scene,elapsed+3000);
    let stationary=0,forward=0,backward=0,samples=0;
    for(let y=3;y<12;y++)for(let x=3;x<12;x++) {
      const source=hue(early,x,y),same=hue(later,x,y),ahead=hue(later,x+2,y+1),behind=hue(later,x-2,y-1);
      if(Math.min(source.sum,same.sum,ahead.sum,behind.sum)<30)continue;
      const distance=target=>source.channels.reduce((sum,value,i)=>sum+Math.abs(value-target.channels[i]),0);
      stationary+=distance(same);forward+=distance(ahead);backward+=distance(behind);samples++;
    }
    assert.ok(samples>25,'enough chromatic pixels remain to observe color transport');
    assert.ok(forward<stationary*.6&&forward<backward*.6,'a color reappears farther along the diagonal, rather than merely pulsing in place');
  }
  const frame=pixels(renderFrame(scene,5000));
  for(let x=5;x<12;x++)assert.ok(Math.max(...frame[8*16+x])-Math.min(...frame[8*16+x])>20,'the middle gradient joins continuously without isolated circular islands');
});

test('S05 gradients preserve explicit gray and do not regenerate declined intermediate hues',()=>{
  const scene=plan('mixed',{mixedMode:'open',feelingPrimary:'none',feelingSecondary:'none',feelingTertiary:'none'});
  const gray=renderFrame(scene,5000,{colors:[[185,185,185],[213,213,213],[234,234,234]]});
  assert.ok(pixels(gray).every(([r,g,b])=>r===g&&g===b),'an explicit gray palette stays achromatic');
  assert.ok(pixels(gray).some(([r])=>r<245),'normalizing luminous colors does not erase an explicit gray selection');
  const colors=[[80,150,255],[238,120,218]],avoidedColors=['purple'];
  for(const mixedMode of ['paired','layered','open'])for(const elapsed of [2500,6000,18000]) {
    const frame=renderFrame({...scene,mixedMode},elapsed,{colors,avoidedColors});
    assert.ok(pixels(frame).every(rgb=>colorGroup(rgb)!=='purple'),`${mixedMode} fades through white when a gradient would cross a declined purple`);
  }
  const still={...scene,amplitude:0};
  assert.deepEqual(renderFrame(still,12000),renderFrame(still,40000),'zero amplitude freezes the continuing S05 field');
});

test('a third expressed feeling appears in the actual matrix while paired and layered emphasis remain optional',()=>{
  const common={feelingPrimary:'joy',feelingSecondary:'sadness',feelingTertiary:'calm',feelingBalance:.5};
  const layered=plan('mixed',{...common,mixedMode:'layered'}),paired={...layered,mixedMode:'paired'};
  const green=([r,g,b])=>g-r>15&&g-b>4;
  for(const elapsed of [3000,7500,18000]) {
    const frame=renderFrame(layered,elapsed);
    assert.ok(pixels(frame).filter(green).length>10,'the third mint region survives while partially overlapping the blue region');
    assert.ok(difference(frame,renderFrame(paired,elapsed))>4,'adding the third region changes the visible composition');
  }
  const dominant=renderFrame({...layered,feelingBalance:.85},5000),balanced=renderFrame(layered,5000);
  assert.ok(pixels(dominant).filter(warm).length>pixels(balanced).filter(warm).length,'a stated primary feeling can still expand within a three-feeling composition');
  for(const mode of ['paired','layered','open']) {
    const requested={...layered,mixedMode:mode,paletteFamily:'named_blue'};
    assert.ok(pixels(renderFrame(requested,5000)).every(rgb=>['neutral','blue'].includes(colorGroup(rgb))),`${mode} respects a current explicit color choice`);
  }
});

test('all mixed compositions keep a quiet continuous tail, a soft gradient and stable reduced motion',()=>{
  for(const mixedMode of ['paired','layered','open']) {
    const scene=plan('mixed',{mixedMode,feelingPrimary:mixedMode==='open'?'none':'joy',feelingSecondary:mixedMode==='open'?'none':'sadness',feelingTertiary:mixedMode==='layered'?'calm':'none',feelingBalance:.6});
    const endpoint=renderFrame(scene,scene.durationMs),after=renderFrame(scene,scene.durationMs+10000);
    assert.ok(difference(endpoint,after)>1,`${mixedMode} keeps its independent flow after the opening`);
    assert.ok(difference(renderFrame(scene,scene.durationMs-8),renderFrame(scene,scene.durationMs+8))<.2,'the finite opening never restarts at its ending');
    assert.deepEqual(renderFrame(scene,0,{reducedMotion:true}),renderFrame(scene,45000,{reducedMotion:true}));
    for(const elapsed of [3000,11000,22000]) {
      const frame=renderFrame(scene,elapsed),next=renderFrame(scene,elapsed+1000/60);
      assert.ok(Math.max(...frame.map((value,index)=>Math.abs(value-next[index])))<=4,'the luminous cloud has no frame-to-frame flashes');
      let sharpest=0;
      for(let y=0;y<16;y++)for(let x=0;x<15;x++)for(let c=0;c<3;c++)sharpest=Math.max(sharpest,Math.abs(frame[(y*16+x)*3+c]-frame[(y*16+x+1)*3+c]));
      assert.ok(sharpest<=58,`${mixedMode} colors join through a soft matrix gradient`);
    }
  }
});

test('a structural handoff unfolds incoming scenes from the existing two lights without altering native previews',()=>{
  const handoff={anchors:[{x:.42,y:.42},{x:.59,y:.55}],progress:.3};
  for(const type of ['processing','celebrate','setback','rest','upcoming','mixed','everyday']) {
    const scene=plan(type),elapsed=scene.durationMs*.14,native=renderFrame(scene,elapsed);
    const entering=renderFrame(scene,elapsed,{handoff});
    assert.ok(difference(native,entering)>.3,`${type} unfolds its geometry during the handoff`);
    assert.deepEqual(renderFrame(scene,elapsed,{handoff:{...handoff,progress:1}}),native,`${type} reaches the exact native geometry`);
    assert.deepEqual(renderFrame(scene,elapsed,{reducedMotion:true,handoff}),renderFrame(scene,elapsed,{reducedMotion:true}),'reduced motion bypasses geometric handoffs');
  }
});

test('exchange states distinguish one receipt, ongoing thinking, a real pause and a lit closure',()=>{
  const receipt=plan('acknowledge'),thinking=plan('processing'),clarify=plan('clarify'),closure=plan('farewell');
  assert.ok(difference(at(receipt,.1),at(receipt,.55))>1,'a receipt opens once');
  assert.ok(difference(renderFrame(thinking,400),renderFrame(thinking,3000))>1,'thinking remains visibly active');
  assert.deepEqual(at(clarify,.8),at(clarify,.95),'the final quarter genuinely pauses for a continuation');
  assert.ok(area(at(closure,1))>50,'closure returns to a visible ambient field');
  const everyday=plan('everyday');
  assert.ok(area(at(everyday,.5))<90,'ordinary sharing stays local and restrained');
});

test('everyday sharing acknowledges with distributed warm echoes, then separates into independently wandering halos',()=>{
  const scene=plan('everyday'),options={colors:[[110,155,235]]};
  const peaks=frame=>{
    const strength=(x,y)=>255-frame[(y*16+x)*3],candidates=[];
    for(let y=2;y<14;y++)for(let x=2;x<14;x++) {
      const center=strength(x,y);
      if(center>25&&[[1,0],[-1,0],[0,1],[0,-1]].every(([dx,dy])=>center>=strength(x+dx,y+dy)))candidates.push({x,y,center});
    }
    candidates.sort((a,b)=>b.center-a.center);
    return candidates.filter((candidate,index)=>candidates.slice(0,index).every(other=>Math.hypot(other.x-candidate.x,other.y-candidate.y)>2));
  };
  const positions=[];
  const echoes=peaks(at(scene,.34,options));
  assert.ok(echoes.length>=3,'ordinary words receive several distinct local light echoes');
  for(const axis of ['x','y']) {
    const values=echoes.map(light=>light[axis]);
    assert.ok(Math.max(...values)-Math.min(...values)>=6,'the acknowledgment is distributed across the matrix');
  }
  const first=peaks(at(scene,.2,options))[0],last=echoes[0];
  assert.ok(Math.hypot(first.x-last.x,first.y-last.y)>=5,'different sites answer in a gentle sequence');
  for(const elapsed of [scene.durationMs,8200,16000,24000,44000,60000]) {
    const frame=renderFrame(scene,elapsed,options),lights=peaks(frame).sort((a,b)=>a.x-b.x);
    assert.equal(lights.length,2,'the tail retains two independently visible filled centers');
    positions.push(lights);
    assert.ok(Math.hypot(lights[0].x-lights[1].x,lights[0].y-lights[1].y)>=5,'broad halos stay visibly separated while wandering');
    assert.ok(difference(frame,renderFrame(scene,elapsed+2000,options))>.5,'breathing continues after the finite gesture');
    assert.ok(area(frame)>65&&area(frame)<140,'the halos spread light across a substantial part of the matrix without a flat wash');
  }
  for(let i=0;i<2;i++)for(const axis of ['x','y']) {
    const values=positions.map(pair=>pair[i][axis]);
    assert.ok(Math.max(...values)-Math.min(...values)>=2,`light ${i+1} independently travels along ${axis}`);
  }
  assert.ok(difference(renderFrame(scene,scene.durationMs-1),renderFrame(scene,scene.durationMs+1))<.1,'the ending flows into breathing without a seam');
  let previous=renderFrame(scene,0,options);
  for(let elapsed=1000/60;elapsed<=16000;elapsed+=1000/60) {
    const frame=renderFrame(scene,elapsed,options);
    assert.ok(Math.max(...frame.map((value,index)=>Math.abs(value-previous[index])))<=6,'the nod and breathing never flash');
    previous=frame;
  }
  assert.deepEqual(renderFrame({...scene,amplitude:0},8000),renderFrame({...scene,amplitude:0},24000),'zero amplitude leaves a static pair');
  assert.deepEqual(renderFrame(scene,8000,{reducedMotion:true}),renderFrame(scene,24000,{reducedMotion:true}));
  assert.deepEqual(renderFrame({...scene,motionPrimitive:'hold'},8000),renderFrame({...scene,motionPrimitive:'hold'},24000),'an explicit hold remains still');
});

test('processing has two filled soft light balls with one coherent orbit and no loop seam',()=>{
  const scene=plan('processing'),options={colors:[[110,155,235]]},period=4000/scene.speed;
  const peaks=frame=>{
    const strength=(x,y)=>255-frame[(y*16+x)*3],candidates=[];
    for(let y=2;y<14;y++)for(let x=2;x<14;x++) {
      const center=strength(x,y);
      if(center>50&&[[1,0],[-1,0],[0,1],[0,-1]].every(([dx,dy])=>center>=strength(x+dx,y+dy)))candidates.push({x,y,center});
    }
    candidates.sort((a,b)=>b.center-a.center);
    const selected=[];
    for(const candidate of candidates)if(selected.every(other=>Math.hypot(other.x-candidate.x,other.y-candidate.y)>3.5)) {
      selected.push(candidate);if(selected.length===2)break;
    }
    for(const peak of selected) {
      const outer=[[2,0],[-2,0],[0,2],[0,-2]].reduce((sum,[dx,dy])=>sum+strength(peak.x+dx,peak.y+dy),0)/4;
      assert.ok(peak.center>outer*1.3,'each soft ball has a filled luminous center, not a hollow ring');
    }
    return selected;
  };
  const initial=renderFrame(scene,0,options),quarter=renderFrame(scene,period/4,options);
  const first=peaks(initial),next=peaks(quarter);
  assert.equal(first.length,2);assert.equal(next.length,2,'two independently visible light balls share the orbit');
  const vector=points=>[points[0].x-points[1].x,points[0].y-points[1].y],a=vector(first),b=vector(next);
  assert.ok(Math.abs(a[0]*b[0]+a[1]*b[1])/(Math.hypot(...a)*Math.hypot(...b))<.4,'the pair rotates by a quarter turn');
  assert.ok(period>=4000&&period<=5000,'one default revolution takes four to five seconds');
  assert.deepEqual(initial,renderFrame(scene,period,options),'one revolution returns both clouds');
  assert.ok(difference(renderFrame(scene,scene.durationMs-8,options),renderFrame(scene,scene.durationMs+8,options))<.8,'the catalog loop boundary does not reset the orbit');
  assert.ok(difference(renderFrame(scene,900,options),renderFrame({...scene,speed:scene.speed*1.5},900,options))>2,'the speed control changes the rotation');
  const still={...scene,amplitude:0};
  assert.deepEqual(renderFrame(still,200,options),renderFrame(still,4000,options),'zero amplitude freezes both balls');
});

test('uncertainty visibly advances, hesitates, retreats and tries another opening before a clear pause',()=>{
  const scene=plan('clarify');
  assert.deepEqual(at(scene,.29),at(scene,.38),'the first hesitant pause has no hidden drift');
  assert.ok(difference(at(scene,.12),at(scene,.26))>1,'the opening first advances');
  assert.ok(difference(at(scene,.41),at(scene,.53))>1,'a small retreat changes the light after the hesitation');
  assert.ok(difference(at(scene,.55),at(scene,.75))>1,'the soft cloud probes another direction');
  assert.deepEqual(at(scene,.76),at(scene,.99),'the final invitation remains completely still');
  assert.ok(difference(at(scene,.3),renderFrame(plan('processing'),scene.durationMs*.3))>2,'uncertainty does not look like continuous thinking');
});

test('manual primitive editing remains effective for the new semantic compositions',()=>{
  const mixed=plan('mixed'),hold={...mixed,motionPrimitive:'hold'};
  assert.deepEqual(at(hold,.1),at(hold,.8),'manual hold disables native flowing geometry');
  assert.ok(difference(at(mixed,.5),at(hold,.5))>3,'manual controls can depart from the native composition');
});
