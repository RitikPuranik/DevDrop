'use strict';

// Must match backend/src/infrastructure/queue/names.js (a backend test asserts this).
const QUEUE_NAMES = Object.freeze({ AI: 'ai-queue' });
const JOB_TYPES = Object.freeze({ AI_GENERATE: 'AI_GENERATE' });

module.exports = { QUEUE_NAMES, JOB_TYPES };
