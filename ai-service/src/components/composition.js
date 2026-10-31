'use strict';
// Stage E support: turns an approved plan into (1) architecture file contracts for the adapted components and (2) the
// briefs the Code Agent receives. The agent gets the REAL source and explicit permission to change anything.
const { pascal, targetPath, UI_DIR } = require('./sourceTransform');
const LATITUDE = 'The attached source is raw material, not a finished component. You may change anything: dimensions, proportions, padding, colors, gradients, borders, radius, shadows, typography, alignment, internal layout and markup, props, Tailwind classes, CSS and CSS variables, animation logic, timing and easing, hover behavior, responsive behavior and light/dark handling; you may delete parts, add elements, extract subcomponents, merge with other attached sources, or rewrite it completely when that serves the design. Do NOT preserve the original demo look. Bind colors, type, radius and motion to the designSpec/designSystem. Hard rules: keep the provenance comment block at the top of the file exactly as given (it is a license notice); keep JavaScript/JSX only; keep only imports that exist in the declared dependencies or project files; respect prefers-reduced-motion; keep keyboard/ARIA behavior that the original provides; never add network requests or external assets.';

function planFiles(plan, store) {
  const contracts = []; const extraDeps = {};
  for (const item of plan.items) {
    if (!item.componentIds.length) continue;
    const recs = item.componentIds.map((id) => store.get(id));
    const combined = item.decision === 'combine';
    const base = combined ? `${UI_DIR}/${pascal(item.sectionId)}Composite.jsx` : recs[0].storage.target;
    contracts.push({ path: base, type: 'component', responsibility: `${item.decision} of ${item.componentIds.join(' + ')} for section "${item.sectionId}": ${item.rationale}`.slice(0, 400), exports: ['default'], imports: ['/lib/utils.js'].filter(() => false), componentIds: item.componentIds, sectionId: item.sectionId, decision: item.decision, vendored: true });
    for (const r of recs) if (r.storage.targetCss && !combined) contracts.push({ path: r.storage.targetCss, type: 'style', responsibility: `Stylesheet of the adapted ${r.componentId}; keep keyframe names that the component references or update both together.`, exports: [], imports: [], componentIds: [r.componentId], sectionId: item.sectionId, decision: item.decision, vendored: true });
  }
  return { contracts, extraDeps };
}
// Insert the component files into the architecture and wire them into the section that hosts them.
function applyPlanToArchitecture(architecture, plan, store) {
  const { contracts } = planFiles(plan, store);
  if (!contracts.length) return architecture;
  const files = architecture.files.filter((f) => !contracts.some((c) => c.path === f.path));
  for (const c of contracts) {
    if (c.type === 'style') continue;
    const sid = c.sectionId.toLowerCase();
    const host = files.find((f) => f.path !== '/App.js' && f.type !== 'style' && !f.vendored && (f.path.toLowerCase().includes(sid) || new RegExp(`\\b${sid}\\b`).test((f.responsibility || '').toLowerCase()))) || files.find((f) => f.path === '/App.js');
    if (host) host.imports = [...new Set([...(host.imports || []), c.path])];
    if (c.componentIds.some((id) => store.get(id).styling.includes('tailwind'))) c.imports = [...new Set([...(c.imports || []), '/lib/utils.js'])];
  }
  const needsUtils = contracts.some((c) => c.type !== 'style');
  const out = { ...architecture, files: [...files, ...contracts], dependencies: { ...(architecture.dependencies || {}), ...plan.dependencies } };
  if (needsUtils && !out.files.some((f) => f.path === '/lib/utils.js')) out.files.push({ path: '/lib/utils.js', type: 'util', responsibility: 'cn() class-name helper used by vendored components.', exports: ['cn'], imports: [], vendored: true, deterministic: true });
  return out;
}
const CN_SOURCE = `// Minimal class-name joiner (no dependencies). Accepts strings, arrays and {class: condition} objects.\nexport function cn(...inputs) {\n  const out = [];\n  const walk = (v) => {\n    if (!v) return;\n    if (typeof v === 'string' || typeof v === 'number') out.push(String(v));\n    else if (Array.isArray(v)) v.forEach(walk);\n    else if (typeof v === 'object') for (const k of Object.keys(v)) if (v[k]) out.push(k);\n  };\n  inputs.forEach(walk);\n  return out.join(' ');\n}\nexport default cn;\n`;
function briefFor(contract, plan, store, { designSpec, design } = {}) {
  if (!contract.componentIds) return null;
  const item = plan.items.find((i) => i.sectionId === contract.sectionId && i.componentIds.some((id) => contract.componentIds.includes(id)));
  const sources = contract.componentIds.map((id) => { const s = store.source(id); return { componentId: id, library: s.record.library, targetPath: s.record.storage.target, role: contract.type === 'style' ? 'stylesheet' : 'component', originalSource: contract.type === 'style' ? s.css : s.code, cssCompanionPath: s.record.storage.targetCss, dependencies: Object.keys(s.record.dependencies) }; }).filter((s) => s.originalSource);
  return { decision: contract.decision, sectionId: contract.sectionId, rationale: item?.rationale, adaptationDirectives: item?.adaptation || [], latitude: LATITUDE, sources, designTokens: designSpec ? { palette: designSpec.palette, typography: designSpec.typography, radius: designSpec.visualDirection?.radius, density: designSpec.visualDirection?.density, motionIntensity: designSpec.visualDirection?.motionIntensity } : null, designSystem: design?.designSystem || null };
}
module.exports = { applyPlanToArchitecture, briefFor, CN_SOURCE, LATITUDE, planFiles };
