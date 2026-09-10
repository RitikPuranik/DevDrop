jest.mock('axios');
const axios = require('axios');
const aiClient = require('../../src/services/ai/ai.client');

/**
 * Contract test between the DevDrop backend's AI client and the AI
 * service's actual API surface (ai-service/routes/planning.py,
 * ai-service/routes/generation.py, ai-service/routes/jobs.py).
 *
 * This does NOT import any Python code — it pins down the JSON shapes
 * both sides have agreed on, so a future change to either side that
 * breaks the contract fails a test instead of failing silently in prod.
 */
describe('AI service contract', () => {
  describe('generation job creation request', () => {
    it('matches PortfolioPlanningRequest: { websiteType, userData, preferences }', async () => {
      axios.mockResolvedValue({ data: { jobId: 'job-1', projectId: null, status: 'queued', currentStage: 'QUEUED' } });

      await aiClient.createGenerationJob(
        {
          websiteType: 'portfolio',
          userData: {
            name: 'Ritik Singh',
            role: 'Full Stack Developer',
            bio: 'Building things.',
            skills: ['TypeScript', 'Node.js'],
            projects: [{ title: 'FarmLink', description: 'Ag platform', link: 'https://github.com/x/farmlink' }],
            socialLinks: { github: 'https://github.com/x', linkedin: 'https://linkedin.com/in/x' },
          },
          preferences: { theme: 'dark', style: 'modern', animations: true },
        },
        { ownerId: 'user-1', idempotencyKey: 'idem-1' }
      );

      const sentBody = axios.mock.calls[0][0].data;
      expect(Object.keys(sentBody).sort()).toEqual(['preferences', 'userData', 'websiteType'].sort());
      expect(Object.keys(sentBody.userData).sort()).toEqual(
        ['name', 'role', 'bio', 'skills', 'projects', 'socialLinks'].sort()
      );
      expect(Object.keys(sentBody.preferences).sort()).toEqual(['theme', 'style', 'animations'].sort());
    });
  });

  describe('generation job response (POST /v1/generation/jobs)', () => {
    it('accepts the documented { jobId, projectId, status, currentStage } shape', async () => {
      const aiServiceResponse = { jobId: 'job-abc123', projectId: null, status: 'queued', currentStage: 'QUEUED' };
      axios.mockResolvedValue({ data: aiServiceResponse });

      const result = await aiClient.createGenerationJob({}, { ownerId: 'u1' });

      expect(result).toEqual(
        expect.objectContaining({
          jobId: expect.any(String),
          status: expect.stringMatching(/^(queued|running|completed|failed|cancelled)$/),
          currentStage: expect.any(String),
        })
      );
    });
  });

  describe('job status response (GET /v1/generation/jobs/{jobId})', () => {
    it('accepts a completed job with a projectId', async () => {
      axios.mockResolvedValue({
        data: { jobId: 'job-abc123', projectId: 'proj-xyz789', status: 'completed', currentStage: 'FINALIZING' },
      });

      const result = await aiClient.getGenerationJob('job-abc123');

      expect(result.status).toBe('completed');
      expect(result.projectId).toBe('proj-xyz789');
    });

    it('accepts a failed job with error details', async () => {
      axios.mockResolvedValue({
        data: {
          jobId: 'job-abc123',
          projectId: null,
          status: 'failed',
          currentStage: 'BUILD',
          failureCode: 'BUILD_FAILED',
          failureMessage: 'Build failed after 3 repair attempts.',
        },
      });

      const result = await aiClient.getGenerationJob('job-abc123');

      expect(result.status).toBe('failed');
      expect(result.failureCode).toBe('BUILD_FAILED');
    });
  });

  describe('error contract', () => {
    it('normalizes AI-service error envelope { error: { code, message, stage } }', async () => {
      axios.mockRejectedValue({
        response: {
          status: 422,
          data: { error: { code: 'VALIDATION_ERROR', message: 'userData.name is required', stage: null } },
        },
      });

      await expect(aiClient.createGenerationJob({}, { ownerId: 'u1' })).rejects.toMatchObject({
        status: 422,
        code: 'VALIDATION_ERROR',
        message: 'userData.name is required',
      });
    });
  });
});
