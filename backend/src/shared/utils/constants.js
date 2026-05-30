/**
 * Application constants
 */

const readEnvNumber = (key, fallback) => {
  const value = Number.parseInt(process.env[key], 10);
  return Number.isFinite(value) ? value : fallback;
};

// User roles
const USER_ROLES = {
  USER: 'user',
  ADMIN: 'admin',
};

// Website categories
const WEBSITE_CATEGORIES = {
  FREE: 'free',
  PAID: 'paid',
  EXCLUSIVE: 'exclusive',
};

// Website status
const WEBSITE_STATUS = {
  PENDING_REVIEW: 'pending_review',
  CHANGES_REQUESTED: 'changes_requested',
  REJECTED: 'rejected',
  APPROVED: 'approved',
  SOLD: 'sold',
  IN_AUCTION: 'in_auction',
};

// Payment status
const PAYMENT_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
};

// Payout status
const PAYOUT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};


// File types
const FILE_TYPES = {
  SOURCE_CODE: 'sourceCode',
  DOCS: 'docs',
  VIDEO: 'video',
  PREVIEW_VIDEO: 'previewVideo',
};

// Platform fee (EXACT AMOUNT in rupees, not percentage!)
const PLATFORM_FEE_AMOUNT = parseFloat(process.env.PLATFORM_FEE_AMOUNT) || 500;

// Tax percentage (this remains as percentage)
const TAX_PERCENTAGE = parseFloat(process.env.TAX_PERCENTAGE) || 18;

// File size limits (in bytes)
const FILE_SIZE_LIMITS = {
  ZIP: parseInt(process.env.MAX_FILE_SIZE_ZIP) || 100 * 1024 * 1024, // 100MB
  PDF: parseInt(process.env.MAX_FILE_SIZE_PDF) || 10 * 1024 * 1024,   // 10MB
  VIDEO: parseInt(process.env.MAX_FILE_SIZE_VIDEO) || 500 * 1024 * 1024, // 500MB
};

// Supabase bucket configuration
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET_NAME || 'marketplace-files';

// Supabase folder structure
const SUPABASE_FOLDERS = {
  SOURCE_CODE: 'source-code',
  DOCS: 'docs',
  VIDEOS: 'videos',
  PREVIEW_VIDEOS: 'preview-videos',
};

// Signed URL expiry (in seconds)
const SIGNED_URL_EXPIRY = parseInt(process.env.SIGNED_URL_EXPIRY) || 604800; // 7 days

// Pagination defaults
const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
};

// Email templates
const EMAIL_SUBJECTS = {
  VERIFICATION: 'Verify Your Email - Marketplace Platform',
  WELCOME: 'Welcome to Marketplace Platform',
  PASSWORD_RESET: 'Reset Your Password',
  PURCHASE_CONFIRMATION: 'Purchase Confirmation',
  SELLER_NOTIFICATION: 'Your Website Has Been Purchased',
  ADMIN_REVIEW_REQUEST: 'New Website Pending Review',
  STATUS_UPDATE: 'Website Review Status Update',
  PAYOUT_NOTIFICATION: 'Payout Processed',
};

// Rate limiting (requests per window)
const RATE_LIMITS = {
  GENERAL: {
    WINDOW_MS: readEnvNumber('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    MAX_REQUESTS: readEnvNumber('RATE_LIMIT_MAX_REQUESTS', 100),
  },
  AUTH: {
    WINDOW_MS: readEnvNumber('AUTH_RATE_LIMIT_WINDOW_MS', 5 * 60 * 1000),
    MAX_REQUESTS: readEnvNumber('AUTH_RATE_LIMIT_MAX_REQUESTS', 5),
  },
  DOWNLOAD: {
    WINDOW_MS: readEnvNumber('DOWNLOAD_RATE_LIMIT_WINDOW_MS', 60 * 60 * 1000),
    MAX_REQUESTS: readEnvNumber('DOWNLOAD_RATE_LIMIT_MAX_REQUESTS', 50),
  },
  PAYMENT: {
    WINDOW_MS: readEnvNumber('PAYMENT_RATE_LIMIT_WINDOW_MS', 60 * 1000),
    MAX_REQUESTS: readEnvNumber('PAYMENT_RATE_LIMIT_MAX_REQUESTS', 3),
  },
};

module.exports = {
  USER_ROLES,
  WEBSITE_CATEGORIES,
  WEBSITE_STATUS,
  PAYMENT_STATUS,
  PAYOUT_STATUS,
  FILE_TYPES,
  PLATFORM_FEE_AMOUNT,
  TAX_PERCENTAGE,
  FILE_SIZE_LIMITS,
  SUPABASE_BUCKET,
  SUPABASE_FOLDERS,
  SIGNED_URL_EXPIRY,
  PAGINATION,
  EMAIL_SUBJECTS,
  RATE_LIMITS,
};
