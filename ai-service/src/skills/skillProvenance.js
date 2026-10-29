'use strict';
// Provenance and license bookkeeping. Reports what the manifest claims and checks it against files in the repo.
// It makes no legal determination: it verifies that the recorded notices exist and that hashes match.
const fs = require('fs');
const path = require('path');
const { sha256 } = require('./skillLoader');

const LICENSE_FILES = ['LICENSE', 'LICENSE.txt', 'LICENSE.md'];
const LICENSE_MARKERS = { 'Apache-2.0': /Apache License\s+Version 2\.0/i, MIT: /^MIT License/im };

function buildProvenanceReport(registry) {
  return registry.list().map((e) => ({
    id: e.id, version: e.version, origin: e.origin, enabled: e.enabled,
    license: e.license.identifier, licenseStatus: e.license.verificationStatus, noticePath: e.license.noticePath || null,
    repository: e.source?.repository || null, path: e.source?.path || null, commit: e.source?.commit || null,
    checkedAt: e.source?.checkedAt || null, contentHash: e.contentHash, upstreamHash: e.source?.upstreamHash || null,
    modified: Boolean(e.modifications?.length), modifications: e.modifications || [],
  }));
}

function checkProvenance(registry) {
  const issues = [];
  for (const e of registry.list({ origin: 'third-party' })) {
    const dir = path.join(registry.repoRoot, e.license.noticePath);
    const file = LICENSE_FILES.map((n) => path.join(dir, n)).find((p) => fs.existsSync(p));
    if (!file && e.license.verificationStatus === 'declared') {
      // No upstream license text exists; require an explicit local notice that says so.
      const notice = path.join(dir, 'NOTICE.md');
      if (!fs.existsSync(notice) || !/not verified/i.test(fs.readFileSync(notice, 'utf8'))) issues.push(`${e.id}: declared license needs a NOTICE.md stating it is not verified`);
      continue;
    }
    if (!file) { issues.push(`${e.id}: no license file under ${e.license.noticePath}`); continue; }
    const marker = LICENSE_MARKERS[e.license.identifier];
    if (!marker) issues.push(`${e.id}: no license-text check is defined for ${e.license.identifier}`);
    else if (!marker.test(fs.readFileSync(file, 'utf8'))) issues.push(`${e.id}: license file does not look like ${e.license.identifier}`);
    // An unmodified skill must hash identically to upstream; a modified one must say how it was modified.
    if (!e.modifications.length && !e.source.files && e.contentHash !== e.source.upstreamHash) issues.push(`${e.id}: marked unmodified but contentHash differs from upstreamHash`);
    if (e.modifications.length && e.contentHash === e.source.upstreamHash) issues.push(`${e.id}: lists modifications but contentHash equals upstreamHash`);
  }
  for (const e of registry.list({ origin: 'devdrop' })) if (e.source) issues.push(`${e.id}: DevDrop-authored skill must not carry upstream source info`);
  return issues;
}

// Offline verification against local clones of the upstream repositories: { 'owner/name': '/path/to/clone' }.
function verifyAgainstUpstream(registry, clones = {}) {
  const results = [];
  for (const e of registry.list({ origin: 'third-party' })) {
    const root = clones[e.source.repository];
    if (!root) { results.push({ id: e.id, status: 'skipped', detail: `no local clone for ${e.source.repository}` }); continue; }
    const paths = (e.source.files && e.source.files.length ? e.source.files : [e.source.path]).map((p) => path.join(root, p));
    if (paths.some((p) => !fs.existsSync(p))) { results.push({ id: e.id, status: 'fail', detail: 'upstream file missing' }); continue; }
    const actual = sha256(Buffer.concat(paths.map((p) => fs.readFileSync(p))));
    results.push({ id: e.id, status: actual === e.source.upstreamHash ? 'ok' : 'fail', detail: actual === e.source.upstreamHash ? 'upstream hash matches' : `upstream hash is ${actual}` });
  }
  return results;
}

module.exports = { buildProvenanceReport, checkProvenance, verifyAgainstUpstream };
