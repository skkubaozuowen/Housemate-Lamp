export const PALETTE_VARIANTS = Object.freeze(['misted', 'balanced', 'accented']);
const families = [
  // Luminous chromatic pastels keep the diffused light legible against white.
  ['lilac_blush','Lilac & blush',['#C0A4FF','#FFA7D4','#E5C6FF','#FFF4FC']],
  ['mist_blue','Mist blue',['#78D4EE','#A3E4F3','#BDEDF8','#F0FAFF']],
  ['peach_amber','Peach & amber',['#FFAA85','#FFD578','#FFD2B4','#FFF3DC']],
  ['rose_lavender','Rose & lavender',['#F99AC8','#C2A0F5','#F1C3EC','#FFF0FA']],
  ['sage_cream','Sage & cream',['#B3DFA5','#E9ED9E','#CFECC1','#FAF7E3']],
  ['dusk_indigo','Violet, rose red & blue',['#BDA3FC','#FF8494','#81B7FF','#F1ECFF']],
  ['apricot_rose','Apricot & rose',['#FFD166','#F28FB5','#FFC5A3','#F7E2B3']],
  ['sea_glass','Sea glass',['#7EDCCA','#A3D7F5','#BAEEDC','#EFFCF7']],
  ['luminous_current','Blue, periwinkle & lilac',['#A1C3F1','#B4B9F2','#C5B3EE','#9FD9E9']],
  ['dream_sparkles','Blue, violet & mint',['#79B2FF','#B791FF','#77E5B0','#BCEFFA']],
  // Ordered pairs are spatial roles in the final compositions: warm/cool for
  // coexistence, cool/warm for recovery and the recognition within a tiring day.
  ['mixed_warm_cool','Feeling gradients',['#F5B1D0','#FAC3B6','#C4B3EF','#ADC6EF']],
  ['recovery_glow','Blue violet & emerging warmth',['#9CB8F6','#B39DF1','#FFC58A','#FFD67E']],
  ['regrowth_glow','Violet waves & growing mint',['#ABB5FF','#C0A6FA','#65DCC7','#A4E580']],
  ['renewal_gold','Violet, rose red & emerging gold',['#BDA3FC','#FF8494','#FFDF66','#FFF0AE']],
  ['violet_current','Violet & periwinkle current',['#AD8BFA','#9EB7FF','#D5A2F4','#C7BEFF']],
  ['horizon_glow','Violet & warm encouragement',['#AD8BFA','#B9AAFA','#FFB58D','#FFD775']],
  ['rest_glow','Water & a warm note',['#78D4EE','#8CE4CF','#FFD17F','#FFB59D']],
  ['mauve_sand','Orchid & peach',['#D3A5F6','#FFB7CE','#FFD1AD','#FFF1F8']],
  ['coral_clay','Coral & apricot',['#FFA59B','#FFC38E','#FFD2A9','#FFF0DE']],
  ['neutral_haze','Neutral haze',['#9AA6B2','#CBD2DD','#E8E9F0','#FAF8F5']],
  // Single-hue options make explicit requests ("use pink") unambiguous. They
  // supplement, rather than replace, the original mixed-color compositions.
  ['named_blue','Soft blue',['#8FBCEB','#B0CEF0','#CADCF5','#A4C2F4']],
  ['named_pink','Soft pink',['#ED9DC8','#F5B4D7','#F8C6E1','#EBA7CF']],
  ['named_purple','Soft purple',['#B79AE8','#C8ADF0','#D8C2F5','#C5A5EA']],
  ['named_green','Soft green',['#A5D6B0','#B4DEBC','#C6E6C8','#9FCDA9']],
  ['named_orange','Soft orange',['#F4B58E','#F8C5A2','#FBD3B4','#EBB488']],
  ['named_red','Soft red',['#EE9999','#F2B2AE','#F6C5BF','#ECA4A4']],
  ['named_yellow','Soft yellow',['#F4EE89','#F8F2AB','#FBF7C5','#EEE88F']],
  // A real family keeps an exported all-hues-declined plan self-contained.
  ['neutral_gray','Soft gray',['#B9B9B9','#D5D5D5','#EAEAEA','#FAFAFA']],
];
export const NAMED_COLOR_FAMILIES = Object.freeze({blue:'named_blue',pink:'named_pink',purple:'named_purple',green:'named_green',orange:'named_orange',red:'named_red',yellow:'named_yellow'});
const hexToRGB = hex => hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value,16));
const rgbToHex = rgb => `#${rgb.map(value => Math.round(value).toString(16).padStart(2,'0')).join('').toUpperCase()}`;
// Hue ranges apply to perceptible chroma. Near-white and gray are left neutral.
export function colorGroup(rgb) {
  const [r,g,b] = rgb.map(value => value / 255);
  const max = Math.max(r,g,b), min = Math.min(r,g,b), chroma = max - min;
  if (chroma < .055) return 'neutral';
  let hue = max === r ? ((g-b)/chroma)%6 : max === g ? (b-r)/chroma+2 : (r-g)/chroma+4;
  hue = (hue*60+360)%360;
  if (hue < 15 || hue >= 345) return 'red';
  if (hue < 45) return 'orange';
  if (hue < 75) return 'yellow';
  if (hue < 170) return 'green';
  if (hue < 255) return 'blue';
  if (hue < 290) return 'purple';
  return 'pink';
}
function makeVariants(colors) {
  const misted = colors.map(hex => rgbToHex(hexToRGB(hex).map(value => value*.79+255*.21)));
  const accented = colors.map((hex,index) => {
    const rgb = hexToRGB(hex), average = rgb.reduce((sum,value)=>sum+value,0)/3;
    return rgbToHex(rgb.map(value => Math.max(0,Math.min(255,average+(value-average)*(index === 0 ? 1.25 : 1.08)))));
  });
  return {misted,balanced:[...colors],accented};
}
export const PALETTE_FAMILIES = Object.freeze(Object.fromEntries(families.map(([id,label,colors]) => {
  const variants = makeVariants(colors);
  const tags = [...new Set(Object.values(variants).flat().map(hex => colorGroup(hexToRGB(hex))).filter(group=>group!=='neutral'))];
  return [id,Object.freeze({label,colors:Object.freeze(colors),tags:Object.freeze(tags),variants:Object.freeze(variants)})];
})));

const GRAYSCALE = Object.freeze(['#B9B9B9','#D5D5D5','#EAEAEA','#FAFAFA']);
const list = value => Array.isArray(value) ? value : [];
const rejected = (id,preferences) => list(preferences?.rejectedPalettes).includes(id);

// These are prototype expression choices, rather than universal assignments of
// a color to an emotion. Related pairs provide a luminous gradient within a
// region; the scene can hold two named feelings, three, or an open combination
// without forcing the user to name feelings they described as hard to separate.
export const FEELING_PALETTES = Object.freeze({
  joy: Object.freeze({label:'Joy · gold & apricot',pairs:[['#FFD35C','#FFB477'],['#FFB477','#FFA4B2'],['#F5D96C','#FFE1A0']]}),
  sadness: Object.freeze({label:'Sadness · blue & periwinkle',pairs:[['#71BFF3','#9BA5EF'],['#B2A0F0','#C5AAF1'],['#71CFC7','#A2E3DB']]}),
  calm: Object.freeze({label:'Calm · aqua & mint',pairs:[['#6BDAC8','#A5E8CD'],['#7FD4EA','#B1E5ED'],['#B8DA9E','#D4E8AC']]}),
  anxiety: Object.freeze({label:'Anxiety · orchid & lilac',pairs:[['#BA94F2','#D3A1EF'],['#E7A0DA','#EDB2E2'],['#98AEF1','#BAC8F5']]}),
  hope: Object.freeze({label:'Hope · mint & soft gold',pairs:[['#8CDEAF','#D9E98C'],['#EBD777','#FFD69A'],['#85D8D1','#ADE7E0']]}),
  anger: Object.freeze({label:'Anger · coral & rose',pairs:[['#F38D98','#F6ACBB'],['#FFA183','#FFC09C'],['#ECA3D7','#F3BDD9']]}),
});
const validFeeling = feeling => Object.hasOwn(FEELING_PALETTES,feeling);
const mixedMode = plan => {
  if(plan?.paletteFamily!=='mixed_warm_cool')return null;
  if(plan.mixedMode==='open')return 'open';
  if(!validFeeling(plan.feelingPrimary)||!validFeeling(plan.feelingSecondary)||plan.feelingPrimary===plan.feelingSecondary)return null;
  return plan.mixedMode==='layered'&&validFeeling(plan.feelingTertiary)
    && ![plan.feelingPrimary,plan.feelingSecondary].includes(plan.feelingTertiary) ? 'layered' : 'paired';
};
const mixedBalance = source => Number.isFinite(source.feelingBalance) ? Math.max(.5,Math.min(.9,source.feelingBalance)) : .7;
export function isSemanticMixedPalette(plan = {}) {
  return Boolean(mixedMode(plan));
}
const semanticAllowed = (plan,preferences) => isSemanticMixedPalette(plan) && !rejected('mixed_warm_cool',preferences);
const lockAllowed = (lock,preferences) => lock && (semanticAllowed(lock,preferences)||isPaletteAllowed(lock.paletteFamily,preferences));

// Saving a palette must preserve semantic pairs as well as the family name:
// otherwise "keep this color" could change when the next situation arrives.
export function paletteSettings(plan = {}) {
  const settings={paletteFamily:plan.paletteFamily,paletteVariant:plan.paletteVariant,colorCount:plan.colorCount};
  if(isSemanticMixedPalette(plan)) {
    Object.assign(settings,{feelingPrimary:plan.feelingPrimary,feelingSecondary:plan.feelingSecondary,feelingBalance:mixedBalance(plan)});
    // Older exports contain only the feeling pair. Retain that shape while
    // preserving all role information in newer two/three-region palettes.
    if(['paired','layered','open'].includes(plan.mixedMode))settings.mixedMode=plan.mixedMode;
    if(Object.hasOwn(plan,'feelingTertiary'))settings.feelingTertiary=plan.feelingTertiary;
  }
  return settings;
}

export function isPaletteAllowed(id,preferences = {}) {
  const family=PALETTE_FAMILIES[id];
  if(!family||rejected(id,preferences))return false;
  return !family.tags.some(tag=>list(preferences?.avoidedColors).includes(tag));
}

export function resolvePaletteFamily(plan = {},preferences = {}) {
  const lock=preferences?.lockedPalette;
  if(semanticAllowed(lock,preferences))return 'mixed_warm_cool';
  if(lock&&isPaletteAllowed(lock.paletteFamily,preferences))return lock.paletteFamily;
  // A semantic pair may substitute a nearby permitted hue when a color is
  // declined, without turning the whole mixed-feeling scene into one hue.
  if(semanticAllowed(plan,preferences))return 'mixed_warm_cool';
  if(isPaletteAllowed(plan?.paletteFamily,preferences))return plan.paletteFamily;
  return Object.keys(PALETTE_FAMILIES).find(id=>isPaletteAllowed(id,preferences))||null;
}

function effectiveOptions(plan,preferences,family) {
  const lock=preferences?.lockedPalette;
  const validLock=lock&&lock.paletteFamily===family&&lockAllowed(lock,preferences) ? lock : {};
  const requestedVariant=validLock.paletteVariant||plan?.paletteVariant;
  const variant=PALETTE_VARIANTS.includes(requestedVariant) ? requestedVariant : 'balanced';
  const requestedCount=Number(validLock.colorCount??plan?.colorCount??3);
  const count=Number.isFinite(requestedCount) ? Math.max(1,Math.min(4,Math.round(requestedCount))) : 3;
  return {variant,count};
}

export function selectMixedPalette(plan = {},preferences = {}) {
  const lock=preferences?.lockedPalette;
  const source=lockAllowed(lock,preferences) ? lock : plan;
  if(!semanticAllowed(source,preferences))return null;
  const mode=mixedMode(source);
  const {variant,count}=effectiveOptions(plan,preferences,'mixed_warm_cool');
  const avoided=list(preferences.avoidedColors);
  const alternatives=Object.values(PALETTE_FAMILIES).flatMap(family=>family.variants[variant]).map(hexToRGB);
  const allowedColors=preferred=>{
    const allowed=[...preferred,...alternatives].filter(rgb=>colorGroup(rgb)!=='neutral'&&!avoided.includes(colorGroup(rgb)));
    return allowed.filter((rgb,index)=>allowed.findIndex(other=>other.every((channel,i)=>channel===rgb[i]))===index);
  };
  if(mode==='open') {
    // The saved co-design reference combines clear sky blue, aqua, pink and
    // lime within one luminous field. These are expression choices rather
    // than diagnosed feelings when the user's own description stays open.
    const original=makeVariants(['#42BAFF','#3EDBD6','#ED8ADE','#B5EB58'])[variant].map(hexToRGB);
    const permitted=allowedColors(original);
    const used=[];
    const colors=original.map(color=>{
      if(!avoided.includes(colorGroup(color))){used.push(color);return color;}
      const nearby=permitted.filter(candidate=>!used.some(other=>other.every((channel,i)=>channel===candidate[i])))
        .sort((a,b)=>Math.hypot(...a.map((value,i)=>value-color[i]))-Math.hypot(...b.map((value,i)=>value-color[i])));
      const replacement=nearby[0]||permitted[0]||hexToRGB(GRAYSCALE[used.length%GRAYSCALE.length]);
      used.push(replacement);return replacement;
    });
    return {mode,primary:'none',secondary:'none',tertiary:'none',balance:.5,colors:colors.slice(0,count)};
  }
  const feelings=[source.feelingPrimary,source.feelingSecondary,...(mode==='layered'?[source.feelingTertiary]:[])];
  const feelingColors=feeling=>{
    let pairs=FEELING_PALETTES[feeling].pairs;
    // Hope can share an entirely warm composition with joy or renewed energy.
    // It need not introduce mint into every palette that contains hope.
    if(feeling==='hope'&&feelings.every(value=>['joy','hope','anger'].includes(value)))pairs=[pairs[1],pairs[0],pairs[2]];
    const preferred=pairs.flatMap(pair=>makeVariants(pair)[variant]).map(hexToRGB);
    // When all related alternatives are declined, explicit hue preferences
    // take precedence. The remaining family colors are still light, soft hues.
    const unique=allowedColors(preferred);
    return (unique.length ? [unique[0],unique[1]||unique[0]] : GRAYSCALE.slice(0,2).map(hexToRGB));
  };
  const colors=[...feelingColors(source.feelingPrimary),...(mode==='layered'
    ? [feelingColors(source.feelingSecondary)[0],feelingColors(source.feelingTertiary)[0]]
    : feelingColors(source.feelingSecondary))];
  return {mode,primary:source.feelingPrimary,secondary:source.feelingSecondary,
    tertiary:mode==='layered'?source.feelingTertiary:'none',balance:mixedBalance(source),colors:colors.slice(0,count)};
}

export function selectPalette(plan = {},preferences = {}) {
  const mixed=selectMixedPalette(plan,preferences);
  if(mixed)return mixed.colors;
  const family=resolvePaletteFamily(plan,preferences);
  const {variant,count}=effectiveOptions(plan,preferences,family);
  // If rejection history excludes every possible family, the caller can offer
  // a new choice; the renderer still receives safe neutral data in the meantime.
  const colors=!family ? GRAYSCALE : PALETTE_FAMILIES[family].variants[variant];
  return colors.slice(0,count).map(hexToRGB);
}

function paletteDistance(first,second) {
  // Symmetric nearest-color distance penalizes palettes that merely reorder
  // existing colors. Hue contrast receives extra weight beyond pastel RGB.
  const colorDistance=(a,b)=>{
    const rgb=Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
    const firstHue=colorGroup(a),secondHue=colorGroup(b);
    return rgb+(firstHue!==secondHue ? (firstHue==='neutral'||secondHue==='neutral' ? 12 : 42) : 0);
  };
  const direction=(a,b)=>a.reduce((sum,color)=>sum+Math.min(...b.map(other=>colorDistance(color,other))),0)/a.length;
  return (direction(first,second)+direction(second,first))/2;
}

export function replacementPalette(currentPlan = {},preferences = {},previousPreferences = preferences) {
  const previousFamily=resolvePaletteFamily(currentPlan,previousPreferences);
  const displayed=selectPalette(currentPlan,previousPreferences);
  // Replacement intentionally chooses a new family even if the old palette was
  // locked. The planner clears that lock when accepting the correction.
  const unlocked={...preferences,lockedPalette:null};
  const choices=Object.keys(PALETTE_FAMILIES).filter(id=>id!==previousFamily&&isPaletteAllowed(id,unlocked));
  let best=null,bestDistance=-1;
  for(const family of choices) {
    const candidate=selectPalette({...currentPlan,paletteFamily:family},unlocked);
    const distance=paletteDistance(displayed,candidate);
    if(distance>bestDistance){best=family;bestDistance=distance;}
  }
  return best;
}
