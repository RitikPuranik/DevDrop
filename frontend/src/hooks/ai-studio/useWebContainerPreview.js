import { useCallback, useEffect, useRef, useState } from 'react';

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

const RUNTIME_URL = '/webcontainer-runtime.html';
const SOURCE = 'devdrop-webcontainer-runtime';

let runtimeFrame = null;
let runtimeReadyPromise = null;
let runtimeReadyResolve = null;
let runtimeReadyReject = null;
let runtimeHandler = null;

function ensureRuntimeFrame() {
  if (runtimeFrame?.isConnected) return runtimeReadyPromise;

  runtimeReadyPromise = new Promise((resolve, reject) => {
    runtimeReadyResolve = resolve;
    runtimeReadyReject = reject;
  });

  runtimeHandler = (event) => {
    if (event.source !== runtimeFrame?.contentWindow || event.data?.source !== SOURCE) return;
    const message = event.data;
    if (message.type === 'runtime-ready') {
      if (!message.crossOriginIsolated) {
        const isolationError = new Error('WebContainer runtime is not cross-origin isolated. Check COOP/COEP headers.');
        runtimeReadyReject?.(isolationError);
        // A rejected runtime promise must not be cached; retrying should create
        // a fresh iframe after headers/configuration have been corrected.
        runtimeFrame?.remove();
        runtimeFrame = null;
        runtimeReadyPromise = null;
        runtimeReadyResolve = null;
        runtimeReadyReject = null;
        return;
      }
      runtimeReadyResolve?.();
      runtimeReadyResolve = null;
      runtimeReadyReject = null;
    }
  };

  window.addEventListener('message', runtimeHandler);

  runtimeFrame = document.createElement('iframe');
  runtimeFrame.title = 'DevDrop WebContainer runtime';
  runtimeFrame.setAttribute('aria-hidden', 'true');
  runtimeFrame.tabIndex = -1;
  runtimeFrame.style.position = 'fixed';
  runtimeFrame.style.width = '1px';
  runtimeFrame.style.height = '1px';
  runtimeFrame.style.opacity = '0';
  runtimeFrame.style.pointerEvents = 'none';
  runtimeFrame.style.border = '0';
  runtimeFrame.style.left = '-10px';
  runtimeFrame.style.top = '-10px';
  runtimeFrame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  runtimeFrame.src = RUNTIME_URL;
  runtimeFrame.onload = () => {
    // The runtime sends its own ready event. This fallback prevents an
    // indefinitely pending promise if the script was already cached.
    try {
      runtimeFrame.contentWindow?.postMessage({ source: SOURCE, type: 'ping' }, '*');
    } catch {}
  };
  runtimeFrame.onerror = () => runtimeReadyReject?.(new Error('Could not load the WebContainer runtime.'));
  document.body.appendChild(runtimeFrame);

  return runtimeReadyPromise;
}

function postToRuntime(message) {
  runtimeFrame?.contentWindow?.postMessage({ source: SOURCE, ...message }, '*');
}

function destroyRuntimeFrame() {
  if (runtimeHandler) window.removeEventListener('message', runtimeHandler);
  runtimeHandler = null;
  try {
    runtimeFrame?.contentWindow?.postMessage({ source: SOURCE, type: 'dispose' }, '*');
  } catch {}
  runtimeFrame?.remove();
  runtimeFrame = null;
  runtimeReadyPromise = null;
  runtimeReadyResolve = null;
  runtimeReadyReject = null;
}

export function useWebContainerPreview() {
  const [state, setState] = useState(PREVIEW_STATES.IDLE);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const lastFilesRef = useRef(null);
  const bootedRef = useRef(false);

  useEffect(() => {
    const handler = (event) => {
      if (event.source !== runtimeFrame?.contentWindow || event.data?.source !== SOURCE) return;
      const message = event.data;
      if (message.type === 'state') setState(message.state);
      if (message.type === 'ready') {
        setPreviewUrl(message.url);
        setError(null);
        setState(PREVIEW_STATES.READY);
      }
      if (message.type === 'updated') {
        setReloadNonce((n) => n + 1);
      }
      if (message.type === 'error') {
        setState(PREVIEW_STATES.ERROR);
        setError(message.message || 'Preview failed to start.');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

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

    try {
      setError(null);
      lastFilesRef.current = files;
      setState(PREVIEW_STATES.BOOTING);
      await ensureRuntimeFrame();
      postToRuntime({ type: 'boot', files });
      bootedRef.current = true;
    } catch (err) {
      setState(PREVIEW_STATES.ERROR);
      setError(err?.message || 'Could not start the isolated preview runtime.');
    }
  }, []);

  const updateFiles = useCallback(async (files) => {
    if (!Array.isArray(files) || files.length === 0) return;
    lastFilesRef.current = files;
    if (!bootedRef.current || !runtimeFrame?.isConnected) {
      await boot(files);
      return;
    }
    try {
      setError(null);
      postToRuntime({ type: 'update', files });
    } catch (err) {
      setState(PREVIEW_STATES.ERROR);
      setError(err?.message || 'Could not apply the update to the preview.');
    }
  }, [boot]);

  const retry = useCallback(async () => {
    if (lastFilesRef.current) {
      await boot(lastFilesRef.current);
    }
  }, [boot]);

  const refresh = useCallback(() => setReloadNonce((n) => n + 1), []);

  useEffect(() => () => {
    destroyRuntimeFrame();
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
    isLoading: [
      PREVIEW_STATES.BOOTING,
      PREVIEW_STATES.MOUNTING,
      PREVIEW_STATES.INSTALLING,
      PREVIEW_STATES.STARTING,
    ].includes(state),
  };
}

export { PREVIEW_STATES };
