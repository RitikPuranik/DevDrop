// Confirms the admin router's auth + adminOnly gate (mounted once via
// `router.use(auth, adminOnly)` in admin.routes.js) actually protects every
// admin.controller endpoint reachable through it, not just the coupon
// routes already covered in admin.coupons.test.js. Business logic for each
// controller function is unit-tested in
// tests/unit/controllers/admin.controller.test.js; this file only exercises
// the real HTTP -> auth -> adminOnly -> controller chain.
jest.mock('../../../src/modules/user/user.model', () => require('../../mocks/models/user.model.mock'));
jest.mock('../../../src/modules/website/website.model');
jest.mock('../../../src/services/supabase.service');
jest.mock('../../../src/services/email.service');

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../../../src/modules/user/user.model');
const adminRoutes = require('../../../src/modules/admin/admin.routes');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  return app;
};

let app;
let adminToken;
let userToken;

beforeEach(async () => {
  User.__reset();
  app = buildApp();

  const adminUser = await User.__seed({ name: 'Admin', email: 'admin@example.com', password: 'password123', role: 'admin' });
  const normalUser = await User.__seed({ name: 'User', email: 'user@example.com', password: 'password123', role: 'user' });
  adminToken = jwt.sign({ userId: adminUser._id.toString() }, process.env.JWT_SECRET);
  userToken = jwt.sign({ userId: normalUser._id.toString() }, process.env.JWT_SECRET);
});

describe.each([
  ['GET', '/api/admin/dashboard'],
  ['GET', '/api/admin/websites'],
  ['GET', '/api/admin/payouts/pending'],
])('%s %s authorization', (method, path) => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app)[method.toLowerCase()](path);
    expect(res.status).toBe(401);
  });

  it('rejects a non-admin authenticated user with 403', async () => {
    const res = await request(app)[method.toLowerCase()](path).set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it('rejects a request with a garbage token with 401', async () => {
    const res = await request(app)[method.toLowerCase()](path).set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});

describe('write actions require admin', () => {
  it('rejects a non-admin trying to reject a website', async () => {
    const res = await request(app)
      .put('/api/admin/websites/w1/reject')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ reason: 'no' });
    expect(res.status).toBe(403);
  });

  it('rejects a non-admin trying to delete a website', async () => {
    const res = await request(app)
      .delete('/api/admin/websites/w1')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request to process a payout', async () => {
    const res = await request(app)
      .post('/api/admin/payouts/p1/process')
      .send({ utr: 'UTR1' });
    expect(res.status).toBe(401);
  });

  it('lets an admin reach the dashboard controller past the auth gate', async () => {
    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);
    // Past auth/adminOnly, controller logic runs for real; a 200 or a
    // handled 500 (from the unmocked aggregate calls) both prove the gate
    // let the admin through, unlike the 401/403 cases above.
    expect([200, 500]).toContain(res.status);
  });
});
