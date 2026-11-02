'use strict';
const { createBudget } = require('../src/advanced/budget');
const { createScheduler } = require('../src/advanced/scheduler');
const { createProjectStore } = require('../src/advanced/projectStore');
const { extractRoutes } = require('../src/advanced/routes');
const { normalizeFileRequests, normalizePageManifest } = require('../src/advanced/contracts');

test('scheduler runs imports before importers, bounds parallelism, accepts files added mid-run', async () => {
  const order = []; let live = 0; let peak = 0;
  const s = createScheduler({ parallelism: 2, contracts: [
    { path: '/a.jsx', imports: ['/b.jsx', '/c.jsx'] }, { path: '/b.jsx', imports: [] }, { path: '/c.jsx', imports: [] }, { path: '/d.jsx', imports: [] }] });
  await s.run(async (c) => {
    live += 1; peak = Math.max(peak, live);
    if (c.path === '/b.jsx') s.add({ path: '/late.jsx', imports: [] });
    await new Promise((r) => setTimeout(r, 5)); order.push(c.path); live -= 1;
  });
  expect(peak).toBeLessThanOrEqual(2);
  expect(order.indexOf('/a.jsx')).toBeGreaterThan(order.indexOf('/b.jsx'));
  expect(order.indexOf('/a.jsx')).toBeGreaterThan(order.indexOf('/c.jsx'));
  expect(order).toContain('/late.jsx');
});

test('scheduler survives import cycles', async () => {
  const done = [];
  await createScheduler({ contracts: [{ path: '/x.js', imports: ['/y.js'] }, { path: '/y.js', imports: ['/x.js'] }] }).run(async (c) => { done.push(c.path); });
  expect(done.sort()).toEqual(['/x.js', '/y.js']);
});

test('project store: claims prevent conflicting writes, unsafe paths rejected', () => {
  const st = createProjectStore();
  st.claim('/a.jsx', 'w1');
  expect(st.claim('/a.jsx', 'w2')).toBe(false);
  expect(st.write('/a.jsx', 'x', { owner: 'w2' }).ok).toBe(false);
  expect(st.write('/a.jsx', 'x', { owner: 'w1' }).ok).toBe(true);
  expect(st.write('../etc/passwd', 'x', { owner: 'w1' }).ok).toBe(false);
});

test('budget: repair attempts are bounded, tokens/calls enforced, no file-count limit exists', () => {
  const b = createBudget({ maxRepairAttempts: 2, maxLlmCalls: 2, maxWallClockMs: 60000, maxTotalTokens: 1e9, maxOutputBytes: 1e9, maxParallelism: 3, maxCostUsd: 100 });
  expect(b.canRepair()).toBe(true); b.recordRepairAttempt(); b.recordRepairAttempt(); expect(b.canRepair()).toBe(false);
  b.beforeLlmCall(); b.afterLlmCall({ input: 'a', value: 'b' }); b.beforeLlmCall(); b.afterLlmCall({ input: 'a', value: 'b' });
  expect(() => b.beforeLlmCall()).toThrow();
  const files = Object.fromEntries(Array.from({ length: 800 }, (_, i) => [`/f${i}.js`, { code: 'x' }]));
  expect(() => b.assertOutputSize(files)).not.toThrow();
});

test('routes are extracted from App source (static, nested, dynamic)', () => {
  const r = extractRoutes({ '/App.js': { code: `<Routes><Route path="/" element={<A/>}/><Route path="/shop/:id" element={<B/>}/><Route path="*" element={<N/>}/></Routes>` } });
  expect(r).toEqual(expect.arrayContaining(['/', '/shop/:id', '/*']));
});

test('file requests: valid accepted, duplicates and unsafe rejected', () => {
  const { accepted, rejected } = normalizeFileRequests([{ path: '/utils/price.js', responsibility: 'fmt', exports: ['fmt'], code: 'export const fmt=1;' }, { path: '/App.js', responsibility: 'x' }, { path: '../x.js' }, { path: '/types.ts' }], { existing: (p) => p === '/App.js', requester: '/p.jsx' });
  expect(accepted.map((a) => a.path)).toEqual(['/utils/price.js']);
  expect(rejected.length).toBe(3);
});

test('page manifest does not force a page count', () => {
  expect(normalizePageManifest({ pages: [{ id: 'home', path: '/', title: 'Home' }] }).pages.length).toBe(1);
  const many = Array.from({ length: 25 }, (_, i) => ({ id: `p${i}`, path: i ? `/p${i}` : '/', title: `P${i}` }));
  expect(normalizePageManifest({ pages: many }).pages.length).toBeGreaterThanOrEqual(25);
});
