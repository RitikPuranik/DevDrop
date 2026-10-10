const { randomUUID } = require('crypto');
const { generateWebsite, debugWebsite } = require('./orchestrator/websiteGeneration.orchestrator');
const { editWebsite } = require('./orchestrator/websiteEditing.orchestrator');
const webhook = require('./webhook.service');
const { runWithJob } = require('./utils/jobContext');

const JOB_TTL_MS = Number.parseInt(process.env.AI_JOB_TTL_MS || String(30 * 60 * 1000), 10);
const CONCURRENCY = Math.max(1, Number.parseInt(process.env.AI_CONCURRENCY || '1', 10) || 1);
const jobs = new Map();
const queue = [];
// Jobs that were waiting for Gemini capacity and want their worker slot back.
const resumeWaiters = [];
let running = 0;

function scheduleExpiry(id) { setTimeout(() => jobs.delete(id), JOB_TTL_MS).unref?.(); }
function acquireSlot() {
  return new Promise((resolve) => {
    if (running < CONCURRENCY) { running += 1; resolve(); } else resumeWaiters.push(resolve);
  });
}
async function runJob(id) {
  const job = jobs.get(id); if (!job) return;
  job.status = 'processing'; job.currentStage = 'starting'; job.slotHeld = true;
  const isFinished = () => job.status === 'completed' || job.status === 'failed';
  // Lets llm.service report "Waiting for Gemini capacity" and hand this job's
  // worker slot to other jobs while it waits (no worker is parked on a sleep).
  const jobContext = {
    jobId: id,
    isCancelled: isFinished,
    onCapacityWait: async (info) => {
      if (isFinished()) return null;
      job.stageStatus = 'waiting_for_capacity'; job.statusMessage = info.message; job.waitingUntil = info.retryAt; job.capacityWaits = (job.capacityWaits || 0) + 1;
      webhook.notifyStage(id, job.currentStage, 'waiting_for_capacity', { message: info.message, retryAt: info.retryAt, reason: info.reason });
      if (job.slotHeld) { job.slotHeld = false; running -= 1; processQueue(); }
      return async () => {
        if (isFinished()) return; // timed out while waiting: never re-take a slot
        await acquireSlot();
        job.slotHeld = true; job.stageStatus = 'processing'; job.statusMessage = null; job.waitingUntil = null;
        webhook.notifyStage(id, job.currentStage, 'processing', null);
      };
    },
  };
  try {
    const run = job.payload.mode === 'debug' ? debugWebsite : (job.payload.mode === 'edit' ? editWebsite : generateWebsite);
    const result = await runWithJob(jobContext, () => run(job.payload, {
      onStage: (stage, status, details) => {
        job.currentStage = stage; job.stageStatus = status;
        if (details) job.generationMeta.agents = job.generationMeta.agents.filter((a) => a.name !== stage).concat(details);
        // Push this agent's progress to the backend as it happens, instead
        // of waiting for the backend to poll GET /jobs/:id for it.
        webhook.notifyStage(id, stage, status, details);
      },
    }));
    job.status = 'completed'; job.result = result; job.error = null; job.errorType = null; job.currentStage = 'completed';
    webhook.notifyComplete(id, job);
  } catch (error) {
    job.status = 'failed'; job.error = error.userMessage || error.message || 'AI generation failed'; job.currentStage = 'failed'; if (error.debugContext) job.debugContext = error.debugContext;
    // Keep "Gemini had no capacity for a while" distinguishable from a real generation failure.
    job.errorType = error.code === 'GEMINI_POOL_EXHAUSTED' && error.temporary ? 'capacity_exhausted' : 'failed';
    webhook.notifyComplete(id, job);
  } finally { job.payload = null; scheduleExpiry(id); if (job.slotHeld) { job.slotHeld = false; running -= 1; } processQueue(); }
}
function processQueue() {
  while (running < CONCURRENCY && resumeWaiters.length) { running += 1; resumeWaiters.shift()(); }
  while (running < CONCURRENCY && queue.length) { const id = queue.shift(); if (!jobs.has(id)) continue; running += 1; runJob(id); }
}
function createJob(input) {
  const id = randomUUID();
  jobs.set(id, { id, mode: input.mode || 'generate', status: 'queued', currentStage: 'queued', stageStatus: 'queued', payload: input, result: null, error: null, debugContext: input.debugContext || null, generationMeta: { agents: [] }, createdAt: Date.now() });
  queue.push(id); processQueue(); return id;
}

function createDebugJob(input) {
 const id = randomUUID();
 jobs.set(id, { id, mode: 'debug', status: 'queued', currentStage: 'queued', stageStatus: 'queued', payload: { mode: 'debug', ...input }, result: null, error: null, debugContext: null, generationMeta: { agents: [] }, createdAt: Date.now() });
 queue.push(id); processQueue(); return id;
}

function getJob(id) { return jobs.get(id) || null; }
module.exports = { createJob, createDebugJob, getJob };
