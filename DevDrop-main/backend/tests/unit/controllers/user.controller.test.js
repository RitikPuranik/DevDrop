jest.mock('../../../src/modules/user/user.model');
jest.mock('../../../src/modules/user/bankDetails.model');
jest.mock('../../../src/modules/website/website.model');
jest.mock('../../../src/modules/payment/purchase.model');
jest.mock('../../../src/modules/payout/payout.model');
jest.mock('../../../src/modules/wishlist/wishlist.model');
jest.mock('../../../src/services/supabase.service');

const User = require('../../../src/modules/user/user.model');
const BankDetails = require('../../../src/modules/user/bankDetails.model');
const Website = require('../../../src/modules/website/website.model');
const Purchase = require('../../../src/modules/payment/purchase.model');
const Payout = require('../../../src/modules/payout/payout.model');
const Wishlist = require('../../../src/modules/wishlist/wishlist.model');
const supabaseService = require('../../../src/services/supabase.service');
const userController = require('../../../src/modules/user/user.controller');
const { createQueryMock, mockReq, mockRes } = require('../../helpers/mockQuery');

describe('user.controller', () => {
  describe('getProfile', () => {
    it('returns the profile with a resolved avatar URL and bank-details flag', async () => {
      BankDetails.findOne.mockResolvedValue({ upiId: 'a@upi' });
      supabaseService.createSignedUrl.mockResolvedValue('https://signed/avatar.png');

      const req = mockReq({
        user: { _id: 'u1', name: 'Ann', phone: '9999999999', email: 'ann@example.com', role: 'user', isVerified: true, avatar: 'avatars/a.png', createdAt: new Date('2024-01-01') },
      });
      const res = mockRes();

      await userController.getProfile(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          user: expect.objectContaining({ id: 'u1', name: 'Ann', avatar: 'https://signed/avatar.png' }),
          hasBankDetails: true,
        }),
      }));
    });

    it('reports hasBankDetails: false and null avatar when there is no avatar or bank details', async () => {
      BankDetails.findOne.mockResolvedValue(null);
      const req = mockReq({ user: { _id: 'u1', name: 'Ann', email: 'ann@example.com', avatar: undefined } });
      const res = mockRes();

      await userController.getProfile(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.data.hasBankDetails).toBe(false);
      expect(payload.data.user.avatar).toBeNull();
      expect(supabaseService.createSignedUrl).not.toHaveBeenCalled();
    });

    it('passes through an already-public http(s) avatar URL unchanged', async () => {
      BankDetails.findOne.mockResolvedValue(null);
      const req = mockReq({ user: { _id: 'u1', name: 'Ann', email: 'ann@example.com', avatar: 'https://cdn.example.com/a.png' } });
      const res = mockRes();

      await userController.getProfile(req, res);

      expect(supabaseService.createSignedUrl).not.toHaveBeenCalled();
      expect(res.json.mock.calls[0][0].data.user.avatar).toBe('https://cdn.example.com/a.png');
    });

    it('returns 500 when a dependency throws', async () => {
      BankDetails.findOne.mockRejectedValue(new Error('db down'));
      const req = mockReq({ user: { _id: 'u1', avatar: null } });
      const res = mockRes();

      await userController.getProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });
  });

  describe('updateProfile', () => {
    it('rejects an empty name', async () => {
      const req = mockReq({ body: { name: '   ' } });
      const res = mockRes();

      await userController.updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(User.findById).not.toHaveBeenCalled();
    });

    it('returns 404 when the user no longer exists', async () => {
      User.findById.mockResolvedValue(null);
      const req = mockReq({ body: { name: 'New Name' } });
      const res = mockRes();

      await userController.updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('trims and truncates name/phone and saves', async () => {
      const user = { name: 'Old', phone: 'old', save: jest.fn().mockResolvedValue(true) };
      User.findById.mockResolvedValue(user);
      const req = mockReq({ body: { name: '  New Name  ', phone: ' 9998887776 ' } });
      const res = mockRes();

      await userController.updateProfile(req, res);

      expect(user.name).toBe('New Name');
      expect(user.phone).toBe('9998887776');
      expect(user.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('leaves fields untouched when not provided in the body', async () => {
      const user = { name: 'Keep', phone: 'Keep2', save: jest.fn().mockResolvedValue(true) };
      User.findById.mockResolvedValue(user);
      const req = mockReq({ body: {} });
      const res = mockRes();

      await userController.updateProfile(req, res);

      expect(user.name).toBe('Keep');
      expect(user.phone).toBe('Keep2');
    });

    it('returns 500 on save failure', async () => {
      const user = { name: 'Old', save: jest.fn().mockRejectedValue(new Error('boom')) };
      User.findById.mockResolvedValue(user);
      const req = mockReq({ body: { name: 'X' } });
      const res = mockRes();

      await userController.updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('saveBankDetails', () => {
    it('updates existing bank details in place', async () => {
      const existing = { upiId: 'old@upi', phoneNumber: '1', save: jest.fn().mockResolvedValue(true) };
      BankDetails.findOne.mockResolvedValue(existing);
      const req = mockReq({ body: { upiId: 'new@upi', phoneNumber: '9' } });
      const res = mockRes();

      await userController.saveBankDetails(req, res);

      expect(existing.upiId).toBe('new@upi');
      expect(existing.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, message: expect.stringContaining('updated') }));
    });

    it('creates new bank details with 201 when none exist', async () => {
      BankDetails.findOne.mockResolvedValue(null);
      const saved = { save: jest.fn().mockResolvedValue(true) };
      BankDetails.mockImplementation(() => saved);
      const req = mockReq({ body: { upiId: 'a@upi', phoneNumber: '9' } });
      const res = mockRes();

      await userController.saveBankDetails(req, res);

      expect(saved.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('returns 500 when persistence fails', async () => {
      BankDetails.findOne.mockRejectedValue(new Error('db error'));
      const req = mockReq({ body: {} });
      const res = mockRes();

      await userController.saveBankDetails(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getBankDetails', () => {
    it('returns bank details when present', async () => {
      BankDetails.findOne.mockResolvedValue({ upiId: 'a@upi' });
      const req = mockReq();
      const res = mockRes();

      await userController.getBankDetails(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, data: { upiId: 'a@upi' } });
    });

    it('returns null data when none exist', async () => {
      BankDetails.findOne.mockResolvedValue(null);
      const req = mockReq();
      const res = mockRes();

      await userController.getBankDetails(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, data: null });
    });
  });

  describe('getDashboard', () => {
    it('aggregates counts and total earnings', async () => {
      Website.countDocuments.mockResolvedValue(3);
      Purchase.countDocuments.mockResolvedValue(5);
      Wishlist.countDocuments.mockResolvedValue(2);
      Purchase.aggregate.mockResolvedValue([{ _id: null, total: 4500 }]);
      Payout.countDocuments.mockResolvedValue(1);

      const req = mockReq();
      const res = mockRes();

      await userController.getDashboard(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { uploadedWebsites: 3, purchases: 5, wishlistCount: 2, totalEarnings: 4500, pendingPayouts: 1 },
      });
    });

    it('defaults totalEarnings to 0 when the aggregation returns no rows', async () => {
      Website.countDocuments.mockResolvedValue(0);
      Purchase.countDocuments.mockResolvedValue(0);
      Wishlist.countDocuments.mockResolvedValue(0);
      Purchase.aggregate.mockResolvedValue([]);
      Payout.countDocuments.mockResolvedValue(0);

      const req = mockReq();
      const res = mockRes();

      await userController.getDashboard(req, res);

      expect(res.json.mock.calls[0][0].data.totalEarnings).toBe(0);
    });

    it('returns 500 when one of the parallel queries rejects', async () => {
      Website.countDocuments.mockRejectedValue(new Error('down'));
      Purchase.countDocuments.mockResolvedValue(0);
      Wishlist.countDocuments.mockResolvedValue(0);
      Purchase.aggregate.mockResolvedValue([]);
      Payout.countDocuments.mockResolvedValue(0);

      const req = mockReq();
      const res = mockRes();

      await userController.getDashboard(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getPurchases', () => {
    it('paginates, hydrates preview video/avatar URLs, and returns metadata', async () => {
      supabaseService.createSignedUrl.mockResolvedValue('https://signed/asset');
      const purchaseDoc = {
        toObject: () => ({
          _id: 'p1',
          websiteId: { previewVideoUrl: 'videos/a.mp4', sellerId: { avatar: 'avatars/s.png' } },
        }),
      };
      Purchase.find.mockReturnValue(createQueryMock([purchaseDoc]));
      Purchase.countDocuments.mockResolvedValue(1);

      const req = mockReq({ query: { page: '1', limit: '10' } });
      const res = mockRes();

      await userController.getPurchases(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.data[0].websiteId.files.previewVideo.url).toBe('https://signed/asset');
      expect(payload.data[0].websiteId.sellerId.avatar).toBe('https://signed/asset');
      expect(payload.pagination).toEqual({ currentPage: 1, totalPages: 1, totalItems: 1 });
    });

    it('handles purchases with no linked website gracefully', async () => {
      const purchaseDoc = { toObject: () => ({ _id: 'p1', websiteId: null }) };
      Purchase.find.mockReturnValue(createQueryMock([purchaseDoc]));
      Purchase.countDocuments.mockResolvedValue(1);

      const req = mockReq({ query: {} });
      const res = mockRes();

      await userController.getPurchases(req, res);

      expect(res.json.mock.calls[0][0].data[0].websiteId).toBeNull();
    });

    it('returns 500 when the query fails', async () => {
      Purchase.find.mockImplementation(() => { throw new Error('bad query'); });
      const req = mockReq({ query: {} });
      const res = mockRes();

      await userController.getPurchases(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('updateProfilePicture', () => {
    it('rejects when no file is uploaded', async () => {
      const req = mockReq({ file: undefined });
      const res = mockRes();

      await userController.updateProfilePicture(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(User.findById).not.toHaveBeenCalled();
    });

    it('returns 404 when the user no longer exists', async () => {
      User.findById.mockResolvedValue(null);
      const req = mockReq({ file: { buffer: Buffer.from('x') } });
      const res = mockRes();

      await userController.updateProfilePicture(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('deletes the old avatar, uploads the new one, and saves the storage path', async () => {
      const user = { avatar: 'avatars/old.png', save: jest.fn().mockResolvedValue(true) };
      User.findById.mockResolvedValue(user);
      supabaseService.uploadAvatar.mockResolvedValue({ path: 'avatars/new.png', publicUrl: 'https://cdn/new.png' });
      const req = mockReq({ file: { buffer: Buffer.from('x') } });
      const res = mockRes();

      await userController.updateProfilePicture(req, res);

      expect(supabaseService.deleteAvatar).toHaveBeenCalledWith('avatars/old.png');
      expect(user.avatar).toBe('avatars/new.png');
      expect(user.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { avatar: 'https://cdn/new.png' } }));
    });

    it('skips deleting an old avatar when the user has none', async () => {
      const user = { avatar: undefined, save: jest.fn().mockResolvedValue(true) };
      User.findById.mockResolvedValue(user);
      supabaseService.uploadAvatar.mockResolvedValue({ path: 'avatars/new.png', publicUrl: 'https://cdn/new.png' });
      const req = mockReq({ file: { buffer: Buffer.from('x') } });
      const res = mockRes();

      await userController.updateProfilePicture(req, res);

      expect(supabaseService.deleteAvatar).not.toHaveBeenCalled();
    });

    it('returns 500 when the upload fails', async () => {
      const user = { avatar: null, save: jest.fn() };
      User.findById.mockResolvedValue(user);
      supabaseService.uploadAvatar.mockRejectedValue(new Error('upload failed'));
      const req = mockReq({ file: { buffer: Buffer.from('x') } });
      const res = mockRes();

      await userController.updateProfilePicture(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('removeProfilePicture', () => {
    it('returns 404 when the user no longer exists', async () => {
      User.findById.mockResolvedValue(null);
      const req = mockReq();
      const res = mockRes();

      await userController.removeProfilePicture(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('deletes the stored avatar and clears the field', async () => {
      const user = { avatar: 'avatars/old.png', save: jest.fn().mockResolvedValue(true) };
      User.findById.mockResolvedValue(user);
      const req = mockReq();
      const res = mockRes();

      await userController.removeProfilePicture(req, res);

      expect(supabaseService.deleteAvatar).toHaveBeenCalledWith('avatars/old.png');
      expect(user.avatar).toBeUndefined();
      expect(user.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('does nothing to Supabase when there is no avatar to remove', async () => {
      const user = { avatar: undefined, save: jest.fn().mockResolvedValue(true) };
      User.findById.mockResolvedValue(user);
      const req = mockReq();
      const res = mockRes();

      await userController.removeProfilePicture(req, res);

      expect(supabaseService.deleteAvatar).not.toHaveBeenCalled();
    });

    it('returns 500 when save fails', async () => {
      const user = { avatar: 'a.png', save: jest.fn().mockRejectedValue(new Error('x')) };
      User.findById.mockResolvedValue(user);
      const req = mockReq();
      const res = mockRes();

      await userController.removeProfilePicture(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
