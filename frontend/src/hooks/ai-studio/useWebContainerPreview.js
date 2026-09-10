import { useCallback, useEffect, useRef, useState } from 'react';
import { WebContainer } from '@webcontainer/api';

const PREVIEW_STATES = {
  IDLE: 'idle',
  BOOTING: 'booting',
  MOUNTING: 'mounting',
  INSTALLING: 'installing',
  STARTING: 'starting',
  READY: 'ready',
  ERROR: 'error',
  UNSUPPORTED: 'unsupported',
};

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

let webContainerPromise = null;
let instance = null;

function createTree(files) {
  const tree = {};
  const paths = new Set();

  for (const file of Array.isArray(files) ? files : []) {
    if (!file?.path) continue;
    const cleanPath = String(file.path).replace(/^\/+/, '');
    if (!cleanPath || cleanPath.includes('..')) continue;
    const parts = cleanPath.split('/').filter(Boolean);
    if (!parts.length) continue;
    paths.add(cleanPath);

    let cursor = tree;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const dir = parts[i];
      cursor[dir] = cursor[dir] || { directory: {} };
      cursor = cursor[dir].directory;
    }
    cursor[parts.at(-1)] = { file: { contents: String(file.content ?? '') } };
  }

  return { tree, paths };
}

function getPackageJson(files) {
  const pkgFile = (files || []).find(
    (f) => String(f?.path || '').replace(/^\/+/, '') === 'package.json'
  );
  if (!pkgFile) return null;
  try {
    return JSON.parse(pkgFile.content || '{}');
  } catch {
    return null;
  }
}

function getStartCommand(pkg) {
  if (pkg?.scripts?.dev) return ['npm', ['run', 'dev', '--', '--host', '0.0.0.0']];
  if (pkg?.scripts?.start) return ['npm', ['run', 'start', '--', '--host', '0.0.0.0']];
  return null;
}

async function getContainer() {
  if (instance) return instance;
  if (!webContainerPromise) {
    webContainerPromise = WebContainer.boot({ forwardPreviewErrors: true })
      .then((container) => {
        instance = container;
        return container;
      })
      .catch((error) => {
        webContainerPromise = null;
        throw error;
      });
  }
  return webContainerPromise;
}

async function runAndWait(container, command, args, sendOutput, timeoutMs = 180000) {
  const process = await container.spawn(command, args);
  let output = '';
  const outputPromise = process.output.pipeTo(new WritableStream({
    write(data) {
      output += data;
      sendOutput?.(data);
    },
  })).catch(() => {});

  let timer;
  try {
    const exitCode = await Promise.race([
      process.exit,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Dependency installation timed out after 3 minutes.')), timeoutMs);
      }),
    ]);
    await outputPromise;
    return { exitCode, output };
  } catch (error) {
    try { process.kill(); } catch {}
    await outputPromise;
    if (error?.message?.includes('timed out')) {
      throw new Error(`${error.message}\n${output.slice(-4000)}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function useWebContainerPreview() {
  const [state, setState] = useState(PREVIEW_STATES.IDLE);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [output, setOutput] = useState('');
  const processRef = useRef(null);
  const mountedPathsRef = useRef(new Set());
  const packageJsonRef = useRef(null);
  const lastFilesRef = useRef(null);

  const mountFiles = useCallback(async (container, files) => {
    const { tree, paths } = createTree(files);
    for (const oldPath of mountedPathsRef.current) {
      if (!paths.has(oldPath)) {
        try {
          await container.fs.rm(oldPath, { force: true, recursive: true });
        } catch {}
      }
    }
    await container.mount(tree);
    mountedPathsRef.current = paths;
    return paths;
  }, []);

  const startProject = useCallback(async (container, files, restart = false) => {
    const pkg = getPackageJson(files);
    const packageJson = JSON.stringify(pkg || null);

    if (!pkg) {
      await mountFiles(container, [
        ...(files || []),
        { path: STATIC_SERVER_FILENAME, content: STATIC_SERVER },
      ]);
      if (!processRef.current || restart) {
        try { processRef.current?.kill?.(); } catch {}
        setState(PREVIEW_STATES.STARTING);
        processRef.current = await container.spawn('node', [STATIC_SERVER_FILENAME]);
      }
      return;
    }

    const command = getStartCommand(pkg);
    if (!command) throw new Error('This project has no "dev" or "start" script to preview.');

    const packageChanged = packageJsonRef.current !== packageJson;
    await mountFiles(container, files);

    if (!packageJsonRef.current || packageChanged) {
      setState(PREVIEW_STATES.INSTALLING);
      setOutput('');
      const install = await runAndWait(
        container,
        'npm',
        ['install', '--legacy-peer-deps', '--no-audit', '--no-fund'],
        (data) => {
          setOutput((current) => (current + data).slice(-8000));
          console.debug('[DevDrop preview]', data);
        },
      );
      if (install.exitCode !== 0) {
        throw new Error(`Dependency installation failed.\n${install.output.slice(-4000)}`);
      }
    }

    packageJsonRef.current = packageJson;

    if (processRef.current && (restart || packageChanged)) {
      try { processRef.current.kill(); } catch {}
      processRef.current = null;
    }

    if (!processRef.current) {
      setState(PREVIEW_STATES.STARTING);
      processRef.current = await container.spawn(command[0], command[1]);
      const runningProcess = processRef.current;
      runningProcess.output.pipeTo(new WritableStream({
        write(data) {
          setOutput((current) => (current + data).slice(-8000));
          console.debug('[DevDrop dev server]', data);
        },
      })).catch(() => {});
      runningProcess.exit.then((exitCode) => {
        if (processRef.current === runningProcess && exitCode !== 0) {
          setState(PREVIEW_STATES.ERROR);
          setError(`Development server exited with code ${exitCode}. Check the preview logs in the console.`);
          processRef.current = null;
        }
      }).catch(() => {});
    }
  }, [mountFiles]);

  const boot = useCallback(async (files) => {
    if (!Array.isArray(files) || files.length === 0) {
      setState(PREVIEW_STATES.ERROR);
      setError('No generated files to preview.');
      return;
    }
    if (!window.isSecureContext) {
      setState(PREVIEW_STATES.UNSUPPORTED);
      setError('Live preview needs HTTPS or localhost.');
      return;
    }
    if (!window.crossOriginIsolated) {
      setState(PREVIEW_STATES.ERROR);
      setError('WebContainer requires a cross-origin-isolated preview page. Open the preview as a full page and ensure COOP/COEP headers are enabled.');
      return;
    }

    try {
      lastFilesRef.current = files;
      setError(null);
      setState(PREVIEW_STATES.BOOTING);
      const container = await getContainer();
      container.on('server-ready', (_port, url) => {
        setPreviewUrl(url);
        setError(null);
        setState(PREVIEW_STATES.READY);
      });
      container.on('error', (eventError) => {
        setState(PREVIEW_STATES.ERROR);
        setError(eventError?.message || String(eventError));
      });
      setState(PREVIEW_STATES.MOUNTING);
      await startProject(container, files, false);
    } catch (err) {
      setState(PREVIEW_STATES.ERROR);
      setError(err?.message || 'Could not start the WebContainer preview.');
    }
  }, [startProject]);

  const updateFiles = useCallback(async (files) => {
    if (!Array.isArray(files) || files.length === 0) return;
    lastFilesRef.current = files;
    try {
      const container = await getContainer();
      setError(null);
      setState(PREVIEW_STATES.MOUNTING);
      await startProject(container, files, false);
      setReloadNonce((n) => n + 1);
    } catch (err) {
      setState(PREVIEW_STATES.ERROR);
      setError(err?.message || 'Could not apply the update to the preview.');
    }
  }, [startProject]);

  const retry = useCallback(async () => {
    if (lastFilesRef.current) await boot(lastFilesRef.current);
  }, [boot]);

  const refresh = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  useEffect(() => () => {
    try { processRef.current?.kill?.(); } catch {}
    processRef.current = null;
    // Do not tear down the singleton WebContainer; other components/routes can reuse it.
  }, []);

  return {
    state,
    previewUrl,
    error,
    reloadNonce,
    output,
    boot,
    updateFiles,
    retry,
    refresh,
    isReady: state === PREVIEW_STATES.READY,
    isLoading: [
      PREVIEW_STATES.BOOTING,
      PREVIEW_STATES.MOUNTING,
      PREVIEW_STATES.INSTALLING,
      PREVIEW_STATES.STARTING,
    ].includes(state),
  };
}

export { PREVIEW_STATES };
