'use strict';
// Component-specific quality review (deterministic). Complements quality.review.js; findings use the same shape.
const { parse } = require('@babel/parser');
const { policy, canonicalName } = require('./dependencyResolver');
function review({ files, report, plan, dependencies = {} }) {
  const findings = [];
  const add = (severity, rule, message, file) => findings.push({ severity, rule, message, ...(file ? { file } : {}) });
  for (const r of report) {
    if (!r.present) { add('warning', 'component-missing', `Planned component ${r.componentId} was not found in the generated files.`); continue; }
    if (r.derived && !files[r.path].code.includes(`Component : ${r.componentId}`)) add('error', 'license-header-missing', `${r.path} lacks the provenance/license header.`, r.path);
    if ((r.decision === 'restyle' || r.decision === 'restructure' || r.decision === 'combine') && r.changedLines < 3) add('warning', 'unadapted-component', `${r.componentId} was chosen to be ${r.decision}d but is nearly identical to the upstream demo (${r.changedLines} changed lines).`, r.path);
    if (r.decision === 'use' && r.similarity > 0.97) add('info', 'unmodified-component', `${r.componentId} is used unmodified; confirm it matches the design.`, r.path);
  }
  const declared = { ...dependencies };
  for (const [p, f] of Object.entries(files)) {
    if (!/\.(jsx?|mjs)$/.test(p) || !f.code) continue;
    let ast; try { ast = parse(f.code, { sourceType: 'module', plugins: ['jsx'] }); } catch { continue; }
    for (const n of ast.program.body) if (n.type === 'ImportDeclaration' && !n.source.value.startsWith('.') && !n.source.value.startsWith('/')) {
      const spec = n.source.value; const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (['react', 'react-dom'].includes(pkg)) continue;
      if (!declared[pkg] && !declared[canonicalName(pkg)]) add('error', 'undeclared-dependency', `${p} imports "${pkg}" which is not a declared dependency.`, p);
      else if (!policy.packages[canonicalName(pkg)] && !declared[pkg]) add('warning', 'unvetted-dependency', `${p} imports "${pkg}" which is not on the vetted list.`, p);
    }
    if (/motion\.|useSpring|animate\(/.test(f.code) && p.startsWith('/components/ui/') && !/prefers-reduced-motion|useReducedMotion|reducedMotion|motion-reduce/.test(f.code)) add('warning', 'reduced-motion', `${p} animates without a reduced-motion path.`, p);
  }
  // Two raw package names that resolve to the same exclusive-engine family (e.g. framer-motion + motion) is a duplicate install.
  const byFamily = {};
  for (const name of Object.keys(declared)) { const fam = policy.packages[canonicalName(name)]?.family; if (['animation-engine', 'carousel', 'charts'].includes(fam)) (byFamily[fam] = byFamily[fam] || new Set()).add(name); }
  for (const [fam, names] of Object.entries(byFamily)) if (names.size > 1) add('error', 'duplicate-animation-engine', `Multiple ${fam} packages installed: ${[...names].join(', ')}.`);
  return { findings, blocking: findings.filter((f) => f.severity === 'error').map((f) => f.message) };
}
module.exports = { review };
