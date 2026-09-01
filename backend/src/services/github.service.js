const axios = require('axios');

// Minimal scope GitHub offers for creating repositories (public or private)
// and pushing files to them on the user's behalf. Classic OAuth apps don't
// have a narrower "create repos only" scope — that level of granularity
// would require migrating to a GitHub App, which is out of scope here.
const OAUTH_SCOPE = 'repo';

const getClientId = () => {
  if (!process.env.GITHUB_CLIENT_ID) throw new Error('GITHUB_CLIENT_ID is not configured.');
  return process.env.GITHUB_CLIENT_ID;
};

const getClientSecret = () => {
  if (!process.env.GITHUB_CLIENT_SECRET) throw new Error('GITHUB_CLIENT_SECRET is not configured.');
  return process.env.GITHUB_CLIENT_SECRET;
};

const getRedirectUri = () => {
  if (!process.env.GITHUB_OAUTH_REDIRECT_URI) throw new Error('GITHUB_OAUTH_REDIRECT_URI is not configured.');
  return process.env.GITHUB_OAUTH_REDIRECT_URI;
};

const isGithubConfigured = () =>
  Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET && process.env.GITHUB_OAUTH_REDIRECT_URI);

/**
 * Build the URL the user's browser (popup) should be sent to in order to
 * authorize DevDrop's GitHub OAuth app.
 */
const getAuthorizeUrl = (state) => {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    scope: OAUTH_SCOPE,
    state,
    allow_signup: 'true',
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
};

/**
 * Exchange the OAuth "code" GitHub sent to our callback for an access token.
 */
const exchangeCodeForToken = async (code) => {
  const { data } = await axios.post(
    'https://github.com/login/oauth/access_token',
    {
      client_id: getClientId(),
      client_secret: getClientSecret(),
      code,
      redirect_uri: getRedirectUri(),
    },
    { headers: { Accept: 'application/json' } }
  );

  if (data.error) {
    throw new Error(data.error_description || data.error);
  }
  if (!data.access_token) {
    throw new Error('GitHub did not return an access token.');
  }

  return { accessToken: data.access_token, scope: data.scope, tokenType: data.token_type };
};

const githubApi = (accessToken) =>
  axios.create({
    baseURL: 'https://api.github.com',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    timeout: 30000,
  });

const getAuthenticatedUser = async (accessToken) => {
  const { data } = await githubApi(accessToken).get('/user');
  return { id: data.id, username: data.login, avatarUrl: data.avatar_url, name: data.name };
};

/** True when the GitHub API rejected repo creation because the name is taken. */
const isRepoNameTakenError = (error) => {
  const errors = error?.response?.data?.errors;
  if (error?.response?.status !== 422 || !Array.isArray(errors)) return false;
  return errors.some((e) => /already exists/i.test(e.message || ''));
};

/** True when the stored token is missing/expired/revoked. */
const isAuthError = (error) => error?.response?.status === 401;

const createRepository = async (accessToken, { name, description, isPrivate }) => {
  const { data } = await githubApi(accessToken).post('/user/repos', {
    name,
    description: description || undefined,
    private: isPrivate,
    auto_init: false,
  });

  return {
    owner: data.owner?.login,
    name: data.name,
    fullName: data.full_name,
    htmlUrl: data.html_url,
    defaultBranch: data.default_branch || 'main',
  };
};

const createBlob = async (accessToken, owner, repo, base64Content) => {
  const { data } = await githubApi(accessToken).post(`/repos/${owner}/${repo}/git/blobs`, {
    content: base64Content,
    encoding: 'base64',
  });
  return data.sha;
};

const createTree = async (accessToken, owner, repo, tree) => {
  const { data } = await githubApi(accessToken).post(`/repos/${owner}/${repo}/git/trees`, { tree });
  return data.sha;
};

const createCommit = async (accessToken, owner, repo, { message, treeSha, parents = [] }) => {
  const { data } = await githubApi(accessToken).post(`/repos/${owner}/${repo}/git/commits`, {
    message,
    tree: treeSha,
    parents,
  });
  return data.sha;
};

/** Creates the ref for a brand-new repo that has no commits/branches yet. */
const createRef = async (accessToken, owner, repo, branch, commitSha) => {
  await githubApi(accessToken).post(`/repos/${owner}/${repo}/git/refs`, {
    ref: `refs/heads/${branch}`,
    sha: commitSha,
  });
};

// --- Read-only helpers used by the deployment repository analyzer ---
// (backend/src/services/deployment/analyzer.js). These reuse the same
// githubApi() client/token as the export flow above; nothing new to
// authenticate.

/** Current repo metadata — used to confirm the default branch is still
 * accurate before analyzing (a ProjectExport snapshot could be stale if the
 * user renamed branches on GitHub directly). */
const getRepository = async (accessToken, owner, repo) => {
  const { data } = await githubApi(accessToken).get(`/repos/${owner}/${repo}`);
  return { defaultBranch: data.default_branch, private: Boolean(data.private), htmlUrl: data.html_url };
};

/**
 * Full recursive file tree for a branch. GitHub's Trees API resolves a
 * branch/tag name directly as the ":tree_sha" path segment, so no separate
 * "resolve ref to commit to tree sha" round trip is needed.
 * Returns [{ path, type: 'blob'|'tree', size }].
 */
const getRepoTree = async (accessToken, owner, repo, branch) => {
  const { data } = await githubApi(accessToken).get(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}`, {
    params: { recursive: 1 },
  });

  if (data.truncated) {
    // Extremely large repo — the analyzer works off a bounded subset anyway,
    // so this is a soft warning rather than a hard failure.
    // eslint-disable-next-line no-console
    console.warn(`[github.service] Tree for ${owner}/${repo}@${branch} was truncated by GitHub's API.`);
  }

  return (data.tree || [])
    .filter((entry) => entry.type === 'blob' || entry.type === 'tree')
    .map((entry) => ({ path: entry.path, type: entry.type, size: entry.size }));
};

/** Decoded UTF-8 text content of a single file at a given ref, or null if it
 * doesn't exist / isn't a regular file. */
const getFileContent = async (accessToken, owner, repo, path, ref) => {
  try {
    const { data } = await githubApi(accessToken).get(`/repos/${owner}/${repo}/contents/${path}`, {
      params: { ref },
      headers: { Accept: 'application/vnd.github.raw+json' },
    });
    // With the "raw" media type GitHub returns the file body directly as a
    // string for text files; fall back to base64-decoding the JSON shape in
    // case a proxy/cache strips the custom Accept header.
    if (typeof data === 'string') return data;
    if (data && typeof data.content === 'string') {
      return Buffer.from(data.content, data.encoding || 'base64').toString('utf8');
    }
    return null;
  } catch (error) {
    if (error?.response?.status === 404) return null;
    throw error;
  }
};

module.exports = {
  isGithubConfigured,
  getAuthorizeUrl,
  exchangeCodeForToken,
  getAuthenticatedUser,
  createRepository,
  createBlob,
  createTree,
  createCommit,
  createRef,
  isRepoNameTakenError,
  isAuthError,
  getRepository,
  getRepoTree,
  getFileContent,
};
