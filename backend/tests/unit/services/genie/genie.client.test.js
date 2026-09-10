jest.mock('axios');
const axios = require('axios');
const genieClient = require('../../../../src/services/genie/client');

describe('genie/client', () => {
  describe('createGeneration', () => {
    it('sends X-Service-Key and X-User-Id headers', async () => {
      axios.mockResolvedValue({ data: { success: true, data: { id: 'gen-1', status: 'pending', message: 'Generation started.' } } });

      const result = await genieClient.createGeneration(
        { prompt: 'Build a portfolio site for Ritik, a developer.' },
        { ownerId: 'user-42' }
      );

      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'post',
          url: 'http://genie.test.internal/api/generate',
          headers: expect.objectContaining({
            'X-Service-Key': 'test-genie-service-token',
            'X-User-Id': 'user-42',
          }),
        })
      );
      expect(result.data).toEqual({ id: 'gen-1', status: 'pending', message: 'Generation started.' });
    });

    it('normalizes a non-2xx response into a GenieServiceError', async () => {
      axios.mockRejectedValue({
        response: { status: 422, data: { error: 'Invalid request data' } },
      });

      await expect(genieClient.createGeneration({}, { ownerId: 'u1' })).rejects.toMatchObject({
        name: 'GenieServiceError',
        status: 422,
        code: 'AI_SERVICE_ERROR',
        message: 'Invalid request data',
      });
    });

    it('normalizes a 401 from Genie into AI_SERVICE_AUTH_ERROR', async () => {
      axios.mockRejectedValue({
        response: { status: 401, data: { error: 'Authentication required.' } },
      });

      await expect(genieClient.createGeneration({}, { ownerId: 'u1' })).rejects.toMatchObject({
        status: 401,
        code: 'AI_SERVICE_AUTH_ERROR',
      });
    });

    it('normalizes a network failure (no response) into a 502', async () => {
      axios.mockRejectedValue(new Error('socket hang up'));

      await expect(genieClient.createGeneration({}, { ownerId: 'u1' })).rejects.toMatchObject({
        name: 'GenieServiceError',
        status: 502,
        code: 'AI_SERVICE_UNREACHABLE',
      });
    });

    it('normalizes a timeout into a 504', async () => {
      const timeoutError = new Error('timeout of 30000ms exceeded');
      timeoutError.code = 'ECONNABORTED';
      axios.mockRejectedValue(timeoutError);

      await expect(genieClient.createGeneration({}, { ownerId: 'u1' })).rejects.toMatchObject({
        status: 504,
        code: 'AI_SERVICE_TIMEOUT',
      });
    });

    it('throws AI_SERVICE_UNAVAILABLE when AI_SERVICE_URL is unset', async () => {
      const originalUrl = process.env.AI_SERVICE_URL;
      delete process.env.AI_SERVICE_URL;

      await expect(genieClient.createGeneration({}, { ownerId: 'u1' })).rejects.toMatchObject({
        status: 503,
        code: 'AI_SERVICE_UNAVAILABLE',
      });

      process.env.AI_SERVICE_URL = originalUrl;
    });
  });

  describe('getGeneration', () => {
    it('GETs the generation endpoint, only passing full=true when requested', async () => {
      axios.mockResolvedValue({ data: { success: true, data: { id: 'gen-1', status: 'processing' } } });

      const result = await genieClient.getGeneration('gen-1', { ownerId: 'u1' });

      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'get', url: 'http://genie.test.internal/api/generate/gen-1', params: undefined })
      );
      expect(result.data.status).toBe('processing');

      await genieClient.getGeneration('gen-1', { ownerId: 'u1', full: true });
      expect(axios).toHaveBeenLastCalledWith(
        expect.objectContaining({ params: { full: 'true' } })
      );
    });
  });

  describe('sendChatMessage', () => {
    it('POSTs to /api/chat with generationId, message and currentFiles', async () => {
      axios.mockResolvedValue({ data: { success: true } });

      await genieClient.sendChatMessage(
        { generationId: 'gen-1', message: 'Make the navbar dark blue', currentFiles: [{ path: 'App.tsx', content: '...' }] },
        { ownerId: 'u1' }
      );

      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'post',
          url: 'http://genie.test.internal/api/chat',
          data: expect.objectContaining({ generationId: 'gen-1', message: 'Make the navbar dark blue' }),
        })
      );
    });
  });

  describe('isGenieConfigured', () => {
    it('reflects whether AI_SERVICE_URL is set', () => {
      expect(genieClient.isGenieConfigured()).toBe(true);
    });
  });
});
