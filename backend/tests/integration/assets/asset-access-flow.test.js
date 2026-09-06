// INTEGRATION: Purchase-gated asset access — asset.controller.js's
// getAssetUrls chaining real ownership verification (Purchase lookup),
// real resource lookup (Website), a real business rule (files must be
// uploaded before they're downloadable), a mocked external boundary
// (Supabase signed URLs), and real multi-model side effects (DownloadLog
// insertMany + Website.downloadCount increment + Purchase.downloadCount/
// lastAccessedAt update) — reached through the real `auth` middleware so a
// real JWT is what resolves req.userId.
//
// Why this exists: the asset module (asset.controller.js, asset.routes.js,
// downloadLog.model.js) has ZERO existing test coverage of any kind — no
// unit test, no API test — so nothing here duplicates prior work. It is
// also a direct match for the task brief's Priority-3 example ("User
// ownership verification + Resource lookup + Permission validation +
// Business operation"), and the failure-path scenarios below prove that
// when ownership/resource checks fail, none of the three models are
// mutated and the external Supabase boundary is never touched.
//
// Real internal components: auth middleware, jwt.js (via a real
// signup-issued token), asset.controller.js's getAssetUrls, and the
// Purchase/Website/DownloadLog "documents" (in-memory DB-boundary mocks —
// see checkout-coupon-flow.test.js's header for why a real MongoDB isn't
// available in this sandbox).
// Mocked external/boundary components: supabase.service.js (the actual
// outbound call to Supabase Storage for signed URLs) and email.service.js
// (touched only in passing by the real signup call used to obtain a token).

jest.mock('../../../src/modules/user/user.model', () => require('../../mocks/models/user.model.mock'));
jest.mock('../../../src/modules/website/website.model', () => require('../../mocks/models/website.model.mock'));
jest.mock('../../../src/modules/payment/purchase.model', () => require('../../mocks/models/purchase.model.mock'));
jest.mock('../../../src/modules/asset/downloadLog.model', () => require('../../mocks/models/downloadLog.model.mock'));
jest.mock('../../../src/services/supabase.service', () => require('../../mocks/services/supabase.service.mock'));
jest.mock('../../../src/services/email.service', () => require('../../mocks/services/email.service.mock'));

const express = require('express');
const request = require('supertest');
const User = require('../../../src/modules/user/user.model');
const Website = require('../../../src/modules/website/website.model');
const Purchase = require('../../../src/modules/payment/purchase.model');
const DownloadLog = require('../../../src/modules/asset/downloadLog.model');
const supabaseService = require('../../../src/services/supabase.service');
const authRoutes = require('../../../src/modules/auth/auth.routes');
const assetRoutes = require('../../../src/modules/asset/asset.routes');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/assets', assetRoutes);
  return app;
};

let app;
let token;
let userId;

beforeEach(async () => {
  User.__reset();
  Website.__reset();
  Purchase.__reset();
  DownloadLog.__reset();
  jest.clearAllMocks();
  supabaseService.createSignedUrls.mockResolvedValue([
    { signedUrl: 'https://mock.supabase.co/signed/source.zip' },
    { signedUrl: 'https://mock.supabase.co/signed/docs.pdf' },
  ]);

  app = buildApp();
  const signupRes = await request(app).post('/api/auth/signup').send({
    name: 'Buyer One',
    email: 'buyer@example.com',
    password: 'password123',
  });
  token = signupRes.body.data.token;
  userId = signupRes.body.data.user.id;
});

describe('Asset access (integration)', () => {
  it('grants a buyer with a completed purchase signed download URLs and updates all three models consistently', async () => {
    const website = Website.__seed({
      sourceCodeUrl: 'source-code/my-app.zip',
      docsUrl: 'docs/my-app.pdf',
      files: { sourceCode: { fileName: 'my-app.zip', size: 1000 }, docs: { fileName: 'my-app.pdf', size: 200 } },
      downloadCount: 5,
    });
    Purchase.__seed({
      websiteId: website._id,
      buyerId: userId,
      paymentStatus: 'completed',
      downloadCount: 0,
    });

    const res = await request(app).get(`/api/assets/download/${website._id}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.sourceCode.url).toBe('https://mock.supabase.co/signed/source.zip');
    expect(res.body.data.docs.url).toBe('https://mock.supabase.co/signed/docs.pdf');

    // External boundary called with exactly the two real storage paths —
    // proving the real controller logic (not a stub) built this list.
    expect(supabaseService.createSignedUrls).toHaveBeenCalledWith(
      ['source-code/my-app.zip', 'docs/my-app.pdf'],
      expect.any(Number)
    );

    // Multi-model consistency: a download log per file, both counters
    // incremented by the same amount, purchase's access timestamp bumped.
    const logs = DownloadLog.__all();
    expect(logs).toHaveLength(2);
    expect(logs.map((l) => l.fileType).sort()).toEqual(['docs', 'sourceCode']);
    expect(logs.every((l) => String(l.purchaseId) && String(l.userId) === String(userId))).toBe(true);

    expect(Website.__all().find((w) => w._id === website._id).downloadCount).toBe(7); // 5 + 2
    const purchase = Purchase.__all().find((p) => String(p.websiteId) === String(website._id));
    expect(purchase.downloadCount).toBe(2);
    expect(purchase.lastAccessedAt).toBeInstanceOf(Date);
  });

  it('logs and counts a video download as a third file when the website has one', async () => {
    const website = Website.__seed({
      sourceCodeUrl: 'source-code/app.zip',
      docsUrl: 'docs/app.pdf',
      videoUrl: 'videos/app.mp4',
      downloadCount: 0,
    });
    Purchase.__seed({ websiteId: website._id, buyerId: userId, paymentStatus: 'completed', downloadCount: 0 });
    supabaseService.createSignedUrls.mockResolvedValue([
      { signedUrl: 'https://mock.supabase.co/signed/app.zip' },
      { signedUrl: 'https://mock.supabase.co/signed/app.pdf' },
      { signedUrl: 'https://mock.supabase.co/signed/app.mp4' },
    ]);

    const res = await request(app).get(`/api/assets/download/${website._id}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(DownloadLog.__all()).toHaveLength(3);
    expect(Website.__all().find((w) => w._id === website._id).downloadCount).toBe(3);
    expect(Purchase.__all()[0].downloadCount).toBe(3);
  });

  it('rejects access with 403 and touches no model or the external boundary when the user never purchased the website', async () => {
    const website = Website.__seed({ sourceCodeUrl: 'source-code/app.zip', docsUrl: 'docs/app.pdf', downloadCount: 0 });
    // No Purchase seeded for this user/website — ownership verification must fail first.

    const res = await request(app).get(`/api/assets/download/${website._id}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/must purchase/i);

    expect(DownloadLog.__all()).toHaveLength(0);
    expect(Website.__all().find((w) => w._id === website._id).downloadCount).toBe(0);
    expect(supabaseService.createSignedUrls).not.toHaveBeenCalled();
  });

  it('rejects with 400 and touches no model when ownership is verified but the files were never uploaded', async () => {
    const website = Website.__seed({ sourceCodeUrl: null, docsUrl: null });
    Purchase.__seed({ websiteId: website._id, buyerId: userId, paymentStatus: 'completed', downloadCount: 0 });

    const res = await request(app).get(`/api/assets/download/${website._id}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(DownloadLog.__all()).toHaveLength(0);
    expect(supabaseService.createSignedUrls).not.toHaveBeenCalled();
    expect(Purchase.__all()[0].downloadCount).toBe(0); // untouched — proves the rule short-circuits before any side effect
  });

  it('never reaches ownership verification or the controller at all without a valid token (real auth middleware short-circuit)', async () => {
    const website = Website.__seed({ sourceCodeUrl: 'source-code/app.zip', docsUrl: 'docs/app.pdf' });

    const res = await request(app).get(`/api/assets/download/${website._id}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_TOKEN_MISSING');
    expect(supabaseService.createSignedUrls).not.toHaveBeenCalled();
  });
});
