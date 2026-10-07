const fs = require('fs');
const os = require('os');
const path = require('path');
const { classify, checkDist, assertPublicHttpsUrl } = require('../src/validators/runtime.check');
const { diagnoseRuntimeErrors } = require('../src/kashi/runtimeDiagnosis');

const okDom = { rootExists: true, rootChildren: 1, textLength: 20, mediaCount: 0 };
const base = { pageErrors: [], consoleErrors: [], failedLocal: [], status: 200, dom: okDom };

describe('classify', () => {
  test('a healthy page passes', () => expect(classify(base).ok).toBe(true));
  test('an uncaught exception fails', () => {
    const r = classify({ ...base, pageErrors: ["Cannot read properties of undefined (reading 'map')"] });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/Uncaught exception/);
  });
  test('an empty #root is a blank screen', () => {
    const r = classify({ ...base, dom: { ...okDom, rootChildren: 0, textLength: 0 } });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/blank screen/);
  });
  test('missing #root fails', () => expect(classify({ ...base, dom: { ...okDom, rootExists: false } }).ok).toBe(false));
  test('console noise (blocked images, favicon, dev tools hint) is ignored', () => {
    const r = classify({ ...base, consoleErrors: ['Failed to load resource: the server responded with a status of 403 ()', 'GET /favicon.ico 404', 'Download the React DevTools'] });
    expect(r.ok).toBe(true);
  });
  test('a real console.error fails', () => expect(classify({ ...base, consoleErrors: ['Warning: Each child in a list should have a unique "key"'] }).ok).toBe(false));
  test('a missing local bundle fails', () => expect(classify({ ...base, failedLocal: ['https://x.app/assets/index-1.js (HTTP 404)'] }).ok).toBe(false));
  test('an HTTP error status fails', () => expect(classify({ ...base, status: 500 }).ok).toBe(false));
});

describe('diagnoseRuntimeErrors', () => {
  test('missing env var is not a code problem', () => {
    expect(diagnoseRuntimeErrors(['Uncaught exception: supabaseUrl is required.']).kind).toBe('env');
    expect(diagnoseRuntimeErrors(['VITE_API_URL is undefined']).kind).toBe('env');
    expect(diagnoseRuntimeErrors(['Uncaught exception: Firebase: Error (auth/invalid-api-key).']).kind).toBe('env');
  });
  test('ordinary crashes are code problems', () => {
    expect(diagnoseRuntimeErrors(["Uncaught exception: Cannot read properties of undefined (reading 'map')"]).kind).toBe('code');
    expect(diagnoseRuntimeErrors(['Uncaught exception: Hero is not defined']).kind).toBe('code');
  });
  test('runtime checker infrastructure failures are not sent to the code fixer', () => {
    expect(diagnoseRuntimeErrors(['Runtime check is required but Chromium could not be started: executable missing']).kind).toBe('checker');
  });
});

describe('assertPublicHttpsUrl (SSRF guard)', () => {
  test.each(['http://example.com', 'https://localhost/x', 'https://127.0.0.1', 'https://10.0.0.5', 'https://169.254.169.254/latest', 'not a url'])('rejects %s', async (u) => {
    await expect(assertPublicHttpsUrl(u)).rejects.toMatchObject({ statusCode: 400 });
  });
});

// Real browser round-trip. Production defaults to required verification, but tests
// deliberately use auto so CI can run without a preinstalled browser binary.
describe('checkDist (real browser)', () => {
  const previousRuntimeMode = process.env.AI_RUNTIME_CHECK;
  beforeAll(() => { process.env.AI_RUNTIME_CHECK = 'auto'; });
  afterAll(() => {
    if (previousRuntimeMode === undefined) delete process.env.AI_RUNTIME_CHECK;
    else process.env.AI_RUNTIME_CHECK = previousRuntimeMode;
  });
  const make = (html, js) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-'));
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(path.join(dir, 'index.html'), html);
    fs.writeFileSync(path.join(dir, 'assets', 'app.js'), js);
    return dir;
  };
  const html = '<!doctype html><html><body><div id="root"></div><script src="/assets/app.js"></script></body></html>';

  test('passes a page that renders, fails one that throws before rendering', async () => {
    const good = await checkDist(make(html, 'document.getElementById("root").innerHTML="<h1>Hello</h1>"'));
    if (good.skipped) return console.warn('runtime check skipped:', good.reason);
    expect(good.ok).toBe(true);
    const bad = await checkDist(make(html, 'var d; document.getElementById("root").innerHTML = d.items.length'));
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(' ')).toMatch(/items/);
    expect(bad.errors.join(' ')).toMatch(/blank screen/);
  }, 60000);
});
