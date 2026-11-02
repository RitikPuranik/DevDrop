'use strict';
/**
 * Advanced autonomous multi-page website generation (Plus / Pro only; the backend decides, see backend ai-generate controller).
 *
 *  requirements -> plan (spec + page manifest) -> design system -> architecture (model decides every file/folder)
 *  -> dependency-ordered, controlled-parallel generation (workers may CREATE more files while they work)
 *  -> functionality/integration -> quality engine <-> repair engine (may create files) -> production readiness
 *
 * Nothing here caps or pads the number of files. Resources are controlled by the budget (time, calls, tokens, cost,
 * output bytes, repair rounds, parallelism).
 */
const requirementsAgent = require('../agents/requirements.agent');
const designAgent = require('../agents/design.agent');
const plannerAgent = require('../agents/websitePlanner.agent');
const architectureAgent = require('../agents/advancedArchitecture.agent');
const codeAgent = require('../agents/advancedCodeGeneration.agent');
const integrationAgent = require('../agents/integration.agent');
const repairAgent = require('../agents/advancedRepair.agent');
const visualQaAgent = require('../agents/visualQa.agent');
const buildValidator = require('../validators/build.validator');
const { validateRequirements, validateDesign } = require('../validators/contracts.validator');
const { ensureProductionReady } = require('./deploymentReadiness');
const { withTimeout, stage: runStage } = require('./stageRunner');
const { createSkillSession } = require('../skills');
const skillConfig = require('../skills/config');
const { normalizeAssets, buildMediaManifest, buildAssetSummaries, normalizeMediaPlan, toModelManifest, resolveAssetUrls } = require('../utils/assetContract');
const base = require('./websiteGeneration.orchestrator');
const { runWithJob, getJobContext } = require('../utils/jobContext');
const { resolveLimits, settings } = require('../advanced/config');
const { resolveLevel, profileFor, applyLevel, thinkingFor, ESCALATION_MIN_BUDGET_FRACTION } = require('../advanced/levels');
const { createBudget, BudgetExceededError } = require('../advanced/budget');
const { createProjectStore } = require('../advanced/projectStore');
const { normalizeWebsiteSpec, normalizePageManifest, normalizeAdvancedArchitecture, normalizeFileRequests } = require('../advanced/contracts');
const { buildDesignAssets, tokenBrief } = require('../advanced/designSystem');
const { createScheduler } = require('../advanced/scheduler');
const { createProgress } = require('../advanced/progress');
const { runQualityEngine } = require('../advanced/quality/engine');
const { runStructuralChecks } = require('../advanced/quality/structural');
const { clusterIssues, repairCluster } = require('../advanced/repairEngine');
const { extractRoutes } = require('../advanced/routes');
const { resolveDependencies } = require('../advanced/dependencies');

const MAIN_JSX = `import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/tokens.css';
import './styles/base.css';
import App from './App.js';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
`;
const CHECKPOINT_SCHEMA = 1;
const defaultDeps = () => ({
  agents: { requirements: requirementsAgent, design: designAgent, planner: plannerAgent, architecture: architectureAgent, code: codeAgent, integration: integrationAgent, repair: repairAgent, visualQa: visualQaAgent },
  build: (args) => buildValidator.run(args),
  ensureProductionReady,
  probe: undefined,
});
const cancelCheck = () => { if (getJobContext().isCancelled?.()) throw Object.assign(new Error('Job cancelled'), { cancelled: true }); };

/**
 * Reasoning depth for one model call: the level's setting for the role, raised by `steps` notches when the step is hard.
 * Escalation is dropped (and recorded as skipped) when under 15% of the token/cost budget is left, and thinkingFor() already
 * stops at the level's own ceiling. Returns the thinking value to pass to the agent; counts an escalation only when it applies.
 */
function thinkingForCall(ctx, role, { steps = 0, reason = '' } = {}) {
  const base = thinkingFor(ctx.level, role);
  if (!steps) return base;
  if (!ctx.budget.canEscalate(ESCALATION_MIN_BUDGET_FRACTION)) {
    if (base !== thinkingFor(ctx.level, role, { steps })) ctx.effort.events.push({ role, reason, from: base, to: base, skipped: 'low-budget' });
    return base;
  }
  const raised = thinkingFor(ctx.level, role, { steps });
  if (raised !== base) { ctx.effort.escalations += 1; ctx.effort.events.push({ role, reason, from: base, to: raised }); }
  return raised;
}
const effortMeta = (ctx) => ({
  level: ctx.level,
  thinking: profileFor(ctx.level).thinking,
  ceiling: profileFor(ctx.level).thinkingCeiling,
  escalations: ctx.effort.escalations,
  events: ctx.effort.events.slice(0, 20),
});
const folderList = (paths) => [...new Set(paths.map((p) => p.split('/').slice(1, -1).slice(0, 2).join('/')).filter(Boolean))].sort();
const errFiles = (text, known) => known.filter((p) => String(text).includes(p.slice(1))).slice(0, 6);

function scaffold(files, dependencies, title) {
  const out = buildValidator.withScaffold(files, dependencies);
  try {
    const pkg = JSON.parse(out['/package.json'].code);
    pkg.name = pkg.name || String(title || 'devdrop-site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'devdrop-site';
    pkg.private = true; pkg.version = pkg.version || '1.0.0';
    pkg.scripts = { dev: 'vite', build: 'vite build', preview: 'vite preview', ...(pkg.scripts || {}) };
    out['/package.json'] = { code: JSON.stringify(pkg, null, 2) };
  } catch { /* the static validator reports a malformed package.json */ }
  return out;
}

function createRun(input, { onStage, onProgress, onCheckpoint, deps: injected, mode = 'generate', budget: opts_budget } = {}) {
  const deps = { ...defaultDeps(), ...(injected || {}), agents: { ...defaultDeps().agents, ...(injected?.agents || {}) } };
  const level = resolveLevel(input.advanced?.level ?? input.advanced?.context?.level);
  const limits = applyLevel(resolveLimits(input.advanced?.limits), level);
  const budget = opts_budget || createBudget(limits);
  const meta = [];
  const stage = (name, fn) => runStage(name, fn, meta, onStage);
  const progress = createProgress({ onChange: (snap) => onProgress?.(snap) });
  progress.setLevel(level);
  const store = createProjectStore();
  const warnings = [];
  const warn = (m) => { warnings.push(m); console.warn('[ADVANCED]', m); };
  const effort = { escalations: 0, events: [] };
  return { effort, deps, level, limits, budget, meta, stage, progress, store, warn, warnings, onCheckpoint, onStage, mode };
}

/* -------------------------------------------------------------------------- quality <-> repair loop */
async function qualityRepairLoop(ctx, st) {
  const { deps, budget, store, progress, stage } = ctx;
  const rounds = [];
  let dependencies = st.dependencies;
  let report = null;
  let polishRounds = 0;
  const mediaModel = st.modelManifest || [];

  for (let round = 0; ; round += 1) {
    cancelCheck(); budget.assertWithin(' during quality checks');
    progress.start('quality', 'Running quality checks');
    const before = report;
    report = await stage(`adv:quality:${round + 1}`, async () => ({ value: await runQualityEngine({
      files: scaffold(store.toFiles(), dependencies, st.requirements?.websiteType), manifest: st.manifest, pageFileIds: st.pageFileIds, dependencies,
      build: deps.build, includeVisual: round === 0, visualAgent: { run: (a) => deps.agents.visualQa.run({ ...a, thinking: thinkingForCall(ctx, 'visualQa') }) }, qa: profileFor(ctx.level).qa, skills: st.skills, spec: st.spec, probe: deps.probe,
      onPhase: (p) => progress.task(`Quality checks: ${p}`),
    }) })).then((r) => r.value);
    dependencies = report.dependencies;
    for (const [layer, v] of Object.entries(report.layers)) progress.validation(layer, v.status);
    st.lastBuild = report.buildResult?.success ? report.buildResult : st.lastBuild;

    // verify the previous repair round: did it help?
    const prev = rounds[rounds.length - 1];
    if (prev && before) {
      const nowBlocking = report.issues.filter((i) => i.blocking);
      const wasBlocking = before.issues.filter((i) => i.blocking);
      const sig = (i) => `${i.id}|${(i.files || []).join(',')}`;
      const stillThere = new Set(nowBlocking.map(sig));
      prev.verified = { fixed: wasBlocking.filter((i) => !stillThere.has(sig(i))).length, remaining: nowBlocking.length, before: wasBlocking.length };
      if (nowBlocking.length > wasBlocking.length && prev.applied?.length) {
        // the repair made things worse: undo it and let the next round try a different approach
        for (const a of prev.applied) a.rollback();
        prev.rolledBack = true; ctx.warn(`repair round ${prev.round} made things worse; rolled back`);
        report = before; dependencies = st.dependencies;
      }
      progress.repairState({ fixed: rounds.reduce((n, r) => n + (r.verified?.fixed || 0), 0), open: nowBlocking.length });
    }

    const blocking = report.issues.filter((i) => i.blocking);
    const polish = report.issues.filter((i) => !i.blocking && (i.severity === 'error' || i.refactor));
    const targets = blocking.length ? blocking : (polishRounds < 1 && polish.length ? polish : []);
    if (!targets.length) break;
    if (!budget.canRepair()) { progress.note('Repair budget used'); break; }
    if (!blocking.length) polishRounds += 1;

    budget.recordRepairAttempt();
    progress.start('repair', `Repairing ${targets.length} issue${targets.length === 1 ? '' : 's'}`);
    progress.repairState({ attempts: budget.used.repairAttempts, max: budget.limits.maxRepairAttempts, open: blocking.length });
    const roundInfo = { round: rounds.length + 1, issues: targets.slice(0, 20).map((i) => ({ id: i.id, layer: i.layer, message: i.message.slice(0, 240), files: i.files })), applied: [], created: [], modified: [] };
    rounds.push(roundInfo);
    // Adaptive effort: round 1 uses the level's setting; later rounds go one step higher, plus one more for every earlier round
    // that was rolled back (it made things worse). Capped at the level's ceiling, and skipped when the budget is nearly spent.
    const repairSteps = (rounds.length > 1 ? 1 : 0) + rounds.filter((r) => r.rolledBack).length;
    const repairThinking = thinkingForCall(ctx, 'repair', { steps: repairSteps, reason: rounds.some((r) => r.rolledBack) ? `round ${roundInfo.round} after rollback` : `round ${roundInfo.round}` });
    for (const cluster of clusterIssues(targets)) {
      cancelCheck();
      const applied = await stage(`adv:repair:${roundInfo.round}`, async () => ({ value: await repairCluster({ cluster, store, agent: deps.agents.repair, manifest: st.manifest, spec: st.spec, tokens: st.tokens, dependencies, mediaManifest: mediaModel, skills: st.skills, phase: `repair:${roundInfo.round}`, thinking: repairThinking, log: (m) => progress.note(m) }) })).then((r) => r.value);
      roundInfo.applied.push(applied);
      roundInfo.created.push(...applied.created); roundInfo.modified.push(...applied.modified);
      for (const p of applied.created) { progress.addFile({ category: 'shared', path: p }); progress.fileFinished({ category: 'shared', path: p }); }
      const added = {}; for (const [k, v] of Object.entries(applied.dependencies || {})) if (/^[@a-zA-Z0-9._/-]+$/.test(k) && typeof v === 'string') added[k] = v;
      dependencies = { ...dependencies, ...added };
      roundInfo.rootCause = [roundInfo.rootCause, applied.rootCause].filter(Boolean).join(' | ').slice(0, 600);
    }
    st.dependencies = dependencies;
    if (!roundInfo.applied.some((a) => a.changed)) { progress.note('Repair agent proposed no change'); if (rounds.filter((r) => !r.applied.some((a) => a.changed)).length >= 2) break; }
    ctx.onCheckpoint?.(makeCheckpoint(ctx, st, 'repairing'));
  }
  st.dependencies = dependencies;
  progress.done('quality'); if (rounds.length) progress.done('repair'); else progress.skip('repair');
  return { report, rounds };
}

function makeCheckpoint(ctx, st, phase) {
  const files = {}; for (const [p, f] of Object.entries(ctx.store.toFiles())) files[p] = f.code;
  return { schema: CHECKPOINT_SCHEMA, phase, requirements: st.requirements, mediaPlan: st.mediaPlan, design: st.design, spec: st.spec, manifest: st.manifest, architecture: st.architecture, pageFileIds: st.pageFileIds, dependencies: st.dependencies, files, level: ctx.level, budget: ctx.budget.snapshot(), escalations: ctx.effort.escalations };
}

function failure(ctx, st, message, errors) {
  const files = ctx.store.toFiles();
  return Object.assign(new Error(message), {
    userMessage: message,
    failureClass: 'permanent',
    debugContext: { files, dependencies: st.dependencies || {}, architecture: st.architecture || null, requirements: st.requirements || null, design: st.design || null, errors, buildOutput: errors, mediaManifest: st.mediaManifest || [], mediaPlan: st.mediaPlan || [], advanced: { level: ctx.level, spec: st.spec, manifest: st.manifest, pageFileIds: st.pageFileIds } },
  });
}

async function finalize(ctx, st, title, qr, extraMeta = {}) {
  const { deps, store, progress, budget, stage } = ctx;
  progress.start('preview', 'Preparing preview and deployment output');
  let files = scaffold(store.toFiles(), st.dependencies, title);
  files = resolveAssetUrls(files, st.mediaManifest || []);
  const ready = await deps.ensureProductionReady({ files, dependencies: st.dependencies, mediaManifest: st.modelManifest || [], resolvedDependencies: st.lastBuild?.resolvedDependencies || null, skillContext: st.skills?.contextFor('deployment') || '' }, ctx.meta, (n, s, d) => ctx.onStage?.(n, s, d));
  const outFiles = ready.files;
  budget.assertOutputSize(outFiles);
  progress.done('preview');
  const rep = qr.report;
  const issues = rep.issues.filter((i) => !i.blocking).slice(0, 30).map((i) => ({ layer: i.layer, severity: i.severity, message: i.message.slice(0, 240), files: i.files }));
  const advanced = {
    tier: 'advanced',
    level: ctx.level,
    spec: { category: st.spec.category, purpose: st.spec.purpose, audience: st.spec.audience, complexity: st.spec.complexity },
    pages: st.manifest.pages.map((p) => ({ id: p.id, title: p.title, path: p.path, recommended: p.recommended, dynamic: p.dynamic })),
    architecture: { fileCount: Object.keys(outFiles).length, generatedFileCount: store.size, folders: folderList(Object.keys(outFiles)), createdByPhase: Object.fromEntries(Object.entries(store.createdByPhase()).map(([k, v]) => [k, v.length])) },
    quality: { passed: rep.passed, layers: rep.layers, remaining: issues, probeSkipped: rep.probeSkipped || null },
    repairs: qr.rounds.map((r) => ({ round: r.round, issues: r.issues.length, created: r.created, modified: r.modified, rootCause: r.rootCause, verified: r.verified || null, rolledBack: Boolean(r.rolledBack) })),
    effort: effortMeta(ctx),
    budget: budget.report(),
    progress: progress.snapshot(),
    warnings: ctx.warnings.slice(0, 20),
    ...extraMeta,
  };
  const summary = `Built ${st.manifest.pages.length} page${st.manifest.pages.length === 1 ? '' : 's'} across ${Object.keys(outFiles).length} files. ${rep.passed ? 'All quality checks passed' : 'Quality checks finished with notes'}${qr.rounds.length ? ` after ${qr.rounds.length} automatic repair round${qr.rounds.length === 1 ? '' : 's'}` : ''}.`;
  return { assistantMessage: summary, title, files: outFiles, dependencies: ready.dependencies, generationMeta: { agents: ctx.meta, tier: 'advanced', deploymentReadiness: ready.report, advanced } };
}

/* -------------------------------------------------------------------------- generation */
async function runAdvanced(input, opts) {
  const ctx = createRun(input, opts);
  const { deps, store, progress, budget, stage, warn } = ctx;
  const checkpoint = opts.checkpoint && opts.checkpoint.schema === CHECKPOINT_SCHEMA ? opts.checkpoint : null;
  const normalized = base.normalizeInput(input);
  const { preferences, referenceMedia } = base.extractReferenceImage(normalized.preferences);
  normalized.preferences = preferences;
  const skills = createSkillSession({ websiteType: normalized.websiteType, trigger: 'website-generation', terms: Object.values(preferences || {}).filter((v) => typeof v === 'string' && v.length < 40), config: skillConfig.readConfig() });
  const mediaManifest = buildMediaManifest(normalized.assets);
  const st = { skills, mediaManifest, modelManifest: toModelManifest(mediaManifest), dependencies: {}, pageFileIds: {} };
  if (checkpoint?.budget) budget.restore(checkpoint.budget);
  if (Number.isFinite(checkpoint?.escalations)) ctx.effort.escalations = checkpoint.escalations; // older checkpoints simply have none

  // 1. requirements
  progress.start('requirements', 'Understanding your request');
  if (checkpoint?.requirements) { st.requirements = checkpoint.requirements; st.mediaPlan = checkpoint.mediaPlan || []; }
  else {
    const summaries = buildAssetSummaries(normalized.assets);
    const r = await stage('adv:requirements', () => deps.agents.requirements.run({ ...normalized, assetSummaries: summaries, skillContext: skills.contextFor('requirements') }));
    st.requirements = validateRequirements(r.value);
    st.requirements.mediaPlan = normalizeMediaPlan(st.requirements.mediaPlan, normalized.assets);
    st.requirements.assets = summaries.map(({ extraction, ...a }) => ({ ...a, ...(extraction ? { extractionStatus: extraction.status } : {}) }));
    st.mediaPlan = st.requirements.mediaPlan;
  }
  progress.done('requirements');

  // 2-4. plan, design system, architecture
  progress.start('planning', 'Planning the website');
  if (checkpoint?.manifest && checkpoint?.architecture && checkpoint?.design) {
    Object.assign(st, { spec: checkpoint.spec, manifest: checkpoint.manifest, design: checkpoint.design, architecture: checkpoint.architecture, pageFileIds: checkpoint.pageFileIds || {} });
    st.dependencies = checkpoint.dependencies || {};
  } else {
    const planned = await stage('adv:plan', () => deps.agents.planner.run({ requirements: st.requirements, preferences: normalized.preferences, websiteType: normalized.websiteType, userData: st.requirements.userData, mediaPlan: st.mediaPlan, skillContext: skills.contextFor('requirements'), level: ctx.level, thinking: thinkingForCall(ctx, 'planner') }));
    st.spec = normalizeWebsiteSpec(planned.value?.spec, { websiteType: normalized.websiteType });
    st.manifest = normalizePageManifest(planned.value?.manifest || planned.value, { websiteType: normalized.websiteType });
    progress.setPages(st.manifest.pages);
    progress.start('design', 'Creating the design system');
    const d = await stage('adv:design', () => deps.agents.design.run({ requirements: st.requirements, mediaPlan: st.mediaPlan, preferences: normalized.preferences, websiteType: normalized.websiteType, media: referenceMedia, designSpec: null, skillContext: skills.contextFor('design'), level: ctx.level, thinking: thinkingForCall(ctx, 'design') }));
    st.design = validateDesign(d.value);
    const arch = await stage('adv:architecture', () => deps.agents.architecture.run({ requirements: st.requirements, design: st.design, spec: st.spec, manifest: st.manifest, tokens: tokenBrief(buildDesignAssets(st.design).tokens), mediaPlan: st.mediaPlan, skillContext: skills.contextFor('architecture'), level: ctx.level, thinking: thinkingForCall(ctx, 'architecture') }));
    st.architecture = normalizeAdvancedArchitecture(arch.value, st.manifest, { warn });
    st.dependencies = { ...(st.architecture.dependencies || {}) };
  }
  progress.setPages(st.manifest.pages);
  const designAssets = buildDesignAssets(st.design);
  st.tokens = tokenBrief(designAssets.tokens);
  designAssets.notes.forEach((n) => warn(`design: ${n}`));
  st.pageFileIds = Object.fromEntries(st.architecture.files.filter((f) => f.pageId).map((f) => [f.path, f.pageId]));
  store.replaceAll({}, {});
  for (const [p, code] of Object.entries(checkpoint?.files || {})) store.write(p, code, { owner: 'system', phase: 'restored' });
  store.write('/styles/tokens.css', designAssets.tokensCss, { owner: 'system', phase: 'design-system' });
  store.write('/styles/base.css', designAssets.baseCss, { owner: 'system', phase: 'design-system' });
  store.write('/main.jsx', MAIN_JSX, { owner: 'system', phase: 'design-system' });
  progress.setArchitecture({ folders: folderList(st.architecture.files.map((f) => f.path)), complexity: st.spec.complexity });
  progress.planFiles(st.architecture.files);
  progress.done('planning');
  if (!st.architecture.files.some((f) => f.category === 'design-system')) progress.done('design');
  ctx.onCheckpoint?.(makeCheckpoint(ctx, st, 'planned'));

  // 5. dependency-ordered, controlled-parallel generation
  const contracts = st.architecture.files;
  const scheduler = createScheduler({ contracts, parallelism: ctx.limits.maxParallelism });
  for (const c of contracts) if (store.has(c.path) && checkpoint) { scheduler.markDone(c.path); progress.fileStarted(c); progress.fileFinished(c); }
  let sinceCheckpoint = 0;
  const cfg = settings();
  const sourcesFor = (c) => {
    const out = {}; let used = 0;
    for (const imp of c.imports || []) { const code = store.get(imp); if (typeof code === 'string' && used + code.length <= cfg.relatedSourceBudgetChars) { out[imp] = code; used += code.length; } }
    return out;
  };
  const worker = async (contract) => {
    if (store.has(contract.path) && checkpoint) return;
    cancelCheck(); budget.assertWithin(' while generating files');
    store.claim(contract.path, contract.path);
    progress.fileStarted(contract);
    const related = contracts.filter((c) => c.path !== contract.path && (contract.imports || []).includes(c.path));
    const page = st.manifest.pages.find((p) => p.id === contract.pageId) || null;
    let value = null; let lastProblem = '';
    for (let attempt = 0; attempt < 2 && !value; attempt += 1) {
      // A retry after invalid output reasons one step deeper instead of repeating the identical call.
      const thinking = thinkingForCall(ctx, 'code', { steps: attempt, reason: `retry ${contract.path}` });
      const result = await stage(`code:${contract.path}`, () => deps.agents.code.run({ fileContract: contract, relatedContracts: related, relatedSources: sourcesFor(contract), spec: st.spec, manifest: st.manifest, page, tokens: st.tokens, requirements: st.requirements, design: st.design, mediaManifest: st.modelManifest, mediaPlan: st.mediaPlan, media: referenceMedia, existingPaths: store.list(), level: ctx.level, thinking, skillContext: /\.(jsx?|mjs)$/i.test(contract.path) ? skills.contextFor('code', { terms: [contract.path, contract.type, contract.responsibility] }) : '' }));
      const v = result.value;
      if (v?.path === contract.path && typeof v.code === 'string' && v.code.trim()) { value = v; } else lastProblem = `invalid output for ${contract.path}`;
    }
    if (!value) { progress.fileFinished(contract); throw new Error(lastProblem || `no source for ${contract.path}`); }
    const w = store.write(contract.path, value.code, { owner: contract.path, phase: 'generation' });
    if (!w.ok) { progress.fileFinished(contract); throw new Error(w.reason); }
    // files the worker asked for while writing this one: created on demand, no predefined list, no count limit
    const { accepted, rejected } = normalizeFileRequests(value.additionalFiles, { existing: (p) => store.has(p) || Boolean(scheduler.get(p)), claimedBy: (p) => store.holder(p), requester: contract.path });
    for (const r of rejected) warn(`file request rejected: ${r.path} (${r.reason})`);
    for (const req of accepted) {
      const added = { ...req, imports: req.imports };
      if (req.code) {
        store.claim(req.path, req.path);
        const wr = store.write(req.path, req.code, { owner: req.path, phase: 'generation' });
        if (wr.ok) { st.architecture.files.push(added); progress.addFile(added); progress.fileFinished(added); }
      } else if (scheduler.add(added)) { st.architecture.files.push(added); contracts.push(added); progress.addFile(added); }
    }
    store.release(contract.path, contract.path);
    progress.fileFinished(contract);
    sinceCheckpoint += 1;
    if (sinceCheckpoint >= cfg.checkpointEveryFiles) { sinceCheckpoint = 0; ctx.onCheckpoint?.(makeCheckpoint(ctx, st, 'generating')); }
  };
  const guarded = async (c) => { try { await worker(c); } catch (e) { if (e?.cancelled || e?.code === 'BUDGET_EXCEEDED') e.fatal = true; throw e; } };
  await scheduler.run(guarded, { shouldStop: () => Boolean(getJobContext().isCancelled?.()) });
  for (const f of scheduler.failed()) warn(`file failed: ${f.path}: ${String(f.error?.message || f.error).slice(0, 160)}`);
  progress.closeEmptyGeneratingPhases();
  ctx.onCheckpoint?.(makeCheckpoint(ctx, st, 'generated'));

  // 6. functionality + integration (only calls the model when something is actually unwired)
  progress.start('functionality', 'Connecting pages, routes and features');
  const wiring = runStructuralChecks({ files: store.toFiles(), manifest: st.manifest, dependencies: st.dependencies, pageFileIds: st.pageFileIds }).filter((i) => i.blocking && ['route-missing', 'page-not-connected', 'no-404-route', 'broken-internal-link', 'static-validation'].includes(i.id));
  if (wiring.length) {
    const r = await stage('adv:integration', () => deps.agents.integration.run({ requirements: st.requirements, design: st.design, architecture: st.architecture, files: store.toFiles(), errors: wiring.map((i) => i.message).slice(0, 15), skillContext: skills.contextFor('integration'), thinking: thinkingForCall(ctx, 'integration') }));
    for (const [p, f] of Object.entries(r.value?.files || {})) if (f?.code) store.write(p, f.code, { owner: 'integration', phase: 'integration' });
  }
  progress.done('functionality');

  // 7-9. quality <-> repair
  const qr = await qualityRepairLoop(ctx, st);
  if (!qr.report.passed) {
    const blocking = qr.report.issues.filter((i) => i.blocking).map((i) => i.message);
    throw failure(ctx, st, `The website could not be completed after ${qr.rounds.length} automatic repair round${qr.rounds.length === 1 ? '' : 's'}: ${blocking.join(' | ').slice(0, 1100)}`, blocking);
  }
  return finalize(ctx, st, base.buildGeneratedTitle(st.requirements), qr);
}

/* -------------------------------------------------------------------------- debug-retry of a failed advanced job */
async function runAdvancedDebug(input, opts) {
  const ctx = createRun(input, { ...opts, mode: 'debug' });
  const { store, progress } = ctx;
  const context = input.advanced?.context || {};
  const files = input.files || {};
  const st = { requirements: input.requirements || {}, design: input.design || {}, architecture: input.architecture || { files: [] }, mediaManifest: input.mediaManifest || [], modelManifest: toModelManifest(input.mediaManifest || []), mediaPlan: input.mediaPlan || [], dependencies: { ...(input.dependencies || {}) }, pageFileIds: context.pageFileIds || {} };
  st.skills = createSkillSession({ websiteType: st.requirements.websiteType || 'custom', trigger: 'debug-repair' });
  for (const [p, f] of Object.entries(files)) store.write(p, typeof f === 'string' ? f : f?.code, { owner: 'system', phase: 'restored' });
  const routes = extractRoutes(store.toFiles());
  st.manifest = context.manifest || normalizePageManifest({ pages: (routes.length ? routes : ['/']).filter((r) => r !== '*' && r !== '/*').map((r) => ({ path: r })) });
  st.spec = context.spec || normalizeWebsiteSpec({}, { websiteType: st.requirements.websiteType });
  st.tokens = tokenBrief(buildDesignAssets(st.design).tokens);
  progress.setPages(st.manifest.pages);
  for (const id of ['requirements', 'planning', 'design', 'shared', 'pages', 'modules', 'functionality']) progress.skip(id);
  const qr = await qualityRepairLoop(ctx, st);
  if (!qr.report.passed) { const b = qr.report.issues.filter((i) => i.blocking).map((i) => i.message); throw failure(ctx, st, `Debug repair could not fix the website: ${b.join(' | ').slice(0, 1100)}`, b); }
  const done = await finalize(ctx, st, base.buildGeneratedTitle(st.requirements), qr);
  return { ...done, assistantMessage: `Debug repair completed. ${done.assistantMessage}` };
}

async function runWithBudget(input, opts, runner) {
  // The budget lives in the job context so llm.service meters EVERY model call, including the reused agents.
  const limits = applyLevel(resolveLimits(input.advanced?.limits), resolveLevel(input.advanced?.level ?? input.advanced?.context?.level));
  const budget = createBudget(limits);
  const parent = getJobContext() || {};
  const wrapped = { ...parent, beforeLlmCall: () => budget.beforeLlmCall?.(), afterLlmCall: (x) => budget.afterLlmCall?.(x) };
  return runWithJob(wrapped, () => withTimeout(runner(input, { ...opts, budget }), limits.maxWallClockMs, 'advanced-generation'));
}

module.exports = {
  generateAdvancedWebsite: (input, opts = {}) => runWithBudget(input, opts, runAdvanced),
  debugAdvancedWebsite: (input, opts = {}) => runWithBudget(input, opts, runAdvancedDebug),
  _internals: { qualityRepairLoop, scaffold, MAIN_JSX, CHECKPOINT_SCHEMA },
};
