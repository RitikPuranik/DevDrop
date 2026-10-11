// Mock of src/infrastructure/events: request handlers enqueue; they never send email themselves.
const accepted = { accepted: true, duplicate: false, status: 'queued' };

module.exports = {
  enqueueVerificationEmail: jest.fn().mockResolvedValue(accepted),
  enqueuePasswordResetEmail: jest.fn().mockResolvedValue(accepted),
  verificationEmailRecentlyRequested: jest.fn().mockResolvedValue(false),
  enqueueWelcomeEmail: jest.fn().mockResolvedValue(accepted),
  enqueuePurchaseConfirmation: jest.fn().mockResolvedValue(accepted),
  enqueueSellerNotification: jest.fn().mockResolvedValue(accepted),
  enqueueStatusUpdateEmail: jest.fn().mockResolvedValue(accepted),
  enqueuePayoutNotification: jest.fn().mockResolvedValue(accepted),
  enqueueAdminAlert: jest.fn().mockResolvedValue(accepted),
  enqueueOutbidNotification: jest.fn().mockResolvedValue(accepted),
  requestVerificationEmail: jest.fn().mockResolvedValue({ throttled: false, accepted: true }),
  requestPasswordResetEmail: jest.fn().mockResolvedValue(accepted),
  isQueueUnavailable: (error) => error?.code === 'QUEUE_UNAVAILABLE',
};
