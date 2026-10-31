'use strict';
// Resolves the npm dependencies a set of components needs against the vetted policy and the project's existing
// dependencies. Never invents a package or version; unknown packages make the component unusable for this job.
const policy = require('./dependencyPolicy.json');

function canonicalName(name) { return policy.aliases[name] || name; }
function resolve(components, existing = {}, { maxHeavy = 1, maxNewDependencies = 6 } = {}) {
  const added = {};
  const families = {};
  const rejected = [];
  const accepted = [];
  let heavy = 0;
  const have = { ...existing };
  for (const c of components) {
    const need = {};
    let ok = true;
    for (const raw of Object.keys(c.dependencies || {})) {
      const name = canonicalName(raw);
      if (policy.alwaysAvailable.includes(name)) continue;
      const entry = policy.packages[name];
      if (!entry) { rejected.push({ componentId: c.componentId, reason: `dependency "${raw}" is not on the vetted list` }); ok = false; break; }
      if (!have[name] && !added[name] && !need[name]) {
        // one engine per family: reuse what is already present instead of adding a competitor
        const clash = Object.keys({ ...have, ...added, ...need }).find((d) => d !== name && policy.packages[d] && policy.packages[d].family === entry.family && ['animation-engine', 'carousel', 'charts'].includes(entry.family));
        if (clash) { rejected.push({ componentId: c.componentId, reason: `would duplicate the ${entry.family} already provided by "${clash}"` }); ok = false; break; }
        need[name] = entry;
      }
    }
    if (!ok) continue;
    const newHeavy = Object.values(need).filter((e) => e.weight === 'heavy').length;
    if (heavy + newHeavy > maxHeavy) { rejected.push({ componentId: c.componentId, reason: 'heavy dependency budget exceeded' }); continue; }
    if (Object.keys(added).length + Object.keys(need).length > maxNewDependencies) { rejected.push({ componentId: c.componentId, reason: 'new dependency budget exceeded' }); continue; }
    heavy += newHeavy;
    for (const [name, e] of Object.entries(need)) added[name] = e.range;
    accepted.push(c.componentId);
  }
  return { added, accepted, rejected };
}
module.exports = { resolve, canonicalName, policy };
