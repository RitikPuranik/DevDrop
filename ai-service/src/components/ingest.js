'use strict';
// Ingestion: runs OUTSIDE generation jobs (npm run components:ingest). Reads files from a local checkout pinned to an
// exact commit, verifies the license from the license file itself, transforms the source, classifies it and writes a
// per-component record. Nothing here installs packages, executes upstream scripts or touches the network.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { detect, MATRIX, sha256 } = require('./licenseDetector');
const { toJsx, cssFromRegistry, provenanceHeader, targetPath } = require('./sourceTransform');
const { classify } = require('./classifier');
const { validateRecord, DISTRIBUTION_MODES } = require('./schema');
const { policy, canonicalName } = require('./dependencyResolver');

const CATALOG_DIR = path.join(__dirname, 'catalog');
const read = (p) => fs.readFileSync(p, 'utf8');
function headCommit(dir) { try { return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return null; } }
function importedPackages(code) {
  const out = new Set();
  for (const m of code.matchAll(/from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g)) {
    const spec = m[1] || m[2];
    if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('@/') || spec.startsWith('~/') || spec === 'cn') continue;
    out.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
  }
  return [...out];
}
function scanAssets(code) {
  const found = [];
  for (const m of code.matchAll(/https?:\/\/[^\s'"`)]+/g)) if (!/w3\.org|reactjs\.org|github\.com|tailwindcss\.com|ui\.shadcn|magicui\.design|motion-primitives|developer\.mozilla|reactbits/i.test(m[0])) found.push(m[0]);
  for (const m of code.matchAll(/['"`]([^'"`]+\.(?:png|jpe?g|gif|webp|svg|woff2?|ttf|otf|mp4|webm))['"`]/gi)) found.push(m[1]);
  return [...new Set(found)];
}
function permissionsFor(license) {
  const matrix = license.verified ? MATRIX[license.spdx] : null;
  return Object.fromEntries(DISTRIBUTION_MODES.map((m) => [m, matrix ? matrix[m] : 'unverified']));
}
async function buildRecord({ src, repoDir, lib, slug, upstreamPath, description, descriptionFallback, cssPath, registryItem, license, licenseRel }) {
  const abs = path.join(repoDir, upstreamPath);
  const upstream = read(abs);
  const componentId = `${lib}/${slug}`;
  const notes = [];
  const imported = importedPackages(upstream);
  const rawDeps = {}; for (const p of imported) if (!['react', 'react-dom'].includes(p)) rawDeps[canonicalName(p)] = policy.packages[canonicalName(p)]?.range || 'UNLISTED';
  // internal sibling imports (e.g. "@/components/ui/button") are catalogued separately; flag them
  const internal = [...upstream.matchAll(/from\s+['"]@\/(?:registry\/[\w-]+|components)\/(?:ui|magicui|core)\/([\w-]+)['"]/g)].map((m) => m[1]);
  const tr = await toJsx(upstream, { fileName: upstreamPath });
  const ext = cssPath || registryItem && cssFromRegistry(registryItem) ? true : false;
  let cssText = null; let cssUpstreamHash = null;
  if (cssPath) { cssText = read(path.join(repoDir, cssPath)); cssUpstreamHash = sha256(cssText); }
  else if (registryItem && cssFromRegistry(registryItem)) cssText = cssFromRegistry(registryItem) + '\n';
  let code = tr.code;
  if (cssText) {
    const cssFile = `./${path.basename(targetPath(slug, 'css'))}`;
    code = cssPath ? code.replace(/import\s+['"]\.\/[\w-]+\.css['"];?/, `import "${cssFile}";`) : `import "${cssFile}";\n${code}`;
    if (!code.includes(cssFile)) code = `import "${cssFile}";\n${code}`;
    tr.applied.push(cssPath ? 'renamed stylesheet import to the vendored location' : 'derived plain-CSS keyframes/utilities from the upstream registry entry (Tailwind-CDN projects have no build-time theme)');
  }
  const header = provenanceHeader({ componentId, source: { repository: src.repository, commit: src.commit, path: upstreamPath }, license });
  code = header + code;
  const meta = classify({ name: slug.replace(/-/g, ' '), description, code, deps: rawDeps });
  const assets = scanAssets(upstream + (cssText || ''));
  const perms = permissionsFor(license);
  let status = license.verified && DISTRIBUTION_MODES.every((m) => perms[m] === 'allowed') ? 'verified' : license.verified ? 'restricted' : 'pending-verification';
  const unlisted = Object.entries(rawDeps).filter(([, v]) => v === 'UNLISTED').map(([k]) => k);
  if (unlisted.length) { status = 'pending-verification'; notes.push(`dependencies not on the vetted list: ${unlisted.join(', ')}`); }
  if (internal.length) { status = 'pending-verification'; notes.push(`depends on sibling components not yet catalogued: ${internal.join(', ')}`); }
  if (assets.length) { status = 'pending-verification'; notes.push(`external assets need separate license review: ${assets.slice(0, 3).join(', ')}`); }
  const leftover = [...tr.code.matchAll(/from\s+['"](@\/[^'"]+|~\/[^'"]+)['"]/g)].map((m) => m[1]);
  if (leftover.length) { status = 'pending-verification'; notes.push(`unresolved path aliases after transform: ${[...new Set(leftover)].join(', ')}`); }
  const own = /(licensed under|spdx-license-identifier|\bcopyright\b\s*(?:\(c\)|©))/i.exec(upstream);
  if (own) { status = 'pending-verification'; notes.push('file carries its own license/copyright statement; review required'); }
  const deps = Object.fromEntries(Object.entries(rawDeps).filter(([, v]) => v !== 'UNLISTED'));
  const storedRel = `sources/${lib}/${slug}.jsx`;
  const record = {
    componentId, library: lib, name: slug.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join(' '), category: meta.category,
    description, descriptionSource: registryItem && !descriptionFallback ? 'upstream-registry' : 'devdrop-curated', status,
    capabilities: meta.capabilities, designCharacteristics: meta.designCharacteristics, tags: meta.tags,
    framework: 'react', styling: src.styling, dependencies: deps, unresolvedDependencies: unlisted,
    sourceReference: `https://github.com/${src.repository}/blob/${src.commit}/${upstreamPath}`, version: src.commit.slice(0, 12),
    source: { repository: src.repository, commit: src.commit, path: upstreamPath, upstreamSha256: sha256(upstream), ...(cssPath ? { cssPath, cssUpstreamSha256: cssUpstreamHash } : {}) },
    storage: { entry: storedRel, sha256: sha256(code), assets: cssText ? [{ path: `sources/${lib}/${slug}.css`, sha256: sha256(cssText) }] : [], target: targetPath(slug), targetCss: cssText ? targetPath(slug, 'css') : null, weightBytes: Buffer.byteLength(code) },
    license: { spdx: license.spdx, verified: license.verified, licenseSource: { repository: src.repository, commit: src.commit, path: licenseRel, sha256: license.sha256 }, copyright: license.copyright, attribution: license.attribution, ...(license.restrictions ? { restrictions: license.restrictions } : {}), ...(license.note ? { note: license.note } : {}) },
    distributionPermissions: perms, assets, verificationNotes: notes,
    verification: { level: 'component', checkedAt: new Date().toISOString().slice(0, 10), checks: ['license-text-fingerprint', 'per-file-license-header', 'dependency-policy', 'external-assets', 'sibling-imports'] },
    modificationHistory: [{ at: new Date().toISOString().slice(0, 10), by: 'devdrop-ingest', changes: tr.applied }],
    usesMotion: meta.usesMotion,
  };
  return { record, code, cssText };
}
async function ingestSource(src, repoDir, { catalogDir = CATALOG_DIR } = {}) {
  const head = headCommit(repoDir);
  if (head && head !== src.commit) throw new Error(`${src.id}: checkout is at ${head}, definition pins ${src.commit}`);
  const licRaw = read(path.join(repoDir, src.licensePath));
  const license = detect(licRaw);
  const out = [];
  let items = [];
  if (src.adapter === 'shadcn-registry') {
    const reg = JSON.parse(read(path.join(repoDir, src.registryJson)));
    const byName = new Map(reg.items.map((i) => [i.name, i]));
    for (const name of src.include) {
      const item = byName.get(name); if (!item || !item.files?.length) { console.warn(`[ingest] ${src.id}/${name}: not in registry`); continue; }
      items.push({ slug: name, upstreamPath: path.posix.join(src.fileRoot || '', item.files[0].path), description: item.description || item.title || `${name.replace(/-/g, ' ')} primitive from ${src.id} (Tailwind-styled, accessible UI building block)`, descriptionFallback: !(item.description || item.title), registryItem: item });
      if (item.registryDependencies?.length) items[items.length - 1].registryItem = { ...item };
    }
  } else if (src.adapter === 'github-files') {
    items = src.files.map((f) => ({ slug: f.slug, upstreamPath: f.path, description: f.description, cssPath: f.css }));
  } else throw new Error(`unknown adapter ${src.adapter}`);
  for (const it of items) {
    try {
      const built = await buildRecord({ src, repoDir, lib: src.id, license, licenseRel: src.licensePath, ...it });
      const errs = validateRecord(built.record);
      if (errs.length) { console.warn(`[ingest] ${built.record.componentId} invalid: ${errs.join('; ')}`); continue; }
      fs.mkdirSync(path.join(catalogDir, 'sources', src.id), { recursive: true });
      fs.writeFileSync(path.join(catalogDir, built.record.storage.entry), built.code);
      if (built.cssText) fs.writeFileSync(path.join(catalogDir, built.record.storage.assets[0].path), built.cssText);
      out.push(built.record);
    } catch (e) { console.warn(`[ingest] ${src.id}/${it.slug} failed: ${e.message}`); }
  }
  fs.mkdirSync(path.join(catalogDir, 'licenses'), { recursive: true });
  fs.writeFileSync(path.join(catalogDir, 'licenses', `${src.id}.txt`), licRaw);
  return out;
}
function mergeIndex(records, { catalogDir = CATALOG_DIR } = {}) {
  const file = path.join(catalogDir, 'index.json');
  const cur = fs.existsSync(file) ? JSON.parse(read(file)) : { schemaVersion: 1, records: [] };
  const map = new Map(cur.records.map((r) => [r.componentId, r]));
  for (const r of records) {
    const prev = map.get(r.componentId);
    if (prev) {
      if (prev.source.commit !== r.source.commit) r.modificationHistory = [...(prev.modificationHistory || []), { at: r.verification.checkedAt, by: 'devdrop-ingest', changes: [`version change ${prev.version} -> ${r.version}`] }, ...r.modificationHistory];
      else r.modificationHistory = prev.modificationHistory;
    }
    map.set(r.componentId, r);
  }
  const next = { schemaVersion: 1, records: [...map.values()].sort((a, b) => a.componentId.localeCompare(b.componentId)) };
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
  return next;
}
module.exports = { ingestSource, mergeIndex, buildRecord, CATALOG_DIR };
