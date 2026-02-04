const Website = require('../models/Website');
const Purchase = require('../models/Purchase');
const Payment = require('../models/Payment');
const Payout = require('../models/Payout');
const User = require('../models/User');
const BankDetails = require('../models/BankDetails');
const stripeService = require('../services/stripeService');
const { calculatePricing } = require('../utils/helpers');
const { WEBSITE_STATUS, PAYMENT_STATUS, PAYOUT_STATUS } = require('../utils/constants');
const emailService = require('../services/emailService');

/**
 * @route   POST /api/payment/create-payment-intent
 * @desc    Create Stripe PaymentIntent for paid/exclusive website
 * @access  Private (Verified users only)
 */
const createPaymentIntent = async (req, res) => {
  try {
    const { websiteId } = req.body;
    const buyerId = req.userId;

    // Find website
    const website = await Website.findOne({
      _id: websiteId,
      isDeleted: false,
    }).populate('sellerId');

    if (!website) {
      return res.status(404).json({
        success: false,
        message: 'Website not found',
      });
    }

    // Validation checks
    if (website.status !== WEBSITE_STATUS.APPROVED) {
      return res.status(400).json({
        success: false,
        message: 'This website is not available for purchase',
      });
    }

    if (website.category === 'free') {
      return res.status(400).json({
        success: false,
        message: 'This is a free website. Use free purchase endpoint.',
      });
    }

    if (website.category === 'exclusive' && website.status === WEBSITE_STATUS.SOLD) {
      return res.status(400).json({
        success: false,
        message: 'This exclusive website has already been sold',
      });
    }

    // Check if already purchased
    const existingPurchase = await Purchase.findOne({
      websiteId,
      buyerId,
    });

    if (existingPurchase) {
      return res.status(400).json({
        success: false,
        message: 'You have already purchased this website',
      });
    }

    // Calculate pricing
    const pricing = calculatePricing(website.price);

    // Create Stripe PaymentIntent using service
    const paymentIntent = await stripeService.createPaymentIntent(
      pricing.totalPaid,
      'INR',
      {
        websiteId: websiteId.toString(),
        buyerId: buyerId.toString(),
        sellerId: website.sellerId._id.toString(),
        category: website.category,
        sellerPrice: pricing.sellerPrice.toString(),
        platformFee: pricing.platformFee.toString(),
        tax: pricing.tax.toString(),
      }
    );

    // Create payment record in database
    const payment = new Payment({
      websiteId,
      buyerId,
      stripePaymentIntentId: paymentIntent.id,
      amount: pricing.totalPaid,
      currency: 'INR',
      status: 'created',
    });

    await payment.save();

    res.status(201).json({
      success: true,
      message: 'Payment intent created successfully',
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: pricing.totalPaid,
        currency: 'INR',
        breakdown: pricing,
        websiteDetails: {
          id: website._id,
          name: website.name,
          category: website.category,
        },
      },
    });
  } catch (error) {
    console.error('Create payment intent error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating payment intent',
      error: error.message,
    });
  }
};

/**
 * @route   POST /api/payment/confirm
 * @desc    Confirm payment and complete purchase
 * @access  Private
 */
const confirmPayment = async (req, res) => {
  try {
    const { paymentIntentId } = req.body;

    // Retrieve payment intent from Stripe using service
    const paymentIntent = await stripeService.retrievePaymentIntent(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        success: false,
        message: 'Payment not completed',
      });
    }

    // Find payment record
    const payment = await Payment.findOne({
      stripePaymentIntentId: paymentIntentId,
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found',
      });
    }

    // Check if already processed
    if (payment.status === 'succeeded') {
      return res.status(400).json({
        success: false,
        message: 'Payment already processed',
      });
    }

    // Get website details
    const website = await Website.findById(payment.websiteId).populate('sellerId');

    if (!website) {
      return res.status(404).json({
        success: false,
        message: 'Website not found',
      });
    }

    // Calculate pricing
    const pricing = calculatePricing(website.price);

    // Update payment record
    payment.status = 'succeeded';
    payment.stripeChargeId = paymentIntent.latest_charge;
    payment.stripeResponse = paymentIntent;
    await payment.save();

    // Create purchase record
    const purchase = new Purchase({
      websiteId: payment.websiteId,
      buyerId: payment.buyerId,
      sellerId: website.sellerId._id,
      category: website.category,
      sellerPrice: pricing.sellerPrice,
      platformFee: pricing.platformFee,
      tax: pricing.tax,
      totalPaid: pricing.totalPaid,
      stripePaymentIntentId: paymentIntentId,
      stripeChargeId: payment.stripeChargeId,
      paymentStatus: PAYMENT_STATUS.COMPLETED,
      purchaseDate: new Date(),
    });

    await purchase.save();

    // Create payout record for seller
    const sellerBankDetails = await BankDetails.findOne({ 
      userId: website.sellerId._id 
    });

    if (sellerBankDetails) {
      const payout = new Payout({
        sellerId: website.sellerId._id,
        purchaseId: purchase._id,
        websiteId: website._id,
        amount: pricing.sellerPrice,
        bankDetails: {
          accountHolderName: sellerBankDetails.accountHolderName,
          accountNumber: sellerBankDetails.accountNumber,
          ifscCode: sellerBankDetails.ifscCode,
          bankName: sellerBankDetails.bankName,
          branch: sellerBankDetails.branch,
          accountType: sellerBankDetails.accountType,
          upiId: sellerBankDetails.upiId,
        },
        status: PAYOUT_STATUS.PENDING,
      });

      await payout.save();
    }

    // If exclusive, mark as sold
    if (website.category === 'exclusive') {
      website.status = WEBSITE_STATUS.SOLD;
      website.soldTo = payment.buyerId;
      website.soldAt = new Date();
      await website.save();
    }

    // Send notification emails
    const buyer = await User.findById(payment.buyerId);
    try {
      await emailService.sendPurchaseConfirmation(buyer, website, purchase);
      await emailService.sendSellerNotification(website.sellerId, website, purchase);
    } catch (emailError) {
      console.error('Failed to send emails:', emailError);
    }

    res.json({
      success: true,
      message: 'Payment confirmed and purchase completed',
      data: {
        purchase,
        website: {
          id: website._id,
          name: website.name,
          category: website.category,
        },
      },
    });
  } catch (error) {
    console.error('Confirm payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Error confirming payment',
      error: error.message,
    });
  }
};

/**
 * @route   POST /api/payment/webhook
 * @desc    Handle Stripe webhooks (OPTIONAL - works without webhook secret)
 * @access  Public (verified by Stripe signature if secret is configured)
 */
const handleWebhook = async (req, res) => {
  // Check if webhooks are configured
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.log('⚠️  STRIPE_WEBHOOK_SECRET not configured. Skipping webhook handling.');
    console.log('💡 Tip: Payments will work fine using manual confirmation via /api/payment/confirm');
    return res.status(200).json({ 
      received: true,
      message: 'Webhooks not configured. Using manual payment confirmation instead.' 
    });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Verify webhook signature using service
    event = stripeService.verifyWebhookSignature(
      req.body,
      sig,
      webhookSecret
    );
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('✅ Webhook received:', event.type);

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log('💰 Payment succeeded:', paymentIntent.id);
      await handlePaymentSuccess(paymentIntent);
      break;

    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      console.log('❌ Payment failed:', failedPayment.id);
      await handlePaymentFailure(failedPayment);
      break;

    case 'charge.refunded':
      const refund = event.data.object;
      console.log('💸 Charge refunded:', refund.id);
      // Optionally handle refund logic here
      break;

    default:
      console.log(`ℹ️  Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
};

/**
 * Handle successful payment (called by webhook or manual confirmation)
 */
const handlePaymentSuccess = async (paymentIntent) => {
  try {
    const payment = await Payment.findOne({
      stripePaymentIntentId: paymentIntent.id,
    });

    if (!payment) {
      console.log('⚠️  Payment record not found for:', paymentIntent.id);
      return;
    }

    // Skip if already processed
    if (payment.status === 'succeeded') {
      console.log('ℹ️  Payment already marked as succeeded:', paymentIntent.id);
      return;
    }

    // Update payment record
    payment.status = 'succeeded';
    payment.stripeChargeId = paymentIntent.latest_charge;
    payment.stripeResponse = paymentIntent;
    await payment.save();

    console.log('✅ Payment marked as succeeded:', paymentIntent.id);
  } catch (error) {
    console.error('❌ Handle payment success error:', error);
  }
};

/**
 * Handle failed payment (called by webhook)
 */
const handlePaymentFailure = async (paymentIntent) => {
  try {
    const payment = await Payment.findOne({
      stripePaymentIntentId: paymentIntent.id,
    });

    if (!payment) {
      console.log('⚠️  Payment record not found for:', paymentIntent.id);
      return;
    }

    // Update payment record
    payment.status = 'failed';
    payment.stripeResponse = paymentIntent;
    payment.failureReason = paymentIntent.last_payment_error?.message || 'Payment failed';
    await payment.save();

    console.log('❌ Payment marked as failed:', paymentIntent.id);
  } catch (error) {
    console.error('❌ Handle payment failure error:', error);
  }
};

/**
 * @route   POST /api/payment/refund
 * @desc    Create refund for a payment (Admin only)
 * @access  Admin
 */
const createRefund = async (req, res) => {
  try {
    const { paymentIntentId, reason } = req.body;

    // Find payment record
    const payment = await Payment.findOne({
      stripePaymentIntentId: paymentIntentId,
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    if (payment.status !== 'succeeded') {
      return res.status(400).json({
        success: false,
        message: 'Can only refund succeeded payments',
      });
    }

    // Create refund using service
    const refund = await stripeService.createRefund(
      paymentIntentId,
      null, // Full refund
      reason || 'requested_by_customer'
    );

    // Update payment record
    payment.status = 'refunded';
    payment.refundId = refund.id;
    payment.refundAmount = payment.amount;
    payment.refundReason = reason;
    payment.refundedAt = new Date();
    await payment.save();

    res.json({
      success: true,
      message: 'Refund processed successfully',
      data: {
        refundId: refund.id,
        amount: payment.amount,
        status: refund.status,
      },
    });
  } catch (error) {
    console.error('Create refund error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating refund',
      error: error.message,
    });
  }
};

module.exports = {
  createPaymentIntent,
  confirmPayment,
  handleWebhook,
  createRefund,
};