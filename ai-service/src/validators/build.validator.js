const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const BUILD_TIMEOUT_MS = Number.parseInt(process.env.AI_BUILD_TIMEOUT_MS || '120000', 10);
const DEFAULT_PACKAGE = { scripts: { build: 'vite build' }, dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' }, devDependencies: { vite: '^7.0.0', '@vitejs/plugin-react': '^5.0.0' }, type: 'module' };

async function run({ files, dependencies = {} }) {
  const started = Date.now();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devdrop-build-'));
  try {
    for (const [filePath, obj] of Object.entries(files || {})) {
      if (!filePath.startsWith('/') || filePath.includes('..')) continue;
      const target = path.join(dir, filePath.slice(1));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, obj.code, 'utf8');
    }
    if (!fs.existsSync(path.join(dir, 'package.json'))) {
      const pkg = { ...DEFAULT_PACKAGE, dependencies: { ...DEFAULT_PACKAGE.dependencies, ...dependencies } };
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
    }
    if (!fs.existsSync(path.join(dir, 'index.html'))) fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>DevDrop</title></head><body><div id="root"></div><script type="module" src="/main.jsx"></script></body></html>');
    if (!fs.existsSync(path.join(dir, 'main.jsx'))) fs.writeFileSync(path.join(dir, 'main.jsx'), 'import React from "react"; import { createRoot } from "react-dom/client"; import App from "./App.js"; createRoot(document.getElementById("root")).render(<React.StrictMode><App /></React.StrictMode>);');
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
module.exports = { run };
