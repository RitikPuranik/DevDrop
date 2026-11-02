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
 *   - reasoning depth ("thinking") per agent role on every model call, escalated one step on hard steps (invalid code output,
 *     later repair rounds, rolled-back repairs) but never above the level's own ceiling and never when the budget is nearly spent
 *
 * Every level still runs the full advanced pipeline (requirements -> plan -> design system -> architecture -> dependency-ordered
 * generation -> integration -> build check -> repair), so even "low" is clearly better than the basic generation.
 * There is still NO file-count cap at any level: depth is steered by guidance, resources by the budget.
 */
const LEVELS = ['low', 'moderate', 'max'];
const DEFAULT_LEVEL = 'max'; // what an advanced job did before levels existed, so older clients/jobs keep their behaviour

/** Gemini thinking levels, weakest to strongest. Gemini 3 cannot switch thinking fully off; 'minimal' is the closest setting. */
const THINKING_ORDER = Object.freeze(['minimal', 'low', 'medium', 'high']);
const THINKING_ROLES = Object.freeze(['planner', 'design', 'architecture', 'code', 'integration', 'repair', 'visualQa']);
/** Below this share of the token/cost budget, escalation is switched off so a hard step cannot eat the last of the budget. */
const ESCALATION_MIN_BUDGET_FRACTION = 0.15;

const PROFILES = Object.freeze({
  low: {
    id: 'low', label: 'Low', budgetScale: 0.35, maxRepairAttempts: 2,
    qa: { browser: false, visual: false },
    thinking: { planner: 'minimal', design: 'low', architecture: 'minimal', code: 'minimal', integration: 'minimal', repair: 'low', visualQa: 'minimal' },
    thinkingCeiling: 'low',
    floors: { maxWallClockMs: 15 * 60 * 1000, maxLlmCalls: 80, maxTotalTokens: 600_000, maxCostUsd: 0.5 },
    brief: 'BUILD LEVEL: LOW (fast). Build a clean, complete and polished site with the essential pages and sections only. Prefer a compact, well-organised architecture and reuse components. Skip optional extras (secondary pages, elaborate animation, optional modules) unless the user explicitly asked for them. Quality of what is built still matters: real working navigation, forms and responsive layout.',
  },
  moderate: {
    id: 'moderate', label: 'Moderate', budgetScale: 0.65, maxRepairAttempts: 4,
    qa: { browser: true, visual: false },
    thinking: { planner: 'medium', design: 'medium', architecture: 'medium', code: 'low', integration: 'low', repair: 'medium', visualQa: 'low' },
    thinkingCeiling: 'high',
    floors: { maxWallClockMs: 25 * 60 * 1000, maxLlmCalls: 160, maxTotalTokens: 1_500_000, maxCostUsd: 1.2 },
    brief: 'BUILD LEVEL: MODERATE (balanced). Build every page and feature the request implies, plus the recommended supporting pages that clearly help this kind of site. Use thoughtful, reusable architecture, meaningful section variety per page and purposeful micro-interactions. Content and behaviour must be complete and tested in a real browser.',
  },
  max: {
    id: 'max', label: 'Max', budgetScale: 1, maxRepairAttempts: Infinity,
    qa: { browser: true, visual: true },
    thinking: { planner: 'high', design: 'high', architecture: 'high', code: 'medium', integration: 'medium', repair: 'high', visualQa: 'high' },
    thinkingCeiling: 'high',
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
/** Visual-craft guidance for the design and code agents; deeper at higher levels. */
const AESTHETICS = Object.freeze({
  low: 'VISUAL CRAFT: choose one clear style and apply it consistently. A restrained palette, a confident type pairing with a clear hierarchy, generous whitespace and real hover/focus states. Nothing generic or unstyled.',
  moderate: 'VISUAL CRAFT: commit to a distinctive art direction for THIS brand, not a template. A cohesive palette with a strong accent and tuned contrast, an expressive heading/body type pairing, a consistent spacing scale and radius language, layered surfaces (subtle depth, borders, gradients where they fit), tasteful scroll-reveal and hover motion that respects prefers-reduced-motion, and different compositions per page.',
  max: 'VISUAL CRAFT: design like a top studio. Pick a bold, specific art direction (mood, metaphor, signature motif) and let it drive everything: an intentional palette with tuned light/dark contrast, a distinctive display + text type pairing with fluid sizing and tight hierarchy, a strict spacing and radius system, rich composition (asymmetry, overlap, full-bleed imagery, editorial grids) varied page to page, layered depth (shadows, glass, gradients, texture) used with restraint, polished micro-interactions and orchestrated entrance motion with reduced-motion fallbacks, crafted empty/loading/error states, and pixel-level consistency at 320, 768 and 1366px. Never default Bootstrap/Tailwind-demo looks.',
});
const withAesthetics = (system, level) => (level ? `${system}\n\n${AESTHETICS[resolveLevel(level)]}` : system);

const withLevelBrief = (system, level) => (level ? `${system}\n\n${profileFor(level).brief}` : system);

const thinkingRank = (value) => THINKING_ORDER.indexOf(value);

/**
 * Reasoning depth for one agent role at a level. `steps` raises it by that many notches (adaptive effort), never above the level's
 * ceiling and never below the base setting. Unknown level = max; unknown role = null (the caller then sends no thinking option).
 */
function thinkingFor(level, role, { steps = 0 } = {}) {
  const p = profileFor(level);
  const base = p.thinking[role];
  if (!base) return null;
  const ceiling = Math.max(thinkingRank(p.thinkingCeiling), thinkingRank(base));
  const target = Math.min(ceiling, thinkingRank(base) + Math.max(0, Math.floor(Number(steps) || 0)));
  return THINKING_ORDER[target];
}

module.exports = { LEVELS, DEFAULT_LEVEL, PROFILES, normalizeLevel, resolveLevel, profileFor, applyLevel, withLevelBrief, withAesthetics, AESTHETICS, THINKING_ORDER, THINKING_ROLES, ESCALATION_MIN_BUDGET_FRACTION, thinkingRank, thinkingFor };
