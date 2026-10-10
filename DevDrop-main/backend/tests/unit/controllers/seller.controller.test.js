jest.mock('../../../src/modules/website/website.model');
jest.mock('../../../src/modules/user/bankDetails.model');
jest.mock('../../../src/modules/payment/purchase.model');
jest.mock('../../../src/modules/payout/payout.model');
jest.mock('../../../src/modules/website/website.controller', () => ({
  hydrateWebsitePreviewsAsync: jest.fn((websites) => Promise.resolve(websites)),
}));

const Website = require('../../../src/modules/website/website.model');
const BankDetails = require('../../../src/modules/user/bankDetails.model');
const Purchase = require('../../../src/modules/payment/purchase.model');
const Payout = require('../../../src/modules/payout/payout.model');
const sellerController = require('../../../src/modules/seller/seller.controller');
const { createQueryMock, mockReq, mockRes } = require('../../helpers/mockQuery');

describe('seller.controller', () => {
  describe('submitWebsite', () => {
    it('rejects an invalid category', async () => {
      const req = mockReq({ body: { category: 'bogus' } });
      const res = mockRes();

      await sellerController.submitWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects a free website with a non-zero price', async () => {
      const req = mockReq({ body: { category: 'free', price: 10 } });
      const res = mockRes();

      await sellerController.submitWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/Free websites must have price 0/);
    });

    it('rejects a paid website with a zero/negative price', async () => {
      const req = mockReq({ body: { category: 'paid', price: 0 } });
      const res = mockRes();

      await sellerController.submitWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/price > 0/);
    });

    it('requires bank details before listing a paid website', async () => {
      BankDetails.findOne.mockResolvedValue(null);
      const req = mockReq({ body: { category: 'paid', price: 100 } });
      const res = mockRes();

      await sellerController.submitWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].requiresBankDetails).toBe(true);
    });

    it('does not require bank details for a free website', async () => {
      const saved = { save: jest.fn().mockResolvedValue(true) };
      Website.mockImplementation(() => saved);
      const req = mockReq({ body: { category: 'free', price: 0, name: 'Free App' } });
      const res = mockRes();

      await sellerController.submitWebsite(req, res);

      expect(BankDetails.findOne).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('creates and submits a paid website for review when bank details exist', async () => {
      BankDetails.findOne.mockResolvedValue({ upiId: 'a@upi' });
      const saved = { save: jest.fn().mockResolvedValue(true) };
      Website.mockImplementation(() => saved);
      const req = mockReq({ body: { category: 'paid', price: 500, name: 'Paid App' } });
      const res = mockRes();

      await sellerController.submitWebsite(req, res);

      expect(saved.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('formats Mongoose ValidationError into a 400 with field errors', async () => {
      const validationError = new Error('validation failed');
      validationError.name = 'ValidationError';
      validationError.errors = { name: { message: 'Name is required' } };
      const saved = { save: jest.fn().mockRejectedValue(validationError) };
      Website.mockImplementation(() => saved);
      const req = mockReq({ body: { category: 'free', price: 0 } });
      const res = mockRes();

      await sellerController.submitWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].errors).toEqual([{ field: 'name', message: 'Name is required' }]);
    });

    it('returns 500 for an unexpected save error', async () => {
      const saved = { save: jest.fn().mockRejectedValue(new Error('disk full')) };
      Website.mockImplementation(() => saved);
      const req = mockReq({ body: { category: 'free', price: 0 } });
      const res = mockRes();

      await sellerController.submitWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getMyWebsites', () => {
    it('lists the seller websites with sales counts and pagination', async () => {
      Website.find.mockReturnValue(createQueryMock([{ _id: 'w1' }, { _id: 'w2' }]));
      Website.countDocuments.mockResolvedValue(2);
      Purchase.aggregate.mockResolvedValue([{ _id: 'w1', count: 3 }]);

      const req = mockReq({ query: {} });
      const res = mockRes();

      await sellerController.getMyWebsites(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.data.find((w) => w._id === 'w1').salesCount).toBe(3);
      expect(payload.data.find((w) => w._id === 'w2').salesCount).toBe(0);
      expect(payload.pagination.totalItems).toBe(2);
    });

    it('filters by status when provided', async () => {
      Website.find.mockReturnValue(createQueryMock([]));
      Website.countDocuments.mockResolvedValue(0);
      Purchase.aggregate.mockResolvedValue([]);

      const req = mockReq({ query: { status: 'approved' } });
      const res = mockRes();

      await sellerController.getMyWebsites(req, res);

      expect(Website.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));
    });

    it('returns 500 when a query fails', async () => {
      Website.find.mockImplementation(() => { throw new Error('bad'); });
      const req = mockReq({ query: {} });
      const res = mockRes();

      await sellerController.getMyWebsites(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('updateWebsite', () => {
    it('returns 404 when the website is not owned by this seller', async () => {
      Website.findOne.mockResolvedValue(null);
      const req = mockReq({ params: { id: 'w1' }, body: {} });
      const res = mockRes();

      await sellerController.updateWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('rejects an update unless changes were requested', async () => {
      Website.findOne.mockResolvedValue({ status: 'approved' });
      const req = mockReq({ params: { id: 'w1' }, body: { name: 'New' } });
      const res = mockRes();

      await sellerController.updateWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects setting a non-zero price on a free website', async () => {
      const website = { status: 'changes_requested', category: 'free', save: jest.fn() };
      Website.findOne.mockResolvedValue(website);
      const req = mockReq({ params: { id: 'w1' }, body: { price: 10 } });
      const res = mockRes();

      await sellerController.updateWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(website.save).not.toHaveBeenCalled();
    });

    it('applies updates, resets status to pending review, and clears admin comments', async () => {
      const website = {
        status: 'changes_requested',
        category: 'paid',
        techStack: { frontend: 'react' },
        adminComment: 'fix the header',
        save: jest.fn().mockResolvedValue(true),
      };
      Website.findOne.mockResolvedValue(website);
      const req = mockReq({ params: { id: 'w1' }, body: { name: 'Updated', techStack: { backend: 'node' } } });
      const res = mockRes();

      await sellerController.updateWebsite(req, res);

      expect(website.name).toBe('Updated');
      expect(website.techStack).toEqual({ frontend: 'react', backend: 'node' });
      expect(website.status).toBe('pending_review');
      expect(website.adminComment).toBeUndefined();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 500 when save fails', async () => {
      const website = { status: 'changes_requested', category: 'free', save: jest.fn().mockRejectedValue(new Error('x')) };
      Website.findOne.mockResolvedValue(website);
      const req = mockReq({ params: { id: 'w1' }, body: {} });
      const res = mockRes();

      await sellerController.updateWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getEarnings', () => {
    it('returns earnings, payout summaries, and recent sales', async () => {
      Purchase.aggregate.mockResolvedValue([{ _id: null, totalEarnings: 10000, totalSales: 4 }]);
      Payout.aggregate
        .mockResolvedValueOnce([{ _id: null, pendingAmount: 2000, count: 1 }])
        .mockResolvedValueOnce([{ _id: null, paidAmount: 8000, count: 3 }]);
      Purchase.find.mockReturnValue(createQueryMock([{ _id: 'sale1' }]));

      const req = mockReq();
      const res = mockRes();

      await sellerController.getEarnings(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          totalEarnings: 10000,
          totalSales: 4,
          pendingPayouts: { amount: 2000, count: 1 },
          completedPayouts: { amount: 8000, count: 3 },
          recentSales: [{ _id: 'sale1' }],
        },
      });
    });

    it('defaults every figure to 0 when there is no history yet', async () => {
      Purchase.aggregate.mockResolvedValue([]);
      Payout.aggregate.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      Purchase.find.mockReturnValue(createQueryMock([]));

      const req = mockReq();
      const res = mockRes();

      await sellerController.getEarnings(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.data.totalEarnings).toBe(0);
      expect(payload.data.pendingPayouts).toEqual({ amount: 0, count: 0 });
    });

    it('returns 500 on failure', async () => {
      Purchase.aggregate.mockRejectedValue(new Error('down'));
      Payout.aggregate.mockResolvedValue([]);
      Purchase.find.mockReturnValue(createQueryMock([]));

      const req = mockReq();
      const res = mockRes();

      await sellerController.getEarnings(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getPayouts', () => {
    it('lists payouts with pagination and honors a status filter', async () => {
      Payout.find.mockReturnValue(createQueryMock([{ _id: 'p1' }]));
      Payout.countDocuments.mockResolvedValue(1);

      const req = mockReq({ query: { status: 'completed' } });
      const res = mockRes();

      await sellerController.getPayouts(req, res);

      expect(Payout.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
      expect(res.json.mock.calls[0][0].pagination.totalItems).toBe(1);
    });

    it('returns 500 when the query fails', async () => {
      Payout.find.mockImplementation(() => { throw new Error('bad'); });
      const req = mockReq({ query: {} });
      const res = mockRes();

      await sellerController.getPayouts(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('deleteOwnWebsite', () => {
    it('returns 404 when the website is not found for this seller', async () => {
      Website.findOne.mockResolvedValue(null);
      const req = mockReq({ params: { id: 'w1' } });
      const res = mockRes();

      await sellerController.deleteOwnWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('refuses to delete an approved website', async () => {
      Website.findOne.mockResolvedValue({ status: 'approved' });
      const req = mockReq({ params: { id: 'w1' } });
      const res = mockRes();

      await sellerController.deleteOwnWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('refuses to delete a sold website', async () => {
      Website.findOne.mockResolvedValue({ status: 'sold' });
      const req = mockReq({ params: { id: 'w1' } });
      const res = mockRes();

      await sellerController.deleteOwnWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('soft-deletes a pending website', async () => {
      const website = { status: 'pending_review', save: jest.fn().mockResolvedValue(true) };
      Website.findOne.mockResolvedValue(website);
      const req = mockReq({ params: { id: 'w1' } });
      const res = mockRes();

      await sellerController.deleteOwnWebsite(req, res);

      expect(website.isDeleted).toBe(true);
      expect(website.deletedAt).toBeInstanceOf(Date);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 500 when save fails', async () => {
      const website = { status: 'pending_review', save: jest.fn().mockRejectedValue(new Error('x')) };
      Website.findOne.mockResolvedValue(website);
      const req = mockReq({ params: { id: 'w1' } });
      const res = mockRes();

      await sellerController.deleteOwnWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
