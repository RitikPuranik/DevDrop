const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createRegistry } = require('../../src/skills/registry');
const { readConfig } = require('../../src/skills/config');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const quiet = { log() {}, warn: jest.fn(), error() {} };

function makeLibrary(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}

function entry(id, content, overrides = {}) {
  return {
    id, name: id, version: '1.0.0', category: 'design', origin: 'devdrop', enabled: true, essential: false, source: null,
    license: { identifier: 'DevDrop-original', verificationStatus: 'internal' },
    supportedFrameworks: ['react-vite'], compatibleAgents: ['design'], triggers: ['website-generation'], websiteTypes: '*',
    priority: 50, maxContextTokens: 2000, contentPath: `design/${id}/SKILL.md`, contentHash: sha(content), modifications: [], conflictsWith: [],
    ...overrides,
  };
}

function registryFor(specs, { env = {}, logger = quiet } = {}) {
  const files = {};
  const skills = specs.map(({ id, content, ...o }) => { files[`design/${id}/SKILL.md`] = content; return entry(id, content, o); });
  const libraryRoot = makeLibrary(files);
  return { registry: createRegistry({ manifest: { schemaVersion: 1, skills }, libraryRoot, config: readConfig(env), logger }), libraryRoot, skills };
}

module.exports = { sha, makeLibrary, entry, registryFor, quiet };
