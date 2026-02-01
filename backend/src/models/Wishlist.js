const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  websiteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Website',
    required: true,
    index: true,
  },
  addedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Compound unique index to prevent duplicate wishlist entries
wishlistSchema.index({ userId: 1, websiteId: 1 }, { unique: true });

// Index for sorting
wishlistSchema.index({ userId: 1, addedAt: -1 });

module.exports = mongoose.model('Wishlist', wishlistSchema);