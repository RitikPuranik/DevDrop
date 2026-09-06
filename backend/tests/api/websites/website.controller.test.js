jest.mock('../../../src/modules/website/website.model', () => require('../../mocks/models/website.model.mock'));
jest.mock('../../../src/modules/wishlist/wishlist.model', () => require('../../mocks/models/wishlist.model.mock'));
jest.mock('../../../src/services/supabase.service', () => require('../../mocks/services/supabase.service.mock'));
jest.mock('../../../src/modules/user/user.model', () => require('../../mocks/models/user.model.mock'));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const Website = require('../../../src/modules/website/website.model');
const Wishlist = require('../../../src/modules/wishlist/wishlist.model');
const User = require('../../../src/modules/user/user.model');
const websiteRoutes = require('../../../src/modules/website/website.routes');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/websites', websiteRoutes);
  return app;
};

let app;

beforeEach(async () => {
  Website.__reset();
  Wishlist.__reset();
  User.__reset();
  app = buildApp();
});

describe('GET /api/websites (browse)', () => {
  it('lists approved, non-deleted websites with pagination metadata', async () => {
    Website.__seed({ name: 'Alpha', status: 'approved', isDeleted: false, category: 'free' });
    Website.__seed({ name: 'Beta', status: 'approved', isDeleted: false, category: 'paid' });

    const res = await request(app).get('/api/websites');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination).toEqual(expect.objectContaining({ totalItems: 2, currentPage: 1 }));
  });

  it('excludes soft-deleted websites', async () => {
    Website.__seed({ name: 'Visible', status: 'approved', isDeleted: false });
    Website.__seed({ name: 'Deleted', status: 'approved', isDeleted: true });

    const res = await request(app).get('/api/websites');
    expect(res.body.data.map((w) => w.name)).toEqual(['Visible']);
  });

  it('excludes websites still pending review', async () => {
    Website.__seed({ name: 'Live', status: 'approved' });
    Website.__seed({ name: 'Pending', status: 'pending_review' });

    const res = await request(app).get('/api/websites');
    expect(res.body.data.map((w) => w.name)).toEqual(['Live']);
  });

  it('excludes sold exclusive listings but keeps other sold-adjacent categories out too by default', async () => {
    Website.__seed({ name: 'SoldExclusive', status: 'sold', category: 'exclusive' });
    Website.__seed({ name: 'ApprovedFree', status: 'approved', category: 'free' });

    const res = await request(app).get('/api/websites');
    expect(res.body.data.map((w) => w.name)).toEqual(['ApprovedFree']);
  });

  it('filters by category query parameter', async () => {
    Website.__seed({ name: 'FreeOne', status: 'approved', category: 'free' });
    Website.__seed({ name: 'PaidOne', status: 'approved', category: 'paid' });

    const res = await request(app).get('/api/websites').query({ category: 'paid' });
    expect(res.body.data.map((w) => w.name)).toEqual(['PaidOne']);
  });

  it('filters by minPrice/maxPrice range', async () => {
    Website.__seed({ name: 'Cheap', status: 'approved', price: 100 });
    Website.__seed({ name: 'Mid', status: 'approved', price: 500 });
    Website.__seed({ name: 'Expensive', status: 'approved', price: 5000 });

    const res = await request(app).get('/api/websites').query({ minPrice: 200, maxPrice: 1000 });
    expect(res.body.data.map((w) => w.name)).toEqual(['Mid']);
  });

  it('marks isWishlisted for an authenticated user who wishlisted a result', async () => {
    const user = await User.__seed({ name: 'Buyer', email: 'buyer@example.com', password: 'password123' });
    const token = jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET);
    const website = Website.__seed({ name: 'Wanted', status: 'approved' });
    Wishlist.__seed({ userId: user._id.toString(), websiteId: website._id });

    const res = await request(app).get('/api/websites').set('Authorization', `Bearer ${token}`);
    expect(res.body.data[0].isWishlisted).toBe(true);
  });

  it('does not include isWishlisted at all for an anonymous request', async () => {
    Website.__seed({ name: 'Anon', status: 'approved' });
    const res = await request(app).get('/api/websites');
    expect(res.body.data[0].isWishlisted).toBeUndefined();
  });
});

describe('GET /api/websites/:id (details)', () => {
  it('returns details for an approved website', async () => {
    const website = Website.__seed({ name: 'Details Test', status: 'approved' });
    const res = await request(app).get(`/api/websites/${website._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Details Test');
  });

  it('returns 404 for a non-existent website', async () => {
    const res = await request(app).get('/api/websites/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a website that is still pending review', async () => {
    const website = Website.__seed({ name: 'Hidden', status: 'pending_review' });
    const res = await request(app).get(`/api/websites/${website._id}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for a sold exclusive listing', async () => {
    const website = Website.__seed({ name: 'SoldExclusive', status: 'sold', category: 'exclusive' });
    const res = await request(app).get(`/api/websites/${website._id}`);
    expect(res.status).toBe(404);
  });

  it('increments the view count as a side effect', async () => {
    const website = Website.__seed({ name: 'Viewed', status: 'approved', viewCount: 0 });
    await request(app).get(`/api/websites/${website._id}`);
    // Fire-and-forget in the controller — allow the microtask queue to flush.
    await new Promise((resolve) => setImmediate(resolve));
    expect(website.viewCount).toBe(1);
  });
});

describe('GET /api/websites/category/:category', () => {
  it('lists approved websites in the given category', async () => {
    Website.__seed({ name: 'FreeOne', status: 'approved', category: 'free' });
    Website.__seed({ name: 'PaidOne', status: 'approved', category: 'paid' });

    const res = await request(app).get('/api/websites/category/free');
    expect(res.status).toBe(200);
    expect(res.body.data.map((w) => w.name)).toEqual(['FreeOne']);
  });

  it('rejects an invalid category', async () => {
    const res = await request(app).get('/api/websites/category/not-a-real-category');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/websites/search', () => {
  it('requires a search query', async () => {
    const res = await request(app).get('/api/websites/search');
    expect(res.status).toBe(400);
  });

  it('returns matching results and echoes the search query', async () => {
    Website.__seed({ name: 'Findable', status: 'approved' });
    const res = await request(app).get('/api/websites/search').query({ q: 'anything' });
    expect(res.status).toBe(200);
    expect(res.body.searchQuery).toBe('anything');
  });
});
