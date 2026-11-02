'use strict';
/**
 * The single, in-memory source of truth for a project while it is being generated or repaired.
 *
 * - Paths are validated and normalised in ONE place (no traversal, no TypeScript, no odd characters).
 * - Every write records who made it and in which phase, so we can later prove that files were created dynamically
 *   during generation or repair.
 * - Parallel workers never edit the same file: a path is CLAIMED by exactly one owner while it is being written.
 * - System files (package.json, entry, tokens...) can only be written by privileged owners.
 *
 * There is no cap on how many files a store may hold: the project's size is limited by the output-bytes budget only.
 */

const ALLOWED_EXT = /\.(jsx?|mjs|cjs|css|json|html|svg|md|txt|webmanifest|xml)$/i;
const SEGMENT_RE = /^[A-Za-z0-9._@()[\]+~-]+$/;
const MAX_PATH_LENGTH = 220;

const SYSTEM_PATHS = new Set([
  '/package.json', '/index.html', '/main.jsx', '/vite.config.js', '/.npmrc', '/vercel.json', '/favicon.svg',
  '/styles/tokens.css', '/styles/base.css',
]);
const PRIVILEGED_OWNERS = new Set(['system', 'repair', 'integration']);

function normalizePath(input) {
  if (typeof input !== 'string') return null;
  let p = input.trim().replace(/\\/g, '/');
  if (!p || p.includes('\0')) return null;
  if (!p.startsWith('/')) p = `/${p}`;
  p = p.replace(/\/{2,}/g, '/');
  if (p.length > MAX_PATH_LENGTH || p.endsWith('/')) return null;
  const segments = p.split('/').slice(1);
  if (segments.some((s) => !s || s === '.' || s === '..' || !SEGMENT_RE.test(s))) return null;
  return `/${segments.join('/')}`;
}

/** Why a path cannot be used, or null when it is fine. */
function pathProblem(input) {
  const p = normalizePath(input);
  if (!p) return `"${String(input).slice(0, 80)}" is not a valid project path`;
  if (/\.tsx?$/i.test(p)) return `${p}: TypeScript is not supported (JavaScript/JSX only)`;
  if (!ALLOWED_EXT.test(p)) return `${p}: unsupported file type`;
  return null;
}

class WriteConflictError extends Error {
  constructor(path, owner, holder) {
    super(`${path} is being written by "${holder}"; "${owner}" cannot write it at the same time`);
    this.name = 'WriteConflictError';
    this.path = path;
  }
}

function createProjectStore(initial = {}) {
  const files = new Map(); // path -> code
  const meta = new Map(); // path -> { createdBy, createdIn, updatedBy, updatedIn, writes }
  const claims = new Map(); // path -> owner
  let revision = 0;

  for (const [p, f] of Object.entries(initial || {})) {
    const norm = normalizePath(p);
    const code = typeof f === 'string' ? f : f?.code;
    if (norm && typeof code === 'string') { files.set(norm, code); meta.set(norm, { createdBy: 'checkpoint', createdIn: 'restored', writes: 0 }); }
  }

  const store = {
    normalizePath,
    pathProblem,
    get size() { return files.size; },
    get revision() { return revision; },
    has: (p) => files.has(normalizePath(p)),
    get: (p) => files.get(normalizePath(p)),
    list: () => [...files.keys()].sort(),
    isSystemPath: (p) => SYSTEM_PATHS.has(normalizePath(p)),

    /** Reserve a path for one owner. Returns false if somebody else already holds it. */
    claim(p, owner) {
      const norm = normalizePath(p);
      if (!norm) return false;
      const holder = claims.get(norm);
      if (holder && holder !== owner) return false;
      claims.set(norm, owner);
      return true;
    },
    release(p, owner) { const norm = normalizePath(p); if (claims.get(norm) === owner) claims.delete(norm); },
    holder: (p) => claims.get(normalizePath(p)) || null,

    /**
     * Write a file. Returns { ok, created, path, reason }. Never throws for model-caused problems; those are reported.
     * `phase` is a free label ('generation', 'repair:2', ...) used for provenance.
     */
    write(p, code, { owner = 'system', phase = 'generation' } = {}) {
      const problem = pathProblem(p);
      if (problem) return { ok: false, reason: problem };
      const norm = normalizePath(p);
      if (typeof code !== 'string' || !code.trim()) return { ok: false, path: norm, reason: `${norm}: empty source` };
      if (SYSTEM_PATHS.has(norm) && !PRIVILEGED_OWNERS.has(owner)) return { ok: false, path: norm, reason: `${norm} is managed by the system and cannot be overwritten by "${owner}"` };
      const holder = claims.get(norm);
      if (holder && holder !== owner && !PRIVILEGED_OWNERS.has(owner)) return { ok: false, path: norm, conflict: true, reason: new WriteConflictError(norm, owner, holder).message };
      const created = !files.has(norm);
      files.set(norm, code);
      revision += 1;
      const m = meta.get(norm) || { createdBy: owner, createdIn: phase, writes: 0 };
      m.updatedBy = owner; m.updatedIn = phase; m.writes += 1;
      meta.set(norm, m);
      return { ok: true, created, path: norm };
    },

    remove(p) {
      const norm = normalizePath(p);
      if (!norm || !files.has(norm) || SYSTEM_PATHS.has(norm)) return false;
      files.delete(norm); meta.delete(norm); claims.delete(norm); revision += 1;
      return true;
    },

    /** Files as the rest of DevDrop expects them: { '/path': { code } }. */
    toFiles() {
      const out = {};
      for (const p of [...files.keys()].sort()) out[p] = { code: files.get(p) };
      return out;
    },
    /** Replace the whole contents (used after a verified deterministic transform such as dependency pinning). */
    replaceAll(next, { owner = 'system', phase = 'finalize' } = {}) {
      for (const [p, f] of Object.entries(next || {})) {
        const code = typeof f === 'string' ? f : f?.code;
        if (typeof code === 'string') store.write(p, code, { owner: 'system', phase });
      }
    },
    provenance: (p) => ({ ...(meta.get(normalizePath(p)) || {}) }),
    /** Which files were created in which phase. Proves dynamic file creation (generation vs repair). */
    createdByPhase() {
      const out = {};
      for (const [p, m] of meta) { (out[m.createdIn] = out[m.createdIn] || []).push(p); }
      for (const k of Object.keys(out)) out[k].sort();
      return out;
    },
    totalBytes() { let n = 0; for (const c of files.values()) n += Buffer.byteLength(c, 'utf8'); return n; },
  };
  return store;
}

module.exports = { createProjectStore, normalizePath, pathProblem, WriteConflictError, SYSTEM_PATHS, ALLOWED_EXT };
