const crypto = require('crypto');

describe('razorpay.service signature verification', () => {
  const KEY_SECRET = 'test_key_secret';
  const WEBHOOK_SECRET = 'test_webhook_secret';
  let razorpayService;

  beforeEach(() => {
    jest.resetModules();
    process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    razorpayService = require('../../../src/services/razorpay.service');
  });

  describe('verifyPaymentSignature', () => {
    const sign = (orderId, paymentId, secret = KEY_SECRET) =>
      crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');

    it('accepts a correctly-signed order/payment pair', () => {
      const signature = sign('order_123', 'pay_456');
      expect(razorpayService.verifyPaymentSignature('order_123', 'pay_456', signature)).toBe(true);
    });

    it('rejects a signature computed with the wrong secret', () => {
      const signature = sign('order_123', 'pay_456', 'wrong_secret');
      expect(razorpayService.verifyPaymentSignature('order_123', 'pay_456', signature)).toBe(false);
    });

    it('rejects a signature if the orderId is swapped for a different one (tampering)', () => {
      const signature = sign('order_123', 'pay_456');
      expect(razorpayService.verifyPaymentSignature('order_999', 'pay_456', signature)).toBe(false);
    });

    it('rejects a signature if the paymentId is swapped for a different one (tampering)', () => {
      const signature = sign('order_123', 'pay_456');
      expect(razorpayService.verifyPaymentSignature('order_123', 'pay_999', signature)).toBe(false);
    });

    it('rejects a garbage/empty signature', () => {
      expect(razorpayService.verifyPaymentSignature('order_123', 'pay_456', '')).toBe(false);
      expect(razorpayService.verifyPaymentSignature('order_123', 'pay_456', 'not-a-hex-signature')).toBe(false);
    });
  });

  describe('verifyWebhookSignature', () => {
    const signBody = (body, secret = WEBHOOK_SECRET) =>
      crypto.createHmac('sha256', secret).update(body).digest('hex');

    it('accepts a correctly-signed raw webhook body', () => {
      const rawBody = JSON.stringify({ event: 'payment.captured', payload: {} });
      const signature = signBody(rawBody);
      expect(razorpayService.verifyWebhookSignature(rawBody, signature)).toBe(true);
    });

    it('rejects a webhook body that was modified after signing (tampering)', () => {
      const original = JSON.stringify({ event: 'payment.captured', amount: 100 });
      const signature = signBody(original);
      const tampered = JSON.stringify({ event: 'payment.captured', amount: 999999 });
      expect(razorpayService.verifyWebhookSignature(tampered, signature)).toBe(false);
    });

    it('rejects a signature produced with a different webhook secret', () => {
      const rawBody = JSON.stringify({ event: 'payment.failed' });
      const signature = signBody(rawBody, 'someone_elses_secret');
      expect(razorpayService.verifyWebhookSignature(rawBody, signature)).toBe(false);
    });
  });

  describe('createOrder amount conversion', () => {
    it('converts rupees to paise (x100) when building the Razorpay order request', async () => {
      const createMock = jest.fn().mockResolvedValue({ id: 'order_abc', amount: 150000 });
      jest.doMock('razorpay', () => jest.fn().mockImplementation(() => ({ orders: { create: createMock } })));
      process.env.RAZORPAY_KEY_ID = 'rzp_test_id';
      process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
      jest.resetModules();
      const freshService = require('../../../src/services/razorpay.service');

      await freshService.createOrder('receipt-1', 1500);
      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ amount: 150000, currency: 'INR', receipt: 'receipt-1' }));
    });

    it('caps the order amount at the Razorpay test-mode ceiling outside production', async () => {
      const createMock = jest.fn().mockResolvedValue({ id: 'order_abc' });
      jest.doMock('razorpay', () => jest.fn().mockImplementation(() => ({ orders: { create: createMock } })));
      process.env.RAZORPAY_KEY_ID = 'rzp_test_id';
      process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
      process.env.NODE_ENV = 'test';
      jest.resetModules();
      const freshService = require('../../../src/services/razorpay.service');

      await freshService.createOrder('receipt-2', 10_000_000); // way above the 500,000 INR test cap
      expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ amount: 50000000 }));
    });

    it('throws a clear error when Razorpay keys are not configured', async () => {
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.RAZORPAY_KEY_SECRET;
      jest.resetModules();
      const freshService = require('../../../src/services/razorpay.service');
      // createOrder logs this expected failure via console.error before
      // re-throwing — suppress only for this test, restore immediately after.
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      try {
        await expect(freshService.createOrder('receipt-3', 100)).rejects.toThrow(/Razorpay keys not configured/);
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });
  });
});
