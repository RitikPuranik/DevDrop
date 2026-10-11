const mockEnqueue = jest.fn();
const mockRemove = jest.fn();
jest.mock('../../../src/infrastructure/queue/queueJob.model', () => require('../infrastructure/mockQueueJob'));
jest.mock('../../../src/infrastructure/queue/queues', () => ({
  enqueueJob: (...a) => mockEnqueue(...a),
  removeWaitingJob: (...a) => mockRemove(...a),
  QueueUnavailableError: class extends Error {},
}));
jest.mock('../../../src/services/ai-studio/aiStudioAssetPipeline.service', () => ({
  resolveGenerationAssets: jest.fn(async () => ({ assets: {}, media: [] })),
}));
const mockEmit = jest.fn();
jest.mock('../../../src/shared/realtime/socket', () => ({ emitToJob: (...a) => mockEmit(...a), init: jest.fn() }));

const QueueJob = require('../../../src/infrastructure/queue/queueJob.model');
const controller = require('../../../src/modules/ai-generate/ai-generate.controller');
const webhook = require('../../../src/modules/ai-generate/aiWebhook.controller');
const { mockReq, mockRes } = require('../../helpers/mockQuery');

const seedJob = (over = {}) => QueueJob.__docs.set(over.jobKey || 'job1', { jobKey: 'job1', type: 'AI_GENERATE', userId: 'u1', status: 'queued', mode: 'generate', currentStage: 'queued', stageStatus: 'queued', ...over });
beforeEach(() => { QueueJob.__reset(); jest.clearAllMocks(); mockEnqueue.mockResolvedValue({ accepted: true }); process.env.AI_SERVICE_TOKEN = 'svc-key'; });

describe('POST /api/ai-generate', () => {
  const body = { messages: [{ role: 'user', content: 'make a portfolio' }] };

  it('enqueues on ai-queue with the large payload stored in MongoDB and returns 202 immediately', async () => {
    const res = mockRes();
    await controller.generate(mockReq({ body, userId: 'u1' }), res);
    expect(res.status).toHaveBeenCalledWith(202);
    const arg = mockEnqueue.mock.calls[0][0];
    expect(arg).toMatchObject({ queue: 'ai-queue', type: 'AI_GENERATE', userId: 'u1', mode: 'generate' });
    expect(arg.payload.messages).toEqual(body.messages);
    expect(arg.data).toEqual({ mode: 'generate' }); // Redis only gets the mode (+ jobKey)
    expect(res.json.mock.calls[0][0].data.jobId).toBe(arg.jobKey);
  });

  it('detects edit mode from existing project files', async () => {
    await controller.generate(mockReq({ body: { ...body, fileData: { files: { 'a.js': 'x' } } }, userId: 'u1' }), mockRes());
    expect(mockEnqueue.mock.calls[0][0].mode).toBe('edit');
  });

  it('duplicate submission while a job is in flight returns that job instead of enqueueing again', async () => {
    const first = mockRes();
    await controller.generate(mockReq({ body, userId: 'u1' }), first);
    const hash = mockEnqueue.mock.calls[0][0].refId;
    seedJob({ jobKey: first.json.mock.calls[0][0].data.jobId, refId: hash, status: 'active' });
    mockEnqueue.mockClear();

    const second = mockRes();
    await controller.generate(mockReq({ body, userId: 'u1' }), second);
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(second.json.mock.calls[0][0].data).toMatchObject({ resumed: true, status: 'processing' });
  });

  it('rejects an empty conversation and answers 503 when the queue is down', async () => {
    const bad = mockRes();
    await controller.generate(mockReq({ body: { messages: [] }, userId: 'u1' }), bad);
    expect(bad.status).toHaveBeenCalledWith(400);

    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockEnqueue.mockRejectedValue(Object.assign(new Error('x'), { code: 'QUEUE_UNAVAILABLE' }));
    const down = mockRes();
    await controller.generate(mockReq({ body, userId: 'u1' }), down);
    expect(down.status).toHaveBeenCalledWith(503);
  });
});

describe('GET /jobs/:id (status recovery after refresh)', () => {
  it('only the owner can read a job', async () => {
    seedJob();
    const res = mockRes();
    await controller.getJob(mockReq({ params: { id: 'job1' }, userId: 'someone-else' }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('keeps the public status vocabulary: active -> processing, delayed -> queued', async () => {
    seedJob({ status: 'active' });
    const a = mockRes(); await controller.getJob(mockReq({ params: { id: 'job1' }, userId: 'u1' }), a);
    expect(a.status).toHaveBeenCalledWith(200);
    expect(a.json.mock.calls[0][0].data.status).toBe('processing');
    QueueJob.__docs.get('job1').status = 'delayed';
    const d = mockRes(); await controller.getJob(mockReq({ params: { id: 'job1' }, userId: 'u1' }), d);
    expect(d.json.mock.calls[0][0].data.status).toBe('queued');
  });

  it('returns the result for a completed job and the error for a failed one', async () => {
    seedJob({ status: 'completed', result: { files: {} } });
    const c = mockRes(); await controller.getJob(mockReq({ params: { id: 'job1' }, userId: 'u1' }), c);
    expect(c.json.mock.calls[0][0].data).toMatchObject({ status: 'completed', result: { files: {} } });
    seedJob({ jobKey: 'job2', status: 'failed', error: { message: 'bad build' } });
    const f = mockRes(); await controller.getJob(mockReq({ params: { id: 'job2' }, userId: 'u1' }), f);
    expect(f.json.mock.calls[0][0].data).toMatchObject({ status: 'failed', error: 'bad build' });
  });
});

describe('cancel', () => {
  it('removes a queued job, marks it cancelled and tells the browser', async () => {
    seedJob();
    const res = mockRes();
    await controller.cancel(mockReq({ params: { id: 'job1' }, userId: 'u1' }), res);
    expect(mockRemove).toHaveBeenCalled();
    expect(QueueJob.__docs.get('job1').status).toBe('cancelled');
    expect(mockEmit).toHaveBeenCalledWith('job1', 'ai-job:failed', expect.objectContaining({ jobId: 'job1' }));
  });
  it('409s for finished jobs and 404s for someone else\'s', async () => {
    seedJob({ status: 'completed' });
    const done = mockRes(); await controller.cancel(mockReq({ params: { id: 'job1' }, userId: 'u1' }), done);
    expect(done.status).toHaveBeenCalledWith(409);
    const other = mockRes(); await controller.cancel(mockReq({ params: { id: 'job1' }, userId: 'u2' }), other);
    expect(other.status).toHaveBeenCalledWith(404);
  });
});

describe('ai-service webhook + payload endpoint', () => {
  const hdr = (k = 'svc-key') => ({ header: () => k });
  const post = (body, key) => { const res = mockRes(); return webhook.receive({ ...mockReq({ body }), ...hdr(key) }, res).then(() => res); };

  it('rejects calls without the service key', async () => {
    seedJob();
    expect((await post({ event: 'started', jobId: 'job1' }, 'wrong')).status).toHaveBeenCalledWith(401);
  });

  it('stage events update MongoDB and fan out over Socket.IO', async () => {
    seedJob();
    await post({ event: 'stage', jobId: 'job1', stage: 'design', status: 'completed', details: { name: 'design', ms: 5 } });
    expect(QueueJob.__docs.get('job1')).toMatchObject({ status: 'active', currentStage: 'design' });
    expect(mockEmit).toHaveBeenCalledWith('job1', 'ai-job:stage', expect.objectContaining({ stage: 'design' }));
  });

  it('completed stores the result and emits ai-job:completed; later events are ignored', async () => {
    seedJob({ status: 'active' });
    await post({ event: 'completed', jobId: 'job1', result: { files: { a: 1 } }, generationMeta: { agents: [] } });
    expect(QueueJob.__docs.get('job1')).toMatchObject({ status: 'completed', result: { files: { a: 1 } } });
    expect(mockEmit).toHaveBeenCalledWith('job1', 'ai-job:completed', expect.any(Object));
    mockEmit.mockClear();
    await post({ event: 'stage', jobId: 'job1', stage: 'x', status: 'started' });
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('failed keeps the debug context for debug-retry', async () => {
    seedJob({ status: 'active' });
    await post({ event: 'failed', jobId: 'job1', error: 'build broke', failureClass: 'permanent', debugContext: { files: {} } });
    expect(QueueJob.__docs.get('job1')).toMatchObject({ status: 'failed', debugContext: { files: {} } });
    expect(mockEmit).toHaveBeenCalledWith('job1', 'ai-job:failed', { jobId: 'job1', error: 'build broke' });
  });

  it('a cancelled job tells the worker to stop', async () => {
    seedJob({ status: 'cancelled' });
    const res = await post({ event: 'stage', jobId: 'job1', stage: 's', status: 'started' });
    expect(res.json).toHaveBeenCalledWith({ success: true, cancelled: true });
  });

  it('quota delay marks the job delayed without consuming an attempt', async () => {
    seedJob({ status: 'active' });
    await post({ event: 'delayed', jobId: 'job1', quotaDelays: 2, retryAt: 'soon' });
    expect(QueueJob.__docs.get('job1')).toMatchObject({ status: 'delayed', quotaDelays: 2 });
  });

  it('payload endpoint: service key required, 409 once terminal', async () => {
    seedJob({ payload: { messages: [1] } });
    const denied = mockRes(); await webhook.getPayload({ ...mockReq({ params: { id: 'job1' } }), ...hdr('nope') }, denied);
    expect(denied.status).toHaveBeenCalledWith(401);
    const ok = mockRes(); await webhook.getPayload({ ...mockReq({ params: { id: 'job1' } }), ...hdr() }, ok);
    expect(ok.json.mock.calls[0][0].data.payload).toEqual({ messages: [1] });
    QueueJob.__docs.get('job1').status = 'completed';
    const done = mockRes(); await webhook.getPayload({ ...mockReq({ params: { id: 'job1' } }), ...hdr() }, done);
    expect(done.status).toHaveBeenCalledWith(409);
  });
});
