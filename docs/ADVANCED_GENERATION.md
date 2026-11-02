# Advanced website generation (Plus / Pro)

Autonomous multi-page generation. Free keeps the existing pipeline unchanged.

## How it is gated
- Entitlement `ADVANCED_WEBSITE_GENERATION` lives on the plan (`backend/src/modules/billing/plans.config.js`).
- The backend decides the tier in `ai-generate.controller.js` (`resolveGenerationTier`). A Free user who sends `generationTier: "advanced"` gets `403 FEATURE_NOT_IN_PLAN`.
- The entitlement is re-verified when the ai-service fetches the payload (`aiWebhook.controller.js`); a job that is no longer entitled is served as a standard job.
- The ai-service runs the advanced pipeline only when the payload carries `tier: "advanced"` (`queue/worker.js` `pickRunner`).
- Quotas, reservations and rate limits are unchanged. Advanced jobs are additionally capped per user (`ADVANCED_CONCURRENCY_LIMIT`).

## Pipeline (`ai-service/src/orchestrator/advancedGeneration.orchestrator.js`)
requirements -> planner (spec + page manifest) -> design system -> architecture (the model chooses every file/folder; no fixed counts) -> dependency-ordered, controlled-parallel generation (workers may create extra files) -> functionality/integration -> quality engine (structural, build, browser functional/responsive, visual) <-> repair engine (can modify and create files; bounded, verified, rolled back if it makes things worse) -> production readiness.

Resources are limited by time, LLM calls, tokens, cost, output bytes, repair rounds and parallelism, never by file/component count.

## Build levels (Low / Moderate / Max)
On the Review step, once **Advanced build** is on, the user picks a level. It is sent as `advancedLevel`, validated by the backend (`requestedLevelOf`; unknown or missing = `max`, the pre-levels behaviour), forwarded as `payload.advanced.level`, and kept for debug retries. `ai-service/src/advanced/levels.js` turns it into real differences:

| | Low | Moderate | Max |
|---|---|---|---|
| Budget (of the plan's limits, with floors) | 35% | 65% | 100% |
| Repair rounds | up to 2 | up to 4 | plan limit |
| Quality layers | structure + build | + browser functional/responsive | + AI visual review |
| Agent brief (planner / architecture / code) | essential pages, compact | all requested + helpful pages | complete premium build |
| Reasoning depth per call (planner / architecture / code / repair / visual QA) | minimal / minimal / minimal / low / minimal (design: low) | medium / medium / low / medium / low (design: medium) | high / high / medium / high / high (design: high) |

**Reasoning depth and adaptive escalation.** Each model call gets a Gemini `thinkingLevel` for its role (`PROFILES[level].thinking` in `levels.js`; design and integration follow the same table; calls without the option keep the old fixed `low`). When a step is hard the depth is raised one notch for that call only: a code file retried after invalid output, repair round 2 and later, and one extra notch for each earlier repair round that was rolled back. Escalation never goes above the level's ceiling (`thinkingCeiling`: low stays at `low`, moderate and max can reach `high`) and is skipped when less than 15% of the token or cost budget is left. Thinking tokens count toward the token/cost budget. The result reports `generationMeta.advanced.effort` (`level`, per-role `thinking`, `escalations`, `events`), and the build panel shows "N escalations" when N > 0.

The design and code agents also receive a level-scaled **visual craft** brief (`AESTHETICS` in `levels.js`): consistent style at low, a distinctive art direction at moderate, studio-grade composition, type, depth and motion at max.

Every level runs the full advanced pipeline (plan, design system, architecture, ordered generation, integration, build check, repair). A level can only lower limits, never exceed the plan or operator ceilings, and there is still no file-count cap. Quota use is unchanged.

## Configuration (all optional)
| Variable | Purpose |
|---|---|
| `ADVANCED_GENERATION_ENABLED` | kill switch (default true) |
| `ADV_PRO_*`, `ADV_PLUS_*` (e.g. `ADV_PRO_MAX_TOKENS`) | per-plan budgets |
| `ADV_CEIL_*` | hard ceilings applied in the ai-service |
| `ADV_BROWSER_QA`, `ADV_VISUAL_QA` | toggle Playwright checks / AI visual review |
| `AI_MAX_CHECKPOINT_BYTES` | max checkpoint stored on a job |
| `EXPORT_MAX_TOTAL_BYTES` | export byte budget (replaces any file-count cap) |
| `ADV_COST_PER_MTOKEN_USD` | cost estimate rate |

## Deployment
- ai-service needs Chromium + Playwright (`npx playwright install chromium`) for browser QA; without it the probe is skipped and reported.
- No DB migration: new `QueueJob` fields (`tier`, `checkpoint`, `checkpointAt`) are optional with defaults.
- Generated sites use `react-router-dom` (`BrowserRouter`); `vercel.json` SPA rewrites are included so deep links survive refresh.

## Tests
- ai-service: `tests/advancedOrchestrator.test.js`, `tests/advancedCore.test.js`, `tests/aiQueueWorker.test.js`
- backend: `tests/unit/billing/advancedTier.test.js`
- frontend: `src/components/ai-studio/advancedBuild.test.jsx`
