jest.mock('../../../src/shared/config/email', () => ({ sendTransacEmail: jest.fn() }));

const apiInstance = require('../../../src/shared/config/email');
const emailService = require('../../../src/services/email.service');

describe('email.service', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, FRONTEND_URL: 'https://devdrop.example.com', EMAIL_FROM: 'hello@devdrop.com' };
    apiInstance.sendTransacEmail.mockReset();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('sendVerificationEmail', () => {
    it('generates a token, saves the user, sends the email, and returns true', async () => {
      apiInstance.sendTransacEmail.mockResolvedValue({ messageId: 'm1' });
      const user = {
        email: 'buyer@example.com',
        name: 'Buyer',
        generateVerificationToken: jest.fn().mockReturnValue('tok123'),
        save: jest.fn().mockResolvedValue(true),
      };

      const result = await emailService.sendVerificationEmail(user);

      expect(user.save).toHaveBeenCalled();
      expect(apiInstance.sendTransacEmail).toHaveBeenCalled();
      const sentEmail = apiInstance.sendTransacEmail.mock.calls[0][0];
      expect(sentEmail.to).toEqual([{ email: 'buyer@example.com' }]);
      expect(sentEmail.htmlContent).toContain('tok123');
      expect(result).toBe(true);
    });

    it('propagates the error when the send fails (verification is not best-effort)', async () => {
      apiInstance.sendTransacEmail.mockRejectedValue(new Error('brevo down'));
      const user = {
        email: 'buyer@example.com',
        generateVerificationToken: jest.fn().mockReturnValue('tok'),
        save: jest.fn().mockResolvedValue(true),
      };

      await expect(emailService.sendVerificationEmail(user)).rejects.toThrow('brevo down');
    });
  });

  describe('sendWelcomeEmail', () => {
    it('sends the welcome email', async () => {
      apiInstance.sendTransacEmail.mockResolvedValue({});
      await emailService.sendWelcomeEmail({ email: 'a@example.com', name: 'Ann' });

      expect(apiInstance.sendTransacEmail).toHaveBeenCalled();
    });

    it('swallows send failures instead of throwing (best-effort)', async () => {
      apiInstance.sendTransacEmail.mockRejectedValue(new Error('down'));
      await expect(emailService.sendWelcomeEmail({ email: 'a@example.com' })).resolves.toBeUndefined();
    });
  });

  describe('sendPurchaseConfirmation', () => {
    it('includes the amount paid only when greater than zero', async () => {
      apiInstance.sendTransacEmail.mockResolvedValue({});
      await emailService.sendPurchaseConfirmation(
        { email: 'buyer@example.com', name: 'Buyer' },
        { name: 'Cool App', category: 'paid' },
        { totalPaid: 500 }
      );

      const html = apiInstance.sendTransacEmail.mock.calls[0][0].htmlContent;
      expect(html).toContain('Amount Paid');
      expect(html).toContain('500');
    });

    it('omits the amount-paid line for a free website', async () => {
      apiInstance.sendTransacEmail.mockResolvedValue({});
      await emailService.sendPurchaseConfirmation(
        { email: 'buyer@example.com' },
        { name: 'Free App', category: 'free' },
        { totalPaid: 0 }
      );

      const html = apiInstance.sendTransacEmail.mock.calls[0][0].htmlContent;
      expect(html).not.toContain('Amount Paid');
    });

    it('is best-effort and does not throw on failure', async () => {
      apiInstance.sendTransacEmail.mockRejectedValue(new Error('down'));
      await expect(emailService.sendPurchaseConfirmation({ email: 'b@x.com' }, { name: 'x' }, { totalPaid: 0 })).resolves.toBeUndefined();
    });
  });

  describe('sendSellerNotification', () => {
    it('includes the seller earnings amount', async () => {
      apiInstance.sendTransacEmail.mockResolvedValue({});
      await emailService.sendSellerNotification(
        { email: 'seller@example.com', name: 'Sam' },
        { name: 'Cool App', category: 'paid' },
        { sellerPrice: 400 }
      );

      const html = apiInstance.sendTransacEmail.mock.calls[0][0].htmlContent;
      expect(html).toContain('400');
    });
  });

  describe('sendStatusUpdateEmail', () => {
    it('uses the approved-status template and links to the website when it has an id', async () => {
      apiInstance.sendTransacEmail.mockResolvedValue({});
      await emailService.sendStatusUpdateEmail({ email: 's@x.com', name: 'Sam' }, { _id: 'w1', name: 'App' }, 'approved');

      const html = apiInstance.sendTransacEmail.mock.calls[0][0].htmlContent;
      expect(html).toContain('Approved');
      expect(html).toContain('/website/w1');
    });

    it('falls back to a generic message for an unrecognized status', async () => {
      apiInstance.sendTransacEmail.mockResolvedValue({});
      await emailService.sendStatusUpdateEmail({ email: 's@x.com' }, { name: 'App' }, 'weird_status');

      const html = apiInstance.sendTransacEmail.mock.calls[0][0].htmlContent;
      expect(html).toContain('weird_status');
    });

    it('links to the profile page when the website has no id', async () => {
      apiInstance.sendTransacEmail.mockResolvedValue({});
      await emailService.sendStatusUpdateEmail({ email: 's@x.com' }, { name: 'App' }, 'rejected');

      const html = apiInstance.sendTransacEmail.mock.calls[0][0].htmlContent;
      expect(html).toContain('/profile');
    });

    it('includes the admin comment only when provided', async () => {
      apiInstance.sendTransacEmail.mockResolvedValue({});
      await emailService.sendStatusUpdateEmail({ email: 's@x.com' }, { name: 'App' }, 'changes_requested', 'fix the header');

      const html = apiInstance.sendTransacEmail.mock.calls[0][0].htmlContent;
      expect(html).toContain('fix the header');
    });
  });

  describe('sendPayoutNotification', () => {
    it('includes UTR, bank, and website details when present', async () => {
      apiInstance.sendTransacEmail.mockResolvedValue({});
      await emailService.sendPayoutNotification(
        { email: 's@x.com', name: 'Sam' },
        { amount: 1000, status: 'completed', utr: 'UTR123', bankName: 'HDFC', websiteName: 'Cool App' }
      );

      const html = apiInstance.sendTransacEmail.mock.calls[0][0].htmlContent;
      expect(html).toContain('UTR123');
      expect(html).toContain('HDFC');
      expect(html).toContain('Cool App');
    });

    it('omits optional fields that are absent', async () => {
      apiInstance.sendTransacEmail.mockResolvedValue({});
      await emailService.sendPayoutNotification({ email: 's@x.com' }, { amount: 500, status: 'pending' });

      const html = apiInstance.sendTransacEmail.mock.calls[0][0].htmlContent;
      expect(html).not.toContain('UTR');
      expect(html).not.toContain('Bank');
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('includes the reset token in the URL', async () => {
      apiInstance.sendTransacEmail.mockResolvedValue({});
      await emailService.sendPasswordResetEmail({ email: 'a@x.com' }, 'reset-tok');

      const html = apiInstance.sendTransacEmail.mock.calls[0][0].htmlContent;
      expect(html).toContain('reset-tok');
    });

    it('rethrows on failure (password reset is not best-effort)', async () => {
      apiInstance.sendTransacEmail.mockRejectedValue(new Error('smtp down'));
      await expect(emailService.sendPasswordResetEmail({ email: 'a@x.com' }, 'tok')).rejects.toThrow('smtp down');
    });
  });

  describe('sendAdminAlert', () => {
    it('sends to the default admin address when ADMIN_EMAILS is unset', async () => {
      delete process.env.ADMIN_EMAILS;
      apiInstance.sendTransacEmail.mockResolvedValue({});

      await emailService.sendAdminAlert({ subject: 'Something broke', message: 'oops' });

      const sent = apiInstance.sendTransacEmail.mock.calls[0][0];
      expect(sent.to).toEqual([{ email: 'admin@devdrop.com' }]);
      expect(sent.subject).toContain('Something broke');
    });

    it('sends to every configured admin email', async () => {
      process.env.ADMIN_EMAILS = 'a@x.com, b@x.com';
      apiInstance.sendTransacEmail.mockResolvedValue({});

      await emailService.sendAdminAlert({ subject: 'Alert', message: 'msg' });

      const sent = apiInstance.sendTransacEmail.mock.calls[0][0];
      expect(sent.to).toEqual([{ email: 'a@x.com' }, { email: 'b@x.com' }]);
    });

    it('includes error and details blocks only when provided', async () => {
      apiInstance.sendTransacEmail.mockResolvedValue({});
      await emailService.sendAdminAlert({ subject: 'Alert', message: 'msg', error: 'boom', details: 'stack trace here' });

      const html = apiInstance.sendTransacEmail.mock.calls[0][0].htmlContent;
      expect(html).toContain('boom');
      expect(html).toContain('stack trace here');
    });

    it('is best-effort and swallows send failures', async () => {
      apiInstance.sendTransacEmail.mockRejectedValue(new Error('down'));
      await expect(emailService.sendAdminAlert({ subject: 'x', message: 'y' })).resolves.toBeUndefined();
    });
  });

  describe('sendOutbidNotification', () => {
    it('includes the new highest bid and a link to the auction', async () => {
      apiInstance.sendTransacEmail.mockResolvedValue({});
      await emailService.sendOutbidNotification({ email: 'bidder@x.com', name: 'Bidder' }, { _id: 'w1', name: 'App' }, 2000);

      const html = apiInstance.sendTransacEmail.mock.calls[0][0].htmlContent;
      expect(html).toContain('2000');
      expect(html).toContain('/exclusive/w1');
    });

    it('is best-effort and swallows send failures', async () => {
      apiInstance.sendTransacEmail.mockRejectedValue(new Error('down'));
      await expect(emailService.sendOutbidNotification({ email: 'x@x.com' }, { _id: 'w1', name: 'App' }, 100)).resolves.toBeUndefined();
    });
  });

  describe('sendEmail (via any wrapper) — multi-recipient handling', () => {
    it('accepts an array of recipients', async () => {
      apiInstance.sendTransacEmail.mockResolvedValue({});
      await emailService.sendAdminAlert({ subject: 'x', message: 'y' });
      process.env.ADMIN_EMAILS = 'one@x.com,two@x.com';

      await emailService.sendAdminAlert({ subject: 'x2', message: 'y2' });
      const sent = apiInstance.sendTransacEmail.mock.calls[1][0];
      expect(sent.to).toHaveLength(2);
    });
  });
});
