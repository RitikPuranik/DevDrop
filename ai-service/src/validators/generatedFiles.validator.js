const { parse } = require('@babel/parser');

function resolveFilePath(fromPath, importPath, files) {
  if (!importPath.startsWith('.')) return null;
  const parts = fromPath.split('/').filter(Boolean); parts.pop();
  for (const s of importPath.split('/')) { if (!s || s === '.') continue; if (s === '..') parts.pop(); else parts.push(s); }
  if (parts.length < 0) return null;
  const base = '/' + parts.join('/');
  return [base, `${base}.js`, `${base}.jsx`, `${base}.mjs`, `${base}.cjs`, `${base}/index.js`, `${base}/index.jsx`].find((p) => Object.prototype.hasOwnProperty.call(files, p)) || null;
}
function hasDefaultExport(code) { return /\bexport\s+default\b/.test(code) || /export\s*\{[^}]*\bdefault\b/.test(code); }
function hasNamedExport(code, name) { return new RegExp(`\\bexport\\s+(?:const|let|var|function|class)\\s+${name}\\b`).test(code) || new RegExp(`\\bexport\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(code); }
function walk(node, fn) { if (!node || typeof node !== 'object') return; fn(node); for (const key of Object.keys(node)) { if (key === 'loc' || key === 'tokens' || key === 'comments') continue; const value = node[key]; if (Array.isArray(value)) value.forEach((v) => walk(v, fn)); else if (value && typeof value === 'object') walk(value, fn); } }
function jsxBindings(ast, code) {
  const bindings = new Set(['React']);
  walk(ast, (n) => {
    if (n.type === 'ImportDeclaration') for (const s of n.specifiers || []) bindings.add(s.local.name);
    if (['VariableDeclarator'].includes(n.type) && n.id?.type === 'Identifier') bindings.add(n.id.name);
    if (['FunctionDeclaration','ClassDeclaration'].includes(n.type) && n.id) bindings.add(n.id.name);
    if (n.type === 'ExportNamedDeclaration' && n.declaration?.id) bindings.add(n.declaration.id.name);
  });
  walk(ast, (n) => {
    if (n.type !== 'JSXOpeningElement') return;
    const name = n.name?.type === 'JSXIdentifier' ? n.name.name : n.name?.object?.name;
    if (!name || !/^[A-Z_$]/.test(name)) return;
    if (!bindings.has(name)) throw new Error(`JSX component "${name}" is undefined`);
  });
}
function validateGeneratedFiles(files) {
  const errors = [];
  if (!files || typeof files !== 'object' || Array.isArray(files)) return ['Generated files must be an object.'];
  if (!files['/App.js']) errors.push('/App.js is missing.');
  else if (!hasDefaultExport(files['/App.js']?.code || '')) errors.push('/App.js must have a default export.');
  for (const [path, obj] of Object.entries(files)) {
    if (!path.startsWith('/') || path.includes('..')) { errors.push(`${path}: invalid path.`); continue; }
    const code = typeof obj?.code === 'string' ? obj.code : '';
    if (!code.trim()) { errors.push(`${path}: empty source.`); continue; }
    if (!/\.(js|jsx|mjs|cjs)$/i.test(path)) continue; // non-JS assets (css, html, json, etc.) are not parsed as JavaScript
    if (/\binterface\s+|\btype\s+[A-Za-z_$]|:\s*(string|number|boolean)\b/.test(code)) errors.push(`${path}: TypeScript syntax is not allowed.`);
    let ast;
    try { ast = parse(code, { sourceType: 'module', sourceFilename: path, plugins: ['jsx','dynamicImport','optionalChaining','nullishCoalescingOperator','topLevelAwait'] }); jsxBindings(ast, code); }
    catch (e) { errors.push(`${path}: ${e.message}`); continue; }
    const imports = [];
    walk(ast, (n) => { if (n.type === 'ImportDeclaration') imports.push({ specifiers: n.specifiers || [], source: n.source.value }); });
    for (const imp of imports) {
      if (!imp.source.startsWith('.')) continue;
      const target = resolveFilePath(path, imp.source, files);
      if (!target) { errors.push(`${path} imports missing relative file ${imp.source}.`); continue; }
      const targetCode = files[target]?.code || '';
      for (const s of imp.specifiers) {
        if (s.type === 'ImportDefaultSpecifier' && !hasDefaultExport(targetCode)) errors.push(`${path} imports default "${s.local.name}" from ${target}, but no default export exists.`);
        if (s.type === 'ImportSpecifier' && !hasNamedExport(targetCode, s.imported.name)) errors.push(`${path} imports named "${s.imported.name}" from ${target}, but it is not exported.`);
      }
    }
  }
  const deps = files['/package.json']?.code;
  if (deps) { try { const p = JSON.parse(deps); for (const name of Object.keys({...p.dependencies,...p.devDependencies})) if (!/^[@a-zA-Z0-9._/-]+$/.test(name)) errors.push(`Invalid dependency name: ${name}`); } catch { errors.push('/package.json is invalid JSON.'); } }
  return [...new Set(errors)].slice(0, 20);
}
module.exports = { validateGeneratedFiles };
