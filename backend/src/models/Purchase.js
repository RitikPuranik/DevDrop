const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema(
  {
    websiteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Website',
      required: true,
    },
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    category: {
      type: String,
      enum: ['free', 'paid', 'exclusive'],
      required: true,
    },

    // Pricing
    sellerPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    platformFee: {
      type: Number,
      required: true,
      min: 0,
    },
    tax: {
      type: Number,
      required: true,
      min: 0,
    },
    totalPaid: {
      type: Number,
      required: true,
      min: 0,
    },

    // Payment
    stripePaymentIntentId: String,
    stripeChargeId: String,
    stripeTransferId: String,
    paymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: function () {
        return this.category === 'free' ? 'completed' : 'pending';
      },
    },

    // Access
    downloadCount: {
      type: Number,
      default: 0,
    },
    lastAccessedAt: Date,

    purchaseDate: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// ✅ ONLY THESE INDEXES EXIST
purchaseSchema.index({ buyerId: 1, purchaseDate: -1 });
purchaseSchema.index({ sellerId: 1, purchaseDate: -1 });
purchaseSchema.index(
  { websiteId: 1, buyerId: 1 },
  { unique: true }
);

purchaseSchema.virtual('isCompleted').get(function () {
  return this.paymentStatus === 'completed';
});

module.exports = mongoose.model('Purchase', purchaseSchema);
