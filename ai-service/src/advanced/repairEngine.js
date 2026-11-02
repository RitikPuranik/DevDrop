'use strict';
/**
 * Autonomous repair. Given quality issues it: groups them by affected files, gathers the relevant dependencies (what the
 * files import and who imports them), asks the Repair Agent for a root-cause fix, applies it (modify, CREATE new files,
 * delete orphans, add dependencies), and returns what changed. The caller re-runs the relevant checks to VERIFY.
 * It never regenerates the site, and it is not limited to the originally generated files.
 */
const { importGraph } = require('./quality/structural');

const isCode = (p) => /\.(jsx?|mjs)$/i.test(p);

/** Cluster issues that touch overlapping files so one agent call fixes related problems together. */
function clusterIssues(issues, byRoute = 6) {
  const clusters = [];
  for (const issue of issues) {
    const files = new Set(issue.files || []);
    const hit = clusters.find((c) => (files.size ? [...files].some((f) => c.files.has(f)) : c.noFiles && !files.size));
    if (hit) { hit.issues.push(issue); files.forEach((f) => hit.files.add(f)); } else clusters.push({ issues: [issue], files, noFiles: !files.size });
  }
  return clusters.slice(0, byRoute);
}

/** Files the agent may see and edit: the affected files, what they import, and who imports them (one hop each way). */
function relevantContext(store, affected, { maxFiles = 14 } = {}) {
  const files = store.toFiles();
  const graph = importGraph(files);
  const set = new Set(affected.filter((p) => p in files));
  for (const p of [...set]) for (const d of graph.get(p) || []) if (isCode(d)) set.add(d);
  for (const [p, deps] of graph) if ([...set].some((a) => deps.has(a)) && isCode(p)) set.add(p);
  for (const sys of ['/App.js']) if (files[sys] && affected.some((a) => /route|App/i.test(a))) set.add(sys);
  const ordered = [...affected.filter((p) => p in files), ...[...set].filter((p) => !affected.includes(p))].slice(0, Math.max(maxFiles, affected.length));
  return Object.fromEntries(ordered.map((p) => [p, files[p].code]));
}

async function repairCluster({ cluster, store, agent, manifest, spec, tokens, dependencies, mediaManifest, skills, phase, thinking, log = () => {} }) {
  const affected = [...cluster.files];
  const context = relevantContext(store, affected.length ? affected : ['/App.js']);
  const result = await agent.run({
    issues: cluster.issues.map(({ id, layer, severity, message, files, pageId }) => ({ id, layer, severity, message, files, pageId })),
    affectedFiles: affected, contextFiles: context, manifest, spec, tokens, dependencies, mediaManifest,
    skillContext: skills?.contextFor('debug', { terms: cluster.issues.map((i) => i.message) }) || '',
    ...(thinking ? { thinking } : {}),
  });
  const v = result.value || {};
  const applied = { modified: [], created: [], deleted: [], rejected: [], dependencies: {}, rootCause: v.rootCause || '' };

  const before = new Map();
  const snapshot = (p) => { if (!before.has(p)) before.set(p, store.has(p) ? store.get(p) : null); };
  for (const c of v.changes || []) {
    const p = store.normalizePath(c.path);
    if (!p) { applied.rejected.push({ path: c.path, reason: 'invalid path' }); continue; }
    // Edits are limited to the files the agent was shown (context), plus anything it is creating.
    if (!(p in context)) { applied.rejected.push({ path: p, reason: 'not part of the inspected context' }); continue; }
    snapshot(p);
    const w = store.write(p, c.code, { owner: 'repair', phase });
    if (w.ok) applied.modified.push(p); else applied.rejected.push({ path: p, reason: w.reason });
  }
  for (const c of (Array.isArray(v.newFiles) ? v.newFiles : [])) {
    const p = store.normalizePath(c.path);
    if (!p) { applied.rejected.push({ path: c.path, reason: 'invalid path' }); continue; }
    snapshot(p);
    const w = store.write(p, c.code, { owner: 'repair', phase });
    if (w.ok) (w.created ? applied.created : applied.modified).push(p); else applied.rejected.push({ path: p, reason: w.reason });
  }
  // Deletions only for files nothing imports any more (checked after the writes above).
  if ((v.deleteFiles || []).length) {
    const graph = importGraph(store.toFiles());
    for (const raw of v.deleteFiles) {
      const p = store.normalizePath(raw);
      if (!p || !store.has(p) || p === '/App.js') continue;
      const importers = [...graph].filter(([f, d]) => f !== p && d.has(p)).map(([f]) => f);
      if (importers.length) { applied.rejected.push({ path: p, reason: `still imported by ${importers[0]}` }); continue; }
      snapshot(p);
      if (store.remove(p)) applied.deleted.push(p);
    }
  }
  applied.dependencies = v.dependencies || {};
  applied.rollback = () => { for (const [p, code] of before) { if (code === null) store.remove(p); else store.write(p, code, { owner: 'repair', phase: `${phase}:rollback` }); } };
  applied.changed = applied.modified.length + applied.created.length + applied.deleted.length > 0;
  log(`repair: modified ${applied.modified.length}, created ${applied.created.length}, deleted ${applied.deleted.length}`);
  return applied;
}

/** Splitting an oversized or all-in-App file is a repair task like any other. */
function refactorIssues(issues) { return issues.filter((i) => i.refactor); }

module.exports = { clusterIssues, relevantContext, repairCluster, refactorIssues };
