const mongoose = require('mongoose');

/**
 * Groq key pool document. Lives in the SAME MongoDB database as the Gemini
 * pool (GEMINI_MONGODB_URI) but in its own collection, so the two pools never
 * share credentials, health state or token accounting.
 *
 * Same schema as backend/src/modules/groq-pool/groqApiKey.model.js — the
 * backend encrypts keys on write, ai-service decrypts them in memory only
 * right before a Groq request and writes runtime health/usage fields.
 */

const GROQ_KEY_STATUSES = ['healthy', 'busy', 'rate_limited', 'degraded', 'invalid', 'disabled'];

const groqApiKeySchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, required: true },
    encryptedKey: { type: String, required: true, select: false },
    keySuffix: { type: String },
    keyPrefix: { type: String, default: 'gsk_' },

    enabled: { type: Boolean, default: true, index: true },
    priority: { type: Number, default: 100, index: true },
    status: { type: String, enum: GROQ_KEY_STATUSES, default: 'healthy', index: true },

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

    totalTokensUsed: { type: Number, default: 0 },
    promptTokensUsed: { type: Number, default: 0 },
    candidateTokensUsed: { type: Number, default: 0 },
    dailyTokensUsed: { type: Number, default: 0 },
    lastTokenResetAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'groqapikeys' }
);

module.exports = mongoose.models.GroqApiKey || mongoose.model('GroqApiKey', groqApiKeySchema);
module.exports.GROQ_KEY_STATUSES = GROQ_KEY_STATUSES;
