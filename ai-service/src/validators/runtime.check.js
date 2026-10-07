const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const dns = require('dns').promises;

/**
 * Runtime smoke test: loads a page in a real (headless) browser and reports
 * what a visitor would see as a black/white screen.
 *
 * Why this exists: `npm run build` succeeding (or Vercel saying READY) only
 * proves the bundle compiled. A page can still crash on first render (a
 * render-time exception, an undefined variable, a missing env var, a library
 * that is incompatible with the installed React) and show an empty #root with
 * errors in the console. Nothing before this check ever executed the bundle.
 *
 * AI_RUNTIME_CHECK = auto (default: run if a browser is available, otherwise
 *                    skip with a warning) | required (fail if no browser) | off
 */

const MODE = () => String(process.env.AI_RUNTIME_CHECK || 'auto').toLowerCase();
const NAV_TIMEOUT_MS = () => Number.parseInt(process.env.AI_RUNTIME_CHECK_TIMEOUT_MS || '25000', 10) || 25000;
const SETTLE_MS = () => Number.parseInt(process.env.AI_RUNTIME_CHECK_SETTLE_MS || '1500', 10) || 1500;
const MAX_ERRORS = 8;

// Console noise that says nothing about whether the app itself is broken.
const NOISE_RE = [
  /Failed to load resource/i,
  /favicon/i,
  /net::ERR_(BLOCKED_BY_CLIENT|ABORTED|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|CONNECTION)/i,
  /Download the React DevTools/i,
  /cdn\.tailwindcss\.com should not be used in production/i,
  /\[Violation\]/i,
  /ResizeObserver loop/i,
];
const isNoise = (text) => NOISE_RE.some((re) => re.test(text));

function loadPlaywright() {
  try { return require('playwright'); } catch { /* fall through */ }
  try { return require('playwright-core'); } catch { return null; }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8',
};

/** Static server for a built `dist/` with Vercel-style SPA fallback. */
function serveDir(dir) {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    try {
      let reqPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (reqPath.endsWith('/')) reqPath += 'index.html';
      let file = path.join(root, reqPath);
      if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        // a missing *asset* must 404 (so broken script paths are visible); a missing route falls back to the SPA shell
        if (path.extname(reqPath)) { res.writeHead(404); return res.end('Not found'); }
        file = path.join(root, 'index.html');
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    } catch { res.writeHead(500); res.end(); }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => server.close(() => r())) }));
  });
}

function sameOrigin(url, origin) { try { return new URL(url).origin === origin; } catch { return false; } }

/**
 * Pure: turns raw browser events + a DOM snapshot into a verdict.
 * @param {{pageErrors:string[], consoleErrors:string[], failedLocal:string[], status:number|null, dom:{rootExists:boolean,rootChildren:number,textLength:number,mediaCount:number}}} r
 */
function classify(r) {
  const errors = [];
  if (r.status && r.status >= 400) errors.push(`The page itself returned HTTP ${r.status}.`);
  for (const e of r.pageErrors) errors.push(`Uncaught exception: ${e}`);
  for (const e of r.consoleErrors) if (!isNoise(e)) errors.push(`console.error: ${e}`);
  for (const u of r.failedLocal) errors.push(`A file the page needs failed to load: ${u}`);
  const dom = r.dom || {};
  const blank = !dom.rootExists
    ? 'There is no #root element on the page.'
    : (dom.rootChildren === 0 ? '#root is empty after load: nothing was rendered (blank screen).' : (dom.textLength === 0 && dom.mediaCount === 0 ? 'The page rendered no visible text or media (blank screen).' : null));
  if (blank) errors.unshift(blank);
  const unique = [...new Set(errors)].slice(0, MAX_ERRORS);
  return { ok: unique.length === 0, errors: unique };
}

/** Rejects non-public targets so /kashi/runtime-check cannot be used as an SSRF probe. */
async function assertPublicHttpsUrl(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch { throw Object.assign(new Error('Invalid URL.'), { statusCode: 400, userMessage: 'Invalid URL.' }); }
  if (u.protocol !== 'https:') throw Object.assign(new Error('https only'), { statusCode: 400, userMessage: 'Only https URLs can be checked.' });
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw Object.assign(new Error('private host'), { statusCode: 400, userMessage: 'That host cannot be checked.' });
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
  const priv = (a) => /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::1$|fc|fd|fe80)/i.test(a);
  if (!addrs.length || addrs.some((x) => priv(x.address))) throw Object.assign(new Error('unresolvable/private'), { statusCode: 400, userMessage: 'That host cannot be checked.' });
  return u;
}

/**
 * Loads `url` and returns { ok, skipped?, reason?, errors, dom, status }.
 * External (cross-origin) requests are stubbed when `isolate` is set so a
 * flaky CDN can never fail the check and the result is deterministic.
 */
async function checkUrl(url, { isolate = false, allowProtected = true } = {}) {
  if (MODE() === 'off') return { ok: true, skipped: true, reason: 'AI_RUNTIME_CHECK=off', errors: [] };
  const pw = loadPlaywright();
  if (!pw) {
    if (MODE() === 'required') return { ok: false, errors: ['Runtime check is required but Playwright is not installed.'] };
    console.warn('[RUNTIME CHECK] skipped: playwright is not installed');
    return { ok: true, skipped: true, reason: 'playwright not installed', errors: [] };
  }
  let browser;
  try {
    browser = await pw.chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  } catch (error) {
    if (MODE() === 'required') return { ok: false, errors: [`Runtime check is required but no browser could be started: ${String(error.message).split('\n')[0]}`] };
    console.warn('[RUNTIME CHECK] skipped: browser unavailable:', String(error.message).split('\n')[0]);
    return { ok: true, skipped: true, reason: 'browser unavailable', errors: [] };
  }
  try {
    const origin = new URL(url).origin;
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    const failedLocal = [];
    let status = null;

    page.on('pageerror', (e) => pageErrors.push(String(e && e.message ? e.message : e).slice(0, 400)));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 400)); });
    page.on('requestfailed', (r) => { if (sameOrigin(r.url(), origin) && /\.(m?js|css)(\?|$)/i.test(r.url())) failedLocal.push(r.url().slice(0, 200)); });
    page.on('response', (r) => { if (sameOrigin(r.url(), origin) && /\.(m?js|css)(\?|$)/i.test(r.url()) && r.status() >= 400) failedLocal.push(`${r.url().slice(0, 200)} (HTTP ${r.status()})`); });

    if (isolate) {
      await page.route('**/*', (route) => {
        const u = route.request().url();
        if (sameOrigin(u, origin) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
        const isJs = /\.js(\?|$)/i.test(u) || route.request().resourceType() === 'script';
        const isCss = /\.css(\?|$)/i.test(u) || route.request().resourceType() === 'stylesheet';
        return route.fulfill({ status: 200, contentType: isJs ? 'text/javascript' : isCss ? 'text/css' : 'text/plain', body: '' });
      });
    }

    const response = await page.goto(url, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS() });
    status = response ? response.status() : null;
    if (allowProtected && (status === 401 || status === 403)) {
      return { ok: true, skipped: true, reason: `The site answered HTTP ${status} (deployment protection?), so it could not be checked.`, errors: [], status };
    }
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(SETTLE_MS());

    const dom = await page.evaluate(() => {
      const root = document.getElementById('root') || document.getElementById('app') || document.getElementById('__next');
      return {
        rootExists: Boolean(root),
        rootChildren: root ? root.children.length : 0,
        textLength: (document.body.innerText || '').trim().length,
        mediaCount: document.querySelectorAll('img,video,canvas,svg').length,
      };
    });
    const verdict = classify({ pageErrors, consoleErrors, failedLocal, status, dom });
    return { ...verdict, dom, status };
  } catch (error) {
    return { ok: false, errors: [`The page could not be loaded in a browser: ${String(error.message).split('\n')[0]}`] };
  } finally {
    await browser.close().catch(() => {});
  }
}

/** Serves a built dist folder and runs the smoke test against it. */
async function checkDist(distDir) {
  if (MODE() === 'off') return { ok: true, skipped: true, reason: 'AI_RUNTIME_CHECK=off', errors: [] };
  const server = await serveDir(distDir);
  try { return await checkUrl(server.url, { isolate: true }); } finally { await server.close(); }
}

module.exports = { checkUrl, checkDist, classify, serveDir, assertPublicHttpsUrl, isNoise };
