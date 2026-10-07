const githubService = require('./../github.service');
const { FRAMEWORK_RULES, STATIC_SITE_RULE } = require('./analyzer/frameworkRules');

const parseJson = (content) => {
  if (content && typeof content === 'object') return content;
  try { return JSON.parse(String(content || '')); } catch { return null; }
};

const frameworkFromBuildTool = (buildTool) => {
  const value = String(buildTool || '').trim().toLowerCase();
  if (value === 'vite') return 'Vite';
  if (value === 'next.js' || value === 'nextjs' || value.includes('next')) return 'Next.js';
  if (value === 'vue') return 'Vue';
  if (value === 'svelte') return 'Svelte';
  if (value === 'sveltekit') return 'SvelteKit';
  if (value === 'astro') return 'Astro';
  if (value === 'angular') return 'Angular';
  if (value === 'preact') return 'Preact';
  return null;
};

const hasOwn = (obj, key) => Boolean(obj && Object.prototype.hasOwnProperty.call(obj, key));
const hasAnyDep = (deps, names) => names.some((name) => hasOwn(deps, name));

const needsRecovery = (frontend) => {
  if (!frontend) return true;
  const tool = String(frontend.buildTool || '').trim().toLowerCase();
  const framework = String(frontend.framework || '').trim();
  const frameworkLower = framework.toLowerCase();
  // Static HTML is the analyzer's generic fallback. It is not a trusted
  // deployment decision for a repository that may actually be Vite/React,
  // Next, Svelte, Astro, etc. Always re-check repository evidence when this
  // placeholder is present.
  if (frameworkLower === 'static html') return true;
  if (!framework && !tool) return true;
  if (tool === 'vite' && (!frontend.buildCommand || !frontend.outputDirectory)) return true;
  if (!frontend.provider) return true;
  return false;
};

const normalizeRootPath = (root) => {
  const value = String(root || '.').trim().replace(/^\/+|\/+$/g, '');
  return value || '.';
};

const directChildNamesFromTree = (blobs, root) => {
  const prefix = root === '.' ? '' : `${root}/`;
  return new Set(
    blobs
      .map((entry) => entry.path)
      .filter((path) => root === '.' || path.startsWith(prefix))
      .map((path) => root === '.' ? path : path.slice(prefix.length))
      .filter((path) => path && !path.includes('/'))
  );
};

const getRootFile = async ({ accessToken, owner, repo, branch, root, candidates }) => {
  for (const name of candidates) {
    const path = root === '.' ? name : `${root}/${name}`;
    try {
      const content = await githubService.getFileContent(accessToken, owner, repo, path, branch);
      if (content != null && content !== '') return { name, path, content };
    } catch (error) {
      // A missing/unsupported candidate is expected during probing. Preserve
      // real transport/auth errors rather than swallowing them.
      if (error?.response?.status === 404) continue;
      throw error;
    }
  }
  return null;
};

const inferVite = ({ deps, scripts, filesAtRoot, viteConfigContent, sourceEntryContent, packageLockContent }) => {
  const hasVitePackage = hasOwn(deps, 'vite');
  const hasVitePluginReact = hasOwn(deps, '@vitejs/plugin-react') || hasOwn(deps, '@vitejs/plugin-react-swc');
  const hasViteConfig = filesAtRoot.some((file) => /^vite\.config\.(js|ts|mjs|cjs)$/.test(file)) || Boolean(viteConfigContent);
  const buildMentionsVite = /(?:^|[;&|\s])(?:npx\s+)?vite(?:\s|$)/i.test(String(scripts.build || ''));
  const sourceMentionsReact = /(?:from\s+['\"]react(?:-dom)?['\"]|from\s+['\"]react\/)/.test(String(sourceEntryContent || ''));
  const lockMentionsVite = /["']vite["']\s*:|node_modules\/vite/i.test(String(packageLockContent || ''));
  return hasVitePackage || hasViteConfig || hasVitePluginReact || buildMentionsVite || sourceMentionsReact && hasViteConfig || lockMentionsVite;
};

const inferFrameworkFromSignals = ({ deps, scripts, filesAtRoot, viteConfigContent, pkg, sourceEntryContent, packageLockContent }) => {
  if (hasAnyDep(deps, ['next']) || filesAtRoot.some((f) => /^next\.config\.(js|mjs|ts|cjs)$/.test(f))) {
    return { kind: 'frontend', framework: 'Next.js', buildTool: 'Next.js', provider: 'vercel', outputDirectory: null, buildCommand: scripts.build ? 'npm run build' : 'next build', installCommand: 'npm install' };
  }

  if (inferVite({ deps, scripts, filesAtRoot, viteConfigContent, sourceEntryContent, packageLockContent })) {
    const isReact = hasAnyDep(deps, ['react', 'react-dom'])
      || hasAnyDep(deps, ['@vitejs/plugin-react', '@vitejs/plugin-react-swc'])
      || filesAtRoot.some((f) => /\.(jsx|tsx)$/.test(f))
      || /from\s+['\"]react(?:-dom)?['\"]/.test(String(sourceEntryContent || ''));
    const isVue = hasOwn(deps, 'vue') || /from\s+['\"]vue['\"]/.test(String(sourceEntryContent || ''));
    const outDirMatch = viteConfigContent && String(viteConfigContent).match(/outDir\s*:\s*['\"]([^'\"]+)['\"]/);
    return {
      kind: 'frontend',
      framework: isVue ? 'Vue' : isReact ? 'React' : 'Vite',
      buildTool: 'Vite',
      provider: 'vercel',
      buildCommand: scripts.build ? 'npm run build' : 'vite build',
      outputDirectory: outDirMatch ? outDirMatch[1] : 'dist',
      installCommand: 'npm install',
    };
  }

  if (hasOwn(deps, 'svelte') || hasOwn(deps, '@sveltejs/kit') || filesAtRoot.some((f) => /^svelte\.config\.(js|ts|mjs|cjs)$/.test(f))) {
    const isKit = hasOwn(deps, '@sveltejs/kit');
    return {
      kind: 'frontend',
      framework: isKit ? 'SvelteKit' : 'Svelte',
      buildTool: isKit ? 'SvelteKit' : 'Vite',
      provider: 'vercel',
      buildCommand: scripts.build ? 'npm run build' : 'npm run build',
      outputDirectory: null,
      installCommand: 'npm install',
    };
  }

  if (hasOwn(deps, 'astro') || filesAtRoot.some((f) => /^astro\.config\.(js|ts|mjs|cjs)$/.test(f))) {
    return {
      kind: 'frontend',
      framework: 'Astro',
      buildTool: 'Astro',
      provider: 'vercel',
      buildCommand: scripts.build ? 'npm run build' : 'astro build',
      outputDirectory: 'dist',
      installCommand: 'npm install',
    };
  }

  const hasReactSource = filesAtRoot.some((f) => /\.(jsx|tsx)$/.test(f)) || filesAtRoot.some((f) => /^src\/(?:main|index|App)\.(jsx|tsx|js|ts)$/.test(f));
  if ((hasReactSource || filesAtRoot.includes('index.html')) && inferVite({ deps, scripts, filesAtRoot, viteConfigContent, sourceEntryContent, packageLockContent })) {
    return {
      kind: 'frontend', framework: 'React', buildTool: 'Vite', provider: 'vercel',
      buildCommand: scripts.build ? 'npm run build' : 'vite build',
      outputDirectory: 'dist', installCommand: 'npm install',
    };
  }

  if (hasOwn(deps, 'express') || hasOwn(deps, '@nestjs/core') || scripts.start || pkg?.main) return null;

  return null;
};

/**
 * Repairs incomplete frontend deployment metadata using repository evidence.
 * The caller has already selected the root (possibly through AI). This helper
 * never changes that root and never invents a folder name. It deliberately
 * prefers package/config/source evidence over the generic static-html fallback
 * so an incomplete React/Vite package cannot collapse into "Static HTML".
 */
const resolveVercelFrontendConfig = async ({
  accessToken,
  owner,
  repo,
  branch,
  analysisFrontend,
  fallbackRoot,
}) => {
  const existing = analysisFrontend ? { ...analysisFrontend } : {};
  const root = normalizeRootPath(existing.rootDirectory || fallbackRoot || '.');
  const existingFramework = String(existing.framework || '').trim();
  const inferredFramework = frameworkFromBuildTool(existing.buildTool) || (existingFramework && existingFramework.toLowerCase() !== 'static html' ? existingFramework : null);

  if (!needsRecovery(existing) && inferredFramework) {
    return { ...existing, framework: inferredFramework };
  }

  // Fetch tree once, but do not trust it as the only source of truth. GitHub
  // can return a truncated tree; direct root-file probes below make the
  // recovery reliable for arbitrary repositories and subdirectories.
  const tree = await githubService.getRepoTree(accessToken, owner, repo, branch);
  const blobs = tree.filter((entry) => entry.type === 'blob');
  const filesAtRootSet = directChildNamesFromTree(blobs, root);

  const packagePath = root === '.' ? 'package.json' : `${root}/package.json`;
  const packagePresentInTree = blobs.some((entry) => entry.path === packagePath);
  const packageFile = await getRootFile({ accessToken, owner, repo, branch, root, candidates: ['package.json'] });
  const packageContent = packageFile?.content || null;
  const pkg = parseJson(packageContent);
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const scripts = pkg?.scripts || {};

  const knownRootCandidates = [
    'index.html',
    'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
    'vite.config.js', 'vite.config.ts', 'vite.config.mjs', 'vite.config.cjs',
    'next.config.js', 'next.config.ts', 'next.config.mjs', 'next.config.cjs',
    'svelte.config.js', 'svelte.config.ts', 'svelte.config.mjs', 'svelte.config.cjs',
    'astro.config.js', 'astro.config.ts', 'astro.config.mjs', 'astro.config.cjs',
    'src/main.js', 'src/main.jsx', 'src/main.ts', 'src/main.tsx',
    'src/index.js', 'src/index.jsx', 'src/index.ts', 'src/index.tsx',
    'src/App.jsx', 'src/App.tsx',
  ];

  const probeNames = new Set([...knownRootCandidates, ...filesAtRootSet]);
  const extraNames = Array.from(probeNames).filter((name) =>
    /^(?:vite|next|svelte|astro)\.config\.(?:js|ts|mjs|cjs)$/.test(name)
    || /^(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|index\.html)$/.test(name)
    || /^src\/(?:main|index|App)\.(?:js|jsx|ts|tsx)$/.test(name)
  );

  const probedEntries = await Promise.all(extraNames.map(async (name) => {
    const file = await getRootFile({ accessToken, owner, repo, branch, root, candidates: [name] });
    return file ? [name, file.content] : null;
  }));
  const probed = new Map(probedEntries.filter(Boolean));

  for (const name of probed.keys()) filesAtRootSet.add(name);

  const viteConfigName = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.cjs'].find((name) => probed.has(name));
  const viteConfigContent = viteConfigName ? probed.get(viteConfigName) : null;
  const sourceEntryName = ['src/main.tsx', 'src/main.jsx', 'src/main.ts', 'src/main.js', 'src/index.tsx', 'src/index.jsx', 'src/index.ts', 'src/index.js', 'src/App.tsx', 'src/App.jsx'].find((name) => probed.has(name));
  const sourceEntryContent = sourceEntryName ? probed.get(sourceEntryName) : null;
  const packageLockContent = probed.get('package-lock.json') || probed.get('pnpm-lock.yaml') || probed.get('yarn.lock') || null;
  const signals = inferFrameworkFromSignals({
    deps,
    scripts,
    filesAtRoot: Array.from(filesAtRootSet),
    viteConfigContent,
    sourceEntryContent,
    packageLockContent,
    pkg,
  });

  if (signals) {
    const resolved = {
      ...existing,
      rootDirectory: root === '.' ? null : root,
      framework: signals.framework,
      provider: signals.provider,
      buildTool: signals.buildTool,
      buildCommand: signals.buildCommand,
      outputDirectory: signals.outputDirectory,
      installCommand: signals.installCommand,
    };
    return resolved;
  }

  // Use the generic analyzer rules as a compatibility path for frameworks
  // already supported elsewhere in the application.
  const rule = FRAMEWORK_RULES.find((candidateRule) => candidateRule.kind === 'frontend' && candidateRule.match({
    deps,
    filesAtRoot: Array.from(filesAtRootSet),
  }));
  if (rule) {
    return {
      ...existing,
      rootDirectory: root === '.' ? null : root,
      framework: rule.framework,
      provider: rule.provider,
      ...rule.resolve({ scripts, pkg, filesAtRoot: Array.from(filesAtRootSet), viteConfigContent }),
    };
  }

  const hasIndex = filesAtRootSet.has('index.html');
  const hasPackageLikeMarker = Boolean(packageFile) || packagePresentInTree || probed.has('package-lock.json') || probed.has('pnpm-lock.yaml') || probed.has('yarn.lock');
  const hasSourceOrBuildMarker = Boolean(viteConfigContent) || Boolean(sourceEntryContent)
    || Array.from(filesAtRootSet).some((name) => /^(?:next|svelte|astro)\.config\./.test(name));
  if (hasIndex && !hasPackageLikeMarker && !hasSourceOrBuildMarker) {
    return {
      ...existing,
      rootDirectory: root === '.' ? null : root,
      framework: STATIC_SITE_RULE.framework,
      provider: STATIC_SITE_RULE.provider,
      ...STATIC_SITE_RULE.resolve(),
    };
  }

  // A package.json exists (or was visible in the tree), but we could not
  // identify a supported framework. Do not relabel it as Static HTML just
  // because an index.html exists. This forces the caller to surface an
  // unresolved-framework error instead of deploying raw source files.
  return {
    ...existing,
    rootDirectory: root === '.' ? null : root,
    framework: inferredFramework || existing.framework || null,
  };
};

module.exports = { resolveVercelFrontendConfig, frameworkFromBuildTool, inferFrameworkFromSignals };
