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
const EXPORT_RATE_LIMIT_WINDOW_MS = readEnvNumber('EXPORT_RATE_LIMIT_WINDOW_MS', 60 * 60 * 1000);
const EXPORT_RATE_LIMIT_MAX_REQUESTS = readEnvNumber('EXPORT_RATE_LIMIT_MAX_REQUESTS', 5);
const DEPLOY_RATE_LIMIT_WINDOW_MS = readEnvNumber('DEPLOY_RATE_LIMIT_WINDOW_MS', 60 * 60 * 1000);
const DEPLOY_RATE_LIMIT_MAX_REQUESTS = readEnvNumber('DEPLOY_RATE_LIMIT_MAX_REQUESTS', 10);

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

// GitHub export creation limiter (per user) — repo creation + file uploads
// are expensive on both our server and the GitHub API, so keep this tight.
const exportLimiter = rateLimit({
  windowMs: EXPORT_RATE_LIMIT_WINDOW_MS,
  max: EXPORT_RATE_LIMIT_MAX_REQUESTS,
  keyGenerator: (req) => {
    return req.userId ? req.userId.toString() : req.ip;
  },
  message: {
    success: false,
    message: `Too many export attempts, please try again after ${formatWindowLabel(EXPORT_RATE_LIMIT_WINDOW_MS)}.`,
  },
});

// Deployment creation/redeploy limiter (per user) — each call fans out to
// Vercel/Render API calls and kicks off a background orchestration run.
const deployLimiter = rateLimit({
  windowMs: DEPLOY_RATE_LIMIT_WINDOW_MS,
  max: DEPLOY_RATE_LIMIT_MAX_REQUESTS,
  keyGenerator: (req) => {
    return req.userId ? req.userId.toString() : req.ip;
  },
  message: {
    success: false,
    message: `Too many deployment attempts, please try again after ${formatWindowLabel(DEPLOY_RATE_LIMIT_WINDOW_MS)}.`,
  },
});

module.exports = {
  generalLimiter,
  authLimiter,
  downloadLimiter,
  paymentLimiter,
  exportLimiter,
  deployLimiter,
};
