const githubService = require('../../github.service');
const { EXCLUDED_EXPORT_DIR_NAMES } = require('../../../shared/utils/constants');
const { FRAMEWORK_RULES, STATIC_SITE_RULE } = require('./frameworkRules');
const { scanForEnvVarNames, parseEnvExampleKeys, classifyEnvVar } = require('./envScan');

const MAX_PACKAGE_JSON_DEPTH = 3; // repo root, "frontend/", or "apps/web/"
const MAX_ENV_SCAN_FILES_PER_ROOT = 15;
const MAX_ENV_SCAN_BYTES_PER_ROOT = 200 * 1000;
const SOURCE_FILE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py']);
// Filenames most likely to reference env vars — scanned first so the budget
// above is spent on high-signal files rather than whatever sorts first.
const PRIORITY_NAME_HINTS = ['config', 'server', 'index', 'main', 'app', 'db', 'database', 'auth', 'client', 'api'];

const pathDepth = (p) => p.split('/').length;
const dirname = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '.');
const basename = (p) => (p.includes('/') ? p.slice(p.lastIndexOf('/') + 1) : p);

const isExcludedPath = (filePath) => filePath.split('/').some((segment) => EXCLUDED_EXPORT_DIR_NAMES.includes(segment));

/** Runs `worker` over `items` with at most `limit` in flight at once — a
 * plain repo analysis can trigger dozens of GitHub API calls, so this keeps
 * us from bursting into GitHub's secondary rate limit. */
const mapWithConcurrency = async (items, limit, worker) => {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
};

const safeJsonParse = (content) => {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
};

/** Env vars found by scanning a root's source files + .env.example, tagged
 * auto/user per envScan.classifyEnvVar. `excludePrefixes` keeps a repo-root
 * scan ("." ) from wandering into a sibling matched root's own subtree
 * (e.g. a root-level Express app sitting next to a "client/" Vite app). */
const detectEnvVarsForRoot = async ({ accessToken, owner, repo, branch, root, blobs, target, excludePrefixes = [] }) => {
  const rootPrefix = root === '.' ? '' : `${root}/`;
  const filesUnderRoot = blobs.filter((b) => {
    if (root !== '.' && !b.path.startsWith(rootPrefix)) return false;
    if (root === '.' && excludePrefixes.some((prefix) => b.path.startsWith(prefix))) return false;
    return true;
  });

  const names = new Set();

  // .env.example / .env.sample — the most reliable signal when present.
  const envExamplePath = filesUnderRoot.find((b) => /^(.*\/)?\.env\.(example|sample)$/.test(b.path) && dirname(b.path) === root)?.path;
  if (envExamplePath) {
    const content = await githubService.getFileContent(accessToken, owner, repo, envExamplePath, branch);
    parseEnvExampleKeys(content).forEach((n) => names.add(n));
  }

  // Bounded scan of source files under this root.
  const candidates = filesUnderRoot
    .filter((b) => SOURCE_FILE_EXTENSIONS.has(b.path.slice(b.path.lastIndexOf('.'))))
    .filter((b) => typeof b.size !== 'number' || b.size < 50 * 1000) // skip unusually large generated/bundled files
    .sort((a, b) => {
      const aScore = PRIORITY_NAME_HINTS.some((hint) => a.path.toLowerCase().includes(hint)) ? 0 : 1;
      const bScore = PRIORITY_NAME_HINTS.some((hint) => b.path.toLowerCase().includes(hint)) ? 0 : 1;
      return aScore - bScore;
    })
    .slice(0, MAX_ENV_SCAN_FILES_PER_ROOT);

  let bytesUsed = 0;
  const filesToScan = [];
  await mapWithConcurrency(candidates, 5, async (fileEntry) => {
    if (bytesUsed >= MAX_ENV_SCAN_BYTES_PER_ROOT) return;
    const content = await githubService.getFileContent(accessToken, owner, repo, fileEntry.path, branch);
    if (!content) return;
    bytesUsed += content.length;
    filesToScan.push({ path: fileEntry.path, content });
  });

  scanForEnvVarNames(filesToScan).forEach((n) => names.add(n));

  return Array.from(names).map((name) => ({
    key: name,
    target,
    required: true,
    configured: false,
    ...classifyEnvVar(name, target),
  }));
};

/**
 * Analyzes a published GitHub repository and returns a structured plan:
 * detected architecture, per-side framework/build config, and the list of
 * environment variables the deployment will need (auto-filled vs. buyer-
 * supplied). Never reads actual .env secret values — only .env.example
 * (key names only) and source code (which only reveals variable *names*).
 */
const analyzeRepository = async ({ accessToken, owner, repo, branch }) => {
  const repoInfo = await githubService.getRepository(accessToken, owner, repo);
  const effectiveBranch = branch || repoInfo.defaultBranch || 'main';

  const tree = await githubService.getRepoTree(accessToken, owner, repo, effectiveBranch);
  const blobs = tree.filter((e) => e.type === 'blob' && !isExcludedPath(e.path));

  const packageJsonPaths = blobs
    .map((b) => b.path)
    .filter((p) => basename(p) === 'package.json' && pathDepth(p) <= MAX_PACKAGE_JSON_DEPTH);

  const roots = packageJsonPaths.length > 0 ? packageJsonPaths.map(dirname) : [];

  const warnings = [];
  const frontendMatches = [];
  const backendMatches = [];

  await mapWithConcurrency(roots, 4, async (root) => {
    const pkgPath = root === '.' ? 'package.json' : `${root}/package.json`;
    const pkgContent = await githubService.getFileContent(accessToken, owner, repo, pkgPath, effectiveBranch);
    const pkg = safeJsonParse(pkgContent);
    if (!pkg) {
      warnings.push(`Couldn't parse package.json at "${pkgPath}" — skipped.`);
      return;
    }

    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const scripts = pkg.scripts || {};
    const rootPrefix = root === '.' ? '' : `${root}/`;
    const filesAtRoot = blobs
      .map((b) => b.path)
      .filter((p) => p.startsWith(rootPrefix) && !p.slice(rootPrefix.length).includes('/'))
      .map((p) => p.slice(rootPrefix.length));

    const rule = FRAMEWORK_RULES.find((r) => r.match({ deps, filesAtRoot }));
    if (!rule) return; // a package.json that matched nothing we support yet

    let viteConfigContent = null;
    if (rule.id === 'react-vite' || rule.id === 'vue-vite') {
      const viteConfigPath = filesAtRoot.find((f) => /^vite\.config\.(js|ts|mjs)$/.test(f));
      if (viteConfigPath) {
        viteConfigContent = await githubService.getFileContent(accessToken, owner, repo, `${rootPrefix}${viteConfigPath}`, effectiveBranch);
      }
    }

    const resolved = rule.resolve({ scripts, pkg, filesAtRoot, viteConfigContent });
    const entry = {
      root,
      rootDirectory: root === '.' ? null : root,
      framework: rule.framework,
      provider: rule.provider,
      ...resolved,
    };

    if (rule.kind === 'frontend') frontendMatches.push(entry);
    else backendMatches.push(entry);
  });

  // No package.json anywhere, or none matched a supported framework — check
  // for a plain static site (index.html with no build step) before giving up.
  if (frontendMatches.length === 0 && backendMatches.length === 0) {
    const staticRoot = blobs.find((b) => basename(b.path) === 'index.html' && pathDepth(b.path) <= 2);
    if (staticRoot) {
      const root = dirname(staticRoot.path);
      frontendMatches.push({
        root,
        rootDirectory: root === '.' ? null : root,
        framework: STATIC_SITE_RULE.framework,
        provider: STATIC_SITE_RULE.provider,
        ...STATIC_SITE_RULE.resolve(),
      });
    }
  }

  let architecture = 'UNKNOWN';
  if (frontendMatches.length === 1 && backendMatches.length === 0) architecture = 'FRONTEND_ONLY';
  else if (frontendMatches.length === 0 && backendMatches.length === 1) architecture = 'BACKEND_ONLY';
  else if (frontendMatches.length === 1 && backendMatches.length === 1 && frontendMatches[0].root !== backendMatches[0].root) {
    architecture = 'FULLSTACK';
  } else if (frontendMatches.length > 1 || backendMatches.length > 1) {
    warnings.push('Multiple candidate frontend or backend projects were found — automatic deployment needs exactly one of each.');
  } else if (frontendMatches.length === 1 && backendMatches.length === 1) {
    warnings.push('The frontend and backend appear to share a single package.json — automatic split-deployment isn\'t supported for combined projects yet.');
  }

  const frontend = architecture === 'FRONTEND_ONLY' || architecture === 'FULLSTACK' ? frontendMatches[0] : null;
  const backend = architecture === 'BACKEND_ONLY' || architecture === 'FULLSTACK' ? backendMatches[0] : null;

  const envPlan = [];
  if (frontend) {
    const excludePrefixes = backend && backend.root !== '.' ? [`${backend.root}/`] : [];
    const vars = await detectEnvVarsForRoot({
      accessToken, owner, repo, branch: effectiveBranch, root: frontend.root, blobs, target: 'frontend', excludePrefixes,
    });
    envPlan.push(...vars);
  }
  if (backend) {
    const excludePrefixes = frontend && frontend.root !== '.' ? [`${frontend.root}/`] : [];
    const vars = await detectEnvVarsForRoot({
      accessToken, owner, repo, branch: effectiveBranch, root: backend.root, blobs, target: 'backend', excludePrefixes,
    });
    envPlan.push(...vars);
    // NODE_ENV is virtually universal for Node backends even when nothing
    // greps for it directly (frameworks read it internally) — always offer it.
    if (!envPlan.some((v) => v.key === 'NODE_ENV' && v.target === 'backend')) {
      envPlan.push({ key: 'NODE_ENV', target: 'backend', required: false, configured: false, source: 'auto', autoRole: 'static' });
    }
  }

  return {
    architecture,
    frontend: frontend ? stripInternalFields(frontend) : null,
    backend: backend ? stripInternalFields(backend) : null,
    envPlan,
    warnings,
    repository: { owner, repo, branch: effectiveBranch },
  };
};

// Drop `root` from the public result — `rootDirectory` (null for repo root)
// already carries the same information in the shape callers expect.
// eslint-disable-next-line no-unused-vars
const stripInternalFields = ({ root, ...rest }) => rest;

module.exports = { analyzeRepository };
