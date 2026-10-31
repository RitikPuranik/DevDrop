'use strict';
// Read-only catalog access for generation jobs: loads index.json once, verifies every stored file against its recorded
// sha256 before it can be served, and caches source text in memory. Generation never writes to the catalog.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateRecord } = require('./schema');
const DEFAULT_DIR = path.join(__dirname, 'catalog');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

class IntegrityError extends Error { constructor(id, what) { super(`catalog integrity check failed for ${id}: ${what}`); this.code = 'COMPONENT_INTEGRITY'; } }

function createStore({ dir = DEFAULT_DIR, verify = true } = {}) {
  const indexFile = path.join(dir, 'index.json');
  const raw = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : { records: [] };
  const records = new Map();
  const invalid = [];
  for (const r of raw.records || []) { const errs = validateRecord(r); if (errs.length) invalid.push(...errs); else records.set(r.componentId, r); }
  const cache = new Map();
  function safeJoin(rel) {
    const abs = path.resolve(dir, rel);
    if (!abs.startsWith(path.resolve(dir) + path.sep)) throw new IntegrityError(rel, 'path escapes the catalog');
    return abs;
  }
  function readVerified(id, rel, expected) {
    const text = fs.readFileSync(safeJoin(rel), 'utf8');
    if (verify && sha(text) !== expected) throw new IntegrityError(id, `${rel} does not match its recorded sha256`);
    return text;
  }
  return {
    dir, invalid,
    size: () => records.size,
    all: () => [...records.values()],
    get: (id) => records.get(id) || null,
    // Returns {code, css, record}; throws IntegrityError on any tampering. Cached per process.
    source(id) {
      if (cache.has(id)) return cache.get(id);
      const record = records.get(id);
      if (!record) return null;
      const code = readVerified(id, record.storage.entry, record.storage.sha256);
      const css = record.storage.assets[0] ? readVerified(id, record.storage.assets[0].path, record.storage.assets[0].sha256) : null;
      const out = { code, css, record };
      cache.set(id, out);
      return out;
    },
    licenseText(library) { const p = path.join(dir, 'licenses', `${library}.txt`); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; },
    verifyAll() { const bad = []; for (const id of records.keys()) { try { this.source(id); } catch (e) { bad.push(e.message); } } return bad; },
  };
}
let shared = null;
function getDefaultStore() { if (!shared) shared = createStore(); return shared; }
module.exports = { createStore, getDefaultStore, IntegrityError };
