jest.mock('../src/agents/debug.agent', () => ({ run: jest.fn() }));
jest.mock('../src/agents/deploymentReadiness.agent', () => ({ run: jest.fn(async () => ({ value: { changes: [] } })) }));
jest.mock('../src/validators/build.validator', () => ({ run: jest.fn() }));

const dbg = require('../src/agents/debug.agent');
const build = require('../src/validators/build.validator');
const { debugWebsite } = require('../src/orchestrator/websiteGeneration.orchestrator');
const { validateGeneratedFiles } = require('../src/validators/generatedFiles.validator');
const { scopeDebugInput, applyChanges } = require('../src/utils/debugScope');

const APP = { code: 'import articles from "./data/articles.js";\nexport default function App(){ return <main><h1>Blog</h1>{articles.map((a) => <p key={a.title}>{a.title}</p>)}</main>; }' };
const PROSE = { code: 'const articles = [{ title: "The user interface of a type of roast", body: "Tip: number of beans: string them. Good interface design: type matters." }];\nexport default articles;' };

describe('TypeScript detection no longer misfires on prose', () => {
  it('accepts valid JavaScript whose text contains "interface", "type of" and ": number"', () => {
    expect(validateGeneratedFiles({ '/App.js': APP, '/data/articles.js': PROSE })).toEqual([]);
  });
  it.each([
    ['interface Foo { x: string }\nexport default [];', 'interface declaration'],
    ['const f = (x: number) => x;\nexport default f;', 'type annotation'],
    ['type Id = string;\nexport default [];', 'type alias'],
    ['const a = [] as string[];\nexport default a;', '"as" type assertion'],
    ['enum Color { Red }\nexport default Color;', 'enum'],
  ])('still rejects real TypeScript (%#) and names the construct and line', (code, what) => {
    const errors = validateGeneratedFiles({ '/App.js': APP, '/data/articles.js': { code } });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(new RegExp(`^/data/articles\\.js:1: TypeScript syntax is not allowed \\(${what.replace(/[()"]/g, '\\$&')}\\)`));
  });
  it('reports ordinary syntax errors as plain parse errors, not TypeScript', () => {
    expect(validateGeneratedFiles({ '/App.js': APP, '/data/articles.js': { code: 'export default {;' } })[0]).toMatch(/^\/data\/articles\.js: Unexpected token/);
  });
});

describe('debug input scoping', () => {
  const files = { '/App.js': APP, '/data/articles.js': PROSE, '/components/Big.js': { code: 'x'.repeat(5000) }, '/package.json': { code: '{}' } };
  it('sends only the file named in the error plus its direct imports', () => {
    const s = scopeDebugInput({ errors: ['/App.js:1: boom'], files });
    expect(s.scoped).toBe(true);
    expect(s.affectedFiles).toEqual(['/App.js']);
    expect(Object.keys(s.files).sort()).toEqual(['/App.js', '/data/articles.js']);
  });
  it('adds package.json for dependency errors and falls back to everything when no file is named', () => {
    expect(Object.keys(scopeDebugInput({ errors: ['/App.js: Cannot find module "x"'], files }).files)).toContain('/package.json');
    const s = scopeDebugInput({ errors: ['something odd happened'], files });
    expect(s.scoped).toBe(false);
    expect(Object.keys(s.files)).toHaveLength(4);
  });
  it('applyChanges reports only effective modifications', () => {
    const f = { '/a.js': { code: 'one' } };
    expect(applyChanges(f, [{ path: '/a.js', code: 'one' }, { path: 'b.js', code: 'two' }, { path: '/c.js' }], (p) => (p.startsWith('/') ? p : `/${p}`))).toEqual(['/b.js']);
    expect(f['/b.js'].code).toBe('two');
  });
});

describe('debug-only repair loop', () => {
  let saved;
  beforeEach(() => { saved = process.env.MAX_DEBUG_RETRIES; process.env.MAX_DEBUG_RETRIES = '7'; dbg.run.mockReset(); build.run.mockReset(); jest.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => { if (saved === undefined) delete process.env.MAX_DEBUG_RETRIES; else process.env.MAX_DEBUG_RETRIES = saved; jest.restoreAllMocks(); });
  const TS_FILE = { code: 'const f = (x: number) => x;\nexport default [f];' };

  it('repairs real TypeScript in one scoped attempt', async () => {
    build.run.mockResolvedValue({ success: true, errors: [] });
    dbg.run.mockResolvedValue({ value: { changes: [{ path: '/data/articles.js', code: 'const f = (x) => x;\nexport default [f];' }] } });
    const result = await debugWebsite({ files: { '/App.js': APP, '/data/articles.js': TS_FILE, '/components/Other.js': { code: 'export default () => null;' } }, requirements: {} });
    expect(dbg.run).toHaveBeenCalledTimes(1);
    const sent = dbg.run.mock.calls[0][0];
    expect(sent.affectedFiles).toEqual(['/data/articles.js']);
    expect(Object.keys(sent.files)).toEqual(['/data/articles.js']);
    expect(sent.errors[0]).toMatch(/articles\.js:1: TypeScript syntax is not allowed \(type annotation\)/);
    expect(result.files['/data/articles.js'].code).not.toContain(': number');
  });
  it('does not call the debug agent at all for a file that only looks like TypeScript', async () => {
    build.run.mockResolvedValue({ success: true, errors: [] });
    const result = await debugWebsite({ files: { '/App.js': APP, '/data/articles.js': PROSE }, requirements: {} });
    expect(dbg.run).not.toHaveBeenCalled();
    expect(result.assistantMessage).toMatch(/completed successfully/);
  });
  it('stops after two no-change attempts instead of burning all retries, and reports the real error', async () => {
    dbg.run.mockResolvedValue({ value: { changes: [] } });
    await expect(debugWebsite({ files: { '/App.js': APP, '/data/articles.js': TS_FILE }, requirements: {} })).rejects.toMatchObject({
      userMessage: expect.stringMatching(/stopped because the same error remained.*TypeScript syntax is not allowed \(type annotation\)/),
      debugContext: expect.any(Object),
    });
    expect(dbg.run).toHaveBeenCalledTimes(2);
  });
  it('treats an identical rewrite as no change', async () => {
    dbg.run.mockImplementation(async () => ({ value: { changes: [{ path: '/data/articles.js', code: TS_FILE.code }] } }));
    await expect(debugWebsite({ files: { '/App.js': APP, '/data/articles.js': TS_FILE }, requirements: {} })).rejects.toThrow(/stalled/);
    expect(dbg.run).toHaveBeenCalledTimes(2);
  });
  it('keeps trying while the agent makes real changes, up to the limit', async () => {
    let n = 0;
    dbg.run.mockImplementation(async () => ({ value: { changes: [{ path: '/data/articles.js', code: `const f = (x: number) => x + ${++n};\nexport default [f];` }] } }));
    await expect(debugWebsite({ files: { '/App.js': APP, '/data/articles.js': TS_FILE }, requirements: {} })).rejects.toThrow(/after maximum repair attempts/);
    expect(dbg.run).toHaveBeenCalledTimes(7);
  });
  it('scopes build-error repairs and still succeeds afterwards', async () => {
    build.run.mockResolvedValueOnce({ success: false, errors: ['/App.js:1: Unexpected token'] }).mockResolvedValue({ success: true, errors: [] });
    dbg.run.mockResolvedValue({ value: { changes: [{ path: '/App.js', code: APP.code + '\n// fixed' }] } });
    const result = await debugWebsite({ files: { '/App.js': APP, '/data/articles.js': PROSE, '/components/Other.js': { code: 'export default () => null;' } }, requirements: {} });
    expect(Object.keys(dbg.run.mock.calls[0][0].files).sort()).toEqual(['/App.js', '/data/articles.js']);
    expect(result.files['/App.js'].code).toContain('// fixed');
  });
});
