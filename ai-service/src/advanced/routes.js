'use strict';
/** Static analysis of the generated router: which URL patterns are registered, and which links point nowhere. */
const { parse } = require('@babel/parser');

const isCode = (p) => /\.(jsx?|mjs)$/i.test(p);
const joinPath = (prefix, seg) => {
  if (seg === undefined || seg === null) return prefix;
  if (seg === '*') return `${prefix === '/' ? '' : prefix}/*`;
  const s = String(seg);
  return s.startsWith('/') ? s : `${prefix.replace(/\/$/, '')}/${s}`;
};
const canon = (p) => {
  let out = String(p || '/').replace(/\/{2,}/g, '/');
  if (out.length > 1) out = out.replace(/\/$/, '');
  return out || '/';
};
/** '/shop/:slug' and '/shop/:id' are the same pattern. */
const shape = (p) => canon(p).replace(/:[A-Za-z0-9_]+/g, ':p');

function attr(el, name) {
  const a = (el.openingElement?.attributes || []).find((x) => x.type === 'JSXAttribute' && x.name?.name === name);
  if (!a) return undefined;
  if (!a.value) return true;
  if (a.value.type === 'StringLiteral') return a.value.value;
  if (a.value.type === 'JSXExpressionContainer' && a.value.expression.type === 'StringLiteral') return a.value.expression.value;
  return null;
}

function extractRoutes(files) {
  const patterns = new Set();
  for (const [path, f] of Object.entries(files)) {
    const code = typeof f === 'string' ? f : f?.code;
    if (!isCode(path) || typeof code !== 'string' || !/Route|path\s*:/.test(code)) continue;
    let ast;
    try { ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'dynamicImport'] }); } catch { continue; }
    const walkJsx = (node, prefix) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach((n) => walkJsx(n, prefix));
      if (node.type === 'JSXElement' && node.openingElement.name?.name === 'Route') {
        const p = attr(node, 'path');
        const here = typeof p === 'string' ? canon(joinPath(prefix, p)) : prefix;
        if (typeof p === 'string' || attr(node, 'index')) patterns.add(here);
        (node.children || []).forEach((c) => walkJsx(c, here));
        return;
      }
      for (const k of Object.keys(node)) if (k !== 'loc' && k !== 'tokens') walkJsx(node[k], prefix);
    };
    walkJsx(ast.program, '/');
    // data-router style: { path: '/x', children: [...] }
    const walkObj = (node, prefix) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach((n) => walkObj(n, prefix));
      if (node.type === 'ObjectExpression') {
        const props = Object.fromEntries(node.properties.filter((p) => p.type === 'ObjectProperty' && p.key).map((p) => [p.key.name || p.key.value, p.value]));
        let here = prefix;
        if (props.path?.type === 'StringLiteral') { here = canon(joinPath(prefix, props.path.value)); patterns.add(here); }
        if (props.children) walkObj(props.children, here);
        for (const [k, v] of Object.entries(props)) if (k !== 'children') walkObj(v, prefix);
        return;
      }
      for (const k of Object.keys(node)) if (k !== 'loc' && k !== 'tokens') walkObj(node[k], prefix);
    };
    if (/path\s*:/.test(code)) walkObj(ast.program, '/');
  }
  return [...patterns];
}

/** Does a concrete URL path match any registered pattern (including "*")? */
function matches(patterns, url) {
  const u = canon(url).split('/').filter(Boolean);
  return patterns.some((pat) => {
    const segs = canon(pat).split('/').filter(Boolean);
    if (segs[segs.length - 1] === '*') return segs.length === 1 || segs.slice(0, -1).every((s, i) => u[i] !== undefined && (s.startsWith(':') || s === u[i]));
    return segs.length === u.length && segs.every((s, i) => s.startsWith(':') || s === u[i]);
  });
}

/** Internal link targets written as literals: <Link to="/x">, <NavLink to>, <a href="/x">, navigate('/x'). */
function internalLinks(files) {
  const out = [];
  for (const [path, f] of Object.entries(files)) {
    const code = typeof f === 'string' ? f : f?.code;
    if (!isCode(path) || typeof code !== 'string') continue;
    for (const m of code.matchAll(/\b(?:to|href)\s*=\s*(?:"(\/[^"#?]*)[^"]*"|'(\/[^'#?]*)[^']*'|\{\s*["'`](\/[^"'`#?$]*)["'`]\s*\})/g)) {
      const target = m[1] ?? m[2] ?? m[3];
      if (target && !/^\/\//.test(target)) out.push({ path, target: canon(target) });
    }
    for (const m of code.matchAll(/\bnavigate\(\s*["'`](\/[^"'`#?$]*)["'`]/g)) out.push({ path, target: canon(m[1]) });
  }
  return out;
}

module.exports = { extractRoutes, matches, internalLinks, shape, canon };
