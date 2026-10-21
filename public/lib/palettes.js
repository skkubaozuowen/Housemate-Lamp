export const PALETTE_VARIANTS = Object.freeze(['misted', 'balanced', 'accented']);
const families = [
  ['lilac_blush','Lilac & blush',['#C6B4F8','#F6B9D6','#E8D6FF','#FFF8F3']],
  ['mist_blue','Mist blue',['#79B9C5','#ACC9D2','#C5DEE8','#F3F8FA']],
  ['peach_amber','Peach & amber',['#FFAD8F','#F5D28D','#FFD9C8','#FFF4E8']],
  ['rose_lavender','Rose & lavender',['#F2ADC7','#BDB0E6','#E7D9EE','#FBEFF5']],
  ['sage_cream','Sage & cream',['#B9CFB1','#EFE4BC','#D8E2CF','#F7F5EA']],
  ['dusk_indigo','Dusk indigo',['#899AC2','#A59BC6','#C2BCD6','#E8E6F2']],
  ['apricot_rose','Apricot & rose',['#FFD166','#F28FB5','#FFC5A3','#F7E2B3']],
  ['sea_glass','Sea glass',['#84C7BC','#A8C6DC','#B5DFD5','#EDF8F3']],
  ['mauve_sand','Mauve & sand',['#BCA4B5','#D6BCB4','#E7D8CB','#F6EEE9']],
  ['coral_clay','Coral & clay',['#C98176','#D99B72','#E6B17A','#EAD5C9']],
  ['neutral_haze','Neutral haze',['#9AA6B2','#CBD2DD','#E8E9F0','#FAF8F5']],
];
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

export function selectPalette(plan = {}, preferences = {}) {
  const locked = preferences.lockedPalette || {};
  const requestedFamily = locked.paletteFamily || plan.paletteFamily || 'lilac_blush';
  const variant = PALETTE_VARIANTS.includes(locked.paletteVariant || plan.paletteVariant) ? (locked.paletteVariant || plan.paletteVariant) : 'balanced';
  const count = Math.max(1,Math.min(4,Math.round(locked.colorCount || plan.colorCount || 3)));
  const avoided = new Set(Array.isArray(preferences.avoidedColors) ? preferences.avoidedColors : []);
  const allowed = hex => !avoided.has(colorGroup(hexToRGB(hex)));
  const candidates = [requestedFamily,...Object.keys(PALETTE_FAMILIES).filter(id=>id!==requestedFamily)];
  // Prefer a whole, coherent allowed family over filling gaps with unrelated hues.
  let chosen;
  for (const id of candidates) {
    const family = PALETTE_FAMILIES[id];
    if (!family || family.tags.some(tag=>avoided.has(tag))) continue;
    const colors = family.variants[variant].filter(allowed);
    if (colors.length >= count) { chosen=colors; break; }
  }
  if (!chosen) {
    for (const id of candidates) {
      const family = PALETTE_FAMILIES[id];
      const colors = family?.variants[variant].filter(allowed);
      if (colors?.length >= count) { chosen=colors; break; }
    }
  }
  // All hue groups may be declined. Achromatic fields remain a valid response.
  if (!chosen) chosen=['#B9B9B9','#D5D5D5','#EAEAEA','#FAFAFA'];
  return chosen.slice(0,count).map(hexToRGB);
}
