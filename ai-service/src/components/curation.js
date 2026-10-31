'use strict';
// Stage D: Component Evaluation. The model chooses what to do with candidates; this module makes sure the choice is
// legal: ids must come from the candidate set, counts and dependencies are budgeted, nothing is invented.
const DECISIONS = ['use', 'restyle', 'restructure', 'combine', 'inspire', 'custom'];
const { resolve } = require('./dependencyResolver');

function validateCuration(value, discovery, store, { maxComponents = 6, maxNewDependencies = 6, existingDeps = {} } = {}) {
  const sectionIds = new Set(discovery.sections.map((s) => s.sectionId));
  const allowedFor = new Map(discovery.sections.map((s) => [s.sectionId, new Set(s.candidates.map((c) => c.componentId))]));
  const globalIds = new Set(discovery.global.map((c) => c.componentId));
  const notes = []; const items = []; let total = 0;
  for (const d of Array.isArray(value?.decisions) ? value.decisions : []) {
    if (!d || typeof d !== 'object') continue;
    const decision = DECISIONS.includes(d.decision) ? d.decision : null;
    if (!decision) { notes.push('ignored decision with unknown type'); continue; }
    const sectionId = typeof d.sectionId === 'string' ? d.sectionId : null;
    if (sectionId !== 'global' && !sectionIds.has(sectionId)) { notes.push(`ignored decision for unknown section "${sectionId}"`); continue; }
    if (decision === 'custom') { items.push({ sectionId, decision, componentIds: [], rationale: String(d.rationale || '').slice(0, 300), adaptation: [] }); continue; }
    const pool = sectionId === 'global' ? globalIds : allowedFor.get(sectionId);
    const ids = [...new Set((Array.isArray(d.componentIds) ? d.componentIds : []).filter((id) => typeof id === 'string'))];
    const legal = ids.filter((id) => pool.has(id) || (sectionId !== 'global' && globalIds.has(id)));
    if (legal.length !== ids.length) notes.push(`dropped ${ids.length - legal.length} component id(s) that were not candidates`);
    if (!legal.length) continue;
    if (decision === 'combine' && legal.length < 2) { notes.push(`"combine" for ${sectionId} needs 2+ components; treated as "restyle"`); d.decision = 'restyle'; }
    const final = decision === 'combine' && legal.length < 2 ? 'restyle' : decision;
    const capped = final === 'combine' ? legal.slice(0, 3) : legal.slice(0, 1);
    if (total + capped.length > maxComponents) { notes.push(`component budget (${maxComponents}) reached; skipped ${sectionId}`); continue; }
    total += capped.length;
    items.push({ sectionId, decision: final, componentIds: capped, rationale: String(d.rationale || '').slice(0, 400), adaptation: (Array.isArray(d.adaptation) ? d.adaptation : []).filter((x) => typeof x === 'string').map((x) => x.slice(0, 240)).slice(0, 12) });
  }
  // dependency budget: resolve against the vetted list; components that cannot be satisfied are dropped to "custom".
  const records = items.flatMap((i) => i.componentIds).map((id) => store.get(id));
  const dep = resolve(records, existingDeps, { maxNewDependencies });
  const rejectedIds = new Set(dep.rejected.map((r) => r.componentId));
  for (const it of items) if (it.componentIds.some((id) => rejectedIds.has(id))) { notes.push(`${it.sectionId}: ${it.componentIds.filter((id) => rejectedIds.has(id)).join(', ')} dropped (${dep.rejected.find((r) => it.componentIds.includes(r.componentId)).reason}); building custom`); it.componentIds = []; it.decision = 'custom'; it.adaptation = []; }
  return { items, dependencies: dep.added, notes, rejected: dep.rejected };
}
module.exports = { validateCuration, DECISIONS };
