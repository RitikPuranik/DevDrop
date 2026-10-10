const {
  calculatePricing,
  applyCouponToPricing,
  formatFileSize,
  sanitizeInput,
  getPaginationMetadata,
  checkOwnership,
  hashToken,
  isExpired,
  generateUpiPayoutLink,
  isValidFileType,
  getFileExtension,
} = require('../../../src/shared/utils/helpers');

describe('calculatePricing', () => {
  it('computes fee/tax/total for a plain paid listing (no starting price)', () => {
    const result = calculatePricing(1000);
    // subtotal = 1000 + 500 = 1500; tax = 18% of 1500 = 270; total = 1770
    expect(result.platformFee).toBe(500);
    expect(result.tax).toBe(270);
    expect(result.totalPaid).toBe(1770);
    expect(result.sellerPrice).toBe(1000);
    expect(result.premium).toBe(0);
    expect(result.platformCommission).toBe(0);
  });

  it('splits the premium for an exclusive/auction sale above the starting price', () => {
    // finalPrice 5000, startingPrice 3000 -> premium 2000, 20% commission = 400
    const result = calculatePricing(5000, { startingPrice: 3000 });
    expect(result.premium).toBe(2000);
    expect(result.platformCommission).toBe(400);
    // seller keeps starting price (3000) + 80% of premium (1600) = 4600
    expect(result.sellerPrice).toBe(4600);
    // buyer-side charges are unaffected by the exclusive split
    expect(result.platformFee).toBe(500);
    expect(result.totalPaid).toBe(Math.round((5000 + 500) * 1.18));
  });

  it('gives the seller 100% when the final bid equals the starting price (no premium)', () => {
    const result = calculatePricing(3000, { startingPrice: 3000 });
    expect(result.premium).toBe(0);
    expect(result.platformCommission).toBe(0);
    expect(result.sellerPrice).toBe(3000);
  });

  it('treats a missing/undefined startingPrice as a plain sale', () => {
    const result = calculatePricing(2000);
    expect(result.startingPrice).toBeUndefined();
    expect(result.sellerPrice).toBe(2000);
  });

  it('handles a zero-price (free-turned-paid edge case) sale without going negative', () => {
    const result = calculatePricing(0);
    expect(result.sellerPrice).toBe(0);
    expect(result.totalPaid).toBeGreaterThan(0); // platform fee + tax still apply
  });
});

describe('applyCouponToPricing', () => {
  const base = calculatePricing(1000); // platformFee 500, sellerPrice 1000

  it('returns unchanged totals when no coupon is supplied', () => {
    const result = applyCouponToPricing(base, null);
    expect(result.discountAmount).toBe(0);
    expect(result.totalPaid).toBe(base.totalPaid);
  });

  it('applies a percent discount and recalculates tax on the discounted subtotal', () => {
    const coupon = { discountType: 'percent', discountValue: 10 };
    const result = applyCouponToPricing(base, coupon);
    // subtotalBeforeDiscount = sellerPrice(1000) + commission(0) + fee(500) = 1500
    expect(result.subtotalBeforeDiscount).toBe(1500);
    expect(result.discountAmount).toBe(150); // 10% of 1500
    expect(result.subtotalAfterDiscount).toBe(1350);
    expect(result.tax).toBe(Math.round(1350 * 0.18));
    expect(result.totalPaid).toBe(1350 + Math.round(1350 * 0.18));
  });

  it('applies a flat discount', () => {
    const coupon = { discountType: 'flat', discountValue: 200 };
    const result = applyCouponToPricing(base, coupon);
    expect(result.discountAmount).toBe(200);
    expect(result.subtotalAfterDiscount).toBe(1300);
  });

  it('never discounts below zero even if the coupon value exceeds the subtotal', () => {
    const coupon = { discountType: 'flat', discountValue: 999999 };
    const result = applyCouponToPricing(base, coupon);
    expect(result.discountAmount).toBe(1500); // capped at subtotalBeforeDiscount
    expect(result.subtotalAfterDiscount).toBe(0);
    expect(result.totalPaid).toBe(0);
  });

  it('never produces a negative discount for a negative coupon value', () => {
    const coupon = { discountType: 'flat', discountValue: -50 };
    const result = applyCouponToPricing(base, coupon);
    expect(result.discountAmount).toBe(0);
  });
});

describe('formatFileSize', () => {
  it.each([
    [0, '0 Bytes'],
    [500, '500 Bytes'],
    [1024, '1 KB'],
    [1024 * 1024, '1 MB'],
    [1024 * 1024 * 1024, '1 GB'],
  ])('formats %i bytes as %s', (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });
});

describe('sanitizeInput', () => {
  it('strips angle brackets to reduce XSS surface', () => {
    expect(sanitizeInput('<script>alert(1)</script>')).toBe('scriptalert(1)/script');
  });

  it('trims whitespace', () => {
    expect(sanitizeInput('  hello  ')).toBe('hello');
  });

  it('passes through non-string input unchanged', () => {
    expect(sanitizeInput(42)).toBe(42);
    expect(sanitizeInput(null)).toBe(null);
  });
});

describe('getPaginationMetadata', () => {
  it('computes total pages and next/prev flags', () => {
    const meta = getPaginationMetadata(1, 10, 25);
    expect(meta).toEqual({
      currentPage: 1,
      totalPages: 3,
      totalItems: 25,
      itemsPerPage: 10,
      hasNextPage: true,
      hasPrevPage: false,
    });
  });

  it('reports no next page on the last page', () => {
    const meta = getPaginationMetadata(3, 10, 25);
    expect(meta.hasNextPage).toBe(false);
    expect(meta.hasPrevPage).toBe(true);
  });

  it('handles zero total items', () => {
    const meta = getPaginationMetadata(1, 10, 0);
    expect(meta.totalPages).toBe(0);
    expect(meta.hasNextPage).toBe(false);
  });
});

describe('checkOwnership', () => {
  it('returns true for matching ids regardless of type (ObjectId-like vs string)', () => {
    const ownerId = { toString: () => 'abc123' };
    expect(checkOwnership('abc123', ownerId)).toBe(true);
  });

  it('returns false for mismatched ids', () => {
    expect(checkOwnership('abc123', 'xyz999')).toBe(false);
  });
});

describe('hashToken', () => {
  it('is deterministic for the same input', () => {
    expect(hashToken('my-token')).toBe(hashToken('my-token'));
  });

  it('produces different hashes for different inputs', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});

describe('isExpired', () => {
  it('returns true for a past date', () => {
    expect(isExpired(new Date(Date.now() - 1000))).toBe(true);
  });

  it('returns false for a future date', () => {
    expect(isExpired(new Date(Date.now() + 100000))).toBe(false);
  });
});

describe('generateUpiPayoutLink', () => {
  it('builds a valid upi:// link for a well-formed request', () => {
    const link = generateUpiPayoutLink({ upiId: 'seller@okhdfcbank', payeeName: 'Jane', amount: 499.5, note: 'Payout' });
    expect(link).toMatch(/^upi:\/\/pay\?/);
    expect(link).toContain('pa=seller%40okhdfcbank');
    expect(link).toContain('am=499.50');
  });

  it('returns null when upiId is missing or malformed', () => {
    expect(generateUpiPayoutLink({ upiId: '', amount: 100 })).toBeNull();
    expect(generateUpiPayoutLink({ upiId: 'not-a-vpa', amount: 100 })).toBeNull();
  });

  it('returns null when amount is missing, zero, or negative', () => {
    expect(generateUpiPayoutLink({ upiId: 'a@bank', amount: 0 })).toBeNull();
    expect(generateUpiPayoutLink({ upiId: 'a@bank', amount: -5 })).toBeNull();
    expect(generateUpiPayoutLink({ upiId: 'a@bank' })).toBeNull();
  });

  it('truncates an overly long note to 50 characters', () => {
    const longNote = 'x'.repeat(100);
    const link = generateUpiPayoutLink({ upiId: 'a@bank', amount: 10, note: longNote });
    const tnParam = decodeURIComponent(link.split('tn=')[1]);
    expect(tnParam.length).toBe(50);
  });
});

describe('file helpers', () => {
  it('getFileExtension is case-insensitive', () => {
    expect(getFileExtension('Report.PDF')).toBe('.pdf');
  });

  it('isValidFileType checks against an allow-list', () => {
    expect(isValidFileType('archive.zip', ['.zip', '.rar'])).toBe(true);
    expect(isValidFileType('archive.exe', ['.zip', '.rar'])).toBe(false);
  });
});
