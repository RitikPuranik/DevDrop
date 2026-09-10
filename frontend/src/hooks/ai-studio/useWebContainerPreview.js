import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useWebContainerPreview — runs an AI Studio generated project entirely
 * inside the browser via @webcontainer/api (Section 2/7 of the preview
 * spec). No deployment provider is ever involved.
 *
 * WebContainer only allows a single booted instance per browser tab, and
 * booting is slow, so the instance is a module-level singleton reused for
 * the lifetime of the tab — including across "Edit with AI" updates,
 * which just re-mount the changed files into the same instance instead of
 * rebooting (Section 7.11).
 */

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

// A tiny zero-dependency static file server, injected only for plain
// HTML/CSS/JS projects that have no package.json — so we never run
// `npm install` for something that doesn't need it (Section 8).
const STATIC_SERVER_FILENAME = '__devdrop_static_server.mjs';
const buildStaticServerScript = () => `
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const MIME = {
  '.html': 'text/html', '.htm': 'text/html', '.css': 'text/css',
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain',
};

const server = http.createServer(async (req, res) => {
  try {
    let reqPath = decodeURIComponent(req.url.split('?')[0]);
    if (reqPath === '/') reqPath = '/index.html';
    let filePath = path.join(ROOT, reqPath);
    let stat;
    try {
      stat = await fs.stat(filePath);
      if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
    } catch {
      filePath = path.join(ROOT, 'index.html');
    }
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch (err) {
    res.writeHead(404);
    res.end('Not found');
  }
});

const port = process.env.PORT || 4173;
server.listen(port, () => console.log('static server ready on ' + port));
`;

let containerInstance = null;
let bootPromise = null;

async function getWebContainer() {
  if (containerInstance) return containerInstance;
  if (!bootPromise) {
    bootPromise = import('@webcontainer/api').then(({ WebContainer }) => WebContainer.boot());
  }
  containerInstance = await bootPromise;
  return containerInstance;
}

/** Converts DevDrop's flat `[{ path, content }]` file list into the
 * nested tree shape `webcontainer.mount()` expects. */
function toFileSystemTree(files) {
  const tree = {};
  for (const file of files) {
    if (!file?.path) continue;
    // Defensive: never let a generated path escape the project root
    // (Section 19 — the same validation Genie's own pipeline enforces).
    const cleanPath = file.path.replace(/^\/+/, '');
    if (cleanPath.includes('..') || cleanPath.startsWith('/')) continue;

    const parts = cleanPath.split('/').filter(Boolean);
    let cursor = tree;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const dir = parts[i];
      cursor[dir] = cursor[dir] || { directory: {} };
      cursor = cursor[dir].directory;
    }
    const fileName = parts[parts.length - 1];
    if (fileName) cursor[fileName] = { file: { contents: file.content ?? '' } };
  }
  return tree;
}

function detectPackageJson(files) {
  const pkg = files.find((f) => f.path.replace(/^\/+/, '') === 'package.json');
  if (!pkg) return null;
  try {
    return JSON.parse(pkg.content);
  } catch {
    return null;
  }
}

function pickDevCommand(pkg) {
  const scripts = pkg?.scripts || {};
  if (scripts.dev) return 'dev';
  if (scripts.start) return 'start';
  return null;
}

async function runCommand(instance, command, args, onOutput) {
  const process = await instance.spawn(command, args);
  process.output.pipeTo(
    new WritableStream({
      write(data) {
        onOutput?.(data);
      },
    })
  );
  const exitCode = await process.exit;
  return exitCode;
}

export function useWebContainerPreview() {
  const [state, setState] = useState(PREVIEW_STATES.IDLE);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const devProcessRef = useRef(null);
  const bootedRef = useRef(false);
  const lastFilesRef = useRef(null);

  const cleanup = useCallback(async () => {
    try {
      devProcessRef.current?.kill?.();
    } catch {
      // Best-effort — the tab may already be tearing down.
    }
    devProcessRef.current = null;
  }, []);

  useEffect(() => () => {
    cleanup();
  }, [cleanup]);

  const boot = useCallback(async (files) => {
    if (!Array.isArray(files) || files.length === 0) {
      setState(PREVIEW_STATES.ERROR);
      setError('No generated files to preview.');
      return;
    }
    if (!window.isSecureContext) {
      setState(PREVIEW_STATES.UNSUPPORTED);
      setError('Live preview needs a secure (HTTPS or localhost) connection.');
      return;
    }

    try {
      setError(null);
      lastFilesRef.current = files;
      setState(PREVIEW_STATES.BOOTING);
      const instance = await getWebContainer();
      bootedRef.current = true;

      setState(PREVIEW_STATES.MOUNTING);
      const pkg = detectPackageJson(files);
      const tree = toFileSystemTree(files);

      if (!pkg) {
        // Plain static project (Section 8) — no npm install needed.
        tree[STATIC_SERVER_FILENAME] = { file: { contents: buildStaticServerScript() } };
        await instance.mount(tree);

        setState(PREVIEW_STATES.STARTING);
        instance.on('server-ready', (_port, url) => {
          setPreviewUrl(url);
          setState(PREVIEW_STATES.READY);
        });
        devProcessRef.current = await instance.spawn('node', [STATIC_SERVER_FILENAME]);
        return;
      }

      const devCommand = pickDevCommand(pkg);
      if (!devCommand) {
        setState(PREVIEW_STATES.UNSUPPORTED);
        setError('This project has no "dev" or "start" script to preview.');
        return;
      }

      await instance.mount(tree);

      setState(PREVIEW_STATES.INSTALLING);
      const installExit = await runCommand(instance, 'npm', ['install']);
      if (installExit !== 0) {
        setState(PREVIEW_STATES.ERROR);
        setError('Dependency installation failed for this project.');
        return;
      }

      setState(PREVIEW_STATES.STARTING);
      instance.on('server-ready', (_port, url) => {
        setPreviewUrl(url);
        setState(PREVIEW_STATES.READY);
      });
      devProcessRef.current = await instance.spawn('npm', ['run', devCommand, '--', '--host', '0.0.0.0']);
    } catch (err) {
      setState(PREVIEW_STATES.ERROR);
      setError(err?.message || 'Preview failed to start.');
    }
  }, []);

  /**
   * Applies an updated file set to the SAME running WebContainer instance
   * (an AI edit) rather than rebooting — the dev server (Vite/etc.)
   * hot-reloads on its own once files change on disk.
   */
  const updateFiles = useCallback(async (files) => {
    if (!containerInstance || !bootedRef.current) {
      // No running instance yet — behave like a fresh boot.
      return boot(files);
    }
    try {
      lastFilesRef.current = files;
      const tree = toFileSystemTree(files);
      await containerInstance.mount(tree);
      // Nudge the iframe in case the dev server doesn't HMR a particular
      // change (e.g. a config file edit).
      setReloadNonce((n) => n + 1);
    } catch (err) {
      setError(err?.message || 'Could not apply the update to the running preview.');
    }
  }, [boot]);

  const retry = useCallback(() => {
    if (lastFilesRef.current) boot(lastFilesRef.current);
  }, [boot]);

  const refresh = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  return {
    state,
    previewUrl,
    error,
    reloadNonce,
    boot,
    updateFiles,
    retry,
    refresh,
    isReady: state === PREVIEW_STATES.READY,
    isLoading: [PREVIEW_STATES.BOOTING, PREVIEW_STATES.MOUNTING, PREVIEW_STATES.INSTALLING, PREVIEW_STATES.STARTING].includes(state),
  };
}

export { PREVIEW_STATES };
