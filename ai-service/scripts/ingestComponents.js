#!/usr/bin/env node
'use strict';
// usage: node scripts/ingestComponents.js [--source id] [--repo-dir <id>=<path>]... [--fetch]
// --fetch shallow-clones the pinned commit into a temp dir (git only; no package scripts are ever run).
const fs = require('fs'); const os = require('os'); const path = require('path'); const { execFileSync } = require('child_process');
const { ingestSource, mergeIndex } = require('../src/components/ingest');
const defs = require('../src/components/catalog/sources.json').sources;
const args = process.argv.slice(2);
const only = args.includes('--source') ? args[args.indexOf('--source') + 1] : null;
const dirs = {}; args.forEach((a, i) => { if (a === '--repo-dir') { const [id, p] = args[i + 1].split('='); dirs[id] = p; } });
(async () => {
  const all = [];
  for (const src of defs) {
    if (only && src.id !== only) continue;
    let dir = dirs[src.id];
    if (!dir && args.includes('--fetch')) {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), `dd-${src.id}-`));
      execFileSync('git', ['init', '-q', dir]); execFileSync('git', ['-C', dir, 'fetch', '-q', '--depth', '1', `https://github.com/${src.repository}.git`, src.commit]); execFileSync('git', ['-C', dir, 'checkout', '-q', 'FETCH_HEAD']);
    }
    if (!dir) { console.warn(`[ingest] ${src.id}: no checkout (use --repo-dir ${src.id}=PATH or --fetch)`); continue; }
    const recs = await ingestSource(src, dir); console.log(`[ingest] ${src.id}: ${recs.length} components`); all.push(...recs);
  }
  const idx = mergeIndex(all); console.log(`[ingest] catalog now has ${idx.records.length} components`);
  const by = {}; for (const r of idx.records) by[r.status] = (by[r.status] || 0) + 1; console.log(by);
})().catch((e) => { console.error(e); process.exit(1); });
