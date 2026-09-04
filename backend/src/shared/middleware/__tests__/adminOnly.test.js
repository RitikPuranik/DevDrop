const adminOnly = require('../adminOnly');

const mockReqRes = (user) => {
  const req = { user };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  return { req, res, next };
};

describe('adminOnly middleware', () => {
  it('rejects with 401 when no user is attached (unauthenticated)', () => {
    const { req, res, next } = mockReqRes(undefined);
    adminOnly(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects with 403 for a non-admin user', () => {
    const { req, res, next } = mockReqRes({ role: 'user' });
    adminOnly(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() for an admin user', () => {
    const { req, res, next } = mockReqRes({ role: 'admin' });
    adminOnly(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
