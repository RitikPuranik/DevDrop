const axios = require('axios');

const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || 'http://localhost:3001').replace(/\/$/, '');
const AI_SERVICE_TOKEN = process.env.AI_SERVICE_TOKEN || '';

function serviceHeaders() {
  return AI_SERVICE_TOKEN ? { 'x-service-key': AI_SERVICE_TOKEN } : {};
}

/**
 * POST /api/ai-generate
 * The main API only queues the work in ai-service and returns immediately.
 */
exports.generate = async (req, res) => {
  try {
    const { messages, fileData } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, message: 'No messages provided' });
    }

    const response = await axios.post(
      `${AI_SERVICE_URL}/jobs`,
      { messages, fileData: fileData || null, userId: req.userId || req.user?._id || null },
      { timeout: 10000, headers: serviceHeaders() }
    );

    return res.status(202).json(response.data);
  } catch (error) {
    console.error('AI service queue error:', error.response?.data || error.message);
    return res.status(503).json({
      success: false,
      message: 'AI service is unavailable. Start ai-service on port 3001 and try again.',
    });
  }
};

/**
 * GET /api/ai-generate/jobs/:id
 * Proxies job status without keeping the main request open during generation.
 */
exports.getJob = async (req, res) => {
  try {
    const response = await axios.get(`${AI_SERVICE_URL}/jobs/${encodeURIComponent(req.params.id)}`, {
      timeout: 10000,
      headers: serviceHeaders(),
    });
    return res.status(response.status).json(response.data);
  } catch (error) {
    const status = error.response?.status || 503;
    return res.status(status).json({
      success: false,
      message: error.response?.data?.message || 'Unable to read AI generation job status.',
    });
  }
};
