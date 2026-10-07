import { useCallback, useEffect, useRef, useState } from 'react';
import { aiStudioAPI } from '../../api/aiStudio';

// While the tab is visible, a lightweight heartbeat keeps the project
// marked alive. When the tab is hidden the heartbeat stops entirely --
// activity/heartbeat timestamps go stale and the backend's inactivity
// cleanup worker eventually reclaims the project. Refresh, tab close, a
// crashed browser, or a dead network all reduce to the same thing from the
// backend's point of view: heartbeats simply stop arriving. This is
// intentionally NOT the only mechanism -- see `pagehide` best-effort below
// -- but it is the one the system can always rely on.
const HEARTBEAT_INTERVAL_MS = 60 * 1000;

/**
 * Manages one AI Studio project/session for the lifetime of this component.
 * Deliberately keeps projectId/sessionId in React state only (not
 * localStorage/sessionStorage): a full page refresh clears them, the old
 * session's heartbeat stops, and the next call to `open()` starts a fresh
 * project. The old project is then reclaimed by the backend's inactivity
 * cleanup rather than anything client-side trying to delete it directly.
 */
export function useAiStudioSession() {
  const [projectId, setProjectId] = useState(null);
  const projectIdRef = useRef(null);
  const sessionIdRef = useRef(null);
  const heartbeatRef = useRef(null);

  if (!sessionIdRef.current) {
    sessionIdRef.current = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  }

  const open = useCallback(async (websiteType) => {
    try {
      const { data } = await aiStudioAPI.openSession(sessionIdRef.current, null, websiteType);
      const id = data?.data?.projectId;
      if (!id) throw new Error(data?.message || 'AI Studio session was created without a project ID.');
      projectIdRef.current = id;
      setProjectId(id);
      return id;
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || 'Failed to initialize AI Studio project.';
      console.error('AI Studio session open failed:', err);
      throw new Error(message);
    }
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const beat = useCallback(() => {
    if (!projectId) return;
    aiStudioAPI.heartbeat(projectId, sessionIdRef.current).catch(() => {});
  }, [projectId]);

  const startHeartbeat = useCallback(() => {
    stopHeartbeat();
    if (!projectId || document.visibilityState !== 'visible') return;
    beat(); // register activity immediately on resume, don't wait a full interval
    heartbeatRef.current = setInterval(beat, HEARTBEAT_INTERVAL_MS);
  }, [projectId, beat, stopHeartbeat]);

  useEffect(() => {
    startHeartbeat();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') startHeartbeat();
      else stopHeartbeat();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    // Best-effort only (Section 8) -- browsers don't guarantee this fires
    // or that any async work inside it completes, so it is never the sole
    // cleanup mechanism. It just gives the backend a head start.
    const onPageHide = () => {
      if (!projectId) return;
      try {
        navigator.sendBeacon?.(
          `${import.meta.env.VITE_API_URL}/api/ai-studio/${projectId}/close`,
          new Blob([JSON.stringify({ sessionId: sessionIdRef.current })], { type: 'application/json' })
        );
      } catch {
        // ignore -- inactivity cleanup remains the real safety net
      }
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      stopHeartbeat();
    };
  }, [projectId, startHeartbeat, stopHeartbeat]);

  const getProjectId = useCallback(() => projectIdRef.current || projectId, [projectId]);

  const syncFiles = useCallback(
    (payload) => {
      const id = projectIdRef.current || projectId;
      if (!id) return Promise.reject(new Error('AI Studio project is not initialized.'));
      return aiStudioAPI.sync(id, payload);
    },
    [projectId]
  );

  const uploadAsset = useCallback(
    (file, projectIdOverride = null) => {
      const id = projectIdOverride || projectIdRef.current || projectId;
      if (!id) return Promise.reject(new Error('AI Studio project is not initialized. Start the AI Studio session first.'));
      return aiStudioAPI.uploadAsset(id, file);
    },
    [projectId]
  );

  const recordActivity = useCallback(() => {
    if (!projectId) return;
    aiStudioAPI.recordActivity(projectId).catch(() => {});
  }, [projectId]);

  return { projectId, sessionId: sessionIdRef.current, open, getProjectId, syncFiles, uploadAsset, recordActivity };
}
