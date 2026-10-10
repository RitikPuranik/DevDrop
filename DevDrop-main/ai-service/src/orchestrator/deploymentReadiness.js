const deploymentReadinessAgent = require('../agents/deploymentReadiness.agent');
const { validateGeneratedFiles } = require('../validators/generatedFiles.validator');
const buildValidator = require('../validators/build.validator');
const { applyProductionParity, pinDependencies, scanProductionRisks } = require('../utils/productionParity');
const { stage: runStage } = require('./stageRunner');

const MAX_READINESS_RETRIES = Math.max(0, Number.parseInt(process.env.MAX_READINESS_RETRIES || '2', 10) || 0);
const normalizePath = (p) => (typeof p === 'string' && p.trim() ? (p.trim().startsWith('/') ? p.trim() : `/${p.trim()}`) : p);

/**
 * Last stage of generate / edit / debug. Input files already build and pass the
 * runtime smoke test. This stage:
 *   1. applies deterministic preview->Vercel parity fixes,
 *   2. asks the Deployment Readiness agent to fix sandbox-only code,
 *   3. freezes dependencies to the validated versions.
 * It is best-effort and NEVER makes things worse: any change is re-validated, and
 * if that fails the previously validated files are kept. It never throws.
 */
async function ensureProductionReady({ files, dependencies = {}, mediaManifest = [], resolvedDependencies = null }, meta = [], onStage) {
  const report = { applied: [], findings: [], fixed: 0, unresolved: [], pinned: 0, skipped: null };
  let current = { ...(files || {}) };
  let resolved = resolvedDependencies;
  try {
    const parity = applyProductionParity(current, dependencies);
    if (parity.applied.length) { current = parity.files; report.applied = parity.applied; }

    let findings = scanProductionRisks(current);
    report.findings = findings.map(({ id, path, line }) => ({ id, path, line }));
    let actionable = findings.filter((f) => f.fixBy === 'agent');

    for (let attempt = 0; attempt < MAX_READINESS_RETRIES && actionable.length; attempt += 1) {
      const affected = new Set(actionable.map((f) => f.path));
      const sentFiles = {};
      for (const p of affected) sentFiles[p] = current[p]?.code || '';
      const result = await runStage(`deployment-readiness:${attempt + 1}`, () => deploymentReadinessAgent.run({ findings: actionable, files: sentFiles, mediaManifest, dependencies }), meta, onStage);
      const changes = (result.value?.changes || []).filter((c) => c.path && typeof c.code === 'string' && c.code.trim());
      if (!changes.length) break;

      const candidate = { ...current };
      for (const c of changes) candidate[normalizePath(c.path)] = { code: c.code };
      if (validateGeneratedFiles(candidate).length) break;
      const build = await runStage(`deployment-readiness-build:${attempt + 1}`, () => buildValidator.run({ files: candidate, dependencies }), meta, onStage);
      if (!build.success) break;

      current = candidate;
      resolved = build.resolvedDependencies || resolved;
      const next = scanProductionRisks(current).filter((f) => f.fixBy === 'agent');
      report.fixed += Math.max(0, actionable.length - next.length);
      actionable = next;
    }
    report.unresolved = actionable.map(({ id, path, line, message }) => ({ id, path, line, message }));

    const pinned = pinDependencies(current, resolved);
    current = pinned.files;
    report.pinned = pinned.pinned;
  } catch (error) {
    console.warn('[DEPLOYMENT READINESS] skipped after error; keeping validated files:', error.message);
    report.skipped = String(error.message || error).slice(0, 300);
    return { files: current, dependencies, report };
  }
  return { files: current, dependencies, report };
}

module.exports = { ensureProductionReady };
