const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema({
  sellerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', required: true },
  websiteId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },

  amount: { type: Number, required: true, min: 0 },

  // Snapshot of seller bank details at time payout was created
  bankDetails: {
    accountHolderName: String,
    accountNumber: String,
    ifscCode: String,
    bankName: String,
    upiId: String,
  },

  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending',
    index: true,
  },

  // All payouts are manual — admin processes them
  isAutomatic: { type: Boolean, default: false },

  // Transaction details filled in by admin when processing
  utr:             String, // Unique Transaction Reference from bank transfer
  transactionDate: Date,

  // Admin who processed the payout
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  processedAt: Date,
  adminNotes:  String,

  // Failure
  failureReason: String,

}, { timestamps: true });

payoutSchema.index({ sellerId: 1, status: 1 });
payoutSchema.index({ status: 1, createdAt: -1 });
payoutSchema.index({ purchaseId: 1 });

module.exports = mongoose.model('Payout', payoutSchema);
