const Website = require('../models/Website');
const Purchase = require('../models/Purchase');
const Payment = require('../models/Payment');
const Payout = require('../models/Payout');
const User = require('../models/User');
const BankDetails = require('../models/BankDetails');
const stripe = require('../config/stripe');
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

    // Get seller's bank details for automatic transfer
    const sellerBankDetails = await BankDetails.findOne({ 
      userId: website.sellerId._id 
    });

    // Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: pricing.totalPaid * 100, // Convert to paise/cents
      currency: 'inr',
      metadata: {
        websiteId: websiteId.toString(),
        buyerId: buyerId.toString(),
        sellerId: website.sellerId._id.toString(),
        category: website.category,
        sellerPrice: pricing.sellerPrice,
        platformFee: pricing.platformFee,
        tax: pricing.tax,
      },
      // Enable automatic transfer to seller
      transfer_data: sellerBankDetails ? {
        amount: pricing.sellerPrice * 100, // Seller gets exact price
        // destination: sellerStripeAccountId, // We'll set this up later
      } : undefined,
      description: `Purchase: ${website.name}`,
    });

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

    // Retrieve payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

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

    // AUTO-TRANSFER TO SELLER using Stripe Transfer API
    const sellerBankDetails = await BankDetails.findOne({ 
      userId: website.sellerId._id 
    });

    if (sellerBankDetails) {
      try {
        // Create transfer to seller
        // Note: Seller must have Stripe Connect account
        // We'll implement this in next step
        
        // For now, create payout record for manual processing
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
            upiId: sellerBankDetails.upiId,
          },
          status: PAYOUT_STATUS.PENDING,
        });

        await payout.save();
      } catch (transferError) {
        console.error('Transfer error:', transferError);
        // Continue even if transfer fails - admin can process manually
      }
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
 * @desc    Handle Stripe webhooks
 * @access  Public (verified by Stripe signature)
 */
const handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      webhookSecret
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      await handlePaymentSuccess(paymentIntent);
      break;

    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      await handlePaymentFailure(failedPayment);
      break;

    case 'charge.refunded':
      const refund = event.data.object;
      console.log('Charge refunded:', refund.id);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
};

/**
 * Handle successful payment
 */
const handlePaymentSuccess = async (paymentIntent) => {
  try {
    const payment = await Payment.findOne({
      stripePaymentIntentId: paymentIntent.id,
    });

    if (payment && payment.status !== 'succeeded') {
      payment.status = 'succeeded';
      payment.stripeChargeId = paymentIntent.latest_charge;
      payment.stripeResponse = paymentIntent;
      await payment.save();

      console.log('Payment marked as succeeded:', paymentIntent.id);
    }
  } catch (error) {
    console.error('Handle payment success error:', error);
  }
};

/**
 * Handle failed payment
 */
const handlePaymentFailure = async (paymentIntent) => {
  try {
    const payment = await Payment.findOne({
      stripePaymentIntentId: paymentIntent.id,
    });

    if (payment) {
      payment.status = 'failed';
      payment.stripeResponse = paymentIntent;
      await payment.save();

      console.log('Payment marked as failed:', paymentIntent.id);
    }
  } catch (error) {
    console.error('Handle payment failure error:', error);
  }
};

module.exports = {
  createPaymentIntent,
  confirmPayment,
  handleWebhook,
};