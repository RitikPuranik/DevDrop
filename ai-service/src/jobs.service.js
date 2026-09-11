const { randomUUID } = require('crypto');
const { generateApp } = require('./gemini.service');

/**
 * In-memory job store + a tiny in-process queue.
 *
 * Deliberately NOT Redis/BullMQ (per migration scope) — just a Map and a
 * concurrency counter. Designed so a future Redis-backed queue can slot in
 * behind the same createJob/getJob interface without touching callers
 * (backend's ai-generate module, or the routes below).
 */

const JOB_TTL_MS = Number.parseInt(process.env.AI_JOB_TTL_MS || String(30 * 60 * 1000), 10); // 30 min
const CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.AI_CONCURRENCY || '1', 10) || 2
);

const jobs = new Map(); // jobId -> { id, status, payload, result, error, createdAt }
const queue = [];
let running = 0;

function scheduleExpiry(jobId) {
  setTimeout(() => {
    jobs.delete(jobId);
  }, JOB_TTL_MS).unref?.();
}

async function runJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return;

  job.status = 'processing';

  try {
    const result = await generateApp(job.payload);
    job.status = 'completed';
    job.result = result;
    job.error = null;
  } catch (error) {
    job.status = 'failed';
    job.error = error.userMessage || error.message || 'AI generation failed';
  } finally {
    job.payload = null; // no longer needed; avoid holding large fileData in memory
    scheduleExpiry(jobId);
    running -= 1;
    processQueue();
  }
}

function processQueue() {
  while (running < CONCURRENCY && queue.length > 0) {
    const jobId = queue.shift();
    const job = jobs.get(jobId);
    if (!job) continue; // expired/removed before it got a turn
    running += 1;
    runJob(jobId);
  }
}

/**
 * Enqueue a new AI generation job. Returns immediately with a jobId;
 * the existing Gemini generation logic (gemini.service.js) runs
 * asynchronously and is picked up via getJob().
 */
function createJob({ messages, fileData }) {
  const id = randomUUID();
  jobs.set(id, {
    id,
    status: 'queued',
    payload: { messages, fileData: fileData || null },
    result: null,
    error: null,
    createdAt: Date.now(),
  });
  queue.push(id);
  processQueue();
  return id;
}

function getJob(id) {
  return jobs.get(id) || null;
}

module.exports = { createJob, getJob };
