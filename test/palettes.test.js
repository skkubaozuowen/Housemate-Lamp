import test from 'node:test';
import assert from 'node:assert/strict';
import {PALETTE_FAMILIES,PALETTE_VARIANTS,NAMED_COLOR_FAMILIES,colorGroup,isPaletteAllowed,resolvePaletteFamily,replacementPalette,selectPalette} from '../public/lib/palettes.js';
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
  assert.deepEqual(PALETTE_FAMILIES.named_blue.colors,['#8FBCEB','#B0CEF0','#CADCF5','#A4C2F4']);
  assert.deepEqual(PALETTE_FAMILIES.named_pink.colors,['#ED9DC8','#F5B4D7','#F8C6E1','#EBA7CF']);
  assert.deepEqual(PALETTE_FAMILIES.neutral_gray.colors,['#B9B9B9','#D5D5D5','#EAEAEA','#FAFAFA']);
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
  assert.equal(Object.keys(PALETTE_FAMILIES).length,19);
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
