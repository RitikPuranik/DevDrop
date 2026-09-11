const mongoose = require('mongoose');

/**
 * One document per Gemini API credential in the pool that powers AI Studio
 * generation (ai-service). Both this backend (admin CRUD) and ai-service
 * (actual Gemini requests + live health tracking) read/write this same
 * collection, so the pool survives restarts of either process and works
 * without ai-service needing this backend's code.
 *
 * `encryptedKey` is AES-256-GCM ciphertext produced by
 * `shared/utils/crypto.js` (the same helper already used for GitHub/Vercel/
 * Render credentials) — never the raw key. It's `select: false` so a plain
 * `find()` never accidentally leaks it; callers must opt in with
 * `.select('+encryptedKey')`.
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

    // Last 4 chars of the raw key, kept in plaintext only for building the
    // masked display value (e.g. "AIza...7xP2") without decrypting on every
    // list request. Never the full key.
    keySuffix: { type: String, required: true },
    keyPrefix: { type: String, default: 'AIza' },

    enabled: { type: Boolean, default: true, index: true },

    // Lower number = tried first. Ties are broken by least-recently-used.
    priority: { type: Number, default: 100, index: true },

    status: {
      type: String,
      enum: GEMINI_KEY_STATUSES,
      default: 'healthy',
      index: true,
    },

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
  { timestamps: true }
);

geminiApiKeySchema.index({ enabled: 1, priority: 1 });

module.exports = mongoose.model('GeminiApiKey', geminiApiKeySchema);
module.exports.GEMINI_KEY_STATUSES = GEMINI_KEY_STATUSES;
