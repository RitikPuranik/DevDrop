const mongoose = require('mongoose');

/**
 * Shared (cross-process) Gemini pool state that does not belong to a single
 * credential. Today that is model-capacity cooldowns: a model that reported
 * shared capacity exhaustion is avoided by every worker until `until`.
 * Same dedicated Gemini database as geminiapikeys.
 */
const geminiPoolStateSchema = new mongoose.Schema(
  {
    _id: { type: String },
    kind: { type: String, default: 'model_capacity' },
    model: { type: String, default: null },
    until: { type: Date, default: null },
  },
  { timestamps: true, collection: 'geminipoolstate' }
);

module.exports = mongoose.models.GeminiPoolState || mongoose.model('GeminiPoolState', geminiPoolStateSchema);
