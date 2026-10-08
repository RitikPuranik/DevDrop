// Production-parity helpers: the AI Studio preview (Sandpack) and a Vercel
// deployment are different runtimes. These pure functions close the gaps we can
// close deterministically and *find* the ones that need an agent's judgement.
//
// Known preview-vs-Vercel gaps this module covers:
//   1. Preview always loads the Tailwind CDN; a model-written /index.html often
//      doesn't -> the deployed site is unstyled.
//   2. Preview resolves some packages itself / with "latest"; Vercel installs the
//      versions in package.json at deploy time (floating ^ ranges can drift from
//      what was validated) -> dependencies are frozen to the validated versions.
//   3. Code that only works in a sandbox: process.env / import.meta.env values,
//      localhost URLs, asset paths that do not exist in the repo.

const TAILWIND_CDN = 'https://cdn.tailwindcss.com';
const TAILWIND_TAG = `<script src="${TAILWIND_CDN}"></script>`;

const isSource = (p) => /\.(js|jsx|mjs|cjs)$/i.test(p);
const codeOf = (files, p) => (typeof files?.[p]?.code === 'string' ? files[p].code : '');

const TAILWIND_TOKENS = /\b(?:flex|grid|items-(?:center|start|end)|justify-(?:center|between|end)|gap-\d+|px-\d+|py-\d+|p-\d+|m[xytb]?-\d+|text-(?:xs|sm|base|lg|xl|[2-9]xl)|font-(?:medium|semibold|bold)|rounded(?:-[a-z0-9]+)?|bg-[a-z]+-\d{2,3}|text-[a-z]+-\d{2,3}|w-full|min-h-screen|max-w-[a-z0-9]+)\b/g;

function usesTailwindClasses(files) {
  const seen = new Set();
  for (const [p, f] of Object.entries(files || {})) {
    if (!isSource(p) || typeof f?.code !== 'string') continue;
    for (const m of f.code.matchAll(/className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{\s*"([^"]*)"\s*\}|\{\s*'([^']*)'\s*\})/g)) {
      const value = m[1] || m[2] || m[3] || m[4] || m[5] || '';
      for (const t of value.match(TAILWIND_TOKENS) || []) seen.add(t);
      if (seen.size >= 4) return true;
    }
  }
  return false;
}

function hasTailwindBuild(files, dependencies = {}) {
  let pkgDeps = {};
  try { const pkg = JSON.parse(codeOf(files, '/package.json') || '{}'); pkgDeps = { ...pkg.dependencies, ...pkg.devDependencies }; } catch { /* static validator owns this */ }
  return Boolean(dependencies.tailwindcss || pkgDeps.tailwindcss || files?.['/tailwind.config.js'] || files?.['/tailwind.config.cjs']);
}

function injectTailwindCdn(html) {
  if (/cdn\.tailwindcss\.com/i.test(html)) return html;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `  ${TAILWIND_TAG}\n  </head>`);
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}\n  ${TAILWIND_TAG}`);
  return html;
}

/**
 * Deterministic, idempotent fixes. Returns a NEW files object plus a list of what changed.
 */
function applyProductionParity(files, dependencies = {}) {
  const out = { ...(files || {}) };
  const applied = [];
  const index = out['/index.html'];
  if (index && typeof index.code === 'string' && usesTailwindClasses(out) && !hasTailwindBuild(out, dependencies)) {
    const next = injectTailwindCdn(index.code);
    if (next !== index.code) {
      out['/index.html'] = { ...index, code: next };
      applied.push('Added the Tailwind CDN script to /index.html (the preview always loads it; a deployed site did not).');
    }
  }
  return { files: out, applied };
}

/** Freeze runtime dependencies to the exact versions the build validator just installed. */
function pinDependencies(files, resolved = {}) {
  const pkgFile = files?.['/package.json'];
  if (!pkgFile || typeof pkgFile.code !== 'string' || !resolved || !Object.keys(resolved).length) return { files, pinned: 0 };
  let pkg;
  try { pkg = JSON.parse(pkgFile.code); } catch { return { files, pinned: 0 }; }
  let pinned = 0;
  const deps = { ...(pkg.dependencies || {}) };
  for (const name of Object.keys(deps)) {
    const exact = resolved[name];
    if (typeof exact === 'string' && /^\d+\.\d+\.\d+/.test(exact) && deps[name] !== exact) { deps[name] = exact; pinned += 1; }
  }
  if (!pinned) return { files, pinned: 0 };
  pkg.dependencies = deps;
  return { files: { ...files, '/package.json': { ...pkgFile, code: JSON.stringify(pkg, null, 2) } }, pinned };
}

const SAFE_IMPORT_META = new Set(['MODE', 'DEV', 'PROD', 'BASE_URL', 'SSR']);
const lineOf = (code, index) => code.slice(0, index).split('\n').length;

function assetExists(files, ref) {
  const clean = ref.split('?')[0].split('#')[0].replace(/^\.\//, '').replace(/^\//, '');
  return [`/${clean}`, `/public/${clean}`].some((p) => Object.prototype.hasOwnProperty.call(files, p));
}

/**
 * Finds code that works in the sandbox but breaks (or silently misbehaves) on a
 * real deployment. `fixBy: 'agent'` findings go to the Deployment Readiness
 * agent; `fixBy: 'export'` findings are handled when the project is exported.
 */
function scanProductionRisks(files) {
  const findings = [];
  const add = (f) => { if (findings.length < 40) findings.push(f); };
  for (const [p, f] of Object.entries(files || {})) {
    if (typeof f?.code !== 'string') continue;
    const code = f.code;
    if (isSource(p)) {
      for (const m of code.matchAll(/\bprocess\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
        if (m[1] === 'NODE_ENV') continue;
        add({ id: 'process-env', fixBy: 'agent', path: p, line: lineOf(code, m.index), message: `process.env.${m[1]} does not exist in a Vite browser bundle ("process is not defined" at runtime). Replace it with a literal/default value.` });
      }
      for (const m of code.matchAll(/\bimport\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
        if (SAFE_IMPORT_META.has(m[1])) continue;
        add({ id: 'import-meta-env', fixBy: 'agent', path: p, line: lineOf(code, m.index), message: `import.meta.env.${m[1]} is not set on Vercel (no env vars are configured), so it is undefined in production. Provide a safe in-code default and never depend on it.` });
      }
      for (const m of code.matchAll(/["'`](https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)[^"'`\s]*)["'`]/g)) {
        add({ id: 'localhost-url', fixBy: 'agent', path: p, line: lineOf(code, m.index), message: `Hard-coded local URL ${m[1].slice(0, 80)} cannot be reached from a deployed site. Remove the call or use static data.` });
      }
    }
    if (isSource(p) || /\.css$/i.test(p) || p === '/index.html') {
      for (const m of code.matchAll(/(?:src|href|poster)\s*=\s*["']((?!https?:|data:|blob:|asset:|mailto:|tel:|#|\/\/)[^"']+\.(?:png|jpe?g|gif|webp|avif|svg|mp4|webm|pdf|ico))["']|url\(\s*["']?((?!https?:|data:|blob:|#)[^"')]+\.(?:png|jpe?g|gif|webp|avif|svg|mp4|webm))["']?\s*\)/gi)) {
        const ref = m[1] || m[2];
        if (!ref || /^\/favicon/i.test(ref)) continue;
        if (p.endsWith('.css') && ref.startsWith('.')) continue;
        if (!assetExists(files, ref)) add({ id: 'missing-asset', fixBy: 'agent', path: p, line: lineOf(code, m.index), message: `Asset path "${ref}" does not exist in the project, so Vercel will 404 it. Use a real asset URL from the media manifest, an inline SVG/CSS, or remove it.` });
      }
    }
    if (/\/storage\/v1\/object\/sign\//.test(code)) {
      add({ id: 'signed-asset-url', fixBy: 'export', path: p, line: 1, message: 'Contains expiring signed storage URLs; they are copied into the deployed project at export time.' });
    }
  }
  return findings;
}

module.exports = { applyProductionParity, pinDependencies, scanProductionRisks, usesTailwindClasses, hasTailwindBuild, injectTailwindCdn, TAILWIND_CDN };
