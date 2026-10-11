const mockInvalidate = jest.fn().mockResolvedValue(0);
jest.mock('../../../src/infrastructure/cache', () => ({ invalidateNamespace: (...a) => mockInvalidate(...a) }));

const mongoose = require('mongoose');
const Website = require('../../../src/modules/website/website.model');

// Run the registered post-hooks directly (no database needed).
const OURS = ['invalidatePublicListings', 'afterWrite'];
const hooksFor = (op) => (Website.schema.s.hooks._posts.get(op) || []).filter((h) => OURS.includes(h.fn.name));
const runQueryHook = (op, update) => hooksFor(op).forEach((h) => h.fn.call({ getUpdate: () => update }));

beforeEach(() => jest.clearAllMocks());

describe('public listing cache invalidation', () => {
  it('real edits drop the websites cache namespace', () => {
    runQueryHook('findOneAndUpdate', { $set: { status: 'sold' } });
    expect(mockInvalidate).toHaveBeenCalledWith('websites');
  });

  it('pure counter bumps (views / wishlists / downloads) do not thrash the cache', () => {
    runQueryHook('findOneAndUpdate', { $inc: { viewCount: 1 } });
    runQueryHook('updateOne', { $inc: { wishlistCount: -1 } });
    runQueryHook('updateOne', { $inc: { downloadCount: 2 } });
    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  it('an $inc mixed with real changes still invalidates', () => {
    runQueryHook('updateOne', { $inc: { viewCount: 1 }, $set: { price: 5 } });
    expect(mockInvalidate).toHaveBeenCalledTimes(1);
  });

  it('document saves and deletes invalidate', () => {
    expect(hooksFor('save').length).toBeGreaterThan(0);
    hooksFor('save').forEach((h) => h.fn.call({}));
    expect(mockInvalidate).toHaveBeenCalledWith('websites');
  });
});
