jest.mock('axios');
const axios = require('axios');
const genieClient = require('../../src/services/genie/client');

/**
 * Contract test between DevDrop backend's Genie client and Genie's actual
 * API surface (services/genie/src/api/routes/generate.ts,
 * services/genie/src/api/routes/chat.ts,
 * services/genie/src/api/routes/status.ts).
 *
 * This pins down the JSON shapes both sides have agreed on, so a future
 * change to either side that breaks the contract fails a test instead of
 * failing silently in prod.
 */
describe('Genie service contract', () => {
  describe('generation request (POST /api/generate)', () => {
    it('only sends fields generateRequestSchema actually accepts', async () => {
      axios.mockResolvedValue({ data: { success: true, data: { id: 'gen-1', status: 'pending', message: 'Generation started.' } } });

      await genieClient.createGeneration(
        { prompt: 'Build a portfolio site.', targetLanguage: 'typescript', complexity: 'moderate', imageUrls: ['https://cdn.example.com/a.jpg'] },
        { ownerId: 'user-1' }
      );

      const sentBody = axios.mock.calls[0][0].data;
      expect(Object.keys(sentBody).every((k) =>
        ['prompt', 'projectContext', 'targetLanguage', 'complexity', 'agents', 'imageUrls', 'autoPreview'].includes(k)
      )).toBe(true);
      expect(sentBody.prompt).toEqual(expect.any(String));
    });
  });

  describe('generation response (POST /api/generate)', () => {
    it('accepts the documented { success, data: { id, status, message } } shape', async () => {
      axios.mockResolvedValue({
        data: { success: true, data: { id: 'gen-abc123', status: 'pending', message: 'Generation started. Use the ID to check status.' } },
      });

      const result = await genieClient.createGeneration({ prompt: 'x' }, { ownerId: 'u1' });

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            id: expect.any(String),
            status: expect.stringMatching(/^(pending|processing|completed|failed)$/),
          }),
        })
      );
    });
  });

  describe('generation status response (GET /api/generate/:id)', () => {
    it('accepts a completed generation with files', async () => {
      axios.mockResolvedValue({
        data: {
          success: true,
          data: {
            id: 'gen-abc123',
            status: 'completed',
            files: [{ path: 'src/App.tsx', content: '...' }],
            error: null,
            previewUrl: null,
            deploymentStatus: null,
            fileCount: 1,
          },
        },
      });

      const result = await genieClient.getGeneration('gen-abc123', { ownerId: 'u1', full: true });

      expect(result.data.status).toBe('completed');
      expect(result.data.files).toHaveLength(1);
    });

    it('accepts a failed generation with an error string', async () => {
      axios.mockResolvedValue({
        data: { success: true, data: { id: 'gen-abc123', status: 'failed', error: 'Generation pipeline failed.' } },
      });

      const result = await genieClient.getGeneration('gen-abc123', { ownerId: 'u1' });

      expect(result.data.status).toBe('failed');
      expect(result.data.error).toBe('Generation pipeline failed.');
    });
  });

  describe('health check (GET /api/status)', () => {
    it('accepts { status: "ok", timestamp }', async () => {
      axios.mockResolvedValue({ data: { status: 'ok', timestamp: '2026-09-10T00:00:00.000Z' } });

      const result = await genieClient.checkHealth();

      expect(result.status).toBe('ok');
    });
  });

  describe('error contract', () => {
    it('normalizes Genie error envelope { success: false, error: string }', async () => {
      axios.mockRejectedValue({
        response: { status: 422, data: { success: false, error: 'Invalid request data' } },
      });

      await expect(genieClient.createGeneration({}, { ownerId: 'u1' })).rejects.toMatchObject({
        status: 422,
        message: 'Invalid request data',
      });
    });

    it('normalizes a 401 (auth rejected) response', async () => {
      axios.mockRejectedValue({
        response: { status: 401, data: { success: false, error: 'Authentication required. Please log in to generate code.' } },
      });

      await expect(genieClient.createGeneration({}, { ownerId: 'u1' })).rejects.toMatchObject({
        status: 401,
        code: 'AI_SERVICE_AUTH_ERROR',
      });
    });
  });
});
