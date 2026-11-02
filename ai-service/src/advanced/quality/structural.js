'use strict';
/**
 * Structural + static-functional + architecture-health checks. Pure functions of the file map: no model, no browser.
 * Issue: { id, layer, severity: 'error'|'warning', blocking, message, files[], pageId? }
 */
const { parse } = require('@babel/parser');
const { validateGeneratedFiles } = require('../../validators/generatedFiles.validator');
const { reviewGeneratedSite } = require('../../validators/quality.review');
const { extractRoutes, matches, internalLinks, shape } = require('../routes');
const { resolveDependencies } = require('../dependencies');
const { settings } = require('../config');

const codeOf = (files, p) => (typeof files[p] === 'string' ? files[p] : files[p]?.code || '');
const isCode = (p) => /\.(jsx?|mjs)$/i.test(p);
let seq = 0;
const issue = (layer, severity, id, message, files = [], extra = {}) => ({ key: `${id}:${files.join(',')}:${extra.pageId || ''}:${++seq}`.slice(0, 200), id, layer, severity, blocking: severity === 'error' && extra.blocking !== false, message, files, ...extra });

function resolveImport(from, spec, files) {
  if (!spec.startsWith('.')) return null;
  const parts = from.split('/').filter(Boolean); parts.pop();
  for (const s of spec.split('/')) { if (!s || s === '.') continue; if (s === '..') parts.pop(); else parts.push(s); }
  const base = `/${parts.join('/')}`;
  return [base, `${base}.js`, `${base}.jsx`, `${base}.mjs`, `${base}/index.js`, `${base}/index.jsx`].find((p) => p in files) || null;
}

function importGraph(files) {
  const graph = new Map();
  for (const p of Object.keys(files)) {
    const deps = new Set();
    if (isCode(p)) {
      for (const m of codeOf(files, p).matchAll(/(?:import|export)[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        const t = resolveImport(p, m[1] || m[2] || m[3] || '', files); if (t) deps.add(t);
      }
    }
    graph.set(p, deps);
  }
  return graph;
}
const reachable = (graph, from) => { const seen = new Set([from]); const q = [from]; while (q.length) for (const d of graph.get(q.pop()) || []) if (!seen.has(d)) { seen.add(d); q.push(d); } return seen; };

/** Tag sequence of a page source: a cheap visual-structure fingerprint. */
function fingerprint(code) {
  try {
    const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });
    const tags = [];
    const walk = (n) => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) return n.forEach(walk); if (n.type === 'JSXOpeningElement') tags.push(n.name?.name || n.name?.property?.name || '?'); for (const k of Object.keys(n)) if (k !== 'loc' && k !== 'tokens') walk(n[k]); };
    walk(ast.program); return tags;
  } catch { return []; }
}
const bigrams = (t) => new Set(t.slice(1).map((x, i) => `${t[i]}>${x}`));
const jaccard = (a, b) => { if (!a.size || !b.size) return 0; let i = 0; for (const x of a) if (b.has(x)) i += 1; return i / (a.size + b.size - i); };

function runStructuralChecks({ files, manifest, architecture, dependencies = {}, pageFileIds = {} }) {
  const issues = [];
  const cfg = settings();
  const flat = Object.fromEntries(Object.entries(files).map(([p, f]) => [p, { code: codeOf(files, p) }]));

  // 1. imports resolve, entry exists, syntax / TypeScript (existing validator)
  for (const msg of validateGeneratedFiles(flat)) {
    const file = (/^(\/[^\s:]+)/.exec(msg) || [])[1];
    issues.push(issue('structural', 'error', 'static-validation', msg, file ? [file] : []));
  }

  // 2. dependencies declared
  const deps = resolveDependencies(flat, dependencies);
  for (const u of deps.unresolved) issues.push(issue('structural', 'error', 'unresolved-dependency', `Package "${u.name}" is imported but not declared and is not a vetted dependency. Remove it or replace it with plain React/CSS.`, u.files));

  // 3. pages are connected to the app; routes registered; 404 exists
  const graph = importGraph(flat);
  const live = flat['/App.js'] ? reachable(graph, '/App.js') : new Set();
  const patterns = extractRoutes(flat);
  const routeFiles = Object.keys(flat).filter((p) => isCode(p) && /<Route\b|createBrowserRouter|path\s*:/.test(flat[p].code)).slice(0, 6);
  for (const page of manifest?.pages || []) {
    const pageFiles = Object.entries(pageFileIds).filter(([, id]) => id === page.id).map(([p]) => p).filter((p) => p in flat);
    if (!pageFiles.length) issues.push(issue('structural', 'error', 'page-missing', `Page "${page.title}" (${page.path}) has no page component file.`, ['/App.js'], { pageId: page.id }));
    else if (!pageFiles.some((p) => live.has(p))) issues.push(issue('structural', 'error', 'page-not-connected', `Page "${page.title}" (${pageFiles[0]}) is never imported by the application, so it cannot render.`, [...pageFiles, ...routeFiles.slice(0, 2)], { pageId: page.id }));
    if (!patterns.some((r) => shape(r) === shape(page.path))) issues.push(issue('structural', 'error', 'route-missing', `Route ${page.path} for page "${page.title}" is not registered in the router.`, routeFiles.length ? routeFiles : ['/App.js'], { pageId: page.id }));
  }
  if (!patterns.some((r) => r === '/*' || r === '*')) issues.push(issue('structural', 'error', 'no-404-route', 'No catch-all route (path="*") renders a 404 page.', routeFiles.length ? routeFiles : ['/App.js']));

  // 4. internal links point at registered routes
  const seenLinks = new Set();
  for (const l of internalLinks(flat)) {
    const k = `${l.path}|${l.target}`; if (seenLinks.has(k)) continue; seenLinks.add(k);
    if (patterns.length && !matches(patterns, l.target)) issues.push(issue('functional', 'error', 'broken-internal-link', `Link to "${l.target}" in ${l.path} does not match any registered route.`, [l.path, ...routeFiles.slice(0, 1)]));
  }

  // 5. local asset references exist
  for (const [p, f] of Object.entries(flat)) {
    if (!isCode(p)) continue;
    for (const m of f.code.matchAll(/\bsrc\s*=\s*["'](\/[^"'/][^"']*)["']/g)) {
      const ref = m[1].split('?')[0];
      if (!(ref in flat) && !(`/public${ref}` in flat) && ref !== '/favicon.svg') issues.push(issue('structural', 'error', 'asset-missing', `${p} references ${ref}, which is not part of the project. Use a supplied asset URL or an inline SVG.`, [p]));
    }
  }

  // 6. functional static review (dead buttons/links/forms) via the existing reviewer
  try {
    const review = reviewGeneratedSite({ files: flat });
    for (const f of review.findings || []) {
      if (f.category === 'functional') issues.push(issue('functional', 'error', f.rule, `${f.path}${f.line ? `:${f.line}` : ''} ${f.message}`, [f.path]));
      else if (f.severity === 'error') issues.push(issue('structural', 'error', f.rule, `${f.path}${f.line ? `:${f.line}` : ''} ${f.message}`, [f.path], { blocking: false }));
    }
  } catch { /* review is best effort */ }

  // 7. architecture health (quality signals, never blocking)
  for (const [p, f] of Object.entries(flat)) {
    if (!isCode(p)) continue;
    const lines = f.code.split('\n').length;
    if (lines > cfg.oversizedFileLines) issues.push(issue('structural', 'warning', 'oversized-file', `${p} has ${lines} lines. Split it into smaller components, hooks or modules.`, [p], { refactor: true }));
    const meaningful = f.code.split('\n').filter((l) => l.trim() && !/^\s*(\/\/|\/\*|\*)/.test(l)).length;
    if (meaningful <= 2 && !/export\s*(\*|\{)|^\s*export default [A-Za-z_]+;?\s*$/m.test(f.code) && p !== '/App.js') issues.push(issue('structural', 'warning', 'trivial-file', `${p} has almost no content; merge it into the file that uses it.`, [p], { blocking: false }));
  }
  const app = flat['/App.js']?.code || '';
  if (app.split('\n').length > cfg.appShellMaxLines && (app.match(/<(section|header|footer|main)\b/g) || []).length >= 3) issues.push(issue('structural', 'warning', 'app-contains-website', '/App.js contains page content. Keep it a thin shell (providers + routes) and move sections into page/section components.', ['/App.js'], { refactor: true }));

  // 8. page distinctness + design token usage (visual consistency, static)
  const fps = (manifest?.pages || []).map((pg) => {
    const file = Object.entries(pageFileIds).find(([p, id]) => id === pg.id && p in flat)?.[0];
    return file ? { page: pg, file, tags: fingerprint(flat[file].code) } : null;
  }).filter((x) => x && x.tags.length >= 12);
  for (let i = 0; i < fps.length; i += 1) for (let j = i + 1; j < fps.length; j += 1) {
    if (jaccard(bigrams(fps[i].tags), bigrams(fps[j].tags)) >= 0.92) issues.push(issue('visual', 'warning', 'identical-pages', `Pages "${fps[i].page.title}" and "${fps[j].page.title}" have the same structure. Give each page its own layout and sections.`, [fps[i].file, fps[j].file], { pageId: fps[j].page.id, blocking: false }));
  }
  const usesTokens = Object.entries(flat).some(([p, f]) => p !== '/styles/tokens.css' && /var\(--(color|font|space|radius)-/.test(f.code));
  if (Object.keys(flat).length > 3 && !usesTokens) issues.push(issue('visual', 'warning', 'tokens-unused', 'No component uses the shared design tokens (var(--color-*) etc.), so pages may look inconsistent.', ['/App.js'], { blocking: false }));

  return issues;
}

module.exports = { runStructuralChecks, importGraph, reachable, fingerprint, resolveImport };
