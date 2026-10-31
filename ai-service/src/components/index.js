'use strict';
// Public surface of Component Intelligence. Every call is failure-safe: any error degrades to "no library components"
// (the pre-existing generation path) and never fails a job.
const { readConfig } = require('./config');
const { getDefaultStore, createStore } = require('./store');
const { createSearch } = require('./search');
const { discover } = require('./discovery');
const { validateCuration } = require('./curation');
const { applyPlanToArchitecture, briefFor, CN_SOURCE } = require('./composition');
const { enforce, noticeFile } = require('./provenance');
const { review } = require('./review');
const { normalizeModes } = require('./licensePolicy');
const curationAgent = require('../agents/componentCuration.agent');

const EMPTY_PLAN = Object.freeze({ items: [], dependencies: {}, notes: [], rejected: [], enabled: false });

function createComponentSession({ config, store, distribution, logger = console, agent = curationAgent } = {}) {
  const cfg = config || readConfig();
  let st = store || null;
  let disabledReason = cfg.enabled ? null : 'AI_COMPONENTS_ENABLED=false';
  const requiredModes = normalizeModes(distribution, cfg.requiredModes);
  try { if (!disabledReason) { st = st || getDefaultStore(); if (!st.size()) disabledReason = 'catalog is empty'; } } catch (e) { disabledReason = `catalog unavailable (${e.code || e.name})`; }
  if (!disabledReason && cfg.verifyIntegrity && !store) {
    const bad = st.verifyAll(); if (bad.length) disabledReason = `catalog integrity failure (${bad.length})`;
  }
  if (disabledReason) logger.warn?.(`[COMPONENTS] disabled: ${disabledReason}`);
  let plan = EMPTY_PLAN; let search = null; let discovery = null; let finalReport = []; const injected = new Set();
  const usage = { requiredModes, enabled: !disabledReason };
  return {
    get enabled() { return !disabledReason; },
    get plan() { return plan; },
    async plan_({ design, designSpec, existingDeps = {} }) { return this.makePlan({ design, designSpec, existingDeps }); },
    // Stages C + D. Returns the validated plan (possibly empty).
    async makePlan({ design, designSpec, existingDeps = {}, runAgent = (fn) => fn() }) {
      if (disabledReason || !designSpec) return plan;
      try {
        search = createSearch(st, { requiredModes, allowConditional: cfg.allowConditional });
        discovery = discover({ search, spec: designSpec, design, limit: cfg.candidatesPerSection });
        usage.eligible = search.eligibleCount; usage.excluded = search.excluded.length;
        const withCandidates = discovery.sections.filter((s) => s.candidates.length).length + (discovery.global.length ? 1 : 0);
        usage.sectionsWithCandidates = withCandidates;
        if (!withCandidates) { plan = { ...EMPTY_PLAN, enabled: true, notes: ['no candidates matched the design; all sections are custom'] }; return plan; }
        const res = await runAgent(() => agent.run({ design, designSpec, discovery, limits: { maxComponents: cfg.maxComponents } }));
        const v = validateCuration(res?.value ?? res, discovery, st, { maxComponents: cfg.maxComponents, maxNewDependencies: cfg.maxNewDependencies, existingDeps });
        plan = { ...v, enabled: true };
        logger.log?.(`[COMPONENTS] plan: ${plan.items.filter((i) => i.componentIds.length).map((i) => `${i.sectionId}:${i.decision}(${i.componentIds.join('+')})`).join(' ') || 'all custom'}`);
      } catch (e) { logger.warn?.('[COMPONENTS] planning failed; continuing without library components', { message: e.message }); plan = { ...EMPTY_PLAN, notes: [`planning failed: ${e.message}`] }; }
      return plan;
    },
    // Compact view for the architecture agent (no source).
    planSummary() { return plan.items.filter((i) => i.componentIds.length).map((i) => ({ sectionId: i.sectionId, decision: i.decision, componentIds: i.componentIds, rationale: i.rationale })); },
    applyToArchitecture(architecture) { try { return plan.items.some((i) => i.componentIds.length) ? applyPlanToArchitecture(architecture, plan, st) : architecture; } catch (e) { logger.warn?.('[COMPONENTS] could not apply plan to architecture', { message: e.message }); return architecture; } },
    isDeterministic(contract) { return contract?.deterministic && contract.path === '/lib/utils.js'; },
    deterministicSource() { return CN_SOURCE; },
    briefFor(contract, ctx) { try { return briefFor(contract, plan, st, ctx); } catch (e) { logger.warn?.('[COMPONENTS] brief unavailable', { message: e.message }); return null; } },
    // Idempotent: safe to call after integration and after every debug round.
    finalize(files) {
      if (!plan.items.some((i) => i.componentIds.length)) return { files, report: [], notice: null };
      try {
        const r = enforce(files, plan, st); const notice = noticeFile(r.report, st);
        const out = { ...r.files }; if (notice) out['/THIRD_PARTY_NOTICES.md'] = { code: notice };
        for (const e of r.report) { if (e.headerInjected) injected.add(e.componentId); e.headerInjected = injected.has(e.componentId); } finalReport = r.report; return { files: out, report: r.report, notice };
      } catch (e) { logger.warn?.('[COMPONENTS] finalize failed', { message: e.message }); return { files, report: [], notice: null }; }
    },
    review(files, dependencies) { try { return review({ files, report: finalReport, plan, dependencies }); } catch (e) { return { findings: [], blocking: [] }; } },
    meta() { return { ...usage, plan: plan.items, dependenciesAdded: plan.dependencies, notes: plan.notes, rejected: plan.rejected, applied: finalReport.map(({ componentId, path, decision, similarity, changedLines, headerInjected, license }) => ({ componentId, path, decision, similarity, changedLines, headerInjected, license })) }; },
  };
}
module.exports = { createComponentSession, createStore, getDefaultStore, createSearch, readConfig };
