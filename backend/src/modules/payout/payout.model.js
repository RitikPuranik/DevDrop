const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema({
  sellerId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', required: true },
  websiteId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Website', required: true },

  amount: { type: Number, required: true, min: 0 },

  // Bank details snapshot at time of payout
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

  // Cashfree payout identifiers
  cashfreeTransferId:   String, // our unique ID sent to Cashfree
  cashfreeReferenceId:  String, // Cashfree's reference ID
  isAutomatic:          { type: Boolean, default: true },

  // Transaction details
  utr:             String, // Unique Transaction Reference from bank
  transactionDate: Date,

  // Admin
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  processedAt: Date,
  adminNotes:  String,

  // Failure
  failureReason: String,

}, { timestamps: true });

payoutSchema.index({ sellerId: 1, status: 1 });
payoutSchema.index({ status: 1, createdAt: -1 });
payoutSchema.index({ purchaseId: 1 });
payoutSchema.index({ cashfreeTransferId: 1 }, { sparse: true });

module.exports = mongoose.model('Payout', payoutSchema);
