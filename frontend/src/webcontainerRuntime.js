import { WebContainer } from '@webcontainer/api';

const SOURCE = 'devdrop-webcontainer-runtime';
const STATIC_SERVER_FILENAME = '__devdrop_static_server.mjs';

const STATIC_SERVER = `
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  try {
    let reqPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (reqPath === '/') reqPath = '/index.html';
    let filePath = path.join(ROOT, reqPath);
    try {
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
    } catch {
      filePath = path.join(ROOT, 'index.html');
    }
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

const port = process.env.PORT || 4173;
server.listen(port, () => console.log('static server ready on ' + port));
`;

let instance = null;
let devProcess = null;
let initialized = false;
let currentPaths = new Set();
let currentPackageJson = null;

function send(type, payload = {}) {
  window.parent.postMessage({ source: SOURCE, type, ...payload }, '*');
}

function toTree(files) {
  const tree = {};
  const nextPaths = new Set();

  for (const file of Array.isArray(files) ? files : []) {
    if (!file?.path) continue;
    const cleanPath = String(file.path).replace(/^\/+/, '');
    if (!cleanPath || cleanPath.includes('..')) continue;
    const parts = cleanPath.split('/').filter(Boolean);
    if (!parts.length) continue;
    nextPaths.add(cleanPath);

    let cursor = tree;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const dir = parts[i];
      cursor[dir] = cursor[dir] || { directory: {} };
      cursor = cursor[dir].directory;
    }
    cursor[parts.at(-1)] = { file: { contents: file.content ?? '' } };
  }

  return { tree, paths: nextPaths };
}

function getPackageJson(files) {
  const pkgFile = (files || []).find((f) => String(f?.path || '').replace(/^\/+/, '') === 'package.json');
  if (!pkgFile) return null;
  try {
    return JSON.parse(pkgFile.content || '{}');
  } catch {
    return null;
  }
}

function getDevScript(pkg) {
  if (pkg?.scripts?.dev) return 'dev';
  if (pkg?.scripts?.start) return 'start';
  return null;
}

async function runAndWait(command, args) {
  const process = await instance.spawn(command, args);
  let output = '';
  process.output.pipeTo(new WritableStream({
    write(data) {
      output += data;
      send('process-output', { data });
    },
  }));
  const exitCode = await process.exit;
  return { exitCode, output };
}

async function removeDeletedPaths(nextPaths) {
  for (const oldPath of currentPaths) {
    if (nextPaths.has(oldPath)) continue;
    // Never touch dependencies or injected runtime files.
    if (oldPath === 'node_modules' || oldPath.startsWith('node_modules/')) continue;
    try {
      await instance.fs.rm(oldPath, { force: true });
    } catch {
      // A directory may disappear along with its last file; ignore it.
    }
  }
}

async function mountFiles(files) {
  const { tree, paths } = toTree(files);
  await removeDeletedPaths(paths);
  await instance.mount(tree);
  currentPaths = paths;
}

async function startProject(files, forceRestart = false) {
  const pkg = getPackageJson(files);
  const nextPackageJson = JSON.stringify(pkg || null);

  if (!pkg) {
    if (forceRestart && devProcess) {
      try { devProcess.kill(); } catch {}
      devProcess = null;
    }
    const { tree } = toTree(files);
    tree[STATIC_SERVER_FILENAME] = { file: { contents: STATIC_SERVER } };
    await mountFiles([
      ...(files || []),
      { path: STATIC_SERVER_FILENAME, content: STATIC_SERVER },
    ]);

    if (!devProcess) {
      send('state', { state: 'starting' });
      devProcess = await instance.spawn('node', [STATIC_SERVER_FILENAME]);
    }
    return;
  }

  const script = getDevScript(pkg);
  if (!script) {
    throw new Error('This project has no "dev" or "start" script to preview.');
  }

  const packageChanged = currentPackageJson !== nextPackageJson;
  await mountFiles(files);

  if (!initialized || packageChanged) {
    send('state', { state: 'installing' });
    const install = await runAndWait('npm', ['install']);
    if (install.exitCode !== 0) {
      throw new Error(`Dependency installation failed.\n${install.output.slice(-3000)}`);
    }
  }

  if (devProcess && (forceRestart || packageChanged)) {
    try { devProcess.kill(); } catch {}
    devProcess = null;
  }

  currentPackageJson = nextPackageJson;

  if (!devProcess) {
    send('state', { state: 'starting' });
    devProcess = await instance.spawn('npm', ['run', script, '--', '--host', '0.0.0.0']);
  }
}

async function bootProject(files) {
  if (!window.crossOriginIsolated) {
    throw new Error('Preview runtime is not cross-origin isolated. Reload DevDrop and try again.');
  }
  if (!window.isSecureContext) {
    throw new Error('Live preview needs HTTPS or localhost.');
  }

  send('state', { state: 'booting' });
  instance = await WebContainer.boot({ forwardPreviewErrors: true });

  instance.on('server-ready', (_port, url) => {
    send('ready', { url });
  });
  instance.on('error', (error) => {
    send('error', { message: error?.message || String(error) });
  });

  await startProject(files);
  initialized = true;
}

window.addEventListener('message', async (event) => {
  if (event.source !== window.parent || event.data?.source !== SOURCE) return;

  try {
    if (event.data.type === 'boot') {
      await bootProject(event.data.files || []);
      send('boot-complete');
      return;
    }

    if (event.data.type === 'update') {
      send('state', { state: 'mounting' });
      await startProject(event.data.files || []);
      send('updated');
      return;
    }

    if (event.data.type === 'restart') {
      await startProject(event.data.files || [], true);
      send('updated');
      return;
    }

    if (event.data.type === 'dispose') {
      try { devProcess?.kill?.(); } catch {}
      devProcess = null;
      instance = null;
      initialized = false;
      currentPaths = new Set();
      currentPackageJson = null;
      send('disposed');
    }
  } catch (error) {
    send('error', { message: error?.message || String(error) });
  }
});

send('runtime-ready', { crossOriginIsolated: window.crossOriginIsolated === true });
