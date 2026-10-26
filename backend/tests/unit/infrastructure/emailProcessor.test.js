const crypto = require('crypto');
const mockUser = { findById: jest.fn() };
const mockWebsite = { findById: jest.fn() };
const mockPurchase = { findById: jest.fn() };
const mockPayout = { findById: jest.fn() };
const mockAuction = { findOne: jest.fn() };
const mockBid = { findById: jest.fn() };
const mockEmail = {
  sendVerificationEmail: jest.fn(), sendPasswordResetEmail: jest.fn(), sendWelcomeEmail: jest.fn(),
  sendPurchaseConfirmation: jest.fn(), sendSellerNotification: jest.fn(), sendStatusUpdateEmail: jest.fn(),
  sendPayoutNotification: jest.fn(), sendAdminAlert: jest.fn(), sendOutbidNotification: jest.fn(),
};
jest.mock('../../../src/services/email.service', () => mockEmail);
jest.mock('../../../src/modules/user/user.model', () => mockUser);
jest.mock('../../../src/modules/website/website.model', () => mockWebsite);
jest.mock('../../../src/modules/payment/purchase.model', () => mockPurchase);
jest.mock('../../../src/modules/payout/payout.model', () => mockPayout);
jest.mock('../../../src/modules/auction/auction.model', () => mockAuction);
jest.mock('../../../src/modules/auction/bid.model', () => mockBid);
jest.mock('../../../src/infrastructure/queue/queueJob.model', () => require('./mockQueueJob'));

process.env.TOKEN_ENCRYPTION_KEY = 'b'.repeat(64);
const { UnrecoverableError } = require('bullmq');
const cryptoUtil = require('../../../src/shared/utils/crypto');
const QueueJob = require('../../../src/infrastructure/queue/queueJob.model');
const { processEmailJob } = require('../../../src/infrastructure/events/emailProcessor');

const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
const ctx = { jobKey: 'k1' };
const job = (name, data) => ({ name, data });

beforeEach(() => { jest.clearAllMocks(); QueueJob.__reset(); QueueJob.__docs.set('k1', { jobKey: 'k1', status: 'active' }); });

describe('provider outcome tracking', () => {
  it('records provider acceptance separately from queue acceptance', async () => {
    mockUser.findById.mockResolvedValue({ _id: 'u1', email: 'a@x.com' });
    mockEmail.sendWelcomeEmail.mockResolvedValue({ messageId: '<abc@brevo>' });
    const out = await processEmailJob(job('EMAIL_WELCOME', { userId: 'u1' }), ctx);
    expect(out.delivery.providerAcceptedAt).toBeInstanceOf(Date);
    expect(out.delivery.providerMessageId).toBe('<abc@brevo>');
    expect(out.delivery.deliveryConfirmedAt).toBeUndefined(); // no delivery webhook is integrated: never claimed
  });

  it('a retry after provider acceptance does not send a second email', async () => {
    QueueJob.__docs.get('k1').delivery = { providerAcceptedAt: new Date() };
    const out = await processEmailJob(job('EMAIL_WELCOME', { userId: 'u1' }), ctx);
    expect(out.result.duplicate).toBe(true);
    expect(mockEmail.sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it('provider rejections (4xx) are permanent; outages are left retryable', async () => {
    mockUser.findById.mockResolvedValue({ _id: 'u1' });
    mockEmail.sendWelcomeEmail.mockRejectedValueOnce(Object.assign(new Error('bad'), { statusCode: 400 }));
    await expect(processEmailJob(job('EMAIL_WELCOME', { userId: 'u1' }), ctx)).rejects.toBeInstanceOf(UnrecoverableError);
    const down = Object.assign(new Error('503'), { statusCode: 503 });
    mockEmail.sendWelcomeEmail.mockRejectedValueOnce(down);
    await expect(processEmailJob(job('EMAIL_WELCOME', { userId: 'u1' }), ctx)).rejects.toBe(down);
  });

  it('unknown job types fail permanently', async () => {
    await expect(processEmailJob(job('EMAIL_NOPE', {}), ctx)).rejects.toBeInstanceOf(UnrecoverableError);
  });
});

describe('security link emails', () => {
  const token = 'tok-123';
  const data = (extra = {}) => ({ userId: 'u1', tokenEnc: cryptoUtil.encrypt(token), notAfter: Date.now() + 60000, ...extra });

  it('sends when the token is still the current one', async () => {
    mockUser.findById.mockResolvedValue({ _id: 'u1', isVerified: false, verificationToken: sha(token), verificationTokenExpiry: Date.now() + 1000 });
    mockEmail.sendVerificationEmail.mockResolvedValue({ messageId: 'm' });
    await processEmailJob(job('EMAIL_VERIFICATION', data()), ctx);
    expect(mockEmail.sendVerificationEmail).toHaveBeenCalledWith(expect.anything(), token);
  });

  it('never delivers a superseded token', async () => {
    mockUser.findById.mockResolvedValue({ _id: 'u1', isVerified: false, verificationToken: sha('newer'), verificationTokenExpiry: Date.now() + 1000 });
    const out = await processEmailJob(job('EMAIL_VERIFICATION', data()), ctx);
    expect(out.delivery.skippedReason).toBe('token_superseded_or_expired');
    expect(mockEmail.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('never delivers an expired token, even if the worker was down for a while', async () => {
    mockUser.findById.mockResolvedValue({ _id: 'u1', resetPasswordToken: sha(token), resetPasswordExpiry: Date.now() - 1 });
    const out = await processEmailJob(job('EMAIL_PASSWORD_RESET', data()), ctx);
    expect(out.delivery.skippedReason).toBe('token_superseded_or_expired');
    expect(mockEmail.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('drops delivery jobs that outlived their window', async () => {
    const out = await processEmailJob(job('EMAIL_VERIFICATION', data({ notAfter: Date.now() - 1 })), ctx);
    expect(out.delivery.skippedReason).toBe('expired_before_delivery');
    expect(mockUser.findById).not.toHaveBeenCalled();
  });

  it('skips verification for an already-verified user', async () => {
    mockUser.findById.mockResolvedValue({ _id: 'u1', isVerified: true });
    expect((await processEmailJob(job('EMAIL_VERIFICATION', data()), ctx)).delivery.skippedReason).toBe('already_verified');
  });

  it('a tampered token payload fails permanently', async () => {
    mockUser.findById.mockResolvedValue({ _id: 'u1', isVerified: false });
    await expect(processEmailJob(job('EMAIL_VERIFICATION', data({ tokenEnc: 'garbage' })), ctx)).rejects.toBeInstanceOf(UnrecoverableError);
  });
});

describe('outbid notification relevance', () => {
  const data = { bidId: 'b1', websiteId: 'w1', previousBidderId: 'u2', bidAmount: 900 };
  const open = { status: 'active', currentBidderId: 'u9' };

  it('sends when the bid is accepted and the previous bidder is still outbid', async () => {
    mockBid.findById.mockResolvedValue({ status: 'winning' });
    mockAuction.findOne.mockResolvedValue(open);
    mockUser.findById.mockResolvedValue({ _id: 'u2' });
    mockWebsite.findById.mockResolvedValue({ _id: 'w1' });
    mockEmail.sendOutbidNotification.mockResolvedValue({ messageId: 'm' });
    await processEmailJob(job('EMAIL_OUTBID', data), ctx);
    expect(mockEmail.sendOutbidNotification).toHaveBeenCalledWith({ _id: 'u2' }, { _id: 'w1' }, 900);
  });

  it('skips a bid that no longer exists (failed / rolled back)', async () => {
    mockBid.findById.mockResolvedValue(null);
    expect((await processEmailJob(job('EMAIL_OUTBID', data), ctx)).delivery.skippedReason).toBe('bid_not_accepted');
    expect(mockEmail.sendOutbidNotification).not.toHaveBeenCalled();
  });

  it('skips when the previous bidder has since regained the lead', async () => {
    mockBid.findById.mockResolvedValue({ status: 'outbid' });
    mockAuction.findOne.mockResolvedValue({ status: 'active', currentBidderId: 'u2' });
    expect((await processEmailJob(job('EMAIL_OUTBID', data), ctx)).delivery.skippedReason).toBe('bidder_regained_lead');
  });

  it('skips when the auction already closed', async () => {
    mockBid.findById.mockResolvedValue({ status: 'outbid' });
    mockAuction.findOne.mockResolvedValue({ status: 'ended', currentBidderId: 'u9' });
    expect((await processEmailJob(job('EMAIL_OUTBID', data), ctx)).delivery.skippedReason).toBe('auction_closed');
  });
});

describe('other transactional emails', () => {
  it('purchase confirmation loads current records by id', async () => {
    mockPurchase.findById.mockResolvedValue({ buyerId: 'b', websiteId: 'w', sellerId: 's' });
    mockUser.findById.mockResolvedValue({ _id: 'b' });
    mockWebsite.findById.mockResolvedValue({ _id: 'w' });
    mockEmail.sendPurchaseConfirmation.mockResolvedValue({});
    await processEmailJob(job('EMAIL_PURCHASE_CONFIRMATION', { purchaseId: 'p1' }), ctx);
    expect(mockEmail.sendPurchaseConfirmation).toHaveBeenCalled();
  });

  it('missing purchase is skipped, not retried forever', async () => {
    mockPurchase.findById.mockResolvedValue(null);
    expect((await processEmailJob(job('EMAIL_PURCHASE_CONFIRMATION', { purchaseId: 'gone' }), ctx)).delivery.skippedReason).toBe('purchase_not_found');
  });
});
