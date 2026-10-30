const { resolveSkills, SkillIntegrityError, estimateTokens } = require('../src/skills/skillResolver');
const { buildSkillContext, PLATFORM_RULES } = require('../src/skills/skillContextBuilder');
const { createSkillSession } = require('../src/skills');
const { getDefaultRegistry } = require('../src/skills/registry');
const { readConfig } = require('../src/skills/config');
const { registryFor, quiet } = require('./helpers/skillFixtures');

const real = (env = {}) => getDefaultRegistry({ reload: true, config: readConfig(env) });
const ids = (r) => r.selected.map((s) => s.id);
// n words spread over many small sections so budgets can trim at section granularity
const BODY = (n) => `# T\n\nintro\n\n${Array.from({ length: Math.max(2, Math.ceil(n / 60)) }, (_, i) => `## Part ${i}\n${'word '.repeat(60)}`).join('\n\n')}\n`;

describe('selection with the real library', () => {
  it('routes skills to the agents that need them', () => {
    const r = real();
    expect(ids(resolveSkills(r, { agent: 'requirements', websiteType: 'cafe' }))).toEqual(['requirements-fidelity']);
    expect(ids(resolveSkills(r, { agent: 'design', websiteType: 'cafe' }))).toEqual(['frontend-design', 'devdrop-design-system', 'ui-ux-intelligence']);
    expect(ids(resolveSkills(r, { agent: 'code', websiteType: 'cafe' }))).toEqual(expect.arrayContaining(['framework-compatibility', 'generated-code-safety', 'react-best-practices', 'web-design-guidelines']));
    expect(ids(resolveSkills(r, { agent: 'code', websiteType: 'cafe' }))).not.toContain('frontend-design');
  });
  it('keeps debug and deployment context lean', () => {
    const r = real();
    expect(ids(resolveSkills(r, { agent: 'debug' }))).not.toContain('frontend-design');
    expect(ids(resolveSkills(r, { agent: 'deployment' }))).toEqual(['framework-compatibility', 'generated-code-safety']);
  });
  it('uses edit-specific triggers and excludes generation-only skills', () => {
    const res = resolveSkills(real(), { agent: 'edit', trigger: 'incremental-edit' });
    expect(ids(res)).not.toEqual(expect.arrayContaining(['frontend-design']));
    expect(ids(res)).toContain('react-best-practices');
    const debugRepair = resolveSkills(real(), { agent: 'debug', trigger: 'debug-repair' });
    expect(ids(debugRepair)).toContain('framework-compatibility');
  });
  it('excludes everything for unsupported frameworks', () => {
    const res = resolveSkills(real(), { agent: 'design', framework: 'nextjs' });
    expect(res.selected).toEqual([]);
    expect(res.excluded.every((e) => e.reason.startsWith('framework-unsupported'))).toBe(true);
  });
  it('is stable for equivalent inputs and records a reason per selection', () => {
    const a = resolveSkills(real(), { agent: 'code', websiteType: 'hotel' });
    const b = resolveSkills(real(), { agent: 'code', websiteType: 'hotel' });
    expect(a).toEqual(b);
    for (const s of a.selected) expect(s.reason).toMatch(/code/);
  });
  it('respects disabling optional external skills and the master switch', () => {
    const res = resolveSkills(real({ AI_SKILLS_ALLOW_THIRD_PARTY: 'false' }), { agent: 'design' });
    expect(ids(res)).toEqual(['devdrop-design-system', 'ui-ux-intelligence']);
    expect(res.excluded).toEqual(expect.arrayContaining([{ id: 'frontend-design', reason: 'third-party-disabled' }]));
    expect(resolveSkills(real({ AI_SKILLS_ENABLED: 'false' }), { agent: 'design' }).selected).toEqual([]);
    expect(ids(resolveSkills(real({ AI_SKILLS_DISABLED_IDS: 'ui-ux-intelligence' }), { agent: 'design' }))).not.toContain('ui-ux-intelligence');
  });
  it('rejects unknown agents', () => expect(resolveSkills(real(), { agent: 'root' }).selected).toEqual([]));
});

describe('gated skills with declared (unverified) licenses', () => {
  const on = { AI_SKILLS_ALLOW_UNVERIFIED_LICENSES: 'true' };
  it('are excluded by default with an explicit reason', () => {
    const res = resolveSkills(real(), { agent: 'design' });
    expect(res.excluded).toEqual(expect.arrayContaining([{ id: 'ui-ux-pro-max', reason: 'license-unverified' }]));
    expect(ids(resolveSkills(real(), { agent: 'code' }))).not.toContain('vercel-react-best-practices');
    expect(ids(resolveSkills(real(), { agent: 'code' }))).toContain('react-best-practices');
  });
  it('load when explicitly enabled; the Vercel selection replaces the original React skill', () => {
    expect(ids(resolveSkills(real(on), { agent: 'design' }))).toContain('ui-ux-pro-max');
    const code = resolveSkills(real(on), { agent: 'code' });
    expect(ids(code)).toContain('vercel-react-best-practices');
    expect(ids(code)).not.toContain('react-best-practices');
    expect(code.excluded).toEqual(expect.arrayContaining([{ id: 'react-best-practices', reason: 'conflicts-with:vercel-react-best-practices' }]));
  });
  it('stay within budgets and remove TypeScript/Next.js sections when enabled', () => {
    const r = real(on);
    for (const agent of ['design', 'code', 'edit']) {
      const res = resolveSkills(r, { agent, trigger: agent === 'edit' ? 'incremental-edit' : 'website-generation', websiteType: 'cafe' }, { config: readConfig(on) });
      const built = buildSkillContext(r, res, { terms: ['cafe', 'list', 'render'] });
      expect(built.usedTokens).toBeLessThanOrEqual(res.budget.total);
      // DevDrop's own platform skill names the forbidden things on purpose; check only third-party blocks.
      const thirdParty = built.text.split('<<<DEVDROP-SKILL').filter((b) => /origin="third-party"/.test(b)).join('\n');
      expect(thirdParty).not.toMatch(/\.tsx\b|interface [A-Z]\w* \{|next\/image|getServerSideProps|\bTypeScript\b/);
    }
  });
  it('the original design guidance still reaches the design agent alongside ui-ux-pro-max', () => {
    expect(ids(resolveSkills(real(on), { agent: 'design' }))).toEqual(expect.arrayContaining(['frontend-design', 'devdrop-design-system', 'ui-ux-intelligence', 'ui-ux-pro-max']));
  });
});

describe('precedence, duplicates, conflicts and budgets (fixtures)', () => {
  it('orders by priority then id, regardless of manifest order', () => {
    const specs = [{ id: 'b-skill', content: BODY(120), priority: 10 }, { id: 'a-skill', content: BODY(120), priority: 10 }, { id: 'top', content: BODY(120), priority: 90 }];
    const one = resolveSkills(registryFor(specs).registry, { agent: 'design' });
    const two = resolveSkills(registryFor([...specs].reverse()).registry, { agent: 'design' });
    expect(ids(one)).toEqual(['top', 'a-skill', 'b-skill']);
    expect(ids(two)).toEqual(ids(one));
  });
  it('drops the lower-precedence skill of a conflicting pair', () => {
    const { registry } = registryFor([{ id: 'strong', content: BODY(120), priority: 80 }, { id: 'weak', content: BODY(120), priority: 20, conflictsWith: ['strong'] }]);
    const res = resolveSkills(registry, { agent: 'design' });
    expect(ids(res)).toEqual(['strong']);
    expect(res.excluded).toEqual([{ id: 'weak', reason: 'conflicts-with:strong' }]);
  });
  it('enforces per-skill and total budgets', () => {
    const { registry } = registryFor([{ id: 'big', content: BODY(4000), priority: 90, maxContextTokens: 600 }, { id: 'second', content: BODY(4000), priority: 80, maxContextTokens: 600 }], { env: { AI_SKILLS_MAX_CONTEXT_TOKENS: '800' } });
    const res = resolveSkills(registry, { agent: 'design' });
    expect(res.selected[0].allocationTokens).toBe(600);
    expect(res.selected[1].allocationTokens).toBe(200);
    expect(res.budget.used).toBeLessThanOrEqual(res.budget.total);
    const built = buildSkillContext(registry, res, { terms: [] });
    expect(built.usedTokens).toBeLessThanOrEqual(800);
  });
  it('marks skills as budget-exhausted when nothing is left', () => {
    const { registry } = registryFor([{ id: 'one', content: BODY(4000), priority: 90, maxContextTokens: 600 }, { id: 'two', content: BODY(4000), priority: 80 }], { env: { AI_SKILLS_MAX_CONTEXT_TOKENS: '700' } });
    expect(resolveSkills(registry, { agent: 'design' }).excluded).toEqual([{ id: 'two', reason: 'budget-exhausted' }]);
  });
  it('degrades gracefully when an optional skill is unavailable, throws for an essential one in strict mode', () => {
    const fs = require('fs'); const path = require('path');
    const { registry, libraryRoot } = registryFor([{ id: 'optional', content: BODY(100), priority: 40 }, { id: 'core', content: BODY(100), priority: 60, essential: true }]);
    fs.writeFileSync(path.join(libraryRoot, 'design/optional/SKILL.md'), 'changed');
    const ok = resolveSkills(registry, { agent: 'design' }, { strict: true });
    expect(ids(ok)).toEqual(['core']);
    expect(ok.excluded).toEqual([expect.objectContaining({ id: 'optional', reason: 'unavailable:HASH_MISMATCH' })]);
    fs.writeFileSync(path.join(libraryRoot, 'design/core/SKILL.md'), 'changed');
    registry.clearCache();
    expect(() => resolveSkills(registry, { agent: 'design' }, { strict: true })).toThrow(SkillIntegrityError);
    expect(ids(resolveSkills(registry, { agent: 'design' }))).toEqual([]);
  });
});

describe('platform constraints beat skill advice', () => {
  const TS = '# Guide\n\nintro\n\n## Use TypeScript\nAlways write .tsx files with interface Props {}.\n\n## Spacing\nUse a 4px scale.\n\n## Next routing\nUse next/link and getServerSideProps.\n';
  it('drops TypeScript and Next.js sections for react-vite while keeping compatible ones', () => {
    const { registry } = registryFor([{ id: 'tsguide', content: TS }]);
    const built = buildSkillContext(registry, resolveSkills(registry, { agent: 'design' }), { terms: [] });
    expect(built.text).toContain('Use a 4px scale');
    expect(built.text).not.toMatch(/\.tsx|interface Props|getServerSideProps/);
    expect(built.skills[0].dropped.map((d) => d.reason).sort()).toEqual(['framework-conflict:nextjs', 'framework-conflict:typescript']);
  });
  it('always places trusted platform rules before skill excerpts and wraps skills as advisory', () => {
    const { registry } = registryFor([{ id: 'tsguide', content: TS }]);
    const text = buildSkillContext(registry, resolveSkills(registry, { agent: 'design' }), {}).text;
    expect(text.indexOf(PLATFORM_RULES)).toBeLessThan(text.indexOf('<<<DEVDROP-SKILL'));
    expect(text).toMatch(/trust="advisory"/);
    expect(PLATFORM_RULES).toMatch(/JavaScript\/JSX only/);
    expect(PLATFORM_RULES).toMatch(/requirements.*media references.*designSpec always win/s);
  });
  it('selects sections by relevance within the budget, deterministically', () => {
    const body = `# G\n\nintro\n\n## Menu design\n${'menu '.repeat(200)}\n\n## Gallery\n${'gallery '.repeat(200)}\n`;
    const { registry } = registryFor([{ id: 'g', content: body, maxContextTokens: 300 }]);
    const run = () => buildSkillContext(registry, resolveSkills(registry, { agent: 'design' }), { terms: ['menu'] });
    expect(run().skills[0].sections).toContain('Menu design');
    expect(run().skills[0].sections).not.toContain('Gallery');
    expect(run().text).toEqual(run().text);
  });
  it('real frontend-design and web-design-guidelines are kept verbatim except filtered sections', () => {
    const r = real();
    const text = buildSkillContext(r, resolveSkills(r, { agent: 'design', websiteType: 'portfolio' }), { terms: ['portfolio'] }).text;
    expect(text).toContain('Ground your designs in the subject matter');
    expect(text).not.toMatch(/\.tsx/);
  });
});

describe('skill session', () => {
  it('memoizes, reports usage and never throws', () => {
    const logger = { log: jest.fn(), warn: jest.fn() };
    const s = createSkillSession({ websiteType: 'cafe', logger, config: readConfig({}) });
    const a = s.contextFor('design');
    expect(s.contextFor('design')).toBe(a);
    expect(a).toContain('TRUSTED DEVDROP PLATFORM RULES');
    const report = s.report();
    expect(report.stages).toHaveLength(1);
    expect(report.stages[0].skills).toEqual(['frontend-design', 'devdrop-design-system', 'ui-ux-intelligence']);
    expect(logger.log.mock.calls.join()).not.toMatch(/Ground your designs/);
    expect(s.contextFor('not-an-agent')).toBe('');
  });
  it('returns empty context when disabled', () => {
    expect(createSkillSession({ config: readConfig({ AI_SKILLS_ENABLED: 'false' }) }).contextFor('design')).toBe('');
  });
  it('keeps total skill tokens within the configured cap per stage', () => {
    const s = createSkillSession({ websiteType: 'hotel', config: readConfig({ AI_SKILLS_MAX_CONTEXT_TOKENS: '1000' }) });
    for (const a of ['design', 'architecture', 'code', 'edit']) s.contextFor(a);
    for (const u of s.usage()) expect(u.skillTokens).toBeLessThanOrEqual(1000);
  });
});

it('estimateTokens is a monotonic char-based estimate', () => expect(estimateTokens('abcd')).toBe(1));

describe('per-skill outcome logging', () => {
  it('logs one short line per successfully used skill', () => {
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    createSkillSession({ websiteType: 'cafe', logger, config: readConfig({}) }).contextFor('design');
    const lines = logger.log.mock.calls.map((c) => c[0]);
    expect(lines).toEqual(['[SKILL OK] design/frontend-design ~2341tok', expect.stringMatching(/^\[SKILL OK\] design\/devdrop-design-system ~\d+tok$/), expect.stringMatching(/^\[SKILL OK\] design\/ui-ux-intelligence ~\d+tok$/)]);
    for (const l of lines) expect(l).not.toContain('\n');
    expect(logger.error).not.toHaveBeenCalled();
  });
  it('logs a detailed failure (reason, effect, action) without leaking skill text', () => {
    const fs = require('fs'); const path = require('path');
    const { registry, libraryRoot } = registryFor([{ id: 'good', content: BODY(100), priority: 60, essential: true }, { id: 'broken', content: BODY(100), priority: 40 }]);
    fs.writeFileSync(path.join(libraryRoot, 'design/broken/SKILL.md'), 'TOP SECRET TAMPERED CONTENT');
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    createSkillSession({ registry, logger, config: readConfig({}) }).contextFor('design');
    expect(logger.log.mock.calls.map((c) => c[0])).toEqual([expect.stringMatching(/^\[SKILL OK\] design\/good /)]);
    const failure = logger.error.mock.calls[0][0];
    expect(failure).toMatch(/\[SKILL FAILED\] design\/broken/);
    expect(failure).toMatch(/reason : HASH_MISMATCH/);
    expect(failure).toMatch(/effect : .*NOT added/);
    expect(failure).toMatch(/action : .*skills:verify/);
    expect(failure).not.toContain('TOP SECRET');
  });
  it('does not log policy skips (disabled, license-gated) as failures', () => {
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    createSkillSession({ websiteType: 'cafe', logger, config: readConfig({}) }).contextFor('design');
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.log.mock.calls.join()).not.toMatch(/ui-ux-pro-max/);
  });
});
