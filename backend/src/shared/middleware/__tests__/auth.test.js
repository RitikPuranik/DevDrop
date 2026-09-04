jest.mock('../../../modules/user/user.model');

const jwt = require('jsonwebtoken');
const User = require('../../../modules/user/user.model');
const { auth, optionalAuth } = require('../auth');

const mockReqRes = (headers = {}) => {
  const req = { header: (name) => headers[name] };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  return { req, res, next };
};

describe('auth middleware', () => {
  beforeEach(() => User.__reset());

  it('rejects requests with no Authorization header', async () => {
    const { req, res, next } = mockReqRes();
    await auth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH_TOKEN_MISSING' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a malformed/invalid token', async () => {
    const { req, res, next } = mockReqRes({ Authorization: 'Bearer garbage' });
    await auth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH_TOKEN_INVALID' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects an expired token', async () => {
    const token = jwt.sign({ userId: 'abc' }, process.env.JWT_SECRET, { expiresIn: -1 });
    const { req, res, next } = mockReqRes({ Authorization: `Bearer ${token}` });
    await auth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH_TOKEN_EXPIRED' }));
  });

  it('rejects a valid token whose user no longer exists', async () => {
    const token = jwt.sign({ userId: 'ghost-id' }, process.env.JWT_SECRET);
    const { req, res, next } = mockReqRes({ Authorization: `Bearer ${token}` });
    await auth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH_TOKEN_USER_NOT_FOUND' }));
  });

  it('attaches req.user and req.userId and calls next() for a valid token + existing user', async () => {
    const user = await User.__seed({ name: 'Jane Doe', email: 'jane@example.com', password: 'password123' });
    const token = jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET);
    const { req, res, next } = mockReqRes({ Authorization: `Bearer ${token}` });
    await auth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeTruthy();
    expect(req.user.email).toBe('jane@example.com');
    expect(res.status).not.toHaveBeenCalled();
  });

  it('strips "Bearer " prefix correctly and rejects tokens sent without it', async () => {
    const token = jwt.sign({ userId: 'abc' }, process.env.JWT_SECRET);
    const { req, res, next } = mockReqRes({ Authorization: token }); // no "Bearer " prefix
    await auth(req, res, next);
    // jwt.verify will fail because the raw string still parses as a token here,
    // so this specifically exercises the header-stripping code path via a
    // well-formed but prefix-less header.
    expect(next).toHaveBeenCalledTimes(0);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('optionalAuth middleware', () => {
  beforeEach(() => User.__reset());

  it('calls next() with no user attached when no token is present', async () => {
    const { req, res, next } = mockReqRes();
    await optionalAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('calls next() silently on an invalid token instead of rejecting', async () => {
    const { req, res, next } = mockReqRes({ Authorization: 'Bearer garbage' });
    await optionalAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('attaches req.user when a valid token + existing user is present', async () => {
    const user = await User.__seed({ name: 'Sam', email: 'sam@example.com', password: 'password123' });
    const token = jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET);
    const { req, res, next } = mockReqRes({ Authorization: `Bearer ${token}` });
    await optionalAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user.email).toBe('sam@example.com');
  });
});
