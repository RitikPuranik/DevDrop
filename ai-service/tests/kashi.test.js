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

describe('kashi: billing, payout and deep links', () => {
  const usage = {
    plan: { id: 'free', name: 'Free' }, subscriptionStatus: 'free', billingInterval: null, renewalDate: null, nextQuotaReset: '2026-12-01T00:00:00.000Z',
    generations: { used: 1, limit: 1, remaining: 0 }, edits: { unlimited: false, used: 2, limit: 5, remaining: 3 },
    isTopPlan: false, upgradeOptions: [{ planId: 'pro', name: 'Pro', monthlyPriceMinor: 79900, generationQuota: 20 }],
  };
  const account = { usage, emailVerified: true, payoutSaved: false };
  const ctx = { isLoggedIn: true, path: '/', account };

  test('deep links only resolve when they match a known target', () => {
    expect(resolveNavigation('/profile#payout-details', { isLoggedIn: true })).toMatchObject({ ok: true, path: '/profile#payout-details' });
    expect(resolveNavigation('/workspace?section=pricing', { isLoggedIn: true })).toMatchObject({ ok: true, path: '/workspace?section=pricing' });
    expect(resolveNavigation('/workspace?section=pricing', { isLoggedIn: false })).toMatchObject({ ok: false, reason: 'login_required' });
    // unknown section falls back to the plain workspace page, never to an invented URL
    expect(resolveNavigation('/workspace?section=hacked', { isLoggedIn: true }).path).toBe('/workspace');
  });

  test('the prompt carries the real quota numbers and payout status, not browser input', async () => {
    groq.chat.mockReset();
    groq.chat.mockResolvedValueOnce({ json: { reply: 'ok', navigate: null, fix_deployment: false, studio_fill: null }, model: 'm' });
    await answer({ message: 'how much quota is left?', context: { ...ctx, account: { ...account, payoutSaved: false } } });
    const system = groq.chat.mock.calls[0][0].messages[0].content;
    expect(system).toContain('1 used of 1, 0 left');
    expect(system).toContain('2 used of 5, 3 left');
    expect(system).toContain('Payout details (UPI ID + phone) saved: NO');
    expect(system).toContain('/profile#payout-details');
  });

  test('logged-out users never get account facts in the prompt', async () => {
    groq.chat.mockReset();
    groq.chat.mockResolvedValueOnce({ json: { reply: 'log in', navigate: null, fix_deployment: false, studio_fill: null }, model: 'm' });
    await answer({ message: 'quota?', context: { isLoggedIn: false, account } });
    expect(groq.chat.mock.calls[0][0].messages[0].content).toContain('No account facts are available');
  });

  test('quota answer still works from real numbers when the model is down, and offers pricing when exhausted', async () => {
    groq.chat.mockReset();
    groq.chat.mockRejectedValueOnce(new Error('down'));
    const r = await answer({ message: 'how many generations are left', context: ctx });
    expect(r.reply).toContain('1 of 1 website generations used, 0 left');
    expect(r.reply).toContain('3 left');
    expect(r.actions).toEqual([{ type: 'navigate', path: '/workspace?section=pricing' }]);
  });
});

describe('kashi: AI Studio fill', () => {
  const studio = { websiteType: 'cafe', step: 'details', fields: [{ key: 'venueName', label: 'Cafe name' }, { key: 'hours', label: 'Opening hours' }], filled: [] };

  test('returns a studio_fill action containing only valid ids and on-screen field keys', async () => {
    groq.chat.mockReset();
    groq.chat.mockResolvedValueOnce({
      json: {
        reply: 'Filled in the basics.', navigate: null, fix_deployment: false,
        studio_fill: {
          website_type: null,
          details: [{ key: 'venueName', value: 'Brew & Bloom' }, { key: 'invented', value: 'x' }, { key: 'hours', value: '   ' }],
          design: { style: 'luxury', theme: 'warm', animations: ['scroll', 'bogus'], palette_id: 'nope', typography: 'serif', primary_color: 'red', custom_prompt: null },
        },
      }, model: 'm',
    });
    const r = await answer({ message: 'a premium cafe called Brew & Bloom', context: { isLoggedIn: true, path: '/ai-studio', studio } });
    expect(r.actions).toEqual([{ type: 'studio_fill', websiteType: null, details: { venueName: 'Brew & Bloom' }, design: { style: 'luxury', theme: 'warm', typography: 'serif', animationList: ['scroll'] } }]);
  });

  test('can pick a website type from the picker but ignores a fill with nothing valid', async () => {
    groq.chat.mockReset();
    groq.chat.mockResolvedValueOnce({ json: { reply: 'Starting a cafe site.', navigate: null, fix_deployment: false, studio_fill: { website_type: 'cafe', details: [], design: {} } }, model: 'm' });
    let r = await answer({ message: 'cafe site', context: { isLoggedIn: true, path: '/ai-studio', studio: { websiteType: null, step: 'types', fields: [], filled: [] } } });
    expect(r.actions).toEqual([{ type: 'studio_fill', websiteType: 'cafe', details: {}, design: {} }]);

    groq.chat.mockResolvedValueOnce({ json: { reply: 'What is it for?', navigate: null, fix_deployment: false, studio_fill: { website_type: 'spaceship', details: [{ key: 'x', value: 'y' }], design: { style: 'zzz' } } }, model: 'm' });
    r = await answer({ message: 'make me a site', context: { isLoggedIn: true, path: '/ai-studio', studio } });
    expect(r.actions).toEqual([]);
  });
});
