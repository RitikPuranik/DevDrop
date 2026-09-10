import { Request, Response, NextFunction } from 'express';

jest.mock('../../../src/storage/SupabaseClient', () => ({
  getSupabaseClient: jest.fn(),
}));

import { optionalAuth, AuthenticatedRequest } from '../../../src/api/middleware/supabaseAuth';
import { getSupabaseClient } from '../../../src/storage/SupabaseClient';

const mockNext = (): NextFunction => jest.fn();

const mockReq = (headers: Record<string, string> = {}): AuthenticatedRequest =>
  ({ headers, method: 'POST', path: '/api/generate' } as unknown as AuthenticatedRequest);

describe('optionalAuth — DevDrop service-to-service integration', () => {
  const originalServiceKey = process.env.SERVICE_API_KEY;

  beforeEach(() => {
    process.env.SERVICE_API_KEY = 'shared-secret';
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env.SERVICE_API_KEY = originalServiceKey;
  });

  it('trusts a request carrying a matching X-Service-Key and X-User-Id, without calling Supabase', async () => {
    const req = mockReq({ 'x-service-key': 'shared-secret', 'x-user-id': 'devdrop-user-42' });
    const next = mockNext();

    await optionalAuth(req, {} as Response, next);

    expect(req.userId).toBe('devdrop-user-42');
    expect(req.user).toEqual({ id: 'devdrop-user-42', role: 'user' });
    expect(getSupabaseClient).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('does not trust a request with a wrong service key', async () => {
    (getSupabaseClient as jest.Mock).mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } }) },
    });
    const req = mockReq({ 'x-service-key': 'wrong-secret', 'x-user-id': 'devdrop-user-42' });
    const next = mockNext();

    await optionalAuth(req, {} as Response, next);

    expect(req.userId).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('falls through to normal Supabase JWT auth when no service key header is present', async () => {
    (getSupabaseClient as jest.Mock).mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'supabase-user-1', email: 'a@b.com' } }, error: null }),
      },
    });
    const req = mockReq({ authorization: 'Bearer some-supabase-jwt' });
    const next = mockNext();

    await optionalAuth(req, {} as Response, next);

    expect(req.userId).toBe('supabase-user-1');
    expect(next).toHaveBeenCalled();
  });

  it('ignores X-User-Id when SERVICE_API_KEY is not configured (fails closed)', async () => {
    delete process.env.SERVICE_API_KEY;
    const req = mockReq({ 'x-service-key': 'shared-secret', 'x-user-id': 'devdrop-user-42' });
    const next = mockNext();

    await optionalAuth(req, {} as Response, next);

    expect(req.userId).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });
});
