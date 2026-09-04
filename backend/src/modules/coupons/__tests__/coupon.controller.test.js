jest.mock('../coupon.model');
jest.mock('../../user/user.model');

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const Coupon = require('../coupon.model');
const User = require('../../user/user.model');
const couponRoutes = require('../coupon.routes');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/coupons', couponRoutes);
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

describe('Coupon module authorization', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/coupons');
    expect(res.status).toBe(401);
  });

  it('rejects a non-admin authenticated user with 403', async () => {
    const res = await request(app).get('/api/coupons').set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it('allows an admin user through', async () => {
    const res = await request(app).get('/api/coupons').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/coupons (create)', () => {
  const auth = (req) => req.set('Authorization', `Bearer ${adminToken}`);

  it('creates a percent coupon (happy path)', async () => {
    const res = await auth(request(app).post('/api/coupons')).send({
      code: 'save10', usageMode: 'reusable', discountType: 'percent', discountValue: 10,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe('SAVE10'); // normalized uppercase
    expect(res.body.data.active).toBe(true);
  });

  it('creates a flat coupon', async () => {
    const res = await auth(request(app).post('/api/coupons')).send({
      code: 'FLAT200', usageMode: 'single_global', discountType: 'flat', discountValue: 200,
    });
    expect(res.status).toBe(201);
  });

  it('rejects a missing coupon code', async () => {
    const res = await auth(request(app).post('/api/coupons')).send({
      usageMode: 'reusable', discountType: 'percent', discountValue: 10,
    });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid usageMode', async () => {
    const res = await auth(request(app).post('/api/coupons')).send({
      code: 'BAD1', usageMode: 'bogus', discountType: 'percent', discountValue: 10,
    });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid discountType', async () => {
    const res = await auth(request(app).post('/api/coupons')).send({
      code: 'BAD2', usageMode: 'reusable', discountType: 'bogus', discountValue: 10,
    });
    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric discount value', async () => {
    const res = await auth(request(app).post('/api/coupons')).send({
      code: 'BAD3', usageMode: 'reusable', discountType: 'percent', discountValue: 'abc',
    });
    expect(res.status).toBe(400);
  });

  it.each([0, 101, -5])('rejects a percent discount out of the 1-100 range: %i', async (discountValue) => {
    const res = await auth(request(app).post('/api/coupons')).send({
      code: `PCT${discountValue}`, usageMode: 'reusable', discountType: 'percent', discountValue,
    });
    expect(res.status).toBe(400);
  });

  it('rejects a flat discount of 0 or less', async () => {
    const res = await auth(request(app).post('/api/coupons')).send({
      code: 'FLATZERO', usageMode: 'reusable', discountType: 'flat', discountValue: 0,
    });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate coupon code (case-insensitive)', async () => {
    await auth(request(app).post('/api/coupons')).send({
      code: 'DUPE1', usageMode: 'reusable', discountType: 'flat', discountValue: 100,
    });
    const res = await auth(request(app).post('/api/coupons')).send({
      code: 'dupe1', usageMode: 'reusable', discountType: 'flat', discountValue: 50,
    });
    expect(res.status).toBe(409);
  });
});

describe('GET /api/coupons (list)', () => {
  it('returns an empty list when none exist', async () => {
    const res = await request(app).get('/api/coupons').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('lists created coupons newest first', async () => {
    await Coupon.create({ code: 'A', usageMode: 'reusable', discountType: 'flat', discountValue: 10 });
    await Coupon.create({ code: 'B', usageMode: 'reusable', discountType: 'flat', discountValue: 20 });
    const res = await request(app).get('/api/coupons').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });
});

describe('PATCH /api/coupons/:id/toggle', () => {
  it('returns 404 for a non-existent coupon', async () => {
    const res = await request(app).patch('/api/coupons/does-not-exist/toggle').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('toggles active -> inactive with no body (implicit flip)', async () => {
    const coupon = await Coupon.create({ code: 'TOG1', usageMode: 'reusable', discountType: 'flat', discountValue: 10, active: true });
    const res = await request(app).patch(`/api/coupons/${coupon._id}/toggle`).set('Authorization', `Bearer ${adminToken}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.active).toBe(false);
  });

  it('sets active explicitly when provided in the body', async () => {
    const coupon = await Coupon.create({ code: 'TOG2', usageMode: 'reusable', discountType: 'flat', discountValue: 10, active: true });
    const res = await request(app).patch(`/api/coupons/${coupon._id}/toggle`).set('Authorization', `Bearer ${adminToken}`).send({ active: true });
    expect(res.status).toBe(200);
    expect(res.body.data.active).toBe(true);
  });
});
