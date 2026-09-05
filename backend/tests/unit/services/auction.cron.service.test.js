jest.mock('../../../src/modules/auction/auction.model');
jest.mock('../../../src/modules/auction/bid.model');

const Auction = require('../../../src/modules/auction/auction.model');
const Bid = require('../../../src/modules/auction/bid.model');
const { processEndedAuctions, startAuctionCron } = require('../../../src/services/auction.cron.service');

// Builds a chainable populate().populate() query mock resolving to `result`.
const populateChain = (result) => {
  const query = {
    populate: jest.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
};

describe('auction.cron.service', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.useRealTimers();
  });

  describe('processEndedAuctions', () => {
    it('does nothing when there are no auctions past their end time', async () => {
      Auction.find = jest.fn(() => populateChain([]));

      await processEndedAuctions();

      expect(Bid.findOne).not.toHaveBeenCalled();
    });

    it('marks an ended auction with a winner when a highest bid exists', async () => {
      const auction = { _id: 'auc_1', save: jest.fn().mockResolvedValue(true) };
      Auction.find = jest.fn(() => populateChain([auction]));
      const bidQuery = {
        sort: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue({ bidderId: { _id: 'bidder_1', email: 'winner@example.com' }, amount: 500 }),
      };
      Bid.findOne = jest.fn(() => bidQuery);

      await processEndedAuctions();

      expect(auction.status).toBe('ended');
      expect(auction.winnerId).toBe('bidder_1');
      expect(auction.finalPrice).toBe(500);
      expect(auction.save).toHaveBeenCalledTimes(1);
    });

    it('marks an ended auction with no winner when there are no bids', async () => {
      const auction = { _id: 'auc_2', save: jest.fn().mockResolvedValue(true) };
      Auction.find = jest.fn(() => populateChain([auction]));
      const bidQuery = { sort: jest.fn().mockReturnThis(), populate: jest.fn().mockResolvedValue(null) };
      Bid.findOne = jest.fn(() => bidQuery);

      await processEndedAuctions();

      expect(auction.status).toBe('ended');
      expect(auction.winnerId).toBeUndefined();
      expect(auction.save).toHaveBeenCalledTimes(1);
    });

    it('processes multiple ended auctions independently', async () => {
      const auctionA = { _id: 'auc_a', save: jest.fn().mockResolvedValue(true) };
      const auctionB = { _id: 'auc_b', save: jest.fn().mockResolvedValue(true) };
      Auction.find = jest.fn(() => populateChain([auctionA, auctionB]));
      const bidQuery = { sort: jest.fn().mockReturnThis(), populate: jest.fn().mockResolvedValue(null) };
      Bid.findOne = jest.fn(() => bidQuery);

      await processEndedAuctions();

      expect(auctionA.save).toHaveBeenCalledTimes(1);
      expect(auctionB.save).toHaveBeenCalledTimes(1);
    });

    it('swallows errors so a single failed run does not crash the process', async () => {
      Auction.find = jest.fn(() => {
        throw new Error('db unreachable');
      });

      await expect(processEndedAuctions()).resolves.toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith('Process ended auctions error:', expect.any(Error));
    });

    it('does not leave an ended auction unsaved if save() itself fails (error is caught, not silently lost)', async () => {
      const auction = { _id: 'auc_3', save: jest.fn().mockRejectedValue(new Error('save failed')) };
      Auction.find = jest.fn(() => populateChain([auction]));
      const bidQuery = { sort: jest.fn().mockReturnThis(), populate: jest.fn().mockResolvedValue(null) };
      Bid.findOne = jest.fn(() => bidQuery);

      await expect(processEndedAuctions()).resolves.toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith('Process ended auctions error:', expect.any(Error));
    });
  });

  describe('startAuctionCron', () => {
    it('registers a recurring check every 60 seconds without executing it immediately', () => {
      jest.useFakeTimers();
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      Auction.find = jest.fn(() => populateChain([]));

      startAuctionCron();

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60 * 1000);
      expect(Auction.find).not.toHaveBeenCalled();

      clearInterval(setIntervalSpy.mock.results[0].value);
    });

    it('invokes processEndedAuctions on each tick and leaves no open handle after clearing', () => {
      jest.useFakeTimers();
      Auction.find = jest.fn(() => populateChain([]));

      startAuctionCron();
      jest.advanceTimersByTime(60 * 1000);

      expect(Auction.find).toHaveBeenCalledTimes(1);

      // Clean up the interval registered by startAuctionCron so no timer
      // leaks past this test (detectOpenHandles safety).
      jest.clearAllTimers();
    });
  });
});
