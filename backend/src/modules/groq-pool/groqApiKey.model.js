const mongoose = require('mongoose');
// Same dedicated MongoDB database as the Gemini pool (GEMINI_MONGODB_URI),
// separate collection: `groqapikeys`.
const { getGeminiPoolDB } = require('../gemini-pool/geminiPoolDb');

const GROQ_KEY_STATUSES = [
  'healthy',
  'busy',
  'rate_limited',
  'degraded',
  'invalid',
  'disabled',
];

const schema = new mongoose.Schema(
  {
    label: { type: String, trim: true, required: true },
    encryptedKey: { type: String, required: true, select: false },
    keySuffix: { type: String, required: true },
    keyPrefix: { type: String, default: 'gsk_' },
    keyFingerprint: { type: String, required: true, index: true },
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


    // Token usage tracking — written by ai-service, read by admin UI
    totalTokensUsed: { type: Number, default: 0 },
    promptTokensUsed: { type: Number, default: 0 },
    candidateTokensUsed: { type: Number, default: 0 },
    dailyTokensUsed: { type: Number, default: 0 },
    lastTokenResetAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'groqapikeys' }
);

async function getModel() {
  const db = await getGeminiPoolDB();
  return db.models.GroqApiKey || db.model('GroqApiKey', schema);
}

module.exports = { getModel, GROQ_KEY_STATUSES };
