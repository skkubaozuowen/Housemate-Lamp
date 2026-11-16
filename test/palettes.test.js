import test from 'node:test';
import assert from 'node:assert/strict';
import {PALETTE_FAMILIES,PALETTE_VARIANTS,NAMED_COLOR_FAMILIES,FEELING_PALETTES,colorGroup,isPaletteAllowed,isSemanticMixedPalette,paletteSettings,resolvePaletteFamily,replacementPalette,selectMixedPalette,selectPalette} from '../public/lib/palettes.js';
import {CATALOG} from '../public/lib/catalog.js';

const plan=(paletteFamily,paletteVariant='balanced',colorCount=3)=>({paletteFamily,paletteVariant,colorCount});
const magnitude=(a,b)=>Math.sqrt(a.reduce((sum,value,index)=>sum+(value-b[index])**2,0));
const mean=colors=>[0,1,2].map(channel=>colors.reduce((sum,color)=>sum+color[channel],0)/colors.length);
const luminance=rgb=>rgb.map(value=>{const channel=value/255;return channel<=.04045 ? channel/12.92 : ((channel+.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
const everydayFamilies=['lilac_blush','mist_blue','peach_amber','rose_lavender','sage_cream','dusk_indigo','sea_glass','mauve_sand','coral_clay'];

test('everyday fields use luminous chromatic pastels rather than gray or muddy main colors',()=>{
  for(const family of everydayFamilies)for(const variant of PALETTE_VARIANTS) {
    const colors=selectPalette(plan(family,variant,4));
    for(const rgb of colors.slice(0,3)) {
      const chroma=(Math.max(...rgb)-Math.min(...rgb))/255;
      assert.ok(chroma>=.10,`${family}/${variant} keeps visible color in every main swatch`);
      assert.ok(luminance(rgb)>=.38,`${family}/${variant} remains luminous, including its strongest swatch`);
      assert.ok(Math.min(...rgb)>=100,`${family}/${variant} stays in a soft pastel range`);
      assert.notEqual(colorGroup(rgb),'neutral',`${family}/${variant} has no gray main swatch`);
    }
    assert.ok(luminance(colors[3])>=.85,`${family}/${variant} retains an airy light base`);
  }
  assert.equal(CATALOG.empathize.paletteFamily,'mauve_sand');
  assert.equal(PALETTE_FAMILIES.mauve_sand.label,'Orchid & peach');
  assert.ok(selectPalette(plan(CATALOG.empathize.paletteFamily)).every(rgb=>colorGroup(rgb)!=='neutral'),'R01 default is now visibly colored');
});

test('the favorite celebration palette and named color choices retain their original swatches',()=>{
  assert.deepEqual(PALETTE_FAMILIES.apricot_rose.colors,['#FFD166','#F28FB5','#FFC5A3','#F7E2B3']);
  assert.deepEqual(PALETTE_FAMILIES.apricot_rose.variants.balanced,['#FFD166','#F28FB5','#FFC5A3','#F7E2B3']);
  assert.deepEqual(PALETTE_FAMILIES.dream_sparkles.colors,['#79B2FF','#B791FF','#77E5B0','#BCEFFA']);
  assert.deepEqual(PALETTE_FAMILIES.named_blue.colors,['#8FBCEB','#B0CEF0','#CADCF5','#A4C2F4']);
  assert.deepEqual(PALETTE_FAMILIES.named_pink.colors,['#ED9DC8','#F5B4D7','#F8C6E1','#EBA7CF']);
  assert.deepEqual(PALETTE_FAMILIES.neutral_gray.colors,['#B9B9B9','#D5D5D5','#EAEAEA','#FAFAFA']);
});

test('exchange and mixed-feeling palettes form luminous related gradients with their spatial color roles intact',()=>{
  for(const variant of PALETTE_VARIANTS) {
    const exchange=selectPalette(plan('luminous_current',variant,4));
    assert.ok(exchange.every(rgb=>['blue','purple'].includes(colorGroup(rgb))),`${variant}: exchange colors stay within a coherent cool gradient`);
    assert.ok(exchange.every(rgb=>luminance(rgb)>.42),`${variant}: soft rings remain luminous`);
    for(const rgb of exchange)assert.ok((Math.max(...rgb)-Math.min(...rgb))/255>.15,`${variant}: exchange colors keep chroma`);
    const mixed=selectPalette(plan('mixed_warm_cool',variant,4));
    assert.ok(mixed.slice(0,2).every(rgb=>['pink','red','orange'].includes(colorGroup(rgb))),`${variant}: the first pair remains warm`);
    assert.ok(mixed.slice(2).every(rgb=>['blue','purple'].includes(colorGroup(rgb))),`${variant}: the second pair remains cool`);
    assert.ok(mixed.every(rgb=>luminance(rgb)>.42),`${variant}: coexistence stays bright`);
    assert.ok(mixed.every(rgb=>(Math.max(...rgb)-Math.min(...rgb))/255>.15),`${variant}: mixed feelings are not gray`);
    // A yellow/blue opposition makes isolated patches; related rose/lilac
    // colors keep a visible warm/cool difference while supporting soft overlap.
    assert.ok(magnitude(mixed[0],mixed[2])<120,`${variant}: warm and cool can blend through a gentle bridge`);
  }
  for(const family of ['recovery_glow','rest_glow'])for(const variant of PALETTE_VARIANTS) {
    const colors=selectPalette(plan(family,variant,4));
    assert.ok(colors.slice(0,2).every(rgb=>['blue','green','purple'].includes(colorGroup(rgb))),`${family}/${variant}: cool base pair`);
    assert.ok(colors.slice(2).every(rgb=>['yellow','orange','red','pink'].includes(colorGroup(rgb))),`${family}/${variant}: warm accent pair`);
  }
});

test('every family and variant honors named hue exclusions and replays its resolved family',()=>{
  for(const family of Object.keys(PALETTE_FAMILIES))for(const variant of PALETTE_VARIANTS)for(const hue of Object.keys(NAMED_COLOR_FAMILIES)) {
    const requested=plan(family,variant,4),preferences={avoidedColors:[hue]};
    const chosen=resolvePaletteFamily(requested,preferences);
    const colors=selectPalette(requested,preferences);
    assert.ok(chosen&&isPaletteAllowed(chosen,preferences),`${family}/${variant} excludes ${hue}`);
    assert.ok(colors.every(rgb=>colorGroup(rgb)!==hue),`${family}/${variant} renders no ${hue}`);
    assert.deepEqual(colors,selectPalette(plan(chosen,variant,4)),`${family}/${variant} exports its actual colors`);
  }
});

test('seven named options keep the requested visible hue in every variant',()=>{
  assert.equal(Object.keys(NAMED_COLOR_FAMILIES).length,7);
  assert.ok(['mixed_warm_cool','recovery_glow','rest_glow'].every(id=>PALETTE_FAMILIES[id]));
  for(const [hue,family] of Object.entries(NAMED_COLOR_FAMILIES)) {
    assert.deepEqual(PALETTE_FAMILIES[family].tags,[hue]);
    for(const variant of PALETTE_VARIANTS) {
      const colors=selectPalette(plan(family,variant,4));
      assert.equal(colors.length,4);
      for(const color of colors)assert.equal(colorGroup(color),hue,`${family}/${variant}`);
    }
  }
});

test('referential rejection changes the actual palette, even when it was locked',()=>{
  for(const family of Object.keys(PALETTE_FAMILIES)) {
    const current=plan(family),before={lockedPalette:{...current},avoidedColors:[],rejectedPalettes:[]};
    const after={...before,lockedPalette:null,rejectedPalettes:[family]};
    const next=replacementPalette(current,after,before);
    assert.ok(next&&next!==family,`${family} has a genuine replacement`);
    assert.ok(isPaletteAllowed(next,after));
    const originalColors=selectPalette(current,before),nextColors=selectPalette({...current,paletteFamily:next},after);
    assert.notDeepEqual(nextColors,originalColors);
    assert.ok(magnitude(mean(originalColors),mean(nextColors))>35,`${family} changes visibly, rather than merely rotating color order`);
  }
});

test('hue bans and rejection history override locks, and resolver agrees with output',()=>{
  const current=plan('named_blue'),prefs={avoidedColors:['blue','purple'],rejectedPalettes:['lilac_blush','peach_amber'],lockedPalette:{...current}};
  assert.equal(isPaletteAllowed('named_blue',prefs),false);
  assert.equal(isPaletteAllowed('named_purple',prefs),false);
  assert.equal(isPaletteAllowed('peach_amber',prefs),false);
  const family=resolvePaletteFamily(current,prefs);
  assert.ok(family&&isPaletteAllowed(family,prefs));
  assert.deepEqual(selectPalette(current,prefs),selectPalette(plan(family),{...prefs,lockedPalette:null}));
  assert.ok(selectPalette(current,prefs).every(color=>!prefs.avoidedColors.includes(colorGroup(color))));
  const locked={...prefs,lockedPalette:plan('named_pink','accented',2)};
  assert.equal(resolvePaletteFamily(current,locked),'named_pink');
  assert.deepEqual(selectPalette(current,locked),selectPalette(plan('named_pink','accented',2)));
});

test('successive replacement avoids every rejected family and honors hue exclusions',()=>{
  let current=plan('lilac_blush');
  let prefs={avoidedColors:['blue','pink','purple'],rejectedPalettes:[],lockedPalette:null};
  for(let i=0;i<5;i++) {
    const displayedFamily=resolvePaletteFamily(current,prefs);
    const nextPrefs={...prefs,rejectedPalettes:[...prefs.rejectedPalettes,displayedFamily]};
    const next=replacementPalette(current,nextPrefs,prefs);
    assert.ok(next&&!nextPrefs.rejectedPalettes.includes(next));
    assert.ok(selectPalette(plan(next),nextPrefs).every(color=>!prefs.avoidedColors.includes(colorGroup(color))));
    current=plan(next);prefs=nextPrefs;
  }
});

test('all-hue avoidance uses an achromatic fallback and total rejection fails safely',()=>{
  const prefs={avoidedColors:Object.keys(NAMED_COLOR_FAMILIES)};
  assert.equal(resolvePaletteFamily(plan('lilac_blush'),prefs),'neutral_gray');
  assert.ok(isPaletteAllowed('neutral_gray',prefs));
  assert.equal(isPaletteAllowed('neutral_haze',prefs),false);
  assert.ok(selectPalette(plan('lilac_blush'),prefs).every(([r,g,b])=>r===g&&g===b));
  for(const variant of PALETTE_VARIANTS) {
    const exportedPlan=plan(resolvePaletteFamily(plan('lilac_blush'),prefs),variant,4);
    assert.deepEqual(selectPalette(exportedPlan),selectPalette(exportedPlan,prefs),'exported gray plan replays without hidden preference state');
    assert.ok(selectPalette(exportedPlan).every(([r,g,b])=>r===g&&g===b));
  }
  const exhausted={...prefs,rejectedPalettes:['neutral_gray']};
  assert.equal(resolvePaletteFamily(plan('lilac_blush'),exhausted),null);
  assert.equal(replacementPalette(plan('neutral_gray'),exhausted,prefs),null);
  assert.ok(selectPalette({},exhausted).every(([r,g,b])=>r===g&&g===b));
});

test('old preference objects and malformed counts remain safe',()=>{
  assert.equal(resolvePaletteFamily(plan('missing'),{}),'lilac_blush');
  assert.equal(selectPalette({paletteFamily:'lilac_blush',colorCount:NaN}).length,3);
  assert.ok(selectPalette({},{}).every(color=>color.every(Number.isFinite)));
});

const semanticPlan=(primary='joy',secondary='sadness',balance=.7)=>({responseType:'mixed',...plan('mixed_warm_cool','balanced',4),feelingPrimary:primary,feelingSecondary:secondary,feelingBalance:balance});

test('mixed feeling colors come from two luminous related pairs rather than one fixed warm/cool theme',()=>{
  const defaultMixed=selectMixedPalette(semanticPlan());
  assert.equal(defaultMixed.primary,'joy');
  assert.equal(defaultMixed.secondary,'sadness');
  assert.equal(defaultMixed.balance,.7);
  assert.equal(defaultMixed.colors.length,4);
  assert.ok(defaultMixed.colors.slice(0,2).every(rgb=>['yellow','orange'].includes(colorGroup(rgb))),'birthday delight has a gold/apricot primary glow');
  assert.ok(defaultMixed.colors.slice(2).every(rgb=>colorGroup(rgb)==='blue'),'loneliness keeps a separate blue/periwinkle glow');
  assert.deepEqual(selectPalette(semanticPlan()),defaultMixed.colors);
  const pairSignatures=new Set();
  for(const feeling of Object.keys(FEELING_PALETTES))for(const variant of PALETTE_VARIANTS) {
    const current={...semanticPlan(feeling,feeling==='sadness'?'joy':'sadness'),paletteVariant:variant};
    const colors=selectPalette(current);
    pairSignatures.add(JSON.stringify(colors.slice(0,2)));
    assert.equal(colors.length,4);
    assert.ok(magnitude(colors[0],colors[1])<125,`${feeling}/${variant} has a continuous pair for one glow`);
    for(const color of colors) {
      assert.ok(luminance(color)>.34,`${feeling}/${variant} stays luminous`);
      assert.ok((Math.max(...color)-Math.min(...color))/255>.17,`${feeling}/${variant} has visible chroma`);
      assert.notEqual(colorGroup(color),'neutral',`${feeling}/${variant} does not wash into gray`);
    }
  }
  assert.equal(pairSignatures.size,18,'six feeling groups each retain their own three variants');
  const reversed=selectPalette(semanticPlan('sadness','joy',.8));
  assert.deepEqual(reversed.slice(0,2),defaultMixed.colors.slice(2),'the primary group changes rather than assuming warmth is always dominant');
  assert.deepEqual(reversed.slice(2),defaultMixed.colors.slice(0,2));
});

test('semantic hues obey bans while preserving the pair structure and a valid family for replay',()=>{
  for(const primary of Object.keys(FEELING_PALETTES))for(const variant of PALETTE_VARIANTS)for(const avoided of Object.keys(NAMED_COLOR_FAMILIES)) {
    const current={...semanticPlan(primary,primary==='sadness'?'joy':'sadness'),paletteVariant:variant};
    const prefs={avoidedColors:[avoided]};
    const colors=selectPalette(current,prefs);
    assert.equal(resolvePaletteFamily(current,prefs),'mixed_warm_cool','a hue ban need not erase the feeling combination');
    assert.equal(colors.length,4);
    assert.ok(colors.every(rgb=>colorGroup(rgb)!==avoided),`${primary}/${variant} respects declined ${avoided}`);
  }
  const noBlue=selectPalette(semanticPlan(),{avoidedColors:['blue']});
  assert.ok(noBlue.slice(2).every(rgb=>colorGroup(rgb)==='purple'),'sadness moves to a nearby violet pair when blue is declined');
  const gray=selectPalette(semanticPlan(),{avoidedColors:Object.keys(NAMED_COLOR_FAMILIES)});
  assert.ok(gray.every(([r,g,b])=>r===g&&g===b),'an explicit decline of every hue takes precedence');
  const rejectedPrefs={rejectedPalettes:['mixed_warm_cool']};
  assert.equal(selectMixedPalette(semanticPlan(),rejectedPrefs),null);
  assert.notEqual(resolvePaletteFamily(semanticPlan(),rejectedPrefs),'mixed_warm_cool');
});

test('manual families and explicit locks keep their own colors instead of acquiring semantic hues',()=>{
  const current=semanticPlan();
  for(const family of ['named_pink','named_blue','luminous_current','peach_amber']) {
    const manual={...current,paletteFamily:family};
    assert.equal(selectMixedPalette(manual),null);
    assert.deepEqual(selectPalette(manual),selectPalette(plan(family,'balanced',4)));
    const prefs={lockedPalette:plan(family,'accented',2)};
    assert.equal(selectMixedPalette(current,prefs),null);
    assert.deepEqual(selectPalette(current,prefs),selectPalette(plan(family,'accented',2)));
  }
  const plainMixedLock={lockedPalette:plan('mixed_warm_cool','balanced',3)};
  assert.equal(selectMixedPalette(current,plainMixedLock),null,'an old static lock remains the old palette');
  assert.deepEqual(selectPalette(current,plainMixedLock),selectPalette(plan('mixed_warm_cool')));
});

test('keeping a semantic palette freezes both feeling pairs and variant across later situations',()=>{
  const original={...semanticPlan('calm','anxiety',.8),paletteVariant:'accented'};
  const settings=paletteSettings(original);
  assert.ok(isSemanticMixedPalette(settings));
  assert.equal(settings.feelingBalance,.8);
  const next={...semanticPlan('joy','anger',.55),responseType:'celebrate',paletteFamily:'apricot_rose'};
  const prefs={lockedPalette:settings,avoidedColors:['blue']};
  assert.equal(resolvePaletteFamily(next,prefs),'mixed_warm_cool');
  assert.deepEqual(selectPalette(next,prefs),selectPalette(original,{avoidedColors:['blue']}));
  const selected=selectMixedPalette(next,prefs);
  assert.equal(selected.primary,'calm');
  assert.equal(selected.secondary,'anxiety');
  assert.equal(selected.balance,.8);
  assert.deepEqual(paletteSettings({...original,paletteFamily:'named_pink'}),plan('named_pink','accented',4),'named locks do not retain hidden semantic fields');
  assert.equal(selectMixedPalette({...semanticPlan(),feelingSecondary:'none'}),null);
  assert.equal(selectMixedPalette({...semanticPlan(),feelingSecondary:'joy'}),null);
  assert.equal(isSemanticMixedPalette(null),false);
});

test('an open complex-feeling scene keeps the reference cyan, aqua, pink and lime without assigning unspoken feelings',()=>{
  const current={...semanticPlan(),mixedMode:'open',feelingTertiary:'none',feelingBalance:.5};
  for(const variant of PALETTE_VARIANTS) {
    const selected=selectMixedPalette({...current,paletteVariant:variant});
    assert.equal(selected.mode,'open');
    assert.equal(selected.primary,'none');
    assert.equal(selected.secondary,'none');
    assert.equal(selected.tertiary,'none');
    assert.equal(selected.balance,.5);
    assert.equal(selected.colors.length,4);
    assert.deepEqual(selected.colors.map(colorGroup),['blue','blue','pink','green'],'the open field retains cyan/aqua, pink and lime instead of orchid and peach');
    const [sky,aqua,pink,lime]=selected.colors;
    assert.ok(sky[2]-sky[1]>30,'sky blue keeps a clear blue edge');
    assert.ok(Math.abs(aqua[1]-aqua[2])<15&&aqua[1]-aqua[0]>90,'aqua has a distinct turquoise role');
    assert.ok(Math.min(pink[0],pink[2])-pink[1]>50,'pink is chromatic instead of washed into gray');
    assert.ok(lime[1]-lime[0]>35&&lime[1]-lime[2]>100,'lime provides a clean light green/yellow note');
    for(const color of selected.colors) {
      assert.ok(luminance(color)>.38,`${variant}: each open-ended region stays luminous`);
      assert.ok((Math.max(...color)-Math.min(...color))/255>.17,`${variant}: each region keeps distinct chroma`);
    }
    assert.deepEqual(selectPalette({...current,paletteVariant:variant,seed:10}),selectPalette({...current,paletteVariant:variant,seed:987654}),'changing a motion seed does not recolor a saved composition');
  }
  assert.ok(isSemanticMixedPalette({...current,feelingPrimary:'none',feelingSecondary:'none'}),'open mode does not need a fabricated emotion pair');
  for(const variant of PALETTE_VARIANTS)for(const avoided of Object.keys(NAMED_COLOR_FAMILIES)) {
    const prefs={avoidedColors:[avoided]};
    const colors=selectPalette({...current,paletteVariant:variant},prefs);
    assert.equal(colors.length,4);
    assert.ok(colors.every(color=>colorGroup(color)!==avoided),`open/${variant} respects declined ${avoided}`);
    assert.equal(resolvePaletteFamily(current,prefs),'mixed_warm_cool');
  }
  const gray=selectPalette(current,{avoidedColors:Object.keys(NAMED_COLOR_FAMILIES)});
  assert.ok(gray.every(([r,g,b])=>r===g&&g===b),'open mode honors a deliberate ban of every hue');
});

test('three-feeling compositions retain one main gradient and two individual secondary hues',()=>{
  const current={...semanticPlan('joy','sadness',.6),mixedMode:'layered',feelingTertiary:'anxiety'};
  const selected=selectMixedPalette(current);
  assert.equal(selected.mode,'layered');
  assert.equal(selected.tertiary,'anxiety');
  assert.equal(selected.balance,.6);
  assert.deepEqual(selected.colors.slice(0,2),selectPalette(semanticPlan()).slice(0,2),'the primary region has its full related gradient');
  assert.deepEqual(selected.colors[2],selectPalette(semanticPlan('sadness','joy'))[0]);
  assert.deepEqual(selected.colors[3],selectPalette(semanticPlan('anxiety','joy'))[0]);
  const warm=selectPalette({...current,feelingSecondary:'hope',feelingTertiary:'anger'});
  assert.ok(warm.every(color=>['yellow','orange','red','pink'].includes(colorGroup(color))),'a three-feeling scene can be entirely warm rather than always cold versus warm');
  for(const variant of PALETTE_VARIANTS)for(const avoided of Object.keys(NAMED_COLOR_FAMILIES)) {
    const colors=selectPalette({...current,paletteVariant:variant},{avoidedColors:[avoided]});
    assert.equal(colors.length,4);
    assert.ok(colors.every(color=>colorGroup(color)!==avoided),`layered/${variant} respects declined ${avoided}`);
  }
  assert.equal(selectMixedPalette({...current,feelingTertiary:'joy'}).mode,'paired','a duplicated third feeling cannot create a fictitious third semantic role');
});

test('paired composition can stay fully warm or fully cool according to the expressed feelings',()=>{
  for(const [primary,secondary] of [['joy','hope'],['hope','joy']])for(const variant of PALETTE_VARIANTS) {
    const colors=selectPalette({...semanticPlan(primary,secondary),mixedMode:'paired',paletteVariant:variant});
    assert.ok(colors.every(color=>['yellow','orange','red','pink'].includes(colorGroup(color))),`${primary}/${secondary}/${variant} does not force a cool accent into shared warmth`);
    assert.equal(new Set(colors.map(color=>color.join(','))).size,4,'the two warm regions retain four distinct core colors');
    for(const avoided of Object.keys(NAMED_COLOR_FAMILIES))assert.ok(selectPalette({...semanticPlan(primary,secondary),paletteVariant:variant},{avoidedColors:[avoided]}).every(color=>colorGroup(color)!==avoided));
  }
  const cool=selectPalette(semanticPlan('calm','sadness'));
  assert.ok(cool.every(color=>['blue','green','purple'].includes(colorGroup(color))),'calm and sadness can coexist as an entirely cool field');
  const anticipation=selectPalette(semanticPlan('hope','anxiety'));
  assert.equal(colorGroup(anticipation[0]),'green','hope still uses its mint gradient when warm companions do not call for gold');
});

test('keeping a new mixed composition preserves mode and third role across later situations',()=>{
  for(const mode of ['paired','layered','open']) {
    const current={...semanticPlan('calm','anxiety',.8),mixedMode:mode,feelingTertiary:mode==='layered'?'hope':'none',paletteVariant:'accented'};
    const settings=paletteSettings(current);
    assert.equal(settings.mixedMode,mode);
    assert.equal(settings.feelingTertiary,current.feelingTertiary);
    const next={...semanticPlan(),responseType:'celebrate',paletteFamily:'apricot_rose',seed:89};
    const prefs={lockedPalette:settings,avoidedColors:['blue']};
    assert.deepEqual(selectPalette(next,prefs),selectPalette(current,{avoidedColors:['blue']}),`${mode}: a later scene cannot recolor the kept palette`);
    assert.equal(selectMixedPalette(next,prefs).mode,mode);
    const manual={...current,paletteFamily:'named_pink'};
    assert.deepEqual(paletteSettings(manual),plan('named_pink','accented',4),'manual hues discard all semantic composition fields');
  }
  const legacy=semanticPlan();
  assert.equal(Object.hasOwn(paletteSettings(legacy),'mixedMode'),false,'legacy palette exports keep their original field shape');
  assert.equal(Object.hasOwn(paletteSettings(legacy),'feelingTertiary'),false);
});
