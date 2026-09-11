const mongoose = require('mongoose');

/**
 * Same schema/collection as backend/src/modules/gemini-pool/geminiApiKey.model.js.
 * ai-service is a separate process/deployment from the main backend, so it
 * can't `require()` the backend's code — this is a deliberate, minimal
 * duplication of the schema shape rather than a shared package, kept in
 * sync manually. The backend owns admin CRUD + encryption; ai-service only
 * reads config from here and writes back live health/usage fields.
 */

const GEMINI_KEY_STATUSES = [
  'healthy',
  'busy',
  'rate_limited',
  'degraded',
  'invalid',
  'disabled',
];

const geminiApiKeySchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, required: true },
    encryptedKey: { type: String, required: true, select: false },
    keySuffix: { type: String },
    keyPrefix: { type: String, default: 'AIza' },

    enabled: { type: Boolean, default: true, index: true },
    priority: { type: Number, default: 100, index: true },

    status: { type: String, enum: GEMINI_KEY_STATUSES, default: 'healthy', index: true },

    failureCount: { type: Number, default: 0 },
    consecutiveFailures: { type: Number, default: 0 },

    totalRequests: { type: Number, default: 0 },
    totalSuccesses: { type: Number, default: 0 },
    totalFailures: { type: Number, default: 0 },

    lastUsedAt: { type: Date, default: null },
    lastSuccessAt: { type: Date, default: null },
    lastFailureAt: { type: Date, default: null },

    cooldownUntil: { type: Date, default: null },

    lastErrorCode: { type: String, default: null },
    lastErrorMessage: { type: String, default: null },
  },
  { timestamps: true, collection: 'geminiapikeys' }
);

module.exports = mongoose.models.GeminiApiKey || mongoose.model('GeminiApiKey', geminiApiKeySchema);
module.exports.GEMINI_KEY_STATUSES = GEMINI_KEY_STATUSES;
