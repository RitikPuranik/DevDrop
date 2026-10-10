jest.mock('../../../src/modules/user/user.model');
jest.mock('../../../src/modules/website/website.model');
jest.mock('../../../src/modules/payment/purchase.model');
jest.mock('../../../src/modules/payout/payout.model');
jest.mock('../../../src/modules/payment/payment.model');

const User = require('../../../src/modules/user/user.model');
const Website = require('../../../src/modules/website/website.model');
const Purchase = require('../../../src/modules/payment/purchase.model');
const analyticsService = require('../../../src/services/analytics.service');
const { createQueryMock } = require('../../helpers/mockQuery');

describe('analytics.service', () => {
  describe('getPlatformStats', () => {
    it('aggregates counts and revenue only from completed purchases', async () => {
      User.countDocuments = jest.fn().mockResolvedValue(42);
      Website.countDocuments = jest.fn().mockResolvedValue(17);
      Purchase.countDocuments = jest.fn().mockResolvedValue(9);
      Purchase.aggregate = jest.fn().mockResolvedValue([{ totalRevenue: 5000, totalPlatformFee: 500, totalTax: 300 }]);

      const stats = await analyticsService.getPlatformStats();

      expect(stats).toEqual({
        totalUsers: 42,
        totalWebsites: 17,
        totalPurchases: 9,
        totalRevenue: 5000,
        totalPlatformFee: 500,
        totalTax: 300,
      });
      // Only completed purchases count toward totals and revenue.
      expect(Purchase.countDocuments).toHaveBeenCalledWith({ paymentStatus: 'completed' });
      expect(Website.countDocuments).toHaveBeenCalledWith({ isDeleted: false });
      expect(Purchase.aggregate.mock.calls[0][0][0]).toEqual({ $match: { paymentStatus: 'completed' } });
    });

    it('defaults revenue fields to 0 when there are no completed purchases yet', async () => {
      User.countDocuments = jest.fn().mockResolvedValue(0);
      Website.countDocuments = jest.fn().mockResolvedValue(0);
      Purchase.countDocuments = jest.fn().mockResolvedValue(0);
      Purchase.aggregate = jest.fn().mockResolvedValue([]); // empty $group result

      const stats = await analyticsService.getPlatformStats();

      expect(stats).toEqual({
        totalUsers: 0,
        totalWebsites: 0,
        totalPurchases: 0,
        totalRevenue: 0,
        totalPlatformFee: 0,
        totalTax: 0,
      });
    });
  });

  describe('getWebsiteStats', () => {
    it('returns website breakdowns by status and by category, excluding deleted websites', async () => {
      Website.aggregate = jest
        .fn()
        .mockResolvedValueOnce([{ _id: 'approved', count: 5 }, { _id: 'pending_review', count: 2 }])
        .mockResolvedValueOnce([{ _id: 'free', count: 4 }, { _id: 'paid', count: 3 }]);

      const stats = await analyticsService.getWebsiteStats();

      expect(stats).toEqual({
        byStatus: [{ _id: 'approved', count: 5 }, { _id: 'pending_review', count: 2 }],
        byCategory: [{ _id: 'free', count: 4 }, { _id: 'paid', count: 3 }],
      });
      expect(Website.aggregate).toHaveBeenCalledTimes(2);
      expect(Website.aggregate.mock.calls[0][0][0]).toEqual({ $match: { isDeleted: false } });
      expect(Website.aggregate.mock.calls[1][0][0]).toEqual({ $match: { isDeleted: false } });
    });
  });

  describe('getSalesStats', () => {
    it('filters purchases within the requested period and returns them sorted by date', async () => {
      Purchase.aggregate = jest.fn().mockResolvedValue([
        { _id: '2026-08-01', count: 2, revenue: 400 },
        { _id: '2026-08-02', count: 1, revenue: 100 },
      ]);

      const result = await analyticsService.getSalesStats(7);

      expect(result).toEqual([
        { _id: '2026-08-01', count: 2, revenue: 400 },
        { _id: '2026-08-02', count: 1, revenue: 100 },
      ]);
      const pipeline = Purchase.aggregate.mock.calls[0][0];
      expect(pipeline[0].$match.paymentStatus).toBe('completed');
      expect(pipeline[0].$match.purchaseDate.$gte).toBeInstanceOf(Date);
      expect(pipeline[2]).toEqual({ $sort: { _id: 1 } });
    });

    it('defaults to a 30-day lookback window when no period is given', async () => {
      Purchase.aggregate = jest.fn().mockResolvedValue([]);

      await analyticsService.getSalesStats();

      const pipeline = Purchase.aggregate.mock.calls[0][0];
      const startDate = pipeline[0].$match.purchaseDate.$gte;
      const daysAgo = Math.round((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      expect(daysAgo).toBe(30);
    });
  });

  describe('getAllUser', () => {
    it('excludes sensitive fields from the returned user list', async () => {
      const select = jest.fn().mockReturnValue(createQueryMock([{ _id: 'u1', name: 'Alice' }]));
      User.find = jest.fn().mockReturnValue({ lean: jest.fn().mockReturnValue({ select }) });

      const users = await analyticsService.getAllUser();

      expect(users).toEqual([{ _id: 'u1', name: 'Alice' }]);
      expect(User.find).toHaveBeenCalledWith({});
      expect(select).toHaveBeenCalledWith(
        '-password -verificationToken -verificationTokenExpiry -resetPasswordToken -resetPasswordExpiry'
      );
    });
  });
});
