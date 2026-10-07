import { io } from 'socket.io-client';

// Single shared socket connection for the whole app (lazy — only connects
// once something actually subscribes to a job). Backend's socket.js emits
// ai-job:stage / ai-job:completed / ai-job:failed into the `ai-job:<jobId>`
// room this joins, replacing the old 2s poll loop in AiStudio.jsx.
let socket = null;
const subscribedJobs = new Set();
const subscribedKashiRuns = new Set();

function getSocket() {
  if (!socket) {
    const base = import.meta.env.VITE_API_URL || '';
    socket = io(base, { withCredentials: true, autoConnect: true, transports: ['websocket'] });
    socket.on('connect', () => {
      for (const jobId of subscribedJobs) socket.emit('ai-job:subscribe', jobId);
      for (const runId of subscribedKashiRuns) socket.emit('kashi-fix:subscribe', runId);
    });
  }
  return socket;
}

// Subscribes to one AI generation job's progress. Returns an unsubscribe
// function — call it once the job resolves/rejects or the component unmounts.
export function subscribeToJob(jobId, { onStage, onCompleted, onFailed }) {
  const s = getSocket();
  subscribedJobs.add(jobId);
  if (s.connected) s.emit('ai-job:subscribe', jobId);

  const handleStage = (payload) => { if (payload.jobId === jobId) onStage?.(payload); };
  const handleCompleted = (payload) => { if (payload.jobId === jobId) onCompleted?.(payload); };
  const handleFailed = (payload) => { if (payload.jobId === jobId) onFailed?.(payload); };

  s.on('ai-job:stage', handleStage);
  s.on('ai-job:completed', handleCompleted);
  s.on('ai-job:failed', handleFailed);

  return () => {
    s.off('ai-job:stage', handleStage);
    s.off('ai-job:completed', handleCompleted);
    s.off('ai-job:failed', handleFailed);
    subscribedJobs.delete(jobId);
    if (s.connected) s.emit('ai-job:unsubscribe', jobId);
    if (!subscribedJobs.size && !subscribedKashiRuns.size) {
      s.disconnect();
      socket = null;
    }
  };
}


// Subscribes to one Kashi fix run. Status and step events are pushed by the
// Backend after the Worker reports progress, so the UI does not poll.
export function subscribeToKashiRun(runId, { onStep, onStatus }) {
  const s = getSocket();
  subscribedKashiRuns.add(runId);
  const join = () => { if (s.connected) s.emit('kashi-fix:subscribe', runId); };
  join();

  const handleStep = (payload) => {
    if (payload?.runId === runId) onStep?.(payload);
  };
  const handleStatus = (payload) => {
    if (payload?.runId === runId) onStatus?.(payload);
  };

  s.on('kashi-fix:step', handleStep);
  s.on('kashi-fix:status', handleStatus);
  s.on('connect', join);

  return () => {
    s.off('kashi-fix:step', handleStep);
    s.off('kashi-fix:status', handleStatus);
    s.off('connect', join);
    subscribedKashiRuns.delete(runId);
    if (s.connected) s.emit('kashi-fix:unsubscribe', runId);
    if (!subscribedJobs.size && !subscribedKashiRuns.size) {
      s.disconnect();
      socket = null;
    }
  };
}
