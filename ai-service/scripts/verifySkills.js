#!/usr/bin/env node
'use strict';
// Offline verification of the pinned skill library.
//   node scripts/verifySkills.js                       -> manifest, notices, content hashes
//   node scripts/verifySkills.js --upstream owner/repo=/path/to/clone [--upstream ...]
//                                                      -> also compares upstreamHash with local upstream clones
//   node scripts/verifySkills.js --print-hash <contentPath>   -> sha256 of a library file (for updating the manifest)
const fs = require('fs');
const path = require('path');
const skills = require('../src/skills');
const { LIBRARY_ROOT } = require('../src/skills/registry');
const { sha256 } = require('../src/skills/skillLoader');

const args = process.argv.slice(2);
const hashIdx = args.indexOf('--print-hash');
if (hashIdx !== -1) {
  const rel = args[hashIdx + 1];
  const abs = path.resolve(LIBRARY_ROOT, rel || '');
  if (!abs.startsWith(LIBRARY_ROOT + path.sep) || !fs.existsSync(abs)) { console.error('path must be inside the skill library'); process.exit(2); }
  console.log(sha256(fs.readFileSync(abs)));
  process.exit(0);
}
const clones = {};
for (let i = 0; i < args.length; i += 1) if (args[i] === '--upstream') { const [repo, dir] = String(args[i + 1] || '').split('='); if (repo && dir) clones[repo] = path.resolve(dir); }

const result = skills.startupCheck({ logger: { log: () => {}, warn: console.warn, error: () => {} } });
const registry = skills.getDefaultRegistry();
let failed = !result.ok;
console.log(`startup check: ${result.ok ? 'OK' : 'FAILED'}`);
for (const e of result.errors) console.log(`  error: ${e}`);
for (const w of result.warnings) console.log(`  warning: ${w}`);
for (const row of skills.buildProvenanceReport(registry)) console.log(`  ${row.id}@${row.version} [${row.origin}] license=${row.license} (${row.licenseStatus}) ${row.commit ? `commit=${row.commit.slice(0, 12)}` : 'internal'} sha256=${row.contentHash.slice(0, 12)}…`);
if (Object.keys(clones).length) {
  for (const r of skills.verifyAgainstUpstream(registry, clones)) { console.log(`  upstream ${r.id}: ${r.status} (${r.detail})`); if (r.status === 'fail') failed = true; }
}
console.log(`rejected / pending candidates recorded: ${registry.rejectedCandidates.length}`);
process.exit(failed ? 1 : 0);
