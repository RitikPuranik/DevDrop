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
      // Seller may be deleted or missing; make optional to allow purchases to persist
      required: false,
    },
    category: {
      type: String,
      enum: ['free', 'paid', 'exclusive'],
      required: true,
    },

    // Pricing
    sellerPrice: { type: Number, required: true, min: 0 },
    platformFee: { type: Number, required: true, min: 0 },
    tax:         { type: Number, required: true, min: 0 },
    totalPaid:   { type: Number, required: true, min: 0 },
    subtotalBeforeDiscount: { type: Number, default: 0, min: 0 },
    discountAmount:         { type: Number, default: 0, min: 0 },
    subtotalAfterDiscount:  { type: Number, default: 0, min: 0 },
    originalTotalPaid:      { type: Number, default: 0, min: 0 },

    // Exclusive/auction-only — platform's commission taken from the bidding premium
    // (finalBidAmount - startingPrice). Always 0 for paid/free listings.
    platformCommission: { type: Number, default: 0, min: 0 },

    // Coupon snapshot
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coupon',
      default: null,
    },
    couponCode: String,
    discountType: {
      type: String,
      enum: ['percent', 'flat'],
      default: undefined,
    },
    discountValue: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Razorpay identifiers
    razorpayOrderId:   { type: String, index: true, sparse: true },
    razorpayPaymentId: { type: String, index: true, sparse: true },

    paymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: function () {
        return this.category === 'free' ? 'completed' : 'pending';
      },
    },

    // Access
    downloadCount:  { type: Number, default: 0 },
    lastAccessedAt: Date,

    purchaseDate: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

purchaseSchema.index({ buyerId: 1, purchaseDate: -1 });
purchaseSchema.index({ sellerId: 1, purchaseDate: -1 });
purchaseSchema.index({ websiteId: 1, buyerId: 1 }, { unique: true });

purchaseSchema.virtual('isCompleted').get(function () {
  return this.paymentStatus === 'completed';
});

module.exports = mongoose.model('Purchase', purchaseSchema);
