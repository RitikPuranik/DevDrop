'use strict';
// Narrows what the debug agent is sent. Previously every repair attempt sent the whole project (~41k tokens each),
// even when the error named a single file.
const FILE_RE = /\/[\w@.\-/]+\.(?:jsx?|mjs|cjs|css|json|html)\b/g;
const IMPORT_RE = /\bimport\s+(?:[^'"]*?\sfrom\s+)?['"](\.[^'"]+)['"]|\bexport\s+[^'"]*?\sfrom\s+['"](\.[^'"]+)['"]/g;
const MAX_CHARS = 60000;

function resolveImport(from, spec, files) {
  const parts = from.split('/').filter(Boolean); parts.pop();
  for (const s of spec.split('/')) { if (!s || s === '.') continue; if (s === '..') parts.pop(); else parts.push(s); }
  const base = `/${parts.join('/')}`;
  return [base, `${base}.js`, `${base}.jsx`, `${base}.mjs`, `${base}.cjs`, `${base}/index.js`, `${base}/index.jsx`].find((p) => Object.prototype.hasOwnProperty.call(files, p)) || null;
}

/** Returns { affectedFiles, files } limited to files named in the errors, their direct imports, and package.json when relevant. */
function scopeDebugInput({ errors = [], files = {} }) {
  const text = (errors || []).join('\n');
  const named = new Set();
  for (const m of text.matchAll(FILE_RE)) if (Object.prototype.hasOwnProperty.call(files, m[0])) named.add(m[0]);
  if (!named.size) return { affectedFiles: Object.keys(files), files, scoped: false }; // error names no file: keep the old behaviour
  const picked = new Set(named);
  for (const path of named) {
    const code = files[path]?.code || '';
    for (const m of code.matchAll(IMPORT_RE)) { const target = resolveImport(path, m[1] || m[2], files); if (target) picked.add(target); }
  }
  if (/dependenc|cannot find module|package\.json|failed to resolve import/i.test(text) && files['/package.json']) picked.add('/package.json');
  // Keep the named files first; add neighbours only while the budget allows.
  const ordered = [...named, ...[...picked].filter((p) => !named.has(p))];
  const out = {}; let size = 0;
  for (const p of ordered) {
    const len = (files[p]?.code || '').length;
    if (size + len > MAX_CHARS && !named.has(p)) continue;
    out[p] = files[p]; size += len;
  }
  return { affectedFiles: [...named], files: out, scoped: true };
}

/** Applies model changes and reports which ones actually altered a file. */
function applyChanges(files, changes, normalizePath = (p) => p) {
  const changed = [];
  for (const change of changes || []) {
    if (!change || !change.path || typeof change.code !== 'string') continue;
    const path = normalizePath(change.path);
    if (files[path]?.code === change.code) continue;
    files[path] = { code: change.code };
    changed.push(path);
  }
  return changed;
}

module.exports = { scopeDebugInput, applyChanges };
