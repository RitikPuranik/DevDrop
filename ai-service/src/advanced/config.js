'use strict';
/**
 * Advanced website generation: hard ceilings and defaults.
 *
 * The backend decides WHICH plan's budget applies and sends it in the job payload (payload.advanced.limits). This module
 * clamps whatever arrives to operator ceilings, so even a malformed payload can never exceed what the deployment allows.
 *
 * There is intentionally NO file-count limit anywhere in this directory. Resources are controlled by what is actually
 * consumed: wall-clock time, model calls, tokens, estimated cost, output bytes, repair rounds and parallelism.
 */
const int = (key, fallback, min = 0) => {
  const n = Number.parseInt(process.env[key], 10);
  return Number.isFinite(n) && n >= min ? n : fallback;
};
const num = (key, fallback) => {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Operator ceilings (env). A plan budget can only lower these, never raise them.
const ceilings = () => ({
  maxWallClockMs: int('ADV_CEIL_WALL_CLOCK_MS', int('AI_JOB_TIMEOUT_MS', 18000000), 1000),
  maxLlmCalls: int('ADV_CEIL_MAX_LLM_CALLS', 2000, 1),
  maxTotalTokens: int('ADV_CEIL_MAX_TOKENS', 40_000_000, 1000),
  maxCostUsd: num('ADV_CEIL_MAX_COST_USD', 50),
  maxOutputBytes: int('ADV_CEIL_MAX_OUTPUT_BYTES', int('AI_MAX_RESULT_BYTES', 12 * 1024 * 1024), 1024),
  maxRepairAttempts: int('ADV_CEIL_MAX_REPAIR_ATTEMPTS', 10, 0),
  maxParallelism: int('ADV_CEIL_PARALLELISM', 6, 1),
});

// Used when the backend sent no budget (e.g. a debug retry from an older job): conservative, never unlimited.
const FALLBACK_LIMITS = Object.freeze({
  maxWallClockMs: 45 * 60 * 1000, maxLlmCalls: 400, maxTotalTokens: 4_000_000, maxCostUsd: 3,
  maxOutputBytes: 8 * 1024 * 1024, maxRepairAttempts: 4, maxParallelism: 3,
});

function resolveLimits(requested) {
  const cap = ceilings();
  const src = requested && typeof requested === 'object' ? requested : {};
  const pick = (key) => {
    const asked = Number(src[key]);
    const base = Number.isFinite(asked) && asked > 0 ? asked : FALLBACK_LIMITS[key];
    // maxRepairAttempts may legitimately be 0 (disabled), so only fall back when it is not a number at all.
    return key === 'maxRepairAttempts' && Number.isFinite(asked) && asked >= 0 ? Math.min(asked, cap[key]) : Math.min(base, cap[key]);
  };
  return {
    maxWallClockMs: pick('maxWallClockMs'),
    maxLlmCalls: pick('maxLlmCalls'),
    maxTotalTokens: pick('maxTotalTokens'),
    maxCostUsd: pick('maxCostUsd'),
    maxOutputBytes: pick('maxOutputBytes'),
    maxRepairAttempts: pick('maxRepairAttempts'),
    maxParallelism: Math.max(1, Math.floor(pick('maxParallelism'))),
  };
}

// Blended price used ONLY to turn token counts into a budget figure; it is a guard rail, not billing.
const costPerMillionTokensUsd = () => num('ADV_COST_PER_MTOKEN_USD', 0.75);

const settings = () => ({
  // Quality engine
  browserQa: !/^(0|false|no|off)$/i.test(String(process.env.ADV_BROWSER_QA ?? 'true')),
  visualQa: !/^(0|false|no|off)$/i.test(String(process.env.ADV_VISUAL_QA ?? 'true')),
  visualQaMaxPages: int('ADV_VISUAL_QA_MAX_PAGES', 6, 1),
  viewports: [
    { id: 'mobile', width: 375, height: 800 },
    { id: 'tablet', width: 768, height: 1024 },
    { id: 'desktop', width: 1366, height: 900 },
  ],
  // Heuristic thresholds (quality signals, not resource limits)
  oversizedFileLines: int('ADV_OVERSIZED_FILE_LINES', 450, 50),
  appShellMaxLines: int('ADV_APP_SHELL_MAX_LINES', 140, 20),
  // Generation
  checkpointEveryFiles: int('ADV_CHECKPOINT_EVERY_FILES', 6, 1),
  relatedSourceBudgetChars: int('ADV_RELATED_SOURCE_BUDGET_CHARS', 60_000, 1000),
});

module.exports = { resolveLimits, ceilings, settings, costPerMillionTokensUsd, FALLBACK_LIMITS };
