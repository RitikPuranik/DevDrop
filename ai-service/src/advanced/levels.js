'use strict';
/**
 * Advanced build levels: low | moderate | max.
 *
 * The user picks a level on the Review step. The backend validates it and forwards it in payload.advanced.level; this module turns
 * it into REAL differences in what the pipeline does:
 *   - budget: a fraction of the plan's limits (never above them, and never below a floor that keeps the pipeline workable)
 *   - quality layers: low = structure + build, moderate = + browser functional/responsive checks, max = + AI visual review
 *   - repair rounds: capped per level
 *   - a short "brief" injected into the planner / architecture / code agents so the OUTPUT depth matches the level
 *
 * Every level still runs the full advanced pipeline (requirements -> plan -> design system -> architecture -> dependency-ordered
 * generation -> integration -> build check -> repair), so even "low" is clearly better than the basic generation.
 * There is still NO file-count cap at any level: depth is steered by guidance, resources by the budget.
 */
const LEVELS = ['low', 'moderate', 'max'];
const DEFAULT_LEVEL = 'max'; // what an advanced job did before levels existed, so older clients/jobs keep their behaviour

const PROFILES = Object.freeze({
  low: {
    id: 'low', label: 'Low', budgetScale: 0.35, maxRepairAttempts: 2,
    qa: { browser: false, visual: false },
    floors: { maxWallClockMs: 15 * 60 * 1000, maxLlmCalls: 80, maxTotalTokens: 600_000, maxCostUsd: 0.5 },
    brief: 'BUILD LEVEL: LOW (fast). Build a clean, complete and polished site with the essential pages and sections only. Prefer a compact, well-organised architecture and reuse components. Skip optional extras (secondary pages, elaborate animation, optional modules) unless the user explicitly asked for them. Quality of what is built still matters: real working navigation, forms and responsive layout.',
  },
  moderate: {
    id: 'moderate', label: 'Moderate', budgetScale: 0.65, maxRepairAttempts: 4,
    qa: { browser: true, visual: false },
    floors: { maxWallClockMs: 25 * 60 * 1000, maxLlmCalls: 160, maxTotalTokens: 1_500_000, maxCostUsd: 1.2 },
    brief: 'BUILD LEVEL: MODERATE (balanced). Build every page and feature the request implies, plus the recommended supporting pages that clearly help this kind of site. Use thoughtful, reusable architecture, meaningful section variety per page and purposeful micro-interactions. Content and behaviour must be complete and tested in a real browser.',
  },
  max: {
    id: 'max', label: 'Max', budgetScale: 1, maxRepairAttempts: Infinity,
    qa: { browser: true, visual: true },
    floors: {},
    brief: 'BUILD LEVEL: MAX (highest quality). Build the most complete, premium version of this website: all requested and recommended pages, rich and distinct page layouts, deep feature behaviour (search, filters, validation, empty/loading/error states), refined typography/spacing/motion, accessibility and responsive polish at every breakpoint. Extra helper modules are welcome when they make the product genuinely better.',
  },
});

function normalizeLevel(value) {
  const v = String(value ?? '').trim().toLowerCase();
  return LEVELS.includes(v) ? v : null;
}
const resolveLevel = (value) => normalizeLevel(value) || DEFAULT_LEVEL;
const profileFor = (value) => PROFILES[resolveLevel(value)];

/** Scales already-clamped limits down for the level. Can only lower values, so it can never exceed plan or operator ceilings. */
function applyLevel(limits, value) {
  const p = profileFor(value);
  if (p.budgetScale >= 1) return { ...limits, maxRepairAttempts: Math.min(limits.maxRepairAttempts, p.maxRepairAttempts) };
  const scaled = (key, round = (n) => Math.round(n)) => {
    const target = round(limits[key] * p.budgetScale);
    const floor = p.floors[key] ?? 0;
    return Math.min(limits[key], Math.max(target, floor));
  };
  return {
    ...limits,
    maxWallClockMs: scaled('maxWallClockMs'),
    maxLlmCalls: scaled('maxLlmCalls'),
    maxTotalTokens: scaled('maxTotalTokens'),
    maxCostUsd: scaled('maxCostUsd', (n) => Number(n.toFixed(2))),
    maxRepairAttempts: Math.min(limits.maxRepairAttempts, p.maxRepairAttempts),
  };
}

/** Appends the level brief to an agent's system prompt (no-op without a level, so non-advanced callers are unchanged). */
const withLevelBrief = (system, level) => (level ? `${system}\n\n${profileFor(level).brief}` : system);

module.exports = { LEVELS, DEFAULT_LEVEL, PROFILES, normalizeLevel, resolveLevel, profileFor, applyLevel, withLevelBrief };
