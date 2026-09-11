require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { randomUUID } = require('crypto');
const { generateApp } = require('./src/gemini.service');

const app = express();
const port = Number.parseInt(process.env.PORT || '3001', 10);
const serviceKey = process.env.SERVICE_API_KEY || '';
const jobs = new Map();

app.use(cors({ origin: process.env.AI_SERVICE_CORS_ORIGIN || true }));
app.use(express.json({ limit: '5mb' }));

function authenticate(req, res, next) {
  if (serviceKey && req.get('x-service-key') !== serviceKey) {
    return res.status(401).json({ success: false, message: 'Unauthorized AI service request' });
  }
  next();
}

app.get('/health', (_req, res) => {
  res.json({ success: true, service: 'ai-service', status: 'ok', queuedJobs: [...jobs.values()].filter((j) => j.status === 'queued').length });
});

app.post('/jobs', authenticate, (req, res) => {
  const { messages, fileData, userId } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, message: 'messages must be a non-empty array' });
  }

  const id = randomUUID();
  jobs.set(id, {
    id,
    userId: userId || null,
    status: 'queued',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    result: null,
    error: null,
  });

  void processJob(id, messages, fileData || null);
  return res.status(202).json({ success: true, data: { jobId: id, status: 'queued' } });
});

app.get('/jobs/:id', authenticate, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ success: false, message: 'AI job not found' });

  return res.json({
    success: true,
    data: {
      jobId: job.id,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      result: job.status === 'completed' ? job.result : null,
      error: job.status === 'failed' ? job.error : null,
    },
  });
});

async function processJob(id, messages, fileData) {
  const job = jobs.get(id);
  if (!job) return;

  job.status = 'processing';
  job.updatedAt = new Date().toISOString();

  try {
    const result = await generateApp({ messages, fileData });
    job.status = 'completed';
    job.result = result;
    job.updatedAt = new Date().toISOString();
    console.log('AI job completed', { jobId: id });
  } catch (error) {
    job.status = 'failed';
    job.error = error.userMessage || error.message || 'AI generation failed';
    job.updatedAt = new Date().toISOString();
    console.error('AI job failed', { jobId: id, message: error.message });
  }
}

// Keep completed jobs for 30 minutes in local-dev mode. Production should
// replace this Map with Redis/BullMQ or another durable queue/store.
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (Date.parse(job.updatedAt) < cutoff && job.status !== 'processing') jobs.delete(id);
  }
}, 5 * 60 * 1000).unref();

app.listen(port, () => {
  console.log(`🤖 DevDrop AI service running on port ${port}`);
});
