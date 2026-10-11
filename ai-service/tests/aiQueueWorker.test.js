const { DelayedError, UnrecoverableError } = require('bullmq');
const { createAiProcessor } = require('../src/queue/worker');
const { classifyError, FAILURE } = require('../src/queue/errors');

const mkJob = (over = {}) => ({
  data: { jobKey: 'job1' },
  attemptsMade: 0,
  updateProgress: jest.fn().mockResolvedValue(),
  updateData: jest.fn().mockResolvedValue(),
  moveToDelayed: jest.fn().mockResolvedValue(),
  ...over,
});

const mkBackend = (over = {}) => ({
  fetchPayload: jest.fn().mockResolvedValue({ mode: 'generate', payload: { mode: 'generate', messages: [] } }),
  sendEvent: jest.fn().mockResolvedValue({}),
  deliverTerminal: jest.fn().mockResolvedValue({}),
  ...over,
});

const processorWith = (backend, run) => createAiProcessor({ backend, pickRunner: () => run });

describe('ai-queue processor', () => {
  it('runs the orchestrator and delivers the result to the backend', async () => {
    const backend = mkBackend();
    const run = jest.fn(async (_p, { onStage }) => { onStage('design', 'completed', { name: 'design' }); return { files: { a: 1 } }; });
    await processorWith(backend, run)(mkJob(), 'tok');
    expect(backend.deliverTerminal).toHaveBeenCalledWith('completed', 'job1', { result: { files: { a: 1 } }, generationMeta: { agents: [{ name: 'design' }] } });
  });

  it('picks the runner from the payload mode (generate | edit | debug)', async () => {
    const pickRunner = jest.fn(() => async () => ({}));
    const backend = mkBackend({ fetchPayload: jest.fn().mockResolvedValue({ mode: 'debug', payload: { mode: 'debug' } }) });
    await createAiProcessor({ backend, pickRunner })(mkJob(), 't');
    expect(pickRunner).toHaveBeenCalledWith('debug');
  });

  it('skips jobs whose input is gone/cancelled/finished instead of failing or re-running them', async () => {
    const backend = mkBackend({ fetchPayload: jest.fn().mockRejectedValue(Object.assign(new Error('409'), { skipJob: true })) });
    const run = jest.fn();
    expect(await processorWith(backend, run)(mkJob(), 't')).toMatchObject({ skipped: true });
    expect(run).not.toHaveBeenCalled();
  });

  describe('provider quota exhaustion', () => {
    const exhausted = Object.assign(new Error('Gemini pool exhausted'), { code: 'GEMINI_POOL_EXHAUSTED', retryAfterMs: 120000 });

    beforeEach(() => { process.env.AI_QUOTA_MAX_DELAYS = '6'; });
    afterEach(() => { delete process.env.AI_QUOTA_MAX_DELAYS; });

    it('by default does not re-queue (Gemini capacity is already waited out inside the call): fails as capacity_exhausted', async () => {
      delete process.env.AI_QUOTA_MAX_DELAYS;
      const job = mkJob();
      const err = await processorWith(mkBackend(), async () => { throw exhausted; })(job, 't').catch((e) => e);
      expect(err).toBeInstanceOf(UnrecoverableError);
      expect(err.errorType).toBe('capacity_exhausted');
      expect(job.moveToDelayed).not.toHaveBeenCalled();
    });

    it('when AI_QUOTA_MAX_DELAYS > 0, delays the job (no attempt burned, no immediate retry) using the pool cooldown hint', async () => {
      const backend = mkBackend();
      const job = mkJob();
      await expect(processorWith(backend, async () => { throw exhausted; })(job, 'tok')).rejects.toBeInstanceOf(DelayedError);
      const [when, token] = job.moveToDelayed.mock.calls[0];
      expect(token).toBe('tok');
      expect(when - Date.now()).toBeGreaterThan(100000);
      expect(job.updateData).toHaveBeenCalledWith(expect.objectContaining({ quotaDelays: 1 }));
      expect(backend.sendEvent).toHaveBeenCalledWith('delayed', 'job1', expect.objectContaining({ quotaDelays: 1 }));
    });

    it('caps the delay at the configured maximum', async () => {
      process.env.AI_QUOTA_MAX_DELAY_MS = '60000';
      const job = mkJob();
      await expect(processorWith(mkBackend(), async () => { throw Object.assign(new Error('x'), { code: 'GEMINI_POOL_EXHAUSTED', retryAfterMs: 3600000 }); })(job, 't')).rejects.toBeInstanceOf(DelayedError);
      expect(job.moveToDelayed.mock.calls[0][0] - Date.now()).toBeLessThanOrEqual(60500);
      delete process.env.AI_QUOTA_MAX_DELAY_MS;
    });

    it('gives up (unrecoverable) once the delay budget is spent', async () => {
      const job = mkJob({ data: { jobKey: 'job1', quotaDelays: 6 } });
      await expect(processorWith(mkBackend(), async () => { throw exhausted; })(job, 't')).rejects.toBeInstanceOf(UnrecoverableError);
      expect(job.moveToDelayed).not.toHaveBeenCalled();
    });
  });

  it('transient errors are rethrown for bounded BullMQ retry with backoff', async () => {
    const err = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    await expect(processorWith(mkBackend(), async () => { throw err; })(mkJob(), 't')).rejects.toBe(err);
  });

  it('permanent failures are unrecoverable (never retried) and keep the debug context', async () => {
    const err = Object.assign(new Error('Build failed'), { userMessage: 'Your site did not build', debugContext: { files: { a: 1 } } });
    let thrown;
    await processorWith(mkBackend(), async () => { throw err; })(mkJob(), 't').catch((e) => { thrown = e; });
    expect(thrown).toBeInstanceOf(UnrecoverableError);
    expect(thrown.message).toBe('Your site did not build');
    expect(thrown.debugContext).toEqual({ files: { a: 1 } });
  });

  it('a lost result callback is transient (retried) rather than silently dropping the generation', async () => {
    const backend = mkBackend({ deliverTerminal: jest.fn().mockRejectedValue(Object.assign(new Error('down'), { code: 'RESULT_DELIVERY_FAILED' })) });
    await expect(processorWith(backend, async () => ({}))(mkJob(), 't')).rejects.toMatchObject({ code: 'RESULT_DELIVERY_FAILED' });
  });

  it('cooperative cancellation: a cancel reply makes the next stage boundary abort the pipeline', async () => {
    const backend = mkBackend({ sendEvent: jest.fn(async (event) => (event === 'stage' ? { cancelled: true } : {})) });
    const run = async (_p, { onStage }) => {
      onStage('requirements', 'started');
      await new Promise((r) => setImmediate(r));
      onStage('design', 'started'); // throws once cancellation was learned
      return { files: {} };
    };
    const out = await processorWith(backend, run)(mkJob(), 't');
    expect(out).toEqual({ cancelled: true });
    expect(backend.deliverTerminal).not.toHaveBeenCalled();
  });
});

describe('failure classification', () => {
  it('a pool exhausted for a non-temporary reason (invalid credentials) is permanent, not quota', () => {
    expect(classifyError({ code: 'GEMINI_POOL_EXHAUSTED', temporary: false })).toBe(FAILURE.PERMANENT);
    expect(classifyError({ code: 'GEMINI_POOL_EXHAUSTED', temporary: true })).toBe(FAILURE.QUOTA);
  });
  it('maps pool exhaustion, 429 and message hints to quota', () => {
    expect(classifyError({ code: 'GROQ_POOL_EXHAUSTED' })).toBe(FAILURE.QUOTA);
    expect(classifyError({ status: 429 })).toBe(FAILURE.QUOTA);
    expect(classifyError(new Error('Gemini pool exhausted for this request'))).toBe(FAILURE.QUOTA);
  });
  it('maps network/5xx to transient and everything else to permanent', () => {
    expect(classifyError({ code: 'ETIMEDOUT' })).toBe(FAILURE.TRANSIENT);
    expect(classifyError({ status: 502 })).toBe(FAILURE.TRANSIENT);
    expect(classifyError(new Error('validation failed'))).toBe(FAILURE.PERMANENT);
  });
});
