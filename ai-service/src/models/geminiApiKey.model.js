const mongoose = require('mongoose');

/**
 * Same schema/collection as backend/src/modules/gemini-pool/geminiApiKey.model.js.
 * ai-service is a separate process/deployment from the main backend, so it
 * cannot require the backend's code. Both services intentionally use the same
 * dedicated Gemini database; backend encrypts credentials and ai-service
 * decrypts them and writes runtime health/usage fields.
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

    // Token usage tracking — written by ai-service after each successful Gemini call
    totalTokensUsed: { type: Number, default: 0 },
    promptTokensUsed: { type: Number, default: 0 },
    candidateTokensUsed: { type: Number, default: 0 },
    dailyTokensUsed: { type: Number, default: 0 },
    lastTokenResetAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'geminiapikeys' }
);

module.exports = mongoose.models.GeminiApiKey || mongoose.model('GeminiApiKey', geminiApiKeySchema);
module.exports.GEMINI_KEY_STATUSES = GEMINI_KEY_STATUSES;
