const Website  = require('../website/website.model');
const Purchase = require('./purchase.model');
const Payment  = require('./payment.model');
const Payout   = require('../payout/payout.model');
const User     = require('../user/user.model');
const BankDetails = require('../user/bankDetails.model');
const razorpayService = require('../../services/razorpay.service');
const { calculatePricing } = require('../../shared/utils/helpers');
const { WEBSITE_STATUS, PAYMENT_STATUS, PAYOUT_STATUS } = require('../../shared/utils/constants');
const emailService = require('../../services/email.service');

/**
 * @route  POST /api/payment/create-order
 * @desc   Create Razorpay order for paid/exclusive website
 * @access Private (Verified users only)
 */
const createOrder = async (req, res) => {
  try {
    const { websiteId } = req.body;
    const buyer = req.user;

    const website = await Website.findOne({ _id: websiteId, isDeleted: false }).populate('sellerId');
    if (!website) return res.status(404).json({ success: false, message: 'Website not found' });

    if (website.status !== WEBSITE_STATUS.APPROVED) {
      return res.status(400).json({
        success: false,
        message: website.status === WEBSITE_STATUS.SOLD
          ? 'This exclusive website has already been sold'
          : 'This website is not available for purchase',
      });
    }

    if (website.category === 'free')
      return res.status(400).json({ success: false, message: 'Free website — use the free purchase endpoint.' });

    const existingPurchase = await Purchase.findOne({ websiteId, buyerId: buyer._id });
    if (existingPurchase)
      return res.status(400).json({ success: false, message: 'You have already purchased this website' });

    const pricing = calculatePricing(website.price);

    // Internal receipt ID — unique per order attempt
    const receiptId = `rcpt_${Date.now()}_${websiteId.toString().slice(-6)}`;

    const rzpOrder = await razorpayService.createOrder(receiptId, pricing.totalPaid, 'INR');

    // Save payment record
    const payment = new Payment({
      websiteId,
      buyerId: buyer._id,
      razorpayOrderId: rzpOrder.id,
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
        razorpayOrderId: rzpOrder.id,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID,
        amount: pricing.totalPaid,
        amountInPaise: rzpOrder.amount,
        currency: 'INR',
        breakdown: pricing,
        websiteDetails: { id: website._id, name: website.name, category: website.category },
        prefill: {
          name: buyer.name,
          email: buyer.email,
          contact: buyer.phone || '',
        },
      },
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ success: false, message: 'Error creating order', error: error.message });
  }
};

/**
 * @route  POST /api/payment/verify
 * @desc   Verify Razorpay payment signature after checkout.
 *         Creates a PENDING payout record — admin will pay seller manually.
 * @access Private
 */
const verifyPayment = async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: 'razorpayOrderId, razorpayPaymentId, and razorpaySignature are all required',
      });
    }

    // Verify signature authenticity
    const isValid = razorpayService.verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature — possible tampering detected' });
    }

    // Fetch payment record
    const paymentRecord = await Payment.findOne({ razorpayOrderId });
    if (!paymentRecord) return res.status(404).json({ success: false, message: 'Payment record not found' });
    if (paymentRecord.status === 'succeeded') return res.status(400).json({ success: false, message: 'Payment already processed' });

    // Fetch payment details from Razorpay to double-check status
    const rzpPayment = await razorpayService.fetchPayment(razorpayPaymentId);
    if (rzpPayment.status !== 'captured' && rzpPayment.status !== 'authorized') {
      return res.status(400).json({
        success: false,
        message: `Payment not successful. Razorpay status: ${rzpPayment.status}`,
      });
    }

    const website = await Website.findById(paymentRecord.websiteId).populate('sellerId');
    if (!website) return res.status(404).json({ success: false, message: 'Website not found' });

    const pricing = calculatePricing(website.price);

    // Update payment record
    paymentRecord.status = 'succeeded';
    paymentRecord.razorpayPaymentId = razorpayPaymentId;
    paymentRecord.razorpaySignature = razorpaySignature;
    paymentRecord.gatewayResponse = rzpPayment;
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
      razorpayOrderId,
      razorpayPaymentId,
      paymentStatus: PAYMENT_STATUS.COMPLETED,
      purchaseDate: new Date(),
    });
    await purchase.save();

    paymentRecord.purchaseId = purchase._id;
    await paymentRecord.save();

    // ========== MANUAL PAYOUT — Create pending record for admin to process ==========
    const sellerBankDetails = await BankDetails.findOne({ userId: website.sellerId._id });

    const payoutRecord = new Payout({
      sellerId: website.sellerId._id,
      purchaseId: purchase._id,
      websiteId: website._id,
      amount: pricing.sellerPrice,
      bankDetails: sellerBankDetails ? {
        accountHolderName: sellerBankDetails.accountHolderName,
        accountNumber: sellerBankDetails.accountNumber,
        ifscCode: sellerBankDetails.ifscCode,
        bankName: sellerBankDetails.bankName,
        upiId: sellerBankDetails.upiId,
      } : null,
      status: PAYOUT_STATUS.PENDING,
      isAutomatic: false,
      failureReason: sellerBankDetails ? null : 'Seller has no bank details on file',
    });
    await payoutRecord.save();

    // Notify admin of pending payout
    try {
      await emailService.sendAdminAlert({
        subject: `New Payout Pending — ${website.name}`,
        message: `A new purchase was made. Please process the seller payout manually.`,
        details: `Seller: ${website.sellerId.email}\nWebsite: ${website.name}\nAmount: ₹${pricing.sellerPrice}\nPurchase ID: ${purchase._id}\nPayout ID: ${payoutRecord._id}${!sellerBankDetails ? '\n\n⚠️ WARNING: Seller has no bank details saved!' : ''}`,
      });
    } catch (e) { console.error('Admin alert email error:', e); }
    // ========== END PAYOUT HANDLING ==========

    // Mark exclusive website as sold
    if (website.category === 'exclusive') {
      website.status = WEBSITE_STATUS.SOLD;
      website.soldTo = paymentRecord.buyerId;
      website.soldAt = new Date();
      await website.save();
    }

    // Send confirmation emails
    const buyer = await User.findById(paymentRecord.buyerId);
    try {
      await emailService.sendPurchaseConfirmation(buyer, website, purchase);
      await emailService.sendSellerNotification(website.sellerId, website, purchase);
    } catch (e) { console.error('Confirmation email error:', e); }

    res.json({
      success: true,
      message: 'Payment verified successfully! The seller will be paid by the admin shortly.',
      data: {
        purchase,
        website: { id: website._id, name: website.name, category: website.category },
        payout: {
          status: 'pending',
          amount: pricing.sellerPrice,
          message: 'Payout will be processed by admin',
          id: payoutRecord._id,
        },
        breakdown: pricing,
      },
    });

  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({ success: false, message: 'Error verifying payment', error: error.message });
  }
};

/**
 * @route  POST /api/payment/webhook
 * @desc   Handle Razorpay webhooks (payment.captured, payment.failed, refund.created)
 * @access Public
 */
const handleWebhook = async (req, res) => {
  try {
    const razorpaySignature = req.headers['x-razorpay-signature'];

    if (razorpaySignature && process.env.RAZORPAY_WEBHOOK_SECRET) {
      const rawBody = Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body);
      const isValid = razorpayService.verifyWebhookSignature(rawBody, razorpaySignature);
      if (!isValid) return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }

    const event = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body;
    const eventType = event?.event;
    console.log('✅ Razorpay webhook received:', eventType);

    switch (eventType) {
      case 'payment.captured': {
        const payment = event.payload?.payment?.entity;
        const orderId = payment?.order_id;
        if (orderId) {
          await Payment.findOneAndUpdate(
            { razorpayOrderId: orderId },
            { status: 'succeeded', razorpayPaymentId: payment?.id, gatewayResponse: payment }
          );
          console.log(`💰 Payment captured for order: ${orderId}`);
        }
        break;
      }
      case 'payment.failed': {
        const payment = event.payload?.payment?.entity;
        const orderId = payment?.order_id;
        if (orderId) {
          await Payment.findOneAndUpdate(
            { razorpayOrderId: orderId },
            { status: 'failed', failureReason: payment?.error_description, failureCode: payment?.error_code, gatewayResponse: payment }
          );
          console.log(`❌ Payment failed for order: ${orderId}`);
        }
        break;
      }
      case 'refund.created': {
        const refund = event.payload?.refund?.entity;
        const paymentId = refund?.payment_id;
        if (paymentId) {
          await Payment.findOneAndUpdate(
            { razorpayPaymentId: paymentId },
            { status: 'refunded', refundId: refund?.id, refundAmount: refund?.amount / 100, refundedAt: new Date() }
          );
          await Purchase.findOneAndUpdate(
            { razorpayPaymentId: paymentId },
            { paymentStatus: 'refunded' }
          );
          console.log(`↩️  Refund created for payment: ${paymentId}`);
        }
        break;
      }
      default:
        console.log(`ℹ️  Unhandled webhook event: ${eventType}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).json({ success: false, message: `Webhook error: ${error.message}` });
  }
};

/**
 * @route  POST /api/payment/refund
 * @desc   Refund a payment (Admin only)
 * @access Admin
 */
const createRefund = async (req, res) => {
  try {
    const { paymentId, amount, reason } = req.body;

    const paymentRecord = await Payment.findOne({
      $or: [{ _id: paymentId }, { razorpayPaymentId: paymentId }],
    });
    if (!paymentRecord) return res.status(404).json({ success: false, message: 'Payment not found' });
    if (paymentRecord.status !== 'succeeded') return res.status(400).json({ success: false, message: 'Can only refund succeeded payments' });
    if (!paymentRecord.razorpayPaymentId) return res.status(400).json({ success: false, message: 'Razorpay payment ID missing — cannot process refund' });

    const refundAmount = amount || paymentRecord.amount;
    const refund = await razorpayService.createRefund(
      paymentRecord.razorpayPaymentId,
      refundAmount,
      { reason: reason || 'Refund requested' }
    );

    paymentRecord.status = 'refunded';
    paymentRecord.refundId = refund.id;
    paymentRecord.refundAmount = refundAmount;
    paymentRecord.refundReason = reason;
    paymentRecord.refundedAt = new Date();
    await paymentRecord.save();

    res.json({ success: true, message: 'Refund processed successfully', data: refund });
  } catch (error) {
    console.error('Refund error:', error);
    res.status(500).json({ success: false, message: 'Error creating refund', error: error.message });
  }
};

module.exports = { createOrder, verifyPayment, handleWebhook, createRefund };
