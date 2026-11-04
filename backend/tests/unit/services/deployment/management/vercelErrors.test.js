const { classifyVercelError } = require('../../../../../src/services/deployment/vercelErrors');

describe('classifyVercelError', () => {
  const http = (status, data) => ({ response: { status, data } });
  it('maps 402 to a plan restriction', () => expect(classifyVercelError(http(402)).code).toBe('PLAN_RESTRICTION'));
  it('maps 401/403/404/410/429', () => {
    expect(classifyVercelError(http(401)).code).toBe('AUTH_REJECTED');
    expect(classifyVercelError(http(403)).code).toBe('PERMISSION_DENIED');
    expect(classifyVercelError(http(404)).code).toBe('NOT_FOUND');
    expect(classifyVercelError(http(410)).code).toBe('GONE');
    expect(classifyVercelError(http(429)).retryable).toBe(true);
  });
  it('treats 5xx and timeouts as retryable', () => {
    expect(classifyVercelError(http(502)).retryable).toBe(true);
    expect(classifyVercelError({ code: 'ECONNABORTED', message: 'timeout' }).code).toBe('TIMEOUT');
  });
  it('never includes tokens from the response in the message', () => {
    const msg = classifyVercelError(http(400, { error: { message: 'x' } })).message;
    expect(msg).not.toMatch(/Bearer/);
  });
});
