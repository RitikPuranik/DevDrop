'use strict';

// Single source of truth for queue names and job types.
// ai-service keeps an identical copy of QUEUE_NAMES.AI in ai-service/src/queue/names.js
// (it deploys as a standalone package); a backend test asserts the two never drift.

const QUEUE_NAMES = Object.freeze({
  AI: 'ai-queue',
  DEPLOYMENT: 'deployment-queue',
  EVENTS: 'events-queue',
});

// Redis pub/sub channel the backend uses to tell the ai-service worker to stop a RUNNING job immediately.
// ai-service keeps an identical copy in ai-service/src/queue/names.js.
const AI_CANCEL_CHANNEL = 'ai-queue:cancel';

const JOB_TYPES = Object.freeze({
  // ai-queue
  AI_GENERATE: 'AI_GENERATE', // covers generate | edit | debug (payload.mode)
  // deployment-queue
  RUN_DEPLOYMENT: 'RUN_DEPLOYMENT',
  EXPORT_PROJECT: 'EXPORT_PROJECT',
  KASHI_FIX: 'KASHI_FIX',
  // events-queue: emails
  EMAIL_VERIFICATION: 'EMAIL_VERIFICATION',
  EMAIL_WELCOME: 'EMAIL_WELCOME',
  EMAIL_PASSWORD_RESET: 'EMAIL_PASSWORD_RESET',
  EMAIL_PURCHASE_CONFIRMATION: 'EMAIL_PURCHASE_CONFIRMATION',
  EMAIL_SELLER_NOTIFICATION: 'EMAIL_SELLER_NOTIFICATION',
  EMAIL_STATUS_UPDATE: 'EMAIL_STATUS_UPDATE',
  EMAIL_PAYOUT_NOTIFICATION: 'EMAIL_PAYOUT_NOTIFICATION',
  EMAIL_ADMIN_ALERT: 'EMAIL_ADMIN_ALERT',
  EMAIL_OUTBID: 'EMAIL_OUTBID',
  // events-queue: maintenance / scheduled
  OUTBOX_SWEEP: 'OUTBOX_SWEEP',
  PROCESS_ENDED_AUCTIONS: 'PROCESS_ENDED_AUCTIONS',
  AI_STUDIO_CLEANUP: 'AI_STUDIO_CLEANUP',
  SUPABASE_CLEANUP: 'SUPABASE_CLEANUP',
  RUN_BACKUP: 'RUN_BACKUP',
});

const EMAIL_JOB_TYPES = new Set([
  JOB_TYPES.EMAIL_VERIFICATION,
  JOB_TYPES.EMAIL_WELCOME,
  JOB_TYPES.EMAIL_PASSWORD_RESET,
  JOB_TYPES.EMAIL_PURCHASE_CONFIRMATION,
  JOB_TYPES.EMAIL_SELLER_NOTIFICATION,
  JOB_TYPES.EMAIL_STATUS_UPDATE,
  JOB_TYPES.EMAIL_PAYOUT_NOTIFICATION,
  JOB_TYPES.EMAIL_ADMIN_ALERT,
  JOB_TYPES.EMAIL_OUTBID,
]);

// BullMQ priority: lower number = processed first.
const PRIORITY = Object.freeze({ SECURITY: 1, TRANSACTIONAL: 5, NOTIFICATION: 10, MAINTENANCE: 20 });

module.exports = { AI_CANCEL_CHANNEL, QUEUE_NAMES, JOB_TYPES, EMAIL_JOB_TYPES, PRIORITY };
