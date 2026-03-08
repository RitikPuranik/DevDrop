const crypto = require('crypto');
const { PLATFORM_FEE_AMOUNT, TAX_PERCENTAGE } = require('./constants');

/**
 * Calculate pricing breakdown for a purchase
 * Platform fee is now EXACT AMOUNT, not percentage!
 */
const calculatePricing = (sellerPrice) => {
  // Platform fee is a FIXED AMOUNT (e.g., ₹500)
  const platformFee = PLATFORM_FEE_AMOUNT;
  
  // Calculate subtotal
  const subtotal = sellerPrice + platformFee;
  
  // Calculate tax on subtotal
  const tax = Math.round((subtotal * TAX_PERCENTAGE) / 100);
  
  // Total amount buyer pays
  const totalPaid = subtotal + tax;

  return {
    sellerPrice,
    platformFee,
    tax,
    totalPaid,
  };
};

/**
 * Generate unique filename with timestamp
 */
const generateFileName = (originalName, prefix = '') => {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex');
  const ext = originalName.substring(originalName.lastIndexOf('.'));
  return `${prefix}${timestamp}-${random}${ext}`;
};

/**
 * Format file size to human-readable format
 */
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Sanitize user input to prevent XSS
 */
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  return input
    .replace(/[<>]/g, '') // Remove < and >
    .trim();
};

/**
 * Generate pagination metadata
 */
const getPaginationMetadata = (page, limit, total) => {
  const totalPages = Math.ceil(total / limit);
  
  return {
    currentPage: page,
    totalPages,
    totalItems: total,
    itemsPerPage: limit,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

/**
 * Sleep utility (for rate limiting, retries, etc.)
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Check if user owns a resource
 */
const checkOwnership = (userId, resourceOwnerId) => {
  return userId.toString() === resourceOwnerId.toString();
};

/**
 * Create Supabase file path
 */
const createSupabasePath = (folder, filename) => {
  return `${folder}/${filename}`;
};

/**
 * Extract file extension
 */
const getFileExtension = (filename) => {
  return filename.substring(filename.lastIndexOf('.')).toLowerCase();
};

/**
 * Validate file type
 */
const isValidFileType = (filename, allowedExtensions) => {
  const ext = getFileExtension(filename);
  return allowedExtensions.includes(ext);
};

/**
 * Generate verification token hash
 */
const hashToken = (token) => {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
};


/**
 * Calculate admin revenue
 */
const calculateAdminRevenue = (platformFee, tax) => {
  return platformFee + tax;
};

/**
 * Format currency (INR)
 */
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(amount);
};

/**
 * Check if date is expired
 */
const isExpired = (date) => {
  return new Date() > new Date(date);
};

/**
 * Get date range for analytics
 */
const getDateRange = (period = 'month') => {
  const now = new Date();
  let startDate;

  switch (period) {
    case 'day':
      startDate = new Date(now.setHours(0, 0, 0, 0));
      break;
    case 'week':
      startDate = new Date(now.setDate(now.getDate() - 7));
      break;
    case 'month':
      startDate = new Date(now.setMonth(now.getMonth() - 1));
      break;
    case 'year':
      startDate = new Date(now.setFullYear(now.getFullYear() - 1));
      break;
    default:
      startDate = new Date(now.setMonth(now.getMonth() - 1));
  }

  return { startDate, endDate: new Date() };
};

module.exports = {
  calculatePricing,
  generateFileName,
  formatFileSize,
  sanitizeInput,
  getPaginationMetadata,
  sleep,
  checkOwnership,
  createSupabasePath,
  getFileExtension,
  isValidFileType,
  hashToken,
  calculateAdminRevenue,
  formatCurrency,
  isExpired,
  getDateRange,
};