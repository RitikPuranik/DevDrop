jest.mock('../src/agents/deploymentReadiness.agent', () => ({ run: jest.fn() }));
jest.mock('../src/validators/build.validator', () => ({ run: jest.fn() }));

const agent = require('../src/agents/deploymentReadiness.agent');
const buildValidator = require('../src/validators/build.validator');
const { ensureProductionReady } = require('../src/orchestrator/deploymentReadiness');

const pkg = { code: JSON.stringify({ name: 'x', dependencies: { react: '^19.0.0' } }) };
const risky = { code: 'export default function App(){ const k = process.env.REACT_APP_KEY; return <main>{String(k)}</main>; }' };
const fixed = { path: '/App.js', code: 'export default function App(){ return <main>ok</main>; }', reason: 'no env' };

beforeEach(() => { jest.clearAllMocks(); });

test('fixes a sandbox-only finding, re-validates the build and freezes dependencies', async () => {
  agent.run.mockResolvedValue({ value: { changes: [fixed] } });
  buildValidator.run.mockResolvedValue({ success: true, resolvedDependencies: { react: '19.1.0' } });
  const meta = [];
  const out = await ensureProductionReady({ files: { '/App.js': risky, '/package.json': pkg }, dependencies: {} }, meta);
  expect(out.files['/App.js'].code).toContain('ok');
  expect(JSON.parse(out.files['/package.json'].code).dependencies.react).toBe('19.1.0');
  expect(out.report).toMatchObject({ fixed: 1, pinned: 1, unresolved: [] });
  expect(buildValidator.run).toHaveBeenCalledTimes(1);
  expect(meta.map((m) => m.name)).toEqual(['deployment-readiness:1', 'deployment-readiness-build:1']);
});

test('keeps the validated files when the agent output no longer builds', async () => {
  agent.run.mockResolvedValue({ value: { changes: [fixed] } });
  buildValidator.run.mockResolvedValue({ success: false, errors: ['boom'] });
  const out = await ensureProductionReady({ files: { '/App.js': risky, '/package.json': pkg }, dependencies: {} }, []);
  expect(out.files['/App.js']).toBe(risky);
  expect(out.report.unresolved).toEqual([expect.objectContaining({ id: 'process-env' })]);
});

test('never throws: an agent failure leaves the original files untouched', async () => {
  agent.run.mockRejectedValue(new Error('llm down'));
  const files = { '/App.js': risky, '/package.json': pkg };
  const out = await ensureProductionReady({ files, dependencies: {} }, []);
  expect(out.files).toEqual(files);
  expect(out.report.skipped).toMatch(/llm down/);
});

test('does not call the agent or rebuild when nothing needs fixing', async () => {
  const clean = { '/App.js': { code: 'export default function App(){return <main>ok</main>}' }, '/package.json': pkg };
  const out = await ensureProductionReady({ files: clean, dependencies: {}, resolvedDependencies: { react: '19.1.0' } }, []);
  expect(agent.run).not.toHaveBeenCalled();
  expect(buildValidator.run).not.toHaveBeenCalled();
  expect(out.report.pinned).toBe(1);
});

test('rejects agent edits that fail static validation', async () => {
  agent.run.mockResolvedValue({ value: { changes: [{ path: '/App.js', code: 'export default function App( {', reason: 'bad' }] } });
  const out = await ensureProductionReady({ files: { '/App.js': risky, '/package.json': pkg }, dependencies: {} }, []);
  expect(buildValidator.run).not.toHaveBeenCalled();
  expect(out.files['/App.js']).toBe(risky);
});
