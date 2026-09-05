jest.mock('../../../src/modules/website/website.model');
jest.mock('../../../src/modules/payment/purchase.model');
jest.mock('../../../src/modules/github/githubConnection.model');
jest.mock('../../../src/modules/github/projectExport.model');
jest.mock('../../../src/services/github.service');
jest.mock('../../../src/services/projectExport.service');
jest.mock('../../../src/shared/utils/crypto');

const jwt = require('jsonwebtoken');
const Website = require('../../../src/modules/website/website.model');
const Purchase = require('../../../src/modules/payment/purchase.model');
const GithubConnection = require('../../../src/modules/github/githubConnection.model');
const ProjectExport = require('../../../src/modules/github/projectExport.model');
const githubService = require('../../../src/services/github.service');
const projectExportService = require('../../../src/services/projectExport.service');
const cryptoUtil = require('../../../src/shared/utils/crypto');
const githubController = require('../../../src/modules/github/github.controller');
const { createQueryMock, mockReq, mockRes } = require('../../helpers/mockQuery');

beforeEach(() => {
  process.env.FRONTEND_URL = 'https://devdrop.example.com';
});

describe('github.controller', () => {
  describe('connect', () => {
    it('returns 503 when GitHub integration is not configured', async () => {
      githubService.isGithubConfigured.mockReturnValue(false);
      const req = mockReq({ userId: 'user-1' });
      const res = mockRes();

      await githubController.connect(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });

    it('returns a signed state and the GitHub authorize URL', async () => {
      githubService.isGithubConfigured.mockReturnValue(true);
      githubService.getAuthorizeUrl.mockReturnValue('https://github.com/login/oauth/authorize?state=abc');
      const req = mockReq({ userId: 'user-1' });
      const res = mockRes();

      await githubController.connect(req, res);

      expect(githubService.getAuthorizeUrl).toHaveBeenCalled();
      const stateArg = githubService.getAuthorizeUrl.mock.calls[0][0];
      const decoded = jwt.verify(stateArg, process.env.JWT_SECRET);
      expect(decoded.userId).toBe('user-1');
      expect(decoded.purpose).toBe('github_oauth');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 500 when building the authorize URL throws', async () => {
      githubService.isGithubConfigured.mockReturnValue(true);
      githubService.getAuthorizeUrl.mockImplementation(() => { throw new Error('boom'); });
      const req = mockReq({ userId: 'user-1' });
      const res = mockRes();

      await githubController.connect(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('callback', () => {
    const validState = () => jwt.sign(
      { userId: 'user-1', purpose: 'github_oauth' },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );

    it('renders an error page when GitHub reports an OAuth error', async () => {
      const req = mockReq({ query: { error: 'access_denied' } });
      const res = mockRes();
      res.send = jest.fn();

      await githubController.callback(req, res);

      const html = res.send.mock.calls[0][0];
      expect(html).toContain('github-oauth-error');
      expect(html).toContain('cancelled or denied');
    });

    it('renders an error page when code or state is missing', async () => {
      const req = mockReq({ query: { state: 'x' } });
      const res = mockRes();
      res.send = jest.fn();

      await githubController.callback(req, res);

      expect(res.send.mock.calls[0][0]).toContain('Missing authorization code');
    });

    it('renders an error page for an invalid or expired state token', async () => {
      const req = mockReq({ query: { code: 'c1', state: 'garbage-token' } });
      const res = mockRes();
      res.send = jest.fn();

      await githubController.callback(req, res);

      expect(res.send.mock.calls[0][0]).toContain('expired');
    });

    it('renders an error page when the decoded state has the wrong purpose', async () => {
      const badState = jwt.sign({ userId: 'user-1', purpose: 'something_else' }, process.env.JWT_SECRET);
      const req = mockReq({ query: { code: 'c1', state: badState } });
      const res = mockRes();
      res.send = jest.fn();

      await githubController.callback(req, res);

      expect(res.send.mock.calls[0][0]).toContain('Invalid connection request');
    });

    it('exchanges the code, upserts the connection, and renders success', async () => {
      githubService.exchangeCodeForToken.mockResolvedValue({ accessToken: 'gh-token', scope: 'repo' });
      githubService.getAuthenticatedUser.mockResolvedValue({ id: 42, username: 'octocat', avatarUrl: 'https://gh/avatar.png' });
      cryptoUtil.encrypt.mockReturnValue('encrypted-token');
      GithubConnection.findOneAndUpdate.mockResolvedValue({});

      const req = mockReq({ query: { code: 'c1', state: validState() } });
      const res = mockRes();
      res.send = jest.fn();

      await githubController.callback(req, res);

      expect(GithubConnection.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: 'user-1' },
        expect.objectContaining({
          githubUserId: 42,
          githubUsername: 'octocat',
          accessTokenEncrypted: 'encrypted-token',
        }),
        expect.objectContaining({ upsert: true })
      );
      expect(res.send.mock.calls[0][0]).toContain('github-oauth-success');
    });

    it('renders a generic error page when the token exchange fails', async () => {
      githubService.exchangeCodeForToken.mockRejectedValue(new Error('bad code'));
      const req = mockReq({ query: { code: 'c1', state: validState() } });
      const res = mockRes();
      res.send = jest.fn();

      await githubController.callback(req, res);

      expect(res.send.mock.calls[0][0]).toContain('Could not complete GitHub authorization');
    });
  });

  describe('status', () => {
    it('reports connected with connection details when a connection exists', async () => {
      GithubConnection.findOne.mockResolvedValue({ githubUsername: 'octocat', githubAvatarUrl: 'a.png', connectedAt: 'now' });
      const req = mockReq({ userId: 'user-1' });
      const res = mockRes();

      await githubController.status(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { connected: true, username: 'octocat', avatarUrl: 'a.png', connectedAt: 'now' },
      });
    });

    it('reports disconnected when no connection exists', async () => {
      GithubConnection.findOne.mockResolvedValue(null);
      const req = mockReq({ userId: 'user-1' });
      const res = mockRes();

      await githubController.status(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, data: { connected: false } });
    });

    it('returns 500 on failure', async () => {
      GithubConnection.findOne.mockRejectedValue(new Error('down'));
      const req = mockReq({ userId: 'user-1' });
      const res = mockRes();

      await githubController.status(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('listRepositories', () => {
    it('requires a GitHub connection first', async () => {
      GithubConnection.findOne.mockReturnValue(createQueryMock(null));
      const req = mockReq({ userId: 'user-1', query: {} });
      const res = mockRes();

      await githubController.listRepositories(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].requiresGithubConnection).toBe(true);
    });

    it('decrypts the token and returns repositories with pagination', async () => {
      GithubConnection.findOne.mockReturnValue(createQueryMock({ accessTokenEncrypted: 'enc' }));
      cryptoUtil.decrypt.mockReturnValue('plain-token');
      githubService.listRepositories.mockResolvedValue({ repositories: [{ name: 'repo1' }], hasNextPage: false });

      const req = mockReq({ userId: 'user-1', query: { page: '1' } });
      const res = mockRes();

      await githubController.listRepositories(req, res);

      expect(cryptoUtil.decrypt).toHaveBeenCalledWith('enc');
      expect(githubService.listRepositories).toHaveBeenCalledWith('plain-token', expect.objectContaining({ page: '1' }));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: [{ name: 'repo1' }] }));
    });

    it('returns 401 with a reconnect hint on a GitHub auth error', async () => {
      GithubConnection.findOne.mockReturnValue(createQueryMock({ accessTokenEncrypted: 'enc' }));
      cryptoUtil.decrypt.mockReturnValue('plain-token');
      const authError = new Error('unauthorized');
      githubService.listRepositories.mockRejectedValue(authError);
      githubService.isAuthError.mockReturnValue(true);

      const req = mockReq({ userId: 'user-1', query: {} });
      const res = mockRes();

      await githubController.listRepositories(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json.mock.calls[0][0].code).toBe('GITHUB_CONNECTION_EXPIRED');
    });

    it('returns 500 for a non-auth failure', async () => {
      GithubConnection.findOne.mockReturnValue(createQueryMock({ accessTokenEncrypted: 'enc' }));
      cryptoUtil.decrypt.mockReturnValue('plain-token');
      githubService.listRepositories.mockRejectedValue(new Error('rate limited'));
      githubService.isAuthError.mockReturnValue(false);

      const req = mockReq({ userId: 'user-1', query: {} });
      const res = mockRes();

      await githubController.listRepositories(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('disconnect', () => {
    it('deletes the connection and confirms', async () => {
      GithubConnection.deleteOne.mockResolvedValue({ deletedCount: 1 });
      const req = mockReq({ userId: 'user-1' });
      const res = mockRes();

      await githubController.disconnect(req, res);

      expect(GithubConnection.deleteOne).toHaveBeenCalledWith({ userId: 'user-1' });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 500 on failure', async () => {
      GithubConnection.deleteOne.mockRejectedValue(new Error('down'));
      const req = mockReq({ userId: 'user-1' });
      const res = mockRes();

      await githubController.disconnect(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('createExport', () => {
    const validReq = (overrides = {}) => mockReq({
      params: { websiteId: 'w1' },
      userId: 'user-1',
      body: { repositoryName: 'my-repo', visibility: 'private' },
      ...overrides,
    });

    it('rejects when the user has no completed purchase for the project', async () => {
      Purchase.findOne.mockResolvedValue(null);
      const req = validReq();
      const res = mockRes();

      await githubController.createExport(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('rejects when the website has no exportable source code', async () => {
      Purchase.findOne.mockResolvedValue({ _id: 'purchase-1' });
      Website.findById.mockResolvedValue({ name: 'Site', sourceCodeUrl: null });
      const req = validReq();
      const res = mockRes();

      await githubController.createExport(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/not available for export/);
    });

    it('requires a GitHub connection before exporting', async () => {
      Purchase.findOne.mockResolvedValue({ _id: 'purchase-1' });
      Website.findById.mockResolvedValue({ name: 'Site', sourceCodeUrl: 'path.zip' });
      GithubConnection.findOne.mockResolvedValue(null);
      const req = validReq();
      const res = mockRes();

      await githubController.createExport(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].requiresGithubConnection).toBe(true);
    });

    it('rejects an invalid repository name', async () => {
      Purchase.findOne.mockResolvedValue({ _id: 'purchase-1' });
      Website.findById.mockResolvedValue({ name: 'Site', sourceCodeUrl: 'path.zip' });
      GithubConnection.findOne.mockResolvedValue({ userId: 'user-1' });
      projectExportService.sanitizeRepoName.mockReturnValue('');
      projectExportService.isValidRepoName.mockReturnValue(false);
      const req = validReq();
      const res = mockRes();

      await githubController.createExport(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toMatch(/valid repository name/);
    });

    it('creates the export record and kicks off the async export job', async () => {
      Purchase.findOne.mockResolvedValue({ _id: 'purchase-1' });
      Website.findById.mockResolvedValue({ name: 'Site', sourceCodeUrl: 'path.zip' });
      GithubConnection.findOne.mockResolvedValue({ userId: 'user-1' });
      projectExportService.sanitizeRepoName.mockReturnValue('my-repo');
      projectExportService.isValidRepoName.mockReturnValue(true);
      ProjectExport.create.mockResolvedValue({ _id: 'export-1', status: 'pending' });
      projectExportService.runExport.mockResolvedValue(undefined);

      const req = validReq();
      const res = mockRes();

      await githubController.createExport(req, res);

      expect(ProjectExport.create).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user-1',
        websiteId: 'w1',
        purchaseId: 'purchase-1',
        repositoryName: 'my-repo',
      }));
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: { exportId: 'export-1', status: 'pending' },
      }));

      // Fire-and-forget job is scheduled via setImmediate; flush the
      // microtask/macrotask queue and confirm it actually gets invoked.
      await new Promise((resolve) => setImmediate(resolve));
      expect(projectExportService.runExport).toHaveBeenCalledWith('export-1');
    });

    it('does not crash the request when the fire-and-forget export job rejects', async () => {
      Purchase.findOne.mockResolvedValue({ _id: 'purchase-1' });
      Website.findById.mockResolvedValue({ name: 'Site', sourceCodeUrl: 'path.zip' });
      GithubConnection.findOne.mockResolvedValue({ userId: 'user-1' });
      projectExportService.sanitizeRepoName.mockReturnValue('my-repo');
      projectExportService.isValidRepoName.mockReturnValue(true);
      ProjectExport.create.mockResolvedValue({ _id: 'export-1', status: 'pending' });
      projectExportService.runExport.mockRejectedValue(new Error('export failed'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const req = validReq();
      const res = mockRes();

      await githubController.createExport(req, res);
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      expect(res.status).toHaveBeenCalledWith(202);
      consoleSpy.mockRestore();
    });

    it('returns 500 on unexpected failure', async () => {
      Purchase.findOne.mockRejectedValue(new Error('db down'));
      const req = validReq();
      const res = mockRes();

      await githubController.createExport(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getExportStatus', () => {
    it('returns 404 when the export does not belong to the user or does not exist', async () => {
      ProjectExport.findOne.mockResolvedValue(null);
      const req = mockReq({ params: { exportId: 'e1' }, userId: 'user-1' });
      const res = mockRes();

      await githubController.getExportStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('serializes the export document', async () => {
      ProjectExport.findOne.mockResolvedValue({
        _id: 'e1', websiteId: 'w1', repositoryName: 'repo', visibility: 'private', status: 'completed',
        repositoryUrl: 'https://github.com/x/repo', defaultBranch: 'main', fileCount: 12,
      });
      const req = mockReq({ params: { exportId: 'e1' }, userId: 'user-1' });
      const res = mockRes();

      await githubController.getExportStatus(req, res);

      const payload = res.json.mock.calls[0][0];
      expect(payload.data.repositoryUrl).toBe('https://github.com/x/repo');
      expect(payload.data.fileCount).toBe(12);
    });

    it('returns 500 on failure', async () => {
      ProjectExport.findOne.mockRejectedValue(new Error('down'));
      const req = mockReq({ params: { exportId: 'e1' }, userId: 'user-1' });
      const res = mockRes();

      await githubController.getExportStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getExportForWebsite', () => {
    it('returns null data when no export exists yet', async () => {
      ProjectExport.findOne.mockReturnValue(createQueryMock(null));
      const req = mockReq({ params: { websiteId: 'w1' }, userId: 'user-1' });
      const res = mockRes();

      await githubController.getExportForWebsite(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, data: null });
    });

    it('returns the most recent serialized export', async () => {
      ProjectExport.findOne.mockReturnValue(createQueryMock({ _id: 'e1', websiteId: 'w1', repositoryName: 'repo', visibility: 'public', status: 'completed' }));
      const req = mockReq({ params: { websiteId: 'w1' }, userId: 'user-1' });
      const res = mockRes();

      await githubController.getExportForWebsite(req, res);

      expect(res.json.mock.calls[0][0].data.repositoryName).toBe('repo');
    });

    it('returns 500 on failure', async () => {
      ProjectExport.findOne.mockImplementation(() => { throw new Error('down'); });
      const req = mockReq({ params: { websiteId: 'w1' }, userId: 'user-1' });
      const res = mockRes();

      await githubController.getExportForWebsite(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('listExports', () => {
    it('paginates the user\'s export history', async () => {
      ProjectExport.find.mockReturnValue(createQueryMock([{ _id: 'e1', websiteId: 'w1', repositoryName: 'repo', visibility: 'private', status: 'completed' }]));
      ProjectExport.countDocuments.mockResolvedValue(1);

      const req = mockReq({ userId: 'user-1', query: {} });
      const res = mockRes();

      await githubController.listExports(req, res);

      expect(ProjectExport.find).toHaveBeenCalledWith({ userId: 'user-1' });
      const payload = res.json.mock.calls[0][0];
      expect(payload.data).toHaveLength(1);
      expect(payload.pagination.totalItems).toBe(1);
    });

    it('returns 500 on failure', async () => {
      ProjectExport.find.mockImplementation(() => { throw new Error('down'); });
      const req = mockReq({ userId: 'user-1', query: {} });
      const res = mockRes();

      await githubController.listExports(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
