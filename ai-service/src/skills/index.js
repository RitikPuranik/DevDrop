'use strict';
// Public surface of the skill system. Everything the pipeline calls here is failure-safe: an error in skill
// resolution degrades to "no skill context" (the pre-existing prompts) and never fails a generation.
const { readConfig } = require('./config');
const { getDefaultRegistry, createRegistry, UnknownSkillError, SkillVersionError } = require('./registry');
const { resolveSkills, estimateTokens, AGENT_BUDGETS, SkillIntegrityError } = require('./skillResolver');
const { buildSkillContext, PLATFORM_RULES } = require('./skillContextBuilder');
const { buildProvenanceReport, checkProvenance, verifyAgainstUpstream } = require('./skillProvenance');
const { validateManifest, SkillManifestError } = require('./skillManifest');
const { SkillLoadError } = require('./skillLoader');

const health = { checked: false, ok: true, errors: [] };

// Validates the manifest, license notices and every enabled skill's pinned hash. Call once at process start.
function startupCheck({ logger = console, registry } = {}) {
  const errors = [];
  const warnings = [];
  const config = readConfig();
  let reg = registry;
  try {
    if (!config.enabled) { logger.log?.('[SKILLS] disabled (AI_SKILLS_ENABLED=false)'); health.checked = true; health.ok = true; return { ok: true, enabled: false, errors, warnings, skills: [] }; }
    reg = reg || getDefaultRegistry({ reload: true, config });
    errors.push(...checkProvenance(reg));
    for (const entry of reg.list({ enabledOnly: true })) {
      try { reg.loadContent(entry.id); }
      catch (error) {
        const message = `${entry.id}: ${error.code || 'LOAD_FAILED'}`;
        (entry.essential ? errors : warnings).push(message);
      }
    }
  } catch (error) {
    errors.push(error instanceof SkillManifestError ? error.message : `skill system failed to initialize (${error.code || error.name})`);
  }
  health.checked = true;
  health.ok = errors.length === 0;
  health.errors = errors;
  const skills = reg ? reg.list({ enabledOnly: true }).map((e) => `${e.id}@${e.version}`) : [];
  if (errors.length) logger.error?.(`[SKILLS] startup validation FAILED; skill guidance is disabled until fixed: ${errors.join(' | ')}`);
  else logger.log?.(`[SKILLS] ready: ${skills.length} skills enabled${warnings.length ? ` (optional skills unavailable: ${warnings.join(', ')})` : ''}`);
  return { ok: errors.length === 0, enabled: true, errors, warnings, skills };
}

function withSkillContext(system, skillContext) {
  return skillContext ? `${system}${skillContext}` : system;
}

/**
 * One session per job. contextFor(agent, { terms }) returns the text to append to that agent's system prompt
 * ('' when nothing applies). Results are memoized per (agent, terms) so repeated calls are free.
 */
function createSkillSession({
  websiteType = 'custom', framework = 'react-vite', trigger = 'website-generation', terms = [],
  registry, config, logger = console,
} = {}) {
  const cfg = config || readConfig();
  const usage = [];
  const memo = new Map();
  let baseTerms = [websiteType, ...terms];
  let reg = registry || null;
  let disabled = !cfg.enabled || (health.checked && !health.ok);

  function contextFor(agent, { terms: extra = [] } = {}) {
    if (disabled) return '';
    const key = `${agent}|${[...extra].join(',')}|${baseTerms.join(',')}`;
    if (memo.has(key)) return memo.get(key);
    let text = '';
    try {
      reg = reg || getDefaultRegistry({ config: cfg });
      const resolution = resolveSkills(reg, { agent, framework, trigger, websiteType }, { strict: true, config: cfg });
      const built = buildSkillContext(reg, resolution, { terms: [...baseTerms, ...extra] });
      text = built.text;
      const record = { agent, skills: built.skills.map((s) => s.id), skillTokens: built.usedTokens, platformTokens: built.platformTokens, budget: resolution.budget.total };
      usage.push(record);
      logger.log?.(`[SKILLS] ${agent}: ${record.skills.join(',') || 'none'} (~${record.skillTokens + record.platformTokens} tokens)`);
    } catch (error) {
      // Log the failure class only; never skill content or job data.
      logger.warn?.(`[SKILLS] ${agent}: skill context unavailable (${error.code || error.name}); continuing without it`);
      if (error instanceof SkillIntegrityError) disabled = true;
    }
    memo.set(key, text);
    return text;
  }

  return {
    contextFor,
    addTerms: (more) => { baseTerms = [...baseTerms, ...(more || [])]; },
    usage: () => usage.map((u) => ({ ...u })),
    report: () => ({ enabled: !disabled, framework, trigger, stages: usage.map((u) => ({ ...u })), totalSkillTokens: usage.reduce((n, u) => n + u.skillTokens, 0) }),
  };
}

module.exports = {
  createSkillSession, withSkillContext, startupCheck, health,
  readConfig, getDefaultRegistry, createRegistry, resolveSkills, buildSkillContext, estimateTokens,
  buildProvenanceReport, checkProvenance, verifyAgainstUpstream, validateManifest,
  AGENT_BUDGETS, PLATFORM_RULES, UnknownSkillError, SkillVersionError, SkillLoadError, SkillIntegrityError, SkillManifestError,
};
