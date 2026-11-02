'use strict';
const { generateAdvancedWebsite } = require('../src/orchestrator/advancedGeneration.orchestrator');

const APP = `import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import AboutPage from './pages/AboutPage.jsx';
export default function App() {
  return (<div><nav><Link to="/">Home</Link><Link to="/about">About</Link></nav>
    <Routes><Route path="/" element={<HomePage />} /><Route path="/about" element={<AboutPage />} /><Route path="*" element={<main><h1>Page not found</h1><Link to="/">Back home</Link></main>} /></Routes></div>);
}`;
const page = (name, extra = '') => `import React from 'react';\nimport { Link } from 'react-router-dom';\n${extra}export default function ${name}() { return (<main><h1>${name}</h1><Link to="/about">About</Link></main>); }`;

function fakes({ extraFile = false, buildFail = 0 } = {}) {
  const calls = { repair: 0, build: 0 };
  const code = { run: async ({ fileContract }) => {
    const p = fileContract.path;
    const src = p === '/App.js' ? APP : p.includes('Home') ? page('HomePage', extraFile ? "import Hero from '../components/Hero.jsx';\n" : '') : p === '/components/Hero.jsx' ? 'import React from "react";\nexport default function Hero(){return <section><h2>Hero</h2></section>;}' : page('AboutPage');
    return { value: { path: p, code: src, additionalFiles: extraFile && p.includes('Home') ? [{ path: '/components/Hero.jsx', type: 'component', responsibility: 'Hero banner', exports: ['default'], imports: [] }] : [] } };
  } };
  return { calls, deps: {
    agents: {
      requirements: { run: async () => ({ value: { websiteType: 'custom', goal: 'g', pages: ['Home', 'About'], sections: [], contentRequirements: [], features: [], userData: {}, constraints: [], assets: [] } }) },
      planner: { run: async () => ({ value: { spec: { complexity: 'simple' }, manifest: { pages: [{ id: 'home', title: 'Home', path: '/', purpose: 'Landing' }, { id: 'about', title: 'About', path: '/about', purpose: 'About us' }] } } }) },
      design: { run: async () => ({ value: { designSystem: { style: 's', theme: 'light', colors: { primary: '#1d4ed8', background: '#ffffff', text: '#111111' }, typography: {}, spacing: {}, borderRadius: {}, componentStyle: {}, layoutStrategy: {}, responsiveStrategy: {}, animationStrategy: {} } } }) },
      architecture: { run: async () => ({ value: { project: { framework: 'react-vite', language: 'javascript' }, files: [
        { path: '/App.js', type: 'entry', responsibility: 'routes', exports: ['default'], imports: ['/pages/HomePage.jsx', '/pages/AboutPage.jsx'] },
        { path: '/pages/HomePage.jsx', type: 'page', pageId: 'home', responsibility: 'home', exports: ['default'], imports: [] },
        { path: '/pages/AboutPage.jsx', type: 'page', pageId: 'about', responsibility: 'about', exports: ['default'], imports: [] }], dependencies: {} } }) },
      code,
      integration: { run: async () => ({ value: { files: {} } }) },
      repair: { run: async () => { calls.repair += 1; return { value: { files: {}, newFiles: [], rootCause: 'none' } }; } },
      visualQa: { run: async () => ({ value: { issues: [] } }) },
    },
    build: async () => { calls.build += 1; return calls.build <= buildFail ? { success: false, errors: ['boom /pages/HomePage.jsx'] } : { success: true, errors: [] }; },
    ensureProductionReady: async ({ files, dependencies }) => ({ files, dependencies, report: { ok: true } }),
  } };
}
const input = { prompt: 'a small site', websiteType: 'custom', advanced: { limits: { maxRepairAttempts: 2 } } };

test('small site stays small, has routing + 404, reports advanced meta', async () => {
  const { deps } = fakes();
  const stages = [];
  const r = await generateAdvancedWebsite(input, { deps, onStage: (s) => stages.push(s) });
  expect(Object.keys(r.files)).toEqual(expect.arrayContaining(['/App.js', '/main.jsx', '/pages/HomePage.jsx', '/pages/AboutPage.jsx', '/styles/tokens.css']));
  expect(r.files['/main.jsx'].code).toMatch(/BrowserRouter/);
  expect(r.generationMeta.advanced.pages).toHaveLength(2);
  expect(r.generationMeta.advanced.quality.passed).toBe(true);
  expect(Object.keys(r.files).length).toBeLessThan(20);
  expect(JSON.parse(r.files['/package.json'].code).dependencies['react-router-dom']).toBeTruthy();
});

test('worker-requested files are created dynamically and survive', async () => {
  const { deps } = fakes({ extraFile: true });
  const r = await generateAdvancedWebsite(input, { deps });
  expect(r.files['/components/Hero.jsx']).toBeTruthy();
});

test('a failing build triggers a bounded repair and then fails honestly', async () => {
  const { deps, calls } = fakes({ buildFail: 99 });
  await expect(generateAdvancedWebsite(input, { deps })).rejects.toMatchObject({ debugContext: expect.any(Object) });
  expect(calls.repair).toBeLessThanOrEqual(2 * 1 + 2);
  expect(calls.repair).toBeGreaterThan(0);
});

test('checkpoints are emitted while generating', async () => {
  const { deps } = fakes();
  const cps = [];
  await generateAdvancedWebsite(input, { deps, onCheckpoint: (c) => cps.push(c.phase) });
  expect(cps).toEqual(expect.arrayContaining(['planned', 'generated']));
});

test('cancellation stops the run', async () => {
  const { runWithJob } = require('../src/utils/jobContext');
  const { deps } = fakes();
  await expect(runWithJob({ isCancelled: () => true }, () => generateAdvancedWebsite(input, { deps }))).rejects.toMatchObject({ cancelled: true });
});

/* -------------------------------------------------------------------------- build levels */
const { applyLevel, resolveLevel, profileFor, withLevelBrief } = require('../src/advanced/levels');
const { resolveLimits } = require('../src/advanced/config');

describe('advanced build levels', () => {
  const plan = { maxWallClockMs: 90 * 60000, maxLlmCalls: 800, maxTotalTokens: 10_000_000, maxCostUsd: 8, maxOutputBytes: 12 * 1048576, maxRepairAttempts: 6, maxParallelism: 4 };
  test('unknown or missing level keeps the pre-levels behaviour (max)', () => {
    expect(resolveLevel(undefined)).toBe('max'); expect(resolveLevel('turbo')).toBe('max'); expect(resolveLevel('LOW')).toBe('low');
  });
  test('budgets are ordered low < moderate < max and never exceed the plan', () => {
    const [lo, mo, mx] = ['low', 'moderate', 'max'].map((l) => applyLevel(resolveLimits(plan), l));
    for (const k of ['maxWallClockMs', 'maxLlmCalls', 'maxTotalTokens', 'maxCostUsd', 'maxRepairAttempts']) {
      expect(lo[k]).toBeLessThan(mo[k]); expect(mo[k]).toBeLessThanOrEqual(mx[k]); expect(mx[k]).toBeLessThanOrEqual(resolveLimits(plan)[k]);
    }
    expect(mx).toMatchObject({ maxLlmCalls: 800, maxRepairAttempts: 6 });
    expect(lo.maxParallelism).toBe(mx.maxParallelism);
  });
  test('a small plan is never pushed above itself by a level floor', () => {
    const tiny = applyLevel({ ...resolveLimits(plan), maxLlmCalls: 30, maxCostUsd: 0.2 }, 'low');
    expect(tiny.maxLlmCalls).toBeLessThanOrEqual(30); expect(tiny.maxCostUsd).toBeLessThanOrEqual(0.2);
  });
  test('briefs differ and only apply when a level is given', () => {
    expect(withLevelBrief('SYS')).toBe('SYS');
    expect(withLevelBrief('SYS', 'low')).toContain('LOW'); expect(withLevelBrief('SYS', 'max')).toContain('MAX');
  });
  test('quality layers: low skips browser+visual, moderate adds browser, max adds visual', () => {
    expect(profileFor('low').qa).toEqual({ browser: false, visual: false });
    expect(profileFor('moderate').qa).toEqual({ browser: true, visual: false });
    expect(profileFor('max').qa).toEqual({ browser: true, visual: true });
  });

  async function runLevel(level) {
    const { deps } = fakes();
    const seen = { levels: [], probes: 0, visual: 0 };
    for (const a of ['planner', 'architecture', 'code']) { const orig = deps.agents[a].run; deps.agents[a].run = async (args) => { seen.levels.push(args.level); return orig(args); }; }
    deps.agents.visualQa = { run: async () => { seen.visual += 1; return { value: { issues: [] } }; } };
    deps.build = async ({ afterBuild }) => ({ success: true, errors: [], afterBuildResult: afterBuild ? await afterBuild('/dist') : null });
    deps.probe = async (dist, opts) => { seen.probes += 1; return { pages: [], forms: [], discovered: [], shots: opts.collectShots ? [{ pageId: 'home', viewport: 'desktop', mimeType: 'image/jpeg', data: 'x' }] : [] }; };
    const r = await generateAdvancedWebsite({ ...input, advanced: { limits: { maxRepairAttempts: 6 }, level } }, { deps });
    return { r, seen };
  }
  test('each level changes what actually runs', async () => {
    const low = await runLevel('low'); const mod = await runLevel('moderate'); const max = await runLevel('max');
    expect(low.r.generationMeta.advanced.level).toBe('low');
    expect(low.seen.levels.every((l) => l === 'low')).toBe(true);
    expect(low.seen.probes).toBe(0); expect(low.seen.visual).toBe(0);
    expect(low.r.generationMeta.advanced.quality.layers.functional.status).toBe('skipped');
    expect(low.r.generationMeta.advanced.quality.layers.visual.status).toBe('skipped');
    expect(mod.seen.probes).toBeGreaterThan(0); expect(mod.seen.visual).toBe(0);
    expect(mod.r.generationMeta.advanced.quality.layers.visual.status).toBe('skipped');
    expect(max.seen.probes).toBeGreaterThan(0); expect(max.seen.visual).toBe(1);
    expect(max.r.generationMeta.advanced.budget.limits.maxLlmCalls).toBeGreaterThan(low.r.generationMeta.advanced.budget.limits.maxLlmCalls);
  });
});
