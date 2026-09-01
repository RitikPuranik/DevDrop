const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const { errorHandler, notFound } = require('./shared/middleware/errorHandler');
const { generalLimiter } = require('./shared/middleware/rateLimit');
const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require('@sentry/profiling-node');

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [
      nodeProfilingIntegration(),
    ],
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
  });
}

const app = express();

// Trust the first proxy hop (Render, Vercel, etc.) so express-rate-limit
// can read the real client IP from the X-Forwarded-For header.
app.set('trust proxy', 1);

// Security
app.use(helmet({
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// The GitHub/Vercel OAuth callback pages are rendered on THIS (backend) origin
// but exist purely to call `window.opener.postMessage(...)` back to the
// frontend, which is a *different* origin. `same-origin-allow-popups` only
// preserves that link for a popup document whose own COOP is `unsafe-none`;
// since helmet applies its stricter policy to every route including these,
// the callback page gets isolated into a new browsing context group the
// moment it loads. That silently nulls `window.opener` (so postMessage never
// arrives and the opener spins forever) and also revokes the tab's permission
// to call `window.close()` on itself (so the user has to close it by hand).
// Overriding it back to `unsafe-none` for just these two routes fixes both.
app.use(['/api/github/callback', '/api/deployments/providers/vercel/callback'], (req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
  next();
});
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
].filter(Boolean);
app.use(cors({ origin: allowedOrigins, credentials: true }));

// Gzip compression — reduces response payload by ~70%
app.use(compression());

// Webhook must receive raw body for Razorpay signature verification — register BEFORE json parser
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }), (req, res, next) => {
  if (req.method === 'POST') req.rawBody = req.body;
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined', {
  skip: (req, res) => req.url === '/health'
}));
app.use('/api/', generalLimiter);

// Health check
app.get('/health', (req, res) => res.json({ success: true, message: 'Server is running', timestamp: new Date().toISOString(), environment: process.env.NODE_ENV }));

// Modular routes
app.use('/api/auth',      require('./modules/auth'));
app.use('/api/user',      require('./modules/user'));
app.use('/api/websites',  require('./modules/website'));
app.use('/api/seller',    require('./modules/seller'));
app.use('/api/buyer',     require('./modules/buyer'));
app.use('/api/admin',     require('./modules/admin'));
app.use('/api/payment',   require('./modules/payment'));
app.use('/api/payout',    require('./modules/payout'));
app.use('/api/wishlist',  require('./modules/wishlist'));
app.use('/api/assets',    require('./modules/asset'));
app.use('/api/auctions',  require('./modules/auction'));
app.use('/api/analytics', require('./modules/analytics'));
app.use('/api/contact',   require('./modules/contact'));
app.use('/api/github',    require('./modules/github'));
app.use('/api/deployments', require('./modules/deployment'));


app.get("/debug-sentry", function mainHandler(req, res) {
  throw new Error("My first Sentry error!");
});

app.use(notFound);

if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

app.use(errorHandler);

module.exports = app;
