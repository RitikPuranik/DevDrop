'use strict';
// Permission-aware selection. A component is selectable for a job only if it is in an eligible lifecycle state AND
// every distribution mode the job requires is explicitly "allowed". "conditional"/"unverified"/"denied" never pass
// unless the operator opts in to conditional (config.allowConditional) after legal review.
const { ELIGIBLE_LIFECYCLE, DISTRIBUTION_MODES } = require('./schema');

function normalizeModes(modes, fallback) {
  const list = (Array.isArray(modes) ? modes : fallback).filter((m) => DISTRIBUTION_MODES.includes(m));
  return [...new Set(list)];
}
function evaluate(record, requiredModes, { allowConditional = false } = {}) {
  const reasons = [];
  if (!ELIGIBLE_LIFECYCLE.includes(record.status)) reasons.push(`lifecycle "${record.status}" is not selectable`);
  if (!record.license?.verified) reasons.push('license is not verified at component level');
  for (const mode of requiredModes) {
    const p = record.distributionPermissions?.[mode] || 'unverified';
    if (p === 'allowed') continue;
    if (p === 'conditional' && allowConditional) continue;
    reasons.push(`${mode}: ${p}`);
  }
  return { eligible: reasons.length === 0, reasons };
}
module.exports = { evaluate, normalizeModes, DISTRIBUTION_MODES };
