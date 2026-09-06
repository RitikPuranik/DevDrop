jest.mock('../../../src/modules/auction/auction.model');
jest.mock('../../../src/modules/auction/bid.model');
jest.mock('../../../src/modules/website/website.model');
jest.mock('../../../src/modules/user/user.model');
jest.mock('../../../src/services/email.service');
jest.mock('../../../src/services/supabase.service');
jest.mock('../../../src/shared/utils/envHelper');

const Auction = require('../../../src/modules/auction/auction.model');
const Bid = require('../../../src/modules/auction/bid.model');
const Website = require('../../../src/modules/website/website.model');
const User = require('../../../src/modules/user/user.model');
const emailService = require('../../../src/services/email.service');
const { getAuctionTimings } = require('../../../src/shared/utils/envHelper');
const auctionController = require('../../../src/modules/auction/auction.controller');
const { createQueryMock, mockReq, mockRes } = require('../../helpers/mockQuery');

beforeEach(() => {
  getAuctionTimings.mockReturnValue({ bidWaitHours: 72, paymentHours: 72 });
});

describe('auction.controller', () => {
  describe('startAuction', () => {
    it('returns 404 when the website does not exist', async () => {
      Website.findById.mockResolvedValue(null);
      const req = mockReq({ params: { websiteId: 'w1' }, body: {} });
      const res = mockRes();

      await auctionController.startAuction(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('rejects a non-exclusive website', async () => {
      Website.findById.mockResolvedValue({ category: 'paid' });
      const req = mockReq({ params: { websiteId: 'w1' }, body: {} });
      const res = mockRes();

      await auctionController.startAuction(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/exclusive/);
    });

    it('rejects starting a second auction for a website already in one', async () => {
      Website.findById.mockResolvedValue({ category: 'exclusive', price: 1000 });
      Auction.findOne.mockResolvedValue({ _id: 'existing' });
      const req = mockReq({ params: { websiteId: 'w1' }, body: {} });
      const res = mockRes();

      await auctionController.startAuction(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/already in auction/);
    });

    it('creates the auction and flips the website into in_auction status', async () => {
      const website = { category: 'exclusive', price: 1000, save: jest.fn().mockResolvedValue(true) };
      Website.findById.mockResolvedValue(website);
      Auction.findOne.mockResolvedValue(null);
      const saved = { _id: 'a1', save: jest.fn().mockResolvedValue(true) };
      Auction.mockImplementation(() => saved);

      const req = mockReq({ params: { websiteId: 'w1' }, body: { startingPrice: 500, reservePrice: 2000 } });
      const res = mockRes();

      await auctionController.startAuction(req, res);

      expect(saved.save).toHaveBeenCalled();
      expect(website.status).toBe('in_auction');
      expect(website.auctionId).toBe('a1');
      expect(website.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('falls back to the website price when no startingPrice is given', async () => {
      const website = { category: 'exclusive', price: 750, save: jest.fn().mockResolvedValue(true) };
      Website.findById.mockResolvedValue(website);
      Auction.findOne.mockResolvedValue(null);
      let constructedWith;
      const saved = { _id: 'a1', save: jest.fn().mockResolvedValue(true) };
      Auction.mockImplementation((fields) => { constructedWith = fields; return saved; });

      const req = mockReq({ params: { websiteId: 'w1' }, body: {} });
      const res = mockRes();

      await auctionController.startAuction(req, res);

      expect(constructedWith.startingPrice).toBe(750);
    });

    it('returns 500 on unexpected error', async () => {
      Website.findById.mockRejectedValue(new Error('db down'));
      const req = mockReq({ params: { websiteId: 'w1' }, body: {} });
      const res = mockRes();

      await auctionController.startAuction(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('placeBid', () => {
    const makeAuction = (overrides = {}) => ({
      startingPrice: 1000,
      currentBidAmount: 0,
      minimumBidIncrement: 100,
      totalBids: 0,
      uniqueBidders: 0,
      reservePrice: 0,
      websiteId: { sellerId: { toString: () => 'seller-1' } },
      save: jest.fn().mockResolvedValue(true),
      populate: jest.fn().mockResolvedValue(true),
      ...overrides,
    });

    it('returns 404 when there is no active auction', async () => {
      Auction.findOne.mockReturnValue(createQueryMock(null));
      const req = mockReq({ params: { websiteId: 'w1' }, body: { bidAmount: 1000 } });
      const res = mockRes();

      await auctionController.placeBid(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('rejects a bid below the minimum (starting price when no current bid)', async () => {
      Auction.findOne.mockReturnValue(createQueryMock(makeAuction()));
      const req = mockReq({ params: { websiteId: 'w1' }, body: { bidAmount: 500 } });
      const res = mockRes();

      await auctionController.placeBid(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].minimumBid).toBe(1000);
    });

    it('rejects a bid below current bid + increment', async () => {
      Auction.findOne.mockReturnValue(createQueryMock(makeAuction({ currentBidAmount: 1000 })));
      const req = mockReq({ params: { websiteId: 'w1' }, body: { bidAmount: 1050 } });
      const res = mockRes();

      await auctionController.placeBid(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].minimumBid).toBe(1100);
    });

    it('blocks the seller from bidding on their own website', async () => {
      Auction.findOne.mockReturnValue(createQueryMock(makeAuction()));
      const req = mockReq({ params: { websiteId: 'w1' }, body: { bidAmount: 1000 }, userId: 'seller-1' });
      const res = mockRes();

      await auctionController.placeBid(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/Sellers cannot bid/);
    });

    it('blocks the current highest bidder from bidding again', async () => {
      Auction.findOne.mockReturnValue(createQueryMock(makeAuction({
        currentBidAmount: 1000,
        currentBidderId: { toString: () => 'bidder-1' },
      })));
      const req = mockReq({ params: { websiteId: 'w1' }, body: { bidAmount: 1200 }, userId: 'bidder-1' });
      const res = mockRes();

      await auctionController.placeBid(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/already the highest bidder/);
    });

    it('places a first bid, moving the auction into first_bid_waiting', async () => {
      const auction = makeAuction();
      Auction.findOne.mockReturnValue(createQueryMock(auction));
      Bid.distinct.mockResolvedValue(['bidder-1']);
      const savedBid = { _id: 'bid1', save: jest.fn().mockResolvedValue(true), populate: jest.fn().mockResolvedValue(true) };
      Bid.mockImplementation(() => savedBid);

      const req = mockReq({ params: { websiteId: 'w1' }, body: { bidAmount: 1000 }, userId: 'bidder-1' });
      const res = mockRes();

      await auctionController.placeBid(req, res);

      expect(auction.status).toBe('first_bid_waiting');
      expect(auction.totalBids).toBe(1);
      expect(auction.uniqueBidders).toBe(1);
      expect(Bid.updateOne).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json.mock.calls[0][0].message).toMatch(/First bid placed/);
    });

    it('marks the reserve met when a subsequent bid clears reservePrice, and notifies the outbid bidder', async () => {
      const auction = makeAuction({
        currentBidAmount: 1000,
        currentBidId: 'oldbid',
        currentBidderId: 'previous-bidder',
        reservePrice: 1500,
        firstBidPlacedAt: new Date(),
        firstBidWaitingPeriodHours: 72,
      });
      Auction.findOne.mockReturnValue(createQueryMock(auction));
      Bid.distinct.mockResolvedValue(['previous-bidder', 'new-bidder']);
      const savedBid = { _id: 'bid2', save: jest.fn().mockResolvedValue(true), populate: jest.fn().mockResolvedValue(true) };
      Bid.mockImplementation(() => savedBid);
      User.findById.mockResolvedValue({ _id: 'previous-bidder', email: 'prev@example.com' });
      emailService.sendOutbidNotification.mockResolvedValue(true);

      const req = mockReq({ params: { websiteId: 'w1' }, body: { bidAmount: 1600 }, userId: 'new-bidder' });
      const res = mockRes();

      await auctionController.placeBid(req, res);

      expect(Bid.updateOne).toHaveBeenCalledWith({ _id: 'oldbid' }, { $set: { status: 'outbid' } });
      expect(auction.reserveMet).toBe(true);
      expect(res.json.mock.calls[0][0].message).toMatch(/timer reset/);
    });

    it('returns 500 when the auction lookup throws', async () => {
      Auction.findOne.mockImplementation(() => { throw new Error('down'); });
      const req = mockReq({ params: { websiteId: 'w1' }, body: { bidAmount: 100 } });
      const res = mockRes();

      await auctionController.placeBid(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getMyBids', () => {
    it('reports auction status and winning flag for each bid', async () => {
      const bidDoc = {
        _id: 'bid1',
        websiteId: { _id: 'w1' },
        toObject: () => ({ _id: 'bid1', websiteId: { _id: 'w1' } }),
      };
      Bid.find.mockReturnValue(createQueryMock([bidDoc]));
      Bid.countDocuments.mockResolvedValue(1);
      Auction.findOne.mockResolvedValue({ status: 'first_bid_waiting', currentBidId: { toString: () => 'bid1' } });

      const req = mockReq({ query: {} });
      const res = mockRes();

      await auctionController.getMyBids(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.data[0].auctionStatus).toBe('first_bid_waiting');
      expect(payload.data[0].isWinning).toBe(true);
    });

    it('reports "unknown" status when the auction no longer exists', async () => {
      const bidDoc = { _id: 'bid1', websiteId: { _id: 'w1' }, toObject: () => ({ _id: 'bid1' }) };
      Bid.find.mockReturnValue(createQueryMock([bidDoc]));
      Bid.countDocuments.mockResolvedValue(1);
      Auction.findOne.mockResolvedValue(null);

      const req = mockReq({ query: {} });
      const res = mockRes();

      await auctionController.getMyBids(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.data[0].auctionStatus).toBe('unknown');
      expect(payload.data[0].isWinning).toBe(false);
    });

    it('returns 500 on failure', async () => {
      Bid.find.mockImplementation(() => { throw new Error('down'); });
      const req = mockReq({ query: {} });
      const res = mockRes();

      await auctionController.getMyBids(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('reopenAuction', () => {
    it('returns 404 when the auction does not exist', async () => {
      Auction.findById.mockReturnValue(createQueryMock(null));
      const req = mockReq({ params: { auctionId: 'a1' } });
      const res = mockRes();

      await auctionController.reopenAuction(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('rejects reopening an auction that has not failed payment', async () => {
      Auction.findById.mockReturnValue(createQueryMock({ status: 'active' }));
      const req = mockReq({ params: { auctionId: 'a1' } });
      const res = mockRes();

      await auctionController.reopenAuction(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('resets a payment_failed auction back to active and expires old bids', async () => {
      const website = { _id: 'w1', save: jest.fn().mockResolvedValue(true) };
      const auction = {
        status: 'payment_failed',
        previousAttempts: [],
        attemptNumber: 1,
        currentBidderId: 'bidder-1',
        currentBidAmount: 900,
        websiteId: website,
        save: jest.fn().mockResolvedValue(true),
      };
      Auction.findById.mockReturnValue(createQueryMock(auction));

      const req = mockReq({ params: { auctionId: 'a1' } });
      const res = mockRes();

      await auctionController.reopenAuction(req, res);

      expect(auction.status).toBe('active');
      expect(auction.attemptNumber).toBe(2);
      expect(auction.previousAttempts).toHaveLength(1);
      expect(website.status).toBe('in_auction');
      expect(Bid.updateMany).toHaveBeenCalledWith({ websiteId: 'w1' }, { $set: { status: 'expired' } });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 500 on failure', async () => {
      Auction.findById.mockImplementation(() => { throw new Error('down'); });
      const req = mockReq({ params: { auctionId: 'a1' } });
      const res = mockRes();

      await auctionController.reopenAuction(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getActiveAuctions', () => {
    it('lists active/first_bid_waiting auctions with pagination', async () => {
      Auction.find.mockReturnValue(createQueryMock([
        { status: 'active', toObject: () => ({ status: 'active' }) },
      ]));
      Auction.countDocuments.mockResolvedValue(1);

      const req = mockReq({ query: {} });
      const res = mockRes();

      await auctionController.getActiveAuctions(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.data[0].timeInfo).toBe('No bids yet');
      expect(payload.pagination.totalItems).toBe(1);
    });

    it('computes hours-remaining messaging for auctions in first_bid_waiting', async () => {
      const future = new Date(Date.now() + 10 * 60 * 60 * 1000);
      Auction.find.mockReturnValue(createQueryMock([
        {
          status: 'first_bid_waiting',
          firstBidPlacedAt: new Date(),
          firstBidDeadline: future,
          toObject: () => ({ status: 'first_bid_waiting' }),
        },
      ]));
      Auction.countDocuments.mockResolvedValue(1);

      const req = mockReq({ query: {} });
      const res = mockRes();

      await auctionController.getActiveAuctions(req, res);

      expect(res.json.mock.calls[0][0].data[0].timeInfo).toMatch(/hours left to outbid/);
    });

    it('returns 500 on failure', async () => {
      Auction.find.mockImplementation(() => { throw new Error('down'); });
      const req = mockReq({ query: {} });
      const res = mockRes();

      await auctionController.getActiveAuctions(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('endAuction', () => {
    it('returns 404 when the auction does not exist', async () => {
      Auction.findById.mockResolvedValue(null);
      const req = mockReq({ params: { auctionId: 'a1' } });
      const res = mockRes();

      await auctionController.endAuction(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('rejects ending an auction not in first_bid_waiting', async () => {
      Auction.findById.mockResolvedValue({ status: 'active' });
      const req = mockReq({ params: { auctionId: 'a1' } });
      const res = mockRes();

      await auctionController.endAuction(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('declares the winner and moves the auction to awaiting_payment', async () => {
      const auction = {
        status: 'first_bid_waiting',
        currentBidderId: 'bidder-1',
        currentBidAmount: 5000,
        save: jest.fn().mockResolvedValue(true),
      };
      Auction.findById.mockResolvedValue(auction);
      const req = mockReq({ params: { auctionId: 'a1' } });
      const res = mockRes();

      await auctionController.endAuction(req, res);

      expect(auction.status).toBe('awaiting_payment');
      expect(auction.paymentDeadline).toBeInstanceOf(Date);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, winner: 'bidder-1', amount: 5000 }));
    });

    it('returns 500 on failure', async () => {
      Auction.findById.mockRejectedValue(new Error('down'));
      const req = mockReq({ params: { auctionId: 'a1' } });
      const res = mockRes();

      await auctionController.endAuction(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getAuction', () => {
    const baseAuction = (overrides = {}) => ({
      status: 'active',
      currentBidAmount: 0,
      minimumBidIncrement: 100,
      startingPrice: 1000,
      totalBids: 0,
      previousAttempts: [],
      attemptNumber: 1,
      websiteId: { _id: 'w1' },
      toObject: () => ({ status: overrides.status || 'active' }),
      save: jest.fn().mockResolvedValue(true),
      ...overrides,
    });

    it('returns 404 when there is no auction for the website', async () => {
      Auction.findOne.mockReturnValue(createQueryMock(null));
      const req = mockReq({ params: { websiteId: 'w1' } });
      const res = mockRes();

      await auctionController.getAuction(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns auction details with bid history for a simple active auction', async () => {
      Auction.findOne.mockReturnValue(createQueryMock(baseAuction()));
      Bid.find.mockReturnValue(createQueryMock([]));

      const req = mockReq({ params: { websiteId: 'w1' } });
      const res = mockRes();

      await auctionController.getAuction(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.data.bids).toEqual([]);
      expect(payload.data.howItWorks.current).toBe('Waiting for first bid');
    });

    it('resolves a bidder avatar storage path to a signed URL', async () => {
      Auction.findOne.mockReturnValue(createQueryMock(baseAuction()));
      const bidDoc = {
        toObject: () => ({ bidAmount: 500, bidderId: { name: 'Bidder', avatar: 'avatars/b.png' } }),
      };
      Bid.find.mockReturnValue(createQueryMock([bidDoc]));
      const supabaseService = require('../../../src/services/supabase.service');
      supabaseService.createSignedUrl.mockResolvedValue('https://signed/b.png');

      const req = mockReq({ params: { websiteId: 'w1' } });
      const res = mockRes();

      await auctionController.getAuction(req, res);

      expect(res.json.mock.calls[0][0].data.bids[0].bidderId.avatar).toBe('https://signed/b.png');
    });

    it('auto-transitions to awaiting_payment once the first-bid waiting window has passed', async () => {
      const auction = baseAuction({
        status: 'first_bid_waiting',
        firstBidPlacedAt: new Date(Date.now() - 1000 * 60 * 60 * 100),
        firstBidDeadline: new Date(Date.now() - 1000),
        hasFirstBidWaitingPassed: () => true,
      });
      Auction.findOne.mockReturnValue(createQueryMock(auction));
      Bid.find.mockReturnValue(createQueryMock([]));

      const req = mockReq({ params: { websiteId: 'w1' } });
      const res = mockRes();

      await auctionController.getAuction(req, res);

      expect(auction.status).toBe('awaiting_payment');
      expect(auction.save).toHaveBeenCalled();
    });

    it('resets the auction to active and expires bids once the payment deadline has passed', async () => {
      const website = { _id: 'w1' };
      const auction = baseAuction({
        status: 'awaiting_payment',
        websiteId: website,
        paymentDeadline: new Date(Date.now() - 1000),
        hasPaymentDeadlinePassed: () => true,
        previousAttempts: [],
        attemptNumber: 1,
      });
      Auction.findOne.mockReturnValue(createQueryMock(auction));
      Bid.find.mockReturnValue(createQueryMock([]));

      const req = mockReq({ params: { websiteId: 'w1' } });
      const res = mockRes();

      await auctionController.getAuction(req, res);

      expect(auction.status).toBe('active');
      expect(auction.attemptNumber).toBe(2);
      expect(Bid.updateMany).toHaveBeenCalled();
    });

    it('returns 500 when the lookup throws', async () => {
      Auction.findOne.mockImplementation(() => { throw new Error('down'); });
      const req = mockReq({ params: { websiteId: 'w1' } });
      const res = mockRes();

      await auctionController.getAuction(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
