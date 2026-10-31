'use strict';
// Mechanical, reviewable transforms that make an upstream component usable in DevDrop's React+Vite+JavaScript projects.
// Each applied transform is returned so it can be recorded in the component's modification history.
// esbuild is only needed at ingestion time; load it lazily so generation jobs never touch the binary.
const { canonicalName } = require('./dependencyResolver');

const UI_DIR = '/components/ui';
const pascal = (slug) => slug.split(/[-_/]/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join('');
const targetPath = (slug, ext = 'jsx') => `${UI_DIR}/${pascal(slug)}.${ext}`;

function provenanceHeader(rec) {
  return `/*!\n * DevDrop component provenance (license notice - do not remove)\n * Component : ${rec.componentId}\n * Source    : github.com/${rec.source.repository} @ ${rec.source.commit.slice(0, 12)} : ${rec.source.path}\n * License   : ${rec.license.spdx}, ${rec.license.copyright}\n * Full text : /THIRD_PARTY_NOTICES.md\n */\n`;
}
async function toJsx(code, { fileName, slugResolver }) {
  const applied = [];
  let out = code;
  if (/\.tsx?$/.test(fileName)) {
    out = (await require('esbuild').transform(out, { loader: 'tsx', jsx: 'preserve', target: 'esnext', format: 'esm', sourcefile: fileName, legalComments: 'inline' })).code;
    applied.push('typescript-to-javascript (esbuild, types stripped, JSX preserved)');
  }
  const before = out;
  out = out.replace(/^\s*['"]use client['"];?\s*$/m, '');
  if (out !== before) applied.push("removed 'use client' directive");
  const b2 = out;
  out = out.replace(/from\s+(['"])(?:@\/(?:registry\/[\w-]+\/)?lib\/utils|cn)\1/g, 'from "../../lib/utils.js"');
  out = out.replace(/from\s+(['"])@\/(?:registry\/[\w-]+|components)\/(?:ui|magicui|core)\/([\w-]+)\1/g, (_, q, name) => `from "./${pascal(name)}.jsx"`);
  if (out !== b2) applied.push('rewrote @/ path aliases to project-relative imports');
  const b3 = out;
  out = out.replace(/from\s+(['"])([^'"]+)\1/g, (m, q, spec) => { const base = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]; const canon = canonicalName(base); if (canon === base) return m; const rest = spec.slice(base.length); return `from "${canon === 'motion' ? 'motion/react' : canon}${canon === 'motion' ? '' : rest}"`; });
  if (out !== b3) applied.push('normalized animation engine import (framer-motion -> motion/react)');
  if (slugResolver) { /* reserved for per-library rewrites */ }
  return { code: out.replace(/\n{3,}/g, '\n\n').trim() + '\n', applied };
}
function cssFromRegistry(item) {
  const blocks = [];
  const theme = (item.cssVars && item.cssVars.theme) || {};
  const css = item.css || {};
  const render = (obj, ind = '') => Object.entries(obj).map(([k, v]) => (v && typeof v === 'object') ? `${ind}${k} {\n${render(v, ind + '  ')}\n${ind}}` : `${ind}${k}: ${v};`).join('\n');
  for (const [k, v] of Object.entries(css)) if (/^@keyframes\s/.test(k) && typeof v === 'object') blocks.push(`${k} {\n${render(v, '  ')}\n}`);
  // Tailwind-CDN projects have no build-time theme: turn `--animate-*` / `animate-*` theme entries into plain utility classes.
  for (const [k, v] of Object.entries(theme)) if (/^(--)?animate-/.test(k)) blocks.push(`.${k.replace(/^--/, '')} { animation: ${v}; }`);
  return blocks.join('\n\n');
}
module.exports = { toJsx, cssFromRegistry, provenanceHeader, pascal, targetPath, UI_DIR };
