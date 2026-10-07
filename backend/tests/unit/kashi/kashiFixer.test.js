/**
 * Kashi deployment doctor: log -> file selection, and the whole
 * fail -> fix -> push -> redeploy -> READY loop with every external system mocked.
 */
process.env.KASHI_BUILD_POLL_MS = '1';
process.env.KASHI_AUTO_DEPLOY_WAIT_MS = '1';
process.env.KASHI_FIX_MAX_ROUNDS = '3';
process.env.KASHI_RUNTIME_SETTLE_MS = '0';

const mockRuns = new Map();

jest.mock('../../../src/modules/kashi/kashiFixRun.model', () => {
  const model = {
    create: jest.fn(async (doc) => { const d = { _id: `run${mockRuns.size + 1}`, status: 'queued', steps: [], commits: [], round: 0, ...doc, save: async function save() { mockRuns.set(String(this._id), this); } }; mockRuns.set(d._id, d); return d; }),
    findById: jest.fn((id) => { const r = mockRuns.get(String(id)); const p = Promise.resolve(r || null); p.select = () => p; return p; }),
    findOne: jest.fn(async () => null),
    updateOne: jest.fn(async (q, u) => {
      const r = mockRuns.get(String(q._id)); if (!r) return;
      for (const [k, v] of Object.entries(u)) {
        if (k === '$push') { for (const [f, val] of Object.entries(v)) { r[f] = r[f] || []; r[f].push(...(val.$each || [val])); } } else r[k] = v;
      }
    }),
  };
  return model;
});

const deployment = { _id: 'dep1', userId: 'u1', status: 'FAILED', backendProvider: null, repository: { owner: 'me', name: 'site', defaultBranch: 'main' }, vercel: { projectId: 'prj', deploymentId: 'd0' } };
jest.mock('../../../src/modules/deployment/deployment.model', () => ({ findOne: jest.fn(async () => deployment), findById: jest.fn(async () => deployment), updateOne: jest.fn(async () => ({})) }));
jest.mock('../../../src/modules/deployment/deploymentProviderConnection.model', () => ({ findOne: () => ({ select: async () => ({ credentialEncrypted: 'x', metadata: {} }) }) }));
jest.mock('../../../src/modules/github/githubConnection.model', () => ({ findOne: () => ({ select: async () => ({ accessTokenEncrypted: 'y' }) }) }));
jest.mock('../../../src/shared/utils/crypto', () => ({ decrypt: (v) => `dec-${v}` }));

const mockGithub = {
  getRepoTree: jest.fn(async () => [{ path: 'package.json', type: 'blob', size: 100 }, { path: 'src/App.jsx', type: 'blob', size: 100 }, { path: 'src/components/Header.jsx', type: 'blob', size: 100 }]),
  getFileContent: jest.fn(async (_t, _o, _r, path) => (path === 'src/App.jsx' ? "import Header from './components/header';\n" : '{}')),
  commitFilesToBranch: jest.fn(async () => 'abcdef1234567'),
};
jest.mock('../../../src/services/github.service', () => mockGithub);

const mockVercel = {
  listProjectDeployments: jest.fn(async () => [{ id: 'd0', target: 'production', createdAt: 1 }]),
  getDeploymentStatus: jest.fn(),
  getBuildLogs: jest.fn(async () => "Module not found: Can't resolve './components/header' in '/vercel/path0/src'\nImport trace: ./src/App.jsx"),
  getProjectRepoId: jest.fn(async () => ({ repoId: 1, projectName: 'site' })),
  deploy: jest.fn(async () => ({ deployId: 'd1' })),
};
jest.mock('../../../src/services/deployment/providers/vercel.provider', () => mockVercel);

const mockAi = { proposeFix: jest.fn(), runtimeCheck: jest.fn() };
jest.mock('../../../src/modules/kashi/kashiAiClient', () => mockAi);

const Deployment = require('../../../src/modules/deployment/deployment.model');
const { pickFilesFromLog, pickFilesForRuntime, pickCheckUrl, startFixRun, runLoop } = require('../../../src/modules/kashi/kashiFixer.service');

const wait = async (id) => { for (let i = 0; i < 1000 && ['queued', 'running'].includes(mockRuns.get(id).status); i += 1) await new Promise((r) => setTimeout(r, 5)); return mockRuns.get(id); };

beforeEach(() => {
  mockRuns.clear();
  jest.clearAllMocks();
  mockVercel.getDeploymentStatus.mockReset();
  mockVercel.listProjectDeployments.mockReset().mockResolvedValue([{ id: 'd0', target: 'production', createdAt: 1 }]);
  mockAi.proposeFix.mockReset();
  mockAi.runtimeCheck.mockReset().mockResolvedValue({ ok: true, errors: [] });
  mockGithub.commitFilesToBranch.mockResolvedValue('abcdef1234567');
});

describe('pickFilesFromLog', () => {
  const tree = ['package.json', 'frontend/package.json', 'frontend/src/App.jsx', 'frontend/src/components/Header.jsx', 'node_modules/x/index.js'];
  test('matches log paths relative to the Vercel root dir by suffix and skips node_modules', () => {
    const picked = pickFilesFromLog('Error in ./src/App.jsx:12:3\n at node_modules/x/index.js', tree);
    expect(picked).toContain('frontend/src/App.jsx');
    expect(picked).not.toContain('node_modules/x/index.js');
  });
  test('adds the shallowest package.json for dependency errors', () => {
    expect(pickFilesFromLog("Module not found: Can't resolve 'lodash'", tree)).toContain('package.json');
  });
  test('falls back to package.json when the log names no file', () => {
    expect(pickFilesFromLog('Command "npm run build" exited with 1', tree)).toEqual(['package.json', 'frontend/package.json']);
  });
});

describe('fix loop', () => {
  test('fails, pushes a minimal fix, redeploys and finishes READY', async () => {
    mockVercel.getDeploymentStatus
      .mockResolvedValueOnce({ state: 'ERROR', isTerminal: true, isSuccess: false })
      .mockResolvedValueOnce({ state: 'READY', isTerminal: true, isSuccess: true, url: 'https://site.vercel.app' });
    mockAi.proposeFix.mockResolvedValueOnce({ status: 'fix', summary: 'Fix import casing', changedLines: 1, files: [{ path: 'src/App.jsx', content: "import Header from './components/Header';\n" }] });
    mockVercel.listProjectDeployments
      .mockResolvedValueOnce([{ id: 'd0', target: 'production', createdAt: 1 }]) // resolveStarting
      .mockResolvedValue([]); // no auto deploy appears -> explicit trigger

    const { run } = await startFixRun({ userId: 'u1', deploymentId: 'dep1' });
    const done = await wait(run._id);

    expect(done.status).toBe('succeeded');
    expect(mockGithub.commitFilesToBranch).toHaveBeenCalledTimes(1);
    const pushed = mockGithub.commitFilesToBranch.mock.calls[0][4];
    expect(pushed.files).toEqual([{ path: 'src/App.jsx', content: "import Header from './components/Header';\n" }]);
    expect(mockVercel.deploy).toHaveBeenCalled();
    expect(done.finalUrl).toBe('https://site.vercel.app');
    expect(Deployment.updateOne).toHaveBeenCalledWith({ _id: 'dep1' }, expect.objectContaining({ status: 'SUCCESS', 'vercel.deploymentId': 'd1' }));
    // the AI only received the file the log pointed at (+ nothing unrelated)
    const sent = mockAi.proposeFix.mock.calls[0][0];
    expect(sent.files.map((f) => f.path)).toEqual(['src/App.jsx']);
  });

  test('stops with cannot_fix for environment errors and pushes nothing', async () => {
    mockVercel.getDeploymentStatus.mockResolvedValue({ state: 'ERROR', isTerminal: true, isSuccess: false });
    mockAi.proposeFix.mockResolvedValueOnce({ status: 'cannot_fix', reason: 'Missing env var DATABASE_URL' });
    const { run } = await startFixRun({ userId: 'u1', deploymentId: 'dep1' });
    const done = await wait(run._id);
    expect(done.status).toBe('cannot_fix');
    expect(mockGithub.commitFilesToBranch).not.toHaveBeenCalled();
  });

  test('gives up after max rounds and tells the AI what was already tried', async () => {
    mockVercel.getDeploymentStatus.mockResolvedValue({ state: 'ERROR', isTerminal: true, isSuccess: false });
    mockVercel.listProjectDeployments.mockResolvedValue([{ id: 'dX', target: 'production', createdAt: Date.now() + 1e6, commitSha: 'abcdef1234567' }]);
    mockAi.proposeFix.mockResolvedValue({ status: 'fix', summary: 'try', changedLines: 1, files: [{ path: 'src/App.jsx', content: 'x' }] });
    const { run } = await startFixRun({ userId: 'u1', deploymentId: 'dep1' });
    const done = await wait(run._id);
    expect(done.status).toBe('failed');
    expect(mockAi.proposeFix).toHaveBeenCalledTimes(3);
    expect(mockAi.proposeFix.mock.calls[2][0].previousAttempts).toHaveLength(2);
  });

  test('refuses deployments that are still in progress', async () => {
    Deployment.findOne.mockResolvedValueOnce({ ...deployment, status: 'DEPLOYING_FRONTEND' });
    await expect(startFixRun({ userId: 'u1', deploymentId: 'dep1' })).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('runtime verification (READY is not "works")', () => {
  const tree = ['package.json', 'index.html', 'src/main.jsx', 'src/App.jsx', 'src/components/Hero.jsx', 'src/pages/Home.jsx'];

  test('pickFilesForRuntime: components named in the report, then entry files, then package.json', () => {
    const picked = pickFilesForRuntime('- Uncaught exception: Hero is not defined\n- console.error: The above error occurred in the <Home> component', tree);
    expect(picked.slice(0, 2).sort()).toEqual(['src/components/Hero.jsx', 'src/pages/Home.jsx']);
    expect(picked).toEqual(expect.arrayContaining(['src/main.jsx', 'src/App.jsx', 'index.html', 'package.json']));
  });

  test('pickCheckUrl prefers a public *.vercel.app alias over the unique deployment URL', () => {
    expect(pickCheckUrl({ url: 'https://site-abc123-team.vercel.app', aliases: ['site.vercel.app'] })).toBe('https://site.vercel.app');
    expect(pickCheckUrl({ url: 'https://site-abc123-team.vercel.app', aliases: [] })).toBe('https://site-abc123-team.vercel.app');
  });

  test('READY but blank page: Kashi fixes it in runtime mode, redeploys and only then reports success', async () => {
    mockVercel.getDeploymentStatus
      .mockResolvedValueOnce({ state: 'READY', isTerminal: true, isSuccess: true, url: 'https://site.vercel.app', aliases: [] })
      .mockResolvedValueOnce({ state: 'READY', isTerminal: true, isSuccess: true, url: 'https://site2.vercel.app', aliases: [] });
    mockAi.runtimeCheck
      .mockResolvedValueOnce({ ok: false, kind: 'code', errors: ['#root is empty after load: nothing was rendered (blank screen).', "Uncaught exception: Cannot read properties of undefined (reading 'map')"] })
      .mockResolvedValueOnce({ ok: true, errors: [] });
    mockAi.proposeFix.mockResolvedValueOnce({ status: 'fix', summary: 'Guard undefined list', changedLines: 1, files: [{ path: 'src/App.jsx', content: 'fixed' }] });
    mockVercel.listProjectDeployments.mockResolvedValueOnce([{ id: 'd0', target: 'production', createdAt: 1 }]).mockResolvedValue([]);

    const { run } = await startFixRun({ userId: 'u1', deploymentId: 'dep1' });
    const done = await wait(run._id);

    expect(done.status).toBe('succeeded');
    expect(mockAi.runtimeCheck).toHaveBeenCalledTimes(2);
    expect(mockAi.proposeFix).toHaveBeenCalledTimes(1);
    const sent = mockAi.proposeFix.mock.calls[0][0];
    expect(sent.mode).toBe('runtime');
    expect(sent.errorLog).toMatch(/BROWSER REPORT/);
    expect(mockGithub.commitFilesToBranch.mock.calls[0][4].message).toMatch(/^fix\(runtime\)/);
    expect(done.resultMessage).toMatch(/browser/);
  });

  test('missing environment variable: reports it, pushes nothing', async () => {
    mockVercel.getDeploymentStatus.mockResolvedValue({ state: 'READY', isTerminal: true, isSuccess: true, url: 'https://site.vercel.app' });
    mockAi.runtimeCheck.mockResolvedValue({ ok: false, kind: 'env', hint: 'Add VITE_SUPABASE_URL in Vercel.', errors: ['Uncaught exception: supabaseUrl is required.'] });
    const { run } = await startFixRun({ userId: 'u1', deploymentId: 'dep1' });
    const done = await wait(run._id);
    expect(done.status).toBe('cannot_fix');
    expect(done.resultMessage).toMatch(/VITE_SUPABASE_URL/);
    expect(mockGithub.commitFilesToBranch).not.toHaveBeenCalled();
    expect(mockAi.proposeFix).not.toHaveBeenCalled();
  });

  test('checker unavailable: never blocks a READY deployment', async () => {
    mockVercel.getDeploymentStatus.mockResolvedValue({ state: 'READY', isTerminal: true, isSuccess: true, url: 'https://site.vercel.app' });
    mockAi.runtimeCheck.mockRejectedValue(Object.assign(new Error('down'), { userMessage: 'Kashi is unavailable right now.' }));
    const { run } = await startFixRun({ userId: 'u1', deploymentId: 'dep1' });
    const done = await wait(run._id);
    expect(done.status).toBe('succeeded');
    expect(done.resultMessage).not.toMatch(/browser/);
  });
});
