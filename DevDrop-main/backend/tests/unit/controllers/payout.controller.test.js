jest.mock('../../../src/modules/payout/payout.model');
jest.mock('../../../src/modules/payment/purchase.model');
jest.mock('../../../src/modules/website/website.model');
jest.mock('../../../src/modules/user/user.model');
jest.mock('../../../src/services/email.service');

const Payout = require('../../../src/modules/payout/payout.model');
const emailService = require('../../../src/services/email.service');
const payoutController = require('../../../src/modules/payout/payout.controller');
const { createQueryMock, mockReq, mockRes } = require('../../helpers/mockQuery');

describe('payout.controller', () => {
  describe('getPendingPayouts', () => {
    it('returns pending payouts with pagination metadata', async () => {
      Payout.find.mockReturnValue(createQueryMock([{ _id: 'p1', status: 'pending' }]));
      Payout.countDocuments.mockResolvedValue(1);

      const req = mockReq({ query: {} });
      const res = mockRes();

      await payoutController.getPendingPayouts(req, res);

      expect(Payout.find).toHaveBeenCalledWith({ status: 'pending' });
      expect(res.json.mock.calls[0][0].pagination.totalItems).toBe(1);
    });

    it('returns 500 on failure', async () => {
      Payout.find.mockImplementation(() => { throw new Error('down'); });
      const req = mockReq({ query: {} });
      const res = mockRes();

      await payoutController.getPendingPayouts(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getAllPayouts', () => {
    it('applies optional status and sellerId filters', async () => {
      Payout.find.mockReturnValue(createQueryMock([]));
      Payout.countDocuments.mockResolvedValue(0);

      const req = mockReq({ query: { status: 'failed', sellerId: 's1' } });
      const res = mockRes();

      await payoutController.getAllPayouts(req, res);

      expect(Payout.find).toHaveBeenCalledWith({ status: 'failed', sellerId: 's1' });
    });

    it('queries with an empty filter when none is given', async () => {
      Payout.find.mockReturnValue(createQueryMock([]));
      Payout.countDocuments.mockResolvedValue(0);

      const req = mockReq({ query: {} });
      const res = mockRes();

      await payoutController.getAllPayouts(req, res);

      expect(Payout.find).toHaveBeenCalledWith({});
    });

    it('returns 500 on failure', async () => {
      Payout.find.mockImplementation(() => { throw new Error('down'); });
      const req = mockReq({ query: {} });
      const res = mockRes();

      await payoutController.getAllPayouts(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('processPayout', () => {
    it('rejects a missing/blank UTR', async () => {
      const req = mockReq({ params: { id: 'p1' }, body: { utr: '   ' } });
      const res = mockRes();

      await payoutController.processPayout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(Payout.findById).not.toHaveBeenCalled();
    });

    it('returns 404 when the payout does not exist', async () => {
      Payout.findById.mockReturnValue(createQueryMock(null));
      const req = mockReq({ params: { id: 'p1' }, body: { utr: 'UTR123' } });
      const res = mockRes();

      await payoutController.processPayout(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('rejects processing a payout that is not pending', async () => {
      Payout.findById.mockReturnValue(createQueryMock({ status: 'completed' }));
      const req = mockReq({ params: { id: 'p1' }, body: { utr: 'UTR123' } });
      const res = mockRes();

      await payoutController.processPayout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/already completed/);
    });

    it('marks a pending payout completed and emails the seller', async () => {
      const payout = { status: 'pending', sellerId: { name: 'Sam' }, save: jest.fn().mockResolvedValue(true) };
      Payout.findById.mockReturnValue(createQueryMock(payout));
      emailService.sendPayoutNotification.mockResolvedValue(true);

      const req = mockReq({ params: { id: 'p1' }, body: { utr: 'UTR123', notes: 'paid via NEFT' } });
      const res = mockRes();

      await payoutController.processPayout(req, res);

      expect(payout.status).toBe('completed');
      expect(payout.utr).toBe('UTR123');
      expect(payout.save).toHaveBeenCalled();
      expect(emailService.sendPayoutNotification).toHaveBeenCalledWith(payout.sellerId, payout);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('still succeeds when the notification email fails', async () => {
      const payout = { status: 'pending', sellerId: {}, save: jest.fn().mockResolvedValue(true) };
      Payout.findById.mockReturnValue(createQueryMock(payout));
      emailService.sendPayoutNotification.mockRejectedValue(new Error('smtp down'));

      const req = mockReq({ params: { id: 'p1' }, body: { utr: 'UTR123' } });
      const res = mockRes();

      await payoutController.processPayout(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 500 when save fails', async () => {
      const payout = { status: 'pending', save: jest.fn().mockRejectedValue(new Error('x')) };
      Payout.findById.mockReturnValue(createQueryMock(payout));
      const req = mockReq({ params: { id: 'p1' }, body: { utr: 'UTR123' } });
      const res = mockRes();

      await payoutController.processPayout(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getSellerPayouts', () => {
    it('denies access to a non-admin requesting another seller\'s payouts', async () => {
      const req = mockReq({ params: { sellerId: 'other-seller' }, userId: 'me', userRole: 'user' });
      const res = mockRes();

      await payoutController.getSellerPayouts(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(Payout.find).not.toHaveBeenCalled();
    });

    it('allows a seller to view their own payouts', async () => {
      const sellerId = '507f1f77bcf86cd799439011';
      Payout.find.mockReturnValue(createQueryMock([{ _id: 'p1' }]));
      Payout.countDocuments.mockResolvedValue(1);
      Payout.aggregate.mockResolvedValue([{ _id: 'pending', count: 1, totalAmount: 500 }]);

      const req = mockReq({ params: { sellerId }, userId: sellerId, userRole: 'user' });
      const res = mockRes();

      await payoutController.getSellerPayouts(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.summary.pending).toEqual({ _id: 'pending', count: 1, totalAmount: 500 });
      expect(payload.summary.completed).toEqual({ count: 0, totalAmount: 0 });
    });

    it('allows an admin to view any seller\'s payouts', async () => {
      Payout.find.mockReturnValue(createQueryMock([]));
      Payout.countDocuments.mockResolvedValue(0);
      Payout.aggregate.mockResolvedValue([]);

      const req = mockReq({ params: { sellerId: '507f1f77bcf86cd799439011' }, userId: 'admin1', userRole: 'admin' });
      const res = mockRes();

      await payoutController.getSellerPayouts(req, res);

      expect(res.status).not.toHaveBeenCalledWith(403);
    });

    it('returns 500 when a query fails', async () => {
      Payout.find.mockImplementation(() => { throw new Error('down'); });
      const sellerId = '507f1f77bcf86cd799439011';
      const req = mockReq({ params: { sellerId }, userId: sellerId, userRole: 'user' });
      const res = mockRes();

      await payoutController.getSellerPayouts(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getPayoutStats', () => {
    it('formats aggregated stats by status with zero-defaults for missing statuses', async () => {
      Payout.aggregate.mockResolvedValue([{ _id: 'completed', count: 5, totalAmount: 10000 }]);
      const req = mockReq();
      const res = mockRes();

      await payoutController.getPayoutStats(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.data.completed).toEqual({ _id: 'completed', count: 5, totalAmount: 10000 });
      expect(payload.data.pending).toEqual({ count: 0, totalAmount: 0 });
      expect(payload.data.processing).toEqual({ count: 0, totalAmount: 0 });
      expect(payload.data.failed).toEqual({ count: 0, totalAmount: 0 });
    });

    it('returns 500 on aggregation failure', async () => {
      Payout.aggregate.mockRejectedValue(new Error('down'));
      const req = mockReq();
      const res = mockRes();

      await payoutController.getPayoutStats(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('failPayout', () => {
    it('requires a failure reason', async () => {
      const req = mockReq({ params: { id: 'p1' }, body: {} });
      const res = mockRes();

      await payoutController.failPayout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(Payout.findById).not.toHaveBeenCalled();
    });

    it('returns 404 when the payout does not exist', async () => {
      Payout.findById.mockReturnValue(createQueryMock(null));
      const req = mockReq({ params: { id: 'p1' }, body: { reason: 'bank rejected' } });
      const res = mockRes();

      await payoutController.failPayout(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('marks the payout as failed with the given reason', async () => {
      const payout = { save: jest.fn().mockResolvedValue(true) };
      Payout.findById.mockReturnValue(createQueryMock(payout));
      const req = mockReq({ params: { id: 'p1' }, body: { reason: 'bank rejected' }, userId: 'admin1' });
      const res = mockRes();

      await payoutController.failPayout(req, res);

      expect(payout.status).toBe('failed');
      expect(payout.failureReason).toBe('bank rejected');
      expect(payout.processedBy).toBe('admin1');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 500 when save fails', async () => {
      const payout = { save: jest.fn().mockRejectedValue(new Error('x')) };
      Payout.findById.mockReturnValue(createQueryMock(payout));
      const req = mockReq({ params: { id: 'p1' }, body: { reason: 'x' } });
      const res = mockRes();

      await payoutController.failPayout(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
