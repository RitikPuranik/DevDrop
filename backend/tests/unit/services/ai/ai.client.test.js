jest.mock('axios');
const axios = require('axios');
const aiClient = require('../../../../src/services/ai/ai.client');

describe('ai.client', () => {
  describe('createGenerationJob', () => {
    it('sends X-Service-Auth, X-Owner-Id and Idempotency-Key headers', async () => {
      axios.mockResolvedValue({ data: { jobId: 'job-1', projectId: null, status: 'queued', currentStage: 'QUEUED' } });

      const result = await aiClient.createGenerationJob(
        { websiteType: 'portfolio', userData: { name: 'Ritik', role: 'Developer' } },
        { ownerId: 'user-42', idempotencyKey: 'idem-1' }
      );

      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'post',
          url: 'http://ai-service.test.internal/v1/generation/jobs',
          headers: expect.objectContaining({
            'X-Service-Auth': 'test-ai-service-token',
            'X-Owner-Id': 'user-42',
            'Idempotency-Key': 'idem-1',
          }),
        })
      );
      expect(result).toEqual({ jobId: 'job-1', projectId: null, status: 'queued', currentStage: 'QUEUED' });
    });

    it('normalizes a non-2xx response into an AiServiceError', async () => {
      axios.mockRejectedValue({
        response: { status: 422, data: { error: { code: 'VALIDATION_ERROR', message: 'name is required' } } },
      });

      await expect(aiClient.createGenerationJob({}, { ownerId: 'u1' })).rejects.toMatchObject({
        name: 'AiServiceError',
        status: 422,
        code: 'VALIDATION_ERROR',
        message: 'name is required',
      });
    });

    it('normalizes a network failure (no response) into a 502', async () => {
      axios.mockRejectedValue(new Error('socket hang up'));

      await expect(aiClient.createGenerationJob({}, { ownerId: 'u1' })).rejects.toMatchObject({
        name: 'AiServiceError',
        status: 502,
        code: 'AI_SERVICE_UNREACHABLE',
      });
    });

    it('normalizes a timeout into a 504', async () => {
      const timeoutError = new Error('timeout of 20000ms exceeded');
      timeoutError.code = 'ECONNABORTED';
      axios.mockRejectedValue(timeoutError);

      await expect(aiClient.createGenerationJob({}, { ownerId: 'u1' })).rejects.toMatchObject({
        status: 504,
        code: 'AI_SERVICE_TIMEOUT',
      });
    });

    it('throws AI_SERVICE_UNAVAILABLE when AI_SERVICE_URL is unset', async () => {
      const originalUrl = process.env.AI_SERVICE_URL;
      delete process.env.AI_SERVICE_URL;

      await expect(aiClient.createGenerationJob({}, { ownerId: 'u1' })).rejects.toMatchObject({
        status: 503,
        code: 'AI_SERVICE_UNAVAILABLE',
      });

      process.env.AI_SERVICE_URL = originalUrl;
    });
  });

  describe('getGenerationJob', () => {
    it('GETs the job status endpoint', async () => {
      axios.mockResolvedValue({ data: { jobId: 'job-1', status: 'running', currentStage: 'CODE_GENERATION' } });

      const result = await aiClient.getGenerationJob('job-1');

      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'get', url: 'http://ai-service.test.internal/v1/generation/jobs/job-1' })
      );
      expect(result.status).toBe('running');
    });
  });

  describe('isAiServiceConfigured', () => {
    it('reflects whether AI_SERVICE_URL is set', () => {
      expect(aiClient.isAiServiceConfigured()).toBe(true);
    });
  });
});
