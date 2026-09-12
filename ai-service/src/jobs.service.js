const { randomUUID } = require('crypto');
const { generateWebsite } = require('./orchestrator/websiteGeneration.orchestrator');
const { editWebsite } = require('./orchestrator/websiteEditing.orchestrator');

const JOB_TTL_MS = Number.parseInt(process.env.AI_JOB_TTL_MS || String(30 * 60 * 1000), 10);
const CONCURRENCY = Math.max(1, Number.parseInt(process.env.AI_CONCURRENCY || '1', 10) || 1);
const jobs = new Map();
const queue = [];
let running = 0;

function scheduleExpiry(id) { setTimeout(() => jobs.delete(id), JOB_TTL_MS).unref?.(); }
async function runJob(id) {
  const job = jobs.get(id); if (!job) return;
  job.status = 'processing'; job.currentStage = 'starting';
  try {
    const run = job.payload.mode === 'edit' ? editWebsite : generateWebsite;
    const result = await run(job.payload, { onStage: (stage, status, details) => { job.currentStage = stage; job.stageStatus = status; if (details) job.generationMeta.agents = job.generationMeta.agents.filter((a) => a.name !== stage).concat(details); } });
    job.status = 'completed'; job.result = result; job.error = null; job.currentStage = 'completed';
  } catch (error) {
    job.status = 'failed'; job.error = error.userMessage || error.message || 'AI generation failed'; job.currentStage = 'failed';
  } finally { job.payload = null; scheduleExpiry(id); running -= 1; processQueue(); }
}
function processQueue() { while (running < CONCURRENCY && queue.length) { const id = queue.shift(); if (!jobs.has(id)) continue; running += 1; runJob(id); } }
function createJob(input) {
  const id = randomUUID();
  jobs.set(id, { id, status: 'queued', currentStage: 'queued', stageStatus: 'queued', payload: input, result: null, error: null, generationMeta: { agents: [] }, createdAt: Date.now() });
  queue.push(id); processQueue(); return id;
}
function getJob(id) { return jobs.get(id) || null; }
module.exports = { createJob, getJob };
