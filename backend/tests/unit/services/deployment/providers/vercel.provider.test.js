jest.mock('axios');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const provider = require('../../../../../src/services/deployment/providers/vercel.provider');

const ORIGINAL_ENV = process.env;

describe('vercel.provider', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      VERCEL_CLIENT_ID: 'client-id',
      VERCEL_CLIENT_SECRET: 'super-secret-value',
      VERCEL_OAUTH_REDIRECT_URI: 'https://devdrop.example.com/callback',
      VERCEL_INTEGRATION_SLUG: 'devdrop',
      JWT_SECRET: 'test-jwt-secret',
    };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('isConfigured', () => {
    it('reports configured when all required env vars are present', () => {
      expect(provider.isConfigured()).toBe(true);
    });

    it('reports not configured when a required env var is missing', () => {
      delete process.env.VERCEL_CLIENT_SECRET;
      expect(provider.isConfigured()).toBe(false);
    });
  });

  describe('getInstallUrl', () => {
    it('builds an install URL including state and next when provided', () => {
      const url = provider.getInstallUrl({ state: 'abc123', next: 'https://app.example.com/done' });
      expect(url).toContain('https://vercel.com/integrations/devdrop/new');
      expect(url).toContain('state=abc123');
      expect(url).toContain(encodeURIComponent('https://app.example.com/done'));
    });

    it('omits state and next query params when not provided', () => {
      const url = provider.getInstallUrl();
      expect(url).toBe('https://vercel.com/integrations/devdrop/new');
    });

    it('throws when the integration slug is not configured', () => {
      delete process.env.VERCEL_INTEGRATION_SLUG;
      expect(() => provider.getInstallUrl()).toThrow('VERCEL_INTEGRATION_SLUG is not configured.');
    });
  });

  describe('createConnectState / verifyConnectState', () => {
    it('round-trips a userId through the signed state', () => {
      const state = provider.createConnectState('user-42');
      const decoded = provider.verifyConnectState(state);
      expect(decoded).toEqual({ userId: 'user-42' });
    });

    it('rejects a state signed for a different purpose', () => {
      const badState = jwt.sign({ purpose: 'something-else', userId: 'user-1' }, 'test-jwt-secret', { expiresIn: '10m' });
      expect(() => provider.verifyConnectState(badState)).toThrow('Invalid Vercel connection state.');
    });

    it('rejects a tampered/garbage state token', () => {
      expect(() => provider.verifyConnectState('not-a-real-jwt')).toThrow();
    });

    it('throws when JWT_SECRET is not configured', () => {
      delete process.env.JWT_SECRET;
      expect(() => provider.createConnectState('user-1')).toThrow('JWT_SECRET is not configured.');
    });
  });

  describe('exchangeCodeForToken', () => {
    it('returns normalized token fields on success, preferring the caller-supplied configurationId', async () => {
      axios.post = jest.fn().mockResolvedValue({
        data: {
          access_token: 'tok_abc',
          team_id: 'team_1',
          user_id: 'user_1',
          installation_id: 'inst_1',
          configuration_id: 'config_from_response',
        },
      });

      const result = await provider.exchangeCodeForToken('code123', 'config_from_caller');

      expect(result).toEqual({
        accessToken: 'tok_abc',
        teamId: 'team_1',
        vercelUserId: 'user_1',
        installationId: 'inst_1',
        configurationId: 'config_from_caller',
      });
      const [, body] = axios.post.mock.calls[0];
      expect(body).toContain('configurationId=config_from_caller');
    });

    it('falls back to the response configuration_id when the caller supplies none', async () => {
      axios.post = jest.fn().mockResolvedValue({ data: { access_token: 'tok_abc', configuration_id: 'config_from_response' } });

      const result = await provider.exchangeCodeForToken('code123');

      expect(result.configurationId).toBe('config_from_response');
      const [, body] = axios.post.mock.calls[0];
      expect(body).not.toContain('configurationId');
    });

    it('throws a clear error when Vercel omits the access token', async () => {
      axios.post = jest.fn().mockResolvedValue({ data: {} });

      await expect(provider.exchangeCodeForToken('code123')).rejects.toThrow('Vercel did not return an access token.');
    });

    it('maps a provider HTTP error to a status-tagged error with the provider message', async () => {
      axios.post = jest.fn().mockRejectedValue({
        response: { status: 400, data: { error: { message: 'Invalid authorization code.' } } },
      });

      await expect(provider.exchangeCodeForToken('bad-code')).rejects.toMatchObject({
        message: 'Invalid authorization code.',
        status: 400,
        provider: 'vercel',
      });
    });

    it('falls back to a generic message and 502 status when the error has no provider payload', async () => {
      axios.post = jest.fn().mockRejectedValue(new Error());

      await expect(provider.exchangeCodeForToken('bad-code')).rejects.toMatchObject({
        message: 'Vercel token exchange failed.',
        status: 502,
      });
    });
  });

  describe('getAuthenticatedUser / getTeam', () => {
    it('fetches and normalizes the authenticated user', async () => {
      axios.create = jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ data: { user: { id: 'u1', username: 'octocat', email: 'o@example.com' } } }),
      }));

      const user = await provider.getAuthenticatedUser('token');

      expect(user).toEqual({ id: 'u1', username: 'octocat', email: 'o@example.com' });
    });

    it('fetches and normalizes a team, falling back to slug when name is absent', async () => {
      axios.create = jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ data: { id: 'team_1', slug: 'my-team' } }),
      }));

      const team = await provider.getTeam('token', 'team_1');

      expect(team).toEqual({ id: 'team_1', name: 'my-team' });
    });
  });

  describe('validateConnection', () => {
    it('returns ok:true with an account label derived from metadata teamName', async () => {
      axios.create = jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ data: { user: { id: 'u1', username: 'octocat' } } }),
      }));

      const result = await provider.validateConnection('token', { teamName: 'Acme Team' });

      expect(result).toEqual({ ok: true, accountLabel: 'Acme Team' });
    });

    it('returns ok:false with a redacted reason when the credential is invalid', async () => {
      axios.create = jest.fn(() => ({
        get: jest.fn().mockRejectedValue({
          response: { status: 401, data: { error: { message: 'Invalid token super-secret-value used' } } },
        }),
      }));

      const result = await provider.validateConnection('bad-token', {});

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('Invalid token [redacted] used');
    });
  });

  describe('ensureProject', () => {
    it('adopts an existing project when existing.projectId still resolves', async () => {
      const get = jest.fn().mockResolvedValue({ data: { id: 'prj_1', name: 'my-app', link: { repoId: 55 } } });
      axios.create = jest.fn(() => ({ get, post: jest.fn() }));

      const result = await provider.ensureProject('token', {}, { projectName: 'my-app' }, { projectId: 'prj_1' });

      expect(result).toEqual({ projectId: 'prj_1', projectName: 'my-app', repoId: 55 });
      expect(get).toHaveBeenCalledWith('/v9/projects/prj_1');
    });

    it('recreates the project when the existing projectId 404s on Vercel', async () => {
      const get = jest.fn().mockRejectedValue({ response: { status: 404 } });
      const post = jest.fn().mockResolvedValue({ data: { id: 'prj_new', name: 'my-app', link: null } });
      axios.create = jest.fn(() => ({ get, post }));

      const result = await provider.ensureProject(
        'token',
        {},
        { projectName: 'my-app', repoOwner: 'me', repoName: 'my-repo' },
        { projectId: 'prj_gone' }
      );

      expect(result).toEqual({ projectId: 'prj_new', projectName: 'my-app', repoId: null });
      expect(post).toHaveBeenCalled();
    });

    it('throws a wrapped error when the existing-project lookup fails for a non-404 reason', async () => {
      const get = jest.fn().mockRejectedValue({ response: { status: 500, data: { error: { message: 'boom' } } } });
      axios.create = jest.fn(() => ({ get, post: jest.fn() }));

      await expect(
        provider.ensureProject('token', {}, { projectName: 'my-app' }, { projectId: 'prj_1' })
      ).rejects.toMatchObject({ provider: 'vercel', status: 500 });
    });

    it('creates a new project with a mapped framework preset when there is no existing project', async () => {
      const post = jest.fn().mockResolvedValue({ data: { id: 'prj_new', name: 'my-app', link: { repoId: 9 } } });
      axios.create = jest.fn(() => ({ get: jest.fn(), post }));

      const result = await provider.ensureProject(
        'token',
        {},
        { projectName: 'my-app', framework: 'Next.js', repoOwner: 'me', repoName: 'my-repo' },
        null
      );

      expect(result).toEqual({ projectId: 'prj_new', projectName: 'my-app', repoId: 9 });
      expect(post).toHaveBeenCalledWith(
        '/v9/projects',
        expect.objectContaining({ framework: 'nextjs', gitRepository: { type: 'github', repo: 'me/my-repo' } })
      );
    });

    it('adopts an already-existing project by name on a 409 conflict', async () => {
      const post = jest.fn().mockRejectedValue({ response: { status: 409, data: { error: { message: 'already exists' } } } });
      const get = jest.fn().mockResolvedValue({ data: { id: 'prj_existing', name: 'my-app', link: { repoId: 3 } } });
      axios.create = jest.fn(() => ({ get, post }));

      const result = await provider.ensureProject('token', {}, { projectName: 'my-app' }, null);

      expect(result).toEqual({ projectId: 'prj_existing', projectName: 'my-app', repoId: 3 });
      expect(get).toHaveBeenCalledWith('/v9/projects/my-app');
    });

    it('throws a wrapped error when project creation fails for an unrelated reason', async () => {
      const post = jest.fn().mockRejectedValue({ response: { status: 400, data: { error: { message: 'Invalid name' } } } });
      axios.create = jest.fn(() => ({ get: jest.fn(), post }));

      await expect(
        provider.ensureProject('token', {}, { projectName: 'bad name!' }, null)
      ).rejects.toMatchObject({ provider: 'vercel', status: 400 });
    });
  });

  describe('configureEnvironment', () => {
    it('upserts every variable to the project env endpoint', async () => {
      const post = jest.fn().mockResolvedValue({ data: {} });
      axios.create = jest.fn(() => ({ post }));

      await provider.configureEnvironment('token', {}, 'prj_1', [
        { key: 'A', value: '1' },
        { key: 'B', value: '2' },
      ]);

      expect(post).toHaveBeenCalledTimes(2);
      expect(post).toHaveBeenNthCalledWith(
        1,
        '/v10/projects/prj_1/env?upsert=true',
        expect.objectContaining({ key: 'A', value: '1', type: 'encrypted' })
      );
    });

    it('throws a wrapped error naming the failing variable', async () => {
      const post = jest.fn().mockRejectedValue({ response: { status: 400, data: { error: { message: 'bad value' } } } });
      axios.create = jest.fn(() => ({ post }));

      await expect(
        provider.configureEnvironment('token', {}, 'prj_1', [{ key: 'SECRET_KEY', value: 'x' }])
      ).rejects.toMatchObject({ message: expect.stringContaining('setting SECRET_KEY') });
    });
  });

  describe('deploy', () => {
    it('triggers a deployment and returns the deploy id and https url', async () => {
      const post = jest.fn().mockResolvedValue({ data: { id: 'dpl_1', url: 'my-app.vercel.app' } });
      axios.create = jest.fn(() => ({ post }));

      const result = await provider.deploy('token', {}, { projectName: 'my-app', projectId: 'prj_1', repoId: 5 }, { branch: 'main' });

      expect(result).toEqual({ deployId: 'dpl_1', url: 'https://my-app.vercel.app' });
    });

    it('returns a null url when Vercel does not provide one', async () => {
      const post = jest.fn().mockResolvedValue({ data: { id: 'dpl_1' } });
      axios.create = jest.fn(() => ({ post }));

      const result = await provider.deploy('token', {}, { projectName: 'my-app', projectId: 'prj_1' }, {});

      expect(result).toEqual({ deployId: 'dpl_1', url: null });
    });

    it('throws a wrapped error when the deployment trigger fails', async () => {
      const post = jest.fn().mockRejectedValue({ response: { status: 403, data: { error: { message: 'forbidden' } } } });
      axios.create = jest.fn(() => ({ post }));

      await expect(
        provider.deploy('token', {}, { projectName: 'my-app', projectId: 'prj_1' }, {})
      ).rejects.toMatchObject({ provider: 'vercel', status: 403 });
    });
  });

  describe('getDeploymentStatus', () => {
    it.each([
      ['QUEUED', false, false],
      ['BUILDING', false, false],
      ['READY', true, true],
      ['ERROR', true, false],
      ['CANCELED', true, false],
    ])('maps readyState %s to isTerminal=%s isSuccess=%s', async (state, isTerminal, isSuccess) => {
      const get = jest.fn().mockResolvedValue({ data: { readyState: state, url: 'my-app.vercel.app' } });
      axios.create = jest.fn(() => ({ get }));

      const result = await provider.getDeploymentStatus('token', {}, 'dpl_1');

      expect(result).toEqual({ state, isTerminal, isSuccess, url: 'https://my-app.vercel.app' });
    });
  });

  describe('cancelDeployment', () => {
    it('calls the cancel endpoint and resolves without a value', async () => {
      const patch = jest.fn().mockResolvedValue({ data: {} });
      axios.create = jest.fn(() => ({ patch }));

      await expect(provider.cancelDeployment('token', {}, 'dpl_1')).resolves.toBeUndefined();
      expect(patch).toHaveBeenCalledWith('/v12/deployments/dpl_1/cancel');
    });

    it('never throws even if the cancel request fails (best-effort)', async () => {
      const patch = jest.fn().mockRejectedValue(new Error('already terminal'));
      axios.create = jest.fn(() => ({ patch }));

      await expect(provider.cancelDeployment('token', {}, 'dpl_1')).resolves.toBeUndefined();
    });
  });
});
