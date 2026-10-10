const { errorHandler, notFound } = require('../../../src/shared/middleware/errorHandler');

const mockRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });

describe('errorHandler middleware', () => {
  let consoleErrorSpy;
  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => consoleErrorSpy.mockRestore());

  it('formats a Mongoose ValidationError as 400 with a flattened error list', () => {
    const err = { name: 'ValidationError', errors: { email: { message: 'Invalid email' }, name: { message: 'Too short' } } };
    const res = mockRes();
    errorHandler(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      errors: ['Invalid email', 'Too short'],
    }));
  });

  it('formats a duplicate key error (11000) as 400 naming the offending field', () => {
    const err = { code: 11000, keyPattern: { email: 1 } };
    const res = mockRes();
    errorHandler(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'email already exists' }));
  });

  it('formats a CastError (bad ObjectId) as 400', () => {
    const err = { name: 'CastError' };
    const res = mockRes();
    errorHandler(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invalid ID format' }));
  });

  it('formats JWT errors as 401', () => {
    const res1 = mockRes();
    errorHandler({ name: 'JsonWebTokenError' }, {}, res1, () => {});
    expect(res1.status).toHaveBeenCalledWith(401);

    const res2 = mockRes();
    errorHandler({ name: 'TokenExpiredError' }, {}, res2, () => {});
    expect(res2.status).toHaveBeenCalledWith(401);
    expect(res2.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Token expired' }));
  });

  it('falls back to 500 with the error message for unrecognized errors', () => {
    const err = new Error('Something exploded');
    const res = mockRes();
    errorHandler(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Something exploded' }));
  });

  it('respects a custom statusCode on the error object', () => {
    const err = { statusCode: 418, message: "I'm a teapot" };
    const res = mockRes();
    errorHandler(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(418);
  });

  it('does not leak the stack trace outside development', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const err = new Error('boom');
    const res = mockRes();
    errorHandler(err, {}, res, () => {});
    const payload = res.json.mock.calls[0][0];
    expect(payload.stack).toBeUndefined();
    process.env.NODE_ENV = originalEnv;
  });
});

describe('notFound middleware', () => {
  it('returns a 404 naming the missing route', () => {
    const res = mockRes();
    notFound({ originalUrl: '/api/does-not-exist' }, res, () => {});
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Route /api/does-not-exist not found',
    }));
  });
});
