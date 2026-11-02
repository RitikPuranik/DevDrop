'use strict';
/**
 * Real-browser testing of the BUILT site (Playwright): every route at mobile/tablet/desktop, client-side navigation,
 * forms, overflow, overlap, images. `probeDist` gathers raw observations; `evaluateProbe` (pure) turns them into issues.
 */
const { serveDir, isNoise } = require('../../validators/runtime.check');

function loadPlaywright() { try { return require('playwright'); } catch { try { return require('playwright-core'); } catch { return null; } } }

// Runs inside the page. Kept self-contained.
/* istanbul ignore next */
function inPageAudit() {
  const vw = window.innerWidth;
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05; };
  const overflow = document.documentElement.scrollWidth > vw + 1;
  const wide = overflow ? [...document.body.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > vw + 2 && visible(e)).slice(0, 3).map((e) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? `.${e.className.split(' ')[0]}` : ''}`) : [];
  const leaves = [...document.body.querySelectorAll('h1,h2,h3,h4,p,a,button,li,label,span')].filter((e) => visible(e) && e.children.length === 0 && (e.textContent || '').trim().length > 1 && !e.closest('[aria-hidden="true"]')).slice(0, 300);
  const rects = leaves.map((e) => ({ e, r: e.getBoundingClientRect(), fixed: (() => { let n = e; while (n && n !== document.body) { const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') return true; n = n.parentElement; } return false; })() }));
  const overlaps = [];
  for (let i = 0; i < rects.length && overlaps.length < 4; i += 1) for (let j = i + 1; j < rects.length && overlaps.length < 4; j += 1) {
    const a = rects[i]; const b = rects[j];
    if (a.e.contains(b.e) || b.e.contains(a.e) || a.fixed !== b.fixed) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left); const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w > 6 && h > 6 && (w * h) / Math.min(a.r.width * a.r.height, b.r.width * b.r.height) > 0.35) overlaps.push(`"${(a.e.textContent || '').trim().slice(0, 24)}" over "${(b.e.textContent || '').trim().slice(0, 24)}"`);
  }
  const brokenImages = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith('data:')).slice(0, 3).map((i) => i.src.slice(0, 80));
  const links = [...new Set([...document.querySelectorAll('a[href^="/"]')].map((a) => a.getAttribute('href').split(/[?#]/)[0]).filter((h) => h && !h.startsWith('//')))];
  const navLinks = [...new Set([...document.querySelectorAll('nav a[href^="/"], header a[href^="/"]')].map((a) => a.getAttribute('href').split(/[?#]/)[0]))];
  const root = document.getElementById('root');
  return { overflow, wide, overlaps, brokenImages, links, navLinks, h1: document.querySelectorAll('h1').length, main: Boolean(document.querySelector('main,[role=main]')), textLength: (document.body.innerText || '').trim().length, rootChildren: root ? root.children.length : 0, forms: document.forms.length, notFoundText: /404|not found|doesn.?t exist|can.?t find|page.*missing/i.test(document.body.innerText || ''), path: location.pathname };
}

async function probeDist(distDir, { routes, viewports, onShot, collectShots = false }) {
  const pw = loadPlaywright();
  if (!pw) return { skipped: true, reason: 'playwright not installed' };
  let browser;
  try { browser = await pw.chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] }); } catch (e) { return { skipped: true, reason: `browser unavailable: ${String(e.message).split('\n')[0]}` }; }
  const server = await serveDir(distDir);
  const out = { pages: [], navigation: [], forms: [], shots: [], discovered: [] };
  try {
    for (const vp of viewports) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      let errors = []; let consoleErrors = [];
      page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 300)));
      page.on('console', (m) => { if (m.type() === 'error' && !isNoise(m.text())) consoleErrors.push(m.text().slice(0, 300)); });
      await page.route('**/*', (route) => { const u = route.request().url(); if (u.startsWith(server.url) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue(); return route.fulfill({ status: 200, contentType: 'text/plain', body: '' }); });
      for (const r of routes) {
        errors = []; consoleErrors = [];
        try {
          await page.goto(new URL(r.path, server.url).toString(), { waitUntil: 'load', timeout: 20000 });
          await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(300);
          const audit = await page.evaluate(inPageAudit);
          out.pages.push({ routeId: r.id, path: r.path, viewport: vp.id, errors: [...errors], consoleErrors: [...consoleErrors], ...audit });
          if (vp.id === 'desktop') for (const l of audit.links) if (!out.discovered.includes(l)) out.discovered.push(l);
          if (collectShots && vp.id !== 'tablet') out.shots.push({ pageId: r.id, viewport: vp.id, mimeType: 'image/jpeg', data: (await page.screenshot({ type: 'jpeg', quality: 55, fullPage: false })).toString('base64') });
          if (vp.id === 'desktop' && audit.forms > 0) {
            const before = await page.evaluate(() => document.body.innerText.length);
            const submit = page.locator('form button[type=submit], form button:not([type]), form input[type=submit]').first();
            if (await submit.count()) {
              await submit.click({ timeout: 2000 }).catch(() => {});
              await page.waitForTimeout(300);
              const res = await page.evaluate((b) => ({ invalid: document.querySelectorAll(':invalid,[aria-invalid="true"],[role=alert]').length, delta: Math.abs(document.body.innerText.length - b), alive: Boolean(document.getElementById('root')?.children.length) }), before);
              out.forms.push({ routeId: r.id, path: r.path, ...res, errors: [...errors] });
            }
          }
        } catch (e) { out.pages.push({ routeId: r.id, path: r.path, viewport: vp.id, errors: [`navigation failed: ${String(e.message).split('\n')[0]}`], consoleErrors: [], rootChildren: 0, textLength: 0 }); }
      }
      if (vp.id === 'desktop') {
        // client-side navigation: click every header/nav link from the home page, then go back
        try {
          await page.goto(server.url, { waitUntil: 'load', timeout: 20000 }); await page.waitForTimeout(300);
          const nav = await page.evaluate(() => [...new Set([...document.querySelectorAll('nav a[href^="/"], header a[href^="/"]')].map((a) => a.getAttribute('href').split(/[?#]/)[0]))]);
          for (const href of nav.slice(0, 25)) {
            errors = [];
            await page.goto(server.url, { waitUntil: 'load' }).catch(() => {});
            const link = page.locator(`nav a[href="${href}"], header a[href="${href}"]`).first();
            await link.click({ timeout: 3000 }).catch(() => {});
            await page.waitForTimeout(200);
            const state = await page.evaluate(() => ({ path: location.pathname, children: document.getElementById('root')?.children.length || 0, text: (document.body.innerText || '').trim().length }));
            await page.goBack().catch(() => {});
            out.navigation.push({ href, landed: state.path, rendered: state.children > 0 && state.text > 0, errors: [...errors] });
          }
          errors = [];
          await page.goto(new URL('/__devdrop-no-such-page', server.url).toString(), { waitUntil: 'load' }); await page.waitForTimeout(300);
          out.notFound = { ...(await page.evaluate(inPageAudit)), errors: [...errors] };
        } catch (e) { out.navigation.push({ href: '(navigation test)', landed: '', rendered: false, errors: [String(e.message).split('\n')[0]] }); }
      }
      await ctx.close();
    }
  } finally { await browser.close().catch(() => {}); await server.close(); }
  return out;
}

let n = 0;
const iss = (layer, severity, id, message, files, extra = {}) => ({ key: `${id}:${++n}`, id, layer, severity, blocking: severity === 'error' && extra.blocking !== false, message, files, ...extra });

/** Pure: raw probe observations -> issues. `fileFor(pageId)` maps a page to its component file(s). */
function evaluateProbe(probe, { manifest, fileFor = () => [], matchesRoute = () => true } = {}) {
  if (!probe || probe.skipped) return [];
  const issues = [];
  const seen = new Set();
  const once = (k) => (seen.has(k) ? false : (seen.add(k), true));
  for (const pg of probe.pages || []) {
    const files = fileFor(pg.routeId);
    const where = `"${pg.path}" at ${pg.viewport}`;
    if (pg.errors?.length && once(`err:${pg.routeId}`)) issues.push(iss('functional', 'error', 'page-crash', `Page ${where} threw: ${pg.errors[0]}`, files, { pageId: pg.routeId }));
    else if (pg.consoleErrors?.length && once(`cerr:${pg.routeId}`)) issues.push(iss('functional', 'error', 'console-error', `Page ${where} logged an error: ${pg.consoleErrors[0]}`, files, { pageId: pg.routeId }));
    if (!pg.errors?.length && (pg.rootChildren === 0 || pg.textLength === 0) && once(`blank:${pg.routeId}`)) issues.push(iss('functional', 'error', 'page-blank', `Page ${where} renders nothing.`, files, { pageId: pg.routeId }));
    if (pg.overflow && once(`ovf:${pg.routeId}:${pg.viewport}`)) issues.push(iss('responsive', 'error', 'horizontal-overflow', `Page ${where} scrolls horizontally${pg.wide?.length ? ` (wide elements: ${pg.wide.join(', ')})` : ''}.`, files, { pageId: pg.routeId, blocking: false }));
    if (pg.overlaps?.length && once(`ovl:${pg.routeId}:${pg.viewport}`)) issues.push(iss('responsive', 'warning', 'overlapping-elements', `Page ${where} has overlapping text: ${pg.overlaps[0]}.`, files, { pageId: pg.routeId, blocking: false }));
    if (pg.brokenImages?.length && once(`img:${pg.routeId}`)) issues.push(iss('visual', 'error', 'broken-image', `Page ${where} has an image that fails to load: ${pg.brokenImages[0]}.`, files, { pageId: pg.routeId, blocking: false }));
    if (pg.viewport === 'desktop' && !pg.h1 && !pg.errors?.length && pg.textLength > 0 && once(`h1:${pg.routeId}`)) issues.push(iss('visual', 'warning', 'no-heading', `Page ${where} has no <h1>.`, files, { pageId: pg.routeId, blocking: false }));
  }
  for (const nav of probe.navigation || []) {
    if (nav.errors?.length) issues.push(iss('functional', 'error', 'navigation-error', `Clicking the navigation link ${nav.href} caused: ${nav.errors[0]}`, [], {}));
    else if (!nav.rendered || (nav.landed && nav.landed !== nav.href && !matchesRoute(nav.href))) issues.push(iss('functional', 'error', 'navigation-broken', `Navigation link ${nav.href} does not lead to a rendered page (landed on ${nav.landed || 'nothing'}).`, [], {}));
  }
  for (const f of probe.forms || []) if (f.alive === false || f.errors?.length) issues.push(iss('functional', 'error', 'form-crash', `Submitting the form on ${f.path} breaks the page.`, fileFor(f.routeId), { pageId: f.routeId }));
  else if (f.invalid === 0 && f.delta < 3) issues.push(iss('functional', 'warning', 'form-no-feedback', `Submitting the empty form on ${f.path} gives no validation or status feedback.`, fileFor(f.routeId), { pageId: f.routeId, blocking: false }));
  const nf = probe.notFound;
  if (nf && (nf.errors?.length || nf.rootChildren === 0)) issues.push(iss('functional', 'error', 'not-found-broken', 'An unknown URL does not render a page (404 route is broken).', [], {}));
  else if (nf && !nf.notFoundText) issues.push(iss('functional', 'warning', 'not-found-unclear', 'An unknown URL renders a page that does not say it was not found.', [], { blocking: false }));
  return issues;
}

module.exports = { probeDist, evaluateProbe, inPageAudit };
