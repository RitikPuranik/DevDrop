const { emitToJob } = require('../../shared/realtime/socket');

/**
 * Receives push updates from ai-service (per-agent stage completion, and
 * final job completion/failure) and re-emits them over the jobId's socket
 * room. This is what replaced the old poll loop:
 *   ai-service --webhook--> backend --socket--> frontend
 *
 * Secured with the same shared secret the backend already sends to
 * ai-service as X-Service-Key (AI_SERVICE_TOKEN on this side must match
 * SERVICE_API_KEY on ai-service's side) — no DevDrop user auth here since
 * ai-service has no concept of a logged-in user.
 */
exports.receive = (req, res) => {
  const provided = req.header('X-Service-Key');
  const expected = process.env.AI_SERVICE_TOKEN;
  if (!expected || !provided || provided !== expected) {
    return res.status(401).json({ success: false, message: 'Invalid or missing service key.' });
  }

  const { event, jobId } = req.body || {};
  if (!jobId || !['stage', 'completed', 'failed'].includes(event)) {
    return res.status(400).json({ success: false, message: 'Invalid webhook payload.' });
  }

  if (event === 'stage') {
    const { stage, status, details } = req.body;
    emitToJob(jobId, 'ai-job:stage', { jobId, stage, status, details: details || null });
  } else if (event === 'completed') {
    const { result, generationMeta } = req.body;
    emitToJob(jobId, 'ai-job:completed', { jobId, result, generationMeta });
  } else if (event === 'failed') {
    const { error } = req.body;
    emitToJob(jobId, 'ai-job:failed', { jobId, error });
  }

  // Always 200 quickly — ai-service does not retry, so anything else just
  // means this one push is lost; the job keeps running regardless.
  res.status(200).json({ success: true });
};
