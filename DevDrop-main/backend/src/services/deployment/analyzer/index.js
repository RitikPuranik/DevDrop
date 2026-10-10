const githubService = require('../../github.service');
const { EXCLUDED_EXPORT_DIR_NAMES } = require('../../../shared/utils/constants');
const { FRAMEWORK_RULES, STATIC_SITE_RULE } = require('./frameworkRules');
const { scanForEnvVarNames, parseEnvExampleKeys, classifyEnvVar } = require('./envScan');
const { selectRoots } = require('./aiSelector');
const { rankAndSelect, sortCandidates } = require('./candidateSelection');

// Repositories often contain arbitrary app names (not just app/frontend/client)
// and monorepos can nest applications several levels deep. We deliberately do
// not use folder names as the deployment decision; package/framework evidence
// and the AI-assisted selector decide the root.
const MAX_PACKAGE_JSON_DEPTH = 6;
const MAX_CANDIDATES_PER_KIND = 24;
const MAX_ENV_SCAN_FILES_PER_ROOT = 15;
const MAX_ENV_SCAN_BYTES_PER_ROOT = 200 * 1000;
const SOURCE_FILE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py']);
const PRIORITY_NAME_HINTS = ['config', 'server', 'index', 'main', 'app', 'db', 'database', 'auth', 'client', 'api'];

const pathDepth = (p) => p.split('/').length;
const dirname = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '.');
const basename = (p) => (p.includes('/') ? p.slice(p.lastIndexOf('/') + 1) : p);

const isExcludedPath = (filePath) => filePath.split('/').some((segment) => EXCLUDED_EXPORT_DIR_NAMES.includes(segment));

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

const hasAny = (files, regexes) => regexes.some((regex) => files.some((file) => regex.test(file)));

const buildSignals = ({ rule, scripts, filesAtRoot, pkg }) => {
  const hasMainEntry = hasAny(filesAtRoot, [/^src\/main\.(jsx?|tsx?)$/, /^main\.(jsx?|tsx?)$/, /^src\/index\.(jsx?|tsx?)$/]);
  const hasServerEntry = hasAny(filesAtRoot, [
    /^(?:src\/)?server\.(jsx?|tsx?)$/,
    /^(?:src\/)?index\.(jsx?|tsx?)$/,
    /^(?:src\/)?main\.(jsx?|tsx?)$/,
    /^server\.(mjs|cjs)$/,
  ]);
  const hasTypeScriptEntry = hasAny(filesAtRoot, [/\.(ts|tsx)$/]);

  return {
    frameworkEvidence: true,
    hasBuildScript: Boolean(scripts.build),
    hasStartScript: Boolean(scripts.start || scripts['start:prod']),
    hasEntryPoint: hasMainEntry || hasAny(filesAtRoot, [/^index\.html$/]),
    hasServerEntryPoint: hasServerEntry || Boolean(pkg.main),
    hasFrameworkConfig: hasAny(filesAtRoot, [
      /^vite\.config\.(js|ts|mjs)$/,
      /^next\.config\.(js|mjs|ts)$/,
    ]),
    hasIndexHtml: filesAtRoot.includes('index.html'),
    hasAppOrPagesDir: filesAtRoot.some((file) => file === 'app' || file === 'pages'),
    hasSourceDir: filesAtRoot.includes('src'),
    hasTypeScriptEntry,
    ruleId: rule.id,
  };
};

const makeCandidate = ({ root, rule, resolved, signals }) => {
  const entry = {
    root,
    rootDirectory: root === '.' ? null : root,
    kind: rule.kind,
    framework: rule.framework,
    provider: rule.provider,
    ...resolved,
    signals,
  };
  return entry;
};

/** Env vars found by scanning a root's source files + .env.example. */
const detectEnvVarsForRoot = async ({ accessToken, owner, repo, branch, root, blobs, target, excludePrefixes = [] }) => {
  const rootPrefix = root === '.' ? '' : `${root}/`;
  const filesUnderRoot = blobs.filter((b) => {
    if (root !== '.' && !b.path.startsWith(rootPrefix)) return false;
    if (root === '.' && excludePrefixes.some((prefix) => b.path.startsWith(prefix))) return false;
    return true;
  });

  const names = new Set();

  const envExamplePath = filesUnderRoot.find((b) => /^(.*\/)?\.env\.(example|sample)$/.test(b.path) && dirname(b.path) === root)?.path;
  if (envExamplePath) {
    const content = await githubService.getFileContent(accessToken, owner, repo, envExamplePath, branch);
    parseEnvExampleKeys(content).forEach((n) => names.add(n));
  }

  const candidates = filesUnderRoot
    .filter((b) => SOURCE_FILE_EXTENSIONS.has(b.path.slice(b.path.lastIndexOf('.'))))
    .filter((b) => typeof b.size !== 'number' || b.size < 50 * 1000)
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

const compactCandidateForSelection = (candidate) => ({
  ...candidate,
  // AI gets evidence, but never needs the full package.json contents.
  signals: candidate.signals || {},
});

const selectionMetadata = (selection) => {
  if (!selection) return null;
  const candidate = selection.candidate;
  return {
    root: candidate.root,
    rootDirectory: candidate.root === '.' ? null : candidate.root,
    framework: candidate.framework,
    method: selection.method,
    confidence: selection.confidence,
    deterministicScore: candidate.deterministicScore,
    rationale: selection.rationale,
  };
};

/**
 * Analyzes a GitHub repository. Candidate discovery is deterministic; when
 * multiple runnable apps exist, AI ranks the exact candidates and a second
 * deterministic scorer validates that choice before it can affect deployment.
 */
const analyzeRepository = async ({ accessToken, owner, repo, branch }) => {
  const repoInfo = await githubService.getRepository(accessToken, owner, repo);
  const effectiveBranch = branch || repoInfo.defaultBranch || 'main';

  const tree = await githubService.getRepoTree(accessToken, owner, repo, effectiveBranch);
  const blobs = tree.filter((e) => e.type === 'blob' && !isExcludedPath(e.path));

  const packageJsonPaths = blobs
    .map((b) => b.path)
    .filter((p) => basename(p) === 'package.json' && pathDepth(p) <= MAX_PACKAGE_JSON_DEPTH)
    .slice(0, MAX_CANDIDATES_PER_KIND * 2);

  const roots = [...new Set(packageJsonPaths.map(dirname))];
  const warnings = [];
  const frontendMatches = [];
  const backendMatches = [];

  await mapWithConcurrency(roots, 6, async (root) => {
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
    if (!rule) return;

    let viteConfigContent = null;
    if (rule.id === 'react-vite' || rule.id === 'vue-vite') {
      const viteConfigPath = filesAtRoot.find((f) => /^vite\.config\.(js|ts|mjs)$/.test(f));
      if (viteConfigPath) {
        viteConfigContent = await githubService.getFileContent(accessToken, owner, repo, `${rootPrefix}${viteConfigPath}`, effectiveBranch);
      }
    }

    const resolved = rule.resolve({ scripts, pkg, filesAtRoot, viteConfigContent });
    const signals = buildSignals({ rule, scripts, filesAtRoot, pkg });
    const entry = makeCandidate({ root, rule, resolved, signals });

    if (rule.kind === 'frontend') frontendMatches.push(entry);
    else backendMatches.push(entry);
  });

  // Plain HTML/CSS/JS sites can live at arbitrary nested paths too. Only add
  // them when no framework candidate exists; otherwise they are usually just
  // documentation/static files belonging to a real application.
  if (frontendMatches.length === 0) {
    const staticRoots = [...new Set(
      blobs
        .filter((b) => basename(b.path) === 'index.html' && pathDepth(b.path) <= MAX_PACKAGE_JSON_DEPTH)
        .map((b) => dirname(b.path))
    )].slice(0, MAX_CANDIDATES_PER_KIND);

    staticRoots.forEach((root) => {
      frontendMatches.push({
        root,
        rootDirectory: root === '.' ? null : root,
        kind: 'frontend',
        framework: STATIC_SITE_RULE.framework,
        provider: STATIC_SITE_RULE.provider,
        ...STATIC_SITE_RULE.resolve(),
        signals: {
          frameworkEvidence: true,
          hasBuildScript: false,
          hasStartScript: false,
          hasEntryPoint: true,
          hasServerEntryPoint: false,
          hasFrameworkConfig: false,
          hasIndexHtml: true,
          hasAppOrPagesDir: false,
          hasSourceDir: false,
          hasTypeScriptEntry: false,
          ruleId: STATIC_SITE_RULE.id,
        },
      });
    });
  }

  const frontendCandidates = sortCandidates(frontendMatches).slice(0, MAX_CANDIDATES_PER_KIND);
  const backendCandidates = sortCandidates(backendMatches).slice(0, MAX_CANDIDATES_PER_KIND);

  const treePathsForAI = blobs
    .map((b) => b.path)
    .filter((p) => /(^|\/)(package\.json|vite\.config\.|next\.config\.|index\.html|src\/|app\/|pages\/|server\.|README)/i.test(p))
    .slice(0, 500);

  let aiPlan = { status: 'not_needed' };
  if (frontendCandidates.length > 1 || backendCandidates.length > 1) {
    aiPlan = await selectRoots({
      frontendCandidates: frontendCandidates.map(compactCandidateForSelection),
      backendCandidates: backendCandidates.map(compactCandidateForSelection),
      treePaths: treePathsForAI,
    });
    if (aiPlan.status === 'unavailable' && aiPlan.reason) {
      warnings.push(`AI deployment planner unavailable: ${aiPlan.reason}`);
    }
  }

  const selections = rankAndSelect({
    frontendCandidates,
    backendCandidates,
    aiPlan,
  });

  const frontendSelection = selections.frontend;
  const backendSelection = selections.backend;
  const frontend = frontendSelection?.candidate || null;
  const backend = backendSelection?.candidate || null;

  if (frontendCandidates.length > 1 && frontendSelection) {
    warnings.push(`Selected frontend root "${frontend.root}" using ${frontendSelection.method}.`);
  }
  if (backendCandidates.length > 1 && backendSelection) {
    warnings.push(`Selected backend root "${backend.root}" using ${backendSelection.method}.`);
  }

  let architecture = 'UNKNOWN';
  if (frontend && !backend) architecture = 'FRONTEND_ONLY';
  else if (!frontend && backend) architecture = 'BACKEND_ONLY';
  else if (frontend && backend && frontend.root !== backend.root) architecture = 'FULLSTACK';

  if (frontend && backend && frontend.root === backend.root) {
    warnings.push('The frontend and backend resolve to the same root; automatic split deployment is not supported.');
    architecture = 'UNKNOWN';
  }

  if (!frontend && frontendCandidates.length) warnings.push('No frontend candidate passed deterministic validation.');
  if (!backend && backendCandidates.length) warnings.push('No backend candidate passed deterministic validation.');

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
    if (!envPlan.some((v) => v.key === 'NODE_ENV' && v.target === 'backend')) {
      envPlan.push({ key: 'NODE_ENV', target: 'backend', required: false, configured: false, source: 'auto', autoRole: 'static' });
    }
  }

  return {
    architecture,
    frontend: frontend ? stripInternalFields(frontend) : null,
    backend: backend ? stripInternalFields(backend) : null,
    selection: {
      frontend: selectionMetadata(frontendSelection),
      backend: selectionMetadata(backendSelection),
      aiPlanner: aiPlan.status,
      candidateCounts: { frontend: frontendCandidates.length, backend: backendCandidates.length },
    },
    envPlan,
    warnings,
    repository: { owner, repo, branch: effectiveBranch },
  };
};

const stripInternalFields = ({ root, kind, signals, deterministicScore, ...rest }) => rest;

module.exports = { analyzeRepository };
