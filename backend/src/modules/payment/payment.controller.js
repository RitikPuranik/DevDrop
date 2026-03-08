const Website  = require('../website/website.model');
const Purchase = require('./purchase.model');
const Payment  = require('./payment.model');
const Payout   = require('../payout/payout.model');
const User     = require('../user/user.model');
const BankDetails = require('../user/bankDetails.model');
const cashfreeService = require('../../services/cashfree.service');
const { calculatePricing } = require('../../shared/utils/helpers');
const { WEBSITE_STATUS, PAYMENT_STATUS, PAYOUT_STATUS } = require('../../shared/utils/constants');
const emailService = require('../../services/email.service');

/**
 * @route  POST /api/payment/create-order
 * @desc   Create Cashfree order for paid/exclusive website
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

    // Cashfree order ID must be unique — use timestamp + websiteId suffix
    const orderId = `order_${Date.now()}_${websiteId.toString().slice(-6)}`;

    const returnUrl = `${process.env.FRONTEND_URL}/payment/callback?order_id={order_id}`;
    const notifyUrl = `${process.env.BACKEND_URL || process.env.FRONTEND_URL}/api/payment/webhook`;

    const cfOrder = await cashfreeService.createOrder(
      orderId,
      pricing.totalPaid,
      'INR',
      {
        id: buyer._id.toString(),
        email: buyer.email,
        phone: buyer.phone || '9999999999',
        name: buyer.name,
      },
      returnUrl,
      notifyUrl
    );

    // Save payment record
    const payment = new Payment({
      websiteId,
      buyerId: buyer._id,
      cashfreeOrderId: orderId,
      cashfreeSessionId: cfOrder.payment_session_id,
      amount: pricing.totalPaid,
      currency: 'INR',
      status: 'created',
      paymentMethod: 'cashfree',
    });
    await payment.save();

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: {
        orderId,
        paymentSessionId: cfOrder.payment_session_id, // used by Cashfree JS SDK on frontend
        amount: pricing.totalPaid,
        currency: 'INR',
        breakdown: pricing,
        websiteDetails: { id: website._id, name: website.name, category: website.category },
      },
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ success: false, message: 'Error creating order', error: error.message });
  }
};

/**
 * @route  POST /api/payment/verify
 * @desc   Verify payment after frontend redirect + auto pay seller
 * @access Private
 */
const verifyPayment = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ success: false, message: 'orderId is required' });

    // Fetch order status from Cashfree
    const cfOrder = await cashfreeService.fetchOrder(orderId);

    if (cfOrder.order_status !== 'PAID') {
      return res.status(400).json({
        success: false,
        message: `Payment not completed. Status: ${cfOrder.order_status}`,
      });
    }

    // Get payment record
    const paymentRecord = await Payment.findOne({ cashfreeOrderId: orderId });
    if (!paymentRecord) return res.status(404).json({ success: false, message: 'Payment record not found' });
    if (paymentRecord.status === 'succeeded') return res.status(400).json({ success: false, message: 'Payment already processed' });

    // Get payment details from Cashfree
    const payments = await cashfreeService.fetchPaymentsByOrderId(orderId);
    const successPayment = payments.find(p => p.payment_status === 'SUCCESS');

    const website = await Website.findById(paymentRecord.websiteId).populate('sellerId');
    if (!website) return res.status(404).json({ success: false, message: 'Website not found' });

    const pricing = calculatePricing(website.price);

    // Update payment record
    paymentRecord.status = 'succeeded';
    paymentRecord.cashfreePaymentId = successPayment?.cf_payment_id?.toString();
    paymentRecord.gatewayResponse = successPayment;
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
      cashfreeOrderId: orderId,
      cashfreePaymentId: successPayment?.cf_payment_id?.toString(),
      paymentStatus: PAYMENT_STATUS.COMPLETED,
      purchaseDate: new Date(),
    });
    await purchase.save();

    paymentRecord.purchaseId = purchase._id;
    await paymentRecord.save();

    // ==================== AUTO PAYOUT TO SELLER ====================
    const sellerBankDetails = await BankDetails.findOne({ userId: website.sellerId._id });
    let payoutStatus  = 'pending';
    let payoutMessage = '';
    let payoutUtr     = null;
    let payoutId      = null;

    if (!sellerBankDetails) {
      // No bank details — create pending payout, alert admin
      const payoutRecord = new Payout({
        sellerId: website.sellerId._id, purchaseId: purchase._id, websiteId: website._id,
        amount: pricing.sellerPrice, status: PAYOUT_STATUS.PENDING,
        failureReason: 'No bank details provided', isAutomatic: false,
      });
      await payoutRecord.save();
      payoutId = payoutRecord._id;
      payoutMessage = 'Seller bank details missing — admin will handle';

      await emailService.sendAdminAlert({
        subject: 'Seller Missing Bank Details',
        message: `Seller ${website.sellerId.email} has no bank details.`,
        details: `Website: ${website.name}\nAmount: ₹${pricing.sellerPrice}\nPurchase ID: ${purchase._id}`,
      });

    } else {
      try {
        // Cashfree beneficiary ID — create once per seller, reuse forever
        let beneficiaryId = sellerBankDetails.cashfreeBeneficiaryId;

        if (!beneficiaryId) {
          beneficiaryId = `bene_${website.sellerId._id.toString()}`;

          // Check if already exists on Cashfree side (handles server restart edge case)
          const existing = await cashfreeService.getBeneficiary(beneficiaryId);

          if (!existing) {
            await cashfreeService.addBeneficiary({
              beneficiaryId,
              name:  sellerBankDetails.accountHolderName,
              email: website.sellerId.email,
              phone: website.sellerId.phone || '9999999999',
              bankAccount: sellerBankDetails.accountNumber,
              ifsc: sellerBankDetails.ifscCode,
              upiId: sellerBankDetails.defaultPayoutMode === 'upi' ? sellerBankDetails.upiId : null,
            });
          }

          sellerBankDetails.cashfreeBeneficiaryId = beneficiaryId;
          sellerBankDetails.cashfreeStatus = 'active';
          await sellerBankDetails.save();
          console.log(`✅ Cashfree beneficiary created: ${beneficiaryId}`);
        }

        // Unique transfer ID per purchase
        const transferId = `txn_${purchase._id.toString()}`;

        const payoutRecord = new Payout({
          sellerId: website.sellerId._id, purchaseId: purchase._id, websiteId: website._id,
          amount: pricing.sellerPrice,
          bankDetails: {
            accountHolderName: sellerBankDetails.accountHolderName,
            accountNumber: sellerBankDetails.accountNumber,
            ifscCode: sellerBankDetails.ifscCode,
            bankName: sellerBankDetails.bankName,
            upiId: sellerBankDetails.upiId,
          },
          status: 'processing',
          cashfreeTransferId: transferId,
          isAutomatic: true,
        });
        await payoutRecord.save();
        payoutId = payoutRecord._id;

        // 💰 Send money to seller
        const transfer = await cashfreeService.createPayout({
          transferId,
          beneficiaryId,
          amount: pricing.sellerPrice,
          remarks: `Payment for ${website.name}`,
          mode: sellerBankDetails.defaultPayoutMode === 'upi' ? 'upi' : 'banktransfer',
        });

        console.log(`✅ Cashfree payout initiated: ${transferId}`);

        payoutRecord.cashfreeReferenceId = transfer?.data?.referenceId;
        payoutRecord.status = PAYOUT_STATUS.COMPLETED;
        payoutRecord.utr = transfer?.data?.utr || `CF_${Date.now()}`;
        payoutRecord.transactionDate = new Date();
        payoutRecord.processedAt = new Date();
        await payoutRecord.save();

        payoutUtr = payoutRecord.utr;
        payoutStatus = 'completed';
        payoutMessage = `Payment sent! UTR: ${payoutRecord.utr}`;

        await emailService.sendPayoutNotification(website.sellerId, {
          amount: pricing.sellerPrice, utr: payoutRecord.utr,
          status: 'completed', bankName: sellerBankDetails.bankName,
          websiteName: website.name,
        });

      } catch (payoutError) {
        console.error('❌ Payout failed:', payoutError);

        await Payout.findOneAndUpdate(
          { purchaseId: purchase._id },
          { status: PAYOUT_STATUS.FAILED, failureReason: payoutError.message },
          { upsert: true }
        );

        payoutStatus  = 'failed';
        payoutMessage = 'Auto payout failed — admin will process manually';

        await emailService.sendAdminAlert({
          subject: '🚨 URGENT: Automatic Payout Failed',
          message: `Failed to pay seller ${website.sellerId.email} ₹${pricing.sellerPrice}`,
          details: `Seller: ${website.sellerId.email}\nWebsite: ${website.name}\nAmount: ₹${pricing.sellerPrice}\nError: ${payoutError.message}\n\nAction Required: Process manually in admin dashboard.`,
        });
      }
    }
    // ==================== END PAYOUT ====================

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
    } catch (e) { console.error('Email error:', e); }

    res.json({
      success: true,
      message: payoutStatus === 'completed'
        ? 'Payment verified! Seller paid automatically. 💰'
        : payoutStatus === 'failed'
          ? 'Payment verified. Payout failed — admin will handle.'
          : 'Payment verified. Seller payout is pending.',
      data: {
        purchase,
        website: { id: website._id, name: website.name, category: website.category },
        payout:  { status: payoutStatus, amount: pricing.sellerPrice, message: payoutMessage, id: payoutId, utr: payoutUtr },
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
 * @desc   Handle Cashfree webhooks
 * @access Public
 */
const handleWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];

    if (signature && timestamp) {
      const rawBody = Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body);
      const isValid = cashfreeService.verifyWebhookSignature(rawBody, signature, timestamp);
      if (!isValid) return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }

    const event = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body;
    const eventType = event?.type;
    console.log('✅ Cashfree webhook received:', eventType);

    switch (eventType) {
      case 'PAYMENT_SUCCESS_WEBHOOK': {
        const data = event.data;
        const orderId = data?.order?.order_id;
        if (orderId) {
          await Payment.findOneAndUpdate(
            { cashfreeOrderId: orderId },
            { status: 'succeeded', cashfreePaymentId: data?.payment?.cf_payment_id?.toString(), gatewayResponse: data }
          );
          console.log(`💰 Payment succeeded for order: ${orderId}`);
        }
        break;
      }
      case 'PAYMENT_FAILED_WEBHOOK': {
        const data = event.data;
        const orderId = data?.order?.order_id;
        if (orderId) {
          await Payment.findOneAndUpdate(
            { cashfreeOrderId: orderId },
            { status: 'failed', failureReason: data?.payment?.payment_message, gatewayResponse: data }
          );
          console.log(`❌ Payment failed for order: ${orderId}`);
        }
        break;
      }
      case 'REFUND_STATUS_WEBHOOK': {
        const data = event.data;
        const orderId = data?.order?.order_id;
        if (orderId) {
          await Payment.findOneAndUpdate(
            { cashfreeOrderId: orderId },
            { status: 'refunded', refundId: data?.refund?.refund_id, refundAmount: data?.refund?.refund_amount, refundedAt: new Date() }
          );
          await Purchase.findOneAndUpdate({ cashfreeOrderId: orderId }, { paymentStatus: 'refunded' });
        }
        break;
      }
      default:
        console.log(`ℹ️  Unhandled webhook type: ${eventType}`);
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
    const { orderId, amount, reason } = req.body;

    const paymentRecord = await Payment.findOne({ cashfreeOrderId: orderId });
    if (!paymentRecord) return res.status(404).json({ success: false, message: 'Payment not found' });
    if (paymentRecord.status !== 'succeeded') return res.status(400).json({ success: false, message: 'Can only refund succeeded payments' });

    const refundId = `refund_${Date.now()}`;
    const refund = await cashfreeService.createRefund(orderId, refundId, amount || paymentRecord.amount, reason);

    paymentRecord.status = 'refunded';
    paymentRecord.refundId = refundId;
    paymentRecord.refundAmount = amount || paymentRecord.amount;
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
