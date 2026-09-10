import { useCallback, useRef, useState } from 'react';
import { aiStudioAPI } from '../../api/ai';

const POLL_INTERVAL_MS = 2000;
const TERMINAL = ['completed', 'error'];

/**
 * Drives the "Edit with AI" request/poll cycle (Section 15/17). Genie's
 * /api/chat only enqueues an edit and returns a chat job id — this hook
 * polls GET /generation/jobs/:jobId/modify/:chatJobId until it resolves,
 * rather than trusting the generation's own status (see Section 26).
 */
export function useModifyPolling({ jobId, onApplied, onFailed }) {
  const [status, setStatus] = useState('idle'); // idle | pending | processing | completed | error
  const stoppedRef = useRef(true);
  const timeoutRef = useRef(null);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const poll = useCallback(async (chatJobId) => {
    if (stoppedRef.current) return;
    try {
      const res = await aiStudioAPI.getModifyStatus(jobId, chatJobId);
      const data = res.data;
      setStatus(data.status);

      if (data.status === 'completed') {
        stoppedRef.current = true;
        onApplied?.(data);
        return;
      }
      if (data.status === 'error') {
        stoppedRef.current = true;
        onFailed?.(data.message || 'Could not apply this change.');
        return;
      }
      if (!stoppedRef.current) {
        timeoutRef.current = setTimeout(() => poll(chatJobId), POLL_INTERVAL_MS);
      }
    } catch (err) {
      stoppedRef.current = true;
      onFailed?.(err.response?.data?.message || 'Lost connection while applying your edit.');
    }
  }, [jobId, onApplied, onFailed]);

  const start = useCallback((chatJobId) => {
    stop();
    stoppedRef.current = false;
    setStatus('pending');
    poll(chatJobId);
  }, [poll, stop]);

  return { status, start, stop, isActive: !TERMINAL.includes(status) && status !== 'idle' };
}
