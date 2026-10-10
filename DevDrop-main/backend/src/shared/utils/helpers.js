const crypto = require('crypto');
const { PLATFORM_FEE_AMOUNT, TAX_PERCENTAGE, EXCLUSIVE_COMMISSION_PERCENTAGE } = require('./constants');

/**
 * Calculate pricing breakdown for a purchase.
 *
 * @param {number} finalPrice    The amount the buyer is paying for (website.price for
 *                                 paid listings, or auction.currentBidAmount for exclusive).
 * @param {object} [opts]
 * @param {number} [opts.startingPrice]  Only for exclusive/auction sales — the seller's
 *                                         original starting price. When provided and lower
 *                                         than finalPrice, the platform takes a commission
 *                                         ONLY on the premium (finalPrice - startingPrice).
 *                                         Seller keeps 100% of startingPrice no matter what.
 *
 * Buyer-side charges (platform fee + tax) are UNCHANGED for both paid and exclusive sales.
 * The seller-side split only changes for exclusive sales with a startingPrice provided.
 */
const calculatePricing = (finalPrice, opts = {}) => {
  const { startingPrice } = opts;

  // Platform fee is a FIXED AMOUNT (e.g., ₹500) — same for paid and exclusive
  const platformFee = PLATFORM_FEE_AMOUNT;

  // Calculate subtotal (always based on the full final price the buyer is paying)
  const subtotal = finalPrice + platformFee;

  // Calculate tax on subtotal
  const tax = Math.round((subtotal * TAX_PERCENTAGE) / 100);

  // Total amount buyer pays
  const totalPaid = subtotal + tax;

  // ===== Seller payout split =====
  // Default (paid listings, or exclusive with no startingPrice given): seller gets 100%.
  let sellerPrice = finalPrice;
  let premium = 0;
  let platformCommission = 0;

  const isExclusiveSplit = typeof startingPrice === 'number' && startingPrice >= 0 && finalPrice > startingPrice;

  if (isExclusiveSplit) {
    premium = finalPrice - startingPrice;
    platformCommission = Math.round((premium * EXCLUSIVE_COMMISSION_PERCENTAGE) / 100);
    // Seller keeps 100% of starting price + their share (100 - commission%) of the premium
    sellerPrice = startingPrice + (premium - platformCommission);
  } else if (typeof startingPrice === 'number' && startingPrice >= 0) {
    // Exclusive sale that closed at (or below, edge case) the starting price — no premium,
    // seller still gets their full starting/final price, no commission taken.
    sellerPrice = finalPrice;
  }

  return {
    sellerPrice,           // What the seller is actually owed/paid out
    platformFee,           // Fixed buyer-side fee (unchanged)
    tax,                   // Buyer-side tax (unchanged)
    totalPaid,             // What the buyer pays in total (unchanged)
    startingPrice: typeof startingPrice === 'number' ? startingPrice : undefined,
    premium,               // finalPrice - startingPrice (0 for paid listings)
    platformCommission,    // Platform's cut of the premium (0 for paid listings)
  };
};

/**
 * Apply a coupon to the buyer-facing pricing while preserving seller payout.
 */
const applyCouponToPricing = (basePricing, coupon) => {
  const platformCommission = basePricing.platformCommission || 0;
  const subtotalBeforeDiscount = Math.max(
    0,
    (basePricing.sellerPrice || 0) + platformCommission + (basePricing.platformFee || 0)
  );
  const originalTotalPaid = basePricing.totalPaid || 0;

  if (!coupon) {
    return {
      ...basePricing,
      subtotalBeforeDiscount,
      discountAmount: 0,
      subtotalAfterDiscount: subtotalBeforeDiscount,
      originalTotalPaid,
      totalPaid: originalTotalPaid,
    };
  }

  let discountAmount = 0;

  if (coupon.discountType === 'percent') {
    discountAmount = Math.round((subtotalBeforeDiscount * coupon.discountValue) / 100);
  } else if (coupon.discountType === 'flat') {
    discountAmount = coupon.discountValue;
  }

  discountAmount = Math.min(Math.max(discountAmount, 0), subtotalBeforeDiscount);

  const subtotalAfterDiscount = subtotalBeforeDiscount - discountAmount;
  const tax = Math.round((subtotalAfterDiscount * TAX_PERCENTAGE) / 100);
  const totalPaid = subtotalAfterDiscount + tax;

  return {
    ...basePricing,
    tax,
    totalPaid,
    subtotalBeforeDiscount,
    discountAmount,
    subtotalAfterDiscount,
    originalTotalPaid,
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

/**
 * Generate a UPI deep link for paying out a seller.
 * Opening this link on a phone with any UPI app installed pre-fills the
 * payee VPA, amount, and a note — admin just taps to confirm and pay.
 * No registered payout/business account required since this is a normal
 * person-to-person/person-to-merchant UPI intent, not a programmatic API call.
 *
 * @param {object} params
 * @param {string} params.upiId        Seller's UPI VPA, e.g. "name@okhdfcbank"
 * @param {string} params.payeeName    Seller's display name (shown in UPI app)
 * @param {number} params.amount       Amount to pay, in rupees
 * @param {string} [params.note]       Short transaction note (keep it brief — UPI apps truncate)
 * @returns {string|null} A "upi://pay?..." URL, or null if upiId is missing/invalid
 */
const generateUpiPayoutLink = ({ upiId, payeeName, amount, note }) => {
  if (!upiId || typeof upiId !== 'string' || !upiId.includes('@')) return null;
  if (!amount || amount <= 0) return null;

  const params = new URLSearchParams({
    pa: upiId,                                   // payee address (VPA)
    pn: payeeName || 'DevDrop Seller',            // payee name
    am: amount.toFixed(2),                        // amount
    cu: 'INR',                                    // currency
    tn: (note || 'DevDrop payout').slice(0, 50),  // transaction note, keep short
  });

  return `upi://pay?${params.toString()}`;
};

module.exports = {
  calculatePricing,
  applyCouponToPricing,
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
  generateUpiPayoutLink,
};
