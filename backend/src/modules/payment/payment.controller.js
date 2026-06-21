const Website  = require('../website/website.model');
const Purchase = require('./purchase.model');
const Payment  = require('./payment.model');
const Payout   = require('../payout/payout.model');
const User     = require('../user/user.model');
const BankDetails = require('../user/bankDetails.model');
const Auction = require('../auction/auction.model');
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

    let priceToUse = website.price;
    let auctionStartingPrice = null;

    if (website.category === 'exclusive') {
      if (website.status === WEBSITE_STATUS.SOLD) {
        return res.status(400).json({
          success: false,
          message: 'This exclusive website has already been sold',
        });
      }

      const auction = await Auction.findOne({ websiteId: website._id, status: 'awaiting_payment' });
      if (!auction) {
        return res.status(400).json({
          success: false,
          message: 'There is no pending payment for this auction',
        });
      }

      if (auction.currentBidderId.toString() !== buyer._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'You are not the winner of this auction',
        });
      }

      if (auction.hasPaymentDeadlinePassed && auction.hasPaymentDeadlinePassed()) {
        return res.status(400).json({
          success: false,
          message: 'Payment deadline has passed',
        });
      }

      priceToUse = auction.currentBidAmount;
      auctionStartingPrice = auction.startingPrice;
    } else {
      if (website.status !== WEBSITE_STATUS.APPROVED) {
        return res.status(400).json({
          success: false,
          message: 'This website is not available for purchase',
        });
      }
    }

    if (website.category === 'free')
      return res.status(400).json({ success: false, message: 'Free website — use the free purchase endpoint.' });

    const existingPurchase = await Purchase.findOne({ websiteId, buyerId: buyer._id });
    if (existingPurchase)
      return res.status(400).json({ success: false, message: 'You have already purchased this website' });

    const pricing = calculatePricing(priceToUse, { startingPrice: auctionStartingPrice });

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
    const { 
      razorpayOrderId, razorpayPaymentId, razorpaySignature,
      razorpay_order_id, razorpay_payment_id, razorpay_signature 
    } = req.body;

    const orderId = razorpayOrderId || razorpay_order_id;
    const paymentId = razorpayPaymentId || razorpay_payment_id;
    const signature = razorpaySignature || razorpay_signature;

    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({
        success: false,
        message: 'razorpayOrderId, razorpayPaymentId, and razorpaySignature are all required',
      });
    }

    // Verify signature authenticity
    const isValid = razorpayService.verifyPaymentSignature(orderId, paymentId, signature);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature — possible tampering detected' });
    }

    // Fetch payment record
    const paymentRecord = await Payment.findOne({ razorpayOrderId: orderId });
    if (!paymentRecord) return res.status(404).json({ success: false, message: 'Payment record not found' });
    if (paymentRecord.status === 'succeeded') return res.status(400).json({ success: false, message: 'Payment already processed' });

    // Fetch payment details from Razorpay to double-check status
    let rzpPayment;
    try {
      // Log incoming verify request in development to aid debugging (one-liner)
      if (process.env.NODE_ENV === 'development') {
        console.log('verifyPayment request body:', { orderId, paymentId, signature, websiteId: req.body.websiteId });
      }

      rzpPayment = await razorpayService.fetchPayment(paymentId);
    } catch (rzErr) {
      console.error('Razorpay fetchPayment error:', rzErr);
      // Return a 502 to indicate upstream payment provider error instead of 500
      return res.status(502).json({ success: false, message: 'Payment provider error. Please try again later.' });
    }

    if (rzpPayment.status !== 'captured' && rzpPayment.status !== 'authorized') {
      return res.status(400).json({
        success: false,
        message: `Payment not successful. Razorpay status: ${rzpPayment.status}`,
      });
    }

    const website = await Website.findById(paymentRecord.websiteId).populate('sellerId');
    if (!website) return res.status(404).json({ success: false, message: 'Website not found' });

    let priceToUse = website.price;
    let auctionStartingPrice = null;
    if (website.category === 'exclusive') {
      const auction = await Auction.findOne({ websiteId: website._id, status: 'awaiting_payment' });
      if (auction) {
        priceToUse = auction.currentBidAmount;
        auctionStartingPrice = auction.startingPrice;
        auction.status = 'completed';
        await auction.save();
      }
    }

    const pricing = calculatePricing(priceToUse, { startingPrice: auctionStartingPrice });

    const existingPurchase = paymentRecord.purchaseId
      ? await Purchase.findById(paymentRecord.purchaseId)
      : await Purchase.findOne({
          websiteId: paymentRecord.websiteId,
          buyerId: paymentRecord.buyerId,
        });

    if (existingPurchase) {
      paymentRecord.status = 'succeeded';
      paymentRecord.razorpayPaymentId = paymentId;
      paymentRecord.razorpaySignature = signature;
      paymentRecord.gatewayResponse = rzpPayment;
      paymentRecord.purchaseId = existingPurchase._id;
      await paymentRecord.save();

      if (website.category === 'exclusive' && website.status !== WEBSITE_STATUS.SOLD) {
        website.status = WEBSITE_STATUS.SOLD;
        website.soldTo = paymentRecord.buyerId;
        website.soldAt = new Date();
        try {
          await website.save();
        } catch (websiteError) {
          console.error('Failed to mark exclusive website as sold:', websiteError);
        }
      }

      return res.json({
        success: true,
        message: 'Payment verified successfully! The seller will be paid by the admin shortly.',
        data: {
          purchase: existingPurchase,
          website: { id: website._id, name: website.name, category: website.category },
          payout: {
            status: 'pending',
            amount: existingPurchase.sellerPrice,
            message: 'Payout will be processed by admin',
            id: existingPurchase._id,
          },
          breakdown: {
            sellerPrice: existingPurchase.sellerPrice,
            platformFee: existingPurchase.platformFee,
            tax: existingPurchase.tax,
            totalPaid: existingPurchase.totalPaid,
            platformCommission: existingPurchase.platformCommission || 0,
          },
        },
      });
    }

    // Update payment record
    paymentRecord.status = 'succeeded';
    paymentRecord.razorpayPaymentId = paymentId;
    paymentRecord.razorpaySignature = signature;
    paymentRecord.gatewayResponse = rzpPayment;
    await paymentRecord.save();

    const sellerId = website.sellerId ? website.sellerId._id : null;

    // Create purchase record
    let purchase;
    try {
      purchase = new Purchase({
        websiteId: paymentRecord.websiteId,
        buyerId: paymentRecord.buyerId,
        sellerId: sellerId,
        category: website.category,
        sellerPrice: pricing.sellerPrice,
        platformFee: pricing.platformFee,
        tax: pricing.tax,
        totalPaid: pricing.totalPaid,
        platformCommission: pricing.platformCommission || 0,
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        paymentStatus: PAYMENT_STATUS.COMPLETED,
        purchaseDate: new Date(),
      });
      await purchase.save();
    } catch (error) {
      if (error?.code === 11000) {
        const recoveredPurchase = await Purchase.findOne({
          websiteId: paymentRecord.websiteId,
          buyerId: paymentRecord.buyerId,
        });

        if (recoveredPurchase) {
          paymentRecord.purchaseId = recoveredPurchase._id;
          await paymentRecord.save();

          return res.json({
            success: true,
            message: 'Payment verified successfully! The seller will be paid by the admin shortly.',
            data: {
              purchase: recoveredPurchase,
              website: { id: website._id, name: website.name, category: website.category },
              payout: {
                status: 'pending',
                amount: recoveredPurchase.sellerPrice,
                message: 'Payout will be processed by admin',
                id: recoveredPurchase._id,
              },
              breakdown: {
                sellerPrice: recoveredPurchase.sellerPrice,
                platformFee: recoveredPurchase.platformFee,
                tax: recoveredPurchase.tax,
                totalPaid: recoveredPurchase.totalPaid,
                platformCommission: recoveredPurchase.platformCommission || 0,
              },
            },
          });
        }
      }

      throw error;
    }

    paymentRecord.purchaseId = purchase._id;
    await paymentRecord.save();

    const sellerBankDetails = sellerId ? await BankDetails.findOne({ userId: sellerId }) : null;
    let payoutRecord = null;

    try {
      // ========== MANUAL PAYOUT — Create pending record for admin to process ==========
      if (sellerId) {
        payoutRecord = new Payout({
          sellerId: sellerId,
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
          failureReason: sellerBankDetails ? null : 'Seller has no bank details on file or seller deleted',
        });
        await payoutRecord.save();

        try {
          const sellerEmail = website.sellerId ? website.sellerId.email : 'Unknown/Deleted';
          await emailService.sendAdminAlert({
            subject: `New Payout Pending — ${website.name}`,
            message: `A new purchase was made. Please process the seller payout manually.`,
            details: `Seller: ${sellerEmail}\nWebsite: ${website.name}\nAmount: ₹${pricing.sellerPrice}\nPurchase ID: ${purchase._id}\nPayout ID: ${payoutRecord._id}${!sellerBankDetails ? '\n\n⚠️ WARNING: Seller has no bank details saved!' : ''}`,
          });
        } catch (e) { console.error('Admin alert email error:', e); }
      } else {
        console.warn('Skipping payout creation: sellerId missing for purchase', purchase._id.toString());
      }
    } catch (payoutError) {
      console.error('Payout creation error:', payoutError);
    }

    if (website.category === 'exclusive') {
      try {
        website.status = WEBSITE_STATUS.SOLD;
        website.soldTo = paymentRecord.buyerId;
        website.soldAt = new Date();
        await website.save();
      } catch (websiteError) {
        console.error('Failed to mark exclusive website as sold:', websiteError);
      }
    }

    try {
      // Send confirmation emails
      const buyer = await User.findById(paymentRecord.buyerId);
      await emailService.sendPurchaseConfirmation(buyer, website, purchase);
      if (website.sellerId) {
        await emailService.sendSellerNotification(website.sellerId, website, purchase);
      }
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
          id: payoutRecord?._id || null,
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
 * @desc   Handle Razorpay webhooks (payment.captured, payment.failed)
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
      default:
        console.log(`ℹ️  Unhandled webhook event: ${eventType}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).json({ success: false, message: `Webhook error: ${error.message}` });
  }
};

module.exports = { createOrder, verifyPayment, handleWebhook };
