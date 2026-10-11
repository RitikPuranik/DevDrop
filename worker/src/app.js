const express = require('express');

// Health endpoint only (hosting platforms need an HTTP port). Work arrives through BullMQ, not HTTP.
// `queue` is injected so tests can stub Redis/BullMQ.
const createApp = ({ getHealth }) => {
  const app = express();

  app.get('/health', async (req, res) => {
    try {
      const health = await getHealth();
      res.status(health.ok ? 200 : 503).json({ success: health.ok, message: health.ok ? 'Worker is running' : 'Worker degraded', timestamp: new Date().toISOString(), ...health.details });
    } catch (error) {
      res.status(503).json({ success: false, message: 'Worker health check failed', timestamp: new Date().toISOString() });
    }
  });

  app.use((req, res) => res.status(404).json({ success: false, message: 'Not found' }));
  return app;
};

module.exports = { createApp };
