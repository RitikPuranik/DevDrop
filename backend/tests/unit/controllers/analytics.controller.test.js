jest.mock('../../../src/services/analytics.service');

const analyticsService = require('../../../src/services/analytics.service');
const analyticsController = require('../../../src/modules/analytics/analytics.controller');
const { mockReq, mockRes } = require('../../helpers/mockQuery');

describe('analytics.controller', () => {
  describe('getPlatformStats', () => {
    it('returns platform stats from the service', async () => {
      analyticsService.getPlatformStats = jest.fn().mockResolvedValue({ totalUsers: 5 });
      const req = mockReq();
      const res = mockRes();

      await analyticsController.getPlatformStats(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, data: { totalUsers: 5 } });
    });

    it('returns a 500 with the error message when the service throws', async () => {
      analyticsService.getPlatformStats = jest.fn().mockRejectedValue(new Error('db down'));
      const req = mockReq();
      const res = mockRes();

      await analyticsController.getPlatformStats(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Error fetching platform stats', error: 'db down' });
    });
  });

  describe('getWebsiteStats', () => {
    it('returns website stats from the service', async () => {
      analyticsService.getWebsiteStats = jest.fn().mockResolvedValue({ byStatus: [], byCategory: [] });
      const req = mockReq();
      const res = mockRes();

      await analyticsController.getWebsiteStats(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, data: { byStatus: [], byCategory: [] } });
    });

    it('returns a 500 when the service throws', async () => {
      analyticsService.getWebsiteStats = jest.fn().mockRejectedValue(new Error('agg failed'));
      const req = mockReq();
      const res = mockRes();

      await analyticsController.getWebsiteStats(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Error fetching website stats', error: 'agg failed' });
    });
  });

  describe('getSalesStats', () => {
    it('parses the period query param to an integer before calling the service', async () => {
      analyticsService.getSalesStats = jest.fn().mockResolvedValue([{ _id: '2026-08-01', count: 1, revenue: 10 }]);
      const req = mockReq({ query: { period: '14' } });
      const res = mockRes();

      await analyticsController.getSalesStats(req, res);

      expect(analyticsService.getSalesStats).toHaveBeenCalledWith(14);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ _id: '2026-08-01', count: 1, revenue: 10 }] });
    });

    it('defaults the period to 30 days when no query param is given', async () => {
      analyticsService.getSalesStats = jest.fn().mockResolvedValue([]);
      const req = mockReq();
      const res = mockRes();

      await analyticsController.getSalesStats(req, res);

      expect(analyticsService.getSalesStats).toHaveBeenCalledWith(30);
    });

    it('returns a 500 when the service throws', async () => {
      analyticsService.getSalesStats = jest.fn().mockRejectedValue(new Error('bad range'));
      const req = mockReq();
      const res = mockRes();

      await analyticsController.getSalesStats(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Error fetching sales stats', error: 'bad range' });
    });
  });

  describe('getAllUser', () => {
    it('returns the user list from the service', async () => {
      analyticsService.getAllUser = jest.fn().mockResolvedValue([{ _id: 'u1' }]);
      const req = mockReq();
      const res = mockRes();

      await analyticsController.getAllUser(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ _id: 'u1' }] });
    });

    it('returns a 500 when the service throws', async () => {
      analyticsService.getAllUser = jest.fn().mockRejectedValue(new Error('query failed'));
      const req = mockReq();
      const res = mockRes();

      await analyticsController.getAllUser(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Error fetching users', error: 'query failed' });
    });
  });

  describe('getPublicStats', () => {
    it('maps platform stats onto the public-facing field names', async () => {
      analyticsService.getPlatformStats = jest.fn().mockResolvedValue({ totalWebsites: 12, totalUsers: 8, totalPurchases: 3 });
      const req = mockReq();
      const res = mockRes();

      await analyticsController.getPublicStats(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { totalTemplates: 12, totalCreators: 8, totalDownloads: 3 },
      });
    });

    it('defaults each public stat field to 0 when the service returns nothing meaningful', async () => {
      analyticsService.getPlatformStats = jest.fn().mockResolvedValue({});
      const req = mockReq();
      const res = mockRes();

      await analyticsController.getPublicStats(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { totalTemplates: 0, totalCreators: 0, totalDownloads: 0 },
      });
    });

    it('returns a 500 when the service throws', async () => {
      analyticsService.getPlatformStats = jest.fn().mockRejectedValue(new Error('down'));
      const req = mockReq();
      const res = mockRes();

      await analyticsController.getPublicStats(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Error fetching public stats', error: 'down' });
    });
  });
});
