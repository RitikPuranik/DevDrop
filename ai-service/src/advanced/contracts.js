'use strict';
/**
 * Validation + normalisation of what the planning agents return. The goal is never to throw away a usable plan because
 * of sloppy formatting, and never to impose a shape (page count, file count, folder layout) on the model.
 */
const { validateArchitecture } = require('../validators/contracts.validator');
const { normalizePath, pathProblem } = require('./projectStore');

const str = (v, fallback = '') => (typeof v === 'string' && v.trim() ? v.trim() : fallback);
const arr = (v) => (Array.isArray(v) ? v : []);
const strs = (v) => arr(v).map((x) => (typeof x === 'string' ? x.trim() : x?.name || x?.title || '')).filter(Boolean);
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const pascal = (s) => String(s || '').replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')).replace(/^./, (c) => c.toUpperCase()) || 'Page';

const COMPLEXITY = ['simple', 'moderate', 'complex'];

/** Normalises the planner's website specification. Missing optional parts get neutral defaults, never invented facts. */
function normalizeWebsiteSpec(value, { websiteType = 'custom' } = {}) {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const complexity = COMPLEXITY.includes(String(v.complexity).toLowerCase()) ? String(v.complexity).toLowerCase() : 'moderate';
  return {
    category: str(v.category, websiteType),
    purpose: str(v.purpose || v.goal, 'Present the business or project online.'),
    audience: str(v.audience || v.targetAudience, 'General visitors'),
    complexity,
    complexityRationale: str(v.complexityRationale),
    designDirection: v.designDirection && typeof v.designDirection === 'object' ? v.designDirection : { summary: str(v.designDirection) },
    contentRequirements: strs(v.contentRequirements),
    functionalRequirements: strs(v.functionalRequirements || v.features),
    responsiveRequirements: strs(v.responsiveRequirements),
    technicalRequirements: strs(v.technicalRequirements),
    assets: arr(v.assets),
    recommendedAdditionalPages: strs(v.recommendedAdditionalPages),
    navigation: v.navigation && typeof v.navigation === 'object' ? v.navigation : {},
    notes: strs(v.notes),
  };
}

const PARAM_RE = /^:[A-Za-z][A-Za-z0-9_]*$/;

function normalizeRoutePath(input) {
  if (typeof input !== 'string') return null;
  let p = input.trim();
  if (!p) return null;
  if (!p.startsWith('/')) p = `/${p}`;
  p = p.replace(/\/{2,}/g, '/').replace(/[?#].*$/, '');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  const segs = p.split('/').slice(1);
  const fixed = segs.map((seg) => (seg.startsWith(':') ? (PARAM_RE.test(seg) ? seg : `:${slug(seg.slice(1)) || 'id'}`) : slug(seg) || 'page'));
  return `/${fixed.join('/')}`.replace(/\/$/, '') || '/';
}

/**
 * Page Manifest: the authoritative list of pages. Guarantees a unique id and route for every page and a single root page.
 * It does NOT cap or pad the number of pages: the planner decides, constrained only by the user's request.
 */
function normalizePageManifest(value, { websiteType = 'custom' } = {}) {
  const raw = Array.isArray(value) ? value : arr(value?.pages);
  const pages = [];
  const seenPaths = new Set();
  const seenIds = new Set();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const title = str(item.title || item.name || item.label, '');
    let path = normalizeRoutePath(item.path || item.route || item.url || (title ? slug(title) : ''));
    if (!path) continue;
    if (!title && path === '/') item.title = 'Home';
    if (seenPaths.has(path)) continue;
    seenPaths.add(path);
    let id = slug(item.id || title || path) || `page-${pages.length + 1}`;
    while (seenIds.has(id)) id = `${id}-${pages.length + 1}`;
    seenIds.add(id);
    const params = (path.match(/:[A-Za-z][A-Za-z0-9_]*/g) || []).map((p) => p.slice(1));
    pages.push({
      id,
      title: str(item.title || item.name || item.label, path === '/' ? 'Home' : id.replace(/-/g, ' ')),
      path,
      purpose: str(item.purpose || item.description, 'Dedicated page.'),
      required: item.required === false || item.optional === true ? false : true,
      recommended: Boolean(item.recommended || item.addedByPlanner),
      dynamic: params.length > 0,
      params,
      parent: item.parent ? slug(item.parent) : null,
      layout: str(item.layout, ''),
      sections: strs(item.sections),
      content: strs(item.content || item.contentNotes),
      interactions: strs(item.interactions || item.functionality),
      nav: {
        header: item.nav?.header ?? item.showInNav ?? !(params.length > 0),
        footer: item.nav?.footer ?? false,
        label: str(item.nav?.label || item.navLabel || item.title || item.name, ''),
      },
    });
  }
  if (!pages.length) pages.push({ id: 'home', title: 'Home', path: '/', purpose: 'Main page.', required: true, recommended: false, dynamic: false, params: [], parent: null, layout: '', sections: [], content: [], interactions: [], nav: { header: true, footer: false, label: 'Home' } });
  if (!pages.some((p) => p.path === '/')) {
    // Never leave the site without a root: promote the first static page.
    const first = pages.find((p) => !p.dynamic) || pages[0];
    first.path = '/'; first.dynamic = false; first.params = [];
  }
  return { pages, notFound: { path: '*', title: str(value?.notFound?.title, 'Page not found') }, websiteType };
}

const CATEGORY_RULES = [
  ['config', /^\/(package\.json|vite\.config\.js|index\.html)$/],
  ['design-system', /^\/(styles?|design|theme|tokens)\//i],
  ['page', /^\/(pages?|views?|screens?|routes)\//i],
  ['module', /^\/(hooks?|services?|utils?|lib|contexts?|context|store|stores|state|data|constants?|models?|api|features?|providers?|helpers?|config|validation)\//i],
  ['shared', /^\/(components?|ui|layouts?|common|shared|app)\//i],
];
const categoryOf = (p, hinted, pageId) => {
  const h = String(hinted || '').toLowerCase();
  if (['design-system', 'shared', 'page', 'module', 'entry', 'config'].includes(h)) return h;
  if (p === '/App.js') return 'entry';
  if (pageId) return 'page';
  const rel = p.replace(/^\/src(?=\/)/, ''); // an architect that nests everything under /src still gets sensible categories
  for (const [cat, re] of CATEGORY_RULES) if (re.test(rel)) return cat;
  if (/\.css$/i.test(p)) return 'design-system';
  return 'shared';
};

// Files the system writes itself. A contract for one of these is dropped (with a warning), never silently honoured.
const SYSTEM_OWNED = new Set(['/package.json', '/index.html', '/main.jsx', '/vite.config.js', '/styles/tokens.css', '/styles/base.css', '/.npmrc', '/vercel.json', '/favicon.svg']);

/**
 * Turns the architect's answer into validated file contracts.
 *  - reuses DevDrop's existing architecture validator (React + Vite + JS, /App.js entry)
 *  - drops system-owned files, invalid paths and TypeScript
 *  - guarantees every manifest page has a page file (the only file the system will add on its own)
 *  - never limits or pads the number of files
 */
function normalizeAdvancedArchitecture(value, manifest, { warn = () => {} } = {}) {
  // The shared validator rejects the WHOLE architecture on a single TypeScript path; here one bad entry is dropped instead.
  const filteredInput = value && typeof value === 'object' && Array.isArray(value.files)
    ? { ...value, files: value.files.filter((f) => {
      const raw = [f?.path, f?.filePath, f?.file, f?.name].find((x) => typeof x === 'string' && x.trim());
      if (raw && /\.tsx?$/i.test(raw.trim())) { warn(`architecture: ignored TypeScript file ${raw}`); return false; }
      return true;
    }) }
    : value;
  const base = validateArchitecture(filteredInput);
  const contracts = [];
  const seen = new Set();
  for (const file of base.files) {
    const path = normalizePath(file.path);
    const problem = pathProblem(file.path);
    if (!path || problem) { warn(`architecture: ignored ${file.path}: ${problem || 'invalid path'}`); continue; }
    if (SYSTEM_OWNED.has(path)) { warn(`architecture: ${path} is generated by the system; contract ignored`); continue; }
    if (seen.has(path)) continue;
    seen.add(path);
    const responsibility = str(file.responsibility, '');
    contracts.push({
      ...file,
      path,
      type: str(file.type, 'component'),
      category: categoryOf(path, file.category, file.pageId),
      responsibility: responsibility || `Part of the ${path.split('/').slice(1, -1).join('/') || 'application'} module.`,
      exports: strs(file.exports),
      imports: strs(file.imports).map((i) => normalizePath(i) || i),
      pageId: file.pageId ? slug(file.pageId) : undefined,
    });
  }
  // Every page in the manifest must be backed by a page component.
  for (const page of manifest.pages) {
    const has = contracts.some((c) => c.pageId === page.id);
    if (has) continue;
    const guess = contracts.find((c) => c.category === 'page' && new RegExp(pascal(page.id), 'i').test(c.path));
    if (guess) { guess.pageId = page.id; continue; }
    const path = normalizePath(`/pages/${pascal(page.id)}Page.jsx`);
    if (!seen.has(path)) {
      seen.add(path);
      contracts.push({ path, type: 'page', category: 'page', pageId: page.id, responsibility: `Page component for "${page.title}" (${page.path}): ${page.purpose}`, exports: ['default'], imports: ['/App.js'].filter(() => false), systemAdded: true });
    }
  }
  if (!seen.has('/App.js')) contracts.push({ path: '/App.js', type: 'entry', category: 'entry', responsibility: 'Application entry: providers and route table.', exports: ['default'], imports: [] });
  return { ...base, files: contracts, dependencies: base.dependencies && typeof base.dependencies === 'object' ? base.dependencies : {} };
}

/**
 * Additional files a code-generation worker asks for while it works ("this page needs a ProductGallery component and a
 * price formatter"). Accepted when the path is valid and not already planned; no count limit.
 */
function normalizeFileRequests(requests, { existing = () => false, claimedBy = () => null, requester } = {}) {
  const accepted = [];
  const rejected = [];
  const seen = new Set();
  for (const r of arr(requests)) {
    if (!r || typeof r !== 'object') continue;
    const problem = pathProblem(r.path);
    const path = normalizePath(r.path);
    if (problem) { rejected.push({ path: String(r.path), reason: problem }); continue; }
    if (SYSTEM_OWNED.has(path)) { rejected.push({ path, reason: 'managed by the system' }); continue; }
    if (seen.has(path)) continue;
    if (existing(path) && claimedBy(path) !== requester) { rejected.push({ path, reason: 'already exists' }); continue; }
    if (!str(r.responsibility || r.purpose)) { rejected.push({ path, reason: 'every file needs a stated purpose' }); continue; }
    seen.add(path);
    accepted.push({
      path,
      type: str(r.type, 'component'),
      category: categoryOf(path, r.category),
      responsibility: str(r.responsibility || r.purpose),
      exports: strs(r.exports),
      imports: strs(r.imports).map((i) => normalizePath(i) || i),
      code: typeof r.code === 'string' && r.code.trim() ? r.code : undefined,
      requestedBy: requester,
    });
  }
  return { accepted, rejected };
}

module.exports = { normalizeWebsiteSpec, normalizePageManifest, normalizeAdvancedArchitecture, normalizeFileRequests, normalizeRoutePath, categoryOf, SYSTEM_OWNED, slug, pascal };
