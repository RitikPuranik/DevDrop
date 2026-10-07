import { io } from 'socket.io-client';

// Single shared socket connection for the whole app (lazy — only connects
// once something actually subscribes to a job). Backend's socket.js emits
// ai-job:stage / ai-job:completed / ai-job:failed into the `ai-job:<jobId>`
// room this joins, replacing the old 2s poll loop in AiStudio.jsx.
let socket = null;

function getSocket() {
  if (!socket) {
    const base = import.meta.env.VITE_API_URL || '';
    socket = io(base, { withCredentials: true, autoConnect: true, transports: ['websocket', 'polling'] });
  }
  return socket;
}

// Subscribes to one AI generation job's progress. Returns an unsubscribe
// function — call it once the job resolves/rejects or the component unmounts.
export function subscribeToJob(jobId, { onStage, onCompleted, onFailed }) {
  const s = getSocket();
  s.emit('ai-job:subscribe', jobId);

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
    s.emit('ai-job:unsubscribe', jobId);
  };
}
