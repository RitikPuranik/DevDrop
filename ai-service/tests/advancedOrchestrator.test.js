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
