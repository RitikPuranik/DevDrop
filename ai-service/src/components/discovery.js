'use strict';
// Stage C: Component Discovery. Queries are composed from the DESIGN (section purpose/variant + visual direction +
// the design agent's own animation/component-style text). There is no table from website category to component.
const { tok } = require('./search');
const MIN_SCORE = 0.02; // below this a hit is noise: better to build the section custom

function sectionQuery(section, spec, design) {
  const motion = spec?.visualDirection?.motionIntensity;
  const style = spec?.visualDirection?.style || design?.designSystem?.style || '';
  const feel = [style, motion && motion !== 'none' ? motion : '', ...(spec?.interactions || []).filter((i) => tok(i).some((w) => tok(`${section.component} ${section.variant} ${section.purpose}`).includes(w)))].join(' ');
  return `${section.component} ${section.variant} ${section.purpose} ${feel}`.replace(/-/g, ' ');
}
function card(hit) {
  const r = hit.record;
  return { componentId: r.componentId, name: r.name, library: r.library, category: r.category, description: r.description, capabilities: r.capabilities, designCharacteristics: r.designCharacteristics, dependencies: Object.keys(r.dependencies), weightBytes: r.storage.weightBytes, reducedMotionAware: r.capabilities.includes('reduced-motion-aware'), licenseSpdx: r.license.spdx, rank: hit.score };
}
function discover({ search, spec, design, limit = 4 }) {
  const sections = spec?.layout?.pageStructure || [];
  const filters = { framework: 'react', ...(spec?.visualDirection?.motionIntensity === 'none' ? { noMotion: true } : {}) };
  const out = [];
  const seen = new Set();
  for (const s of sections) {
    const q = sectionQuery(s, spec, design);
    const hits = search.search(q, { filters, limit }).filter((h) => h.score >= MIN_SCORE);
    hits.forEach((h) => seen.add(h.record.componentId));
    out.push({ sectionId: s.id, component: s.component, variant: s.variant, purpose: s.purpose, query: q, candidates: hits.map(card) });
  }
  // One design-wide query from the design agent's own words (animation/component style) for accents no section asked for.
  const ds = design?.designSystem || {};
  const gq = [ds.animationStrategy, ds.componentStyle, spec?.visualDirection?.style].filter((x) => typeof x === 'string').join(' ').slice(0, 300);
  const global = gq && filters.noMotion !== true ? search.search(gq, { filters, limit, excludeIds: [] }).filter((h) => h.score >= MIN_SCORE && !seen.has(h.record.componentId)).map(card) : [];
  return { sections: out, global };
}
module.exports = { discover, sectionQuery, MIN_SCORE };
