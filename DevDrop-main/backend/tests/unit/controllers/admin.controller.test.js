jest.mock('../../../src/modules/website/website.model');
jest.mock('../../../src/modules/payment/purchase.model');
jest.mock('../../../src/modules/payout/payout.model');
jest.mock('../../../src/modules/wishlist/wishlist.model');
jest.mock('../../../src/modules/asset/downloadLog.model');
jest.mock('../../../src/modules/payment/payment.model');
jest.mock('../../../src/modules/user/user.model');
jest.mock('../../../src/modules/auction/auction.model');
jest.mock('../../../src/modules/auction/bid.model');
jest.mock('../../../src/services/supabase.service');
jest.mock('../../../src/services/email.service');
jest.mock('../../../src/shared/utils/envHelper');

const Website = require('../../../src/modules/website/website.model');
const Purchase = require('../../../src/modules/payment/purchase.model');
const Payout = require('../../../src/modules/payout/payout.model');
const Wishlist = require('../../../src/modules/wishlist/wishlist.model');
const DownloadLog = require('../../../src/modules/asset/downloadLog.model');
const User = require('../../../src/modules/user/user.model');
const Auction = require('../../../src/modules/auction/auction.model');
const Bid = require('../../../src/modules/auction/bid.model');
const supabaseService = require('../../../src/services/supabase.service');
const emailService = require('../../../src/services/email.service');
const { getAuctionTimings } = require('../../../src/shared/utils/envHelper');
const adminController = require('../../../src/modules/admin/admin.controller');
const { createQueryMock, mockReq, mockRes } = require('../../helpers/mockQuery');

beforeEach(() => {
  getAuctionTimings.mockReturnValue({ bidWaitHours: 72, paymentHours: 72 });
  emailService.sendStatusUpdateEmail.mockResolvedValue(true);
  emailService.sendPayoutNotification.mockResolvedValue(true);
});

const filesWithSourceAndDocs = () => ({
  sourceCode: [{ originalname: 'src.zip' }],
  docs: [{ originalname: 'docs.pdf' }],
});

describe('admin.controller', () => {
  describe('getAllWebsites', () => {
    it('queries only non-deleted websites by default', async () => {
      Website.find.mockReturnValue(createQueryMock([]));
      Website.countDocuments.mockResolvedValue(0);
      const req = mockReq({ query: {} });
      const res = mockRes();

      await adminController.getAllWebsites(req, res);

      expect(Website.find).toHaveBeenCalledWith({ isDeleted: false });
      expect(res.json.mock.calls[0][0].success).toBe(true);
    });

    it('applies a status filter when a specific status is given', async () => {
      Website.find.mockReturnValue(createQueryMock([]));
      Website.countDocuments.mockResolvedValue(0);
      const req = mockReq({ query: { status: 'approved' } });
      const res = mockRes();

      await adminController.getAllWebsites(req, res);

      expect(Website.find).toHaveBeenCalledWith({ isDeleted: false, status: 'approved' });
    });

    it('ignores a status of "all"', async () => {
      Website.find.mockReturnValue(createQueryMock([]));
      Website.countDocuments.mockResolvedValue(0);
      const req = mockReq({ query: { status: 'all' } });
      const res = mockRes();

      await adminController.getAllWebsites(req, res);

      expect(Website.find).toHaveBeenCalledWith({ isDeleted: false });
    });

    it('returns 500 when the query fails', async () => {
      Website.find.mockImplementation(() => { throw new Error('db down'); });
      const req = mockReq({ query: {} });
      const res = mockRes();

      await adminController.getAllWebsites(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('createWebsite', () => {
    const validBody = {
      sellerEmail: 'seller@example.com',
      name: 'My Site',
      description: 'A site',
      deployedLink: 'https://example.com',
      category: 'paid',
      price: '500',
    };

    it('rejects invalid tech stack JSON', async () => {
      const req = mockReq({ body: { ...validBody, techStack: '{bad' }, files: filesWithSourceAndDocs() });
      const res = mockRes();

      await adminController.createWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/Tech stack/);
    });

    it('requires sellerEmail or sellerId', async () => {
      const req = mockReq({ body: { ...validBody, sellerEmail: undefined }, files: filesWithSourceAndDocs() });
      const res = mockRes();

      await adminController.createWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/sellerEmail or sellerId/);
    });

    it('requires name, description, and deployedLink', async () => {
      const req = mockReq({ body: { sellerEmail: 'a@b.com' }, files: filesWithSourceAndDocs() });
      const res = mockRes();

      await adminController.createWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/deployedLink/);
    });

    it('requires source code and docs files', async () => {
      const req = mockReq({ body: validBody, files: {} });
      const res = mockRes();

      await adminController.createWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/Source code/);
    });

    it('returns 404 when the resolved seller does not exist', async () => {
      User.findOne.mockResolvedValue(null);
      const req = mockReq({ body: validBody, files: filesWithSourceAndDocs() });
      const res = mockRes();

      await adminController.createWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('looks the seller up by sellerId when provided instead of email', async () => {
      User.findById.mockResolvedValue(null);
      const req = mockReq({ body: { ...validBody, sellerEmail: undefined, sellerId: 'seller-1' }, files: filesWithSourceAndDocs() });
      const res = mockRes();

      await adminController.createWebsite(req, res);

      expect(User.findById).toHaveBeenCalledWith('seller-1');
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('rejects an invalid category', async () => {
      User.findOne.mockResolvedValue({ _id: 'seller-1' });
      const req = mockReq({ body: { ...validBody, category: 'bogus' }, files: filesWithSourceAndDocs() });
      const res = mockRes();

      await adminController.createWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/Invalid category/);
    });

    it('rejects a free website with a non-zero price', async () => {
      User.findOne.mockResolvedValue({ _id: 'seller-1' });
      const req = mockReq({ body: { ...validBody, category: 'free', price: '10' }, files: filesWithSourceAndDocs() });
      const res = mockRes();

      await adminController.createWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/Free websites/);
    });

    it('rejects a paid website with a zero or negative price', async () => {
      User.findOne.mockResolvedValue({ _id: 'seller-1' });
      const req = mockReq({ body: { ...validBody, category: 'paid', price: '0' }, files: filesWithSourceAndDocs() });
      const res = mockRes();

      await adminController.createWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/Paid\/exclusive/);
    });

    it('rejects an invalid GitHub URL', async () => {
      User.findOne.mockResolvedValue({ _id: 'seller-1' });
      const req = mockReq({ body: { ...validBody, githubUrl: 'not-a-url' }, files: filesWithSourceAndDocs() });
      const res = mockRes();

      await adminController.createWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/GitHub URL/);
    });

    it('rejects an invalid preview URL', async () => {
      User.findOne.mockResolvedValue({ _id: 'seller-1' });
      const req = mockReq({ body: { ...validBody, previewUrl: 'nope' }, files: filesWithSourceAndDocs() });
      const res = mockRes();

      await adminController.createWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/preview URL/);
    });

    it('returns 500 when file upload to storage fails', async () => {
      User.findOne.mockResolvedValue({ _id: 'seller-1' });
      supabaseService.uploadSourceCode.mockRejectedValue(new Error('storage down'));
      const req = mockReq({ body: validBody, files: filesWithSourceAndDocs() });
      const res = mockRes();

      await adminController.createWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json.mock.calls[0][0].message).toMatch(/uploading files/);
    });

    it('creates a new website, uploads files, and emails the seller', async () => {
      const seller = { _id: 'seller-1', email: 'seller@example.com' };
      User.findOne.mockResolvedValue(seller);
      Website.findOne.mockResolvedValue(null);
      supabaseService.uploadSourceCode.mockResolvedValue({ path: 'src/path.zip' });
      supabaseService.uploadDocs.mockResolvedValue({ path: 'docs/path.pdf' });
      const saved = { save: jest.fn().mockResolvedValue(true) };
      Website.mockImplementation(() => saved);

      const req = mockReq({ body: validBody, files: filesWithSourceAndDocs() });
      const res = mockRes();

      await adminController.createWebsite(req, res);

      expect(saved.save).toHaveBeenCalled();
      expect(saved.status).toBe('approved');
      expect(saved.sourceCodeUrl).toBe('src/path.zip');
      expect(emailService.sendStatusUpdateEmail).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('reuses an existing website with the same name and seller instead of creating a new one', async () => {
      const seller = { _id: 'seller-1', email: 'seller@example.com' };
      User.findOne.mockResolvedValue(seller);
      const existing = { _id: 'w-existing', save: jest.fn().mockResolvedValue(true) };
      Website.findOne.mockResolvedValue(existing);
      supabaseService.uploadSourceCode.mockResolvedValue({ path: 'src/path.zip' });
      supabaseService.uploadDocs.mockResolvedValue({ path: 'docs/path.pdf' });

      const req = mockReq({ body: validBody, files: filesWithSourceAndDocs() });
      const res = mockRes();

      await adminController.createWebsite(req, res);

      expect(Website).not.toHaveBeenCalled();
      expect(existing.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('auto-creates an auction for an exclusive website', async () => {
      const seller = { _id: 'seller-1' };
      User.findOne.mockResolvedValue(seller);
      Website.findOne.mockResolvedValueOnce(null); // website lookup by name/seller
      supabaseService.uploadSourceCode.mockResolvedValue({ path: 'src/path.zip' });
      supabaseService.uploadDocs.mockResolvedValue({ path: 'docs/path.pdf' });
      const saved = { _id: 'w1', name: 'My Site', price: 500, save: jest.fn().mockResolvedValue(true) };
      Website.mockImplementation(() => saved);
      Auction.findOne.mockResolvedValue(null); // no existing auction for createExclusiveAuctionIfNeeded
      const auctionInstance = { save: jest.fn().mockResolvedValue(true) };
      Auction.mockImplementation(() => auctionInstance);

      const req = mockReq({ body: { ...validBody, category: 'exclusive', price: '5000' }, files: filesWithSourceAndDocs() });
      const res = mockRes();

      await adminController.createWebsite(req, res);

      expect(Auction).toHaveBeenCalled();
      expect(auctionInstance.save).toHaveBeenCalled();
    });
  });

  describe('requestChanges', () => {
    it('rejects a missing comment', async () => {
      const req = mockReq({ params: { id: 'w1' }, body: {} });
      const res = mockRes();

      await adminController.requestChanges(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(Website.findById).not.toHaveBeenCalled();
    });

    it('returns 404 when the website does not exist', async () => {
      Website.findById.mockReturnValue(createQueryMock(null));
      const req = mockReq({ params: { id: 'w1' }, body: { comment: 'fix this' } });
      const res = mockRes();

      await adminController.requestChanges(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('sets status to changes_requested and emails the seller', async () => {
      const website = { sellerId: { email: 'a@b.com' }, save: jest.fn().mockResolvedValue(true) };
      Website.findById.mockReturnValue(createQueryMock(website));
      const req = mockReq({ params: { id: 'w1' }, body: { comment: 'fix this' } });
      const res = mockRes();

      await adminController.requestChanges(req, res);

      expect(website.status).toBe('changes_requested');
      expect(website.adminComment).toBe('fix this');
      expect(website.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 500 when save fails', async () => {
      const website = { save: jest.fn().mockRejectedValue(new Error('x')) };
      Website.findById.mockReturnValue(createQueryMock(website));
      const req = mockReq({ params: { id: 'w1' }, body: { comment: 'fix this' } });
      const res = mockRes();

      await adminController.requestChanges(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('rejectWebsite', () => {
    it('rejects a missing reason', async () => {
      const req = mockReq({ params: { id: 'w1' }, body: {} });
      const res = mockRes();

      await adminController.rejectWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 404 when the website does not exist', async () => {
      Website.findById.mockReturnValue(createQueryMock(null));
      const req = mockReq({ params: { id: 'w1' }, body: { reason: 'low quality' } });
      const res = mockRes();

      await adminController.rejectWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('sets status to rejected with the given reason', async () => {
      const website = { sellerId: {}, save: jest.fn().mockResolvedValue(true) };
      Website.findById.mockReturnValue(createQueryMock(website));
      const req = mockReq({ params: { id: 'w1' }, body: { reason: 'low quality' } });
      const res = mockRes();

      await adminController.rejectWebsite(req, res);

      expect(website.status).toBe('rejected');
      expect(website.adminComment).toBe('low quality');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('approveWebsite', () => {
    const baseWebsite = () => ({
      _id: 'w1',
      sellerId: { email: 'a@b.com' },
      deployedUrl: 'https://existing.example.com',
      previewUrl: undefined,
      githubUrl: undefined,
      files: {},
      save: jest.fn().mockResolvedValue(true),
    });

    it('rejects invalid tech stack JSON', async () => {
      const req = mockReq({ params: { id: 'w1' }, body: { techStack: '{bad' }, files: filesWithSourceAndDocs() });
      const res = mockRes();

      await adminController.approveWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects an invalid category', async () => {
      const req = mockReq({ params: { id: 'w1' }, body: { category: 'bogus' }, files: filesWithSourceAndDocs() });
      const res = mockRes();

      await adminController.approveWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/Invalid category/);
    });

    it('rejects a non-numeric price', async () => {
      const req = mockReq({ params: { id: 'w1' }, body: { price: 'abc' }, files: filesWithSourceAndDocs() });
      const res = mockRes();

      await adminController.approveWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/Price must be a number/);
    });

    it('returns 404 when the website does not exist', async () => {
      Website.findById.mockReturnValue(createQueryMock(null));
      const req = mockReq({ params: { id: 'w1' }, body: {}, files: filesWithSourceAndDocs() });
      const res = mockRes();

      await adminController.approveWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('requires a deployed link when neither body nor existing record has one', async () => {
      const website = baseWebsite();
      website.deployedUrl = undefined;
      Website.findById.mockReturnValue(createQueryMock(website));
      const req = mockReq({ params: { id: 'w1' }, body: {}, files: filesWithSourceAndDocs() });
      const res = mockRes();

      await adminController.approveWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/Deployed link/);
    });

    it('rejects an invalid deployed link URL', async () => {
      const website = baseWebsite();
      Website.findById.mockReturnValue(createQueryMock(website));
      const req = mockReq({ params: { id: 'w1' }, body: { deployedLink: 'not-a-url' }, files: filesWithSourceAndDocs() });
      const res = mockRes();

      await adminController.approveWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/valid URL/);
    });

    it('rejects an invalid GitHub URL', async () => {
      const website = baseWebsite();
      Website.findById.mockReturnValue(createQueryMock(website));
      const req = mockReq({ params: { id: 'w1' }, body: { githubUrl: 'nope' }, files: filesWithSourceAndDocs() });
      const res = mockRes();

      await adminController.approveWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/GitHub URL/);
    });

    it('requires source code and docs files', async () => {
      const website = baseWebsite();
      Website.findById.mockReturnValue(createQueryMock(website));
      const req = mockReq({ params: { id: 'w1' }, body: {}, files: {} });
      const res = mockRes();

      await adminController.approveWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/Source code ZIP/);
    });

    it('returns 500 when file upload to storage fails', async () => {
      const website = baseWebsite();
      Website.findById.mockReturnValue(createQueryMock(website));
      supabaseService.uploadSourceCode.mockRejectedValue(new Error('storage down'));
      const req = mockReq({ params: { id: 'w1' }, body: {}, files: filesWithSourceAndDocs() });
      const res = mockRes();

      await adminController.approveWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('approves the website, updates fields, and emails the seller', async () => {
      const website = baseWebsite();
      Website.findById.mockReturnValue(createQueryMock(website));
      supabaseService.uploadSourceCode.mockResolvedValue({ path: 'src/path.zip' });
      supabaseService.uploadDocs.mockResolvedValue({ path: 'docs/path.pdf' });

      const req = mockReq({ params: { id: 'w1' }, body: { name: 'New Name' }, files: filesWithSourceAndDocs() });
      const res = mockRes();

      await adminController.approveWebsite(req, res);

      expect(website.status).toBe('approved');
      expect(website.name).toBe('New Name');
      expect(website.save).toHaveBeenCalled();
      expect(emailService.sendStatusUpdateEmail).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('auto-creates an auction when approved as exclusive', async () => {
      const website = baseWebsite();
      website.price = 5000;
      Website.findById.mockReturnValue(createQueryMock(website));
      supabaseService.uploadSourceCode.mockResolvedValue({ path: 'src/path.zip' });
      supabaseService.uploadDocs.mockResolvedValue({ path: 'docs/path.pdf' });
      Auction.findOne.mockResolvedValue(null);
      const auctionInstance = { save: jest.fn().mockResolvedValue(true) };
      Auction.mockImplementation(() => auctionInstance);

      const req = mockReq({ params: { id: 'w1' }, body: { category: 'exclusive' }, files: filesWithSourceAndDocs() });
      const res = mockRes();

      await adminController.approveWebsite(req, res);

      expect(Auction).toHaveBeenCalled();
      expect(auctionInstance.save).toHaveBeenCalled();
    });
  });

  describe('relistWebsite', () => {
    it('returns 404 when the website does not exist', async () => {
      Website.findById.mockReturnValue(createQueryMock(null));
      const req = mockReq({ params: { id: 'w1' } });
      const res = mockRes();

      await adminController.relistWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('rejects non-exclusive websites', async () => {
      Website.findById.mockReturnValue(createQueryMock({ category: 'paid' }));
      const req = mockReq({ params: { id: 'w1' } });
      const res = mockRes();

      await adminController.relistWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/exclusive websites/);
    });

    it('resets an existing auction and expires outstanding bids', async () => {
      const website = {
        _id: 'w1',
        category: 'exclusive',
        sellerId: { email: 'a@b.com' },
        save: jest.fn().mockResolvedValue(true),
      };
      Website.findById.mockReturnValue(createQueryMock(website));
      const auction = {
        currentBidderId: 'bidder-1',
        currentBidAmount: 1000,
        attemptNumber: 1,
        save: jest.fn().mockResolvedValue(true),
      };
      Auction.findOne.mockResolvedValue(auction);
      Bid.updateMany.mockResolvedValue({ modifiedCount: 2 });

      const req = mockReq({ params: { id: 'w1' } });
      const res = mockRes();

      await adminController.relistWebsite(req, res);

      expect(auction.previousAttempts).toHaveLength(1);
      expect(auction.attemptNumber).toBe(2);
      expect(auction.status).toBe('active');
      expect(auction.save).toHaveBeenCalled();
      expect(Bid.updateMany).toHaveBeenCalledWith(
        { websiteId: 'w1', status: { $ne: 'expired' } },
        { $set: { status: 'expired' } }
      );
      expect(website.status).toBe('approved');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('creates a fresh auction when none exists yet', async () => {
      const website = {
        _id: 'w1',
        category: 'exclusive',
        sellerId: {},
        price: 2000,
        save: jest.fn().mockResolvedValue(true),
      };
      Website.findById.mockReturnValue(createQueryMock(website));
      Auction.findOne.mockResolvedValue(null);
      Bid.updateMany.mockResolvedValue({ modifiedCount: 0 });
      const newAuction = { save: jest.fn().mockResolvedValue(true) };
      Auction.mockImplementation(() => newAuction);

      const req = mockReq({ params: { id: 'w1' } });
      const res = mockRes();

      await adminController.relistWebsite(req, res);

      expect(Auction).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('still succeeds when the relist notification email fails', async () => {
      const website = {
        _id: 'w1',
        category: 'exclusive',
        sellerId: {},
        save: jest.fn().mockResolvedValue(true),
      };
      Website.findById.mockReturnValue(createQueryMock(website));
      Auction.findOne.mockResolvedValue(null);
      Bid.updateMany.mockResolvedValue({ modifiedCount: 0 });
      const newAuction = { save: jest.fn().mockResolvedValue(true) };
      Auction.mockImplementation(() => newAuction);
      emailService.sendStatusUpdateEmail.mockRejectedValue(new Error('smtp down'));

      const req = mockReq({ params: { id: 'w1' } });
      const res = mockRes();

      await adminController.relistWebsite(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 500 on unexpected failure', async () => {
      Website.findById.mockImplementation(() => { throw new Error('db down'); });
      const req = mockReq({ params: { id: 'w1' } });
      const res = mockRes();

      await adminController.relistWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('deleteWebsite', () => {
    it('returns 404 when the website does not exist', async () => {
      Website.findById.mockResolvedValue(null);
      const req = mockReq({ params: { id: 'w1' } });
      const res = mockRes();

      await adminController.deleteWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('cascades deletes across related collections', async () => {
      Website.findById.mockResolvedValue({ _id: 'w1' });
      Website.findByIdAndDelete.mockResolvedValue(true);
      Purchase.deleteMany.mockResolvedValue({ deletedCount: 1 });
      Wishlist.deleteMany.mockResolvedValue({ deletedCount: 1 });
      DownloadLog.deleteMany.mockResolvedValue({ deletedCount: 1 });
      supabaseService.deleteWebsiteFiles.mockResolvedValue(true);

      const req = mockReq({ params: { id: 'w1' } });
      const res = mockRes();

      await adminController.deleteWebsite(req, res);

      expect(Website.findByIdAndDelete).toHaveBeenCalledWith('w1');
      expect(Purchase.deleteMany).toHaveBeenCalledWith({ websiteId: 'w1', paymentStatus: { $ne: 'completed' } });
      expect(Wishlist.deleteMany).toHaveBeenCalledWith({ websiteId: 'w1' });
      expect(DownloadLog.deleteMany).toHaveBeenCalledWith({ websiteId: 'w1' });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('continues deleting the database record even if storage deletion fails', async () => {
      Website.findById.mockResolvedValue({ _id: 'w1' });
      supabaseService.deleteWebsiteFiles.mockRejectedValue(new Error('storage down'));
      Website.findByIdAndDelete.mockResolvedValue(true);
      Purchase.deleteMany.mockResolvedValue({});
      Wishlist.deleteMany.mockResolvedValue({});
      DownloadLog.deleteMany.mockResolvedValue({});

      const req = mockReq({ params: { id: 'w1' } });
      const res = mockRes();

      await adminController.deleteWebsite(req, res);

      expect(Website.findByIdAndDelete).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 500 on unexpected failure', async () => {
      Website.findById.mockImplementation(() => { throw new Error('db down'); });
      const req = mockReq({ params: { id: 'w1' } });
      const res = mockRes();

      await adminController.deleteWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getDashboard', () => {
    it('applies zero-defaults when there is no revenue or payout data yet', async () => {
      User.countDocuments.mockResolvedValue(0);
      Website.aggregate.mockResolvedValue([]);
      Purchase.aggregate.mockResolvedValue([]);
      Payout.aggregate.mockResolvedValue([]);
      Purchase.find.mockReturnValue(createQueryMock([]));

      const req = mockReq();
      const res = mockRes();

      await adminController.getDashboard(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.data.revenue.totalGrossRevenue).toBe(0);
      expect(payload.data.pendingPayouts).toEqual({ amount: 0, count: 0 });
    });

    it('maps website status aggregation counts and computes admin revenue', async () => {
      User.countDocuments.mockResolvedValue(10);
      Website.aggregate.mockResolvedValue([{ _id: 'approved', count: 3 }, { _id: 'rejected', count: 1 }]);
      Purchase.aggregate.mockResolvedValue([{
        totalPlatformFees: 500, totalTaxCollected: 90, totalSellerPayments: 4000,
        totalGrossRevenue: 4590, totalDiscounts: 0, totalTransactions: 5,
      }]);
      Payout.aggregate.mockResolvedValue([{ totalAmount: 1000, count: 2 }]);
      Purchase.find.mockReturnValue(createQueryMock([{ _id: 'p1' }]));

      const req = mockReq();
      const res = mockRes();

      await adminController.getDashboard(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.data.websites).toEqual({ approved: 3, rejected: 1 });
      expect(payload.data.revenue.totalAdminRevenue).toBe(590);
      expect(payload.data.pendingPayouts).toEqual({ amount: 1000, count: 2 });
    });

    it('returns 500 on aggregation failure', async () => {
      User.countDocuments.mockRejectedValue(new Error('down'));
      const req = mockReq();
      const res = mockRes();

      await adminController.getDashboard(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getPendingPayouts', () => {
    it('attaches a UPI payout link to each pending payout', async () => {
      const payout = {
        toObject: () => ({ _id: 'p1', amount: 500 }),
        bankDetails: { upiId: 'seller@upi', accountHolderName: 'Sam' },
        amount: 500,
        websiteId: { name: 'Cool Site' },
        sellerId: { email: 'sam@example.com' },
      };
      Payout.find.mockReturnValue(createQueryMock([payout]));
      Payout.countDocuments.mockResolvedValue(1);

      const req = mockReq({ query: {} });
      const res = mockRes();

      await adminController.getPendingPayouts(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.data[0].upiPayoutLink).toContain('upi://pay');
      expect(payload.pagination.totalItems).toBe(1);
    });

    it('returns null links when bank details are incomplete', async () => {
      const payout = {
        toObject: () => ({ _id: 'p1' }),
        bankDetails: {},
        amount: 500,
        websiteId: {},
        sellerId: { email: 'sam@example.com' },
      };
      Payout.find.mockReturnValue(createQueryMock([payout]));
      Payout.countDocuments.mockResolvedValue(1);

      const req = mockReq({ query: {} });
      const res = mockRes();

      await adminController.getPendingPayouts(req, res);

      expect(res.json.mock.calls[0][0].data[0].upiPayoutLink).toBeNull();
    });

    it('returns 500 on failure', async () => {
      Payout.find.mockImplementation(() => { throw new Error('down'); });
      const req = mockReq({ query: {} });
      const res = mockRes();

      await adminController.getPendingPayouts(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('processPayout', () => {
    it('requires a UTR', async () => {
      const req = mockReq({ params: { id: 'p1' }, body: {} });
      const res = mockRes();

      await adminController.processPayout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(Payout.findById).not.toHaveBeenCalled();
    });

    it('returns 404 when the payout does not exist', async () => {
      Payout.findById.mockReturnValue(createQueryMock(null));
      const req = mockReq({ params: { id: 'p1' }, body: { utr: 'UTR1' } });
      const res = mockRes();

      await adminController.processPayout(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('rejects processing a payout that is not pending', async () => {
      Payout.findById.mockReturnValue(createQueryMock({ status: 'completed' }));
      const req = mockReq({ params: { id: 'p1' }, body: { utr: 'UTR1' } });
      const res = mockRes();

      await adminController.processPayout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/Only pending payouts/);
    });

    it('marks a pending payout completed, stamps the processing admin, and emails the seller', async () => {
      const payout = { status: 'pending', sellerId: { email: 'sam@example.com' }, save: jest.fn().mockResolvedValue(true) };
      Payout.findById.mockReturnValue(createQueryMock(payout));
      const req = mockReq({ params: { id: 'p1' }, body: { utr: 'UTR1', adminNotes: 'paid manually' }, userId: 'admin-1' });
      const res = mockRes();

      await adminController.processPayout(req, res);

      expect(payout.status).toBe('completed');
      expect(payout.utr).toBe('UTR1');
      expect(payout.processedBy).toBe('admin-1');
      expect(payout.adminNotes).toBe('paid manually');
      expect(emailService.sendPayoutNotification).toHaveBeenCalledWith(payout.sellerId, payout);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('still succeeds when the payout notification email fails', async () => {
      const payout = { status: 'pending', sellerId: {}, save: jest.fn().mockResolvedValue(true) };
      Payout.findById.mockReturnValue(createQueryMock(payout));
      emailService.sendPayoutNotification.mockRejectedValue(new Error('smtp down'));
      const req = mockReq({ params: { id: 'p1' }, body: { utr: 'UTR1' } });
      const res = mockRes();

      await adminController.processPayout(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 500 when save fails', async () => {
      const payout = { status: 'pending', save: jest.fn().mockRejectedValue(new Error('x')) };
      Payout.findById.mockReturnValue(createQueryMock(payout));
      const req = mockReq({ params: { id: 'p1' }, body: { utr: 'UTR1' } });
      const res = mockRes();

      await adminController.processPayout(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
