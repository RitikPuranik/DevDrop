const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { errorHandler, notFound } = require('./shared/middleware/errorHandler');
const { generalLimiter } = require('./shared/middleware/rateLimit');

const app = express();

// Security
app.use(helmet());
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
].filter(Boolean);
app.use(cors({ origin: allowedOrigins, credentials: true }));

// Webhook must receive raw body for Razorpay signature verification — register BEFORE json parser
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }), (req, res, next) => {
  if (req.method === 'POST') req.rawBody = req.body;
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(process.env.NODE_ENV === 'development' ? morgan('dev') : morgan('combined'));
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

app.use(notFound);
app.use(errorHandler);

module.exports = app;
