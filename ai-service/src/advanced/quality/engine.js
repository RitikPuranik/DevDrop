'use strict';
/**
 * Website Quality Engine. Layers, cheapest first:
 *   structural (static)  ->  build (npm install + vite build + smoke test)  ->  browser (functional + responsive + visual signals)
 *   -> visual QA (one multimodal review of real screenshots).
 * A green build alone never means "done": the site is only complete when no BLOCKING issue remains in any layer.
 */
const { runStructuralChecks } = require('./structural');
const { probeDist, evaluateProbe } = require('./browserProbe');
const { resolveDependencies } = require('../dependencies');
const { extractRoutes, matches } = require('../routes');
const { settings } = require('../config');

const LAYERS = ['structural', 'build', 'functional', 'responsive', 'visual'];
const filesMentioned = (text, known) => known.filter((p) => String(text).includes(p.slice(1)) || String(text).includes(p)).slice(0, 6);
let n = 0;

async function runQualityEngine({ files, manifest, pageFileIds, dependencies = {}, build, includeVisual = false, visualAgent = null, skills = null, spec = {}, onPhase = () => {}, probe = probeDist }) {
  const cfg = settings();
  const result = { issues: [], layers: Object.fromEntries(LAYERS.map((l) => [l, { status: 'pending', count: 0 }])), dependencies, buildResult: null, probeSkipped: null, passed: false };
  const finish = () => {
    for (const l of LAYERS) {
      const own = result.issues.filter((i) => i.layer === l);
      result.layers[l].count = own.length;
      if (result.layers[l].status === 'pending' || result.layers[l].status === 'running') result.layers[l].status = own.some((i) => i.blocking) ? 'failed' : own.length ? 'warnings' : 'passed';
      else if (result.layers[l].status === 'passed' && own.length) result.layers[l].status = own.some((i) => i.blocking) ? 'failed' : 'warnings';
    }
    result.passed = !result.issues.some((i) => i.blocking);
    return result;
  };

  // --- structural
  result.layers.structural.status = 'running'; onPhase('structural');
  const dep = resolveDependencies(files, dependencies);
  result.dependencies = dep.dependencies; // vetted packages are added deterministically
  result.issues.push(...runStructuralChecks({ files, manifest, dependencies: dep.dependencies, pageFileIds }));
  result.layers.structural.status = result.issues.some((i) => i.blocking) ? 'failed' : 'passed';
  if (result.issues.some((i) => i.layer === 'structural' && i.blocking)) {
    for (const l of ['build', 'functional', 'responsive', 'visual']) result.layers[l].status = 'skipped';
    return finish();
  }

  // --- build (+ browser probe on the built output)
  result.layers.build.status = 'running'; onPhase('build');
  const flat = Object.fromEntries(Object.entries(files).map(([p, f]) => [p, typeof f === 'string' ? { code: f } : f]));
  const paths = Object.keys(flat);
  const staticRoutes = manifest.pages.filter((p) => !p.dynamic);
  const patterns = extractRoutes(flat);
  const wantShots = includeVisual && cfg.visualQa && Boolean(visualAgent);
  let probeRaw = null;
  const afterBuild = cfg.browserQa ? async (dist) => {
    onPhase('browser');
    const first = await probe(dist, { routes: staticRoutes.map((p) => ({ id: p.id, path: p.path })), viewports: cfg.viewports, collectShots: wantShots });
    if (first && !first.skipped) {
      // dynamic pages: test the first real link that matches each pattern found on the static pages
      const extra = [];
      for (const dp of manifest.pages.filter((p) => p.dynamic)) {
        const concrete = (first.discovered || []).find((h) => matches([dp.path], h));
        if (concrete) extra.push({ id: dp.id, path: concrete });
      }
      if (extra.length) { const more = await probe(dist, { routes: extra, viewports: cfg.viewports.filter((v) => v.id !== 'tablet'), collectShots: false }); first.pages.push(...(more.pages || [])); first.forms.push(...(more.forms || [])); }
    }
    return first;
  } : null;
  const built = await build({ files: flat, dependencies: result.dependencies, afterBuild });
  result.buildResult = built;
  if (!built.success) {
    const text = (built.errors || []).join('\n');
    result.issues.push({ key: `build-failed:${++n}`, id: 'build-failed', layer: 'build', severity: 'error', blocking: true, message: text.slice(-3500) || 'The project does not build.', files: filesMentioned(text, paths) });
    result.layers.build.status = 'failed';
    for (const l of ['functional', 'responsive', 'visual']) result.layers[l].status = 'skipped';
    return finish();
  }
  result.layers.build.status = 'passed';
  probeRaw = built.afterBuildResult;
  if (!cfg.browserQa) result.probeSkipped = 'browser QA disabled';
  else if (!probeRaw || probeRaw.skipped || probeRaw.error) result.probeSkipped = probeRaw?.reason || probeRaw?.error || 'browser unavailable';

  if (probeRaw && !probeRaw.skipped && !probeRaw.error) {
    const fileFor = (id) => Object.entries(pageFileIds).filter(([p, pid]) => pid === id && p in flat).map(([p]) => p);
    const evaluated = evaluateProbe(probeRaw, { manifest, fileFor, matchesRoute: (h) => matches(patterns, h) });
    result.issues.push(...evaluated);
  } else {
    for (const l of ['functional', 'responsive']) result.layers[l].status = result.layers[l].status === 'pending' ? 'skipped' : result.layers[l].status;
  }

  // --- visual QA: one multimodal call, only on a site that already works
  if (wantShots && probeRaw?.shots?.length && !result.issues.some((i) => i.blocking)) {
    result.layers.visual.status = 'running'; onPhase('visual');
    try {
      const pagesSeen = [...new Set(probeRaw.shots.map((s) => s.pageId))].slice(0, cfg.visualQaMaxPages);
      const shots = probeRaw.shots.filter((s) => pagesSeen.includes(s.pageId)).map((s) => ({ assetId: `${s.pageId}:${s.viewport}`, fileName: `${s.pageId}-${s.viewport}.jpg`, mimeType: s.mimeType, data: s.data, label: `SCREENSHOT page=${s.pageId} viewport=${s.viewport}` }));
      const review = await visualAgent.run({ spec, manifest, screenshots: shots, skillContext: skills?.contextFor('quality', {}) || '' });
      for (const v of review.value?.issues || []) {
        const sev = v.severity === 'high' ? 'error' : 'warning';
        if (v.severity === 'low') continue;
        result.issues.push({ key: `visual-qa:${++n}`, id: 'visual-qa', layer: v.category === 'layout' || v.category === 'spacing' ? 'responsive' : 'visual', severity: sev, blocking: false, message: `[${v.pageId || 'site'} ${v.viewport || ''}] ${v.message}`.slice(0, 400), files: (Array.isArray(v.likelyFiles) ? v.likelyFiles : []).filter((p) => p in flat).slice(0, 4), pageId: v.pageId });
      }
    } catch (e) { if (e?.cancelled || e?.code === 'BUDGET_EXCEEDED') throw e; }
  }
  return finish();
}

module.exports = { runQualityEngine, LAYERS };
