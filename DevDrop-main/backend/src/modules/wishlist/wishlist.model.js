const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    websiteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Website',
      required: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate wishlist entries
wishlistSchema.index({ userId: 1, websiteId: 1 }, { unique: true });

// Fast sorting by latest added
wishlistSchema.index({ userId: 1, addedAt: -1 });

module.exports = mongoose.model('Wishlist', wishlistSchema);
