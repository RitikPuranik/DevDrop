jest.mock('../../../../src/services/github.service');

const githubService = require('../../../../src/services/github.service');
const {
  resolveVercelFrontendConfig,
  frameworkFromBuildTool,
  inferFrameworkFromSignals,
} = require('../../../../src/services/deployment/vercelConfigResolver');

const blob = (path) => ({ type: 'blob', path, size: 100 });

beforeEach(() => jest.clearAllMocks());

describe('vercelConfigResolver', () => {
  it('recovers the uploaded coffee-style React/Vite app from an arbitrary root', async () => {
    githubService.getRepoTree.mockResolvedValue([
      blob('app/package.json'),
      blob('app/index.html'),
      blob('app/vite.config.ts'),
      blob('app/src/main.tsx'),
    ]);
    githubService.getFileContent.mockImplementation(async (token, owner, repo, path) => {
      if (path === 'app/package.json') {
        return JSON.stringify({
          scripts: { build: 'tsc -b && vite build' },
          dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
          devDependencies: { vite: '^7.2.4', '@vitejs/plugin-react': '^5.1.1', typescript: '^5.9.3' },
        });
      }
      if (path === 'app/vite.config.ts') return 'export default { base: "./", plugins: [react()] };';
      if (path === 'app/index.html') return '<html><script type="module" src="/src/main.tsx"></script></html>';
      return null;
    });

    const result = await resolveVercelFrontendConfig({
      accessToken: 'token', owner: 'me', repo: 'coffee', branch: 'main',
      analysisFrontend: { rootDirectory: 'app', provider: 'vercel' }, fallbackRoot: 'app',
    });

    expect(result).toEqual(expect.objectContaining({
      rootDirectory: 'app', framework: 'React', provider: 'vercel', buildTool: 'Vite',
      buildCommand: 'npm run build', outputDirectory: 'dist', installCommand: 'npm install',
    }));
  });

  it('does not collapse a package-backed Vite app into Static HTML when the tree is missing vite.config', async () => {
    githubService.getRepoTree.mockResolvedValue([
      blob('site/package.json'), blob('site/index.html'), blob('site/src/main.tsx'),
    ]);
    githubService.getFileContent.mockImplementation(async (token, owner, repo, path) => {
      if (path === 'site/package.json') {
        return JSON.stringify({
          scripts: { build: 'vite build' },
          dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
          devDependencies: { vite: '^7.0.0' },
        });
      }
      if (path === 'site/index.html') return '<script type="module" src="/src/main.tsx"></script>';
      return null;
    });

    const result = await resolveVercelFrontendConfig({
      accessToken: 'token', owner: 'me', repo: 'site', branch: 'main',
      analysisFrontend: { rootDirectory: 'site', provider: 'vercel' }, fallbackRoot: 'site',
    });

    expect(result.framework).toBe('React');
    expect(result.buildTool).toBe('Vite');
    expect(result.outputDirectory).toBe('dist');
  });

  it('does not fall back to Static HTML when package.json is present in the tree but unreadable', async () => {
    githubService.getRepoTree.mockResolvedValue([blob('broken/package.json'), blob('broken/index.html')]);
    githubService.getFileContent.mockImplementation(async (token, owner, repo, path) => {
      if (path === 'broken/package.json') return null;
      if (path === 'broken/index.html') return '<html></html>';
      return null;
    });

    const result = await resolveVercelFrontendConfig({
      accessToken: 'token', owner: 'me', repo: 'broken', branch: 'main',
      analysisFrontend: { rootDirectory: 'broken', provider: 'vercel' }, fallbackRoot: 'broken',
    });

    expect(result.framework).not.toBe('Static HTML');
  });

  it('never returns Static HTML for a package-backed root even when framework inference is incomplete', async () => {
    githubService.getRepoTree.mockResolvedValue([blob('custom/package.json'), blob('custom/index.html')]);
    githubService.getFileContent.mockImplementation(async (token, owner, repo, path) => {
      if (path === 'custom/package.json') return JSON.stringify({ name: 'unknown-package' });
      if (path === 'custom/index.html') return '<html></html>';
      return null;
    });

    const result = await resolveVercelFrontendConfig({
      accessToken: 'token', owner: 'me', repo: 'custom', branch: 'main',
      analysisFrontend: { rootDirectory: 'custom', provider: 'vercel' }, fallbackRoot: 'custom',
    });

    expect(result.framework).not.toBe('Static HTML');
  });


  it('does not trust stale Static HTML metadata when the selected root is actually React/Vite', async () => {
    githubService.getRepoTree.mockResolvedValue([
      blob('app/package.json'), blob('app/index.html'), blob('app/vite.config.ts'), blob('app/src/main.tsx'),
    ]);
    githubService.getFileContent.mockImplementation(async (token, owner, repo, path) => {
      if (path === 'app/package.json') {
        return JSON.stringify({
          scripts: { build: 'tsc -b && vite build' },
          dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
          devDependencies: { vite: '^7.2.4', '@vitejs/plugin-react': '^5.1.1' },
        });
      }
      if (path === 'app/vite.config.ts') return 'import react from "@vitejs/plugin-react"; import { defineConfig } from "vite"; export default defineConfig({ plugins: [react()] });';
      return null;
    });

    const result = await resolveVercelFrontendConfig({
      accessToken: 'token', owner: 'me', repo: 'coffee', branch: 'main',
      analysisFrontend: { rootDirectory: 'app', provider: 'vercel', framework: 'Static HTML', outputDirectory: '.' },
      fallbackRoot: 'app',
    });

    expect(result).toEqual(expect.objectContaining({
      rootDirectory: 'app', framework: 'React', buildTool: 'Vite',
      buildCommand: 'npm run build', outputDirectory: 'dist', installCommand: 'npm install',
    }));
  });

  it('recovers Vite from persisted buildTool without a GitHub scan', async () => {
    const result = await resolveVercelFrontendConfig({
      accessToken: 'token', owner: 'me', repo: 'coffee', branch: 'main',
      analysisFrontend: {
        rootDirectory: 'random-site', provider: 'vercel', buildTool: 'Vite',
        buildCommand: 'npm run build', outputDirectory: 'dist', installCommand: 'npm install',
      }, fallbackRoot: 'random-site',
    });
    expect(result.framework).toBe('Vite');
    expect(githubService.getRepoTree).not.toHaveBeenCalled();
  });

  it('maps common build tools to framework names', () => {
    expect(frameworkFromBuildTool('Vite')).toBe('Vite');
    expect(frameworkFromBuildTool('Next.js')).toBe('Next.js');
    expect(frameworkFromBuildTool('unknown')).toBeNull();
  });

  it('infers React + Vite from package/config/source evidence', () => {
    expect(inferFrameworkFromSignals({
      deps: { react: '^19', vite: '^7', '@vitejs/plugin-react': '^5' },
      scripts: { build: 'tsc -b && vite build' },
      filesAtRoot: ['index.html', 'vite.config.ts', 'src/main.tsx'],
      viteConfigContent: 'export default { base: "./" }',
      pkg: { name: 'coffee' },
    })).toEqual(expect.objectContaining({ framework: 'React', buildTool: 'Vite', outputDirectory: 'dist' }));
  });

  it('keeps a genuinely static site as Static HTML', async () => {
    githubService.getRepoTree.mockResolvedValue([blob('landing/index.html'), blob('landing/styles.css')]);
    githubService.getFileContent.mockImplementation(async (token, owner, repo, path) => {
      if (path === 'landing/index.html') return '<html></html>';
      return null;
    });

    const result = await resolveVercelFrontendConfig({
      accessToken: 'token', owner: 'me', repo: 'landing', branch: 'main',
      analysisFrontend: { rootDirectory: 'landing', provider: 'vercel' }, fallbackRoot: 'landing',
    });

    expect(result).toEqual(expect.objectContaining({
      rootDirectory: 'landing', framework: 'Static HTML', provider: 'vercel', outputDirectory: '.',
    }));
  });
});
