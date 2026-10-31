'use strict';
// Skill-system configuration. Every flag has a secure default; nothing here enables network access.
const truthy = (value, fallback) => {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
};
const positiveInt = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const list = (value) => String(value || '').split(',').map((s) => s.trim()).filter(Boolean);

function readConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  return Object.freeze({
    // Master switch. When false the pipeline runs exactly as it did before the skill system existed.
    enabled: truthy(env.AI_SKILLS_ENABLED, true),
    // Governs bundled, hash-pinned, license-verified third-party-derived skills. There is no runtime download path at all.
    allowThirdParty: truthy(env.AI_SKILLS_ALLOW_THIRD_PARTY, true),
    // Skills whose upstream license is declared but not fully verifiable (see docs/SKILL_LICENSES.md). Off unless explicitly enabled.
    allowUnverifiedLicenses: truthy(env.AI_SKILLS_ALLOW_UNVERIFIED_LICENSES, false),
    // Integrity checking cannot be turned off in production.
    verifyHashes: production ? true : truthy(env.AI_SKILLS_VERIFY_HASHES, true),
    maxContextTokens: positiveInt(env.AI_SKILLS_MAX_CONTEXT_TOKENS, 6000),
    disabledIds: Object.freeze(list(env.AI_SKILLS_DISABLED_IDS)),
    // Deterministic post-build review (no model calls). Findings are reported; they only trigger repair when enforce is on.
    qualityReview: truthy(env.AI_SKILLS_QUALITY_REVIEW, true),
    qualityEnforce: truthy(env.AI_SKILLS_QUALITY_ENFORCE, false),
    // Buttons/links/forms that do nothing are functional defects, not style: send them through the repair loop by default.
    fixDeadControls: truthy(env.AI_SKILLS_FIX_DEAD_CONTROLS, true),
  });
}

module.exports = { readConfig };
