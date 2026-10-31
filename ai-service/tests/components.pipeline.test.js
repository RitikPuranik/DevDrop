jest.mock('../src/agents/requirements.agent', () => ({ run: jest.fn() }));
jest.mock('../src/agents/design.agent', () => ({ run: jest.fn() }));
jest.mock('../src/agents/architecture.agent', () => ({ run: jest.fn() }));
jest.mock('../src/agents/codeGeneration.agent', () => ({ run: jest.fn() }));
jest.mock('../src/agents/integration.agent', () => ({ run: jest.fn() }));
jest.mock('../src/agents/debug.agent', () => ({ run: jest.fn() }));
jest.mock('../src/agents/componentCuration.agent', () => ({ run: jest.fn() }));
jest.mock('../src/agents/deploymentReadiness.agent', () => ({ run: jest.fn(async () => ({ value: { changes: [] } })) }));
jest.mock('../src/validators/build.validator', () => ({ run: jest.fn() }));

const req = require('../src/agents/requirements.agent'); const des = require('../src/agents/design.agent');
const arch = require('../src/agents/architecture.agent'); const code = require('../src/agents/codeGeneration.agent');
const integ = require('../src/agents/integration.agent'); const dbg = require('../src/agents/debug.agent');
const cur = require('../src/agents/componentCuration.agent'); const build = require('../src/validators/build.validator');
const { generateWebsite } = require('../src/orchestrator/websiteGeneration.orchestrator');
const { getDefaultStore } = require('../src/components/store');
const { validateCuration } = require('../src/components/curation');
const { enforce, noticeFile, similarity } = require('../src/components/provenance');
const { review } = require('../src/components/review');
const { createComponentSession } = require('../src/components');

const store = getDefaultStore();
const DESIGN = { designSystem: { style: 'x', theme: 'dark', colors: { text: '#f2f4f7', background: '#0b0b0d' }, typography: {}, spacing: 's', borderRadius: 'r', componentStyle: 'c', layoutStrategy: 'l', responsiveStrategy: 'r', animationStrategy: 'scrolling marquee and quiet text reveal' } };
const quiet = () => { jest.spyOn(console, 'log').mockImplementation(() => {}); jest.spyOn(console, 'warn').mockImplementation(() => {}); };
let gen;
beforeEach(() => {
  quiet();
  for (const m of [req, des, arch, code, integ, dbg, cur, build]) m.run.mockReset();
  req.run.mockImplementation(async () => ({ value: { websiteType: 'saas', goal: 'g', pages: [], sections: [], contentRequirements: {}, features: [], userData: { productName: 'Acme' }, constraints: [], assets: [] } }));
  des.run.mockImplementation(async () => ({ value: JSON.parse(JSON.stringify(DESIGN)) }));
  arch.run.mockImplementation(async () => ({ value: { project: { framework: 'react-vite', language: 'javascript' }, files: [{ path: '/App.js', type: 'entry', responsibility: 'entry', exports: ['default'], imports: [] }], dependencies: {} } }));
  integ.run.mockImplementation(async () => ({ value: { files: {} } }));
  build.run.mockResolvedValue({ success: true, errors: [] });
  gen = (extra = {}) => generateWebsite({ websiteType: 'saas', userData: { productName: 'Acme' }, preferences: { style: 'minimal', theme: 'dark', animations: 'subtle' }, messages: [{ role: 'user', content: 'saas' }], ...extra });
});
afterEach(() => jest.restoreAllMocks());

// picks the first candidate of the first section that has one, with the given decision
const pick = (decision, adaptation = ['use palette.accent for the glow', 'reduce padding']) => cur.run.mockImplementation(async ({ discovery }) => {
  const s = discovery.sections.find((x) => x.candidates.length);
  return { value: { decisions: [{ sectionId: s.sectionId, decision, componentIds: [s.candidates[0].componentId], rationale: 'fits the quiet brief', adaptation }] } };
});
// a "model" that restyles: strips the license header (to prove the system restores it) and changes the colors/padding
const adaptingCode = () => code.run.mockImplementation(async ({ fileContract, componentBrief }) => {
  if (!componentBrief) return { value: { path: fileContract.path, code: 'export default function App(){return <main>ok</main>}' } };
  const src = componentBrief.sources[0].originalSource.replace(/^\/\*![\s\S]*?\*\/\s*/, '');
  return { value: { path: fileContract.path, code: componentBrief.sources[0].role === 'stylesheet' ? `/* adapted */\n${src.replace(/translate/g, 'translate3d')}` : src.replace(/className=/g, 'data-adapted="1" className=').replace(/p-4|px-4|gap-4/g, 'p-2') + '\n// adapted: ivory editorial treatment\n' } };
});

describe('curation validation', () => {
  const discovery = { sections: [{ sectionId: 'hero', candidates: [{ componentId: 'magicui/blur-fade' }, { componentId: 'magicui/marquee' }] }, { sectionId: 'faq', candidates: [] }], global: [{ componentId: 'magicui/scroll-progress' }] };
  it('drops invented ids, unknown decisions and unknown sections', () => {
    const v = validateCuration({ decisions: [{ sectionId: 'hero', decision: 'restyle', componentIds: ['evil/pkg', 'magicui/blur-fade'] }, { sectionId: 'nope', decision: 'use', componentIds: ['magicui/marquee'] }, { sectionId: 'hero', decision: 'teleport' }, { sectionId: 'faq', decision: 'use', componentIds: ['magicui/marquee'] }] }, discovery, store);
    expect(v.items).toHaveLength(1); expect(v.items[0].componentIds).toEqual(['magicui/blur-fade']);
    expect(v.notes.join()).toMatch(/not candidates/);
  });
  it('allows custom, enforces the component budget, and downgrades single-id combine', () => {
    const v = validateCuration({ decisions: [{ sectionId: 'hero', decision: 'combine', componentIds: ['magicui/blur-fade'] }, { sectionId: 'faq', decision: 'custom' }] }, discovery, store, { maxComponents: 1 });
    expect(v.items.map((i) => i.decision)).toEqual(['restyle', 'custom']);
    const two = validateCuration({ decisions: [{ sectionId: 'hero', decision: 'combine', componentIds: ['magicui/blur-fade', 'magicui/marquee'] }] }, discovery, store);
    expect(two.items[0].componentIds).toHaveLength(2);
    const budget = validateCuration({ decisions: [{ sectionId: 'hero', decision: 'use', componentIds: ['magicui/marquee'] }, { sectionId: 'global', decision: 'use', componentIds: ['magicui/scroll-progress'] }] }, discovery, store, { maxComponents: 1 });
    expect(budget.items).toHaveLength(1);
  });
  it('turns a component with an unsatisfiable dependency into a custom section', () => {
    const d = { sections: [{ sectionId: 'hero', candidates: [{ componentId: 'magicui/blur-fade' }] }], global: [] };
    const v = validateCuration({ decisions: [{ sectionId: 'hero', decision: 'use', componentIds: ['magicui/blur-fade'] }] }, d, store, { existingDeps: { gsap: '^3', 'framer-motion': '^11' } });
    expect(v.items[0].decision).toBe('use'); // framer-motion aliases to motion which is satisfied
    const heavy = createComponentSession({ store, logger: { log() {}, warn() {} } });
    expect(heavy.enabled).toBe(true);
  });
});

describe('provenance enforcement', () => {
  const plan = (decision) => ({ items: [{ sectionId: 'hero', decision, componentIds: ['magicui/blur-fade'] }], dependencies: { motion: '^12.0.0' } });
  const original = store.source('magicui/blur-fade').code;
  it('restores a stripped license header and writes full license text and modification data to the notice file', () => {
    const stripped = original.replace(/^\/\*![\s\S]*?\*\/\s*/, '').replace(/className/g, 'data-x="1" className');
    const out = enforce({ [store.get('magicui/blur-fade').storage.target]: { code: stripped } }, plan('restyle'), store);
    expect(out.files[store.get('magicui/blur-fade').storage.target].code).toMatch(/DevDrop component provenance/);
    expect(out.report[0].headerInjected).toBe(true);
    const notice = noticeFile(out.report, store);
    expect(notice).toContain('Permission is hereby granted'); expect(notice).toContain('Copyright (c) Magic UI'); expect(notice).toContain('magicui/blur-fade');
  });
  it('does not claim attribution for an "inspire" component whose code was genuinely rewritten', () => {
    const out = enforce({ [store.get('magicui/blur-fade').storage.target]: { code: 'export function Mine(){ return <p>totally custom</p>; }' } }, plan('inspire'), store);
    expect(out.report[0].derived).toBe(false); expect(out.files[store.get('magicui/blur-fade').storage.target].code).not.toMatch(/provenance/);
    expect(noticeFile(out.report, store)).toBeNull();
  });
  it('but re-attributes an "inspire" file that is mostly upstream code', () => {
    const out = enforce({ [store.get('magicui/blur-fade').storage.target]: { code: original.replace(/^\/\*![\s\S]*?\*\/\s*/, '') } }, plan('inspire'), store);
    expect(out.report[0].derived).toBe(true); expect(out.report[0].headerInjected).toBe(true);
  });
  it('similarity separates verbatim from rewritten code', () => { expect(similarity(original, original)).toBe(1); expect(similarity(original, 'const a = 1;\n')).toBe(0); });
  it('flags unadapted "restyle", undeclared imports and duplicate animation engines', () => {
    const t = store.get('magicui/blur-fade').storage.target;
    const files = { [t]: { code: original } };
    const rep = enforce(files, plan('restyle'), store).report;
    const r = review({ files, report: rep, plan: plan('restyle'), dependencies: {} });
    const rules = r.findings.map((f) => f.rule);
    expect(rules).toEqual(expect.arrayContaining(['unadapted-component', 'undeclared-dependency']));
    expect(r.blocking.join()).toMatch(/not a declared dependency/);
    expect(review({ files: {}, report: [], plan: plan('use'), dependencies: { motion: '1', gsap: '1', 'framer-motion': '1' } }).findings.some((f) => f.rule === 'duplicate-animation-engine')).toBe(true);
  });
});

describe('generation pipeline with Component Intelligence', () => {
  it('plans from the design, adapts a catalog component, restores provenance and ships notices + dependencies', async () => {
    pick('restyle'); adaptingCode();
    const out = await gen();
    const meta = out.generationMeta.components;
    const item = meta.plan.find((p) => p.componentIds.length);
    expect(item.decision).toBe('restyle');
    const id = item.componentIds[0]; const rec = store.get(id);
    // the code agent saw the real source plus explicit permission to change it
    const brief = code.run.mock.calls.map((c) => c[0].componentBrief).find(Boolean);
    expect(brief.sources[0].originalSource).toContain('DevDrop component provenance'); expect(brief.latitude).toMatch(/Do NOT preserve the original demo look/);
    expect(brief.adaptationDirectives).toContain('reduce padding'); expect(brief.designTokens.palette.accent).toBeTruthy();
    // adapted file exists, differs from upstream, header was restored by the system
    const file = out.files[rec.storage.target].code;
    expect(file).toContain('data-adapted'); expect(file).toMatch(/Component : /); expect(file).toContain('adapted: ivory editorial');
    expect(similarity(store.source(id).code, file)).toBeLessThan(1);
    expect(out.files['/lib/utils.js'].code).toContain('export function cn');
    expect(out.files['/THIRD_PARTY_NOTICES.md'].code).toContain('Permission is hereby granted');
    expect(meta.applied[0]).toMatchObject({ componentId: id, decision: 'restyle', headerInjected: true });
    // dependencies requested by the component are declared to the build
    for (const dep of Object.keys(rec.dependencies)) expect(build.run.mock.calls[0][0].dependencies).toHaveProperty(dep === 'framer-motion' ? 'motion' : dep);
    // the host section imports it; related source is passed to the host's generation
    const arc = arch.run.mock.calls[0][0]; expect(arc.componentPlan[0].componentIds).toEqual([id]);
    const appCall = code.run.mock.calls.find((c) => c[0].fileContract.path === '/App.js')[0];
    expect(appCall.fileContract.imports).toContain(rec.storage.target); expect(appCall.relatedSources[rec.storage.target]).toBeTruthy();
    // stage names are unchanged (progress reporting contract)
    expect(out.generationMeta.agents.map((a) => a.name)).not.toContain('components');
  });
  it('lets the model choose custom: no vendored files, no notices, no extra dependencies', async () => {
    cur.run.mockImplementation(async ({ discovery }) => ({ value: { decisions: discovery.sections.map((s) => ({ sectionId: s.sectionId, decision: 'custom', rationale: 'the design needs bespoke work' })) } }));
    code.run.mockImplementation(async ({ fileContract }) => ({ value: { path: fileContract.path, code: 'export default function App(){return <main>custom</main>}' } }));
    const out = await gen();
    expect(Object.keys(out.files).filter((p) => p.startsWith('/components/ui') || p === '/THIRD_PARTY_NOTICES.md' || p === '/lib/utils.js')).toEqual([]);
    expect(out.generationMeta.components.dependenciesAdded).toEqual({});
    expect(code.run.mock.calls.every((c) => !c[0].componentBrief)).toBe(true);
  });
  it('degrades to the previous behaviour when the curation agent fails', async () => {
    cur.run.mockRejectedValue(new Error('model down'));
    code.run.mockImplementation(async ({ fileContract }) => ({ value: { path: fileContract.path, code: 'export default function App(){return <main>x</main>}' } }));
    const out = await gen();
    expect(out.files['/App.js']).toBeTruthy(); expect(out.generationMeta.components.plan).toEqual([]); expect(out.generationMeta.components.notes.join()).toMatch(/planning failed/);
  });
  it('can be switched off entirely', async () => {
    process.env.AI_COMPONENTS_ENABLED = 'false';
    try { code.run.mockImplementation(async ({ fileContract }) => ({ value: { path: fileContract.path, code: 'export default function App(){return <main>x</main>}' } })); const out = await gen(); expect(cur.run).not.toHaveBeenCalled(); expect(out.generationMeta.components).toBeNull(); } finally { delete process.env.AI_COMPONENTS_ENABLED; }
  });
  it('re-injects the header after a repair round strips it', async () => {
    pick('use'); adaptingCode();
    build.run.mockResolvedValueOnce({ success: false, errors: ['x is not defined'] }).mockResolvedValue({ success: true, errors: [] });
    dbg.run.mockImplementation(async ({ files }) => ({ value: { changes: Object.entries(files).filter(([p]) => p.startsWith('/components/ui/') && p.endsWith('.jsx')).map(([p, f]) => ({ path: p, code: f.code.replace(/^\/\*![\s\S]*?\*\/\s*/, '') })) } }));
    const out = await gen();
    expect(dbg.run).toHaveBeenCalled();
    for (const [p, f] of Object.entries(out.files)) if (p.startsWith('/components/ui/') && p.endsWith('.jsx')) expect(f.code).toMatch(/DevDrop component provenance/);
  });
  it('respects the distribution mode: a Commons-Clause component is never offered when marketplace resale is required', async () => {
    const s = createComponentSession({ store, distribution: ['deployedWebsites', 'templateResale'], logger: { log() {}, warn() {} } });
    const { buildDesignSpec } = require('../src/design/designIntelligence');
    const spec = buildDesignSpec({ websiteType: 'studio', requirements: { websiteType: 'studio', features: [], sections: [], userData: {} }, preferences: { style: 'bold' }, mediaPlan: [] });
    const seen = [];
    const plan = await s.makePlan({ design: DESIGN, designSpec: spec, runAgent: (fn) => fn(), });
    cur.run.mock.calls.forEach((c) => c[0].discovery.sections.forEach((x) => x.candidates.forEach((k) => seen.push(k.componentId))));
    expect(plan.enabled).toBe(true); expect(seen).not.toContain('react-bits/glare-hover');
  });
});
