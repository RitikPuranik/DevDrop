const fs = require('fs'); const os = require('os'); const path = require('path');
const { getDefaultStore, createStore } = require('../src/components/store');
const { createSearch } = require('../src/components/search');
const { validateRecord, DISTRIBUTION_MODES } = require('../src/components/schema');
const { detect } = require('../src/components/licenseDetector');
const { evaluate } = require('../src/components/licensePolicy');
const { resolve } = require('../src/components/dependencyResolver');
const { toJsx } = require('../src/components/sourceTransform');
const { buildDesignSpec } = require('../src/design/designIntelligence');
const { discover } = require('../src/components/discovery');

const store = getDefaultStore();
const spec = (websiteType, style, extra = {}) => buildDesignSpec({ websiteType, requirements: { websiteType, features: [], sections: [], userData: {}, ...extra }, preferences: { style }, mediaPlan: [] });

describe('catalog records', () => {
  it('loads real records that all satisfy the schema, with pinned commits and hashes', () => {
    expect(store.size()).toBeGreaterThanOrEqual(30);
    expect(store.invalid).toEqual([]);
    for (const r of store.all()) { expect(r.source.commit).toMatch(/^[0-9a-f]{40}$/); expect(validateRecord(r)).toEqual([]); }
  });
  it('never marks a component verified unless every distribution mode is allowed and the license text was verified', () => {
    for (const r of store.all().filter((x) => x.status === 'verified')) { expect(r.license.verified).toBe(true); expect(DISTRIBUTION_MODES.every((m) => r.distributionPermissions[m] === 'allowed')).toBe(true); }
    const bad = { ...store.get('magicui/marquee'), distributionPermissions: { ...store.get('magicui/marquee').distributionPermissions, templateResale: 'denied' } };
    expect(validateRecord(bad).join()).toMatch(/requires every distribution mode/);
  });
  it('detects the real upstream licenses, including the Commons Clause variant', () => {
    const lic = (n) => detect(fs.readFileSync(path.join(__dirname, '..', 'src/components/catalog/licenses', `${n}.txt`), 'utf8'));
    expect(lic('magicui').spdx).toBe('MIT'); expect(lic('shadcn').spdx).toBe('MIT');
    expect(lic('react-bits').spdx).toBe('LicenseRef-MIT-Commons-Clause');
    expect(detect('Some custom license, all rights reserved').verified).toBe(false);
  });
  it('keeps components with unvetted dependencies or sibling imports out of selection, with reasons', () => {
    const p = store.all().filter((r) => r.status === 'pending-verification');
    expect(p.length).toBeGreaterThan(0);
    for (const r of p) expect(r.verificationNotes.length).toBeGreaterThan(0);
    expect(createSearch(store).excluded.map((e) => e.componentId)).toEqual(expect.arrayContaining(p.map((r) => r.componentId)));
  });
});

describe('license-aware selection', () => {
  it('selects the Commons Clause component only where its terms allow it', () => {
    const rb = store.get('react-bits/glare-hover');
    expect(rb.status).toBe('restricted');
    expect(evaluate(rb, ['deployedWebsites']).eligible).toBe(true);
    expect(evaluate(rb, ['deployedWebsites', 'sourceCodeExport']).eligible).toBe(false);
    expect(evaluate(rb, ['deployedWebsites', 'sourceCodeExport'], { allowConditional: true }).eligible).toBe(true);
    expect(evaluate(rb, ['deployedWebsites', 'templateResale'], { allowConditional: true }).eligible).toBe(false);
    expect(evaluate(rb, ['componentRedistribution']).reasons.join()).toMatch(/denied/);
  });
  it('search honours the required modes', () => {
    const ids = (modes) => createSearch(store, { requiredModes: modes }).search('glare sweep hover surface', { limit: 20 }).map((h) => h.record.componentId);
    expect(ids(['deployedWebsites'])).toContain('react-bits/glare-hover');
    expect(ids(['deployedWebsites', 'sourceCodeExport'])).not.toContain('react-bits/glare-hover');
    expect(ids(['deployedWebsites', 'templateResale'])).not.toContain('react-bits/glare-hover');
  });
  it('treats unverified/pending/rejected/deprecated records as unselectable', () => {
    const base = store.get('magicui/marquee');
    for (const status of ['discovered', 'pending-verification', 'rejected', 'deprecated']) expect(evaluate({ ...base, status }, ['deployedWebsites']).eligible).toBe(false);
    expect(evaluate({ ...base, license: { ...base.license, verified: false } }, ['deployedWebsites']).eligible).toBe(false);
  });
});

describe('retrieval', () => {
  const search = createSearch(store, { requiredModes: ['deployedWebsites', 'sourceCodeExport'] });
  const top = (q, f) => search.search(q, { limit: 3, filters: f }).map((h) => h.record.componentId);
  it('finds components by function, feature and loose wording', () => {
    expect(top('infinite scrolling client logos').slice(0, 2)).toEqual(expect.arrayContaining(['magicui/marquee', 'motion-primitives/infinite-slider']));
    expect(top('cursor following glow on a card')).toContain('motion-primitives/spotlight');
    expect(top('animated counting statistic number')).toContain('magicui/number-ticker');
  });
  it('supports structured filters and library exclusion', () => {
    expect(top('text animation', { excludeLibraries: ['magicui'] }).every((id) => !id.startsWith('magicui/'))).toBe(true);
    expect(search.search('animation', { filters: { noMotion: true }, limit: 20 }).every((h) => h.record.usesMotion === false)).toBe(true);
    expect(search.search('animated text', { filters: { categories: ['text-animation'] }, limit: 10 }).every((h) => h.record.category === 'text-animation')).toBe(true);
  });
  it('different design directions retrieve genuinely different candidates (no category->component table)', () => {
    const ids = (d) => new Set(d.sections.flatMap((s) => s.candidates.map((c) => c.componentId)).concat(d.global.map((c) => c.componentId)));
    const a = discover({ search, spec: spec('saas', 'minimal'), design: { designSystem: { animationStrategy: 'quiet reveal' } } });
    const b = discover({ search, spec: spec('studio', 'cyberpunk'), design: { designSystem: { animationStrategy: 'glitchy terminal scramble and neon glow' } } });
    const A = ids(a); const B = ids(b);
    expect([...B].filter((x) => !A.has(x)).length).toBeGreaterThan(0);
    expect([...A].filter((x) => !B.has(x)).length).toBeGreaterThan(0);
  });
  it('same website type with a different visual identity gets different candidates', () => {
    const q = (style, anim) => discover({ search, spec: spec('portfolio', style), design: { designSystem: { animationStrategy: anim } } });
    const g = (d) => JSON.stringify(d.sections.map((s) => s.candidates.map((c) => c.componentId)).concat([d.global.map((c) => c.componentId)]));
    expect(g(q('minimal', 'none, still and quiet'))).not.toBe(g(q('cyberpunk', 'neon glow scramble kinetic marquee')));
  });
});

describe('integrity and dependencies', () => {
  it('serves verified source and rejects any tampered file', () => {
    expect(store.source('magicui/marquee').code).toMatch(/DevDrop component provenance/);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-')); fs.cpSync(path.join(__dirname, '../src/components/catalog'), dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'sources/magicui/marquee.jsx'), '\nfetch("https://evil.example");\n');
    const t = createStore({ dir });
    expect(() => t.source('magicui/marquee')).toThrow(/integrity/);
    expect(t.verifyAll().length).toBe(1);
  });
  it('resolves only vetted dependencies, reuses existing ones and never duplicates an engine', () => {
    const r = (id) => store.get(id);
    expect(resolve([r('magicui/blur-fade'), r('motion-primitives/tilt')], {}).added).toEqual({ motion: expect.any(String) });
    expect(resolve([r('magicui/blur-fade')], { motion: '^12.1.0' }).added).toEqual({});
    const framer = { ...r('magicui/blur-fade'), componentId: 'x/framer', dependencies: { 'framer-motion': '^11' } };
    expect(resolve([framer], { motion: '^12.0.0' }).added).toEqual({});
    const sketchy = { ...r('magicui/blur-fade'), componentId: 'x/sketchy', dependencies: { 'left-pad-evil': '1.0.0' } };
    expect(resolve([sketchy], {}).rejected[0].reason).toMatch(/not on the vetted list/);
    const gsap = { ...r('magicui/blur-fade'), componentId: 'x/gsap', dependencies: { gsap: '^3' } };
    expect(resolve([gsap], { motion: '^12' }).accepted).toEqual(['x/gsap']); // different family (timeline) is allowed
  });
  it('limits heavy dependencies per site', () => {
    const heavy = (n) => ({ ...store.get('magicui/blur-fade'), componentId: `x/${n}`, dependencies: { [n]: '1' } });
    const out = resolve([heavy('recharts'), heavy('three')], {}, { maxHeavy: 1 });
    expect(out.accepted).toEqual(['x/recharts']); expect(out.rejected[0].reason).toMatch(/heavy/);
  });
});

describe('source transform', () => {
  it('converts TSX to JSX, rewrites aliases and normalizes the animation engine import', async () => {
    const src = `'use client';\nimport { motion } from "framer-motion";\nimport { cn } from "@/lib/utils";\nimport type { X } from "y";\nexport function A({ a }: { a: string }) { return <motion.div className={cn("p-4", a)} />; }`;
    const { code, applied } = await toJsx(src, { fileName: 'a.tsx' });
    expect(code).not.toMatch(/use client|: \{ a: string|import type/);
    expect(code).toContain('from "motion/react"'); expect(code).toContain('from "../../lib/utils.js"');
    expect(applied.length).toBeGreaterThanOrEqual(3);
  });
  it('records every mechanical modification in the component history and license data', () => {
    const r = store.get('magicui/marquee');
    expect(r.modificationHistory[0].changes.join()).toMatch(/typescript-to-javascript/);
    expect(r.license.licenseSource.sha256).toMatch(/^[0-9a-f]{64}$/); expect(r.license.copyright).toMatch(/Copyright/);
  });
});
