jest.mock('../../../src/modules/ai/aiGenerationJob.model');
jest.mock('../../../src/services/ai/ai.client');
jest.mock('../../../src/services/supabase.service');

const AiGenerationJob = require('../../../src/modules/ai/aiGenerationJob.model');
const aiClient = require('../../../src/services/ai/ai.client');
const supabaseService = require('../../../src/services/supabase.service');
const aiController = require('../../../src/modules/ai/ai.controller');
const { mockReq, mockRes } = require('../../helpers/mockQuery');

// Restore the real AiServiceError class so `instanceof` checks in the
// controller still work even though the module is mocked.
const { AiServiceError } = jest.requireActual('../../../src/services/ai/ai.client');
aiClient.AiServiceError = AiServiceError;

describe('ai.controller', () => {
  describe('createPortfolioGeneration', () => {
    it('forwards only the AI-service-supported fields and persists ownership record', async () => {
      aiClient.createGenerationJob.mockResolvedValue({
        jobId: 'job-1',
        projectId: null,
        status: 'queued',
        currentStage: 'QUEUED',
      });
      AiGenerationJob.create.mockResolvedValue({
        jobId: 'job-1',
        projectId: null,
        status: 'queued',
        currentStage: 'QUEUED',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = mockReq({
        userId: 'user-42',
        body: {
          websiteType: 'portfolio',
          userData: {
            name: 'Ritik',
            role: 'Full Stack Developer',
            skills: ['TypeScript'],
            targetAudience: 'recruiters', // not part of the AI-service schema
            primaryGoal: 'get hired', // not part of the AI-service schema
          },
          preferences: { theme: 'dark', style: 'modern', animations: true },
        },
      });
      const res = mockRes();

      await aiController.createPortfolioGeneration(req, res);

      const [payload, options] = aiClient.createGenerationJob.mock.calls[0];
      expect(payload.userData).not.toHaveProperty('targetAudience');
      expect(payload.userData).not.toHaveProperty('primaryGoal');
      expect(payload.userData.name).toBe('Ritik');
      expect(options.ownerId).toBe('user-42');
      expect(options.idempotencyKey).toEqual(expect.any(String));

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, jobId: 'job-1' }));
    });

    it('normalizes an AiServiceError into the DevDrop error shape', async () => {
      aiClient.createGenerationJob.mockRejectedValue(
        new AiServiceError({ status: 422, code: 'VALIDATION_ERROR', message: 'name is required' })
      );

      const req = mockReq({ userId: 'user-42', body: { userData: {} } });
      const res = mockRes();

      await aiController.createPortfolioGeneration(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'VALIDATION_ERROR', message: 'name is required' })
      );
    });

    it('returns 500 without leaking internals on an unexpected error', async () => {
      aiClient.createGenerationJob.mockRejectedValue(new Error('ECONNREFUSED 10.0.0.5:8000'));
      const req = mockReq({ userId: 'user-42', body: { userData: {} } });
      const res = mockRes();

      await aiController.createPortfolioGeneration(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const body = res.json.mock.calls[0][0];
      expect(body.message).not.toMatch(/10\.0\.0\.5/);
    });
  });

  describe('getGenerationJobStatus', () => {
    it('returns 404 when the job does not belong to the requesting user', async () => {
      AiGenerationJob.findOne.mockResolvedValue(null);
      const req = mockReq({ userId: 'user-42', params: { jobId: 'someone-elses-job' } });
      const res = mockRes();

      await aiController.getGenerationJobStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(aiClient.getGenerationJob).not.toHaveBeenCalled();
    });

    it('polls the AI service and updates the local record on success', async () => {
      const record = {
        jobId: 'job-1',
        userId: 'user-42',
        status: 'queued',
        currentStage: 'QUEUED',
        save: jest.fn().mockResolvedValue(true),
      };
      AiGenerationJob.findOne.mockResolvedValue(record);
      aiClient.getGenerationJob.mockResolvedValue({
        status: 'completed',
        currentStage: 'FINALIZING',
        projectId: 'proj-1',
      });

      const req = mockReq({ userId: 'user-42', params: { jobId: 'job-1' } });
      const res = mockRes();

      await aiController.getGenerationJobStatus(req, res);

      expect(record.status).toBe('completed');
      expect(record.projectId).toBe('proj-1');
      expect(record.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, status: 'completed' }));
    });
  });

  describe('retryGeneration', () => {
    it('rejects retrying a job that has not failed', async () => {
      AiGenerationJob.findOne.mockResolvedValue({ status: 'running' });
      const req = mockReq({ userId: 'user-42', params: { jobId: 'job-1' } });
      const res = mockRes();

      await aiController.retryGeneration(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(aiClient.createGenerationJob).not.toHaveBeenCalled();
    });

    it('creates a brand new job (new idempotency key) from the stored payload', async () => {
      AiGenerationJob.findOne.mockResolvedValue({
        status: 'failed',
        websiteType: 'portfolio',
        requestPayload: { websiteType: 'portfolio', userData: { name: 'Ritik', role: 'Dev' } },
      });
      aiClient.createGenerationJob.mockResolvedValue({ jobId: 'job-2', status: 'queued', currentStage: 'QUEUED' });
      AiGenerationJob.create.mockResolvedValue({ jobId: 'job-2', status: 'queued', currentStage: 'QUEUED' });

      const req = mockReq({ userId: 'user-42', params: { jobId: 'job-1' } });
      const res = mockRes();

      await aiController.retryGeneration(req, res);

      expect(aiClient.createGenerationJob).toHaveBeenCalledWith(
        { websiteType: 'portfolio', userData: { name: 'Ritik', role: 'Dev' } },
        expect.objectContaining({ ownerId: 'user-42' })
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe('uploadAsset', () => {
    it('rejects an unsupported asset type', async () => {
      const req = mockReq({ userId: 'user-42', body: { type: 'video' }, file: { originalname: 'x.jpg' } });
      const res = mockRes();

      await aiController.uploadAsset(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(supabaseService.uploadFile).not.toHaveBeenCalled();
    });

    it('uploads via the existing Supabase service and returns a public url', async () => {
      supabaseService.uploadFile.mockResolvedValue({ path: 'ai-studio-assets/profile.jpg', size: 1234 });
      supabaseService.getPublicUrl.mockReturnValue('https://cdn.example.com/ai-studio-assets/profile.jpg');

      const req = mockReq({
        userId: 'user-42',
        body: { type: 'profile-image' },
        file: { originalname: 'profile.jpg', buffer: Buffer.from('x'), mimetype: 'image/jpeg', size: 1234 },
      });
      const res = mockRes();

      await aiController.uploadAsset(req, res);

      expect(supabaseService.uploadFile).toHaveBeenCalledWith(req.file, 'ai-studio-assets');
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          asset: expect.objectContaining({ type: 'profile-image', url: expect.stringContaining('profile.jpg') }),
        })
      );
    });
  });
});
