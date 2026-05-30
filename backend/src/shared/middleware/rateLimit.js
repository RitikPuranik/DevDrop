const rateLimit = require('express-rate-limit');

const readEnvNumber = (key, fallback) => {
  const value = Number.parseInt(process.env[key], 10);
  return Number.isFinite(value) ? value : fallback;
};

const formatWindowLabel = (windowMs) => {
  const minutes = Math.round(windowMs / 60000);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }

  const hours = Math.round(windowMs / 3600000);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
};

const GENERAL_RATE_LIMIT_WINDOW_MS = readEnvNumber('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000);
const GENERAL_RATE_LIMIT_MAX_REQUESTS = readEnvNumber('RATE_LIMIT_MAX_REQUESTS', 100);
const AUTH_RATE_LIMIT_WINDOW_MS = readEnvNumber('AUTH_RATE_LIMIT_WINDOW_MS', 5 * 60 * 1000);
const AUTH_RATE_LIMIT_MAX_REQUESTS = readEnvNumber('AUTH_RATE_LIMIT_MAX_REQUESTS', 5);
const DOWNLOAD_RATE_LIMIT_WINDOW_MS = readEnvNumber('DOWNLOAD_RATE_LIMIT_WINDOW_MS', 60 * 60 * 1000);
const DOWNLOAD_RATE_LIMIT_MAX_REQUESTS = readEnvNumber('DOWNLOAD_RATE_LIMIT_MAX_REQUESTS', 50);
const PAYMENT_RATE_LIMIT_WINDOW_MS = readEnvNumber('PAYMENT_RATE_LIMIT_WINDOW_MS', 60 * 1000);
const PAYMENT_RATE_LIMIT_MAX_REQUESTS = readEnvNumber('PAYMENT_RATE_LIMIT_MAX_REQUESTS', 3);

// General API rate limiter
const generalLimiter = rateLimit({
  windowMs: GENERAL_RATE_LIMIT_WINDOW_MS,
  max: GENERAL_RATE_LIMIT_MAX_REQUESTS,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter limiter for authentication routes
const authLimiter = rateLimit({
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
  max: AUTH_RATE_LIMIT_MAX_REQUESTS,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: `Too many authentication attempts, please try again after ${formatWindowLabel(AUTH_RATE_LIMIT_WINDOW_MS)}.`,
  },
});

// Download rate limiter (per user)
const downloadLimiter = rateLimit({
  windowMs: DOWNLOAD_RATE_LIMIT_WINDOW_MS,
  max: DOWNLOAD_RATE_LIMIT_MAX_REQUESTS,
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
  windowMs: PAYMENT_RATE_LIMIT_WINDOW_MS,
  max: PAYMENT_RATE_LIMIT_MAX_REQUESTS,
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
