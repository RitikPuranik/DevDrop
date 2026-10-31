'use strict';
const truthy = (v, f) => (v === undefined || v === null || String(v).trim() === '' ? f : /^(1|true|yes|on)$/i.test(String(v).trim()));
const int = (v, f) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : f; };
const { DISTRIBUTION_MODES } = require('./schema');
function readConfig(env = process.env) {
  const modes = String(env.AI_COMPONENTS_DISTRIBUTION_MODES || 'deployedWebsites,sourceCodeExport').split(',').map((s) => s.trim()).filter((m) => DISTRIBUTION_MODES.includes(m));
  return Object.freeze({
    enabled: truthy(env.AI_COMPONENTS_ENABLED, true),
    // Every mode listed here must be "allowed" for a component to be selectable. Add templateResale for marketplace listings.
    requiredModes: Object.freeze(modes.length ? modes : ['deployedWebsites', 'sourceCodeExport']),
    // "conditional" permissions (e.g. Commons Clause source export) are only selectable after a human opts in.
    allowConditional: truthy(env.AI_COMPONENTS_ALLOW_CONDITIONAL, false),
    maxComponents: int(env.AI_COMPONENTS_MAX_PER_SITE, 6),
    maxNewDependencies: int(env.AI_COMPONENTS_MAX_NEW_DEPS, 6),
    candidatesPerSection: int(env.AI_COMPONENTS_CANDIDATES_PER_SECTION, 4),
    verifyIntegrity: truthy(env.AI_COMPONENTS_VERIFY_INTEGRITY, true),
  });
}
module.exports = { readConfig };
