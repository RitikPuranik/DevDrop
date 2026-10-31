const fs = require('fs');
const path = require('path');
const { validateManifest, validateManifestEntry } = require('../src/skills/skillManifest');
const { createRegistry, getDefaultRegistry, UnknownSkillError, SkillVersionError } = require('../src/skills/registry');
const { readConfig } = require('../src/skills/config');
const { sha, entry, registryFor, makeLibrary, quiet } = require('./helpers/skillFixtures');

const TEXT = '# Demo\n\n## Section\nUse tokens.\n';

describe('real manifest', () => {
  const registry = getDefaultRegistry({ reload: true, config: readConfig({}) });
  it('loads and every skill passes hash verification', () => {
    expect(registry.list().length).toBe(12);
    for (const e of registry.list()) expect(registry.loadContent(e.id).hash).toBe(e.contentHash);
  });
  it('contains no placeholder SHAs or unverified third-party licenses', () => {
    for (const e of registry.list({ origin: 'third-party' })) {
      expect(e.source.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(['verified', 'declared']).toContain(e.license.verificationStatus);
    }
    // Skills whose license is only declared must say so and stay opt-in.
    for (const e of registry.list().filter((x) => x.license.verificationStatus === 'declared')) expect(e.notes).toMatch(/AI_SKILLS_ALLOW_UNVERIFIED_LICENSES/);
    expect(JSON.stringify(registry.list())).not.toMatch(/\bVERIFIED_(?:COMMIT_SHA|SHA256|LICENSE)\b/);
  });
  it('records rejected and pending candidates separately from loadable skills', () => {
    expect(registry.rejectedCandidates.map((c) => c.decision)).toEqual(['rejected']);
    for (const c of registry.rejectedCandidates) expect(registry.has(c.id)).toBe(false);
  });
  it('marks DevDrop-authored skills as internal', () => {
    for (const e of registry.list({ origin: 'devdrop' })) { expect(e.source).toBeNull(); expect(e.license.verificationStatus).toBe('internal'); }
  });
});

describe('registry behaviour', () => {
  it('looks up known skills and rejects unknown ones', () => {
    const { registry } = registryFor([{ id: 'alpha', content: TEXT }]);
    expect(registry.get('alpha').id).toBe('alpha');
    expect(() => registry.get('beta')).toThrow(UnknownSkillError);
    expect(() => registry.get('../../etc/passwd')).toThrow(UnknownSkillError);
    expect(registry.has('https://github.com/x/y')).toBe(false);
  });
  it('supports version pinning', () => {
    const { registry } = registryFor([{ id: 'alpha', content: TEXT }]);
    expect(registry.get('alpha@1.0.0').version).toBe('1.0.0');
    expect(() => registry.get('alpha@2.0.0')).toThrow(SkillVersionError);
  });
  it('enable/disable works, essential skills cannot be disabled, manifest is not mutated', () => {
    const { registry, skills } = registryFor([{ id: 'alpha', content: TEXT }, { id: 'core', content: TEXT, essential: true }]);
    registry.setEnabled('alpha', false);
    expect(registry.isEnabled('alpha')).toBe(false);
    expect(skills[0].enabled).toBe(true);
    expect(() => registry.setEnabled('core', false)).toThrow(/essential/);
  });
  it('honours AI_SKILLS_DISABLED_IDS and the master switch', () => {
    expect(registryFor([{ id: 'alpha', content: TEXT }], { env: { AI_SKILLS_DISABLED_IDS: 'alpha' } }).registry.isEnabled('alpha')).toBe(false);
    expect(registryFor([{ id: 'alpha', content: TEXT }], { env: { AI_SKILLS_ENABLED: 'false' } }).registry.isEnabled('alpha')).toBe(false);
  });
  it('filters by framework, agent and trigger', () => {
    const { registry } = registryFor([{ id: 'alpha', content: TEXT, compatibleAgents: ['code'] }, { id: 'beta', content: TEXT, triggers: ['incremental-edit'] }]);
    expect(registry.list({ agent: 'code' }).map((e) => e.id)).toEqual(['alpha']);
    expect(registry.list({ trigger: 'incremental-edit' }).map((e) => e.id)).toEqual(['beta']);
    expect(registry.list({ framework: 'next' })).toEqual([]);
  });
  it('detects a content hash mismatch', () => {
    const { registry, libraryRoot } = registryFor([{ id: 'alpha', content: TEXT }]);
    fs.writeFileSync(path.join(libraryRoot, 'design/alpha/SKILL.md'), TEXT + 'tampered');
    expect(() => registry.loadContent('alpha')).toThrow(/HASH_MISMATCH/);
  });
  it('can skip hash verification only outside production', () => {
    expect(readConfig({ AI_SKILLS_VERIFY_HASHES: 'false' }).verifyHashes).toBe(false);
    expect(readConfig({ AI_SKILLS_VERIFY_HASHES: 'false', NODE_ENV: 'production' }).verifyHashes).toBe(true);
  });
});

describe('manifest validation', () => {
  const good = () => entry('alpha', TEXT);
  const errs = (patch) => validateManifestEntry({ ...good(), ...patch });
  it('accepts a valid entry', () => expect(errs({})).toEqual([]));
  it('rejects invalid ids, versions, categories, agents and unknown fields', () => {
    expect(errs({ id: 'Bad_ID' }).join()).toMatch(/id must/);
    expect(errs({ version: '1' }).join()).toMatch(/semver/);
    expect(errs({ category: 'misc' }).join()).toMatch(/category/);
    expect(errs({ compatibleAgents: ['root'] }).join()).toMatch(/compatibleAgents/);
    expect(errs({ grantTools: ['bash'] }).join()).toMatch(/unknown field/);
  });
  it('rejects invalid license status and loadable-status mismatches', () => {
    expect(errs({ license: { identifier: 'MIT', verificationStatus: 'sure-why-not' } }).join()).toMatch(/verificationStatus/);
    expect(errs({ license: { identifier: 'MIT', verificationStatus: 'pending-review' } }).join()).toMatch(/not loadable/);
    expect(errs({ license: { identifier: 'MIT', verificationStatus: 'verified' } }).join()).toMatch(/not loadable for devdrop/);
  });
  it('requires real provenance for third-party skills', () => {
    const tp = (o = {}) => errs({ origin: 'third-party', license: { identifier: 'MIT', verificationStatus: 'verified', noticePath: 'licenses/third-party/alpha', copyright: 'Copyright X' }, source: { repository: 'o/r', path: 'a/SKILL.md', commit: 'a'.repeat(40), upstreamHash: sha('x'), checkedAt: '2026-10-28' }, ...o });
    expect(tp()).toEqual([]);
    expect(tp({ source: null }).join()).toMatch(/source provenance/);
    expect(tp({ source: { repository: 'o/r', path: 'p', commit: 'VERIFIED_COMMIT_SHA', upstreamHash: sha('x'), checkedAt: '2026-10-28' } }).join()).toMatch(/commit/);
    expect(tp({ license: { identifier: 'MIT', verificationStatus: 'verified' } }).join()).toMatch(/noticePath/);
  });
  it('rejects placeholder hashes', () => expect(errs({ contentHash: 'VERIFIED_SHA256' }).join()).toMatch(/contentHash/));
  it('only allows DevDrop skills to opt out of framework filtering', () => {
    expect(errs({ origin: 'third-party', filterFrameworkConflicts: false }).join()).toMatch(/opt out/);
  });
  it('rejects duplicate ids, dangling conflicts and bad schema versions', () => {
    expect(() => validateManifest({ skills: [good(), good()] })).toThrow(/duplicate/);
    expect(() => validateManifest({ skills: [{ ...good(), conflictsWith: ['ghost'] }] })).toThrow(/unknown skill/);
    expect(() => validateManifest({ schemaVersion: 99, skills: [] })).toThrow(/schemaVersion/);
  });
  it('is backward compatible with a missing schemaVersion', () => {
    expect(() => validateManifest({ skills: [good()] })).not.toThrow();
  });
  it('creating a registry from an invalid manifest throws', () => {
    expect(() => createRegistry({ manifest: { skills: [{ ...good(), id: 'X' }] }, libraryRoot: makeLibrary({}), logger: quiet })).toThrow(/Invalid skill manifest/);
  });
});
