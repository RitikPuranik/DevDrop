// This file exists because of a real discrepancy found during the Phase 2B
// audit: `src/modules/coupons/coupon.routes.js` (which owns its own
// `auth`+`adminOnly` chain and is exercised in full by
// tests/api/coupons/coupon.controller.test.js) is never mounted by
// src/app.js. The only production path that actually reaches
// coupon.controller.js is `src/modules/admin/admin.routes.js`, mounted at
// /api/admin — see "Bugs Discovered" in the Phase 2B report.
//
// tests/api/coupons/coupon.controller.test.js already exercises every
// create/list/toggle/validation scenario against the (identical) controller,
// so this file only confirms the *actual reachable* route wiring — the
// coupon endpoints really are reachable at /api/admin/coupons, behind the
// same auth/admin gate as the rest of the admin router — without duplicating
// that scenario coverage.
jest.mock('../../../src/modules/coupons/coupon.model', () => require('../../mocks/models/coupon.model.mock'));
jest.mock('../../../src/modules/user/user.model', () => require('../../mocks/models/user.model.mock'));
jest.mock('../../../src/services/supabase.service', () => require('../../mocks/services/supabase.service.mock'));
jest.mock('../../../src/services/email.service', () => require('../../mocks/services/email.service.mock'));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const Coupon = require('../../../src/modules/coupons/coupon.model');
const User = require('../../../src/modules/user/user.model');
const adminRoutes = require('../../../src/modules/admin/admin.routes');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  return app;
};

let app;
let adminUser;
let normalUser;
let adminToken;
let userToken;

beforeEach(async () => {
  Coupon.__reset();
  User.__reset();
  app = buildApp();

  adminUser = await User.__seed({ name: 'Admin User', email: 'admin@example.com', password: 'password123', role: 'admin' });
  normalUser = await User.__seed({ name: 'Normal User', email: 'user@example.com', password: 'password123', role: 'user' });
  adminToken = jwt.sign({ userId: adminUser._id.toString() }, process.env.JWT_SECRET);
  userToken = jwt.sign({ userId: normalUser._id.toString() }, process.env.JWT_SECRET);
});

describe('Coupon routes reachable at /api/admin/coupons', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/admin/coupons');
    expect(res.status).toBe(401);
  });

  it('rejects a non-admin authenticated user with 403', async () => {
    const res = await request(app).get('/api/admin/coupons').set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it('lets an admin create, list, and toggle a coupon through the real /api/admin mount', async () => {
    const auth = (req) => req.set('Authorization', `Bearer ${adminToken}`);

    const created = await auth(request(app).post('/api/admin/coupons')).send({
      code: 'welcome10', usageMode: 'reusable', discountType: 'percent', discountValue: 10,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.code).toBe('WELCOME10');

    const listed = await auth(request(app).get('/api/admin/coupons'));
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);

    const toggled = await auth(request(app).patch(`/api/admin/coupons/${created.body.data._id}/toggle`));
    expect(toggled.status).toBe(200);
    expect(toggled.body.data.active).toBe(false);
  });
});
