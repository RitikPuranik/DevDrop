'use strict';

// In-memory collections for the WhatsApp notification tests (built once per test file, like billingFakes).
const { makeCollection } = require('./fakeMongo');

const STATUSES = ['pending', 'sending', 'sent', 'failed', 'unconfirmed', 'skipped'];
const TYPES = ['SUBSCRIPTION_PURCHASED', 'SUBSCRIPTION_RENEWED', 'WEBSITE_PURCHASED', 'ADMIN_REPORT', 'WHATSAPP_TEST'];

const WhatsAppNotification = Object.assign(
  makeCollection({ unique: ['eventKey'], defaults: { status: 'pending', attempts: 0, ambiguousAttempts: 0, manualRetries: 0 } }),
  { STATUSES, TYPES, CATEGORIES: ['subscription', 'renewal', 'websitePurchase', 'adminReport', 'test'], aggregate: jest.fn(async () => []) }
);
const WhatsAppSettings = makeCollection({ unique: ['key'] });
const User = makeCollection({ unique: ['email'] });
const Website = makeCollection();
const Purchase = makeCollection({ unique: [['websiteId', 'buyerId']], defaults: { paymentStatus: 'completed' } });
const Payment = makeCollection();

const all = { WhatsAppNotification, WhatsAppSettings, User, Website, Purchase, Payment };
const reset = () => Object.values(all).forEach((c) => c.__reset());

const WA_ENV = {
  WHATSAPP_NOTIFICATIONS_ENABLED: 'true',
  WHATSAPP_ACCESS_TOKEN: 'EAAsecrettoken1234567890',
  WHATSAPP_PHONE_NUMBER_ID: '1234567890',
  WHATSAPP_ADMIN_PHONE_NUMBER: '919876543210',
  WHATSAPP_GRAPH_API_VERSION: 'v23.0',
};
const setWhatsAppEnv = (over = {}) => {
  clearWhatsAppEnv(); // optional tuning vars must not leak between tests
  Object.entries({ ...WA_ENV, ...over }).forEach(([k, v]) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; });
};
function clearWhatsAppEnv() {
  [...Object.keys(WA_ENV), 'WHATSAPP_MAX_AMBIGUOUS_RETRIES', 'WHATSAPP_NOTIFY_FREE_CLAIMS', 'WHATSAPP_JOB_ATTEMPTS'].forEach((k) => delete process.env[k]);
}

module.exports = { ...all, reset, setWhatsAppEnv, clearWhatsAppEnv, WA_ENV };
