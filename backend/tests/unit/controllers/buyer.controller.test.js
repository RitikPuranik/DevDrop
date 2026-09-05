jest.mock('../../../src/modules/website/website.model');
jest.mock('../../../src/modules/payment/purchase.model');
jest.mock('../../../src/modules/user/user.model');
jest.mock('../../../src/services/email.service');
jest.mock('../../../src/services/supabase.service');

const Website = require('../../../src/modules/website/website.model');
const Purchase = require('../../../src/modules/payment/purchase.model');
const User = require('../../../src/modules/user/user.model');
const emailService = require('../../../src/services/email.service');
const supabaseService = require('../../../src/services/supabase.service');
const buyerController = require('../../../src/modules/buyer/buyer.controller');
const { createQueryMock, mockReq, mockRes } = require('../../helpers/mockQuery');

describe('buyer.controller', () => {
  describe('purchaseFreeWebsite', () => {
    const baseWebsite = () => ({
      _id: 'w1',
      status: 'approved',
      category: 'free',
      name: 'Free Site',
      sellerId: { _id: 's1' },
    });

    it('returns 404 when the website does not exist', async () => {
      Website.findOne.mockReturnValue(createQueryMock(null));
      const req = mockReq({ params: { websiteId: 'w1' } });
      const res = mockRes();

      await buyerController.purchaseFreeWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('rejects a website that is not approved', async () => {
      Website.findOne.mockReturnValue(createQueryMock({ ...baseWebsite(), status: 'pending_review' }));
      const req = mockReq({ params: { websiteId: 'w1' } });
      const res = mockRes();

      await buyerController.purchaseFreeWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/not available/);
    });

    it('rejects a non-free website (must use payment flow)', async () => {
      Website.findOne.mockReturnValue(createQueryMock({ ...baseWebsite(), category: 'paid' }));
      const req = mockReq({ params: { websiteId: 'w1' } });
      const res = mockRes();

      await buyerController.purchaseFreeWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/payment flow/);
    });

    it('blocks a duplicate purchase by the same buyer', async () => {
      Website.findOne.mockReturnValue(createQueryMock(baseWebsite()));
      Purchase.findOne.mockResolvedValue({ _id: 'existing' });
      const req = mockReq({ params: { websiteId: 'w1' } });
      const res = mockRes();

      await buyerController.purchaseFreeWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/already purchased/);
    });

    it('creates the purchase and sends confirmation emails on success', async () => {
      Website.findOne.mockReturnValue(createQueryMock(baseWebsite()));
      Purchase.findOne.mockResolvedValue(null);
      const saved = { save: jest.fn().mockResolvedValue(true) };
      Purchase.mockImplementation(() => saved);
      User.findById.mockResolvedValue({ _id: 'u1', email: 'buyer@example.com' });
      emailService.sendPurchaseConfirmation.mockResolvedValue(true);
      emailService.sendSellerNotification.mockResolvedValue(true);

      const req = mockReq({ params: { websiteId: 'w1' } });
      const res = mockRes();

      await buyerController.purchaseFreeWebsite(req, res);

      expect(saved.save).toHaveBeenCalled();
      expect(emailService.sendPurchaseConfirmation).toHaveBeenCalled();
      expect(emailService.sendSellerNotification).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('still returns 201 when the confirmation emails fail to send', async () => {
      Website.findOne.mockReturnValue(createQueryMock(baseWebsite()));
      Purchase.findOne.mockResolvedValue(null);
      const saved = { save: jest.fn().mockResolvedValue(true) };
      Purchase.mockImplementation(() => saved);
      User.findById.mockResolvedValue({ _id: 'u1' });
      emailService.sendPurchaseConfirmation.mockRejectedValue(new Error('smtp down'));

      const req = mockReq({ params: { websiteId: 'w1' } });
      const res = mockRes();

      await buyerController.purchaseFreeWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('returns 500 when the website lookup throws', async () => {
      Website.findOne.mockImplementation(() => { throw new Error('db down'); });
      const req = mockReq({ params: { websiteId: 'w1' } });
      const res = mockRes();

      await buyerController.purchaseFreeWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('checkPurchase', () => {
    it('reports hasPurchased: true with the purchase when one exists', async () => {
      Purchase.findOne.mockResolvedValue({ _id: 'p1' });
      const req = mockReq({ params: { websiteId: 'w1' } });
      const res = mockRes();

      await buyerController.checkPurchase(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, data: { hasPurchased: true, purchase: { _id: 'p1' } } });
    });

    it('reports hasPurchased: false when none exists', async () => {
      Purchase.findOne.mockResolvedValue(null);
      const req = mockReq({ params: { websiteId: 'w1' } });
      const res = mockRes();

      await buyerController.checkPurchase(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, data: { hasPurchased: false, purchase: null } });
    });

    it('returns 500 on error', async () => {
      Purchase.findOne.mockRejectedValue(new Error('down'));
      const req = mockReq({ params: { websiteId: 'w1' } });
      const res = mockRes();

      await buyerController.checkPurchase(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getMyPurchases', () => {
    it('hydrates preview video and seller avatar URLs and returns pagination', async () => {
      supabaseService.createSignedUrl.mockResolvedValue('https://signed/asset');
      const purchaseDoc = {
        toObject: () => ({
          websiteId: { previewVideoUrl: 'videos/a.mp4', sellerId: { avatar: 'avatars/s.png' } },
          sellerId: { avatar: 'avatars/direct.png' },
        }),
      };
      Purchase.find.mockReturnValue(createQueryMock([purchaseDoc]));
      Purchase.countDocuments.mockResolvedValue(1);

      const req = mockReq({ query: {} });
      const res = mockRes();

      await buyerController.getMyPurchases(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.data[0].websiteId.files.previewVideo.url).toBe('https://signed/asset');
      expect(payload.data[0].sellerId.avatar).toBe('https://signed/asset');
      expect(payload.pagination.totalItems).toBe(1);
    });

    it('returns an empty list without error when there are no purchases', async () => {
      Purchase.find.mockReturnValue(createQueryMock([]));
      Purchase.countDocuments.mockResolvedValue(0);
      const req = mockReq({ query: {} });
      const res = mockRes();

      await buyerController.getMyPurchases(req, res);

      expect(res.json.mock.calls[0][0].data).toEqual([]);
    });

    it('returns 500 when the query throws', async () => {
      Purchase.find.mockImplementation(() => { throw new Error('bad'); });
      const req = mockReq({ query: {} });
      const res = mockRes();

      await buyerController.getMyPurchases(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getPurchaseDetails', () => {
    it('returns 404 when no matching completed purchase is found', async () => {
      Purchase.findOne.mockReturnValue(createQueryMock(null));
      const req = mockReq({ params: { purchaseId: 'p1' } });
      const res = mockRes();

      await buyerController.getPurchaseDetails(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns hydrated purchase details on success', async () => {
      const purchaseDoc = { toObject: () => ({ websiteId: null, sellerId: null }) };
      Purchase.findOne.mockReturnValue(createQueryMock(purchaseDoc));
      const req = mockReq({ params: { purchaseId: 'p1' } });
      const res = mockRes();

      await buyerController.getPurchaseDetails(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, data: { websiteId: null, sellerId: null } });
    });

    it('returns 500 when the lookup throws', async () => {
      Purchase.findOne.mockImplementation(() => { throw new Error('bad'); });
      const req = mockReq({ params: { purchaseId: 'p1' } });
      const res = mockRes();

      await buyerController.getPurchaseDetails(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
