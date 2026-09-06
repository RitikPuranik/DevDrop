module.exports = {
  sendVerificationEmail: jest.fn().mockResolvedValue(true),
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
  sendPurchaseConfirmation: jest.fn().mockResolvedValue(true),
  sendSellerNotification: jest.fn().mockResolvedValue(true),
  sendStatusUpdateEmail: jest.fn().mockResolvedValue(true),
  sendPayoutNotification: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  sendAdminAlert: jest.fn().mockResolvedValue(true),
  sendOutbidNotification: jest.fn().mockResolvedValue(true),
};
