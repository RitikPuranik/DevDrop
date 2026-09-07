module.exports = {
  isGithubConfigured: jest.fn(() => true),
  isGithubLoginConfigured: jest.fn(() => true),
  getAuthorizeUrl: jest.fn(() => 'https://github.com/login/oauth/authorize?mock=export'),
  getLoginAuthorizeUrl: jest.fn(() => 'https://github.com/login/oauth/authorize?mock=login'),
  getLoginRedirectUri: jest.fn(() => 'http://localhost:5000/api/auth/github/callback'),
  exchangeCodeForToken: jest.fn(async () => ({ accessToken: 'mock-access-token', scope: 'read:user user:email', tokenType: 'bearer' })),
  getAuthenticatedUser: jest.fn(async () => ({ id: 555111, username: 'octocat', avatarUrl: 'https://avatars.example.com/octocat.png', name: 'Mona Octocat' })),
  getUserEmails: jest.fn(async () => ([{ email: 'octocat@example.com', primary: true, verified: true }])),
  getPrimaryVerifiedEmail: jest.fn(async () => 'octocat@example.com'),
  listRepositories: jest.fn(async () => []),
};
