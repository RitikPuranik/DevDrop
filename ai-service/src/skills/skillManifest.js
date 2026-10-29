'use strict';
const CATEGORIES = ['design', 'requirements', 'engineering', 'quality', 'security'];
const ORIGINS = ['third-party', 'devdrop'];
const FRAMEWORKS = ['react-vite'];
const AGENTS = ['requirements', 'design', 'architecture', 'code', 'integration', 'debug', 'deployment', 'edit'];
const TRIGGERS = ['website-generation', 'incremental-edit', 'debug-repair'];
const LICENSE_STATUSES = ['verified', 'declared', 'internal', 'pending-review', 'rejected'];
// 'declared' = upstream states a license but the notice/provenance is incomplete. Loadable only with AI_SKILLS_ALLOW_UNVERIFIED_LICENSES=true.
const LOADABLE_STATUSES = { 'third-party': ['verified', 'declared'], devdrop: ['internal'] };
const SCHEMA_VERSION = 1;

const ENTRY_KEYS = new Set([
  'id', 'name', 'description', 'version', 'category', 'origin', 'enabled', 'essential', 'source', 'license',
  'supportedFrameworks', 'compatibleAgents', 'triggers', 'websiteTypes', 'priority', 'maxContextTokens',
  'contentPath', 'contentHash', 'maxBytes', 'modifications', 'conflictsWith', 'filterFrameworkConflicts', 'notes',
]);
const SOURCE_KEYS = new Set(['repository', 'path', 'files', 'commit', 'upstreamHash', 'checkedAt']);
const LICENSE_KEYS = new Set(['identifier', 'verificationStatus', 'noticePath', 'copyright']);

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const SHA1_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NOTICE_RE = /^licenses\/third-party\/[a-z0-9-]+$/;
const PLACEHOLDER_RE = /^(?:0+|f+|x+|todo|tbd|placeholder|verified_commit_sha|verified_sha256)$/i;

class SkillManifestError extends Error {
  constructor(errors) {
    super(`Invalid skill manifest: ${errors.slice(0, 12).join('; ')}${errors.length > 12 ? `; (+${errors.length - 12} more)` : ''}`);
    this.name = 'SkillManifestError';
    this.code = 'MANIFEST_INVALID';
    this.errors = errors;
  }
}

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isStringArray = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string' && s.trim());

function validateManifestEntry(entry) {
  const errors = [];
  const where = isObject(entry) && typeof entry.id === 'string' ? entry.id : '(entry)';
  const err = (msg) => errors.push(`${where}: ${msg}`);
  if (!isObject(entry)) return [`${where}: must be an object`];

  for (const key of Object.keys(entry)) if (!ENTRY_KEYS.has(key)) err(`unknown field "${key}"`);
  if (typeof entry.id !== 'string' || !ID_RE.test(entry.id) || entry.id.length > 64) err('id must be a lowercase-kebab identifier (max 64 chars)');
  if (typeof entry.name !== 'string' || !entry.name.trim()) err('name is required');
  if (typeof entry.version !== 'string' || !SEMVER_RE.test(entry.version)) err('version must be semver x.y.z');
  if (!CATEGORIES.includes(entry.category)) err(`category must be one of ${CATEGORIES.join(', ')}`);
  if (!ORIGINS.includes(entry.origin)) err(`origin must be one of ${ORIGINS.join(', ')}`);
  if (typeof entry.enabled !== 'boolean') err('enabled must be a boolean');
  if (entry.essential !== undefined && typeof entry.essential !== 'boolean') err('essential must be a boolean');

  if (!isStringArray(entry.supportedFrameworks) || !entry.supportedFrameworks.length || !entry.supportedFrameworks.every((f) => FRAMEWORKS.includes(f))) err(`supportedFrameworks must be a non-empty subset of ${FRAMEWORKS.join(', ')}`);
  if (!isStringArray(entry.compatibleAgents) || !entry.compatibleAgents.length || !entry.compatibleAgents.every((a) => AGENTS.includes(a))) err(`compatibleAgents must be a non-empty subset of ${AGENTS.join(', ')}`);
  if (!isStringArray(entry.triggers) || !entry.triggers.length || !entry.triggers.every((t) => TRIGGERS.includes(t))) err(`triggers must be a non-empty subset of ${TRIGGERS.join(', ')}`);
  if (entry.websiteTypes !== '*' && !isStringArray(entry.websiteTypes)) err('websiteTypes must be "*" or an array of website type ids');
  if (!Number.isInteger(entry.priority) || entry.priority < 0 || entry.priority > 1000) err('priority must be an integer 0-1000');
  if (!Number.isInteger(entry.maxContextTokens) || entry.maxContextTokens < 100 || entry.maxContextTokens > 8000) err('maxContextTokens must be an integer 100-8000');
  if (entry.conflictsWith !== undefined && !isStringArray(entry.conflictsWith)) err('conflictsWith must be an array of skill ids');
  if (entry.modifications !== undefined && !Array.isArray(entry.modifications)) err('modifications must be an array');
  if (entry.filterFrameworkConflicts !== undefined && typeof entry.filterFrameworkConflicts !== 'boolean') err('filterFrameworkConflicts must be a boolean');
  if (entry.filterFrameworkConflicts === false && entry.origin !== 'devdrop') err('only DevDrop-authored skills may opt out of framework-conflict filtering');
  if (entry.maxBytes !== undefined && (!Number.isInteger(entry.maxBytes) || entry.maxBytes < 1024 || entry.maxBytes > 160 * 1024)) err('maxBytes must be an integer 1024-163840');
  if (typeof entry.contentPath !== 'string' || !entry.contentPath) err('contentPath is required');
  if (typeof entry.contentHash !== 'string' || !SHA256_RE.test(entry.contentHash) || PLACEHOLDER_RE.test(entry.contentHash)) err('contentHash must be a real sha256 hex digest');

  const lic = entry.license;
  if (!isObject(lic)) err('license metadata is required');
  else {
    for (const key of Object.keys(lic)) if (!LICENSE_KEYS.has(key)) err(`unknown license field "${key}"`);
    if (typeof lic.identifier !== 'string' || !lic.identifier.trim()) err('license.identifier is required');
    if (!LICENSE_STATUSES.includes(lic.verificationStatus)) err(`license.verificationStatus must be one of ${LICENSE_STATUSES.join(', ')}`);
    else if (ORIGINS.includes(entry.origin) && !LOADABLE_STATUSES[entry.origin].includes(lic.verificationStatus)) err(`license status "${lic.verificationStatus}" is not loadable for ${entry.origin} skills`);
  }

  if (entry.origin === 'third-party') {
    const src = entry.source;
    if (!isObject(src)) err('third-party skills require source provenance');
    else {
      for (const key of Object.keys(src)) if (!SOURCE_KEYS.has(key)) err(`unknown source field "${key}"`);
      if (typeof src.repository !== 'string' || !REPO_RE.test(src.repository)) err('source.repository must be owner/name');
      if (typeof src.path !== 'string' || !src.path || src.path.includes('..')) err('source.path is required');
      if (src.files !== undefined && (!isStringArray(src.files) || src.files.some((f) => f.includes('..')))) err('source.files must be an array of upstream paths');
      if (typeof src.commit !== 'string' || !SHA1_RE.test(src.commit) || PLACEHOLDER_RE.test(src.commit)) err('source.commit must be a real 40-char commit SHA');
      if (typeof src.upstreamHash !== 'string' || !SHA256_RE.test(src.upstreamHash)) err('source.upstreamHash must be a sha256 hex digest');
      if (typeof src.checkedAt !== 'string' || !DATE_RE.test(src.checkedAt)) err('source.checkedAt must be YYYY-MM-DD');
    }
    if (isObject(lic) && (typeof lic.noticePath !== 'string' || !NOTICE_RE.test(lic.noticePath))) err('license.noticePath must be licenses/third-party/<id>');
    if (isObject(lic) && (typeof lic.copyright !== 'string' || !lic.copyright.trim()) && !/apache/i.test(lic.identifier || '')) err('license.copyright is required for third-party skills');
  } else if (entry.origin === 'devdrop') {
    if (entry.source !== null && entry.source !== undefined) err('DevDrop-authored skills must have source: null');
  }
  return errors;
}

function validateManifest(manifest) {
  const errors = [];
  if (!isObject(manifest)) throw new SkillManifestError(['manifest must be an object']);
  // Backward compatible: a missing schemaVersion is treated as 1; unknown newer versions are refused.
  const version = manifest.schemaVersion === undefined ? 1 : manifest.schemaVersion;
  if (version !== SCHEMA_VERSION) errors.push(`unsupported schemaVersion ${version}`);
  if (!Array.isArray(manifest.skills)) errors.push('skills must be an array');
  const seen = new Set();
  for (const entry of Array.isArray(manifest.skills) ? manifest.skills : []) {
    errors.push(...validateManifestEntry(entry));
    if (isObject(entry) && typeof entry.id === 'string') {
      if (seen.has(entry.id)) errors.push(`${entry.id}: duplicate skill id`);
      seen.add(entry.id);
    }
  }
  for (const entry of Array.isArray(manifest.skills) ? manifest.skills : []) {
    for (const other of (isObject(entry) && Array.isArray(entry.conflictsWith)) ? entry.conflictsWith : []) {
      if (!seen.has(other)) errors.push(`${entry.id}: conflictsWith references unknown skill "${other}"`);
    }
  }
  if (manifest.rejectedCandidates !== undefined && !Array.isArray(manifest.rejectedCandidates)) errors.push('rejectedCandidates must be an array');
  if (errors.length) throw new SkillManifestError(errors);
  return manifest;
}

module.exports = {
  SkillManifestError, validateManifest, validateManifestEntry,
  CATEGORIES, ORIGINS, FRAMEWORKS, AGENTS, TRIGGERS, LICENSE_STATUSES, SCHEMA_VERSION,
};
