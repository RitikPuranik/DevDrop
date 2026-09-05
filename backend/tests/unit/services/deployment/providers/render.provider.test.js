jest.mock('axios');
const axios = require('axios');
const provider = require('../../../../../src/services/deployment/providers/render.provider');

describe('render.provider', () => {
  describe('isConfigured', () => {
    it('is always configured (no app-level registration needed)', () => {
      expect(provider.isConfigured()).toBe(true);
    });
  });

  describe('listOwners', () => {
    it('unwraps the {owner} envelope Render returns for list endpoints', async () => {
      const get = jest.fn().mockResolvedValue({
        data: [
          { owner: { id: 'own_1', name: 'Acme Inc', type: 'team' } },
          { owner: { id: 'own_2', email: 'me@example.com', type: 'user' } },
        ],
      });
      axios.create = jest.fn(() => ({ get }));

      const owners = await provider.listOwners('api-key');

      expect(owners).toEqual([
        { id: 'own_1', name: 'Acme Inc', type: 'team' },
        { id: 'own_2', name: 'me@example.com', type: 'user' },
      ]);
      expect(get).toHaveBeenCalledWith('/owners', { params: { limit: 100 } });
    });

    it('returns an empty list when Render responds with a non-array payload', async () => {
      const get = jest.fn().mockResolvedValue({ data: null });
      axios.create = jest.fn(() => ({ get }));

      const owners = await provider.listOwners('api-key');

      expect(owners).toEqual([]);
    });
  });

  describe('validateConnection', () => {
    it('returns ok:true and picks the owner matching metadata.ownerId', async () => {
      const get = jest.fn().mockResolvedValue({
        data: [{ owner: { id: 'own_1', name: 'First' } }, { owner: { id: 'own_2', name: 'Second' } }],
      });
      axios.create = jest.fn(() => ({ get }));

      const result = await provider.validateConnection('api-key', { ownerId: 'own_2' });

      expect(result.ok).toBe(true);
      expect(result.accountLabel).toBe('Second');
      expect(result.owners).toHaveLength(2);
    });

    it('falls back to the first owner when metadata.ownerId is not found', async () => {
      const get = jest.fn().mockResolvedValue({ data: [{ owner: { id: 'own_1', name: 'Only Owner' } }] });
      axios.create = jest.fn(() => ({ get }));

      const result = await provider.validateConnection('api-key', { ownerId: 'missing' });

      expect(result.ok).toBe(true);
      expect(result.accountLabel).toBe('Only Owner');
    });

    it('returns ok:false with a reason when the API key is invalid', async () => {
      const get = jest.fn().mockRejectedValue({ response: { status: 401, data: { message: 'Unauthorized' } } });
      axios.create = jest.fn(() => ({ get }));

      const result = await provider.validateConnection('bad-key', {});

      expect(result).toEqual({ ok: false, reason: 'Unauthorized' });
    });
  });

  describe('ensureProject', () => {
    it('adopts an existing service when existing.serviceId still resolves', async () => {
      const get = jest.fn().mockResolvedValue({ data: { id: 'srv_1', name: 'my-api', serviceDetails: { url: 'https://my-api.onrender.com' } } });
      axios.create = jest.fn(() => ({ get, post: jest.fn() }));

      const result = await provider.ensureProject('api-key', {}, { serviceName: 'my-api' }, { serviceId: 'srv_1' });

      expect(result).toEqual({ serviceId: 'srv_1', serviceName: 'my-api', url: 'https://my-api.onrender.com' });
      expect(get).toHaveBeenCalledWith('/services/srv_1');
    });

    it('recreates the service when the existing serviceId 404s on Render', async () => {
      const get = jest.fn().mockRejectedValue({ response: { status: 404 } });
      const post = jest.fn().mockResolvedValue({ data: { id: 'srv_new', name: 'my-api', serviceDetails: {} } });
      axios.create = jest.fn(() => ({ get, post }));

      const result = await provider.ensureProject(
        'api-key',
        { ownerId: 'own_1' },
        { serviceName: 'my-api', repoOwner: 'me', repoName: 'my-repo', startCommand: 'node server.js' },
        { serviceId: 'srv_gone' }
      );

      expect(result).toEqual({ serviceId: 'srv_new', serviceName: 'my-api', url: null });
      expect(post).toHaveBeenCalled();
    });

    it('throws a wrapped error when the existing-service lookup fails for a non-404 reason', async () => {
      const get = jest.fn().mockRejectedValue({ response: { status: 500, data: { message: 'boom' } } });
      axios.create = jest.fn(() => ({ get, post: jest.fn() }));

      await expect(
        provider.ensureProject('api-key', {}, { serviceName: 'my-api' }, { serviceId: 'srv_1' })
      ).rejects.toMatchObject({ provider: 'render', status: 500 });
    });

    it('throws when no Render workspace (ownerId) has been selected yet', async () => {
      axios.create = jest.fn(() => ({ get: jest.fn(), post: jest.fn() }));

      await expect(
        provider.ensureProject('api-key', {}, { serviceName: 'my-api', repoOwner: 'me', repoName: 'my-repo' }, null)
      ).rejects.toThrow('No Render workspace selected for this connection yet.');
    });

    it('creates a new web service under the selected owner when there is no existing service', async () => {
      const post = jest.fn().mockResolvedValue({ data: { id: 'srv_new', name: 'my-api', serviceDetails: { url: 'https://my-api.onrender.com' } } });
      axios.create = jest.fn(() => ({ get: jest.fn(), post }));

      const result = await provider.ensureProject(
        'api-key',
        { ownerId: 'own_1' },
        { serviceName: 'my-api', repoOwner: 'me', repoName: 'my-repo', branch: 'main', startCommand: 'node server.js' },
        null
      );

      expect(result).toEqual({ serviceId: 'srv_new', serviceName: 'my-api', url: 'https://my-api.onrender.com' });
      expect(post).toHaveBeenCalledWith(
        '/services',
        expect.objectContaining({
          type: 'web_service',
          ownerId: 'own_1',
          repo: 'https://github.com/me/my-repo',
          name: 'my-api',
        })
      );
    });

    it('throws a wrapped error when service creation fails', async () => {
      const post = jest.fn().mockRejectedValue({ response: { status: 400, data: { message: 'Invalid repo' } } });
      axios.create = jest.fn(() => ({ get: jest.fn(), post }));

      await expect(
        provider.ensureProject('api-key', { ownerId: 'own_1' }, { serviceName: 'my-api', repoOwner: 'me', repoName: 'bad-repo' }, null)
      ).rejects.toMatchObject({ provider: 'render', status: 400 });
    });
  });

  describe('configureEnvironment', () => {
    it('sends the full variable set as a single PUT (Render replaces, not merges)', async () => {
      const put = jest.fn().mockResolvedValue({ data: {} });
      axios.create = jest.fn(() => ({ put }));

      await provider.configureEnvironment('api-key', {}, 'srv_1', [
        { key: 'A', value: '1' },
        { key: 'B', value: '2' },
      ]);

      expect(put).toHaveBeenCalledTimes(1);
      expect(put).toHaveBeenCalledWith('/services/srv_1/env-vars', [
        { key: 'A', value: '1' },
        { key: 'B', value: '2' },
      ]);
    });

    it('throws a wrapped error when setting environment variables fails', async () => {
      const put = jest.fn().mockRejectedValue({ response: { status: 400, data: { message: 'bad value' } } });
      axios.create = jest.fn(() => ({ put }));

      await expect(
        provider.configureEnvironment('api-key', {}, 'srv_1', [{ key: 'A', value: '1' }])
      ).rejects.toMatchObject({ provider: 'render', status: 400, message: expect.stringContaining('setting environment variables') });
    });
  });

  describe('deploy', () => {
    it('triggers a deployment without clearing the build cache', async () => {
      const post = jest.fn().mockResolvedValue({ data: { id: 'dep_1' } });
      axios.create = jest.fn(() => ({ post }));

      const result = await provider.deploy('api-key', {}, { serviceId: 'srv_1' });

      expect(result).toEqual({ deployId: 'dep_1' });
      expect(post).toHaveBeenCalledWith('/services/srv_1/deploys', { clearCache: 'do_not_clear' });
    });

    it('throws a wrapped error when triggering the deployment fails', async () => {
      const post = jest.fn().mockRejectedValue({ response: { status: 500, data: { message: 'server error' } } });
      axios.create = jest.fn(() => ({ post }));

      await expect(provider.deploy('api-key', {}, { serviceId: 'srv_1' })).rejects.toMatchObject({
        provider: 'render',
        status: 500,
      });
    });
  });

  describe('getDeploymentStatus', () => {
    it('reports a successful, terminal deploy and fetches the live service URL', async () => {
      const get = jest
        .fn()
        .mockResolvedValueOnce({ data: { status: 'live' } })
        .mockResolvedValueOnce({ data: { serviceDetails: { url: 'https://my-api.onrender.com' } } });
      axios.create = jest.fn(() => ({ get }));

      const result = await provider.getDeploymentStatus('api-key', {}, 'srv_1', 'dep_1');

      expect(result).toEqual({ state: 'live', isTerminal: true, isSuccess: true, url: 'https://my-api.onrender.com' });
      expect(get).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['build_failed', true, false],
      ['update_failed', true, false],
      ['canceled', true, false],
      ['pre_deploy_failed', true, false],
      ['deactivated', true, false],
    ])('reports state %s as terminal failure without a url', async (state, isTerminal, isSuccess) => {
      const get = jest.fn().mockResolvedValue({ data: { status: state } });
      axios.create = jest.fn(() => ({ get }));

      const result = await provider.getDeploymentStatus('api-key', {}, 'srv_1', 'dep_1');

      expect(result).toEqual({ state, isTerminal, isSuccess, url: null });
      expect(get).toHaveBeenCalledTimes(1);
    });

    it('reports an in-progress build as non-terminal without a second lookup', async () => {
      const get = jest.fn().mockResolvedValue({ data: { status: 'build_in_progress' } });
      axios.create = jest.fn(() => ({ get }));

      const result = await provider.getDeploymentStatus('api-key', {}, 'srv_1', 'dep_1');

      expect(result).toEqual({ state: 'build_in_progress', isTerminal: false, isSuccess: false, url: null });
      expect(get).toHaveBeenCalledTimes(1);
    });
  });
});
