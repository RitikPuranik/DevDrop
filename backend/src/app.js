const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { generalLimiter } = require('./middleware/rateLimit');

// Import routes
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const websiteRoutes = require('./routes/website.routes');
const sellerRoutes = require('./routes/seller.routes');
const buyerRoutes = require('./routes/buyer.routes');
const adminRoutes = require('./routes/admin.routes');
const paymentRoutes = require('./routes/payment.routes');
const payoutRoutes = require('./routes/payout.routes');
const wishlistRoutes = require('./routes/wishlist.routes');
const assetRoutes = require('./routes/asset.routes');
const auctionRoutes = require('./routes/auction.routes');

// Create Express app
const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// Webhook route MUST come before body parser middleware
// Stripe webhooks require raw body
app.use('/api/payment/webhook', 
  express.raw({ type: 'application/json' }),
  require('./routes/payment.routes')
);

// Body parser middleware (for all other routes)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Rate limiting
app.use('/api/', generalLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/websites', websiteRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/buyer', buyerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/payout', payoutRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/auctions', auctionRoutes);

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

module.exports = app;