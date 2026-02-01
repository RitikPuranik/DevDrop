const rateLimit = require('express-rate-limit');

// General API rate limiter
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter limiter for authentication routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again after 15 minutes.',
  },
});

// Download rate limiter (per user)
const downloadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 downloads per hour
  keyGenerator: (req) => {
    return req.userId ? req.userId.toString() : req.ip;
  },
  message: {
    success: false,
    message: 'Download limit exceeded. Please try again later.',
  },
});

// Payment creation limiter
const paymentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // 3 payment attempts per minute
  keyGenerator: (req) => {
    return req.userId ? req.userId.toString() : req.ip;
  },
  message: {
    success: false,
    message: 'Too many payment attempts. Please wait a minute.',
  },
});

module.exports = {
  generalLimiter,
  authLimiter,
  downloadLimiter,
  paymentLimiter,
};