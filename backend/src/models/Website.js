const mongoose = require('mongoose');

const websiteSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Website name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters'],
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters'],
  },
  category: {
    type: String,
    enum: ['free', 'paid', 'exclusive'],
    required: [true, 'Category is required'],
  },
  price: {
    type: Number,
    required: true,
    min: [0, 'Price cannot be negative'],
    validate: {
      validator: function(value) {
        if (this.category === 'free') {
          return value === 0;
        }
        return value > 0;
      },
      message: 'Free websites must have price 0, paid/exclusive must have price > 0',
    },
  },
  deployedUrl: {
    type: String,
    required: [true, 'Deployed URL is required'],
    trim: true,
    match: [/^https?:\/\/.+/, 'Please provide a valid URL'],
  },
  githubUrl: {
    type: String,
    trim: true,
    match: [/^https?:\/\/(www\.)?github\.com\/.+/, 'Please provide a valid GitHub URL'],
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['pending_review', 'changes_requested', 'rejected', 'approved', 'sold'],
    default: 'pending_review',
    index: true,
  },
  adminComment: {
    type: String,
    trim: true,
  },
  
  // Files uploaded by admin after approval
  sourceCodeUrl: String,
  docsUrl: String,
  videoUrl: String, // Optional
  previewVideoUrl: String, // Optional - public preview video
  
  // File metadata
  files: {
    sourceCode: {
      size: Number,
      uploadedAt: Date,
      fileName: String,
    },
    docs: {
      size: Number,
      uploadedAt: Date,
      fileName: String,
    },
    video: { // Optional
      size: Number,
      uploadedAt: Date,
      fileName: String,
    },
    previewVideo: { // Optional
      size: Number,
      uploadedAt: Date,
      fileName: String,
    },
  },
  
  // Exclusive tracking
  soldTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  soldAt: Date,
  
  // Statistics
  viewCount: {
    type: Number,
    default: 0,
  },
  downloadCount: {
    type: Number,
    default: 0,
  },
  wishlistCount: {
    type: Number,
    default: 0,
  },
  
  // Soft delete (for admin)
  isDeleted: {
    type: Boolean,
    default: false,
  },
  deletedAt: Date,
}, {
  timestamps: true,
});

// Compound indexes for common queries
websiteSchema.index({ status: 1, category: 1 });
websiteSchema.index({ sellerId: 1, status: 1 });
websiteSchema.index({ category: 1, price: 1 });
websiteSchema.index({ isDeleted: 1, status: 1 });

// Virtual for checking if sold
websiteSchema.virtual('isSold').get(function() {
  return this.status === 'sold';
});

// Virtual for checking if available for purchase
websiteSchema.virtual('isAvailable').get(function() {
  if (this.status !== 'approved') return false;
  if (this.category === 'exclusive' && this.isSold) return false;
  return true;
});

// Middleware to prevent modifications on sold exclusive websites
websiteSchema.pre('save', function(next) {
  if (this.category === 'exclusive' && this.soldTo && !this.isSold) {
    this.status = 'sold';
    this.soldAt = new Date();
  }
  next();
});

module.exports = mongoose.model('Website', websiteSchema);