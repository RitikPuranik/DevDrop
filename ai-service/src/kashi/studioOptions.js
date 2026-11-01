/**
 * What Kashi is allowed to fill in AI Studio. Everything the model returns is validated against this file,
 * so a hallucinated style / palette / field key can never reach the form.
 *
 * Mirror of frontend/src/config/aiStudio.config.js (ids only). Update both together.
 * Detail FIELD keys are NOT mirrored here: the client sends the keys of the form the user is looking at.
 */
const WEBSITE_TYPES = ['portfolio', 'ecommerce', 'blog', 'landing', 'cafe', 'hotel', 'studio', 'event', 'education', 'custom'];
const STYLES = ['minimal', 'modern', 'bold', 'editorial', 'creative', 'glass', 'clay', 'brutalist', 'brutalism', 'cyberpunk', 'neumorphism', 'bento', 'retro', 'luxury', 'corporate', 'organic', 'retrofuturist', 'maximalist'];
const THEMES = ['dark', 'light', 'neutral', 'midnight', 'warm', 'auto'];
const ANIMATIONS = ['none', 'subtle', 'scroll', 'interactive', 'parallax', 'kinetic', 'dynamic'];
const PALETTES = ['amber', 'ocean', 'violet', 'emerald', 'earth', 'plum', 'mono', 'sunset', 'rose', 'cloud', 'neon', 'crimson'];
const TYPOGRAPHY = ['grotesk', 'serif', 'contemporary', 'neo', 'geometric', 'humanist', 'mono', 'rounded', 'condensed'];
const STEPS = ['types', 'details', 'design', 'review'];

const MAX_FIELDS = 40;
const MAX_VALUE = 1500;
const KEY_RE = /^[A-Za-z][A-Za-z0-9]{0,40}$/;

/** Normalises the studio snapshot the browser sends (untrusted). */
function sanitizeStudioContext(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const websiteType = WEBSITE_TYPES.includes(raw.websiteType) ? raw.websiteType : null;
  const step = STEPS.includes(raw.step) ? raw.step : (websiteType ? 'details' : 'types');
  const fields = (Array.isArray(raw.fields) ? raw.fields : [])
    .filter((f) => f && typeof f.key === 'string' && KEY_RE.test(f.key))
    .slice(0, MAX_FIELDS)
    .map((f) => ({ key: f.key, label: String(f.label || f.key).slice(0, 60), list: Boolean(f.list) }));
  const filled = (Array.isArray(raw.filled) ? raw.filled : []).filter((k) => typeof k === 'string' && KEY_RE.test(k)).slice(0, MAX_FIELDS);
  return { websiteType, step, fields, filled };
}

const pick = (value, allowed) => (typeof value === 'string' && allowed.includes(value) ? value : null);
const cleanText = (value) => (typeof value === 'string' ? value.replace(/\u0000/g, '').trim().slice(0, MAX_VALUE) : '');

/**
 * Turns the model's `studio_fill` into something the form can apply as-is.
 * Returns null when there is nothing valid to apply.
 */
function sanitizeStudioFill(raw, studio) {
  if (!raw || typeof raw !== 'object') return null;
  const out = { websiteType: pick(raw.website_type ?? raw.websiteType, WEBSITE_TYPES), details: {}, design: {} };

  // Details can only target fields of the form that is on screen.
  const allowedKeys = new Map((studio?.fields || []).map((f) => [f.key, f]));
  const rawDetails = Array.isArray(raw.details)
    ? raw.details
    : Object.entries(raw.details && typeof raw.details === 'object' ? raw.details : {}).map(([key, value]) => ({ key, value }));
  for (const item of rawDetails) {
    const field = item && allowedKeys.get(item.key);
    if (!field) continue;
    const value = cleanText(item.value);
    if (value) out.details[field.key] = value;
  }

  const d = raw.design && typeof raw.design === 'object' ? raw.design : {};
  const style = pick(d.style, STYLES);
  const theme = pick(d.theme, THEMES);
  const paletteId = pick(d.palette_id ?? d.paletteId, PALETTES);
  const typography = pick(d.typography, TYPOGRAPHY);
  const animations = (Array.isArray(d.animations) ? d.animations : []).map((a) => pick(a, ANIMATIONS)).filter(Boolean);
  const primary = typeof (d.primary_color ?? d.primaryColor) === 'string' && /^#[0-9a-f]{6}$/i.test(d.primary_color ?? d.primaryColor) ? (d.primary_color ?? d.primaryColor) : null;
  const notes = cleanText(d.custom_prompt ?? d.customPrompt);
  if (style) out.design.style = style;
  if (theme) out.design.theme = theme;
  if (paletteId) out.design.paletteId = paletteId;
  if (typography) out.design.typography = typography;
  if (animations.length) out.design.animationList = [...new Set(animations)];
  if (primary) out.design.primaryColor = primary;
  if (notes) out.design.customPrompt = notes;

  const hasDetails = Object.keys(out.details).length > 0;
  const hasDesign = Object.keys(out.design).length > 0;
  if (!out.websiteType && !hasDetails && !hasDesign) return null;
  return { websiteType: out.websiteType, details: out.details, design: out.design };
}

function describeStudio(studio) {
  if (!studio) return '';
  const lines = [`Current step: ${studio.step}${studio.websiteType ? `, website type: ${studio.websiteType}` : ', no website type chosen yet'}.`];
  if (studio.fields.length) {
    const filled = new Set(studio.filled);
    lines.push('Detail fields on the form (key — label [filled|empty]):');
    studio.fields.forEach((f) => lines.push(`- ${f.key} — ${f.label}${f.list ? ' (comma separated list)' : ''} [${filled.has(f.key) ? 'filled' : 'empty'}]`));
  }
  return lines.join('\n');
}

function describeStudioOptions() {
  return [
    `website_type ids: ${WEBSITE_TYPES.join(', ')}`,
    `design.style ids: ${STYLES.join(', ')}`,
    `design.theme ids: ${THEMES.join(', ')}`,
    `design.animations ids (any combination): ${ANIMATIONS.join(', ')}`,
    `design.palette_id ids: ${PALETTES.join(', ')}`,
    `design.typography ids: ${TYPOGRAPHY.join(', ')}`,
  ].join('\n');
}

module.exports = { WEBSITE_TYPES, STYLES, THEMES, ANIMATIONS, PALETTES, TYPOGRAPHY, sanitizeStudioContext, sanitizeStudioFill, describeStudio, describeStudioOptions };
