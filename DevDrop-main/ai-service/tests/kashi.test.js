process.env.GROQ_API_KEYS = 'gsk_AAAA1111,gsk_BBBB2222';

jest.mock('../src/groq.service', () => ({ chat: jest.fn(), getModels: () => ['m'] }));
const groq = require('../src/groq.service');
const groqPool = require('../src/groqPool.service');
const { applyEdits, proposeFix } = require('../src/kashi/kashi.fix');
const { answer } = require('../src/kashi/kashi.chat');
const { resolveNavigation } = require('../src/kashi/appMap');

const httpError = (status, headers = {}) => Object.assign(new Error(`HTTP ${status}`), { response: { status, headers, data: { error: { message: `HTTP ${status}` } } } });

describe('groq pool', () => {
  beforeEach(() => { groqPool._internal.pool.clear(); groqPool._internal.bootstrapFromEnv(); groqPool._internal.resetGlobalRateLimit(); });

  test('fails over to the next key on 429 and cools the first', async () => {
    const used = [];
    const { keyId } = await groqPool.execute(async (key) => {
      used.push(key);
      if (used.length === 1) throw httpError(429, { 'retry-after': '2' });
      return { usage: { total_tokens: 5, prompt_tokens: 3, completion_tokens: 2 } };
    });
    expect(used).toHaveLength(2);
    const first = groqPool._internal.pool.get('env-0');
    const second = groqPool._internal.pool.get(keyId);
    expect(first.status).toBe('rate_limited');
    expect(first.cooldownUntil).toBeTruthy();
    expect(second.totalTokensUsed).toBe(5);
  });

  test('401 marks the key invalid', async () => {
    let n = 0;
    await groqPool.execute(async () => { n += 1; if (n === 1) throw httpError(401); return {}; });
    expect(groqPool._internal.pool.get('env-0').status).toBe('invalid');
  });

  test('400 does not fail over', async () => {
    let n = 0;
    await expect(groqPool.execute(async () => { n += 1; throw httpError(400); })).rejects.toThrow('HTTP 400');
    expect(n).toBe(1);
  });

  test('throws PoolExhaustedError when every key is cooling down', async () => {
    await expect(groqPool.execute(async () => { throw httpError(429, { 'retry-after': '30' }); })).rejects.toMatchObject({ code: 'GROQ_POOL_EXHAUSTED' });
  });
});

describe('kashi fix guard (fix the error and nothing else)', () => {
  const files = [{ path: 'src/App.jsx', content: "import Header from './components/header';\nexport default function App(){return <Header/>}\n" }];

  test('applies a minimal single-match edit', () => {
    const r = applyEdits([{ path: 'src/App.jsx', find: "'./components/header'", replace: "'./components/Header'" }], files);
    expect(r.ok).toBe(true);
    expect(r.files[0].content).toContain("'./components/Header'");
    expect(r.files[0].content).toContain('export default function App');
  });

  test.each([
    ['unknown file', [{ path: 'src/Other.jsx', find: 'a', replace: 'b' }]],
    ['lockfile', [{ path: 'package-lock.json', find: 'a', replace: 'b' }]],
    ['env file', [{ path: '.env', find: 'a', replace: 'b' }]],
    ['find missing', [{ path: 'src/App.jsx', find: 'nope', replace: 'x' }]],
    ['find not unique', [{ path: 'src/App.jsx', find: 'Header', replace: 'X' }]],
    ['no-op', [{ path: 'src/App.jsx', find: 'App', replace: 'App' }]],
  ])('rejects %s', (_n, edits) => {
    expect(applyEdits(edits, [...files, { path: 'package-lock.json', content: 'a' }, { path: '.env', content: 'a' }]).ok).toBe(false);
  });

  test('rejects oversized diffs', () => {
    const big = Array.from({ length: 80 }, (_, i) => `line${i}`).join('\n');
    const r = applyEdits([{ path: 'src/App.jsx', find: files[0].content, replace: big }], files);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/too large/i);
  });

  test('proposeFix retries once after a rejected edit, then returns the fix', async () => {
    groq.chat.mockReset();
    groq.chat
      .mockResolvedValueOnce({ text: '{}', json: { summary: 'x', edits: [{ path: 'src/App.jsx', find: 'missing', replace: 'y' }] }, model: 'm' })
      .mockResolvedValueOnce({ text: '{}', json: { summary: 'Fix import casing', edits: [{ path: 'src/App.jsx', find: "'./components/header'", replace: "'./components/Header'" }] }, model: 'm' });
    const r = await proposeFix({ errorLog: "Module not found: Can't resolve './components/header'", files, repoPaths: ['src/App.jsx', 'src/components/Header.jsx'] });
    expect(r.status).toBe('fix');
    expect(groq.chat).toHaveBeenCalledTimes(2);
  });

  test('proposeFix surfaces cannot_fix for environment errors', async () => {
    groq.chat.mockReset();
    groq.chat.mockResolvedValueOnce({ text: '{}', json: { cannot_fix: true, reason: 'Missing env var' }, model: 'm' });
    const r = await proposeFix({ errorLog: 'Error: DATABASE_URL is not set', files, repoPaths: [] });
    expect(r).toEqual({ status: 'cannot_fix', reason: 'Missing env var' });
  });
});

describe('kashi chat', () => {
  test('navigation is validated against the app map', () => {
    expect(resolveNavigation('/ai-studio', { isLoggedIn: false }).ok).toBe(true);
    expect(resolveNavigation('/workspace', { isLoggedIn: false })).toMatchObject({ ok: false, reason: 'login_required' });
    expect(resolveNavigation('/admin', { isLoggedIn: true, role: 'user' })).toMatchObject({ ok: false, reason: 'admin_only' });
    expect(resolveNavigation('/evil', { isLoggedIn: true }).ok).toBe(false);
  });

  test('returns a navigate action from the fast model', async () => {
    groq.chat.mockReset();
    groq.chat.mockResolvedValueOnce({ text: '', json: { reply: 'Opening AI Studio.', navigate: '/ai-studio', fix_deployment: false }, model: 'm' });
    const r = await answer({ message: 'open ai studio', context: { isLoggedIn: true, path: '/' } });
    expect(r.actions).toEqual([{ type: 'navigate', path: '/ai-studio' }]);
  });

  test('drops hallucinated paths and fix requests without a deployment', async () => {
    groq.chat.mockReset();
    groq.chat.mockResolvedValueOnce({ text: '', json: { reply: 'Sure', navigate: '/secret', fix_deployment: true }, model: 'm' });
    const r = await answer({ message: 'fix it', context: { isLoggedIn: true, path: '/' } });
    expect(r.actions).toEqual([]);
  });

  test('falls back to keyword navigation when Groq is down', async () => {
    groq.chat.mockReset();
    groq.chat.mockRejectedValueOnce(new Error('down'));
    const r = await answer({ message: 'take me to templates', context: { isLoggedIn: false, path: '/' } });
    expect(r.actions).toEqual([{ type: 'navigate', path: '/template' }]);
  });
});
