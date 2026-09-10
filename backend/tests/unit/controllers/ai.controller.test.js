jest.mock('../../../src/modules/ai/aiGenerationJob.model');
jest.mock('../../../src/services/genie/service');
jest.mock('../../../src/services/genie/client');
jest.mock('../../../src/services/supabase.service');

const AiGenerationJob = require('../../../src/modules/ai/aiGenerationJob.model');
const genieService = require('../../../src/services/genie/service');
const genieClient = require('../../../src/services/genie/client');
const supabaseService = require('../../../src/services/supabase.service');
const aiController = require('../../../src/modules/ai/ai.controller');
const { mockReq, mockRes } = require('../../helpers/mockQuery');

// Restore the real GenieServiceError class so `instanceof` checks in the
// controller still work even though the module is mocked.
const { GenieServiceError } = jest.requireActual('../../../src/services/genie/client');
genieClient.GenieServiceError = GenieServiceError;

// Restore the real isGenerationTerminal helper so the controller's
// "only fetch full=true near the end" branch behaves like production.
const actualGenieService = jest.requireActual('../../../src/services/genie/service');
genieService.isGenerationTerminal = actualGenieService.isGenerationTerminal;

describe('ai.controller', () => {
  afterEach(() => jest.clearAllMocks());

  describe('createPortfolioGeneration', () => {
    it('forwards only the supported fields and persists ownership record', async () => {
      genieService.startPortfolioGeneration.mockResolvedValue({
        genieGenerationId: 'gen-1',
        status: 'pending',
        prompt: 'Build a portfolio site for Ritik...',
      });
      AiGenerationJob.create.mockResolvedValue({
        genieGenerationId: 'gen-1',
        status: 'pending',
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
            targetAudience: 'recruiters', // not part of the Genie prompt
            primaryGoal: 'get hired', // not part of the Genie prompt
          },
          preferences: { theme: 'dark', style: 'modern', animations: true },
        },
      });
      const res = mockRes();

      await aiController.createPortfolioGeneration(req, res);

      const [payload, options] = genieService.startPortfolioGeneration.mock.calls[0];
      expect(payload.userData).not.toHaveProperty('targetAudience');
      expect(payload.userData).not.toHaveProperty('primaryGoal');
      expect(payload.userData.name).toBe('Ritik');
      expect(options.ownerId).toBe('user-42');

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, jobId: 'gen-1', projectId: 'gen-1' }));
    });

    it('normalizes a GenieServiceError into the DevDrop error shape', async () => {
      genieService.startPortfolioGeneration.mockRejectedValue(
        new GenieServiceError({ status: 422, code: 'GENIE_SERVICE_ERROR', message: 'Invalid request data' })
      );

      const req = mockReq({ userId: 'user-42', body: { userData: {} } });
      const res = mockRes();

      await aiController.createPortfolioGeneration(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, code: 'GENIE_SERVICE_ERROR', message: 'Invalid request data' })
      );
    });

    it('returns 500 without leaking internals on an unexpected error', async () => {
      genieService.startPortfolioGeneration.mockRejectedValue(new Error('ECONNREFUSED 10.0.0.5:3001'));
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
      expect(genieService.getGenerationStatus).not.toHaveBeenCalled();
    });

    it('polls Genie and updates the local record on success', async () => {
      const record = {
        genieGenerationId: 'gen-1',
        userId: 'user-42',
        status: 'pending',
        save: jest.fn().mockResolvedValue(true),
      };
      AiGenerationJob.findOne.mockResolvedValue(record);
      genieService.getGenerationStatus.mockResolvedValue({
        status: 'completed',
        files: [{ path: 'App.tsx', content: '...' }],
        error: null,
        previewUrl: null,
        deploymentStatus: null,
        fileCount: 1,
      });

      const req = mockReq({ userId: 'user-42', params: { jobId: 'gen-1' } });
      const res = mockRes();

      await aiController.getGenerationJobStatus(req, res);

      expect(record.status).toBe('completed');
      expect(record.lastKnownFiles).toEqual([{ path: 'App.tsx', content: '...' }]);
      expect(record.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, status: 'completed' }));
    });
  });

  describe('retryGeneration', () => {
    it('rejects retrying a job that has not failed', async () => {
      AiGenerationJob.findOne.mockResolvedValue({ status: 'processing' });
      const req = mockReq({ userId: 'user-42', params: { jobId: 'gen-1' } });
      const res = mockRes();

      await aiController.retryGeneration(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(genieService.startPortfolioGeneration).not.toHaveBeenCalled();
    });

    it('starts a brand new generation from the stored payload', async () => {
      AiGenerationJob.findOne.mockResolvedValue({
        status: 'failed',
        websiteType: 'portfolio',
        requestPayload: { websiteType: 'portfolio', userData: { name: 'Ritik', role: 'Dev' } },
      });
      genieService.startPortfolioGeneration.mockResolvedValue({ genieGenerationId: 'gen-2', status: 'pending', prompt: '...' });
      AiGenerationJob.create.mockResolvedValue({ genieGenerationId: 'gen-2', status: 'pending' });

      const req = mockReq({ userId: 'user-42', params: { jobId: 'gen-1' } });
      const res = mockRes();

      await aiController.retryGeneration(req, res);

      expect(genieService.startPortfolioGeneration).toHaveBeenCalledWith(
        { websiteType: 'portfolio', userData: { name: 'Ritik', role: 'Dev' } },
        expect.objectContaining({ ownerId: 'user-42' })
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe('modifyGeneration', () => {
    it('rejects an empty message', async () => {
      const req = mockReq({ userId: 'user-42', params: { jobId: 'gen-1' }, body: { message: '  ' } });
      const res = mockRes();

      await aiController.modifyGeneration(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(AiGenerationJob.findOne).not.toHaveBeenCalled();
    });

    it('rejects modifying a job that has not completed yet', async () => {
      AiGenerationJob.findOne.mockResolvedValue({ status: 'processing', lastKnownFiles: null });
      const req = mockReq({ userId: 'user-42', params: { jobId: 'gen-1' }, body: { message: 'dark navbar' } });
      const res = mockRes();

      await aiController.modifyGeneration(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(genieService.sendModification).not.toHaveBeenCalled();
    });

    it('sends the message plus cached files to Genie and flips status to processing', async () => {
      const record = {
        genieGenerationId: 'gen-1',
        status: 'completed',
        lastKnownFiles: [{ path: 'App.tsx', content: '...' }],
        save: jest.fn().mockResolvedValue(true),
      };
      AiGenerationJob.findOne.mockResolvedValue(record);
      genieService.sendModification.mockResolvedValue({ success: true });

      const req = mockReq({ userId: 'user-42', params: { jobId: 'gen-1' }, body: { message: 'Make the navbar dark blue' } });
      const res = mockRes();

      await aiController.modifyGeneration(req, res);

      expect(genieService.sendModification).toHaveBeenCalledWith(
        expect.objectContaining({
          genieGenerationId: 'gen-1',
          message: 'Make the navbar dark blue',
          currentFiles: [{ path: 'App.tsx', content: '...' }],
        }),
        expect.objectContaining({ ownerId: 'user-42' })
      );
      expect(record.status).toBe('processing');
      expect(res.status).toHaveBeenCalledWith(202);
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
