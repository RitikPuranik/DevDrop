const mongoose = require('mongoose');

const bankDetailsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  upiId: {
    type: String,
    required: true,
    trim: true,
    match: [/^[\w.-]+@[\w.-]+$/, 'Invalid UPI ID'],
  },
  phoneNumber: {
    type: String,
    required: true,
    trim: true,
  },

  isVerified:               { type: Boolean, default: false },
  verifiedAt:               Date,
  verificationFailedReason: String,

  defaultPayoutMode: { type: String, enum: ['bank', 'upi'], default: 'bank' },
  payoutEnabled:     { type: Boolean, default: true },

}, { timestamps: true });

module.exports = mongoose.model('BankDetails', bankDetailsSchema);
