// INTEGRATION: Deployment orchestration — orchestrator.js's runDeployment()
// chaining real AES-256-GCM credential decryption (crypto.js), real
// environment-variable resolution (envSync.js's two-phase frontend/backend
// URL sync), real provider routing (provider.factory.js), and the
// Deployment document's own status state machine, against mocked provider
// *implementations* (the actual Vercel/Render HTTP calls) and a mocked
// database boundary for Deployment / DeploymentProviderConnection.
//
// Why this exists: tests/unit/services/deployment/analyzer.test.js and
// deployment-hardening.test.js unit-test envSync's pure functions
// (resolveVariableValue, buildVariableList) directly, with hand-built
// envPlan arrays and context objects — nothing exercises runDeployment
// itself, so the actual chain of "decrypt stored credential -> pick
// provider by name -> push resolved env vars -> poll to completion ->
// advance deployment.status -> resync backend once frontend's URL exists"
// has zero coverage before this file. This is exactly the "Deployment
// request -> Analyzer/EnvSync -> Deployment provider" workflow the task
// brief names as a HIGH-priority integration boundary.
//
// Real internal components: orchestrator.js (runDeployment), crypto.js
// (encrypt/decrypt — the credential is round-tripped through real AES-GCM,
// not a stub), envSync.js (resolveVariableValue/buildVariableList),
// provider.factory.js (getProvider name->module routing), and the
// Deployment model's status/envPlan/render/vercel field semantics.
// Mocked external/boundary components: vercel.provider.js and
// render.provider.js (the actual outbound HTTP calls to Vercel/Render —
// real network calls to third-party infra must never happen in tests), and
// the Deployment / DeploymentProviderConnection "database" (see
// checkout-coupon-flow.test.js's header for why a real MongoDB isn't
// available in this sandbox; Option D in-memory boundary mocks used
// instead, consistent with the rest of this suite).

jest.mock('../../../src/modules/deployment/deployment.model', () => require('../../mocks/models/deployment.model.mock'));
jest.mock('../../../src/modules/deployment/deploymentProviderConnection.model', () => require('../../mocks/models/deploymentProviderConnection.model.mock'));

const mockRenderProvider = {
  ensureProject: jest.fn(),
  configureEnvironment: jest.fn().mockResolvedValue(undefined),
  deploy: jest.fn(),
  getDeploymentStatus: jest.fn(),
};
const mockVercelProvider = {
  ensureProject: jest.fn(),
  configureEnvironment: jest.fn().mockResolvedValue(undefined),
  deploy: jest.fn(),
  getDeploymentStatus: jest.fn(),
};
jest.mock('../../../src/services/deployment/providers/render.provider', () => mockRenderProvider);
jest.mock('../../../src/services/deployment/providers/vercel.provider', () => mockVercelProvider);

const cryptoUtil = require('../../../src/shared/utils/crypto');
const Deployment = require('../../../src/modules/deployment/deployment.model');
const DeploymentProviderConnection = require('../../../src/modules/deployment/deploymentProviderConnection.model');
const { runDeployment } = require('../../../src/services/deployment/orchestrator');

const USER_ID = 'user-1';

const baseEnvPlan = () => ([
  { key: 'NODE_ENV', target: 'backend', source: 'auto', autoRole: 'static', required: true, configured: false },
  { key: 'FRONTEND_URL', target: 'backend', source: 'auto', autoRole: 'frontend-url', required: true, configured: false },
  { key: 'DATABASE_URL', target: 'backend', source: 'user', required: true, configured: false },
  { key: 'NODE_ENV', target: 'frontend', source: 'auto', autoRole: 'static', required: true, configured: false },
  { key: 'VITE_API_URL', target: 'frontend', source: 'auto', autoRole: 'backend-url', required: true, configured: false },
]);

beforeEach(() => {
  Deployment.__reset();
  DeploymentProviderConnection.__reset();
  jest.clearAllMocks();
});

describe('Deployment orchestration (integration)', () => {
  it('runs a fullstack deployment end to end: real decryption, real two-phase env sync, provider routing, and status transitions', async () => {
    DeploymentProviderConnection.__seed({
      userId: USER_ID,
      provider: 'render',
      credentialEncrypted: cryptoUtil.encrypt('render-api-key'),
      metadata: { ownerId: 'owner-render-1' },
    });
    DeploymentProviderConnection.__seed({
      userId: USER_ID,
      provider: 'vercel',
      credentialEncrypted: cryptoUtil.encrypt('vercel-oauth-token'),
      metadata: { teamId: 'team-1' },
    });

    const deployment = Deployment.__seed({
      userId: USER_ID,
      repository: { owner: 'acme', name: 'my-app', defaultBranch: 'main' },
      backendProvider: 'render',
      frontendProvider: 'vercel',
      envPlan: baseEnvPlan(),
      pendingSecretsEncrypted: cryptoUtil.encrypt(JSON.stringify({ DATABASE_URL: 'postgres://real-secret' })),
    });

    mockRenderProvider.ensureProject.mockResolvedValue({ serviceId: 'render-svc-1' });
    mockRenderProvider.deploy.mockResolvedValue({ deployId: 'render-deploy-1' });
    mockRenderProvider.getDeploymentStatus.mockResolvedValue({
      isTerminal: true, isSuccess: true, state: 'live', url: 'https://my-app-api.onrender.com',
    });
    mockVercelProvider.ensureProject.mockResolvedValue({ projectId: 'vercel-proj-1', projectName: 'my-app' });
    mockVercelProvider.deploy.mockResolvedValue({ deployId: 'vercel-deploy-1' });
    mockVercelProvider.getDeploymentStatus.mockResolvedValue({
      isTerminal: true, isSuccess: true, state: 'READY', url: 'https://my-app.vercel.app',
    });

    await runDeployment(deployment._id);

    // Real crypto: the provider received the exact plaintext that was
    // encrypted above, proving decrypt() actually ran (a stubbed/mocked
    // crypto layer would never produce this specific string).
    expect(mockRenderProvider.ensureProject.mock.calls[0][0]).toBe('render-api-key');
    expect(mockVercelProvider.ensureProject.mock.calls[0][0]).toBe('vercel-oauth-token');

    // Real envSync, phase 1: FRONTEND_URL can't resolve yet (frontend hasn't
    // deployed), so it must be omitted rather than sent as null/empty —
    // this is the two-phase deployment business rule, exercised for real.
    const backendVarsPhase1 = mockRenderProvider.configureEnvironment.mock.calls[0][3];
    expect(backendVarsPhase1).toEqual(expect.arrayContaining([
      { key: 'NODE_ENV', value: 'production' },
      { key: 'DATABASE_URL', value: 'postgres://real-secret' },
    ]));
    expect(backendVarsPhase1.find((v) => v.key === 'FRONTEND_URL')).toBeUndefined();

    // Real envSync, phase 2: the frontend's VITE_API_URL resolves to the
    // backend URL the render provider just returned — proving context
    // actually threads the backend's real deployed URL into phase 2.
    const frontendVars = mockVercelProvider.configureEnvironment.mock.calls[0][3];
    expect(frontendVars).toEqual(expect.arrayContaining([
      { key: 'VITE_API_URL', value: 'https://my-app-api.onrender.com' },
    ]));

    // Real envSync, phase 3 (resync): now that the frontend URL exists,
    // the backend gets a second configureEnvironment call carrying it.
    expect(mockRenderProvider.configureEnvironment).toHaveBeenCalledTimes(2);
    const backendVarsPhase3 = mockRenderProvider.configureEnvironment.mock.calls[1][3];
    expect(backendVarsPhase3).toEqual(expect.arrayContaining([
      { key: 'FRONTEND_URL', value: 'https://my-app.vercel.app' },
    ]));

    const finalDoc = Deployment.__get(deployment._id);
    expect(finalDoc.status).toBe('SUCCESS');
    expect(finalDoc.render.url).toBe('https://my-app-api.onrender.com');
    expect(finalDoc.vercel.url).toBe('https://my-app.vercel.app');
    expect(finalDoc.envPlan.every((e) => e.configured)).toBe(true);
  });

  it('propagates a backend build failure without ever starting the frontend phase', async () => {
    DeploymentProviderConnection.__seed({
      userId: USER_ID,
      provider: 'render',
      credentialEncrypted: cryptoUtil.encrypt('render-api-key'),
    });
    DeploymentProviderConnection.__seed({
      userId: USER_ID,
      provider: 'vercel',
      credentialEncrypted: cryptoUtil.encrypt('vercel-oauth-token'),
    });

    const deployment = Deployment.__seed({
      userId: USER_ID,
      repository: { owner: 'acme', name: 'my-app', defaultBranch: 'main' },
      backendProvider: 'render',
      frontendProvider: 'vercel',
      envPlan: baseEnvPlan(),
      pendingSecretsEncrypted: cryptoUtil.encrypt(JSON.stringify({ DATABASE_URL: 'postgres://real-secret' })),
    });

    mockRenderProvider.ensureProject.mockResolvedValue({ serviceId: 'render-svc-1' });
    mockRenderProvider.deploy.mockResolvedValue({ deployId: 'render-deploy-1' });
    mockRenderProvider.getDeploymentStatus.mockResolvedValue({
      isTerminal: true, isSuccess: false, state: 'build_failed',
    });

    // The orchestrator intentionally logs this failure via console.error —
    // expected negative-path logging, suppressed only for this test.
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await runDeployment(deployment._id);

      const finalDoc = Deployment.__get(deployment._id);
      expect(finalDoc.status).toBe('FAILED');
      expect(finalDoc.errorStep).toBe('DEPLOYING_BACKEND');
      expect(finalDoc.errorMessage).toMatch(/Deploying backend/);
      expect(finalDoc.errorMessage).toMatch(/did not succeed/);

      // Failure must stop the chain — the frontend phase (a genuinely
      // different provider/module) must never run.
      expect(mockVercelProvider.ensureProject).not.toHaveBeenCalled();
      expect(mockVercelProvider.deploy).not.toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('fails cleanly with a friendly message when the provider was never connected, without calling any provider method', async () => {
    // No DeploymentProviderConnection seeded at all for this user/provider.
    const deployment = Deployment.__seed({
      userId: USER_ID,
      repository: { owner: 'acme', name: 'solo-api', defaultBranch: 'main' },
      backendProvider: 'render',
      frontendProvider: null,
      envPlan: [{ key: 'NODE_ENV', target: 'backend', source: 'auto', autoRole: 'static', required: true, configured: false }],
    });

    // The orchestrator intentionally logs this failure via console.error —
    // expected negative-path logging, suppressed only for this test.
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await runDeployment(deployment._id);

      const finalDoc = Deployment.__get(deployment._id);
      expect(finalDoc.status).toBe('FAILED');
      expect(finalDoc.errorMessage).toMatch(/Render isn't connected yet/);

      expect(mockRenderProvider.ensureProject).not.toHaveBeenCalled();
      expect(mockRenderProvider.configureEnvironment).not.toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('is idempotent on redeploy: looks up the existing Render service by stored ID instead of creating a second one', async () => {
    DeploymentProviderConnection.__seed({
      userId: USER_ID,
      provider: 'render',
      credentialEncrypted: cryptoUtil.encrypt('render-api-key'),
    });

    const deployment = Deployment.__seed({
      userId: USER_ID,
      repository: { owner: 'acme', name: 'backend-only', defaultBranch: 'main' },
      backendProvider: 'render',
      frontendProvider: null,
      envPlan: [{ key: 'NODE_ENV', target: 'backend', source: 'auto', autoRole: 'static', required: true, configured: false }],
      // Simulates a retry: a previous run already created the Render service.
      render: { serviceId: 'render-svc-existing' },
    });

    mockRenderProvider.ensureProject.mockResolvedValue({ serviceId: 'render-svc-existing' });
    mockRenderProvider.deploy.mockResolvedValue({ deployId: 'render-deploy-2' });
    mockRenderProvider.getDeploymentStatus.mockResolvedValue({
      isTerminal: true, isSuccess: true, state: 'live', url: 'https://backend-only.onrender.com',
    });

    await runDeployment(deployment._id);

    // The orchestrator must pass the existing serviceId so the real
    // provider module can look the resource up instead of creating a new
    // one — this is the §39 idempotency guarantee, exercised for real
    // rather than asserted against orchestrator source code.
    const [, , , existingIdHint] = mockRenderProvider.ensureProject.mock.calls[0];
    expect(existingIdHint).toEqual({ serviceId: 'render-svc-existing' });
    expect(Deployment.__get(deployment._id).status).toBe('SUCCESS');
  });
});
