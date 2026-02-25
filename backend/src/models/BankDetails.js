const mongoose = require('mongoose');

const bankDetailsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    accountHolderName: {
      type: String,
      required: true,
      trim: true,
    },
    accountNumber: {
      type: String,
      required: true,
      trim: true,
    },
    ifscCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: [/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code'],
    },
    bankName: {
      type: String,
      required: true,
      trim: true,
    },
    branch: {
      type: String,
      required: true,
      trim: true,
    },
    upiId: {
      type: String,
      trim: true,
      match: [/^[\w.-]+@[\w.-]+$/, 'Invalid UPI ID'],
    },
    
    // 🔥 NEW FIELDS FOR AUTOMATIC PAYOUTS
    razorpayContactId: {
      type: String,
      index: true,
      sparse: true,
    },
    razorpayFundAccountId: {
      type: String,
      index: true,
      sparse: true,
    },
    razorpayStatus: {
      type: String,
      enum: ['pending', 'active', 'failed'],
      default: 'pending',
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verifiedAt: Date,
    verificationFailedReason: String,
    
    // Payout preferences
    defaultPayoutMode: {
      type: String,
      enum: ['bank', 'upi'],
      default: 'bank',
    },
    payoutEnabled: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Index for faster queries
bankDetailsSchema.index({ razorpayStatus: 1, payoutEnabled: 1 });

module.exports = mongoose.model('BankDetails', bankDetailsSchema);