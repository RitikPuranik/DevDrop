const Website = require('../models/Website');
const Purchase = require('../models/Purchase');
const Payment = require('../models/Payment');
const Payout = require('../models/Payout');
const User = require('../models/User');
const BankDetails = require('../models/BankDetails');
const razorpayService = require('../services/razorpayService');
const { calculatePricing } = require('../utils/helpers');
const { WEBSITE_STATUS, PAYMENT_STATUS, PAYOUT_STATUS } = require('../utils/constants');
const emailService = require('../services/emailService');

/**
 * @route   POST /api/payment/create-order
 * @desc    Create Razorpay order for paid/exclusive website
 * @access  Private (Verified users only)
 */
const createOrder = async (req, res) => {
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

    // Generate receipt ID
    const receipt = `rcpt_${Date.now()}_${websiteId.toString().slice(-6)}`;

    // Create Razorpay order using service
    const order = await razorpayService.createOrder(
      pricing.totalPaid,
      'INR',
      receipt,
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
      razorpayOrderId: order.id,
      amount: pricing.totalPaid,
      currency: 'INR',
      status: 'created',
      paymentMethod: 'razorpay',
    });

    await payment.save();

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: {
        orderId: order.id,
        amount: pricing.totalPaid,
        currency: 'INR',
        keyId: process.env.RAZORPAY_KEY_ID,
        prefill: {
          name: req.user?.name || '',
          email: req.user?.email || '',
          contact: req.user?.phone || '',
        },
        breakdown: pricing,
        websiteDetails: {
          id: website._id,
          name: website.name,
          category: website.category,
        },
      },
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating order',
      error: error.message,
    });
  }
};

/**
 * @route   POST /api/payment/verify
 * @desc    Verify Razorpay payment and AUTOMATICALLY pay seller
 * @access  Private
 */
const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    // Verify signature
    const isValid = razorpayService.verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature',
      });
    }

    // Fetch payment details from Razorpay
    const payment = await razorpayService.fetchPayment(razorpay_payment_id);

    if (payment.status !== 'captured') {
      return res.status(400).json({
        success: false,
        message: 'Payment not completed',
      });
    }

    // Find payment record
    const paymentRecord = await Payment.findOne({
      razorpayOrderId: razorpay_order_id,
    });

    if (!paymentRecord) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found',
      });
    }

    // Check if already processed
    if (paymentRecord.status === 'succeeded') {
      return res.status(400).json({
        success: false,
        message: 'Payment already processed',
      });
    }

    // Get website details
    const website = await Website.findById(paymentRecord.websiteId).populate('sellerId');

    if (!website) {
      return res.status(404).json({
        success: false,
        message: 'Website not found',
      });
    }

    // Calculate pricing
    const pricing = calculatePricing(website.price);

    // Update payment record
    paymentRecord.status = 'succeeded';
    paymentRecord.razorpayPaymentId = razorpay_payment_id;
    paymentRecord.razorpaySignature = razorpay_signature;
    paymentRecord.razorpayResponse = payment;
    await paymentRecord.save();

    // Create purchase record
    const purchase = new Purchase({
      websiteId: paymentRecord.websiteId,
      buyerId: paymentRecord.buyerId,
      sellerId: website.sellerId._id,
      category: website.category,
      sellerPrice: pricing.sellerPrice,
      platformFee: pricing.platformFee,
      tax: pricing.tax,
      totalPaid: pricing.totalPaid,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      paymentStatus: PAYMENT_STATUS.COMPLETED,
      purchaseDate: new Date(),
    });

    await purchase.save();

    // Update payment with purchaseId
    paymentRecord.purchaseId = purchase._id;
    await paymentRecord.save();

    // ==================== 🔥 FULLY AUTOMATIC PAYOUT TO SELLER ====================
    
    // Get seller's bank details
    const sellerBankDetails = await BankDetails.findOne({ 
      userId: website.sellerId._id
    });

    let payoutStatus = 'pending';
    let payoutMessage = '';
    let payoutId = null;

    // Check if seller has bank details
    if (!sellerBankDetails) {
      console.log(`⚠️ Seller ${website.sellerId.email} has no bank details!`);
      payoutMessage = 'Seller bank details missing - admin will contact seller';
      
      // Create pending payout for admin to handle
      const payoutRecord = new Payout({
        sellerId: website.sellerId._id,
        purchaseId: purchase._id,
        websiteId: website._id,
        amount: pricing.sellerPrice,
        status: PAYOUT_STATUS.PENDING,
        failureReason: 'No bank details provided',
        isAutomatic: false,
      });
      await payoutRecord.save();
      payoutId = payoutRecord._id;
      
      // Alert admin
      await emailService.sendAdminAlert({
        subject: '⚠️ Seller Missing Bank Details',
        message: `Seller ${website.sellerId.email} (${website.sellerId._id}) has no bank details.`,
        details: `Website: ${website.name}\nAmount: ₹${pricing.sellerPrice}\nPurchase ID: ${purchase._id}`,
      });
      
    } else {
      try {
        console.log(`🚀 Processing AUTOMATIC payout to seller: ${website.sellerId.email}`);
        console.log(`Bank: ${sellerBankDetails.bankName} | Account: XXXX${sellerBankDetails.accountNumber?.slice(-4)}`);
        
        // Create payout record
        const payoutRecord = new Payout({
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
          status: 'processing',
          isAutomatic: true,
        });

        await payoutRecord.save();
        payoutId = payoutRecord._id;

        // 🔥 STEP 1: Create/Get Razorpay Contact for seller
        let contactId = sellerBankDetails.razorpayContactId;
        let fundAccountId = sellerBankDetails.razorpayFundAccountId;
        
        // If first time, create contact and fund account
        if (!contactId || !fundAccountId) {
          console.log('🆕 First time payout for this seller - creating Razorpay contact...');
          
          // Create contact in Razorpay
          const contact = await razorpayService.createContact(
            sellerBankDetails.accountHolderName,
            website.sellerId.email,
            website.sellerId.phone || '9999999999', // Make sure users have phone
            'vendor'
          );
          contactId = contact.id;
          
          // Create fund account (bank account)
          const fundAccount = await razorpayService.createFundAccount(
            contactId,
            'bank_account',
            {
              bank_account: {
                name: sellerBankDetails.accountHolderName,
                ifsc: sellerBankDetails.ifscCode,
                account_number: sellerBankDetails.accountNumber,
              },
            }
          );
          fundAccountId = fundAccount.id;
          
          // Save for future payouts
          sellerBankDetails.razorpayContactId = contactId;
          sellerBankDetails.razorpayFundAccountId = fundAccountId;
          sellerBankDetails.razorpayStatus = 'active';
          await sellerBankDetails.save();
          
          console.log(`✅ Razorpay contact created: ${contactId}`);
          console.log(`✅ Fund account created: ${fundAccountId}`);
        }

        // 🔥 STEP 2: SEND MONEY TO SELLER'S BANK ACCOUNT
        // This is the magic line! Money goes from YOUR Razorpay account to seller's bank
        const razorpayPayout = await razorpayService.createPayout(
          fundAccountId,                    // Seller's fund account (linked to their bank)
          pricing.sellerPrice,               // Amount in rupees
          'INR',
          'IMPS',                            // IMPS = 5-30 minutes, works 24x7
          'payout',
          {
            purchaseId: purchase._id.toString(),
            websiteId: website._id.toString(),
            sellerId: website.sellerId._id.toString(),
            websiteName: website.name,
          }
        );

        // Update payout record with success
        payoutRecord.razorpayPayoutId = razorpayPayout.id;
        payoutRecord.status = PAYOUT_STATUS.COMPLETED;
        payoutRecord.utr = razorpayPayout.utr || `RZP_${Date.now()}`;
        payoutRecord.transactionDate = new Date();
        payoutRecord.processedAt = new Date();
        await payoutRecord.save();

        console.log(`✅✅✅ AUTOMATIC PAYOUT SUCCESSFUL!`);
        console.log(`💰 Amount: ₹${pricing.sellerPrice}`);
        console.log(`🏦 Bank: ${sellerBankDetails.bankName}`);
        console.log(`🔢 UTR: ${payoutRecord.utr}`);
        
        payoutStatus = 'completed';
        payoutMessage = `Payment sent to your bank account! UTR: ${payoutRecord.utr}`;
        
        // Send success notification to seller
        try {
          await emailService.sendPayoutNotification(website.sellerId, {
            amount: pricing.sellerPrice,
            utr: payoutRecord.utr,
            status: 'completed',
            bankName: sellerBankDetails.bankName,
            accountNumber: `XXXX${sellerBankDetails.accountNumber?.slice(-4)}`,
            websiteName: website.name,
            message: 'Payment has been sent to your bank account automatically!'
          });
        } catch (emailError) {
          console.error('Payout email failed:', emailError);
        }

      } catch (payoutError) {
        console.error('❌❌❌ AUTOMATIC PAYOUT FAILED:', payoutError);
        
        // Update existing payout record or create failed one
        const failedPayout = await Payout.findOneAndUpdate(
          { purchaseId: purchase._id },
          {
            status: PAYOUT_STATUS.FAILED,
            failureReason: payoutError.message,
            isAutomatic: true,
          },
          { new: true, upsert: true }
        );
        
        payoutStatus = 'failed';
        payoutMessage = 'Automatic payout failed - admin will process manually';
        payoutId = failedPayout._id;

        // CRITICAL: Alert admin immediately!
        await emailService.sendAdminAlert({
          subject: '🚨 URGENT: Automatic Payout Failed',
          message: `Failed to pay seller ${website.sellerId.email} ₹${pricing.sellerPrice}`,
          details: `
            Seller: ${website.sellerId.email} (${website.sellerId._id})
            Website: ${website.name}
            Amount: ₹${pricing.sellerPrice}
            Bank: ${sellerBankDetails?.bankName}
            Account: XXXX${sellerBankDetails?.accountNumber?.slice(-4)}
            Error: ${payoutError.message}
            
            Action Required: Please process this payout manually in admin dashboard.
          `,
        });
      }
    }

    // ==================== 🔥 END OF AUTOMATIC PAYOUT ====================

    // If exclusive, mark as sold
    if (website.category === 'exclusive') {
      website.status = WEBSITE_STATUS.SOLD;
      website.soldTo = paymentRecord.buyerId;
      website.soldAt = new Date();
      await website.save();
    }

    // Send notification emails
    const buyer = await User.findById(paymentRecord.buyerId);
    try {
      await emailService.sendPurchaseConfirmation(buyer, website, purchase);
      await emailService.sendSellerNotification(website.sellerId, website, purchase);
    } catch (emailError) {
      console.error('Failed to send emails:', emailError);
    }

    // Prepare response message based on payout status
    let successMessage = 'Payment verified successfully. ';
    if (payoutStatus === 'completed') {
      successMessage += 'Seller has been paid automatically! 💰';
    } else if (payoutStatus === 'failed') {
      successMessage += 'Automatic payout failed. Admin will process manually.';
    } else {
      successMessage += 'Seller payout is pending.';
    }

    res.json({
      success: true,
      message: successMessage,
      data: {
        purchase,
        website: {
          id: website._id,
          name: website.name,
          category: website.category,
        },
        payout: {
          status: payoutStatus,
          amount: pricing.sellerPrice,
          message: payoutMessage,
          id: payoutId,
          utr: payoutStatus === 'completed' ? payoutRecord?.utr : null,
        },
        breakdown: pricing,
      },
    });

  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying payment',
      error: error.message,
    });
  }
};

/**
 * @route   POST /api/payment/webhook
 * @desc    Handle Razorpay webhooks
 * @access  Public (verified by Razorpay signature)
 */
const handleWebhook = async (req, res) => {
  // Check if webhooks are configured
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    console.log('⚠️  RAZORPAY_WEBHOOK_SECRET not configured. Skipping webhook handling.');
    console.log('💡 Tip: Payments will work fine using manual verification via /api/payment/verify');
    return res.status(200).json({ 
      received: true,
      message: 'Webhooks not configured. Using manual payment verification instead.' 
    });
  }

  const webhookSignature = req.headers['x-razorpay-signature'];
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  try {
    // Verify webhook signature
    const isValid = razorpayService.verifyWebhookSignature(
      req.body,
      webhookSignature,
      webhookSecret
    );

    if (!isValid) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid webhook signature' 
      });
    }

    const event = req.body;
    console.log('✅ Webhook received:', event.event);

    // Handle different event types
    switch (event.event) {
      case 'payment.captured':
        const payment = event.payload.payment.entity;
        console.log('💰 Payment captured:', payment.id);
        await handlePaymentCaptured(payment);
        break;

      case 'payment.failed':
        const failedPayment = event.payload.payment.entity;
        console.log('❌ Payment failed:', failedPayment.id);
        await handlePaymentFailed(failedPayment);
        break;

      case 'refund.created':
      case 'refund.processed':
        const refund = event.payload.refund.entity;
        console.log('💸 Refund processed:', refund.id);
        await handleRefundProcessed(refund);
        break;

      default:
        console.log(`ℹ️  Unhandled event type: ${event.event}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('❌ Webhook handling failed:', err.message);
    res.status(400).json({ 
      success: false,
      message: `Webhook Error: ${err.message}` 
    });
  }
};

/**
 * Handle payment captured (called by webhook)
 */
const handlePaymentCaptured = async (payment) => {
  try {
    const paymentRecord = await Payment.findOne({
      razorpayOrderId: payment.order_id,
    });

    if (!paymentRecord) {
      console.log('⚠️  Payment record not found for order:', payment.order_id);
      return;
    }

    // Skip if already processed
    if (paymentRecord.status === 'succeeded') {
      console.log('ℹ️  Payment already marked as succeeded:', payment.id);
      return;
    }

    // Update payment record
    paymentRecord.status = 'succeeded';
    paymentRecord.razorpayPaymentId = payment.id;
    paymentRecord.razorpayResponse = payment;
    await paymentRecord.save();

    console.log('✅ Payment marked as succeeded:', payment.id);
  } catch (error) {
    console.error('❌ Handle payment captured error:', error);
  }
};

/**
 * Handle payment failed (called by webhook)
 */
const handlePaymentFailed = async (payment) => {
  try {
    const paymentRecord = await Payment.findOne({
      razorpayOrderId: payment.order_id,
    });

    if (!paymentRecord) {
      console.log('⚠️  Payment record not found for order:', payment.order_id);
      return;
    }

    // Update payment record
    paymentRecord.status = 'failed';
    paymentRecord.razorpayResponse = payment;
    paymentRecord.failureReason = payment.error_description || payment.error_reason || 'Payment failed';
    paymentRecord.failureCode = payment.error_code;
    await paymentRecord.save();

    console.log('❌ Payment marked as failed:', payment.id);
  } catch (error) {
    console.error('❌ Handle payment failure error:', error);
  }
};

/**
 * Handle refund processed (called by webhook)
 */
const handleRefundProcessed = async (refund) => {
  try {
    const paymentRecord = await Payment.findOne({
      razorpayPaymentId: refund.payment_id,
    });

    if (!paymentRecord) {
      console.log('⚠️  Payment record not found for payment:', refund.payment_id);
      return;
    }

    // Update payment record
    paymentRecord.status = 'refunded';
    paymentRecord.refundId = refund.id;
    paymentRecord.refundAmount = refund.amount / 100;
    paymentRecord.refundedAt = new Date(refund.created_at * 1000);
    await paymentRecord.save();

    // Update purchase record
    await Purchase.updateOne(
      { razorpayPaymentId: refund.payment_id },
      { paymentStatus: 'refunded' }
    );

    console.log('✅ Refund processed for payment:', refund.payment_id);
  } catch (error) {
    console.error('❌ Handle refund processed error:', error);
  }
};

/**
 * @route   POST /api/payment/refund
 * @desc    Create refund for a payment (Admin only)
 * @access  Admin
 */
const createRefund = async (req, res) => {
  try {
    const { paymentId, amount, reason } = req.body;

    // Find payment record
    const paymentRecord = await Payment.findOne({
      razorpayPaymentId: paymentId,
    });

    if (!paymentRecord) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    if (paymentRecord.status !== 'succeeded') {
      return res.status(400).json({
        success: false,
        message: 'Can only refund succeeded payments',
      });
    }

    // Create refund using service
    const refundAmount = amount ? parseFloat(amount) : null;
    const refund = await razorpayService.createRefund(
      paymentId,
      refundAmount,
      { reason: reason || 'requested_by_customer' }
    );

    // Update payment record
    paymentRecord.status = 'refunded';
    paymentRecord.refundId = refund.id;
    paymentRecord.refundAmount = refund.amount / 100;
    paymentRecord.refundReason = reason;
    paymentRecord.refundedAt = new Date();
    await paymentRecord.save();

    res.json({
      success: true,
      message: 'Refund processed successfully',
      data: {
        refundId: refund.id,
        amount: refund.amount / 100,
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
  createOrder,
  verifyPayment,
  handleWebhook,
  createRefund,
};