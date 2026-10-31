'use strict';
// Provenance enforcement that does not depend on the model behaving: headers are re-injected, similarity decides whether
// derived code is still present, and the notice file carries the full license text of every library actually used.
const { provenanceHeader } = require('./sourceTransform');
const HEADER_RE = /^\s*\/\*!\s*\n\s*\* DevDrop component provenance[\s\S]*?\*\/\s*\n?/;
const norm = (code) => code.replace(HEADER_RE, '').split('\n').map((l) => l.trim()).filter((l) => l.length > 6 && !/^(import|export \{|\/\/|\/\*|\*)/.test(l));
function similarity(a, b) {
  const A = new Set(norm(a)); const B = new Set(norm(b)); if (!A.size || !B.size) return 0;
  let inter = 0; for (const l of A) if (B.has(l)) inter += 1;
  return +(inter / Math.min(A.size, B.size)).toFixed(3);
}
function changedLines(original, adapted) { const A = new Set(norm(original)); const B = norm(adapted); return B.filter((l) => !A.has(l)).length; }
// Returns {files, report}. Never throws; a component whose file is missing is reported, not fatal.
function enforce(files, plan, store) {
  const out = { ...files }; const report = [];
  for (const item of plan.items) {
    for (const id of item.componentIds) {
      const s = store.source(id); if (!s) continue;
      const rec = s.record;
      const targets = item.decision === 'combine' ? [`/components/ui/${require('./sourceTransform').pascal(item.sectionId)}Composite.jsx`] : [rec.storage.target];
      // combined components live in one file; find whichever file holds them
      const path = targets.find((t) => out[t]) || Object.keys(out).find((p) => out[p]?.code?.includes(`Component : ${id}`));
      if (!path || !out[path]) { report.push({ componentId: id, path: targets[0], present: false, headerInjected: false, similarity: 0, changedLines: 0, decision: item.decision }); continue; }
      let code = out[path].code; const sim = similarity(s.code, code);
      const derived = item.decision !== 'inspire' || sim >= 0.2;
      let injected = false;
      if (derived && !code.includes(`Component : ${id}`)) {
        const header = provenanceHeader(rec);
        code = header + code.replace(HEADER_RE, ''); injected = true; out[path] = { code };
      }
      report.push({ componentId: id, library: rec.library, path, present: true, headerInjected: injected, similarity: sim, changedLines: changedLines(s.code, code), decision: item.decision, derived, license: rec.license.spdx, commit: rec.source.commit, sourcePath: rec.source.path });
    }
  }
  return { files: out, report };
}
function noticeFile(report, store) {
  const used = report.filter((r) => r.present && r.derived);
  if (!used.length) return null;
  const libs = [...new Set(used.map((r) => r.library))];
  let md = '# Third-party notices\n\nThis project contains source code adapted from the open-source components listed below. Each adapted file starts with a provenance comment that must be kept.\n\n## Components\n\n';
  for (const r of used) md += `- **${r.componentId}** (${r.license}) adapted in \`${r.path}\` from github.com/${store.get(r.componentId).source.repository} @ ${r.commit.slice(0, 12)}, ${r.sourcePath}. Modified: decision "${r.decision}", ${r.changedLines} changed line(s), ${Math.round((1 - r.similarity) * 100)}% divergence from upstream.\n`;
  md += '\n## License texts\n';
  for (const lib of libs) { const text = store.licenseText(lib); const rec = used.find((u) => u.library === lib); md += `\n### ${lib} (${rec.license})\n\n\`\`\`\n${(text || '(license text unavailable)').trim()}\n\`\`\`\n`; }
  const restricted = used.map((u) => store.get(u.componentId)).filter((r) => r.license.restrictions);
  if (restricted.length) { md += '\n## Usage restrictions\n\n'; for (const r of restricted) md += `- ${r.componentId}: ${r.license.restrictions}\n`; }
  return md;
}
module.exports = { enforce, noticeFile, similarity, changedLines, HEADER_RE };
