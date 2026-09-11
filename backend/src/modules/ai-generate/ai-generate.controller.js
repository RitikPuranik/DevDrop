const aiServiceClient = require('./aiServiceClient');
const jobOwners = require('./jobOwners');

/**
 * POST /api/ai-generate
 * body: { messages: [{role: 'user'|'assistant', content: string}], fileData?: { files, dependencies } | null }
 *
 * Delegates the actual (slow) Gemini generation to ai-service and returns
 * immediately with a jobId — this endpoint must respond in
 * milliseconds/seconds, never hold the connection open while Gemini runs.
 * returns: { success, data: { jobId, status: 'queued' } }
 */
exports.generate = async (req, res) => {
  try {
    const { messages, fileData } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, message: 'No messages provided' });
    }

    const jobId = await aiServiceClient.createJob({ messages, fileData: fileData || null });
    jobOwners.record(jobId, req.userId);

    res.status(202).json({ success: true, data: { jobId, status: 'queued' } });
  } catch (error) {
    console.error('AI generate error:', error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.userMessage || 'Failed to generate app',
    });
  }
};

/**
 * GET /api/ai-generate/jobs/:id
 *
 * Polled by the frontend while a job is queued/processing. Only the
 * DevDrop user who created the job (per the authenticated req.userId, not
 * anything the client sends) can read its status/result.
 * returns: { success, data: { jobId, status, result? , error? } }
 */
exports.getJob = async (req, res) => {
  try {
    const { id } = req.params;

    if (!jobOwners.isOwner(id, req.userId)) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const job = await aiServiceClient.getJob(id);

    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    res.status(200).json({ success: true, data: job });
  } catch (error) {
    console.error('AI job status error:', error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.userMessage || 'Failed to check AI generation status',
    });
  }
};
