'use strict';
// Deterministic post-build review of a generated site: accessibility, semantics, responsiveness, motion, safety and
// consistency with the designSpec. It complements (never replaces) static validation, the real build and the
// Playwright runtime check. No model calls. Passing it is NOT a guarantee that generated code is safe.
const { parse } = require('@babel/parser');

const ALLOWED_SCRIPT_HOSTS = new Set(['cdn.tailwindcss.com']); // injected by the DevDrop scaffold itself
const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };
const isCode = (p) => /\.(js|jsx|mjs|cjs)$/i.test(p);
const isCss = (p) => /\.css$/i.test(p);

function hostOf(url) { try { return new URL(url, 'http://local.invalid').host; } catch { return ''; } }
const isExternal = (url) => /^(?:https?:)?\/\//i.test(url || '');

function walk(node, visit, parents = []) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((n) => walk(n, visit, parents)); return; }
  if (typeof node.type === 'string') { visit(node, parents); parents = [...parents, node]; }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'tokens' || key === 'comments' || key === 'start' || key === 'end') continue;
    const v = node[key];
    if (v && typeof v === 'object') walk(v, visit, parents);
  }
}
const jsxName = (n) => (n?.type === 'JSXIdentifier' ? n.name : n?.type === 'JSXMemberExpression' ? `${jsxName(n.object)}.${n.property.name}` : '');
const attrs = (opening) => opening.attributes || [];
const hasSpread = (opening) => attrs(opening).some((a) => a.type === 'JSXSpreadAttribute');
const getAttr = (opening, name) => attrs(opening).find((a) => a.type === 'JSXAttribute' && a.name?.name === name);
const attrString = (a) => (a?.value?.type === 'StringLiteral' ? a.value.value : a?.value?.type === 'JSXExpressionContainer' && a.value.expression.type === 'StringLiteral' ? a.value.expression.value : null);
const staticString = (n) => (n?.type === 'StringLiteral' ? n.value : n?.type === 'TemplateLiteral' && !n.expressions.length ? n.quasis.map((q) => q.value.cooked).join('') : null);

const FUNCTIONAL_RULES = new Set(['dead-button', 'dead-link', 'broken-anchor', 'form-no-handler']);
const CUSTOM_BUTTON_RE = /(?:^|[a-z])(?:Button|Btn|CTA)$/;
const textOf = (node) => (node.children || []).map((c) => (c.type === 'JSXText' ? c.value : c.type === 'JSXExpressionContainer' && c.expression.type === 'StringLiteral' ? c.expression.value : '')).join(' ').replace(/\s+/g, ' ').trim().slice(0, 40);
const emptyHandler = (a) => { const e = a?.value?.expression; return Boolean(e && (e.type === 'ArrowFunctionExpression' || e.type === 'FunctionExpression') && e.body.type === 'BlockStatement' && e.body.body.length === 0); };

function reviewGeneratedSite({ files = {}, designSpec = null } = {}) {
  const findings = [];
  const add = (severity, rule, path, line, message) => findings.push({ severity, rule, path, line: line || null, message, ...(FUNCTIONAL_RULES.has(rule) ? { category: 'functional' } : {}) });
  const knownIds = new Set(); const anchors = []; const lookups = [];
  let sawMain = false; let sawNav = false; let sawFooter = false; let sawH1 = false;
  const allText = [];

  for (const [path, file] of Object.entries(files)) {
    const code = typeof file?.code === 'string' ? file.code : '';
    allText.push(code);

    if (path === '/index.html') {
      if (!/<meta[^>]+name=["']viewport["']/i.test(code)) add('warning', 'viewport-meta', path, null, 'index.html has no viewport meta tag; layouts will not be responsive on phones.');
      for (const m of code.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
        if (isExternal(m[1]) && !ALLOWED_SCRIPT_HOSTS.has(hostOf(m[1]))) add('error', 'external-script', path, null, `External script from ${hostOf(m[1])} is not allowed in generated sites.`);
      }
      if (/\bdocument\.write\b|\beval\s*\(/.test(code)) add('error', 'unsafe-api', path, null, 'index.html uses eval or document.write.');
      continue;
    }

    if (isCss(path) || isCode(path)) {
      if (/(?<![-\w])outline\s*:\s*(?:none|0)\b|\boutline-none\b/.test(code) && !/focus-visible|focus:ring|focus-visible:|:focus\s*\{[^}]*(?:box-shadow|outline)\s*:/i.test(code)) add('warning', 'focus-outline-removed', path, null, 'Focus outline is removed without a visible :focus-visible replacement.');
      if (/transition\s*:\s*all\b|\btransition-all\b/.test(code)) add('info', 'transition-all', path, null, 'Avoid transition: all; list the animated properties (transform, opacity).');
      for (const m of code.matchAll(/(?<![-\w])width\s*:\s*['"]?(\d{3,4})px/g)) if (Number(m[1]) >= 640) { add('warning', 'fixed-width', path, null, `Fixed ${m[1]}px width can overflow small screens; use max-width and fluid units.`); break; }
    }
    if (!isCode(path)) continue;

    let ast;
    try { ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'dynamicImport', 'optionalChaining', 'nullishCoalescingOperator', 'topLevelAwait'] }); } catch { continue; } // syntax errors belong to the static validator
    const h1InFile = [];

    walk(ast, (node, parents) => {
      const line = node.loc?.start?.line;
      if (node.type === 'JSXElement') {
        const opening = node.openingElement;
        const name = jsxName(opening.name);
        if (name === 'main') sawMain = true;
        if (name === 'nav' || name === 'header') sawNav = true;
        if (name === 'footer') sawFooter = true;
        if (name === 'h1') { sawH1 = true; h1InFile.push(line); }
        const spread = hasSpread(opening);
        const insideForm = parents.some((p) => p.type === 'JSXElement' && jsxName(p.openingElement.name) === 'form');
        const idAttr = attrString(getAttr(opening, 'id'));
        if (idAttr) knownIds.add(idAttr);

        if (name === 'button' && !spread && !insideForm && attrString(getAttr(opening, 'type')) !== 'submit' && !getAttr(opening, 'disabled') && (!getAttr(opening, 'onClick') || emptyHandler(getAttr(opening, 'onClick'))) && !getAttr(opening, 'onSubmit')) add('warning', 'dead-button', path, line, `<button>${textOf(node) ? ` "${textOf(node)}"` : ''} does nothing: it has no working click handler. Give it real behaviour (scroll to an existing section id, open an in-page modal or form, update state, or submit a validated form); if it cannot be made real, remove it.`);
        if (CUSTOM_BUTTON_RE.test(name) && !spread && !insideForm && !['onClick', 'href', 'to', 'type', 'onSubmit', 'as', 'asChild', 'disabled'].some((p) => getAttr(opening, p))) add('warning', 'dead-button', path, line, `<${name}>${textOf(node) ? ` "${textOf(node)}"` : ''} is used with no onClick, href or to, so it does nothing. Give it real behaviour or remove it.`);
        if (name === 'form' && !spread && !getAttr(opening, 'onSubmit') && !getAttr(opening, 'action')) add('warning', 'form-no-handler', path, line, '<form> has no onSubmit handler: submitting reloads the page or does nothing. Add a handler that validates and shows a success or error state.');
        if (name === 'a' && !spread) {
          const href = attrString(getAttr(opening, 'href'));
          const hasClick = getAttr(opening, 'onClick') && !emptyHandler(getAttr(opening, 'onClick'));
          if (!hasClick && (href === '#' || href === '' || /^javascript:/i.test(href || '') || (href === null && !getAttr(opening, 'href')))) add('warning', 'dead-link', path, line, `<a>${textOf(node) ? ` "${textOf(node)}"` : ''} goes nowhere (href="${href === null ? '' : href}"). Point it at a real section id, page or URL, or remove it.`);
          if (href && /^#[A-Za-z][\w-]*$/.test(href)) anchors.push({ id: href.slice(1), path, line, text: textOf(node) });
        }

        if (name === 'img' && !spread && !getAttr(opening, 'alt')) add('warning', 'img-alt', path, line, '<img> has no alt attribute (use alt="" for decorative images).');
        if (name === 'button' && !spread && !getAttr(opening, 'aria-label') && !getAttr(opening, 'aria-labelledby') && !getAttr(opening, 'title')) {
          const hasText = (node.children || []).some((c) => (c.type === 'JSXText' && c.value.trim()) || c.type === 'JSXExpressionContainer');
          if (!hasText) add('warning', 'icon-button-name', path, line, 'Icon-only <button> needs an aria-label.');
        }
        if (['div', 'span', 'li', 'p', 'section'].includes(name) && !spread && getAttr(opening, 'onClick') && !getAttr(opening, 'role')) add('warning', 'non-semantic-click', path, line, `<${name} onClick> is not keyboard accessible; use <button> or <a>.`);
        if (['input', 'select', 'textarea'].includes(name) && !spread) {
          const type = attrString(getAttr(opening, 'type'));
          const insideLabel = parents.some((p) => p.type === 'JSXElement' && jsxName(p.openingElement.name) === 'label');
          if (!['hidden', 'submit', 'button', 'reset'].includes(type) && !getAttr(opening, 'aria-label') && !getAttr(opening, 'aria-labelledby') && !getAttr(opening, 'id') && !insideLabel) add('warning', 'form-control-label', path, line, `<${name}> has no label, aria-label or id for a <label htmlFor>.`);
        }
        if (name === 'a' && !spread) {
          if (attrString(getAttr(opening, 'target')) === '_blank' && !/noopener|noreferrer/.test(attrString(getAttr(opening, 'rel')) || '')) add('warning', 'blank-target-rel', path, line, 'target="_blank" link needs rel="noopener noreferrer".');
        }
        if (name === 'script' && !spread) {
          const src = attrString(getAttr(opening, 'src'));
          if (src && isExternal(src) && !ALLOWED_SCRIPT_HOSTS.has(hostOf(src))) add('error', 'external-script', path, line, `External script from ${hostOf(src)} is not allowed.`);
        }
        if (name === 'iframe' && !spread) {
          const src = attrString(getAttr(opening, 'src'));
          if (src && isExternal(src)) add('warning', 'external-iframe', path, line, `<iframe> embeds ${hostOf(src)}; only embed sources named in the requirements.`);
        }
      }
      if (node.type === 'JSXAttribute' && node.name?.name === 'dangerouslySetInnerHTML') {
        const obj = node.value?.expression;
        const prop = obj?.type === 'ObjectExpression' ? obj.properties.find((p) => p.key?.name === '__html') : null;
        if (prop && staticString(prop.value) !== null) add('info', 'dangerous-html-static', path, line, 'dangerouslySetInnerHTML with a literal; prefer JSX.');
        else add('error', 'dangerous-html', path, line, 'dangerouslySetInnerHTML with a non-literal value can inject HTML.');
      }
      if (node.type === 'CallExpression') {
        const callee = node.callee;
        if (callee.type === 'MemberExpression' && callee.property?.name === 'getElementById') { const id = staticString(node.arguments[0]); if (id) lookups.push({ id, path, line }); }
        if (callee.type === 'Identifier' && callee.name === 'eval') add('error', 'unsafe-api', path, line, 'eval() is not allowed in generated code.');
        if (callee.type === 'MemberExpression' && callee.object?.name === 'document' && callee.property?.name === 'write') add('error', 'unsafe-api', path, line, 'document.write is not allowed in generated code.');
        if (callee.type === 'Identifier' && ['setTimeout', 'setInterval'].includes(callee.name) && staticString(node.arguments[0]) !== null) add('error', 'unsafe-api', path, line, 'String argument to setTimeout/setInterval is eval in disguise.');
        if (callee.type === 'MemberExpression' && callee.object?.name === 'document' && callee.property?.name === 'createElement' && staticString(node.arguments[0])?.toLowerCase() === 'script') add('error', 'external-script', path, line, 'Dynamic <script> injection is not allowed.');
        const netName = callee.type === 'Identifier' ? callee.name : callee.type === 'MemberExpression' ? `${callee.object?.name}.${callee.property?.name}` : '';
        if (['fetch', 'axios', 'axios.get', 'axios.post', 'navigator.sendBeacon'].includes(netName)) {
          const url = staticString(node.arguments[0]);
          if (url && isExternal(url)) add('warning', 'external-network', path, line, `Network call to ${hostOf(url)}; generated sites must not call external services unless the requirements name them.`);
        }
      }
      if (node.type === 'NewExpression') {
        if (node.callee.type === 'Identifier' && node.callee.name === 'Function') add('error', 'unsafe-api', path, line, 'new Function() is not allowed in generated code.');
        if (node.callee.type === 'Identifier' && ['XMLHttpRequest', 'WebSocket', 'EventSource'].includes(node.callee.name)) {
          const url = staticString(node.arguments?.[0]);
          if (!url || isExternal(url) || /^wss?:/i.test(url)) add('warning', 'external-network', path, line, `${node.callee.name} opens a network connection; not allowed unless the requirements name the service.`);
        }
      }
    });
    if (h1InFile.length > 1) add('info', 'multiple-h1', path, h1InFile[1], 'More than one <h1> in a single file.');
  }

  const joined = allText.join('\n');
  const jsxFiles = Object.keys(files).filter(isCode);
  if (jsxFiles.length) {
    if (!sawMain) add('warning', 'landmark-main', null, null, 'No <main> landmark found.');
    if (!sawNav) add('info', 'landmark-nav', null, null, 'No <nav> or <header> landmark found.');
    if (!sawFooter) add('info', 'landmark-footer', null, null, 'No <footer> landmark found.');
    if (!sawH1) add('warning', 'heading-h1', null, null, 'No <h1> found.');
  }
  const animates = /@keyframes|animation\s*:|\banimate-[a-z]|framer-motion|transition\s*:|\btransition(?:-[a-z]+)?\b/.test(joined);
  if (animates && !/prefers-reduced-motion|useReducedMotion|motion-reduce/.test(joined)) add('warning', 'reduced-motion', null, null, 'Animation is used but no prefers-reduced-motion handling was found.');

  if (designSpec?.palette) {
    const hexes = [designSpec.palette.accentStrong || designSpec.palette.accent, designSpec.palette.background, designSpec.palette.text].filter(Boolean).map((h) => h.toLowerCase());
    const lower = joined.toLowerCase();
    if (!hexes.some((h) => lower.includes(h))) add('warning', 'spec-palette-unused', null, null, 'None of the designSpec palette colours appear in the generated code.');
    if (!/--[a-z][\w-]*\s*:/i.test(joined)) add('info', 'spec-tokens-missing', null, null, 'No CSS custom properties found; design tokens should be declared once and reused.');
  }

  // Broken anchors: links/scroll lookups that point at ids no element declares. Ids written as plain id="..." in the project count.
  for (const [p, f] of Object.entries(files)) for (const m of String(f?.code || '').matchAll(/\bid=["']([A-Za-z][\w-]*)["']/g)) knownIds.add(m[1]);
  for (const a of anchors) if (!knownIds.has(a.id)) add('warning', 'broken-anchor', a.path, a.line, `Link${a.text ? ` "${a.text}"` : ''} points to #${a.id} but no element has id="${a.id}". Add the id to the target section or fix the link.`);
  for (const l of lookups) if (!knownIds.has(l.id)) add('warning', 'broken-anchor', l.path, l.line, `getElementById("${l.id}") finds nothing: no element has that id.`);
  if (designSpec?.visualDirection?.motionIntensity && designSpec.visualDirection.motionIntensity !== 'none' && jsxFiles.length) {
    if (!/IntersectionObserver|@keyframes|animation\s*:|\banimate-|framer-motion|transition\s*:|\btransition(?:-[a-z]+)?\b|hover:/.test(joined)) add('warning', 'no-motion', null, null, 'The design spec asks for motion but no animation, transition or hover effect was found.');
    if (!/\buse(?:State|Reducer)\b/.test(joined)) add('warning', 'no-interactivity', null, null, 'No component keeps interactive state (useState/useReducer); the site is likely static.');
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || String(a.path).localeCompare(String(b.path)) || (a.line || 0) - (b.line || 0));
  const limited = findings.slice(0, 60);
  const summary = { errors: findings.filter((f) => f.severity === 'error').length, warnings: findings.filter((f) => f.severity === 'warning').length, infos: findings.filter((f) => f.severity === 'info').length, total: findings.length };
  const functional = findings.filter((f) => f.category === 'functional').slice(0, 14).map((f) => `DEAD CONTROL [${f.rule}] ${f.path || 'project'}${f.line ? `:${f.line}` : ''}: ${f.message}`);
  summary.functional = findings.filter((f) => f.category === 'functional').length;
  const blocking = findings.filter((f) => f.severity === 'error').slice(0, 12).map((f) => `SAFETY REVIEW [${f.rule}] ${f.path || 'project'}${f.line ? `:${f.line}` : ''}: ${f.message}`);
  return { findings: limited, summary, blocking, functional };
}

module.exports = { reviewGeneratedSite, ALLOWED_SCRIPT_HOSTS };
