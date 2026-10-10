jest.mock('../src/groq.service', () => ({
  chat: jest.fn(),
}));

const groq = require('../src/groq.service');
const { planDeployment } = require('../src/deployment/planner');

describe('deployment planner', () => {
  beforeEach(() => jest.clearAllMocks());

  it('accepts only exact candidate roots returned by the model', async () => {
    groq.chat.mockResolvedValue({
      model: 'llama-3.1-8b-instant',
      json: {
        frontend: { root: 'packages/storefront', confidence: 0.93, reason: 'real Vite app' },
        backend: null,
      },
    });

    const result = await planDeployment({
      candidates: {
        frontend: [
          { root: 'packages/storefront', framework: 'React', signals: { hasBuildScript: true } },
          { root: 'packages/docs', framework: 'React', signals: { hasBuildScript: false } },
        ],
        backend: [],
      },
      treePaths: ['packages/storefront/package.json'],
    });

    expect(result.status).toBe('ok');
    expect(result.frontend).toEqual(expect.objectContaining({ root: 'packages/storefront', confidence: 0.93 }));
  });

  it('rejects an invented root instead of passing it downstream', async () => {
    groq.chat.mockResolvedValue({
      model: 'llama-3.1-8b-instant',
      json: {
        frontend: { root: 'frontend', confidence: 1, reason: 'invented' },
        backend: null,
      },
    });

    const result = await planDeployment({
      candidates: { frontend: [{ root: 'packages/storefront' }], backend: [] },
      treePaths: ['packages/storefront/package.json'],
    });

    expect(result.status).toBe('ok');
    expect(result.frontend).toBeNull();
  });
});
