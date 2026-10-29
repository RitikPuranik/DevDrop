jest.mock('../src/agents/requirements.agent', () => ({ run: jest.fn() }));
jest.mock('../src/agents/design.agent', () => ({ run: jest.fn() }));
jest.mock('../src/agents/architecture.agent', () => ({ run: jest.fn() }));
jest.mock('../src/agents/codeGeneration.agent', () => ({ run: jest.fn() }));
jest.mock('../src/agents/integration.agent', () => ({ run: jest.fn() }));
jest.mock('../src/agents/debug.agent', () => ({ run: jest.fn() }));
jest.mock('../src/agents/edit.agent', () => ({ run: jest.fn() }));
jest.mock('../src/agents/deploymentReadiness.agent', () => ({ run: jest.fn(async () => ({ value: { changes: [] } })) }));
jest.mock('../src/validators/build.validator', () => ({ run: jest.fn() }));

const req = require('../src/agents/requirements.agent');
const des = require('../src/agents/design.agent');
const arch = require('../src/agents/architecture.agent');
const code = require('../src/agents/codeGeneration.agent');
const integ = require('../src/agents/integration.agent');
const dbg = require('../src/agents/debug.agent');
const edit = require('../src/agents/edit.agent');
const build = require('../src/validators/build.validator');
const { generateWebsite } = require('../src/orchestrator/websiteGeneration.orchestrator');
const { editWebsite } = require('../src/orchestrator/websiteEditing.orchestrator');

const OK_CODE = 'export default function App(){return <main><h1>Cafe</h1></main>}';
const DESIGN = { designSystem: { style: 'x', theme: 'dark', colors: { text: '#111111', background: '#111111' }, typography: {}, spacing: 's', borderRadius: 'r', componentStyle: 'c', layoutStrategy: 'l', responsiveStrategy: 'r', animationStrategy: 'a' } };
const ENV_KEYS = ['AI_SKILLS_ENABLED', 'AI_SKILLS_QUALITY_ENFORCE', 'AI_SKILLS_QUALITY_REVIEW', 'MAX_BUILD_FIX_RETRIES'];
let saved;
beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  jest.spyOn(console, 'log').mockImplementation(() => {}); jest.spyOn(console, 'warn').mockImplementation(() => {});
  for (const m of [req, des, arch, code, integ, dbg, edit, build]) m.run.mockReset();
  req.run.mockImplementation(async () => ({ value: { websiteType: 'cafe', goal: 'g', pages: [], sections: ['menu'], contentRequirements: {}, features: ['reservation'], userData: { venueName: 'Kiln' }, constraints: [], assets: [] } }));
  des.run.mockImplementation(async () => ({ value: JSON.parse(JSON.stringify(DESIGN)) }));
  arch.run.mockImplementation(async () => ({ value: { project: { framework: 'react-vite', language: 'javascript' }, files: [{ path: '/App.js', type: 'entry', responsibility: 'entry', exports: ['default'], imports: [] }], dependencies: {} } }));
  code.run.mockImplementation(async ({ fileContract }) => ({ value: { path: fileContract.path, code: OK_CODE } }));
  integ.run.mockImplementation(async () => ({ value: { files: {} } }));
  build.run.mockResolvedValue({ success: true, errors: [] });
});
afterEach(() => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } jest.restoreAllMocks(); });

const input = (extra = {}) => ({ websiteType: 'cafe', userData: { venueName: 'Kiln' }, preferences: { style: 'luxury', theme: 'warm', palette: '#9c684a, #e8d9bf', primaryColor: '#9c684a', typography: 'serif', animations: 'subtle' }, messages: [{ role: 'user', content: 'cafe' }], ...extra });

describe('generation pipeline with skills', () => {
  it('keeps the exact stage names and order (progress reporting unchanged)', async () => {
    const stages = [];
    await generateWebsite(input(), { onStage: (n, s) => { if (s === 'started') stages.push(n); } });
    expect(stages).toEqual(['requirements', 'design', 'architecture', 'code:/App.js', 'integration', 'build-validator']);
  });
  it('gives each agent only the skills that target it', async () => {
    await generateWebsite(input());
    const ctx = (m) => m.run.mock.calls[0][0].skillContext;
    expect(ctx(req)).toContain('requirements-fidelity');
    expect(ctx(req)).not.toContain('frontend-design');
    expect(ctx(des)).toContain('id="frontend-design"');
    expect(ctx(des)).toContain('id="ui-ux-intelligence"');
    expect(ctx(arch)).not.toContain('id="frontend-design"');
    expect(ctx(code)).toContain('id="react-best-practices"');
    expect(ctx(code)).toContain('id="generated-code-safety"');
    expect(ctx(code)).not.toContain('id="frontend-design"');
    expect(ctx(integ)).toContain('id="accessibility-review"');
    for (const m of [req, des, arch, code, integ]) expect(ctx(m)).toContain('TRUSTED DEVDROP PLATFORM RULES');
  });
  it('produces a design spec honouring preferences and delivers it downstream', async () => {
    const result = await generateWebsite(input());
    const spec = des.run.mock.calls[0][0].designSpec;
    expect(spec.visualDirection).toMatchObject({ style: 'luxury', theme: 'warm', motionIntensity: 'subtle' });
    expect(spec.palette.accent).toBe('#9c684a');
    expect(spec.typography.heading.family).toBe('Playfair Display');
    expect(spec.projectType).toBe('cafe');
    expect(arch.run.mock.calls[0][0].design.designSpec).toBe(code.run.mock.calls[0][0].design.designSpec);
    expect(result.generationMeta.designSpec).toMatchObject({ style: 'luxury', composition: expect.any(String) });
  });
  it('repairs an illegible model palette using the spec instead of failing', async () => {
    await generateWebsite(input());
    const design = code.run.mock.calls[0][0].design;
    expect(design.designSystem.colors.text).toBe(design.designSpec.palette.text);
  });
  it('does not alter media mappings', async () => {
    const assets = { images: [{ assetId: 'i1', fileName: 'p.jpg', mimeType: 'image/jpeg', size: 1, kind: 'image', previewUrl: 'https://s/i1' }] };
    await generateWebsite(input({ assets }));
    const manifest = code.run.mock.calls[0][0].mediaManifest;
    expect(manifest.map((m) => m.assetId)).toEqual(['i1']);
    expect(manifest[0].previewUrl).toMatch(/^asset:\/\//);
    const spec = des.run.mock.calls[0][0].designSpec;
    for (const m of spec.mediaUsage) expect(m.assetId).not.toMatch(/^https?:/);
  });
  it('still runs the build/repair loop and gives the debug agent targeted skills', async () => {
    build.run.mockResolvedValueOnce({ success: false, errors: ['vite: unexpected token'] }).mockResolvedValue({ success: true, errors: [] });
    dbg.run.mockResolvedValue({ value: { changes: [{ path: '/App.js', code: OK_CODE, reason: 'fix' }] } });
    const stages = [];
    await generateWebsite(input(), { onStage: (n, s) => { if (s === 'started') stages.push(n); } });
    expect(stages).toEqual(expect.arrayContaining(['debug:1']));
    const ctx = dbg.run.mock.calls[0][0].skillContext;
    expect(ctx).toContain('id="framework-compatibility"');
    expect(ctx).not.toContain('id="frontend-design"');
    expect(dbg.run.mock.calls[0][0].errors).toEqual(['vite: unexpected token']);
  });
  it('reports quality review and skill usage without changing the response contract', async () => {
    const result = await generateWebsite(input());
    expect(result).toEqual(expect.objectContaining({ assistantMessage: expect.any(String), title: expect.any(String), files: expect.any(Object), dependencies: expect.any(Object) }));
    expect(result.generationMeta.agents.length).toBeGreaterThan(0);
    expect(result.generationMeta.deploymentReadiness).toBeDefined();
    expect(result.generationMeta.qualityReview.summary).toEqual(expect.objectContaining({ errors: 0 }));
    expect(result.generationMeta.skills.stages.map((s) => s.agent)).toEqual(expect.arrayContaining(['requirements', 'design', 'architecture', 'code', 'integration', 'deployment']));
  });
  it('reports (but does not block on) safety findings by default', async () => {
    code.run.mockImplementation(async ({ fileContract }) => ({ value: { path: fileContract.path, code: 'export default function App(){ eval("1"); return <main><h1>x</h1></main>; }' } }));
    const result = await generateWebsite(input());
    expect(result.generationMeta.qualityReview.summary.errors).toBe(1);
    expect(dbg.run).not.toHaveBeenCalled();
  });
  it('sends blocking safety findings through the existing repair loop when enforcement is on', async () => {
    process.env.AI_SKILLS_QUALITY_ENFORCE = 'true';
    code.run.mockImplementation(async ({ fileContract }) => ({ value: { path: fileContract.path, code: 'export default function App(){ eval("1"); return <main><h1>x</h1></main>; }' } }));
    dbg.run.mockResolvedValue({ value: { changes: [{ path: '/App.js', code: OK_CODE }] } });
    const result = await generateWebsite(input());
    expect(dbg.run).toHaveBeenCalledTimes(1);
    expect(dbg.run.mock.calls[0][0].errors[0]).toMatch(/SAFETY REVIEW \[unsafe-api\]/);
    expect(result.files['/App.js'].code).toBe(OK_CODE);
  });
  it('behaves like the baseline when skills are disabled', async () => {
    process.env.AI_SKILLS_ENABLED = 'false';
    const stages = [];
    await generateWebsite(input(), { onStage: (n, s) => { if (s === 'started') stages.push(n); } });
    expect(stages).toEqual(['requirements', 'design', 'architecture', 'code:/App.js', 'integration', 'build-validator']);
    for (const m of [req, des, arch, code, integ]) expect(m.run.mock.calls[0][0].skillContext).toBe('');
  });
  it('degrades to no skill context if the skill system breaks, and still generates', async () => {
    let isolated;
    jest.isolateModules(() => {
      jest.doMock('../src/skills/registry', () => ({ getDefaultRegistry: () => { throw new Error('boom'); }, createRegistry: jest.fn(), UnknownSkillError: Error, SkillVersionError: Error, LIBRARY_ROOT: '', REPO_ROOT: '', MANIFEST_PATH: '' }));
      isolated = require('../src/orchestrator/websiteGeneration.orchestrator');
    });
    const result = await isolated.generateWebsite(input());
    jest.dontMock('../src/skills/registry');
    expect(result.files['/App.js']).toBeTruthy();
    expect(des.run.mock.calls[0][0].skillContext).toBe('');
    expect(des.run.mock.calls[0][0].designSpec).toBeTruthy();
  });
  it('still generates when the design engine cannot build a spec', async () => {
    req.run.mockImplementation(async () => ({ value: { websiteType: 'cafe', goal: 'g', pages: [], sections: [], contentRequirements: {}, features: [], userData: {}, constraints: [], assets: [] } }));
    const result = await generateWebsite(input({ preferences: { primaryColor: 'not-a-colour', theme: 'dark', style: 'luxury' } }));
    expect(result.files['/App.js']).toBeTruthy();
  });
});

describe('incremental editing with skills', () => {
  const FILES = { '/App.js': { code: 'import Navbar from "./components/Navbar.js";\nexport default function App(){ return <main><Navbar/></main>; }' }, '/components/Navbar.js': { code: 'export default function Navbar(){ return <nav>Nav</nav>; }' }, '/package.json': { code: '{"dependencies":{"react":"^19.0.0"}}' } };
  it('adds only compact edit guidance and keeps the file-targeted flow', async () => {
    edit.run.mockResolvedValue({ value: { assistantMessage: 'ok', changes: [{ path: '/components/Navbar.js', code: 'export default function Navbar(){ return <nav className="p-6">Nav</nav>; }' }] } });
    const stages = [];
    const result = await editWebsite({ messages: [{ role: 'user', content: 'increase navbar padding' }], existingFiles: FILES }, { onStage: (n, s) => { if (s === 'started') stages.push(n); } });
    expect(stages).toEqual(['relevant-files', 'edit', 'build-validator']);
    const ctx = edit.run.mock.calls[0][0].skillContext;
    expect(ctx).toContain('id="react-best-practices"');
    expect(ctx).toContain('id="framework-compatibility"');
    expect(ctx).not.toContain('id="frontend-design"');
    expect(ctx).not.toContain('id="ui-ux-intelligence"');
    expect(Object.keys(edit.run.mock.calls[0][0].relevantFiles)).not.toContain('/package.json');
    expect(result.generationMeta.mode).toBe('edit');
    expect(result.generationMeta.changedFiles).toEqual(['/components/Navbar.js']);
  });
  it('edit-debug repairs still work and get debug-scoped skills', async () => {
    edit.run.mockResolvedValue({ value: { changes: [{ path: '/components/Navbar.js', code: 'export default function Navbar(){ return <nav>' }] } });
    dbg.run.mockResolvedValue({ value: { changes: [{ path: '/components/Navbar.js', code: 'export default function Navbar(){ return <nav>Fixed</nav>; }' }] } });
    const result = await editWebsite({ messages: [{ role: 'user', content: 'tweak navbar' }], existingFiles: FILES });
    expect(dbg.run).toHaveBeenCalledTimes(1);
    expect(dbg.run.mock.calls[0][0].skillContext).toContain('id="framework-compatibility"');
    expect(result.files['/components/Navbar.js'].code).toContain('Fixed');
  });
});
