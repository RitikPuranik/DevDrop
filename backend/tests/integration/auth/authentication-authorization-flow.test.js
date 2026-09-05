// INTEGRATION: Authentication chain (Auth Controller → JWT util → Auth
// Middleware) and Authorization chain (Auth Middleware → AdminOnly
// Middleware → protected handler), using tokens genuinely issued by the
// real signup/login endpoints rather than hand-crafted jwt.sign() calls.
//
// Why this exists: tests/unit/middleware/auth.test.js and adminOnly.test.js
// unit-test each middleware in isolation against manually-built req/res
// objects and self-signed tokens; tests/unit/utils/jwt.test.js unit-tests
// token generation/verification in isolation; tests/api/auth/*.test.js tests
// signup/login responses in isolation. None of them chain a token that a
// real user actually received from a real signup/login call through the
// real middleware stack into a real protected route — which is exactly the
// "Auth Module → JWT → Authorization" workflow the task brief names.
//
// Real internal components: auth.controller.js (signup/login), jwt.js
// (generateAccessToken/verifyAccessToken via jsonwebtoken), auth middleware,
// adminOnly middleware, admin.routes.js's real router wiring, and
// coupon.controller.js (reached only once authorization succeeds).
// Mocked external/boundary components: the User "database" (existing
// in-memory model mock — see checkout-coupon-flow.test.js's header for why
// a real MongoDB isn't available in this sandbox), email/supabase services
// (unrelated third-party integrations signup/login touch in passing).

jest.mock('../../../src/modules/user/user.model', () => require('../../mocks/models/user.model.mock'));
jest.mock('../../../src/modules/coupons/coupon.model', () => require('../../mocks/models/coupon.model.mock'));
jest.mock('../../../src/services/email.service', () => require('../../mocks/services/email.service.mock'));
jest.mock('../../../src/services/supabase.service', () => require('../../mocks/services/supabase.service.mock'));
jest.mock('../../../src/shared/middleware/rateLimit', () => ({
  authLimiter: (req, res, next) => next(),
  generalLimiter: (req, res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const User = require('../../../src/modules/user/user.model');
const Coupon = require('../../../src/modules/coupons/coupon.model');
const authRoutes = require('../../../src/modules/auth/auth.routes');
const adminRoutes = require('../../../src/modules/admin/admin.routes');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  return app;
};

let app;

beforeEach(() => {
  User.__reset();
  Coupon.__reset();
  app = buildApp();
});

describe('Authentication → authorization chain (integration)', () => {
  it('a token issued by real signup is accepted by the real auth middleware but rejected by adminOnly for a regular user', async () => {
    const signupRes = await request(app).post('/api/auth/signup').send({
      name: 'Regular Person',
      email: 'regular@example.com',
      password: 'password123',
    });
    expect(signupRes.status).toBe(201);
    const { token } = signupRes.body.data;
    expect(token).toEqual(expect.any(String));

    // Real auth middleware must accept this real token and resolve the real
    // user record — proven by getting past 401 into the adminOnly check.
    const meRes = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.email).toBe('regular@example.com');

    // Same token, same real auth middleware, but now chained into the real
    // admin router: auth passes (proven above) yet adminOnly must still
    // reject — the authorization link of the chain, not just authentication.
    const adminRes = await request(app).get('/api/admin/coupons').set('Authorization', `Bearer ${token}`);
    expect(adminRes.status).toBe(403);
  });

  it('a token issued by real login for a seeded admin flows through auth + adminOnly into the real coupon controller', async () => {
    // Admins aren't self-service — seeded directly, mirroring how the real
    // system provisions them (no signup endpoint sets role: 'admin').
    await User.__seed({ name: 'Ops Admin', email: 'ops@example.com', password: 'adminPass123', role: 'admin' });

    const loginRes = await request(app).post('/api/auth/login').send({
      emailOrPhone: 'ops@example.com',
      password: 'adminPass123',
    });
    expect(loginRes.status).toBe(200);
    const { token } = loginRes.body.data;

    // Full chain: real login-issued token → real auth middleware (User
    // lookup) → real adminOnly (role check) → real coupon.controller.js
    // (createCoupon, getCoupons) — a genuinely different controller module
    // than the one that issued the token.
    const createRes = await request(app)
      .post('/api/admin/coupons')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'opscoupon', usageMode: 'reusable', discountType: 'flat', discountValue: 100 });
    expect(createRes.status).toBe(201);

    const listRes = await request(app).get('/api/admin/coupons').set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].code).toBe('OPSCOUPON');
  });

  it('a tampered signature is rejected by auth middleware before adminOnly (or the admin coupon list) ever runs', async () => {
    await User.__seed({ name: 'Ops Admin', email: 'ops2@example.com', password: 'adminPass123', role: 'admin' });
    const loginRes = await request(app).post('/api/auth/login').send({ emailOrPhone: 'ops2@example.com', password: 'adminPass123' });
    const validToken = loginRes.body.data.token;

    // Flip one base64url character in the signature segment — same claims,
    // same header, invalid signature.
    const parts = validToken.split('.');
    const lastChar = parts[2].slice(-1);
    parts[2] = parts[2].slice(0, -1) + (lastChar === 'A' ? 'B' : 'A');
    const tamperedToken = parts.join('.');

    const res = await request(app).get('/api/admin/coupons').set('Authorization', `Bearer ${tamperedToken}`);

    // Must fail at authentication (401 + AUTH_TOKEN_INVALID), never reach
    // adminOnly's 403 — proving failure propagation stops the chain at the
    // first broken link instead of falling through.
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_TOKEN_INVALID');
    expect(Coupon.__all()).toHaveLength(0);
  });

  it('rejects a well-formed token for a user that no longer exists, without ever reaching adminOnly', async () => {
    const jwt = require('jsonwebtoken');
    const ghostToken = jwt.sign({ userId: 'mockid-does-not-exist' }, process.env.JWT_SECRET, { expiresIn: '7d' });

    const res = await request(app).get('/api/admin/coupons').set('Authorization', `Bearer ${ghostToken}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_TOKEN_USER_NOT_FOUND');
  });
});
