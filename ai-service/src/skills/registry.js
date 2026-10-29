'use strict';
// Centralized registry of approved skills. Only identifiers present in the (code-controlled) manifest can be
// resolved; there is deliberately no API to register, install or download a skill at runtime.
const fs = require('fs');
const path = require('path');
const { validateManifest } = require('./skillManifest');
const { makeLoader } = require('./skillLoader');
const { readConfig } = require('./config');

const LIBRARY_ROOT = path.join(__dirname, 'library');
const REPO_ROOT = path.join(__dirname, '..', '..');
const MANIFEST_PATH = path.join(__dirname, 'manifest.json');

class UnknownSkillError extends Error {
  constructor(ref) { super(`Unknown skill "${String(ref).slice(0, 80)}"`); this.name = 'UnknownSkillError'; this.code = 'UNKNOWN_SKILL'; }
}
class SkillVersionError extends Error {
  constructor(id, wanted, have) { super(`Skill "${id}" is pinned at ${have}, requested ${wanted}`); this.name = 'SkillVersionError'; this.code = 'VERSION_MISMATCH'; }
}

function createRegistry({ manifest, libraryRoot = LIBRARY_ROOT, repoRoot = REPO_ROOT, config = readConfig(), logger = console } = {}) {
  validateManifest(manifest);
  // Private copies: toggling a skill never mutates the manifest object the caller passed in.
  const entries = new Map(manifest.skills.map((entry) => [entry.id, { ...entry }]));
  const loader = makeLoader({ libraryRoot, verifyHashes: config.verifyHashes, logger });

  function lookup(ref) {
    const [id, version] = String(ref).split('@');
    const entry = entries.get(id);
    if (!entry) throw new UnknownSkillError(id);
    if (version !== undefined && version !== entry.version) throw new SkillVersionError(id, version, entry.version);
    return entry;
  }

  const registry = {
    config,
    repoRoot,
    libraryRoot,
    // `id` or pinned `id@x.y.z`.
    get: (ref) => Object.freeze({ ...lookup(ref) }),
    has: (ref) => { try { lookup(ref); return true; } catch { return false; } },
    isEnabled: (ref) => {
      const entry = lookup(ref);
      return config.enabled && entry.enabled && !config.disabledIds.includes(entry.id);
    },
    setEnabled(ref, enabled) {
      const entry = lookup(ref);
      if (!enabled && entry.essential) throw Object.assign(new Error(`Skill "${entry.id}" is essential and cannot be disabled`), { code: 'ESSENTIAL_SKILL' });
      entry.enabled = Boolean(enabled);
      return registry;
    },
    list({ enabledOnly = false, framework, agent, trigger, origin } = {}) {
      return [...entries.values()]
        .filter((e) => !enabledOnly || registry.isEnabled(e.id))
        .filter((e) => !framework || e.supportedFrameworks.includes(framework))
        .filter((e) => !agent || e.compatibleAgents.includes(agent))
        .filter((e) => !trigger || e.triggers.includes(trigger))
        .filter((e) => !origin || e.origin === origin)
        .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
        .map((e) => Object.freeze({ ...e }));
    },
    loadContent: (ref) => loader.load(lookup(ref)),
    rejectedCandidates: Object.freeze((manifest.rejectedCandidates || []).map((c) => Object.freeze({ ...c }))),
    clearCache: () => loader.clearCache(),
  };
  return registry;
}

let defaultRegistry = null;
function getDefaultRegistry({ reload = false, config } = {}) {
  if (!defaultRegistry || reload) {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    defaultRegistry = createRegistry({ manifest, config: config || readConfig() });
  }
  return defaultRegistry;
}

module.exports = { createRegistry, getDefaultRegistry, UnknownSkillError, SkillVersionError, LIBRARY_ROOT, REPO_ROOT, MANIFEST_PATH };
