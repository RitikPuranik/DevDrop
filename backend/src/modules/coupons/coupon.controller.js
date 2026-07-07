const Coupon = require('./coupon.model');

const serializeCoupon = (couponDoc) => {
  const coupon = couponDoc.toObject ? couponDoc.toObject() : couponDoc;
  const now = Date.now();
  const reservationExpiresAt = coupon.reservationExpiresAt ? new Date(coupon.reservationExpiresAt).getTime() : null;

  return {
    ...coupon,
    isReserved:
      coupon.usageMode === 'single_global' &&
      coupon.usageCount === 0 &&
      !!coupon.reservedByPaymentId &&
      !!reservationExpiresAt &&
      reservationExpiresAt > now,
    isExhausted: coupon.usageMode === 'single_global' && coupon.usageCount > 0,
  };
};

const createCoupon = async (req, res) => {
  try {
    const code = String(req.body.code || '').trim().toUpperCase();
    const { usageMode, discountType, discountValue } = req.body;
    const normalizedDiscountValue = Number(discountValue);

    if (!code) {
      return res.status(400).json({ success: false, message: 'Coupon code is required' });
    }

    if (!['single_global', 'reusable'].includes(usageMode)) {
      return res.status(400).json({ success: false, message: 'Invalid coupon usage mode' });
    }

    if (!['percent', 'flat'].includes(discountType)) {
      return res.status(400).json({ success: false, message: 'Invalid coupon discount type' });
    }

    if (!Number.isFinite(normalizedDiscountValue)) {
      return res.status(400).json({ success: false, message: 'Discount value must be a valid number' });
    }

    if (discountType === 'percent' && (normalizedDiscountValue < 1 || normalizedDiscountValue > 100)) {
      return res.status(400).json({ success: false, message: 'Percent discount must be between 1 and 100' });
    }

    if (discountType === 'flat' && normalizedDiscountValue <= 0) {
      return res.status(400).json({ success: false, message: 'Flat discount must be greater than 0' });
    }

    const existingCoupon = await Coupon.findOne({ code });
    if (existingCoupon) {
      return res.status(409).json({ success: false, message: 'Coupon code already exists' });
    }

    const coupon = await Coupon.create({
      code,
      usageMode,
      discountType,
      discountValue: normalizedDiscountValue,
      active: req.body.active !== undefined ? Boolean(req.body.active) : true,
    });

    res.status(201).json({
      success: true,
      message: 'Coupon created successfully',
      data: serializeCoupon(coupon),
    });
  } catch (error) {
    console.error('Create coupon error:', error);
    res.status(500).json({ success: false, message: 'Error creating coupon', error: error.message });
  }
};

const getCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find({})
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: coupons.map(serializeCoupon),
    });
  } catch (error) {
    console.error('Get coupons error:', error);
    res.status(500).json({ success: false, message: 'Error fetching coupons', error: error.message });
  }
};

const toggleCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon not found' });
    }

    if (typeof req.body.active === 'boolean') {
      coupon.active = req.body.active;
    } else {
      coupon.active = !coupon.active;
    }

    await coupon.save();

    res.json({
      success: true,
      message: `Coupon ${coupon.active ? 'enabled' : 'disabled'} successfully`,
      data: serializeCoupon(coupon),
    });
  } catch (error) {
    console.error('Toggle coupon error:', error);
    res.status(500).json({ success: false, message: 'Error updating coupon', error: error.message });
  }
};

module.exports = {
  createCoupon,
  getCoupons,
  toggleCoupon,
};
