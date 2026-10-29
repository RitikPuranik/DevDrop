'use strict';
// Deterministic skill selection: no model calls, no randomness, no clock. Equivalent inputs give identical output.
const { SkillLoadError } = require('./skillLoader');

// Per-stage ceilings for skill content (tokens). The effective budget is min(this, AI_SKILLS_MAX_CONTEXT_TOKENS).
const AGENT_BUDGETS = Object.freeze({
  requirements: 700, design: 5200, architecture: 1800, code: 2000, integration: 1200, debug: 1200, deployment: 700, edit: 2400,
});

class SkillIntegrityError extends Error {
  constructor(skillId, code) { super(`Essential skill "${skillId}" failed integrity checks (${code})`); this.name = 'SkillIntegrityError'; this.code = 'ESSENTIAL_SKILL_UNAVAILABLE'; this.skillId = skillId; }
}

const estimateTokens = (text) => Math.ceil(String(text || '').length / 4);

function resolveSkills(registry, request = {}, { strict = false, config: configOverride } = {}) {
  // A session may carry its own configuration; the cached default registry must not silently override it.
  const config = configOverride || registry.config;
  const framework = request.framework || 'react-vite';
  const trigger = request.trigger || 'website-generation';
  const agent = request.agent;
  const websiteType = request.websiteType || 'custom';
  const result = { request: { agent, framework, trigger, websiteType }, selected: [], excluded: [], budget: { total: 0, used: 0 } };

  if (!config.enabled) { result.excluded.push({ id: '*', reason: 'skills-disabled' }); return result; }
  const stageCeiling = AGENT_BUDGETS[agent];
  if (!stageCeiling) { result.excluded.push({ id: '*', reason: `unknown-agent:${String(agent).slice(0, 30)}` }); return result; }
  const total = Math.min(config.maxContextTokens, stageCeiling);
  result.budget.total = total;

  // 1. Eligibility filters, in a fixed order so the recorded reason is stable.
  const candidates = [];
  for (const entry of registry.list()) {
    const skip = (reason) => result.excluded.push({ id: entry.id, reason });
    if (!entry.supportedFrameworks.includes(framework)) skip(`framework-unsupported:${framework}`);
    else if (!entry.compatibleAgents.includes(agent)) skip('agent-not-targeted');
    else if (!entry.triggers.includes(trigger)) skip(`trigger-not-matched:${trigger}`);
    else if (entry.websiteTypes !== '*' && !entry.websiteTypes.includes(websiteType)) skip(`website-type-not-matched:${websiteType}`);
    else if (!entry.enabled) skip('disabled');
    else if (config.disabledIds.includes(entry.id)) skip('disabled-by-config');
    else if (entry.origin === 'third-party' && !config.allowThirdParty) skip('third-party-disabled');
    else if (entry.license.verificationStatus === 'declared' && !config.allowUnverifiedLicenses) skip('license-unverified');
    else candidates.push(entry);
  }

  // 2. Deterministic precedence, then conflict resolution (higher precedence wins; ties broken by id).
  candidates.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const kept = [];
  for (const entry of candidates) {
    const clash = kept.find((k) => (k.conflictsWith || []).includes(entry.id) || (entry.conflictsWith || []).includes(k.id));
    if (clash) result.excluded.push({ id: entry.id, reason: `conflicts-with:${clash.id}` });
    else kept.push(entry);
  }

  // 3. Load (hash-verified) and allocate budgets in precedence order. Optional skills degrade gracefully.
  let remaining = total;
  for (const entry of kept) {
    let loaded;
    try {
      loaded = registry.loadContent(entry.id);
    } catch (error) {
      const code = error instanceof SkillLoadError ? error.code : 'READ_FAILED';
      if (entry.essential && strict) throw new SkillIntegrityError(entry.id, code);
      result.excluded.push({ id: entry.id, reason: `unavailable:${code}` });
      continue;
    }
    const full = estimateTokens(loaded.text);
    const allocation = Math.min(entry.maxContextTokens, full, remaining);
    if (allocation < Math.min(150, full)) { result.excluded.push({ id: entry.id, reason: 'budget-exhausted' }); continue; }
    remaining -= allocation;
    result.selected.push({
      id: entry.id, version: entry.version, origin: entry.origin, priority: entry.priority,
      allocationTokens: allocation, fullTokens: full, filterFrameworkConflicts: entry.filterFrameworkConflicts !== false,
      reason: `${entry.category} skill targeting ${agent} for ${trigger}`,
    });
  }
  result.budget.used = total - remaining;
  return result;
}

module.exports = { resolveSkills, estimateTokens, AGENT_BUDGETS, SkillIntegrityError };
