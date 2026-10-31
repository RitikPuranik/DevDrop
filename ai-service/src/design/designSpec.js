'use strict';
// Schema + validation for the structured design specification that downstream agents must follow.
const SPEC_VERSION = 1;
const DENSITIES = ['compact', 'balanced', 'spacious'];
const COMPOSITIONS = ['image-led', 'type-led', 'product-led', 'content-led', 'data-led', 'project-led', 'menu-led', 'booking-led'];
const MOTION = ['none', 'subtle', 'moderate', 'expressive'];
const RADII = ['sharp', 'soft', 'round'];
const COMPONENTS = [
  'navigation', 'hero', 'about', 'features', 'use-cases', 'pricing', 'testimonials', 'cta', 'footer', 'menu', 'gallery',
  'reservation-form', 'location-hours', 'rooms', 'amenities', 'availability-search', 'booking-form', 'product-grid',
  'filters', 'product-detail', 'cart', 'project-index', 'project-detail', 'services', 'process', 'contact-form',
  'article-list', 'article-feed', 'categories', 'newsletter', 'schedule', 'speakers', 'registration-form', 'curriculum',
  'instructors', 'enrol-cta', 'stats', 'data-table', 'overview-cards', 'chart-panel', 'empty-state', 'faq', 'resume-actions',
  'product-showcase', 'logo-strip', 'sections-custom',
];
const STYLE_IDS = ['minimal', 'modern', 'bold', 'editorial', 'creative', 'glass', 'clay', 'brutalist', 'brutalism', 'cyberpunk', 'neumorphism', 'bento', 'retro', 'luxury', 'corporate', 'organic', 'retrofuturist', 'maximalist'];
// Families checked as OFL-licensed in the Google Fonts metadata snapshot (see docs/SKILL_LICENSES.md). Stacks always end in system fallbacks.
const FONT_ALLOWLIST = ['Space Grotesk', 'Inter', 'Playfair Display', 'Poppins', 'Montserrat', 'Nunito', 'Quicksand', 'JetBrains Mono', 'Oswald', 'Source Sans 3', 'Open Sans', 'DM Serif Display', 'Lato', 'Fraunces', 'DM Sans', 'Manrope', 'Cormorant Garamond', 'Space Mono', 'Anton'];

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function parseHex(hex) {
  if (typeof hex !== 'string' || !HEX_RE.test(hex)) return null;
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
const toHex = (rgb) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
function luminance(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const la = luminance(a); const lb = luminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
function mix(a, b, t) {
  const x = parseHex(a); const y = parseHex(b);
  if (!x || !y) return a;
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

const GENERIC_PARTS = new Set(['navigation', 'hero', 'features', 'testimonials', 'cta', 'footer']);
// The "centered hero + feature cards + testimonials + footer" skeleton that every generated site tends to collapse to.
function isGenericTemplate(pageStructure) {
  const comps = (pageStructure || []).map((s) => s.component);
  return comps.length > 0 && comps.every((c) => GENERIC_PARTS.has(c)) && comps.includes('features') && comps.includes('testimonials');
}

function validateDesignSpec(spec) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const obj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (!obj(spec)) return { ok: false, errors: ['designSpec must be an object'], warnings };
  if (spec.version !== SPEC_VERSION) err(`version must be ${SPEC_VERSION}`);
  for (const k of ['projectType', 'businessCategory']) if (typeof spec[k] !== 'string' || !spec[k].trim()) err(`${k} is required`);

  const vd = spec.visualDirection;
  if (!obj(vd)) err('visualDirection is required');
  else {
    if (!STYLE_IDS.includes(vd.style)) err(`visualDirection.style "${vd.style}" is not a known style`);
    if (!DENSITIES.includes(vd.density)) err(`visualDirection.density must be one of ${DENSITIES.join(', ')}`);
    if (!COMPOSITIONS.includes(vd.composition)) err(`visualDirection.composition must be one of ${COMPOSITIONS.join(', ')}`);
    if (!MOTION.includes(vd.motionIntensity)) err(`visualDirection.motionIntensity must be one of ${MOTION.join(', ')}`);
    if (!RADII.includes(vd.radius)) err(`visualDirection.radius must be one of ${RADII.join(', ')}`);
    if (typeof vd.theme !== 'string' || !vd.theme) err('visualDirection.theme is required');
  }

  const p = spec.palette;
  if (!obj(p)) err('palette is required');
  else {
    for (const k of ['background', 'surface', 'text', 'muted', 'accent', 'accentContrast']) if (!HEX_RE.test(p[k] || '')) err(`palette.${k} must be a hex colour`);
    if (HEX_RE.test(p.text || '') && HEX_RE.test(p.background || '')) {
      if (contrast(p.text, p.background) < 4.5) err(`palette text/background contrast ${contrast(p.text, p.background).toFixed(2)} is below 4.5:1`);
    }
    if (HEX_RE.test(p.text || '') && HEX_RE.test(p.surface || '') && contrast(p.text, p.surface) < 4.5) err('palette text/surface contrast is below 4.5:1');
    if (HEX_RE.test(p.accentStrong || p.accent || '') && HEX_RE.test(p.background || '') && contrast(p.accentStrong || p.accent, p.background) < 3) err('palette accent/background contrast is below 3:1 for UI elements');
    if (HEX_RE.test(p.accent || '') && HEX_RE.test(p.accentContrast || '') && contrast(p.accent, p.accentContrast) < 4.5) warnings.push('text on accent surfaces is below 4.5:1');
  }

  const t = spec.typography;
  if (!obj(t)) err('typography is required');
  else for (const k of ['heading', 'body']) {
    if (!obj(t[k])) { err(`typography.${k} is required`); continue; }
    if (!FONT_ALLOWLIST.includes(t[k].family) && t[k].family !== 'system') err(`typography.${k}.family "${t[k].family}" is not an approved family`);
    if (typeof t[k].stack !== 'string' || !/(sans-serif|serif|monospace|system-ui)/.test(t[k].stack)) err(`typography.${k}.stack needs a generic fallback`);
  }

  const l = spec.layout;
  if (!obj(l)) err('layout is required');
  else {
    if (!/^\d{3,4}px$/.test(l.maxWidth || '')) err('layout.maxWidth must be a px value');
    if (l.responsive !== true) err('layout.responsive must be true');
    if (!Array.isArray(l.breakpoints) || !l.breakpoints.length) err('layout.breakpoints is required');
    if (!Array.isArray(l.pageStructure) || l.pageStructure.length < 3) err('layout.pageStructure needs at least 3 sections');
    else {
      const ids = new Set();
      l.pageStructure.forEach((s, i) => {
        if (!obj(s) || !COMPONENTS.includes(s.component)) err(`layout.pageStructure[${i}].component "${s?.component}" is not in the component vocabulary`);
        if (!obj(s) || typeof s.id !== 'string' || ids.has(s.id)) err(`layout.pageStructure[${i}].id must be unique`);
        else ids.add(s.id);
        if (!obj(s) || typeof s.variant !== 'string' || !s.variant) err(`layout.pageStructure[${i}].variant is required`);
      });
      if (isGenericTemplate(l.pageStructure)) err('pageStructure collapses to the generic hero/features/testimonials/footer template');
      const heroes = l.pageStructure.filter((s) => s.component === 'hero').length;
      if (heroes > 1) err('pageStructure may contain at most one hero');
    }
  }

  if (!Array.isArray(spec.components) || !spec.components.length || !spec.components.every((c) => COMPONENTS.includes(c))) err('components must be a non-empty list from the component vocabulary');
  else if (obj(l) && Array.isArray(l.pageStructure)) {
    const used = new Set(l.pageStructure.map((s) => s.component));
    for (const c of spec.components) if (!used.has(c)) err(`component "${c}" is listed but not placed in pageStructure`);
  }
  if (!Array.isArray(spec.interactions)) err('interactions must be an array');
  const mp = spec.motionPlan;
  if (!obj(mp)) err('motionPlan is required');
  else {
    if (!obj(spec.visualDirection) || mp.level !== spec.visualDirection.motionIntensity) err('motionPlan.level must equal visualDirection.motionIntensity');
    if (mp.level !== 'none' && (!Number.isInteger(mp.durationMs) || mp.durationMs < 150 || mp.durationMs > 1200 || !Array.isArray(mp.scroll) || !mp.scroll.length || !Array.isArray(mp.hover) || !mp.hover.length)) err('motionPlan needs a sane duration, scroll and hover behaviours');
  }
  const ia = spec.interactivity;
  if (!obj(ia) || ia.everyControlFunctional !== true) err('interactivity.everyControlFunctional must be true');
  else if (obj(l) && Array.isArray(l.pageStructure) && (!Array.isArray(ia.sectionIds) || ia.sectionIds.join() !== l.pageStructure.map((s) => s.id).join())) err('interactivity.sectionIds must match pageStructure ids');

  const cr = spec.contentRules;
  if (!obj(cr) || cr.preserveUserContent !== true || cr.noInventedFacts !== true || cr.noInventedTestimonials !== true) err('contentRules must forbid invented facts and testimonials and preserve user content');

  const q = spec.qualityRequirements;
  if (!obj(q)) err('qualityRequirements is required');
  else for (const k of ['semanticHtml', 'keyboardAccessible', 'responsive', 'reducedMotionSupport']) if (q[k] !== true) err(`qualityRequirements.${k} must be true`);

  if (spec.mediaUsage !== undefined) {
    if (!Array.isArray(spec.mediaUsage)) err('mediaUsage must be an array');
    else for (const m of spec.mediaUsage) if (!obj(m) || typeof m.assetId !== 'string' || /^(?:https?:|asset:|data:)/i.test(m.assetId)) err('mediaUsage entries carry asset ids only, never URLs');
  }
  return { ok: errors.length === 0, errors, warnings };
}

function assertDesignSpec(spec) {
  const r = validateDesignSpec(spec);
  if (!r.ok) throw Object.assign(new Error(`Invalid designSpec: ${r.errors.slice(0, 8).join('; ')}`), { code: 'DESIGN_SPEC_INVALID', errors: r.errors });
  return spec;
}

module.exports = {
  SPEC_VERSION, DENSITIES, COMPOSITIONS, MOTION, RADII, COMPONENTS, STYLE_IDS, FONT_ALLOWLIST,
  validateDesignSpec, assertDesignSpec, isGenericTemplate, parseHex, toHex, luminance, contrast, mix,
};
