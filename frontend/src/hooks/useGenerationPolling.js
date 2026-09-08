import { useCallback, useEffect, useRef, useState } from 'react';
import { aiStudioAPI } from '../api/ai';

const POLL_INTERVAL_MS = 3000;
const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled'];
const MAX_CONSECUTIVE_NETWORK_FAILURES = 5;

/**
 * Polls GET /ai/generation/jobs/:jobId until the job reaches a terminal
 * state. Progress reflects real job state only — no fake timers
 * (Section 18/19).
 */
export function useGenerationPolling(jobId) {
  const [job, setJob] = useState(null);
  const [pollError, setPollError] = useState(null);
  const timeoutRef = useRef(null);
  const failureCountRef = useRef(0);
  const stoppedRef = useRef(false);

  const poll = useCallback(async () => {
    if (stoppedRef.current || !jobId) return;
    try {
      const res = await aiStudioAPI.getJobStatus(jobId);
      failureCountRef.current = 0;
      setPollError(null);
      const data = res.data;
      setJob(data);

      if (!TERMINAL_STATUSES.includes(data.status) && !stoppedRef.current) {
        timeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    } catch (err) {
      failureCountRef.current += 1;
      // Transient network hiccups shouldn't kill the poll loop immediately —
      // back off and keep trying a few times before surfacing an error.
      if (failureCountRef.current >= MAX_CONSECUTIVE_NETWORK_FAILURES) {
        setPollError(err.response?.data?.message || 'Lost connection while checking generation status.');
        return;
      }
      if (!stoppedRef.current) {
        timeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS * 2);
      }
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return undefined;
    stoppedRef.current = false;
    failureCountRef.current = 0;
    setJob(null);
    setPollError(null);
    poll();

    return () => {
      stoppedRef.current = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [jobId, poll]);

  const isPolling = job ? !TERMINAL_STATUSES.includes(job.status) : Boolean(jobId);

  return { job, pollError, isPolling };
}
