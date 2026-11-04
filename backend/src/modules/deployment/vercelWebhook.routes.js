const express = require('express');
const { vercelWebhookLimiter } = require('../../shared/middleware/rateLimit');
const { handleWebhook } = require('../../services/deployment/vercelWebhook.service');

const router = express.Router();

// Signature verification needs the exact bytes Vercel signed, so this router
// has its own raw-body parser and is mounted BEFORE the global JSON parser.
router.post('/', vercelWebhookLimiter, express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ? JSON.stringify(req.body) : '');
    const { status, body } = await handleWebhook(rawBody, req.headers);
    res.status(status).json(body);
  } catch (error) {
    console.error('[vercel-webhook] unexpected error:', error.message);
    res.status(500).json({ success: false, message: 'Webhook error' });
  }
});

module.exports = router;
