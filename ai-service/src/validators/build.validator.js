const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const runtimeCheck = require('./runtime.check');

const BUILD_TIMEOUT_MS = Number.parseInt(process.env.AI_BUILD_TIMEOUT_MS || '120000', 10);
const DEFAULT_PACKAGE = { scripts: { build: 'vite build' }, dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' }, devDependencies: { vite: '^7.0.0', '@vitejs/plugin-react': '^5.0.0' }, type: 'module' };

// Generated app files may use a .js extension even when they contain JSX
// (App.js, Header.js, ...) -- the project's own static validator always
// parses .js/.jsx alike (generatedFiles.validator.js), but a plain
// `esbuild: { loader: 'jsx', include: /\.js$/ }` option does NOT make
// `vite build` transform .js files as JSX (verified empirically against
// vite@7 + @vitejs/plugin-react@5: Rollup still fails to parse the raw JSX,
// meaning that config only reaches esbuild's dep-scan step, not the actual
// per-module build transform). A small custom plugin that runs esbuild's
// jsx transform on .js files directly, via Vite's own transformWithEsbuild
// helper, is what actually works -- confirmed by building a real multi-file
// .js/JSX component tree end to end. Without this, App.js fails
// `vite build` with an import-analysis parse error on every generation.
const DEFAULT_VITE_CONFIG = `import { defineConfig, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    {
      name: 'treat-js-files-as-jsx',
      async transform(code, id) {
        if (!id.match(/\\.js$/)) return null;
        return transformWithEsbuild(code, id, { loader: 'jsx', jsx: 'automatic' });
      },
    },
    react(),
  ],
  optimizeDeps: {
    esbuildOptions: {
      loader: { '.js': 'jsx' },
    },
  },
});
`;

// The in-browser preview installs with --legacy-peer-deps, so a project only
// ever "worked" under that rule. Vercel runs a plain `npm install`, which
// aborts with ERESOLVE on any peer-range mismatch (e.g. a library that still
// declares react@^18 next to react@^19) -- the "works in preview, fails on
// Vercel" failure. Shipping the same rule as an .npmrc makes the preview, this
// validator and Vercel resolve dependencies identically.
const DEFAULT_NPMRC = 'legacy-peer-deps=true\n';

const DEFAULT_INDEX_HTML = '<!doctype html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>DevDrop</title></head><body><div id="root"></div><script type="module" src="/main.jsx"></script></body></html>';
const DEFAULT_MAIN_JSX = 'import React from "react"; import { createRoot } from "react-dom/client"; import App from "./App.js"; createRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);';

// Pure helper: fills in the scaffold files a generated site needs to build
// (package.json, index.html, main.jsx, vite.config.js) without ever
// overriding one the pipeline (architecture/code-gen/debug agent) already
// produced -- so a debug-agent-authored vite.config.js or package.json
// still wins over these defaults. Exported separately from run() so the
// scaffold logic can be unit-tested without shelling out to npm/vite.
function withScaffold(files, dependencies) {
  const out = { ...(files || {}) };
  if (!out['/package.json']) {
    const pkg = {
      ...DEFAULT_PACKAGE,
      dependencies: { ...DEFAULT_PACKAGE.dependencies, ...dependencies },
      devDependencies: { ...DEFAULT_PACKAGE.devDependencies },
    };
    out['/package.json'] = { code: JSON.stringify(pkg, null, 2) };
  } else {
    try {
      const pkg = JSON.parse(out['/package.json'].code);
      pkg.dependencies = { ...DEFAULT_PACKAGE.dependencies, ...(pkg.dependencies || {}), ...dependencies };
      pkg.devDependencies = { ...DEFAULT_PACKAGE.devDependencies, ...(pkg.devDependencies || {}) };
      if (!pkg.scripts?.build) pkg.scripts = { ...(pkg.scripts || {}), build: DEFAULT_PACKAGE.scripts.build };
      if (!pkg.type) pkg.type = DEFAULT_PACKAGE.type;
      out['/package.json'] = { code: JSON.stringify(pkg, null, 2) };
    } catch {
      // Static validation owns malformed package.json errors.
    }
  }
  if (!out['/index.html']) out['/index.html'] = { code: DEFAULT_INDEX_HTML };
  if (!out['/main.jsx']) out['/main.jsx'] = { code: DEFAULT_MAIN_JSX };
  if (!out['/vite.config.js']) out['/vite.config.js'] = { code: DEFAULT_VITE_CONFIG };
  if (!out['/.npmrc']) out['/.npmrc'] = { code: DEFAULT_NPMRC };
  return out;
}

async function run({ files, dependencies = {} }) {
  const started = Date.now();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devdrop-build-'));
  try {
    const withDefaults = withScaffold(files, dependencies);
    for (const [filePath, obj] of Object.entries(withDefaults)) {
      if (!filePath.startsWith('/') || filePath.includes('..')) continue;
      const target = path.join(dir, filePath.slice(1));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, obj.code, 'utf8');
    }
    // The validator builds the generated project itself, so devDependencies
    // are required even when the AI-service process is running in a production
    // environment. Without this, Vite and @vitejs/plugin-react can be omitted
    // by npm and the build fails with "vite: not found".
    const spawnOpts = {
      cwd: dir,
      timeout: BUILD_TIMEOUT_MS,
      maxBuffer: 5 * 1024 * 1024,
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        NODE_ENV: 'development',
        npm_config_production: 'false',
      },
    };
    await execFileAsync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['install', '--no-audit', '--no-fund', '--include=dev'],
      spawnOpts
    );
    const result = await execFileAsync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], spawnOpts);
    const warnings = result.stderr ? result.stderr.split('\n').filter(Boolean).slice(0, 20) : [];

    // A bundle that compiles can still render a black/white screen. Execute the
    // built site in a real browser and fail on uncaught exceptions, console
    // errors or an empty #root. The errors go to the debug agent like any
    // other build failure, so the project is repaired before it is ever pushed.
    const runtime = await runtimeCheck.checkDist(path.join(dir, 'dist'));
    if (!runtime.ok) {
      return {
        success: false,
        phase: 'runtime',
        errors: [`RUNTIME ERROR: the project builds, but opening the built site in a browser shows a broken/blank page. Fix the cause of these errors:\n- ${runtime.errors.join('\n- ')}`],
        warnings,
        runtime,
        durationMs: Date.now() - started,
      };
    }
    if (runtime.skipped) warnings.push(`Runtime check skipped: ${runtime.reason}`);
    return { success: true, errors: [], warnings, runtime, durationMs: Date.now() - started };
  } catch (error) {
    return { success: false, errors: [String(error.stderr || error.stdout || error.message).slice(-12000)], warnings: [], durationMs: Date.now() - started, exitCode: error.code || null };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
module.exports = { run, withScaffold };
