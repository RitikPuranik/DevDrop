const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

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
    const pkg = { ...DEFAULT_PACKAGE, dependencies: { ...DEFAULT_PACKAGE.dependencies, ...dependencies } };
    out['/package.json'] = { code: JSON.stringify(pkg, null, 2) };
  }
  if (!out['/index.html']) out['/index.html'] = { code: DEFAULT_INDEX_HTML };
  if (!out['/main.jsx']) out['/main.jsx'] = { code: DEFAULT_MAIN_JSX };
  if (!out['/vite.config.js']) out['/vite.config.js'] = { code: DEFAULT_VITE_CONFIG };
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
    const spawnOpts = { cwd: dir, timeout: BUILD_TIMEOUT_MS, maxBuffer: 5 * 1024 * 1024, shell: process.platform === 'win32' };
    await execFileAsync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund'], spawnOpts);
    const result = await execFileAsync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], spawnOpts);
    return { success: true, errors: [], warnings: result.stderr ? result.stderr.split('\n').filter(Boolean).slice(0, 20) : [], durationMs: Date.now() - started };
  } catch (error) {
    return { success: false, errors: [String(error.stderr || error.stdout || error.message).slice(-12000)], warnings: [], durationMs: Date.now() - started, exitCode: error.code || null };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
module.exports = { run, withScaffold };
