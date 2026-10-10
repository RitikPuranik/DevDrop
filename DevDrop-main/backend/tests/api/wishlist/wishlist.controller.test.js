jest.mock('../../../src/modules/wishlist/wishlist.model', () => require('../../mocks/models/wishlist.model.mock'));
jest.mock('../../../src/modules/website/website.model', () => require('../../mocks/models/website.model.mock'));
jest.mock('../../../src/modules/user/user.model', () => require('../../mocks/models/user.model.mock'));
jest.mock('../../../src/services/supabase.service', () => require('../../mocks/services/supabase.service.mock'));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const Wishlist = require('../../../src/modules/wishlist/wishlist.model');
const Website = require('../../../src/modules/website/website.model');
const User = require('../../../src/modules/user/user.model');
const wishlistRoutes = require('../../../src/modules/wishlist/wishlist.routes');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/wishlist', wishlistRoutes);
  return app;
};

let app;
let user, otherUser, token, otherToken, website;

beforeEach(async () => {
  Wishlist.__reset();
  Website.__reset();
  User.__reset();
  app = buildApp();

  user = await User.__seed({ name: 'Buyer One', email: 'buyer1@example.com', password: 'password123' });
  otherUser = await User.__seed({ name: 'Buyer Two', email: 'buyer2@example.com', password: 'password123' });
  token = jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET);
  otherToken = jwt.sign({ userId: otherUser._id.toString() }, process.env.JWT_SECRET);

  website = Website.__seed({ name: 'Cool SaaS Starter', status: 'approved' });
});

describe('Wishlist authentication', () => {
  it('rejects all wishlist routes without a token', async () => {
    expect((await request(app).get('/api/wishlist')).status).toBe(401);
    expect((await request(app).post(`/api/wishlist/${website._id}`)).status).toBe(401);
    expect((await request(app).delete(`/api/wishlist/${website._id}`)).status).toBe(401);
    expect((await request(app).get(`/api/wishlist/check/${website._id}`)).status).toBe(401);
  });
});

describe('POST /api/wishlist/:websiteId (add)', () => {
  it('adds an existing website to the wishlist and increments its counter', async () => {
    const res = await request(app).post(`/api/wishlist/${website._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(201);
    expect(res.body.data.userId).toBe(user._id.toString());
    expect(website.wishlistCount).toBe(1);
  });

  it('returns 404 for a non-existent website', async () => {
    const res = await request(app).post('/api/wishlist/does-not-exist').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('rejects adding the same website twice for the same user (409-equivalent handled as 400)', async () => {
    await request(app).post(`/api/wishlist/${website._id}`).set('Authorization', `Bearer ${token}`);
    const res = await request(app).post(`/api/wishlist/${website._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already in wishlist/i);
    expect(website.wishlistCount).toBe(1); // not double-incremented
  });

  it('allows two different users to wishlist the same website independently', async () => {
    await request(app).post(`/api/wishlist/${website._id}`).set('Authorization', `Bearer ${token}`);
    const res = await request(app).post(`/api/wishlist/${website._id}`).set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(201);
    expect(website.wishlistCount).toBe(2);
  });
});

describe('DELETE /api/wishlist/:websiteId (remove)', () => {
  it('removes a wishlisted website and decrements the counter', async () => {
    await request(app).post(`/api/wishlist/${website._id}`).set('Authorization', `Bearer ${token}`);
    const res = await request(app).delete(`/api/wishlist/${website._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(website.wishlistCount).toBe(0);
  });

  it('returns 404 when removing something never wishlisted', async () => {
    const res = await request(app).delete(`/api/wishlist/${website._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("does not let one user remove another user's wishlist entry (scoped by userId)", async () => {
    await request(app).post(`/api/wishlist/${website._id}`).set('Authorization', `Bearer ${token}`);
    const res = await request(app).delete(`/api/wishlist/${website._id}`).set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404); // otherUser never wishlisted it, so nothing to delete
    expect(website.wishlistCount).toBe(1); // user's entry is untouched
  });
});

describe('GET /api/wishlist/check/:websiteId', () => {
  it('reports false when not wishlisted', async () => {
    const res = await request(app).get(`/api/wishlist/check/${website._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isWishlisted).toBe(false);
  });

  it('reports true after wishlisting', async () => {
    await request(app).post(`/api/wishlist/${website._id}`).set('Authorization', `Bearer ${token}`);
    const res = await request(app).get(`/api/wishlist/check/${website._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.body.data.isWishlisted).toBe(true);
  });

  it('is scoped per-user', async () => {
    await request(app).post(`/api/wishlist/${website._id}`).set('Authorization', `Bearer ${token}`);
    const res = await request(app).get(`/api/wishlist/check/${website._id}`).set('Authorization', `Bearer ${otherToken}`);
    expect(res.body.data.isWishlisted).toBe(false);
  });
});
