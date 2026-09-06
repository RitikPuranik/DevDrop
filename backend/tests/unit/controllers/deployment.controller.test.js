jest.mock('../../../src/modules/website/website.model');
jest.mock('../../../src/modules/payment/purchase.model');
jest.mock('../../../src/modules/github/githubConnection.model');
jest.mock('../../../src/modules/github/projectExport.model');
jest.mock('../../../src/modules/deployment/deployment.model');
jest.mock('../../../src/modules/deployment/deploymentProviderConnection.model');
jest.mock('../../../src/services/github.service');
jest.mock('../../../src/services/deployment/analyzer', () => ({ analyzeRepository: jest.fn() }));
jest.mock('../../../src/services/deployment/orchestrator', () => ({ runDeployment: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../src/services/deployment/providers/vercel.provider');
jest.mock('../../../src/services/deployment/providers/render.provider');
jest.mock('../../../src/shared/utils/crypto', () => ({
  encrypt: jest.fn((v) => `enc(${v})`),
  decrypt: jest.fn((v) => v.replace(/^enc\(/, '').replace(/\)$/, '')),
}));

const Purchase = require('../../../src/modules/payment/purchase.model');
const GithubConnection = require('../../../src/modules/github/githubConnection.model');
const ProjectExport = require('../../../src/modules/github/projectExport.model');
const Deployment = require('../../../src/modules/deployment/deployment.model');
const DeploymentProviderConnection = require('../../../src/modules/deployment/deploymentProviderConnection.model');
const githubService = require('../../../src/services/github.service');
const { analyzeRepository } = require('../../../src/services/deployment/analyzer');
const { runDeployment } = require('../../../src/services/deployment/orchestrator');
const vercelProvider = require('../../../src/services/deployment/providers/vercel.provider');
const renderProvider = require('../../../src/services/deployment/providers/render.provider');
const deploymentController = require('../../../src/modules/deployment/deployment.controller');
const { createQueryMock, mockReq, mockRes } = require('../../helpers/mockQuery');

beforeEach(() => {
  process.env.FRONTEND_URL = 'https://devdrop.example.com';
});

describe('deployment.controller', () => {
  describe('getProviders', () => {
    it('reports connection state for github/vercel/render', async () => {
      GithubConnection.findOne.mockResolvedValue({ githubUsername: 'oct', githubAvatarUrl: 'a.png' });
      DeploymentProviderConnection.find.mockResolvedValue([
        { provider: 'vercel', accountLabel: 'Team X', metadata: { teamId: 't1' } },
      ]);

      const req = mockReq();
      const res = mockRes();

      await deploymentController.getProviders(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.data.github).toEqual({ connected: true, username: 'oct', avatarUrl: 'a.png' });
      expect(payload.data.vercel).toEqual({ connected: true, accountLabel: 'Team X', teamId: 't1' });
      expect(payload.data.render).toEqual({ connected: false });
    });

    it('returns 500 on failure', async () => {
      GithubConnection.findOne.mockRejectedValue(new Error('down'));
      DeploymentProviderConnection.find.mockResolvedValue([]);
      const req = mockReq();
      const res = mockRes();

      await deploymentController.getProviders(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('connectVercel', () => {
    it('returns 503 when Vercel is not configured', async () => {
      vercelProvider.isConfigured.mockReturnValue(false);
      const req = mockReq();
      const res = mockRes();

      await deploymentController.connectVercel(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });

    it('returns an authorize URL when configured', async () => {
      vercelProvider.isConfigured.mockReturnValue(true);
      vercelProvider.createConnectState.mockReturnValue('state123');
      vercelProvider.getInstallUrl.mockReturnValue('https://vercel.com/install?state=state123');

      const req = mockReq();
      const res = mockRes();

      await deploymentController.connectVercel(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, data: { authorizeUrl: 'https://vercel.com/install?state=state123' } });
    });

    it('returns 500 when starting the connection throws', async () => {
      vercelProvider.isConfigured.mockReturnValue(true);
      vercelProvider.createConnectState.mockImplementation(() => { throw new Error('boom'); });
      const req = mockReq();
      const res = mockRes();

      await deploymentController.connectVercel(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('vercelCallback (public OAuth redirect target)', () => {
    // res.send/res.redirect aren't in the shared mockRes helper (nothing
    // else needs them), so build a small local variant just for this block.
    const mockRedirectRes = () => ({ send: jest.fn(), redirect: jest.fn() });

    it('redirects to the frontend callback page with the code (and optional teamId/configurationId/state) attached', async () => {
      const req = mockReq({ query: { code: 'abc123', teamId: 't1', configurationId: 'c1', state: 's1' } });
      const res = mockRedirectRes();

      await deploymentController.vercelCallback(req, res);

      expect(res.redirect).toHaveBeenCalledTimes(1);
      const redirectUrl = new URL(res.redirect.mock.calls[0][0]);
      expect(redirectUrl.origin + redirectUrl.pathname).toBe('https://devdrop.example.com/deploy/vercel-callback');
      expect(redirectUrl.searchParams.get('code')).toBe('abc123');
      expect(redirectUrl.searchParams.get('teamId')).toBe('t1');
      expect(redirectUrl.searchParams.get('configurationId')).toBe('c1');
      expect(redirectUrl.searchParams.get('state')).toBe('s1');
    });

    it('redirects with an error query param when Vercel reports the user cancelled/denied authorization', async () => {
      const req = mockReq({ query: { error: 'access_denied' } });
      const res = mockRedirectRes();

      await deploymentController.vercelCallback(req, res);

      const redirectUrl = new URL(res.redirect.mock.calls[0][0]);
      expect(redirectUrl.searchParams.get('error')).toMatch(/cancelled or denied/i);
    });

    it('redirects with an error query param when no code is present at all', async () => {
      const req = mockReq({ query: {} });
      const res = mockRedirectRes();

      await deploymentController.vercelCallback(req, res);

      const redirectUrl = new URL(res.redirect.mock.calls[0][0]);
      expect(redirectUrl.searchParams.get('error')).toMatch(/missing authorization code/i);
    });

    it('falls back to the inline postMessage HTML page when FRONTEND_URL is not configured', async () => {
      delete process.env.FRONTEND_URL;
      const req = mockReq({ query: { code: 'abc123' } });
      const res = mockRedirectRes();

      await deploymentController.vercelCallback(req, res);

      expect(res.redirect).not.toHaveBeenCalled();
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining('vercel-oauth-code'));
      process.env.FRONTEND_URL = 'https://devdrop.example.com';
    });

    it('falls back to an inline error page (still no redirect) when FRONTEND_URL is unset and Vercel reported an error', async () => {
      delete process.env.FRONTEND_URL;
      const req = mockReq({ query: { error: 'access_denied' } });
      const res = mockRedirectRes();

      await deploymentController.vercelCallback(req, res);

      expect(res.redirect).not.toHaveBeenCalled();
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining('vercel-oauth-error'));
      process.env.FRONTEND_URL = 'https://devdrop.example.com';
    });
  });

  describe('finishConnectVercel', () => {
    it('requires an authorization code', async () => {
      const req = mockReq({ body: { state: 's1' } });
      const res = mockRes();

      await deploymentController.finishConnectVercel(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(vercelProvider.verifyConnectState).not.toHaveBeenCalled();
    });

    it('requires connection state', async () => {
      const req = mockReq({ body: { code: 'abc' } });
      const res = mockRes();

      await deploymentController.finishConnectVercel(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/missing vercel connection state/i) }));
    });

    it('rejects an expired/invalid state token before ever exchanging the code', async () => {
      vercelProvider.verifyConnectState.mockImplementation(() => { throw new Error('bad state'); });
      const req = mockReq({ body: { code: 'abc', state: 'garbage' } });
      const res = mockRes();

      await deploymentController.finishConnectVercel(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(vercelProvider.exchangeCodeForToken).not.toHaveBeenCalled();
    });

    it('rejects with 403 when the state was minted for a different DevDrop user (cross-session/cross-user protection)', async () => {
      vercelProvider.verifyConnectState.mockReturnValue({ userId: 'someone-else' });
      const req = mockReq({ userId: 'user-1', body: { code: 'abc', state: 's1' } });
      const res = mockRes();

      await deploymentController.finishConnectVercel(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(vercelProvider.exchangeCodeForToken).not.toHaveBeenCalled();
    });

    it('exchanges the code, encrypts the token before persisting, and upserts the connection', async () => {
      vercelProvider.verifyConnectState.mockReturnValue({ userId: 'user-1' });
      vercelProvider.exchangeCodeForToken.mockResolvedValue({ accessToken: 'raw-token', teamId: null, configurationId: 'cfg-1' });
      vercelProvider.getAuthenticatedUser.mockResolvedValue({ id: 'vu-1', username: 'octocat', email: 'oct@example.com' });
      const req = mockReq({ userId: 'user-1', body: { code: 'abc', state: 's1' } });
      const res = mockRes();

      await deploymentController.finishConnectVercel(req, res);

      expect(DeploymentProviderConnection.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: 'user-1', provider: 'vercel' },
        expect.objectContaining({ credentialEncrypted: 'enc(raw-token)', accountLabel: 'octocat' }),
        expect.objectContaining({ upsert: true })
      );
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { accountLabel: 'octocat', teamId: null } });
    });

    it('prefers the team name over username for accountLabel when a team is resolved', async () => {
      vercelProvider.verifyConnectState.mockReturnValue({ userId: 'user-1' });
      vercelProvider.exchangeCodeForToken.mockResolvedValue({ accessToken: 'raw-token', teamId: 't1', configurationId: 'cfg-1' });
      vercelProvider.getAuthenticatedUser.mockResolvedValue({ id: 'vu-1', username: 'octocat' });
      vercelProvider.getTeam.mockResolvedValue({ name: 'Acme Team' });
      const req = mockReq({ userId: 'user-1', body: { code: 'abc', teamId: 't1', state: 's1' } });
      const res = mockRes();

      await deploymentController.finishConnectVercel(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, data: { accountLabel: 'Acme Team', teamId: 't1' } });
    });

    it('does not fail the whole request if the team lookup itself fails (falls back to user identity)', async () => {
      vercelProvider.verifyConnectState.mockReturnValue({ userId: 'user-1' });
      vercelProvider.exchangeCodeForToken.mockResolvedValue({ accessToken: 'raw-token', teamId: 't1', configurationId: 'cfg-1' });
      vercelProvider.getAuthenticatedUser.mockResolvedValue({ id: 'vu-1', username: 'octocat' });
      vercelProvider.getTeam.mockRejectedValue(new Error('team lookup failed'));
      const req = mockReq({ userId: 'user-1', body: { code: 'abc', teamId: 't1', state: 's1' } });
      const res = mockRes();

      await deploymentController.finishConnectVercel(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, data: { accountLabel: 'octocat', teamId: 't1' } });
    });

    it('maps a 403 from Vercel to a permissions-focused message', async () => {
      vercelProvider.verifyConnectState.mockReturnValue({ userId: 'user-1' });
      const providerError = Object.assign(new Error('forbidden'), { status: 403 });
      vercelProvider.exchangeCodeForToken.mockRejectedValue(providerError);
      const req = mockReq({ userId: 'user-1', body: { code: 'abc', state: 's1' } });
      const res = mockRes();

      await deploymentController.finishConnectVercel(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/check the integration permissions/i) }));
    });

    it('maps a 401 from Vercel to a stale-installation message', async () => {
      vercelProvider.verifyConnectState.mockReturnValue({ userId: 'user-1' });
      const providerError = Object.assign(new Error('unauthorized'), { status: 401 });
      vercelProvider.exchangeCodeForToken.mockRejectedValue(providerError);
      const req = mockReq({ userId: 'user-1', body: { code: 'abc', state: 's1' } });
      const res = mockRes();

      await deploymentController.finishConnectVercel(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/stale/i) }));
    });

    it('defaults to 400 with a generic retry message for any other failure', async () => {
      vercelProvider.verifyConnectState.mockReturnValue({ userId: 'user-1' });
      vercelProvider.exchangeCodeForToken.mockRejectedValue(new Error('network blip'));
      const req = mockReq({ userId: 'user-1', body: { code: 'abc', state: 's1' } });
      const res = mockRes();

      await deploymentController.finishConnectVercel(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('disconnectVercel / disconnectRender', () => {
    it('deletes the Vercel connection', async () => {
      DeploymentProviderConnection.deleteOne.mockResolvedValue({ deletedCount: 1 });
      const req = mockReq();
      const res = mockRes();

      await deploymentController.disconnectVercel(req, res);

      expect(DeploymentProviderConnection.deleteOne).toHaveBeenCalledWith(expect.objectContaining({ provider: 'vercel' }));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 500 when deleting the Vercel connection fails', async () => {
      DeploymentProviderConnection.deleteOne.mockRejectedValue(new Error('down'));
      const req = mockReq();
      const res = mockRes();

      await deploymentController.disconnectVercel(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('deletes the Render connection', async () => {
      DeploymentProviderConnection.deleteOne.mockResolvedValue({ deletedCount: 1 });
      const req = mockReq();
      const res = mockRes();

      await deploymentController.disconnectRender(req, res);

      expect(DeploymentProviderConnection.deleteOne).toHaveBeenCalledWith(expect.objectContaining({ provider: 'render' }));
    });
  });

  describe('connectRender', () => {
    it('rejects a missing/blank API key', async () => {
      const req = mockReq({ body: { apiKey: '  ' } });
      const res = mockRes();

      await deploymentController.connectRender(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(renderProvider.listOwners).not.toHaveBeenCalled();
    });

    it('rejects a key Render itself rejects', async () => {
      renderProvider.listOwners.mockRejectedValue(new Error('unauthorized'));
      const req = mockReq({ body: { apiKey: 'bad-key' } });
      const res = mockRes();

      await deploymentController.connectRender(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/rejected by Render/);
    });

    it('rejects a key with access to zero workspaces', async () => {
      renderProvider.listOwners.mockResolvedValue([]);
      const req = mockReq({ body: { apiKey: 'ok-key' } });
      const res = mockRes();

      await deploymentController.connectRender(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/does not have access/);
    });

    it('saves the connection with the first workspace selected by default', async () => {
      renderProvider.listOwners.mockResolvedValue([{ id: 'owner-1', name: 'My Team' }]);
      DeploymentProviderConnection.findOneAndUpdate.mockResolvedValue({
        accountLabel: 'My Team',
        metadata: { ownerId: 'owner-1', owners: [{ id: 'owner-1', name: 'My Team' }] },
      });

      const req = mockReq({ body: { apiKey: 'good-key' } });
      const res = mockRes();

      await deploymentController.connectRender(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { connected: true, accountLabel: 'My Team', owners: [{ id: 'owner-1', name: 'My Team' }], ownerId: 'owner-1' },
      });
    });
  });

  describe('setRenderOwner', () => {
    it('requires an existing Render connection', async () => {
      DeploymentProviderConnection.findOne.mockResolvedValue(null);
      const req = mockReq({ body: { ownerId: 'x' } });
      const res = mockRes();

      await deploymentController.setRenderOwner(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects an ownerId not present on the connection', async () => {
      DeploymentProviderConnection.findOne.mockResolvedValue({ metadata: { owners: [{ id: 'a', name: 'A' }] } });
      const req = mockReq({ body: { ownerId: 'z' } });
      const res = mockRes();

      await deploymentController.setRenderOwner(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('updates the selected workspace', async () => {
      const connection = {
        metadata: { owners: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], ownerId: 'a' },
        accountLabel: 'A',
        save: jest.fn().mockResolvedValue(true),
      };
      DeploymentProviderConnection.findOne.mockResolvedValue(connection);
      const req = mockReq({ body: { ownerId: 'b' } });
      const res = mockRes();

      await deploymentController.setRenderOwner(req, res);

      expect(connection.metadata.ownerId).toBe('b');
      expect(connection.accountLabel).toBe('B');
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { ownerId: 'b' } });
    });

    it('returns 500 on save failure', async () => {
      const connection = {
        metadata: { owners: [{ id: 'a', name: 'A' }] },
        save: jest.fn().mockRejectedValue(new Error('x')),
      };
      DeploymentProviderConnection.findOne.mockResolvedValue(connection);
      const req = mockReq({ body: { ownerId: 'a' } });
      const res = mockRes();

      await deploymentController.setRenderOwner(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('analyze', () => {
    it('rejects a user with no completed purchase (ownership check)', async () => {
      Purchase.findOne.mockResolvedValue(null);
      const req = mockReq({ params: { websiteId: 'w1' }, body: {} });
      const res = mockRes();

      await deploymentController.analyze(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('requires a GitHub connection', async () => {
      Purchase.findOne.mockResolvedValue({ _id: 'p1' });
      GithubConnection.findOne.mockReturnValue(createQueryMock(null));
      const req = mockReq({ params: { websiteId: 'w1' }, body: {} });
      const res = mockRes();

      await deploymentController.analyze(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].requiresGithubConnection).toBe(true);
    });

    it('requires the project to have been published to GitHub when no repository is explicitly selected', async () => {
      Purchase.findOne.mockResolvedValue({ _id: 'p1' });
      GithubConnection.findOne.mockReturnValue(createQueryMock({ accessTokenEncrypted: 'enc(tok)' }));
      ProjectExport.findOne.mockReturnValue(createQueryMock(null));
      const req = mockReq({ params: { websiteId: 'w1' }, body: {} });
      const res = mockRes();

      await deploymentController.analyze(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].requiresGithubPublish).toBe(true);
    });

    it('analyzes the previously exported repository on success', async () => {
      Purchase.findOne.mockResolvedValue({ _id: 'p1' });
      GithubConnection.findOne.mockReturnValue(createQueryMock({ accessTokenEncrypted: 'enc(tok)' }));
      ProjectExport.findOne.mockReturnValue(createQueryMock({
        repositoryOwner: 'me', repositoryName: 'app', repositoryUrl: 'https://github.com/me/app', defaultBranch: 'main',
      }));
      analyzeRepository.mockResolvedValue({ architecture: 'FULLSTACK', envPlan: [] });

      const req = mockReq({ params: { websiteId: 'w1' }, body: {} });
      const res = mockRes();

      await deploymentController.analyze(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { architecture: 'FULLSTACK', envPlan: [], repository: { owner: 'me', name: 'app', url: 'https://github.com/me/app', defaultBranch: 'main' } },
      });
    });

    it('rejects an invalid manually-selected repository', async () => {
      Purchase.findOne.mockResolvedValue({ _id: 'p1' });
      GithubConnection.findOne.mockReturnValue(createQueryMock({ accessTokenEncrypted: 'enc(tok)' }));
      const req = mockReq({ params: { websiteId: 'w1' }, body: { repository: { owner: 'bad owner!', name: 'x' } } });
      const res = mockRes();

      await deploymentController.analyze(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('surfaces a 403 when GitHub cannot access the manually-selected repository', async () => {
      Purchase.findOne.mockResolvedValue({ _id: 'p1' });
      GithubConnection.findOne.mockReturnValue(createQueryMock({ accessTokenEncrypted: 'enc(tok)' }));
      const notFound = new Error('not found');
      notFound.response = { status: 404 };
      githubService.getRepository.mockRejectedValue(notFound);

      const req = mockReq({ params: { websiteId: 'w1' }, body: { repository: { owner: 'me', name: 'app' } } });
      const res = mockRes();

      await deploymentController.analyze(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('createDeployment', () => {
    const setupHappyPath = () => {
      Purchase.findOne.mockResolvedValue({ _id: 'purchase-1' });
      Deployment.findOne.mockResolvedValue(null);
      GithubConnection.findOne.mockReturnValue(createQueryMock({ accessTokenEncrypted: 'enc(tok)' }));
      ProjectExport.findOne.mockReturnValue(createQueryMock({
        _id: 'export-1', repositoryOwner: 'me', repositoryName: 'app', repositoryUrl: 'url', defaultBranch: 'main',
      }));
      analyzeRepository.mockResolvedValue({
        architecture: 'FRONTEND_ONLY',
        frontend: { provider: 'vercel' },
        backend: null,
        envPlan: [],
      });
      DeploymentProviderConnection.find.mockResolvedValue([{ provider: 'vercel', metadata: {} }]);
      Deployment.create.mockResolvedValue({ _id: 'deploy-1', status: 'QUEUED' });
    };

    it('resumes an already-active deployment instead of creating a second one', async () => {
      Purchase.findOne.mockResolvedValue({ _id: 'purchase-1' });
      Deployment.findOne.mockResolvedValue({ _id: 'existing-deploy', status: 'DEPLOYING_BACKEND' });

      const req = mockReq({ params: { websiteId: 'w1' }, body: {} });
      const res = mockRes();

      await deploymentController.createDeployment(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0].data.resumed).toBe(true);
      expect(Deployment.create).not.toHaveBeenCalled();
    });

    it('requires a GitHub connection', async () => {
      Purchase.findOne.mockResolvedValue({ _id: 'purchase-1' });
      Deployment.findOne.mockResolvedValue(null);
      GithubConnection.findOne.mockReturnValue(createQueryMock(null));

      const req = mockReq({ params: { websiteId: 'w1' }, body: {} });
      const res = mockRes();

      await deploymentController.createDeployment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].requiresGithubConnection).toBe(true);
    });

    it('returns 422 when the architecture cannot be determined', async () => {
      Purchase.findOne.mockResolvedValue({ _id: 'purchase-1' });
      Deployment.findOne.mockResolvedValue(null);
      GithubConnection.findOne.mockReturnValue(createQueryMock({ accessTokenEncrypted: 'enc(tok)' }));
      ProjectExport.findOne.mockReturnValue(createQueryMock({ repositoryOwner: 'me', repositoryName: 'app', repositoryUrl: 'u', defaultBranch: 'main' }));
      analyzeRepository.mockResolvedValue({ architecture: 'UNKNOWN' });

      const req = mockReq({ params: { websiteId: 'w1' }, body: {} });
      const res = mockRes();

      await deploymentController.createDeployment(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
    });

    it('requires the needed provider(s) to be connected first', async () => {
      Purchase.findOne.mockResolvedValue({ _id: 'purchase-1' });
      Deployment.findOne.mockResolvedValue(null);
      GithubConnection.findOne.mockReturnValue(createQueryMock({ accessTokenEncrypted: 'enc(tok)' }));
      ProjectExport.findOne.mockReturnValue(createQueryMock({ repositoryOwner: 'me', repositoryName: 'app', repositoryUrl: 'u', defaultBranch: 'main' }));
      analyzeRepository.mockResolvedValue({ architecture: 'FRONTEND_ONLY', frontend: { provider: 'vercel' }, backend: null, envPlan: [] });
      DeploymentProviderConnection.find.mockResolvedValue([]);

      const req = mockReq({ params: { websiteId: 'w1' }, body: {} });
      const res = mockRes();

      await deploymentController.createDeployment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].missingProviders).toEqual(['vercel']);
    });

    it('requires a Render workspace to be selected when the project has a backend', async () => {
      Purchase.findOne.mockResolvedValue({ _id: 'purchase-1' });
      Deployment.findOne.mockResolvedValue(null);
      GithubConnection.findOne.mockReturnValue(createQueryMock({ accessTokenEncrypted: 'enc(tok)' }));
      ProjectExport.findOne.mockReturnValue(createQueryMock({ repositoryOwner: 'me', repositoryName: 'app', repositoryUrl: 'u', defaultBranch: 'main' }));
      analyzeRepository.mockResolvedValue({ architecture: 'BACKEND_ONLY', frontend: null, backend: { provider: 'render' }, envPlan: [] });
      DeploymentProviderConnection.find.mockResolvedValue([{ provider: 'render', metadata: {} }]);

      const req = mockReq({ params: { websiteId: 'w1' }, body: {} });
      const res = mockRes();

      await deploymentController.createDeployment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/Render workspace/);
    });

    it('requires values for missing required user env vars', async () => {
      Purchase.findOne.mockResolvedValue({ _id: 'purchase-1' });
      Deployment.findOne.mockResolvedValue(null);
      GithubConnection.findOne.mockReturnValue(createQueryMock({ accessTokenEncrypted: 'enc(tok)' }));
      ProjectExport.findOne.mockReturnValue(createQueryMock({ repositoryOwner: 'me', repositoryName: 'app', repositoryUrl: 'u', defaultBranch: 'main' }));
      analyzeRepository.mockResolvedValue({
        architecture: 'FRONTEND_ONLY',
        frontend: { provider: 'vercel' },
        backend: null,
        envPlan: [{ key: 'API_KEY', source: 'user', required: true }],
      });
      DeploymentProviderConnection.find.mockResolvedValue([{ provider: 'vercel', metadata: {} }]);

      const req = mockReq({ params: { websiteId: 'w1' }, body: { envValues: {} } });
      const res = mockRes();

      await deploymentController.createDeployment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].missingVariables).toEqual(['API_KEY']);
    });

    it('queues the deployment and kicks off the orchestrator in the background', async () => {
      setupHappyPath();
      const req = mockReq({ params: { websiteId: 'w1' }, body: {} });
      const res = mockRes();

      await deploymentController.createDeployment(req, res);

      expect(Deployment.create).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json.mock.calls[0][0].data).toEqual({ deploymentId: 'deploy-1', status: 'QUEUED' });

      await new Promise((resolve) => setImmediate(resolve));
      expect(runDeployment).toHaveBeenCalledWith('deploy-1');
    });

    it('rejects a caller with no completed purchase', async () => {
      Purchase.findOne.mockResolvedValue(null);
      const req = mockReq({ params: { websiteId: 'w1' }, body: {} });
      const res = mockRes();

      await deploymentController.createDeployment(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('listDeployments', () => {
    it('lists all deployments for the user with pagination', async () => {
      Deployment.find.mockReturnValue(createQueryMock([
        { _id: 'd1', status: 'SUCCESS', createdAt: new Date(), updatedAt: new Date() },
      ]));
      Deployment.countDocuments.mockResolvedValue(1);

      const req = mockReq({ query: {} });
      const res = mockRes();

      await deploymentController.listDeployments(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.data[0].id).toBe('d1');
      expect(payload.data[0].isActive).toBe(false);
      expect(payload.pagination.totalItems).toBe(1);
    });

    it('filters by status=deploying using the active-status set', async () => {
      Deployment.find.mockReturnValue(createQueryMock([]));
      Deployment.countDocuments.mockResolvedValue(0);

      const req = mockReq({ query: { status: 'deploying' } });
      const res = mockRes();

      await deploymentController.listDeployments(req, res);

      expect(Deployment.find).toHaveBeenCalledWith(expect.objectContaining({
        status: { $in: expect.arrayContaining(['QUEUED', 'DEPLOYING_BACKEND']) },
      }));
    });

    it('returns 500 on failure', async () => {
      Deployment.find.mockImplementation(() => { throw new Error('down'); });
      const req = mockReq({ query: {} });
      const res = mockRes();

      await deploymentController.listDeployments(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getDeploymentForWebsite', () => {
    it('returns null data when no deployment exists yet', async () => {
      Deployment.findOne.mockReturnValue(createQueryMock(null));
      const req = mockReq({ params: { websiteId: 'w1' } });
      const res = mockRes();

      await deploymentController.getDeploymentForWebsite(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, data: null });
    });

    it('returns the most recent serialized deployment', async () => {
      Deployment.findOne.mockReturnValue(createQueryMock({ _id: 'd1', status: 'SUCCESS' }));
      const req = mockReq({ params: { websiteId: 'w1' } });
      const res = mockRes();

      await deploymentController.getDeploymentForWebsite(req, res);

      expect(res.json.mock.calls[0][0].data.id).toBe('d1');
    });
  });

  describe('getDeployment', () => {
    it('returns 404 when not found for this user', async () => {
      Deployment.findOne.mockResolvedValue(null);
      const req = mockReq({ params: { deploymentId: 'd1' } });
      const res = mockRes();

      await deploymentController.getDeployment(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns the serialized deployment when found', async () => {
      Deployment.findOne.mockResolvedValue({ _id: 'd1', status: 'SUCCESS' });
      const req = mockReq({ params: { deploymentId: 'd1' } });
      const res = mockRes();

      await deploymentController.getDeployment(req, res);

      expect(res.json.mock.calls[0][0].data.id).toBe('d1');
    });
  });

  describe('redeploy', () => {
    it('returns 404 when not found', async () => {
      Deployment.findOne.mockResolvedValue(null);
      const req = mockReq({ params: { deploymentId: 'd1' } });
      const res = mockRes();

      await deploymentController.redeploy(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('rejects redeploying a deployment already in progress', async () => {
      Deployment.findOne.mockResolvedValue({ status: 'DEPLOYING_BACKEND' });
      const req = mockReq({ params: { deploymentId: 'd1' } });
      const res = mockRes();

      await deploymentController.redeploy(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
    });

    it('re-queues a finished deployment and clears its error state', async () => {
      const deployment = { _id: 'd1', status: 'FAILED', errorMessage: 'oops', errorStep: 'build', save: jest.fn().mockResolvedValue(true) };
      Deployment.findOne.mockResolvedValue(deployment);
      const req = mockReq({ params: { deploymentId: 'd1' } });
      const res = mockRes();

      await deploymentController.redeploy(req, res);

      expect(deployment.status).toBe('QUEUED');
      expect(deployment.errorMessage).toBeUndefined();
      expect(res.status).toHaveBeenCalledWith(202);

      await new Promise((resolve) => setImmediate(resolve));
      expect(runDeployment).toHaveBeenCalledWith('d1');
    });

    it('returns 500 on save failure', async () => {
      const deployment = { status: 'FAILED', save: jest.fn().mockRejectedValue(new Error('x')) };
      Deployment.findOne.mockResolvedValue(deployment);
      const req = mockReq({ params: { deploymentId: 'd1' } });
      const res = mockRes();

      await deploymentController.redeploy(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('cancelDeployment', () => {
    it('returns 404 when not found', async () => {
      Deployment.findOne.mockResolvedValue(null);
      const req = mockReq({ params: { deploymentId: 'd1' } });
      const res = mockRes();

      await deploymentController.cancelDeployment(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('rejects cancelling a deployment that is not running', async () => {
      Deployment.findOne.mockResolvedValue({ status: 'SUCCESS' });
      const req = mockReq({ params: { deploymentId: 'd1' } });
      const res = mockRes();

      await deploymentController.cancelDeployment(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
    });

    it('marks a queued deployment cancelled without calling any provider', async () => {
      const deployment = { status: 'QUEUED', save: jest.fn().mockResolvedValue(true) };
      Deployment.findOne.mockResolvedValue(deployment);
      const req = mockReq({ params: { deploymentId: 'd1' } });
      const res = mockRes();

      await deploymentController.cancelDeployment(req, res);

      expect(deployment.status).toBe('CANCELLED');
      expect(vercelProvider.cancelDeployment).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Deployment cancelled.' });
    });

    it('best-effort cancels an in-progress Vercel build', async () => {
      const deployment = {
        status: 'DEPLOYING_FRONTEND',
        vercel: { deploymentId: 'vd1' },
        save: jest.fn().mockResolvedValue(true),
      };
      Deployment.findOne.mockResolvedValue(deployment);
      DeploymentProviderConnection.findOne.mockReturnValue(createQueryMock({ credentialEncrypted: 'enc(tok)', metadata: {} }));

      const req = mockReq({ params: { deploymentId: 'd1' } });
      const res = mockRes();

      await deploymentController.cancelDeployment(req, res);

      expect(vercelProvider.cancelDeployment).toHaveBeenCalledWith('tok', {}, 'vd1');
      expect(deployment.status).toBe('CANCELLED');
    });

    it('returns 500 on failure', async () => {
      Deployment.findOne.mockRejectedValue(new Error('down'));
      const req = mockReq({ params: { deploymentId: 'd1' } });
      const res = mockRes();

      await deploymentController.cancelDeployment(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('analyzePersonalRepository', () => {
    it('requires a GitHub connection', async () => {
      GithubConnection.findOne.mockReturnValue(createQueryMock(null));
      const req = mockReq({ body: { repository: { owner: 'me', name: 'app' } } });
      const res = mockRes();

      await deploymentController.analyzePersonalRepository(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].requiresGithubConnection).toBe(true);
    });

    it('requires a chosen repository', async () => {
      GithubConnection.findOne.mockReturnValue(createQueryMock({ accessTokenEncrypted: 'enc(tok)' }));
      const req = mockReq({ body: {} });
      const res = mockRes();

      await deploymentController.analyzePersonalRepository(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('analyzes a valid personal repository', async () => {
      GithubConnection.findOne.mockReturnValue(createQueryMock({ accessTokenEncrypted: 'enc(tok)' }));
      githubService.getRepository.mockResolvedValue({ htmlUrl: 'https://github.com/me/app', defaultBranch: 'main' });
      analyzeRepository.mockResolvedValue({ architecture: 'FULLSTACK', envPlan: [] });

      const req = mockReq({ body: { repository: { owner: 'me', name: 'app' } } });
      const res = mockRes();

      await deploymentController.analyzePersonalRepository(req, res);

      expect(res.json.mock.calls[0][0].data.repository.owner).toBe('me');
    });
  });

  describe('createPersonalDeployment', () => {
    it('resumes an existing active personal deployment for the same repo', async () => {
      GithubConnection.findOne.mockReturnValue(createQueryMock({ accessTokenEncrypted: 'enc(tok)' }));
      githubService.getRepository.mockResolvedValue({ htmlUrl: 'u', defaultBranch: 'main' });
      Deployment.findOne.mockResolvedValue({ _id: 'existing', status: 'QUEUED' });

      const req = mockReq({ body: { repository: { owner: 'me', name: 'app' } } });
      const res = mockRes();

      await deploymentController.createPersonalDeployment(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0].data.resumed).toBe(true);
    });

    it('queues a new personal deployment end to end', async () => {
      GithubConnection.findOne.mockReturnValue(createQueryMock({ accessTokenEncrypted: 'enc(tok)' }));
      githubService.getRepository.mockResolvedValue({ htmlUrl: 'u', defaultBranch: 'main' });
      Deployment.findOne.mockResolvedValue(null);
      analyzeRepository.mockResolvedValue({ architecture: 'FRONTEND_ONLY', frontend: { provider: 'vercel' }, backend: null, envPlan: [] });
      DeploymentProviderConnection.find.mockResolvedValue([{ provider: 'vercel', metadata: {} }]);
      Deployment.create.mockResolvedValue({ _id: 'deploy-2', status: 'QUEUED' });

      const req = mockReq({ body: { repository: { owner: 'me', name: 'app' } } });
      const res = mockRes();

      await deploymentController.createPersonalDeployment(req, res);

      expect(Deployment.create).toHaveBeenCalledWith(expect.objectContaining({ source: 'personal', websiteId: null }));
      expect(res.status).toHaveBeenCalledWith(202);
    });

    it('requires a chosen repository', async () => {
      GithubConnection.findOne.mockReturnValue(createQueryMock({ accessTokenEncrypted: 'enc(tok)' }));
      const req = mockReq({ body: {} });
      const res = mockRes();

      await deploymentController.createPersonalDeployment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('maps a 404 from GitHub (no repo access) to a 403 with a permissions message', async () => {
      GithubConnection.findOne.mockReturnValue(createQueryMock({ accessTokenEncrypted: 'enc(tok)' }));
      githubService.getRepository.mockRejectedValue({ response: { status: 404 } });
      const req = mockReq({ body: { repository: { owner: 'me', name: 'app' } } });
      const res = mockRes();

      await deploymentController.createPersonalDeployment(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/check your github permissions/i) }));
    });

    it('returns 422 when the architecture cannot be determined', async () => {
      GithubConnection.findOne.mockReturnValue(createQueryMock({ accessTokenEncrypted: 'enc(tok)' }));
      githubService.getRepository.mockResolvedValue({ htmlUrl: 'u', defaultBranch: 'main' });
      Deployment.findOne.mockResolvedValue(null);
      analyzeRepository.mockResolvedValue({ architecture: 'UNKNOWN', envPlan: [] });

      const req = mockReq({ body: { repository: { owner: 'me', name: 'app' } } });
      const res = mockRes();

      await deploymentController.createPersonalDeployment(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
    });

    it('requires the needed provider(s) to be connected first', async () => {
      GithubConnection.findOne.mockReturnValue(createQueryMock({ accessTokenEncrypted: 'enc(tok)' }));
      githubService.getRepository.mockResolvedValue({ htmlUrl: 'u', defaultBranch: 'main' });
      Deployment.findOne.mockResolvedValue(null);
      analyzeRepository.mockResolvedValue({ architecture: 'FRONTEND_ONLY', frontend: { provider: 'vercel' }, backend: null, envPlan: [] });
      DeploymentProviderConnection.find.mockResolvedValue([]);

      const req = mockReq({ body: { repository: { owner: 'me', name: 'app' } } });
      const res = mockRes();

      await deploymentController.createPersonalDeployment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].missingProviders).toEqual(['vercel']);
    });

    it('requires a Render workspace to be selected when the project has a backend', async () => {
      GithubConnection.findOne.mockReturnValue(createQueryMock({ accessTokenEncrypted: 'enc(tok)' }));
      githubService.getRepository.mockResolvedValue({ htmlUrl: 'u', defaultBranch: 'main' });
      Deployment.findOne.mockResolvedValue(null);
      analyzeRepository.mockResolvedValue({ architecture: 'BACKEND_ONLY', frontend: null, backend: { provider: 'render' }, envPlan: [] });
      DeploymentProviderConnection.find.mockResolvedValue([{ provider: 'render', metadata: {} }]);

      const req = mockReq({ body: { repository: { owner: 'me', name: 'app' } } });
      const res = mockRes();

      await deploymentController.createPersonalDeployment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/select a render workspace/i);
    });

    it('requires values for missing required user env vars', async () => {
      GithubConnection.findOne.mockReturnValue(createQueryMock({ accessTokenEncrypted: 'enc(tok)' }));
      githubService.getRepository.mockResolvedValue({ htmlUrl: 'u', defaultBranch: 'main' });
      Deployment.findOne.mockResolvedValue(null);
      analyzeRepository.mockResolvedValue({
        architecture: 'FRONTEND_ONLY', frontend: { provider: 'vercel' }, backend: null,
        envPlan: [{ key: 'API_KEY', source: 'user', required: true }],
      });
      DeploymentProviderConnection.find.mockResolvedValue([{ provider: 'vercel', metadata: {} }]);

      const req = mockReq({ body: { repository: { owner: 'me', name: 'app' }, envValues: {} } });
      const res = mockRes();

      await deploymentController.createPersonalDeployment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].missingVariables).toEqual(['API_KEY']);
    });

    it('returns a generic 500 for an unexpected failure with no status code', async () => {
      GithubConnection.findOne.mockReturnValue(createQueryMock({ accessTokenEncrypted: 'enc(tok)' }));
      githubService.getRepository.mockRejectedValue(new Error('unexpected'));
      const req = mockReq({ body: { repository: { owner: 'me', name: 'app' } } });
      const res = mockRes();

      await deploymentController.createPersonalDeployment(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
