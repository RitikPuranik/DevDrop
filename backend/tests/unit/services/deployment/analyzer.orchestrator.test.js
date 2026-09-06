// Real analyzeRepository() logic under test — this is the pipeline that
// decides how a purchased project gets deployed (frontend/backend
// detection, framework matching, env var scanning). Prior to this file it
// had 0% coverage: every other test (deployment.controller.test.js) mocks
// this module away entirely. Only the GitHub API boundary is mocked here;
// the real analyzer, real FRAMEWORK_RULES, and real envScan all run.
jest.mock('../../../../src/services/github.service');

const githubService = require('../../../../src/services/github.service');
const { analyzeRepository } = require('../../../../src/services/deployment/analyzer');

const blob = (path, size = 100) => ({ type: 'blob', path, size });

const baseArgs = { accessToken: 'tok', owner: 'me', repo: 'app', branch: 'main' };

describe('analyzeRepository', () => {
  beforeEach(() => {
    githubService.getRepository.mockResolvedValue({ defaultBranch: 'main' });
    githubService.getFileContent.mockResolvedValue(null);
  });

  it('detects a FULLSTACK project with a Vite/React frontend and an Express backend in separate roots', async () => {
    githubService.getRepoTree.mockResolvedValue([
      blob('frontend/package.json'),
      blob('frontend/vite.config.js'),
      blob('frontend/src/App.jsx'),
      blob('backend/package.json'),
      blob('backend/server.js'),
    ]);
    githubService.getFileContent.mockImplementation(async (token, owner, repo, path) => {
      if (path === 'frontend/package.json') return JSON.stringify({ dependencies: { react: '18.0.0', vite: '5.0.0' } });
      if (path === 'backend/package.json') return JSON.stringify({ dependencies: { express: '4.0.0' }, scripts: { start: 'node server.js' } });
      return null;
    });

    const result = await analyzeRepository(baseArgs);

    expect(result.architecture).toBe('FULLSTACK');
    expect(result.frontend).toEqual(expect.objectContaining({ framework: 'React', provider: 'vercel', rootDirectory: 'frontend' }));
    expect(result.backend).toEqual(expect.objectContaining({ framework: 'Express', provider: 'render', rootDirectory: 'backend', startCommand: 'npm start' }));
    expect(result.warnings).toEqual([]);
  });

  it('detects FRONTEND_ONLY for a single Next.js root at the repo root', async () => {
    githubService.getRepoTree.mockResolvedValue([blob('package.json'), blob('next.config.js'), blob('pages/index.js')]);
    githubService.getFileContent.mockImplementation(async (token, owner, repo, path) => {
      if (path === 'package.json') return JSON.stringify({ dependencies: { next: '14.0.0' } });
      return null;
    });

    const result = await analyzeRepository(baseArgs);

    expect(result.architecture).toBe('FRONTEND_ONLY');
    expect(result.frontend.framework).toBe('Next.js');
    expect(result.frontend.rootDirectory).toBeNull(); // repo root, not a subfolder
    expect(result.backend).toBeNull();
  });

  it('detects BACKEND_ONLY for a single NestJS root, checked before the plain-Express rule', async () => {
    githubService.getRepoTree.mockResolvedValue([blob('package.json'), blob('src/main.ts')]);
    githubService.getFileContent.mockResolvedValue(JSON.stringify({ dependencies: { '@nestjs/core': '10.0.0', express: '4.0.0' } }));

    const result = await analyzeRepository(baseArgs);

    expect(result.architecture).toBe('BACKEND_ONLY');
    expect(result.backend.framework).toBe('NestJS');
  });

  it('falls back to the static-site rule when nothing has a package.json but an index.html exists', async () => {
    githubService.getRepoTree.mockResolvedValue([blob('index.html'), blob('style.css'), blob('script.js')]);

    const result = await analyzeRepository(baseArgs);

    expect(result.architecture).toBe('FRONTEND_ONLY');
    expect(result.frontend.framework).toBe('Static HTML');
    expect(result.frontend.buildCommand).toBeNull();
  });

  it('reports UNKNOWN when there is neither a matching package.json nor a root-level index.html', async () => {
    githubService.getRepoTree.mockResolvedValue([blob('README.md')]);

    const result = await analyzeRepository(baseArgs);

    expect(result.architecture).toBe('UNKNOWN');
    expect(result.frontend).toBeNull();
    expect(result.backend).toBeNull();
  });

  it('warns instead of guessing when two frontend candidates are found', async () => {
    githubService.getRepoTree.mockResolvedValue([blob('app-a/package.json'), blob('app-b/package.json')]);
    githubService.getFileContent.mockResolvedValue(JSON.stringify({ dependencies: { react: '18.0.0', vite: '5.0.0' } }));

    const result = await analyzeRepository(baseArgs);

    expect(result.architecture).toBe('UNKNOWN');
    expect(result.warnings[0]).toMatch(/multiple candidate/i);
  });

  // Removed: the "combined package.json" warning branch requires one
  // frontend match and one backend match sharing the same `root`, but each
  // root can only ever produce a single rule match (FRAMEWORK_RULES.find
  // returns the first hit, assigned to exactly one of the two arrays) — so
  // this branch appears unreachable through any real GitHub tree with the
  // current matching logic. Flagged in the report rather than faked here.

  it('skips (with a warning) a root whose package.json fails to parse, rather than crashing', async () => {
    githubService.getRepoTree.mockResolvedValue([blob('broken/package.json'), blob('index.html')]);
    githubService.getFileContent.mockImplementation(async (token, owner, repo, path) => (path === 'broken/package.json' ? '{not valid json' : null));

    const result = await analyzeRepository(baseArgs);

    expect(result.warnings.some((w) => w.includes('broken/package.json'))).toBe(true);
    // Falls through to the static-site check since no valid frontend/backend matched.
    expect(result.architecture).toBe('FRONTEND_ONLY');
    expect(result.frontend.framework).toBe('Static HTML');
  });

  it('ignores package.json files inside excluded directories like node_modules', async () => {
    githubService.getRepoTree.mockResolvedValue([blob('node_modules/some-lib/package.json'), blob('package.json')]);
    githubService.getFileContent.mockResolvedValue(JSON.stringify({ dependencies: { next: '14.0.0' } }));

    const result = await analyzeRepository(baseArgs);

    // Only the real root package.json should ever have been read.
    const readPaths = githubService.getFileContent.mock.calls.map((c) => c[3]);
    expect(readPaths).not.toContain('node_modules/some-lib/package.json');
    expect(result.architecture).toBe('FRONTEND_ONLY');
  });

  describe('env var detection', () => {
    it('parses .env.example keys for the frontend root and classifies them', async () => {
      githubService.getRepoTree.mockResolvedValue([blob('package.json'), blob('.env.example')]);
      githubService.getFileContent.mockImplementation(async (token, owner, repo, path) => {
        if (path === 'package.json') return JSON.stringify({ dependencies: { next: '14.0.0' } });
        if (path === '.env.example') return 'NEXT_PUBLIC_API_URL=\nSOME_SECRET=\n';
        return null;
      });

      const result = await analyzeRepository(baseArgs);

      const keys = result.envPlan.map((v) => v.key);
      expect(keys).toEqual(expect.arrayContaining(['NEXT_PUBLIC_API_URL', 'SOME_SECRET']));
      expect(result.envPlan.every((v) => v.target === 'frontend')).toBe(true);
    });

    it('always offers NODE_ENV for a detected backend, even when nothing in source references it', async () => {
      githubService.getRepoTree.mockResolvedValue([blob('package.json')]);
      githubService.getFileContent.mockResolvedValue(JSON.stringify({ dependencies: { express: '4.0.0' } }));

      const result = await analyzeRepository(baseArgs);

      expect(result.envPlan).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: 'NODE_ENV', target: 'backend', source: 'auto' }),
      ]));
    });

    it('scans source file contents for process.env references when no .env.example is present', async () => {
      githubService.getRepoTree.mockResolvedValue([blob('package.json'), blob('config.js')]);
      githubService.getFileContent.mockImplementation(async (token, owner, repo, path) => {
        if (path === 'package.json') return JSON.stringify({ dependencies: { express: '4.0.0' } });
        if (path === 'config.js') return 'const key = process.env.STRIPE_SECRET_KEY;';
        return null;
      });

      const result = await analyzeRepository(baseArgs);

      expect(result.envPlan.map((v) => v.key)).toEqual(expect.arrayContaining(['STRIPE_SECRET_KEY']));
    });

    it('scopes each root\'s env scan to its own files — the backend root never attributes a frontend-only var to itself', async () => {
      githubService.getRepoTree.mockResolvedValue([
        blob('package.json'), // root backend (express)
        blob('server.js'),
        blob('frontend/package.json'),
        blob('frontend/vite.config.js'),
        blob('frontend/src/secrets.js'),
      ]);
      githubService.getFileContent.mockImplementation(async (token, owner, repo, path) => {
        if (path === 'package.json') return JSON.stringify({ dependencies: { express: '4.0.0' } });
        if (path === 'frontend/package.json') return JSON.stringify({ dependencies: { react: '18.0.0', vite: '5.0.0' } });
        if (path === 'frontend/src/secrets.js') return 'process.env.FRONTEND_ONLY_VAR';
        return null;
      });

      const result = await analyzeRepository(baseArgs);

      expect(result.architecture).toBe('FULLSTACK');
      // FRONTEND_ONLY_VAR should appear for the frontend target only — never
      // duplicated onto the backend target, which would indicate the
      // backend's root scan leaked into the frontend/ subtree.
      const frontendOnlyVarEntries = result.envPlan.filter((v) => v.key === 'FRONTEND_ONLY_VAR');
      expect(frontendOnlyVarEntries).toEqual([expect.objectContaining({ target: 'frontend' })]);
    });
  });

  it('falls back to the repository\'s own default branch when none is explicitly requested', async () => {
    githubService.getRepoTree.mockResolvedValue([blob('README.md')]);

    const result = await analyzeRepository({ ...baseArgs, branch: undefined });

    expect(result.repository.branch).toBe('main');
    expect(githubService.getRepoTree).toHaveBeenCalledWith('tok', 'me', 'app', 'main');
  });
});
