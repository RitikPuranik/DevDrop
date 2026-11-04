const mongoose = require('mongoose');

// Dedupe ledger for Vercel webhook deliveries (Vercel retries on non-2xx, and
// the same event can legitimately arrive twice). Only the event id is kept —
// never the payload. Entries expire on their own.
const vercelWebhookEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    type: { type: String },
    receivedAt: { type: Date, default: Date.now, expires: 7 * 24 * 3600 },
  },
  { versionKey: false }
);

module.exports = mongoose.model('VercelWebhookEvent', vercelWebhookEventSchema);
