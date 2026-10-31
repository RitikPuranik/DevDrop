'use strict';
// Component Intelligence: record schema. A record describes ONE component (not a library) together with the
// provenance needed to decide, per distribution scenario, whether DevDrop may ship it.
const LIFECYCLE = ['discovered', 'pending-verification', 'verified', 'restricted', 'rejected', 'deprecated'];
// Only these lifecycle states can ever be offered to a generation; per-mode permissions then decide.
const ELIGIBLE_LIFECYCLE = ['verified', 'restricted'];
// The five distribution scenarios are evaluated separately (they are legally different).
const DISTRIBUTION_MODES = ['devdropInternal', 'deployedWebsites', 'sourceCodeExport', 'templateResale', 'componentRedistribution'];
const PERMISSION_VALUES = ['allowed', 'conditional', 'denied', 'unverified'];
const FRAMEWORKS = ['react'];
const STYLING = ['tailwind', 'css', 'inline', 'css-modules'];
const ID_RE = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const SHA1_RE = /^[0-9a-f]{40}$/;
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isStrArr = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string' && s.trim());

function validateRecord(r) {
  const errors = [];
  const where = isObj(r) && typeof r.componentId === 'string' ? r.componentId : '(record)';
  const err = (m) => errors.push(`${where}: ${m}`);
  if (!isObj(r)) return [`${where}: must be an object`];
  if (!ID_RE.test(r.componentId || '')) err('componentId must be "library/component-name" (lowercase kebab)');
  if (!r.library || !r.name || !r.category) err('library, name and category are required');
  if (typeof r.description !== 'string' || r.description.length < 8) err('description is required');
  if (!LIFECYCLE.includes(r.status)) err(`status must be one of ${LIFECYCLE.join(', ')}`);
  if (!isStrArr(r.capabilities)) err('capabilities must be a string array');
  if (!isStrArr(r.designCharacteristics)) err('designCharacteristics must be a string array');
  if (!FRAMEWORKS.includes(r.framework)) err(`framework must be one of ${FRAMEWORKS.join(', ')}`);
  if (!Array.isArray(r.styling) || !r.styling.every((s) => STYLING.includes(s))) err('styling invalid');
  if (!isObj(r.dependencies)) err('dependencies must be an object name -> range');
  if (!isObj(r.source)) err('source is required');
  else {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(r.source.repository || '')) err('source.repository must be owner/repo');
    if (!SHA1_RE.test(r.source.commit || '')) err('source.commit must be a 40-char commit');
    if (!r.source.path) err('source.path is required');
    if (!SHA256_RE.test(r.source.upstreamSha256 || '')) err('source.upstreamSha256 must be sha256');
  }
  if (!isObj(r.storage) || !r.storage.entry || !SHA256_RE.test(r.storage.sha256 || '')) err('storage.entry and storage.sha256 are required');
  if (!isObj(r.license)) err('license is required');
  else {
    if (typeof r.license.verified !== 'boolean') err('license.verified must be boolean');
    if (r.license.verified && (!r.license.spdx || !r.license.licenseSource || !SHA256_RE.test(r.license.licenseSource.sha256 || ''))) err('verified license needs spdx and licenseSource.sha256');
    if (r.license.verified && !r.license.copyright) err('verified license needs the copyright line');
  }
  if (!isObj(r.distributionPermissions)) err('distributionPermissions is required');
  else for (const m of DISTRIBUTION_MODES) if (!PERMISSION_VALUES.includes(r.distributionPermissions[m])) err(`distributionPermissions.${m} must be one of ${PERMISSION_VALUES.join(', ')}`);
  if (r.status === 'verified' && isObj(r.distributionPermissions) && DISTRIBUTION_MODES.some((m) => r.distributionPermissions[m] !== 'allowed')) err('status "verified" requires every distribution mode to be "allowed"; use "restricted" otherwise');
  if (r.status === 'verified' && !(r.license && r.license.verified)) err('status "verified" requires a verified license');
  if (!Array.isArray(r.modificationHistory)) err('modificationHistory must be an array');
  return errors;
}
module.exports = { LIFECYCLE, ELIGIBLE_LIFECYCLE, DISTRIBUTION_MODES, PERMISSION_VALUES, FRAMEWORKS, STYLING, validateRecord, SHA256_RE, SHA1_RE };
