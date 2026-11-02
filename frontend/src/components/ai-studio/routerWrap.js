// Router handling for generated sites in the live preview.
//
// Generated components (Header, Footer...) call useLocation()/useNavigate()/<Link>. If any of them renders
// outside a <Router> the preview dies with "useLocation() may be used only in the context of a <Router>".
// Models (and the repair agents) keep "fixing" this by adding a <BrowserRouter> inside App.js, which often
// still leaves the Header outside it. So the preview owns the Router: the entry always renders one, and any
// Router component the site renders itself is turned into a pass-through, so there is exactly one Router and
// it encloses everything. Sites using a data router (createBrowserRouter/RouterProvider) are left untouched.

const ROUTER_IMPORT_RE = /from\s*['"]react-router(?:-dom)?['"]|require\(\s*['"]react-router(?:-dom)?['"]\s*\)/;
const DATA_ROUTER_RE = /\bRouterProvider\b|\bcreate(?:Browser|Hash|Memory)Router\s*\(/;
const ROUTER_COMPONENTS = new Set(['BrowserRouter', 'HashRouter', 'MemoryRouter', 'Router']);
const NAMED_IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*(['"])react-router(?:-dom)?\2\s*;?/g;

const isEntryPath = (p) => /^\/(?:main|index)\.(?:jsx?|tsx?)$/i.test(p);
const isCodePath = (p) => /\.(?:jsx?|tsx?|mjs)$/i.test(p);
const codeOf = (obj) => (typeof obj === 'string' ? obj : obj?.code);

export function analyzeRouterUse(files) {
  let usesRouter = false;
  let hasDataRouter = false;
  for (const [p, obj] of Object.entries(files || {})) {
    if (!isCodePath(p) || isEntryPath(p)) continue;
    const code = codeOf(obj);
    if (typeof code !== 'string') continue;
    if (ROUTER_IMPORT_RE.test(code)) usesRouter = true;
    if (DATA_ROUTER_RE.test(code)) hasDataRouter = true;
  }
  return { usesRouter, hasDataRouter };
}

export function siteNeedsRouterWrapper(files) {
  const { usesRouter, hasDataRouter } = analyzeRouterUse(files);
  return usesRouter && !hasDataRouter;
}

// Replaces Router components imported from react-router(-dom) with a pass-through component in this file.
export function neutralizeRouterComponents(code) {
  if (typeof code !== 'string') return code;
  const passthroughs = [];
  const out = code.replace(NAMED_IMPORT_RE, (full, specList, quote) => {
    const keep = [];
    for (const raw of specList.split(',')) {
      const spec = raw.trim();
      if (!spec) continue;
      const m = spec.match(/^(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (m && ROUTER_COMPONENTS.has(m[1])) passthroughs.push(m[2] || m[1]);
      else keep.push(spec);
    }
    if (keep.length === specList.split(',').map((s) => s.trim()).filter(Boolean).length) return full;
    return keep.length ? `import { ${keep.join(', ')} } from ${quote}react-router-dom${quote};` : '';
  });
  if (!passthroughs.length) return code;
  const defs = passthroughs.map((n) => `const ${n} = ({ children }) => <>{children}</>;`).join('\n');
  return `${out}\n\n// devdrop preview: the preview supplies the one Router above the whole app\n${defs}\n`;
}

export function buildEntryCode(files, appImport = './App') {
  const wrap = siteNeedsRouterWrapper(files);
  return `import React from 'react';\nimport ReactDOM from 'react-dom/client';\n${wrap ? "import { BrowserRouter } from 'react-router-dom';\n" : ''}import App from '${appImport}';\n\nconst root = ReactDOM.createRoot(document.getElementById('root'));\nroot.render(\n  <React.StrictMode>\n    ${wrap ? '<BrowserRouter><App /></BrowserRouter>' : '<App />'}\n  </React.StrictMode>\n);\n`;
}

// Returns a new files map ready for the preview: nested Routers neutralized, entry supplying the Router.
export function applyPreviewRouter(sourceFiles) {
  const files = { ...(sourceFiles || {}) };
  if (!siteNeedsRouterWrapper(files)) return files;
  for (const [p, obj] of Object.entries(files)) {
    if (!isCodePath(p) || isEntryPath(p)) continue;
    const code = codeOf(obj);
    if (typeof code !== 'string' || !ROUTER_IMPORT_RE.test(code)) continue;
    const next = neutralizeRouterComponents(code);
    if (next !== code) files[p] = typeof obj === 'object' && obj ? { ...obj, code: next } : { code: next };
  }
  if (!files['/index.js'] && !files['/index.jsx']) files['/index.js'] = { code: buildEntryCode(files), hidden: true };
  return files;
}
