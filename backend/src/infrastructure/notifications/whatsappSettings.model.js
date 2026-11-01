'use strict';

const mongoose = require('mongoose');

// Runtime admin toggles (singleton). The WHATSAPP_NOTIFICATIONS_ENABLED env var stays the master switch;
// these can only narrow what is sent, never widen it.
const schema = new mongoose.Schema(
  {
    key: { type: String, default: 'whatsapp', unique: true },
    enabled: { type: Boolean, default: true },
    categories: {
      subscription: { type: Boolean, default: true },
      renewal: { type: Boolean, default: true },
      websitePurchase: { type: Boolean, default: true },
      adminReport: { type: Boolean, default: true },
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.models.WhatsAppSettings || mongoose.model('WhatsAppSettings', schema);
