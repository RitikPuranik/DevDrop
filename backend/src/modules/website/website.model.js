const mongoose = require('mongoose');

const websiteSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Website name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    // Project description ONLY — no tech stack here
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    // Tech stack as structured data, separate from description
    techStack: {
      frontend: {
        type: [String],
        default: [],
      },
      backend: {
        type: [String],
        default: [],
      },
      database: {
        type: [String],
        default: [],
      },
      devops: {
        type: [String],
        default: [],
      },
      other: {
        type: [String],
        default: [],
      },
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
        validator: function (value) {
          if (this.category === 'free') return value === 0;
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
    },
    status: {
      type: String,
      enum: ['pending_review', 'changes_requested', 'rejected', 'approved', 'in_auction', 'sold'],
      default: 'pending_review',
    },
    adminComment: {
      type: String,
      trim: true,
    },

    // Files
    sourceCodeUrl: String,
    docsUrl: String,
    videoUrl: String,
    previewVideoUrl: String,

    files: {
      sourceCode: { size: Number, uploadedAt: Date, fileName: String },
      docs: { size: Number, uploadedAt: Date, fileName: String },
      video: { size: Number, uploadedAt: Date, fileName: String },
      previewVideo: { size: Number, uploadedAt: Date, fileName: String },
    },

    soldTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    soldAt: Date,

    viewCount:     { type: Number, default: 0 },
    downloadCount: { type: Number, default: 0 },
    wishlistCount: { type: Number, default: 0 },

    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
  },
  { timestamps: true }
);

websiteSchema.index({ status: 1, category: 1 });
websiteSchema.index({ sellerId: 1, status: 1 });
websiteSchema.index({ category: 1, price: 1 });
websiteSchema.index({ isDeleted: 1, status: 1 });

websiteSchema.virtual('isSold').get(function () {
  return this.status === 'sold';
});

websiteSchema.virtual('isAvailable').get(function () {
  if (this.status !== 'approved') return false;
  if (this.category === 'exclusive' && this.isSold) return false;
  return true;
});

websiteSchema.pre('save', function (next) {
  if (this.category === 'exclusive' && this.soldTo && !this.isSold) {
    this.status = 'sold';
    this.soldAt = new Date();
  }
  next();
});

module.exports = mongoose.model('Website', websiteSchema);
