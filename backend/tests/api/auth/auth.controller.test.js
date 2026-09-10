jest.mock('../../../src/modules/user/user.model', () => require('../../mocks/models/user.model.mock'));
jest.mock('../../../src/services/email.service', () => require('../../mocks/services/email.service.mock'));
jest.mock('../../../src/services/supabase.service', () => require('../../mocks/services/supabase.service.mock'));
jest.mock('../../../src/services/github.service', () => require('../../mocks/services/github.service.mock'));
jest.mock('google-auth-library');

// The authLimiter would otherwise share state across the many requests these
// tests fire and start returning 429s — rate limiting itself is exercised
// separately in rateLimit config tests, so here we pass it through untouched.
jest.mock('../../../src/shared/middleware/rateLimit', () => ({
  authLimiter: (req, res, next) => next(),
  generalLimiter: (req, res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../../../src/modules/user/user.model');
const emailService = require('../../../src/services/email.service');
const supabaseService = require('../../../src/services/supabase.service');
const githubService = require('../../../src/services/github.service');
const authRoutes = require('../../../src/modules/auth/auth.routes');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  return app;
};

let app;

beforeEach(() => {
  User.__reset();
  app = buildApp();
  supabaseService.createSignedUrl.mockResolvedValue('https://signed.example.com/avatar.png');
  emailService.sendVerificationEmail.mockResolvedValue(true);
  emailService.sendWelcomeEmail.mockResolvedValue(true);
  emailService.sendPasswordResetEmail.mockResolvedValue(true);
});

describe('POST /api/auth/signup', () => {
  it('creates a new user and returns a token (happy path)', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'password123',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.user.email).toBe('jane@example.com');
    expect(res.body.data.user.password).toBeUndefined();
  });

  it('rejects a duplicate email with 400', async () => {
    await User.__seed({ name: 'Existing', email: 'dup@example.com', password: 'password123' });
    const res = await request(app).post('/api/auth/signup').send({
      name: 'Someone Else',
      email: 'dup@example.com',
      password: 'password123',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already exists/i);
  });

  it('rejects a duplicate phone number with 400', async () => {
    await User.__seed({ name: 'Existing', email: 'other@example.com', phone: '9876543210', password: 'password123' });
    const res = await request(app).post('/api/auth/signup').send({
      name: 'New Person',
      email: 'new@example.com',
      phone: '9876543210',
      password: 'password123',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/phone number already exists/i);
  });

  it('rejects signup with missing required fields (name/email/password)', async () => {
    const res = await request(app).post('/api/auth/signup').send({ email: 'incomplete@example.com' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
    const fields = res.body.errors.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'password']));
  });

  it('rejects a password shorter than 6 characters at the validation layer', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      name: 'Jane Doe', email: 'jane2@example.com', password: '123',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed phone number at the validation layer', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      name: 'Jane Doe', email: 'jane3@example.com', password: 'password123', phone: '123',
    });
    expect(res.status).toBe(400);
  });

  it('never returns the password hash in the response', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      name: 'Jane Doe', email: 'nohash@example.com', password: 'password123',
    });
    expect(JSON.stringify(res.body)).not.toContain('$2a$'); // bcrypt hash prefix
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await User.__seed({ name: 'Jane Doe', email: 'jane@example.com', password: 'password123' });
  });

  it('logs in successfully with correct email + password', async () => {
    const res = await request(app).post('/api/auth/login').send({ emailOrPhone: 'jane@example.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toEqual(expect.any(String));
  });

  it('rejects an incorrect password with 401 and a generic message (no user enumeration)', async () => {
    const res = await request(app).post('/api/auth/login').send({ emailOrPhone: 'jane@example.com', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });

  it('rejects a non-existent account with the same generic message', async () => {
    const res = await request(app).post('/api/auth/login').send({ emailOrPhone: 'nobody@example.com', password: 'password123' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });

  it('normalizes Gmail addresses the same way signup does (dots removed, lowercased)', async () => {
    const res = await request(app).post('/api/auth/login').send({ emailOrPhone: 'JANE@example.com', password: 'password123' });
    expect(res.status).toBe(200);
  });

  it('rejects login for a Google-only account attempted with a password', async () => {
    await User.__seed({ name: 'Google User', email: 'g@example.com', googleId: 'g-123', authProvider: 'google', isVerified: true });
    const res = await request(app).post('/api/auth/login').send({ emailOrPhone: 'g@example.com', password: 'whatever1' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Google Sign-In/);
  });

  it('rejects missing credentials at the validation layer', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/google', () => {
  it('creates a new user on first-time Google login', async () => {
    OAuth2Client.mockImplementation(() => ({
      verifyIdToken: jest.fn().mockResolvedValue({
        getPayload: () => ({ sub: 'google-uid-1', email: 'newgoogle@example.com', name: 'G User', picture: 'https://pic.example.com/a.png' }),
      }),
    }));
    // auth.controller instantiates OAuth2Client once at module load, so we
    // must re-require the controller after (re)configuring the mock.
    jest.resetModules();
    jest.doMock('google-auth-library', () => ({ OAuth2Client: jest.fn().mockImplementation(() => ({
      verifyIdToken: jest.fn().mockResolvedValue({
        getPayload: () => ({ sub: 'google-uid-1', email: 'newgoogle@example.com', name: 'G User', picture: 'https://pic.example.com/a.png' }),
      }),
    })) }));
    jest.doMock('../../../src/modules/user/user.model', () => require('../../mocks/models/user.model.mock'));
    jest.doMock('../../../src/services/email.service', () => require('../../mocks/services/email.service.mock'));
    jest.doMock('../../../src/services/supabase.service', () => require('../../mocks/services/supabase.service.mock'));
    const freshRoutes = require('../../../src/modules/auth/auth.routes');
    const freshApp = express();
    freshApp.use(express.json());
    freshApp.use('/api/auth', freshRoutes);

    const res = await request(freshApp).post('/api/auth/google').send({ credential: 'fake-id-token' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('newgoogle@example.com');
    expect(res.body.data.user.isVerified).toBe(true);
  });

  it('rejects a request with no credential at the validation layer', async () => {
    const res = await request(app).post('/api/auth/google').send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the authenticated user profile with a valid token', async () => {
    const signupRes = await request(app).post('/api/auth/signup').send({
      name: 'Jane Doe', email: 'me@example.com', password: 'password123',
    });
    const token = signupRes.body.data.token;
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('me@example.com');
  });

  it('rejects an invalid/expired token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/forgot-password', () => {
  it('does not reveal whether an email exists (same message either way)', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'unknown@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if this email exists/i);
  });

  it('sends a reset email for an existing local account', async () => {
    await User.__seed({ name: 'Jane', email: 'reset@example.com', password: 'password123' });
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'reset@example.com' });
    expect(res.status).toBe(200);
    expect(emailService.sendPasswordResetEmail).toHaveBeenCalled();
  });

  it('refuses password reset for a Google-only account', async () => {
    await User.__seed({ name: 'Google Res', email: 'gres@example.com', googleId: 'gg-1', authProvider: 'google', isVerified: true });
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'gres@example.com' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/reset-password', () => {
  it('resets the password with a valid token and allows login with the new password', async () => {
    const user = await User.__seed({ name: 'Jane', email: 'pw@example.com', password: 'oldpassword' });
    const rawToken = user.generateResetPasswordToken();
    await user.save();

    const res = await request(app).post('/api/auth/reset-password').send({ token: rawToken, password: 'newpassword1' });
    expect(res.status).toBe(200);

    const loginRes = await request(app).post('/api/auth/login').send({ emailOrPhone: 'pw@example.com', password: 'newpassword1' });
    expect(loginRes.status).toBe(200);
  });

  it('rejects an invalid/unknown reset token', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({ token: 'bogus-token', password: 'newpassword1' });
    expect(res.status).toBe(400);
  });

  it('rejects a request missing the new password at the validation layer', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({ token: 'whatever' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/github', () => {
  it('redirects to the GitHub login authorize URL', async () => {
    const res = await request(app).get('/api/auth/github');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://github.com/login/oauth/authorize?mock=login');
  });

  it('returns 503 when GitHub sign-in is not configured', async () => {
    githubService.isGithubLoginConfigured.mockReturnValueOnce(false);
    const res = await request(app).get('/api/auth/github');
    expect(res.status).toBe(503);
  });
});

describe('GET /api/auth/github/callback', () => {
  const makeLoginState = (overrides = {}) =>
    jwt.sign({ purpose: 'github_login', nonce: 'test-nonce', ...overrides }, process.env.JWT_SECRET, { expiresIn: '10m' });

  it('creates a new user on first-time GitHub sign-in and posts a success message', async () => {
    githubService.getAuthenticatedUser.mockResolvedValueOnce({ id: 777, username: 'newocto', avatarUrl: 'https://a.example.com/x.png', name: 'New Octo' });
    githubService.getPrimaryVerifiedEmail.mockResolvedValueOnce('newocto@example.com');

    const res = await request(app).get('/api/auth/github/callback').query({ code: 'abc', state: makeLoginState() });

    expect(res.status).toBe(200);
    expect(res.text).toContain('github-auth-success');
    expect(res.text).toContain('newocto@example.com');

    const created = User.__all().find((u) => u.email === 'newocto@example.com');
    expect(created).toBeDefined();
    expect(created.githubId).toBe('777');
    expect(created.authProvider).toBe('github');
    expect(created.isVerified).toBe(true);
  });

  it('logs an existing GitHub-linked user back in without creating a duplicate', async () => {
    await User.__seed({ name: 'Returning', email: 'returning@example.com', githubId: '555111', githubUsername: 'octocat', authProvider: 'github', isVerified: true });

    const res = await request(app).get('/api/auth/github/callback').query({ code: 'abc', state: makeLoginState() });

    expect(res.status).toBe(200);
    expect(res.text).toContain('github-auth-success');
    expect(User.__all().filter((u) => u.githubId === '555111').length).toBe(1);
  });

  it('safely links GitHub to an existing local account with a matching verified email', async () => {
    await User.__seed({ name: 'Local Jane', email: 'octocat@example.com', password: 'password123', authProvider: 'local' });

    const res = await request(app).get('/api/auth/github/callback').query({ code: 'abc', state: makeLoginState() });

    expect(res.status).toBe(200);
    expect(res.text).toContain('github-auth-success');
    const linked = User.__all().find((u) => u.email === 'octocat@example.com');
    expect(linked.githubId).toBe('555111');
    // Linking must not touch the existing password-based login path.
    expect(await linked.comparePassword('password123')).toBe(true);
  });

  it('refuses to link when the verified email already belongs to a different GitHub account', async () => {
    await User.__seed({ name: 'Someone Else', email: 'octocat@example.com', githubId: 'a-totally-different-id', authProvider: 'github', isVerified: true });

    const res = await request(app).get('/api/auth/github/callback').query({ code: 'abc', state: makeLoginState() });

    expect(res.status).toBe(200);
    expect(res.text).toContain('github-auth-error');
    expect(res.text).toMatch(/different GitHub account/i);
    // No new account should have been created for the incoming GitHub id.
    expect(User.__all().find((u) => u.githubId === '555111')).toBeUndefined();
  });

  it('declines gracefully when GitHub reports no verified email', async () => {
    githubService.getPrimaryVerifiedEmail.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/auth/github/callback').query({ code: 'abc', state: makeLoginState() });
    expect(res.status).toBe(200);
    expect(res.text).toContain('github-auth-error');
    expect(res.text).toMatch(/verified email/i);
  });

  it('rejects a missing code or state', async () => {
    const res = await request(app).get('/api/auth/github/callback').query({ state: makeLoginState() });
    expect(res.text).toContain('github-auth-error');
  });

  it('rejects a state signed for a different purpose (e.g. the repo-export flow)', async () => {
    const wrongPurposeState = makeLoginState({ purpose: 'github_oauth' });
    const res = await request(app).get('/api/auth/github/callback').query({ code: 'abc', state: wrongPurposeState });
    expect(res.text).toContain('github-auth-error');
    expect(res.text).toMatch(/invalid sign-in request/i);
  });

  it('rejects a tampered/invalid state token', async () => {
    const res = await request(app).get('/api/auth/github/callback').query({ code: 'abc', state: 'not-a-real-jwt' });
    expect(res.text).toContain('github-auth-error');
  });

  it('surfaces GitHub-reported OAuth errors (e.g. the user denied access)', async () => {
    const res = await request(app).get('/api/auth/github/callback').query({ error: 'access_denied' });
    expect(res.text).toContain('github-auth-error');
  });
});
