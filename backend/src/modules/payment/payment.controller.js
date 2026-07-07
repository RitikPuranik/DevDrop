const Website = require('../website/website.model');
const Purchase = require('./purchase.model');
const Payment = require('./payment.model');
const Payout = require('../payout/payout.model');
const User = require('../user/user.model');
const BankDetails = require('../user/bankDetails.model');
const Auction = require('../auction/auction.model');
const Coupon = require('../coupons/coupon.model');
const razorpayService = require('../../services/razorpay.service');
const { calculatePricing, applyCouponToPricing } = require('../../shared/utils/helpers');
const { WEBSITE_STATUS, PAYMENT_STATUS, PAYOUT_STATUS } = require('../../shared/utils/constants');
const emailService = require('../../services/email.service');

const COUPON_RESERVATION_MS = 15 * 60 * 1000;

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const normalizeCouponCode = (value) => String(value || '').trim().toUpperCase();

const getWebsiteSummary = (website) => ({
  id: website._id,
  name: website.name,
  category: website.category,
});

const getBreakdown = (record) => ({
  sellerPrice: record.sellerPrice || 0,
  platformFee: record.platformFee || 0,
  tax: record.tax || 0,
  totalPaid: record.totalPaid || 0,
  platformCommission: record.platformCommission || 0,
  subtotalBeforeDiscount: record.subtotalBeforeDiscount || 0,
  discountAmount: record.discountAmount || 0,
  subtotalAfterDiscount: record.subtotalAfterDiscount || 0,
  originalTotalPaid: record.originalTotalPaid || record.totalPaid || 0,
});

const getCouponSummary = (record) => {
  const code = record?.couponCode || record?.code;
  if (!code) return null;

  return {
    id: record.couponId || record._id || null,
    code,
    usageMode: record.usageMode,
    discountType: record.discountType || null,
    discountValue: record.discountValue || 0,
    discountAmount: record.discountAmount || 0,
  };
};

const getCouponPreview = (coupon, discountAmount = 0) => {
  if (!coupon) return null;
  return getCouponSummary({ ...coupon.toObject(), discountAmount });
};

const buildPaymentSnapshot = ({ websiteId, buyerId, pricing, coupon, reservationExpiresAt = null, paymentMethod = 'razorpay', status = 'created' }) => ({
  websiteId,
  buyerId,
  paymentMethod,
  amount: pricing.totalPaid,
  currency: 'INR',
  status,
  sellerPrice: pricing.sellerPrice,
  platformFee: pricing.platformFee,
  tax: pricing.tax,
  totalPaid: pricing.totalPaid,
  platformCommission: pricing.platformCommission || 0,
  subtotalBeforeDiscount: pricing.subtotalBeforeDiscount || 0,
  discountAmount: pricing.discountAmount || 0,
  subtotalAfterDiscount: pricing.subtotalAfterDiscount || 0,
  originalTotalPaid: pricing.originalTotalPaid || pricing.totalPaid,
  couponId: coupon?._id || null,
  couponCode: coupon?.code || null,
  discountType: coupon?.discountType || null,
  discountValue: coupon?.discountValue || 0,
  reservationExpiresAt,
});

const buildPurchaseSnapshot = ({ paymentRecord, website, orderId, paymentId }) => ({
  websiteId: paymentRecord.websiteId,
  buyerId: paymentRecord.buyerId,
  sellerId: website?.sellerId ? website.sellerId._id : null,
  category: website.category,
  sellerPrice: paymentRecord.sellerPrice,
  platformFee: paymentRecord.platformFee,
  tax: paymentRecord.tax,
  totalPaid: paymentRecord.totalPaid,
  platformCommission: paymentRecord.platformCommission || 0,
  subtotalBeforeDiscount: paymentRecord.subtotalBeforeDiscount || 0,
  discountAmount: paymentRecord.discountAmount || 0,
  subtotalAfterDiscount: paymentRecord.subtotalAfterDiscount || 0,
  originalTotalPaid: paymentRecord.originalTotalPaid || paymentRecord.totalPaid,
  couponId: paymentRecord.couponId || null,
  couponCode: paymentRecord.couponCode || null,
  discountType: paymentRecord.discountType || null,
  discountValue: paymentRecord.discountValue || 0,
  razorpayOrderId: orderId || paymentRecord.razorpayOrderId || undefined,
  razorpayPaymentId: paymentId || paymentRecord.razorpayPaymentId || undefined,
  paymentStatus: PAYMENT_STATUS.COMPLETED,
  purchaseDate: new Date(),
});

const loadPaymentContext = async (websiteId, buyer) => {
  const website = await Website.findOne({ _id: websiteId, isDeleted: false }).populate('sellerId');
  if (!website) throw createHttpError(404, 'Website not found');

  if (website.category === 'free') {
    throw createHttpError(400, 'Free website — use the free purchase endpoint.');
  }

  let priceToUse = website.price;
  let auctionStartingPrice = null;

  if (website.category === 'exclusive') {
    if (website.status === WEBSITE_STATUS.SOLD) {
      throw createHttpError(400, 'This exclusive website has already been sold');
    }

    const auction = await Auction.findOne({ websiteId: website._id, status: 'awaiting_payment' });
    if (!auction) {
      throw createHttpError(400, 'There is no pending payment for this auction');
    }

    if (auction.currentBidderId.toString() !== buyer._id.toString()) {
      throw createHttpError(403, 'You are not the winner of this auction');
    }

    if (auction.hasPaymentDeadlinePassed && auction.hasPaymentDeadlinePassed()) {
      throw createHttpError(400, 'Payment deadline has passed');
    }

    priceToUse = auction.currentBidAmount;
    auctionStartingPrice = auction.startingPrice;
  } else if (website.status !== WEBSITE_STATUS.APPROVED) {
    throw createHttpError(400, 'This website is not available for purchase');
  }

  const existingPurchase = await Purchase.findOne({ websiteId, buyerId: buyer._id });
  if (existingPurchase) {
    throw createHttpError(400, 'You have already purchased this website');
  }

  return { website, priceToUse, auctionStartingPrice };
};

const findValidCoupon = async (code, userId) => {
  const normalizedCode = normalizeCouponCode(code);
  if (!normalizedCode) return null;

  const coupon = await Coupon.findOne({ code: normalizedCode });
  if (!coupon) {
    throw createHttpError(400, 'Coupon not found');
  }

  if (!coupon.active) {
    throw createHttpError(400, 'This coupon is not active');
  }

  const now = new Date();
  const reservationExpired = coupon.reservationExpiresAt && coupon.reservationExpiresAt <= now;

  if (reservationExpired) {
    coupon.reservedByPaymentId = null;
    coupon.reservedByUserId = null;
    coupon.reservationExpiresAt = null;
    await coupon.save();
  }

  if (coupon.usageMode === 'single_global') {
    if (coupon.usageCount > 0 || coupon.consumedAt) {
      throw createHttpError(400, 'This coupon has already been used');
    }

    if (
      coupon.reservedByPaymentId &&
      coupon.reservedByUserId &&
      coupon.reservationExpiresAt &&
      coupon.reservationExpiresAt > now &&
      coupon.reservedByUserId.toString() !== userId.toString()
    ) {
      throw createHttpError(409, 'This coupon is temporarily reserved by another checkout');
    }
  }

  return coupon;
};

const reserveSingleGlobalCoupon = async (coupon, paymentId, userId) => {
  if (!coupon || coupon.usageMode !== 'single_global') return null;

  const now = new Date();
  const reservationExpiresAt = new Date(now.getTime() + COUPON_RESERVATION_MS);

  const reservedCoupon = await Coupon.findOneAndUpdate(
    {
      _id: coupon._id,
      active: true,
      usageMode: 'single_global',
      usageCount: 0,
      $or: [
        { reservedByPaymentId: null },
        { reservationExpiresAt: null },
        { reservationExpiresAt: { $lte: now } },
        { reservedByPaymentId: paymentId },
        { reservedByUserId: userId },
      ],
    },
    {
      $set: {
        reservedByPaymentId: paymentId,
        reservedByUserId: userId,
        reservationExpiresAt,
      },
    },
    { new: true }
  );

  if (!reservedCoupon) {
    throw createHttpError(409, 'This coupon is temporarily reserved by another checkout');
  }

  return reservedCoupon;
};

const releaseCouponReservation = async (paymentRecord) => {
  if (!paymentRecord?.couponId) return;

  await Coupon.findOneAndUpdate(
    {
      _id: paymentRecord.couponId,
      usageMode: 'single_global',
      reservedByPaymentId: paymentRecord._id,
      usageCount: 0,
    },
    {
      $set: {
        reservedByPaymentId: null,
        reservedByUserId: null,
        reservationExpiresAt: null,
      },
    }
  );

  await Payment.updateOne(
    { _id: paymentRecord._id },
    { $set: { reservationExpiresAt: null } }
  );
};

const consumeCoupon = async (paymentRecord, purchaseId) => {
  if (!paymentRecord?.couponId) return null;

  const coupon = await Coupon.findById(paymentRecord.couponId);
  if (!coupon) {
    throw createHttpError(400, 'Coupon record not found for this payment');
  }

  if (coupon.usageMode === 'reusable') {
    if (coupon.consumedByPaymentId?.toString() === paymentRecord._id.toString()) {
      return coupon;
    }

    return Coupon.findOneAndUpdate(
      {
        _id: coupon._id,
        active: true,
        $or: [
          { consumedByPaymentId: null },
          { consumedByPaymentId: { $ne: paymentRecord._id } },
        ],
      },
      {
        $inc: { usageCount: 1 },
        $set: {
          consumedAt: new Date(),
          consumedByPaymentId: paymentRecord._id,
          consumedByPurchaseId: purchaseId,
        },
      },
      { new: true }
    );
  }

  if (coupon.consumedByPaymentId?.toString() === paymentRecord._id.toString() && coupon.usageCount > 0) {
    return coupon;
  }

  const consumedCoupon = await Coupon.findOneAndUpdate(
    {
      _id: coupon._id,
      active: true,
      usageMode: 'single_global',
      usageCount: 0,
      $or: [
        { reservedByPaymentId: paymentRecord._id },
        { consumedByPaymentId: paymentRecord._id },
      ],
    },
    {
      $inc: { usageCount: 1 },
      $set: {
        consumedAt: new Date(),
        consumedByPaymentId: paymentRecord._id,
        consumedByPurchaseId: purchaseId,
        reservedByPaymentId: null,
        reservedByUserId: null,
        reservationExpiresAt: null,
      },
    },
    { new: true }
  );

  if (!consumedCoupon) {
    throw createHttpError(409, 'Coupon could not be finalized for this payment');
  }

  return consumedCoupon;
};

const markExclusiveSaleCompleted = async (website, buyerId) => {
  if (website.category !== 'exclusive') return;

  await Auction.findOneAndUpdate(
    { websiteId: website._id, status: 'awaiting_payment' },
    { $set: { status: 'completed' } }
  );

  if (website.status === WEBSITE_STATUS.SOLD) return;

  website.status = WEBSITE_STATUS.SOLD;
  website.soldTo = buyerId;
  website.soldAt = new Date();
  await website.save();
};

const createPendingPayout = async (website, purchase) => {
  const sellerId = website.sellerId ? website.sellerId._id : null;
  if (!sellerId) {
    console.warn('Skipping payout creation: sellerId missing for purchase', purchase._id.toString());
    return null;
  }

  const sellerBankDetails = await BankDetails.findOne({ userId: sellerId });

  const payoutRecord = new Payout({
    sellerId,
    purchaseId: purchase._id,
    websiteId: website._id,
    amount: purchase.sellerPrice,
    bankDetails: sellerBankDetails
      ? {
          accountHolderName: sellerBankDetails.accountHolderName,
          accountNumber: sellerBankDetails.accountNumber,
          ifscCode: sellerBankDetails.ifscCode,
          bankName: sellerBankDetails.bankName,
          upiId: sellerBankDetails.upiId,
        }
      : null,
    status: PAYOUT_STATUS.PENDING,
    isAutomatic: false,
    failureReason: sellerBankDetails ? null : 'Seller has no bank details on file or seller deleted',
  });

  await payoutRecord.save();

  try {
    const sellerEmail = website.sellerId ? website.sellerId.email : 'Unknown/Deleted';
    await emailService.sendAdminAlert({
      subject: `New Payout Pending — ${website.name}`,
      message: 'A new purchase was made. Please process the seller payout manually.',
      details: `Seller: ${sellerEmail}\nWebsite: ${website.name}\nAmount: ₹${purchase.sellerPrice}\nPurchase ID: ${purchase._id}\nPayout ID: ${payoutRecord._id}${!sellerBankDetails ? '\n\n⚠️ WARNING: Seller has no bank details saved!' : ''}`,
    });
  } catch (error) {
    console.error('Admin alert email error:', error);
  }

  return payoutRecord;
};

const sendPurchaseEmails = async (buyerId, website, purchase) => {
  try {
    const buyer = await User.findById(buyerId);
    await emailService.sendPurchaseConfirmation(buyer, website, purchase);
    if (website.sellerId) {
      await emailService.sendSellerNotification(website.sellerId, website, purchase);
    }
  } catch (error) {
    console.error('Confirmation email error:', error);
  }
};

const buildSuccessResponse = async ({ paymentRecord, purchase, website, payoutRecord }) => {
  let resolvedPayout = payoutRecord;

  if (!resolvedPayout) {
    resolvedPayout = await Payout.findOne({ purchaseId: purchase._id }).lean();
  }

  return {
    success: true,
    message: 'Payment verified successfully! The seller will be paid by the admin shortly.',
    data: {
      purchase,
      coupon: getCouponSummary(paymentRecord),
      website: getWebsiteSummary(website),
      payout: {
        status: resolvedPayout?.status || 'pending',
        amount: purchase.sellerPrice,
        message: 'Payout will be processed by admin',
        id: resolvedPayout?._id || null,
      },
      breakdown: getBreakdown(purchase),
    },
  };
};

const finalizePurchaseFromPayment = async ({ paymentRecord, website, orderId = null, paymentId = null, gatewayResponse = null }) => {
  const existingPurchase = paymentRecord.purchaseId
    ? await Purchase.findById(paymentRecord.purchaseId)
    : await Purchase.findOne({
        websiteId: paymentRecord.websiteId,
        buyerId: paymentRecord.buyerId,
      });

  if (existingPurchase) {
    paymentRecord.purchaseId = existingPurchase._id;
    paymentRecord.status = 'succeeded';
    paymentRecord.reservationExpiresAt = null;
    if (orderId) paymentRecord.razorpayOrderId = orderId;
    if (paymentId) paymentRecord.razorpayPaymentId = paymentId;
    if (gatewayResponse) paymentRecord.gatewayResponse = gatewayResponse;
    await paymentRecord.save();

    if (paymentRecord.couponId) {
      try {
        await consumeCoupon(paymentRecord, existingPurchase._id);
      } catch (error) {
        console.error('Coupon finalize warning:', error);
      }
    }

    await markExclusiveSaleCompleted(website, paymentRecord.buyerId);

    return {
      purchase: existingPurchase,
      payoutRecord: await Payout.findOne({ purchaseId: existingPurchase._id }),
    };
  }

  let purchase;
  try {
    purchase = new Purchase(buildPurchaseSnapshot({ paymentRecord, website, orderId, paymentId }));
    await purchase.save();
  } catch (error) {
    if (error?.code === 11000) {
      purchase = await Purchase.findOne({
        websiteId: paymentRecord.websiteId,
        buyerId: paymentRecord.buyerId,
      });
    } else {
      throw error;
    }
  }

  if (!purchase) {
    throw createHttpError(500, 'Could not create purchase record');
  }

  paymentRecord.purchaseId = purchase._id;
  paymentRecord.status = 'succeeded';
  paymentRecord.reservationExpiresAt = null;
  if (orderId) paymentRecord.razorpayOrderId = orderId;
  if (paymentId) paymentRecord.razorpayPaymentId = paymentId;
  if (gatewayResponse) paymentRecord.gatewayResponse = gatewayResponse;
  await paymentRecord.save();

  if (paymentRecord.couponId) {
    try {
      await consumeCoupon(paymentRecord, purchase._id);
    } catch (error) {
      console.error('Coupon finalize warning:', error);
    }
  }

  await markExclusiveSaleCompleted(website, paymentRecord.buyerId);

  let payoutRecord = null;
  try {
    payoutRecord = await createPendingPayout(website, purchase);
  } catch (error) {
    console.error('Payout creation error:', error);
  }

  await sendPurchaseEmails(paymentRecord.buyerId, website, purchase);

  return { purchase, payoutRecord };
};

const quoteOrder = async (req, res) => {
  try {
    const { websiteId, couponCode } = req.body;
    const buyer = req.user;

    const { website, priceToUse, auctionStartingPrice } = await loadPaymentContext(websiteId, buyer);
    const basePricing = calculatePricing(priceToUse, { startingPrice: auctionStartingPrice });
    const coupon = await findValidCoupon(couponCode, buyer._id);
    const pricing = applyCouponToPricing(basePricing, coupon);

    res.json({
      success: true,
      message: 'Checkout quote generated successfully',
      data: {
        mode: pricing.totalPaid === 0 ? 'free_after_coupon' : 'razorpay',
        websiteDetails: getWebsiteSummary(website),
        coupon: getCouponPreview(coupon, pricing.discountAmount),
        breakdown: getBreakdown(pricing),
      },
    });
  } catch (error) {
    console.error('Quote order error:', error);
    res.status(error.status || 500).json({ success: false, message: error.message || 'Error generating checkout quote' });
  }
};

/**
 * @route  POST /api/payment/create-order
 * @desc   Create Razorpay order for paid/exclusive website
 * @access Private (Verified users only)
 */
const createOrder = async (req, res) => {
  let paymentRecord = null;

  try {
    const { websiteId, couponCode } = req.body;
    const buyer = req.user;

    const { website, priceToUse, auctionStartingPrice } = await loadPaymentContext(websiteId, buyer);
    const coupon = await findValidCoupon(couponCode, buyer._id);
    const basePricing = calculatePricing(priceToUse, { startingPrice: auctionStartingPrice });
    const pricing = applyCouponToPricing(basePricing, coupon);

    paymentRecord = new Payment(
      buildPaymentSnapshot({
        websiteId,
        buyerId: buyer._id,
        pricing,
        coupon,
        paymentMethod: pricing.totalPaid === 0 ? 'coupon' : 'razorpay',
        status: pricing.totalPaid === 0 ? 'succeeded' : 'created',
      })
    );
    await paymentRecord.save();

    let reservedCoupon = coupon;
    if (coupon?.usageMode === 'single_global') {
      reservedCoupon = await reserveSingleGlobalCoupon(coupon, paymentRecord._id, buyer._id);
      paymentRecord.reservationExpiresAt = reservedCoupon.reservationExpiresAt;
      await paymentRecord.save();
    }

    if (pricing.totalPaid === 0) {
      const { purchase, payoutRecord } = await finalizePurchaseFromPayment({ paymentRecord, website });

      return res.status(201).json({
        success: true,
        message: 'Order created successfully',
        data: {
          mode: 'free_after_coupon',
          purchase,
          coupon: getCouponPreview(reservedCoupon, pricing.discountAmount),
          websiteDetails: getWebsiteSummary(website),
          payout: {
            status: payoutRecord?.status || 'pending',
            amount: purchase.sellerPrice,
            message: 'Payout will be processed by admin',
            id: payoutRecord?._id || null,
          },
          breakdown: getBreakdown(purchase),
        },
      });
    }

    const receiptId = `rcpt_${Date.now()}_${websiteId.toString().slice(-6)}`;

    try {
      const rzpOrder = await razorpayService.createOrder(receiptId, pricing.totalPaid, 'INR');
      paymentRecord.razorpayOrderId = rzpOrder.id;
      paymentRecord.amount = pricing.totalPaid;
      await paymentRecord.save();

      return res.status(201).json({
        success: true,
        message: 'Order created successfully',
        data: {
          mode: 'razorpay',
          razorpayOrderId: rzpOrder.id,
          razorpayKeyId: process.env.RAZORPAY_KEY_ID,
          amount: pricing.totalPaid,
          amountInPaise: rzpOrder.amount,
          currency: 'INR',
          coupon: getCouponPreview(reservedCoupon, pricing.discountAmount),
          breakdown: getBreakdown(pricing),
          websiteDetails: getWebsiteSummary(website),
          prefill: {
            name: buyer.name,
            email: buyer.email,
            contact: buyer.phone || '',
          },
        },
      });
    } catch (error) {
      paymentRecord.status = 'failed';
      paymentRecord.failureReason = error.message;
      await paymentRecord.save();
      await releaseCouponReservation(paymentRecord);
      throw error;
    }
  } catch (error) {
    console.error('Create order error:', error);
    res.status(error.status || 500).json({ success: false, message: error.message || 'Error creating order', error: error.message });
  }
};

/**
 * @route  POST /api/payment/verify
 * @desc   Verify Razorpay payment signature after checkout.
 *         Creates a PENDING payout record — admin will pay seller manually.
 * @access Private
 */
const verifyPayment = async (req, res) => {
  let paymentRecord = null;

  try {
    const {
      razorpayOrderId, razorpayPaymentId, razorpaySignature,
      razorpay_order_id, razorpay_payment_id, razorpay_signature,
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

    const isValid = razorpayService.verifyPaymentSignature(orderId, paymentId, signature);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature — possible tampering detected' });
    }

    paymentRecord = await Payment.findOne({ razorpayOrderId: orderId });
    if (!paymentRecord) {
      return res.status(404).json({ success: false, message: 'Payment record not found' });
    }

    const website = await Website.findById(paymentRecord.websiteId).populate('sellerId');
    if (!website) {
      return res.status(404).json({ success: false, message: 'Website not found' });
    }

    if (paymentRecord.status === 'succeeded') {
      const existingPurchase = paymentRecord.purchaseId
        ? await Purchase.findById(paymentRecord.purchaseId)
        : await Purchase.findOne({
            websiteId: paymentRecord.websiteId,
            buyerId: paymentRecord.buyerId,
          });

      if (existingPurchase) {
        const response = await buildSuccessResponse({
          paymentRecord,
          purchase: existingPurchase,
          website,
        });
        return res.json(response);
      }
    }

    let rzpPayment;
    try {
      if (process.env.NODE_ENV === 'development') {
        console.log('verifyPayment request body:', { orderId, paymentId, signature, websiteId: req.body.websiteId });
      }

      rzpPayment = await razorpayService.fetchPayment(paymentId);
    } catch (error) {
      console.error('Razorpay fetchPayment error:', error);
      return res.status(502).json({ success: false, message: 'Payment provider error. Please try again later.' });
    }

    if (rzpPayment.status !== 'captured' && rzpPayment.status !== 'authorized') {
      paymentRecord.status = 'failed';
      paymentRecord.failureReason = `Razorpay status: ${rzpPayment.status}`;
      paymentRecord.gatewayResponse = rzpPayment;
      await paymentRecord.save();
      await releaseCouponReservation(paymentRecord);

      return res.status(400).json({
        success: false,
        message: `Payment not successful. Razorpay status: ${rzpPayment.status}`,
      });
    }

    paymentRecord.status = 'succeeded';
    paymentRecord.razorpayPaymentId = paymentId;
    paymentRecord.razorpaySignature = signature;
    paymentRecord.gatewayResponse = rzpPayment;
    await paymentRecord.save();

    const { purchase, payoutRecord } = await finalizePurchaseFromPayment({
      paymentRecord,
      website,
      orderId,
      paymentId,
      gatewayResponse: rzpPayment,
    });

    const response = await buildSuccessResponse({
      paymentRecord,
      purchase,
      website,
      payoutRecord,
    });

    res.json(response);
  } catch (error) {
    console.error('Verify payment error:', error);

    if (paymentRecord && !paymentRecord.purchaseId) {
      try {
        await releaseCouponReservation(paymentRecord);
      } catch (releaseError) {
        console.error('Coupon release error after verify failure:', releaseError);
      }
    }

    res.status(error.status || 500).json({ success: false, message: error.message || 'Error verifying payment', error: error.message });
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
      if (!isValid) {
        return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
      }
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
          const paymentRecord = await Payment.findOneAndUpdate(
            { razorpayOrderId: orderId },
            {
              status: 'failed',
              failureReason: payment?.error_description,
              failureCode: payment?.error_code,
              gatewayResponse: payment,
            },
            { new: true }
          );

          if (paymentRecord) {
            await releaseCouponReservation(paymentRecord);
          }

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

module.exports = { quoteOrder, createOrder, verifyPayment, handleWebhook };
