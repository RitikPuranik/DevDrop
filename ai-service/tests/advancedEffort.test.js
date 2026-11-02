'use strict';
/**
 * Reasoning depth ("effort") per build level: profile table, llm.service mapping, and adaptive escalation in the orchestrator.
 * Everything is faked: no network, no provider quota.
 */
jest.mock('axios', () => ({ post: jest.fn() }));
jest.mock('../src/geminiPool.service', () => ({ executeModels: jest.fn() }));

const axios = require('axios');
const geminiPool = require('../src/geminiPool.service');
const { PROFILES, THINKING_ROLES, THINKING_ORDER, thinkingRank, thinkingFor } = require('../src/advanced/levels');
const { createBudget } = require('../src/advanced/budget');
const { callGemini, buildThinkingConfig } = require('../src/services/llm.service');
const { generateAdvancedWebsite } = require('../src/orchestrator/advancedGeneration.orchestrator');
const { getJobContext } = require('../src/utils/jobContext');

/* -------------------------------------------------------------------------- levels */
describe('thinking profile table', () => {
  test('every role has a valid thinking value at every level', () => {
    for (const level of ['low', 'moderate', 'max']) {
      for (const role of THINKING_ROLES) expect(THINKING_ORDER).toContain(PROFILES[level].thinking[role]);
      expect(THINKING_ORDER).toContain(PROFILES[level].thinkingCeiling);
    }
  });
  test('low <= moderate <= max for each role', () => {
    for (const role of THINKING_ROLES) {
      const [lo, mo, mx] = ['low', 'moderate', 'max'].map((l) => thinkingRank(PROFILES[l].thinking[role]));
      expect(lo).toBeLessThanOrEqual(mo); expect(mo).toBeLessThanOrEqual(mx);
    }
  });
  test('spec: low is minimal except repair; moderate medium/low; max high/medium', () => {
    const t = (l) => PROFILES[l].thinking;
    for (const r of THINKING_ROLES.filter((x) => x !== 'repair' && x !== 'design')) expect(t('low')[r]).toBe('minimal');
    expect([t('low').design, t('moderate').design, t('max').design]).toEqual(['low', 'medium', 'high']);
    expect(t('low').repair).toBe('low');
    for (const r of ['planner', 'architecture', 'repair']) { expect(t('moderate')[r]).toBe('medium'); expect(t('max')[r]).toBe('high'); }
    expect(t('moderate').code).toBe('low'); expect(t('moderate').visualQa).toBe('low');
    expect(t('max').code).toBe('medium'); expect(t('max').visualQa).toBe('high');
  });
  test('thinkingFor steps up but never above the ceiling; unknown level behaves as max', () => {
    expect(thinkingFor('low', 'code', { steps: 1 })).toBe('low');
    expect(thinkingFor('low', 'code', { steps: 5 })).toBe('low');
    expect(thinkingFor('low', 'repair', { steps: 3 })).toBe('low');
    expect(thinkingFor('moderate', 'repair', { steps: 1 })).toBe('high');
    expect(thinkingFor('max', 'repair', { steps: 4 })).toBe('high');
    expect(thinkingFor('turbo', 'planner')).toBe('high');
    expect(thinkingFor(undefined, 'code')).toBe('medium');
    expect(thinkingFor('max', 'nope')).toBeNull();
  });
});

describe('aesthetic brief', () => {
  const { withAesthetics, AESTHETICS } = require('../src/advanced/levels');
  test('only applied with a level, deeper at higher levels', () => {
    expect(withAesthetics('SYS')).toBe('SYS');
    expect(withAesthetics('SYS', 'max')).toContain('top studio');
    expect(AESTHETICS.low.length).toBeLessThan(AESTHETICS.moderate.length);
    expect(AESTHETICS.moderate.length).toBeLessThan(AESTHETICS.max.length);
  });
});

/* -------------------------------------------------------------------------- llm.service */
describe('callGemini thinking option', () => {
  beforeEach(() => {
    axios.post.mockReset(); geminiPool.executeModels.mockReset();
    geminiPool.executeModels.mockImplementation(async (models, fn) => ({ result: await fn('KEY', models[0]), model: models[0] }));
    axios.post.mockResolvedValue({ data: { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }], usageMetadata: { thoughtsTokenCount: 7 } } });
  });
  const sentConfig = () => axios.post.mock.calls[0][1].generationConfig;

  test('absent option = the unchanged request (thinkingLevel low)', async () => {
    await callGemini({ system: 's', input: { a: 1 } });
    expect(sentConfig().thinkingConfig).toEqual({ thinkingLevel: 'low' });
    expect(buildThinkingConfig(undefined)).toEqual({ thinkingLevel: 'low' });
  });
  test('a level maps to thinkingLevel; unknown level falls back to the default', async () => {
    for (const l of ['minimal', 'medium', 'high']) {
      axios.post.mockClear(); await callGemini({ system: 's', input: {}, thinking: l });
      expect(sentConfig().thinkingConfig).toEqual({ thinkingLevel: l });
    }
    expect(buildThinkingConfig('extreme')).toEqual({ thinkingLevel: 'low' });
  });
  test('a numeric budget maps to thinkingBudget and is clamped to the model maximum', () => {
    expect(buildThinkingConfig(1024)).toEqual({ thinkingBudget: 1024 });
    expect(buildThinkingConfig(0)).toEqual({ thinkingBudget: 0 });
    expect(buildThinkingConfig(10_000_000)).toEqual({ thinkingBudget: 24576 });
    expect(buildThinkingConfig(-5)).toEqual({ thinkingLevel: 'low' });
    expect(Object.keys(buildThinkingConfig(2048))).toEqual(['thinkingBudget']); // never both fields
  });
  test('thinking tokens are metered by the budget', async () => {
    const b = createBudget({ maxWallClockMs: 1e9, maxLlmCalls: 99, maxTotalTokens: 1e6, maxCostUsd: 99, maxRepairAttempts: 1 });
    b.afterLlmCall({ input: {}, value: {}, usage: { promptTokenCount: 100, candidatesTokenCount: 50, thoughtsTokenCount: 400 } });
    expect(b.used.outputTokens).toBe(450); expect(b.used.thinkingTokens).toBe(400);
    b.afterLlmCall({ input: {}, value: {}, usage: { promptTokenCount: 10, thoughtsTokenCount: 30 } }); // no candidates count
    expect(b.used.outputTokens).toBe(480);
    expect(b.canEscalate()).toBe(true);
  });
});

/* -------------------------------------------------------------------------- orchestrator */
const APP = `import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import AboutPage from './pages/AboutPage.jsx';
export default function App() {
  return (<div><nav><Link to="/">Home</Link><Link to="/about">About</Link></nav>
    <Routes><Route path="/" element={<HomePage />} /><Route path="/about" element={<AboutPage />} /><Route path="*" element={<main><h1>Page not found</h1><Link to="/">Back home</Link></main>} /></Routes></div>);
}`;
const page = (name) => `import React from 'react';\nimport { Link } from 'react-router-dom';\nexport default function ${name}() { return (<main><h1>${name}</h1><Link to="/about">About</Link></main>); }`;

/** Fake agents that record the `thinking` every call received. `buildErrors(n)` returns the errors of the n-th build (1-based). */
function harness({ invalidFirstFor = null, buildErrors = () => [], repairTokens = 0, repairChanges = true, breakFirstRepair = false } = {}) {
  const seen = { planner: [], design: [], architecture: [], code: [], integration: [], repair: [], visualQa: [] };
  let builds = 0;
  const codeCalls = {};
  const deps = {
    agents: {
      requirements: { run: async () => ({ value: { websiteType: 'custom', goal: 'g', pages: ['Home', 'About'], sections: [], contentRequirements: [], features: [], userData: {}, constraints: [], assets: [] } }) },
      planner: { run: async (a) => { seen.planner.push(a.thinking); return { value: { spec: { complexity: 'simple' }, manifest: { pages: [{ id: 'home', title: 'Home', path: '/', purpose: 'Landing' }, { id: 'about', title: 'About', path: '/about', purpose: 'About us' }] } } }; } },
      design: { run: async (a) => { seen.design.push(a.thinking); return { value: { designSystem: { style: 's', theme: 'light', colors: { primary: '#1d4ed8', background: '#ffffff', text: '#111111' }, typography: {}, spacing: {}, borderRadius: {}, componentStyle: {}, layoutStrategy: {}, responsiveStrategy: {}, animationStrategy: {} } } }; } },
      architecture: { run: async (a) => { seen.architecture.push(a.thinking); return { value: { project: { framework: 'react-vite', language: 'javascript' }, files: [
        { path: '/App.js', type: 'entry', responsibility: 'routes', exports: ['default'], imports: ['/pages/HomePage.jsx', '/pages/AboutPage.jsx'] },
        { path: '/pages/HomePage.jsx', type: 'page', pageId: 'home', responsibility: 'home', exports: ['default'], imports: [] },
        { path: '/pages/AboutPage.jsx', type: 'page', pageId: 'about', responsibility: 'about', exports: ['default'], imports: [] }], dependencies: {} } }; } },
      code: { run: async ({ fileContract, thinking }) => {
        const p = fileContract.path; codeCalls[p] = (codeCalls[p] || 0) + 1;
        seen.code.push({ path: p, thinking });
        if (p === invalidFirstFor && codeCalls[p] === 1) return { value: { path: p, code: '' } }; // invalid output
        return { value: { path: p, code: p === '/App.js' ? APP : page(p.includes('Home') ? 'HomePage' : 'AboutPage'), additionalFiles: [] } };
      } },
      integration: { run: async (a) => { seen.integration.push(a.thinking); return { value: { files: {} } }; } },
      repair: { run: async (a) => {
        seen.repair.push(a.thinking);
        if (repairTokens && seen.repair.length === 1) getJobContext().afterLlmCall?.({ input: {}, value: {}, usage: { promptTokenCount: 0, candidatesTokenCount: repairTokens } });
        // a harmful first fix: dangling imports add blocking structural issues, so the verification sees MORE problems than before
        if (breakFirstRepair && seen.repair.length === 1) return { value: { rootCause: 'x', changes: [{ path: '/pages/HomePage.jsx', code: "import A from '../nope1.jsx';\nimport B from '../nope2.jsx';\n" + page('HomePage'), reason: 'x' }], newFiles: [], deleteFiles: [], dependencies: {} } };
        const changes = repairChanges ? [{ path: '/pages/HomePage.jsx', code: page('HomePage') + '\n// touched ' + seen.repair.length, reason: 'x' }] : [];
        return { value: { rootCause: 'x', changes, newFiles: [], deleteFiles: [], dependencies: {} } };
      } },
      visualQa: { run: async (a) => { seen.visualQa.push(a.thinking); return { value: { issues: [] } }; } },
    },
    build: async () => { builds += 1; const errors = buildErrors(builds); return errors.length ? { success: false, errors } : { success: true, errors: [] }; },
    ensureProductionReady: async ({ files, dependencies }) => ({ files, dependencies, report: { ok: true } }),
  };
  return { deps, seen };
}
const run = (level, h, limits = {}) => generateAdvancedWebsite({ prompt: 'a small site', websiteType: 'custom', advanced: { level, limits: { maxRepairAttempts: 6, ...limits } } }, { deps: h.deps });

describe('thinking per level in the orchestrator', () => {
  test('agents receive their role setting and it differs by level', async () => {
    const out = {};
    for (const level of ['low', 'moderate', 'max']) { const h = harness(); await run(level, h); out[level] = h.seen; }
    expect(out.low.planner).toEqual(['minimal']); expect(out.moderate.planner).toEqual(['medium']); expect(out.max.planner).toEqual(['high']);
    expect(out.low.architecture).toEqual(['minimal']); expect(out.moderate.architecture).toEqual(['medium']); expect(out.max.architecture).toEqual(['high']);
    expect(new Set(out.low.code.map((c) => c.thinking))).toEqual(new Set(['minimal']));
    expect(new Set(out.moderate.code.map((c) => c.thinking))).toEqual(new Set(['low']));
    expect(new Set(out.max.code.map((c) => c.thinking))).toEqual(new Set(['medium']));
    expect(out.low.design).toEqual(['low']); expect(out.moderate.design).toEqual(['medium']); expect(out.max.design).toEqual(['high']);
  });
  test('visual QA gets its role setting at max', async () => {
    const h = harness();
    h.deps.build = async ({ afterBuild }) => ({ success: true, errors: [], afterBuildResult: afterBuild ? await afterBuild('/dist') : null });
    h.deps.probe = async (dist, opts) => ({ pages: [], forms: [], discovered: [], shots: opts.collectShots ? [{ pageId: 'home', viewport: 'desktop', mimeType: 'image/jpeg', data: 'x' }] : [] });
    await run('max', h);
    expect(h.seen.visualQa).toEqual(['high']);
  });
  test('unknown level behaves as max and reports it', async () => {
    const h = harness(); const r = await run('turbo', h);
    expect(h.seen.planner).toEqual(['high']); expect(r.generationMeta.advanced.effort.level).toBe('max');
  });
  test('effort is reported in generationMeta.advanced', async () => {
    const r = await run('moderate', harness());
    expect(r.generationMeta.advanced.effort).toMatchObject({ level: 'moderate', escalations: 0, thinking: { planner: 'medium', code: 'low' } });
  });
});

describe('adaptive escalation', () => {
  test('a code file with invalid output is retried one step higher, within the ceiling', async () => {
    for (const [level, first, second, esc] of [['moderate', 'low', 'medium', 1], ['max', 'medium', 'high', 1], ['low', 'minimal', 'low', 1]]) {
      const h = harness({ invalidFirstFor: '/pages/AboutPage.jsx' });
      const r = await run(level, h);
      const calls = h.seen.code.filter((c) => c.path === '/pages/AboutPage.jsx').map((c) => c.thinking);
      expect(calls).toEqual([first, second]);
      expect(r.generationMeta.advanced.effort.escalations).toBe(esc);
    }
  });
  test('repair: round 1 uses the level setting, round 2+ one step higher, never above the ceiling', async () => {
    const errs = (n) => (n <= 2 ? ['boom /pages/HomePage.jsx'] : []);
    const mod = harness({ buildErrors: errs }); const rm = await run('moderate', mod);
    expect(mod.seen.repair).toEqual(['medium', 'high']); expect(rm.generationMeta.advanced.effort.escalations).toBe(1);
    const low = harness({ buildErrors: errs }); const rl = await run('low', low);
    expect(low.seen.repair).toEqual(['low', 'low']); expect(rl.generationMeta.advanced.effort.escalations).toBe(0);
    const mx = harness({ buildErrors: errs }); await run('max', mx);
    expect(mx.seen.repair).toEqual(['high', 'high']);
  });
  test('a repair round that makes things worse is rolled back and the next round escalates', async () => {
    const h = harness({ breakFirstRepair: true, buildErrors: (n) => (n === 1 ? ['e1 /pages/HomePage.jsx'] : []) });
    const r = await run('moderate', h);
    const repairs = r.generationMeta.advanced.repairs;
    expect(repairs[0].rolledBack).toBe(true);
    expect(h.seen.repair[0]).toBe('medium'); expect(h.seen.repair[1]).toBe('high');
    const ev = r.generationMeta.advanced.effort.events.find((e) => e.role === 'repair');
    expect(ev).toMatchObject({ from: 'medium', to: 'high' });
    expect(ev.reason).toMatch(/rollback/);
    expect(r.generationMeta.advanced.effort.escalations).toBe(1);
  });
  test('no escalation when less than 15% of the token budget remains', async () => {
    const errs = (n) => (n <= 2 ? ['boom /pages/HomePage.jsx'] : []);
    // 1,000,000-token plan budget; moderate's floor keeps it, round-1 repair burns ~900k so only ~10% is left
    const h = harness({ buildErrors: errs, repairTokens: 900_000 });
    const r = await run('moderate', h, { maxTotalTokens: 1_000_000, maxCostUsd: 50 });
    expect(h.seen.repair).toEqual(['medium', 'medium']);
    const eff = r.generationMeta.advanced.effort;
    expect(eff.escalations).toBe(0);
    expect(eff.events.some((e) => e.skipped === 'low-budget')).toBe(true);
  });
  test('with plenty of budget the same run does escalate', async () => {
    const errs = (n) => (n <= 2 ? ['boom /pages/HomePage.jsx'] : []);
    const h = harness({ buildErrors: errs, repairTokens: 1000 });
    await run('moderate', h, { maxTotalTokens: 10_000_000 });
    expect(h.seen.repair).toEqual(['medium', 'high']);
  });
  test('old checkpoints without escalations still resume', async () => {
    const h = harness(); const { _internals } = require('../src/orchestrator/advancedGeneration.orchestrator');
    expect(_internals.CHECKPOINT_SCHEMA).toBe(1);
    const cps = []; await generateAdvancedWebsite({ prompt: 'x', websiteType: 'custom', advanced: { level: 'moderate' } }, { deps: h.deps, onCheckpoint: (c) => cps.push(c) });
    const old = { ...cps[cps.length - 1] }; delete old.escalations;
    const h2 = harness(); const r = await generateAdvancedWebsite({ prompt: 'x', websiteType: 'custom', advanced: { level: 'moderate' } }, { deps: h2.deps, checkpoint: old });
    expect(r.generationMeta.advanced.effort.escalations).toBe(0);
  });
});
