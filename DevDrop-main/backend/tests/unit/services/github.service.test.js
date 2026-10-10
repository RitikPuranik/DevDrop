jest.mock('axios');
const axios = require('axios');
const githubService = require('../../../src/services/github.service');

describe('github.service', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      GITHUB_CLIENT_ID: 'client-id',
      GITHUB_CLIENT_SECRET: 'client-secret',
      GITHUB_OAUTH_REDIRECT_URI: 'https://devdrop.example.com/callback',
    };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  const loadService = () => githubService;

  describe('isGithubConfigured / getAuthorizeUrl', () => {
    it('reports configured when all three env vars are present', () => {
      const githubService = loadService();
      expect(githubService.isGithubConfigured()).toBe(true);
    });

    it('reports not configured when a var is missing', () => {
      delete process.env.GITHUB_CLIENT_ID;
      const githubService = loadService();
      expect(githubService.isGithubConfigured()).toBe(false);
    });

    it('builds an authorize URL containing the state and repo scope', () => {
      const githubService = loadService();
      const url = githubService.getAuthorizeUrl('state123');
      expect(url).toContain('https://github.com/login/oauth/authorize?');
      expect(url).toContain('state=state123');
      expect(url).toContain('scope=repo');
      expect(url).toContain('client_id=client-id');
    });

    it('throws a clear error when GITHUB_CLIENT_ID is not configured', () => {
      delete process.env.GITHUB_CLIENT_ID;
      const githubService = loadService();
      expect(() => githubService.getAuthorizeUrl('s')).toThrow('GITHUB_CLIENT_ID is not configured.');
    });
  });

  describe('exchangeCodeForToken', () => {
    it('returns the access token on success', async () => {
      axios.post = jest.fn().mockResolvedValue({ data: { access_token: 'tok123', scope: 'repo', token_type: 'bearer' } });
      const githubService = loadService();

      const result = await githubService.exchangeCodeForToken('code123');

      expect(result).toEqual({ accessToken: 'tok123', scope: 'repo', tokenType: 'bearer' });
      expect(axios.post).toHaveBeenCalledWith(
        'https://github.com/login/oauth/access_token',
        expect.objectContaining({ code: 'code123', client_id: 'client-id' }),
        expect.any(Object)
      );
    });

    it('throws using GitHub error_description when present', async () => {
      axios.post = jest.fn().mockResolvedValue({ data: { error: 'bad_verification_code', error_description: 'The code passed is incorrect.' } });
      const githubService = loadService();

      await expect(githubService.exchangeCodeForToken('bad')).rejects.toThrow('The code passed is incorrect.');
    });

    it('throws when no access_token is returned at all', async () => {
      axios.post = jest.fn().mockResolvedValue({ data: {} });
      const githubService = loadService();

      await expect(githubService.exchangeCodeForToken('code')).rejects.toThrow('GitHub did not return an access token.');
    });
  });

  describe('listRepositories', () => {
    const mockApiClient = (getImpl) => {
      axios.create = jest.fn(() => ({ get: getImpl, post: jest.fn(), patch: jest.fn() }));
    };

    it('maps and filters repositories by search term, and detects a next page', async () => {
      mockApiClient(jest.fn().mockResolvedValue({
        data: [
          { id: 1, name: 'app-one', full_name: 'me/app-one', owner: { login: 'me' }, default_branch: 'main', private: false, html_url: 'u1', description: 'first app', updated_at: '2024-01-01' },
          { id: 2, name: 'other', full_name: 'me/other', owner: { login: 'me' }, default_branch: 'main', private: true, html_url: 'u2', description: 'unrelated', updated_at: '2024-01-02' },
        ],
        headers: { link: '<https://api.github.com/x?page=2>; rel="next"' },
      }));
      const githubService = loadService();

      const result = await githubService.listRepositories('tok', { search: 'app-one' });

      expect(result.repositories).toHaveLength(1);
      expect(result.repositories[0]).toEqual(expect.objectContaining({ name: 'app-one', owner: 'me', private: false }));
      expect(result.hasNextPage).toBe(true);
    });

    it('clamps page/perPage to sane bounds', async () => {
      const getSpy = jest.fn().mockResolvedValue({ data: [], headers: {} });
      mockApiClient(getSpy);
      const githubService = loadService();

      await githubService.listRepositories('tok', { page: -5, perPage: 500 });

      expect(getSpy).toHaveBeenCalledWith('/user/repos', expect.objectContaining({
        params: expect.objectContaining({ page: 1, per_page: 100 }),
      }));
    });

    it('reports hasNextPage: false when the link header has no next rel', async () => {
      mockApiClient(jest.fn().mockResolvedValue({ data: [], headers: {} }));
      const githubService = loadService();

      const result = await githubService.listRepositories('tok');

      expect(result.hasNextPage).toBe(false);
    });
  });

  describe('getAuthenticatedUser', () => {
    it('maps the GitHub user payload', async () => {
      axios.create = jest.fn(() => ({ get: jest.fn().mockResolvedValue({ data: { id: 9, login: 'octocat', avatar_url: 'a.png', name: 'The Octocat' } }) }));
      const githubService = loadService();

      const user = await githubService.getAuthenticatedUser('tok');

      expect(user).toEqual({ id: 9, username: 'octocat', avatarUrl: 'a.png', name: 'The Octocat' });
    });
  });

  describe('createRepository', () => {
    it('creates the repo with auto_init and maps the response', async () => {
      const postSpy = jest.fn().mockResolvedValue({
        data: { owner: { login: 'me' }, name: 'app', full_name: 'me/app', html_url: 'u', default_branch: 'main' },
      });
      axios.create = jest.fn(() => ({ post: postSpy }));
      const githubService = loadService();

      const repo = await githubService.createRepository('tok', { name: 'app', description: 'desc', isPrivate: true });

      expect(postSpy).toHaveBeenCalledWith('/user/repos', { name: 'app', description: 'desc', private: true, auto_init: true });
      expect(repo).toEqual({ owner: 'me', name: 'app', fullName: 'me/app', htmlUrl: 'u', defaultBranch: 'main' });
    });
  });

  describe('409 retry behavior (createBlob/createTree/createCommit/updateRef)', () => {
    it('retries once on a 409 and succeeds on the second attempt', async () => {
      jest.useFakeTimers();
      const conflict = { response: { status: 409, data: {} } };
      const postSpy = jest.fn()
        .mockRejectedValueOnce(conflict)
        .mockResolvedValueOnce({ data: { sha: 'blob-sha' } });
      axios.create = jest.fn(() => ({ post: postSpy }));
      const githubService = loadService();

      const promise = githubService.createBlob('tok', 'me', 'app', 'base64content');
      await jest.runAllTimersAsync();
      const sha = await promise;

      expect(sha).toBe('blob-sha');
      expect(postSpy).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });

    it('gives up and rethrows after exhausting retries on repeated 409s', async () => {
      jest.useFakeTimers();
      const conflict = { response: { status: 409, data: {} } };
      const postSpy = jest.fn().mockRejectedValue(conflict);
      axios.create = jest.fn(() => ({ post: postSpy }));
      const githubService = loadService();

      const promise = githubService.createTree('tok', 'me', 'app', []);
      const assertion = expect(promise).rejects.toBe(conflict);
      await jest.runAllTimersAsync();
      await assertion;

      expect(postSpy).toHaveBeenCalledTimes(5);
      jest.useRealTimers();
    });

    it('does not retry a non-409 error', async () => {
      const serverError = { response: { status: 500 } };
      const postSpy = jest.fn().mockRejectedValue(serverError);
      axios.create = jest.fn(() => ({ post: postSpy }));
      const githubService = loadService();

      await expect(githubService.createCommit('tok', 'me', 'app', { message: 'x', treeSha: 'abc' })).rejects.toBe(serverError);
      expect(postSpy).toHaveBeenCalledTimes(1);
    });

    it('updateRef force-patches the branch ref', async () => {
      const patchSpy = jest.fn().mockResolvedValue({ data: {} });
      axios.create = jest.fn(() => ({ patch: patchSpy }));
      const githubService = loadService();

      await githubService.updateRef('tok', 'me', 'app', 'main', 'commit-sha');

      expect(patchSpy).toHaveBeenCalledWith('/repos/me/app/git/refs/heads/main', { sha: 'commit-sha', force: true });
    });
  });

  describe('isRepoNameTakenError / isAuthError', () => {
    it('detects a 422 "name already exists" error', () => {
      const githubService = loadService();
      const error = { response: { status: 422, data: { errors: [{ message: 'name already exists on this account' }] } } };
      expect(githubService.isRepoNameTakenError(error)).toBe(true);
    });

    it('does not misclassify an unrelated 422', () => {
      const githubService = loadService();
      const error = { response: { status: 422, data: { errors: [{ message: 'something else is invalid' }] } } };
      expect(githubService.isRepoNameTakenError(error)).toBe(false);
    });

    it('does not misclassify a non-422 status', () => {
      const githubService = loadService();
      const error = { response: { status: 500, data: { errors: [{ message: 'already exists' }] } } };
      expect(githubService.isRepoNameTakenError(error)).toBe(false);
    });

    it('detects a 401 as an auth error', () => {
      const githubService = loadService();
      expect(githubService.isAuthError({ response: { status: 401 } })).toBe(true);
      expect(githubService.isAuthError({ response: { status: 403 } })).toBe(false);
    });
  });

  describe('getRepository', () => {
    it('maps the repository metadata used by the analyzer', async () => {
      axios.create = jest.fn(() => ({ get: jest.fn().mockResolvedValue({ data: { default_branch: 'main', private: false, html_url: 'u' } }) }));
      const githubService = loadService();

      const repo = await githubService.getRepository('tok', 'me', 'app');

      expect(repo).toEqual({ defaultBranch: 'main', private: false, htmlUrl: 'u' });
    });
  });

  describe('getRepoTree', () => {
    it('returns only blob/tree entries, filtering out other types', async () => {
      axios.create = jest.fn(() => ({
        get: jest.fn().mockResolvedValue({
          data: {
            truncated: false,
            tree: [
              { path: 'src/index.js', type: 'blob', size: 100 },
              { path: 'src', type: 'tree' },
              { path: 'src/index.js', type: 'commit' },
            ],
          },
        }),
      }));
      const githubService = loadService();

      const tree = await githubService.getRepoTree('tok', 'me', 'app', 'main');

      expect(tree).toEqual([
        { path: 'src/index.js', type: 'blob', size: 100 },
        { path: 'src', type: 'tree', size: undefined },
      ]);
    });
  });

  describe('getFileContent', () => {
    it('returns the raw string body when GitHub responds with plain text', async () => {
      axios.create = jest.fn(() => ({ get: jest.fn().mockResolvedValue({ data: 'console.log(1);' }) }));
      const githubService = loadService();

      const content = await githubService.getFileContent('tok', 'me', 'app', 'index.js', 'main');

      expect(content).toBe('console.log(1);');
    });

    it('base64-decodes a JSON-shaped fallback response', async () => {
      const base64 = Buffer.from('hello world').toString('base64');
      axios.create = jest.fn(() => ({ get: jest.fn().mockResolvedValue({ data: { content: base64, encoding: 'base64' } }) }));
      const githubService = loadService();

      const content = await githubService.getFileContent('tok', 'me', 'app', 'file.txt', 'main');

      expect(content).toBe('hello world');
    });

    it('returns null for a 404 (file does not exist)', async () => {
      axios.create = jest.fn(() => ({ get: jest.fn().mockRejectedValue({ response: { status: 404 } }) }));
      const githubService = loadService();

      const content = await githubService.getFileContent('tok', 'me', 'app', 'missing.txt', 'main');

      expect(content).toBeNull();
    });

    it('rethrows any other error', async () => {
      const serverError = { response: { status: 500 } };
      axios.create = jest.fn(() => ({ get: jest.fn().mockRejectedValue(serverError) }));
      const githubService = loadService();

      await expect(githubService.getFileContent('tok', 'me', 'app', 'file.txt', 'main')).rejects.toBe(serverError);
    });
  });
});
