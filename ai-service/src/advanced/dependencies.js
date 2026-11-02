'use strict';
/** Dependency checks for generated projects: every bare import must be declared, and only vetted packages are auto-added. */
const { parse } = require('@babel/parser');
const vetted = require('../components/dependencyPolicy.json');

const RANGES = {
  'react-router-dom': '^7.0.0', // the in-app preview installs "latest" (v7); keep the major identical
  ...Object.fromEntries(Object.entries(vetted.packages).map(([k, v]) => [k, v.range])),
};
const ALIASES = vetted.aliases || {};
const ALWAYS = new Set(['react', 'react-dom', ...(vetted.alwaysAvailable || [])]);
const isCode = (p) => /\.(jsx?|mjs|cjs)$/i.test(p);

const pkgName = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);

function importedPackages(files) {
  const used = new Map(); // pkg -> Set(paths)
  for (const [path, f] of Object.entries(files)) {
    const code = typeof f === 'string' ? f : f?.code;
    if (!isCode(path) || typeof code !== 'string' || /^\/(vite|postcss|tailwind|eslint)\.config\.[cm]?js$/.test(path)) continue; // build tooling is scaffolded, not app code
    let ast;
    try { ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'dynamicImport'] }); } catch { continue; }
    const visit = (n) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) return n.forEach(visit);
      if ((n.type === 'ImportDeclaration' || n.type === 'ExportNamedDeclaration' || n.type === 'ExportAllDeclaration') && n.source?.value) {
        const s = n.source.value;
        if (!s.startsWith('.') && !s.startsWith('/') && !s.startsWith('asset:') && !/^(https?:|data:|node:)/.test(s)) {
          const name = pkgName(s); (used.get(name) || used.set(name, new Set()).get(name)).add(path);
        }
      }
      for (const k of Object.keys(n)) if (k !== 'loc' && k !== 'tokens') visit(n[k]);
    };
    visit(ast.program);
  }
  return used;
}

/**
 * @returns {{dependencies:object, added:string[], unresolved:{name:string,files:string[]}[]}}
 * Vetted packages that are imported but undeclared are added deterministically; anything else is reported for repair.
 */
function resolveDependencies(files, declared = {}) {
  const dependencies = { ...declared };
  const added = [];
  const unresolved = [];
  for (const [rawName, where] of importedPackages(files)) {
    const name = ALIASES[rawName] && !declared[rawName] ? rawName : rawName;
    if (ALWAYS.has(name) || dependencies[name]) continue;
    const aliased = ALIASES[name];
    if (aliased && dependencies[aliased]) continue;
    if (RANGES[name]) { dependencies[name] = RANGES[name]; added.push(name); } else unresolved.push({ name, files: [...where].sort() });
  }
  return { dependencies, added, unresolved };
}

module.exports = { resolveDependencies, importedPackages, RANGES };
