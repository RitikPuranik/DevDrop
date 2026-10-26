const mockJobs = {
  verificationEmailRecentlyRequested: jest.fn(),
  enqueueVerificationEmail: jest.fn(),
  enqueuePasswordResetEmail: jest.fn(),
};
jest.mock('../../../src/infrastructure/events/emailJobs', () => mockJobs);
const { requestVerificationEmail, requestPasswordResetEmail, isQueueUnavailable } = require('../../../src/infrastructure/events/securityEmails');

const mkUser = () => ({ _id: 'u1', generateVerificationToken: jest.fn(() => 'vt'), generateResetPasswordToken: jest.fn(() => 'rt'), save: jest.fn().mockResolvedValue() });
beforeEach(() => { jest.clearAllMocks(); mockJobs.enqueueVerificationEmail.mockResolvedValue({ accepted: true }); mockJobs.enqueuePasswordResetEmail.mockResolvedValue({ accepted: true }); });

describe('requestVerificationEmail', () => {
  it('mints the token + saves the user (request path), then queues delivery', async () => {
    mockJobs.verificationEmailRecentlyRequested.mockResolvedValue(false);
    const user = mkUser();
    const out = await requestVerificationEmail(user);
    expect(user.save).toHaveBeenCalled();
    expect(mockJobs.enqueueVerificationEmail).toHaveBeenCalledWith(user, 'vt');
    expect(out.throttled).toBe(false);
  });

  it('inside the cooldown it neither mints a new token (which would invalidate the queued email) nor enqueues', async () => {
    mockJobs.verificationEmailRecentlyRequested.mockResolvedValue(true);
    const user = mkUser();
    expect(await requestVerificationEmail(user)).toEqual({ throttled: true });
    expect(user.generateVerificationToken).not.toHaveBeenCalled();
    expect(mockJobs.enqueueVerificationEmail).not.toHaveBeenCalled();
  });

  it('queue outage surfaces as QUEUE_UNAVAILABLE so the controller can answer 503 honestly', async () => {
    mockJobs.verificationEmailRecentlyRequested.mockResolvedValue(false);
    mockJobs.enqueueVerificationEmail.mockRejectedValue(Object.assign(new Error('x'), { code: 'QUEUE_UNAVAILABLE' }));
    const err = await requestVerificationEmail(mkUser()).catch((e) => e);
    expect(isQueueUnavailable(err)).toBe(true);
  });
});

describe('requestPasswordResetEmail', () => {
  it('saves the hashed token on the user and queues the delivery (no email sent in-request)', async () => {
    const user = mkUser();
    await requestPasswordResetEmail(user);
    expect(user.save).toHaveBeenCalled();
    expect(mockJobs.enqueuePasswordResetEmail).toHaveBeenCalledWith(user, 'rt');
  });
});
