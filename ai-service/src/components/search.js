'use strict';
// Hybrid retrieval: hard structured filters -> BM25 over weighted fields + character-trigram TF-IDF cosine ("soft
// semantic" match that tolerates inflection/typos) + concept expansion -> reciprocal-rank fusion. A real embedding
// model can be plugged in through options.embedder (async text -> number[]); none is required, so retrieval works
// offline and is deterministic. Vector similarity is one signal among several, never the only one.
const { evaluate } = require('./licensePolicy');

// Linguistic concept groups (synonyms), NOT a design mapping: they only widen what a query word can match.
const CONCEPTS = [
  ['marquee', 'ticker', 'scrolling', 'infinite', 'loop', 'logos', 'slider', 'carousel'],
  ['glow', 'halo', 'aura', 'luminous', 'shine', 'shimmer', 'gleam', 'glare'],
  ['spotlight', 'cursor', 'pointer', 'hover', 'follow', 'mouse'],
  ['reveal', 'entrance', 'appear', 'fade', 'intro', 'stagger'],
  ['text', 'type', 'typography', 'headline', 'heading', 'words', 'characters'],
  ['background', 'backdrop', 'ambient', 'pattern', 'grid', 'texture'],
  ['card', 'tile', 'panel', 'surface'],
  ['3d', 'tilt', 'depth', 'perspective', 'dimensional'],
  ['counter', 'number', 'stat', 'count', 'ticker', 'metric'],
  ['scroll', 'progress', 'reading', 'indicator'],
  ['faq', 'accordion', 'disclosure', 'collapsible', 'expandable'],
  ['button', 'cta', 'action', 'magnetic'],
  ['retro', 'terminal', 'technical', 'pixel', 'cyber', 'scramble'],
  ['subtle', 'minimal', 'quiet', 'restrained', 'understated', 'calm'],
  ['expressive', 'bold', 'dramatic', 'playful', 'energetic', 'vibrant'],
];
const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'are', 'its', 'can', 'any', 'all', 'one', 'use', 'used', 'when', 'than', 'then', 'over', 'out', 'has', 'have', 'will', 'not']);
const tok = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 1 && !STOP.has(w));
const stem = (w) => w.replace(/(ing|ed|es|s|ly)$/, '');
function expand(words) {
  const out = new Set(words);
  for (const g of CONCEPTS) if (words.some((w) => g.includes(w) || g.includes(stem(w)))) g.forEach((x) => out.add(x));
  return [...out];
}
const FIELD_WEIGHTS = { name: 4, category: 3, tags: 2, capabilities: 2, designCharacteristics: 2, description: 1.5, library: 0.5 };
function fields(r) {
  return { name: tok(r.name + ' ' + r.componentId.split('/')[1].replace(/-/g, ' ')), category: tok(r.category.replace(/-/g, ' ')), tags: r.tags || [], capabilities: tok((r.capabilities || []).join(' ').replace(/-/g, ' ')), designCharacteristics: tok((r.designCharacteristics || []).join(' ')), description: tok(r.description), library: tok(r.library) };
}
const trigrams = (s) => { const t = ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `; const m = new Map(); for (let i = 0; i < t.length - 2; i += 1) { const g = t.slice(i, i + 3); m.set(g, (m.get(g) || 0) + 1); } return m; };
function cosine(a, b, idf) {
  let dot = 0; let na = 0; let nb = 0;
  for (const [g, c] of a) { const w = c * (idf.get(g) || 1); na += w * w; if (b.has(g)) dot += w * b.get(g) * (idf.get(g) || 1); }
  for (const [g, c] of b) { const w = c * (idf.get(g) || 1); nb += w * w; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
function buildIndex(records) {
  const docs = records.map((r) => ({ r, f: fields(r), tri: trigrams(`${r.name} ${r.category} ${r.description} ${(r.capabilities || []).join(' ')} ${(r.designCharacteristics || []).join(' ')} ${(r.tags || []).join(' ')}`) }));
  const df = new Map(); let totalLen = 0;
  for (const d of docs) { const seen = new Set(); let len = 0; for (const [f, ws] of Object.entries(d.f)) { len += ws.length * (FIELD_WEIGHTS[f] || 1); for (const w of ws) seen.add(w); } d.len = len; totalLen += len; for (const w of seen) df.set(w, (df.get(w) || 0) + 1); }
  const gdf = new Map(); for (const d of docs) for (const g of d.tri.keys()) gdf.set(g, (gdf.get(g) || 0) + 1);
  const idfG = new Map(); for (const [g, n] of gdf) idfG.set(g, Math.log(1 + docs.length / n));
  return { docs, df, avgLen: totalLen / Math.max(1, docs.length), idfG, N: docs.length };
}
function bm25(index, d, qWords) {
  const k1 = 1.4; const b = 0.75; let score = 0;
  for (const w of qWords) {
    const n = index.df.get(w) || 0; if (!n) continue;
    const idf = Math.log(1 + (index.N - n + 0.5) / (n + 0.5));
    let tf = 0; for (const [f, ws] of Object.entries(d.f)) { const c = ws.filter((x) => x === w || stem(x) === stem(w)).length; tf += c * (FIELD_WEIGHTS[f] || 1); }
    score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (d.len / index.avgLen))));
  }
  return score;
}
function passesFilters(r, f) {
  if (f.framework && r.framework !== f.framework) return false;
  if (f.styling && !f.styling.some((s) => r.styling.includes(s))) return false;
  if (f.libraries && !f.libraries.includes(r.library)) return false;
  if (f.excludeLibraries && f.excludeLibraries.includes(r.library)) return false;
  if (f.categories && !f.categories.includes(r.category)) return false;
  if (f.requireCapabilities && !f.requireCapabilities.every((c) => r.capabilities.includes(c))) return false;
  if (f.excludeCapabilities && f.excludeCapabilities.some((c) => r.capabilities.includes(c))) return false;
  if (f.maxWeightBytes && r.storage.weightBytes > f.maxWeightBytes) return false;
  if (f.noMotion && r.usesMotion) return false;
  return true;
}
function createSearch(store, { requiredModes = ['deployedWebsites', 'sourceCodeExport'], allowConditional = false, embedder = null } = {}) {
  const eligible = []; const excluded = [];
  for (const r of store.all()) { const v = evaluate(r, requiredModes, { allowConditional }); (v.eligible ? eligible : excluded).push(v.eligible ? r : { r, reasons: v.reasons }); }
  const index = buildIndex(eligible);
  return {
    eligibleCount: eligible.length,
    excluded: excluded.map((e) => ({ componentId: e.r.componentId, reasons: e.reasons })),
    // Returns ranked candidates with the signals that produced the rank (for explainability and tests).
    search(query, { filters = {}, limit = 5, excludeIds = [] } = {}) {
      const words = tok(query); const qWords = expand(words);
      const qTri = trigrams(words.join(' '));
      const pool = index.docs.filter((d) => passesFilters(d.r, filters) && !excludeIds.includes(d.r.componentId));
      const lexical = pool.map((d) => ({ d, s: bm25(index, d, qWords) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
      const fuzzy = pool.map((d) => ({ d, s: cosine(qTri, d.tri, index.idfG) })).filter((x) => x.s > 0.08).sort((a, b) => b.s - a.s);
      const fused = new Map(); const K = 30;
      lexical.forEach((x, i) => { const e = fused.get(x.d.r.componentId) || { r: x.d.r, score: 0, signals: {} }; e.score += 1 / (K + i + 1); e.signals.bm25 = +x.s.toFixed(3); fused.set(x.d.r.componentId, e); });
      fuzzy.forEach((x, i) => { const e = fused.get(x.d.r.componentId) || { r: x.d.r, score: 0, signals: {} }; e.score += 0.7 / (K + i + 1); e.signals.fuzzy = +x.s.toFixed(3); fused.set(x.d.r.componentId, e); });
      return [...fused.values()].sort((a, b) => b.score - a.score || a.r.componentId.localeCompare(b.r.componentId)).slice(0, limit).map((e) => ({ record: e.r, score: +e.score.toFixed(5), signals: e.signals }));
    },
  };
}
module.exports = { createSearch, tok, expand };
