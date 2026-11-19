// Bounded visual orchestration, not measurements of a person's emotional state.
// This module stays independent so saved plans, the planner and renderer agree.
export const COMPOSITION_DEFAULTS = Object.freeze({
  fieldScale: 1, spread: 1, waveWidth: 1, waveCount: 2, rippleCount: 3,
  spotCount: 5, accentScale: 1, accentWeight: 1, stagger: 1,
  supportDelay: .28, supportStrength: 1, elongation: 1
});
export const COMPOSITION_LIMITS = Object.freeze(Object.fromEntries(Object.entries({
  fieldScale: [.75, 1.25], spread: [.8, 1.2], waveWidth: [.7, 1.4],
  waveCount: [1, 4], rippleCount: [1, 5], spotCount: [2, 7],
  accentScale: [.65, 1.5], accentWeight: [.35, 1.5], stagger: [.65, 1.5],
  supportDelay: [.15, .42], supportStrength: [.5, 1.1], elongation: [.8, 1.25]
}).map(([key, bounds]) => [key, Object.freeze(bounds)])));
export const COMPOSITION_INTEGER_FIELDS = Object.freeze(['waveCount', 'rippleCount', 'spotCount']);
const integerFields = new Set(COMPOSITION_INTEGER_FIELDS);
const fields = Object.keys(COMPOSITION_DEFAULTS);
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
export function normalizeComposition(raw, fallback = COMPOSITION_DEFAULTS) {
  const source = record(raw), base = record(fallback);
  return Object.fromEntries(fields.map(key => {
    const [min, max] = COMPOSITION_LIMITS[key];
    let value = Number.isFinite(source[key]) ? source[key] : Number.isFinite(base[key]) ? base[key] : COMPOSITION_DEFAULTS[key];
    if (integerFields.has(key)) value = Math.round(value);
    return [key, Math.max(min, Math.min(max, value))];
  }));
}
export function validateComposition(raw) {
  return Boolean(raw && typeof raw === 'object' && !Array.isArray(raw)
    && Object.keys(raw).length === fields.length && fields.every(key => {
      const value = raw[key], [min, max] = COMPOSITION_LIMITS[key];
      return Object.hasOwn(raw, key) && typeof value === 'number' && Number.isFinite(value)
        && value >= min && value <= max && (!integerFields.has(key) || Number.isInteger(value));
    }));
}
export const COMPOSITION_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false,
  properties: Object.fromEntries(fields.map(key => [key, {
    type: integerFields.has(key) ? 'integer' : 'number',
    minimum: COMPOSITION_LIMITS[key][0], maximum: COMPOSITION_LIMITS[key][1]
  }])),
  required: fields
});
