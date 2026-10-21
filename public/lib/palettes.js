export const PALETTE_VARIANTS = Object.freeze(['misted', 'balanced', 'accented']);
const families = [
  // Luminous chromatic pastels keep the diffused light legible against white.
  ['lilac_blush','Lilac & blush',['#C0A4FF','#FFA7D4','#E5C6FF','#FFF4FC']],
  ['mist_blue','Mist blue',['#78D4EE','#A3E4F3','#BDEDF8','#F0FAFF']],
  ['peach_amber','Peach & amber',['#FFAA85','#FFD578','#FFD2B4','#FFF3DC']],
  ['rose_lavender','Rose & lavender',['#F99AC8','#C2A0F5','#F1C3EC','#FFF0FA']],
  ['sage_cream','Sage & cream',['#B3DFA5','#E9ED9E','#CFECC1','#FAF7E3']],
  ['dusk_indigo','Periwinkle & violet',['#ABB5FF','#C0A6FA','#D8C2FF','#F1ECFF']],
  ['apricot_rose','Apricot & rose',['#FFD166','#F28FB5','#FFC5A3','#F7E2B3']],
  ['sea_glass','Sea glass',['#7EDCCA','#A3D7F5','#BAEEDC','#EFFCF7']],
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

export function isPaletteAllowed(id,preferences = {}) {
  const family=PALETTE_FAMILIES[id];
  if(!family||rejected(id,preferences))return false;
  return !family.tags.some(tag=>list(preferences?.avoidedColors).includes(tag));
}

export function resolvePaletteFamily(plan = {},preferences = {}) {
  const lock=preferences?.lockedPalette;
  if(lock&&isPaletteAllowed(lock.paletteFamily,preferences))return lock.paletteFamily;
  if(isPaletteAllowed(plan?.paletteFamily,preferences))return plan.paletteFamily;
  return Object.keys(PALETTE_FAMILIES).find(id=>isPaletteAllowed(id,preferences))||null;
}

function effectiveOptions(plan,preferences,family) {
  const lock=preferences?.lockedPalette;
  const validLock=lock&&lock.paletteFamily===family&&isPaletteAllowed(family,preferences) ? lock : {};
  const requestedVariant=validLock.paletteVariant||plan?.paletteVariant;
  const variant=PALETTE_VARIANTS.includes(requestedVariant) ? requestedVariant : 'balanced';
  const requestedCount=Number(validLock.colorCount??plan?.colorCount??3);
  const count=Number.isFinite(requestedCount) ? Math.max(1,Math.min(4,Math.round(requestedCount))) : 3;
  return {variant,count};
}

export function selectPalette(plan = {},preferences = {}) {
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
