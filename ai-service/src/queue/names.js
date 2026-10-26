'use strict';

// Must match backend/src/infrastructure/queue/names.js (a backend test asserts this).
const QUEUE_NAMES = Object.freeze({ AI: 'ai-queue' });
// Must match backend/src/infrastructure/queue/names.js. The backend publishes a job key here to stop a RUNNING job.
const AI_CANCEL_CHANNEL = 'ai-queue:cancel';
const JOB_TYPES = Object.freeze({ AI_GENERATE: 'AI_GENERATE' });

module.exports = { AI_CANCEL_CHANNEL, QUEUE_NAMES, JOB_TYPES };
