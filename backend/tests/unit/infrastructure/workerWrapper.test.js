let mockProcessorFn;
let mockHandlers;
jest.mock('bullmq', () => ({
  ...jest.requireActual('bullmq'),
  Worker: jest.fn().mockImplementation((name, processor, opts) => {
    mockProcessorFn = processor;
    mockHandlers = {};
    return { on: (ev, fn) => { mockHandlers[ev] = fn; }, close: jest.fn().mockResolvedValue(), opts };
  }),
}));
jest.mock('../../../src/infrastructure/queue/connection', () => ({ createQueueRedisConnection: () => ({}) }));
jest.mock('../../../src/infrastructure/queue/queueJob.model', () => require('./mockQueueJob'));

const { UnrecoverableError } = require('bullmq');
const QueueJob = require('../../../src/infrastructure/queue/queueJob.model');
const { createQueueWorker, gracefulClose, getWorkerStats } = require('../../../src/infrastructure/queue/worker');

const mkJob = (over = {}) => ({ id: 'j1', name: 'T', data: { jobKey: 'k1' }, attemptsMade: 0, opts: { attempts: 3 }, updateProgress: jest.fn().mockResolvedValue(), ...over });
const seed = (status = 'queued') => QueueJob.__docs.set('k1', { jobKey: 'k1', status, queue: 'events-queue' });
beforeEach(() => { QueueJob.__reset(); jest.clearAllMocks(); jest.spyOn(console, 'warn').mockImplementation(() => {}); });

describe('createQueueWorker lifecycle', () => {
  it('runs the processor and records completion', async () => {
    seed();
    createQueueWorker({ queueName: 'events-queue', processor: async () => ({ result: { ok: 1 } }), concurrency: 2 });
    await mockProcessorFn(mkJob());
    expect(QueueJob.__docs.get('k1')).toMatchObject({ status: 'completed', progress: 100, result: { ok: 1 } });
  });

  it('uses the configured concurrency and stalled-job recovery', () => {
    const w = createQueueWorker({ queueName: 'events-queue', processor: async () => ({}), concurrency: 2 });
    expect(w.opts).toMatchObject({ concurrency: 2, maxStalledCount: 1 });
    expect(w.opts.stalledInterval).toBeGreaterThan(0);
  });

  it('is idempotent: a job already terminal (e.g. cancelled, replayed after restart) is skipped, not re-run', async () => {
    seed('cancelled');
    const processor = jest.fn();
    createQueueWorker({ queueName: 'events-queue', processor });
    const out = await mockProcessorFn(mkJob());
    expect(out.skipped).toBe(true);
    expect(processor).not.toHaveBeenCalled();
  });

  it('a late "active" update cannot overwrite a terminal state', async () => {
    seed('completed');
    const jobStore = require('../../../src/infrastructure/queue/jobStore');
    await jobStore.markActive('k1');
    expect(QueueJob.__docs.get('k1').status).toBe('completed');
  });

  it('creates the durable record for scheduler-created (repeatable) jobs', async () => {
    createQueueWorker({ queueName: 'events-queue', processor: async () => ({ result: {} }) });
    await mockProcessorFn(mkJob({ id: 'repeat:abc:1', data: {}, name: 'PROCESS_ENDED_AUCTIONS', repeatJobKey: 'abc' }));
    expect(QueueJob.__docs.get('sched-repeat:abc:1')).toMatchObject({ status: 'completed', type: 'PROCESS_ENDED_AUCTIONS' });
  });

  it('times out hung jobs', async () => {
    seed();
    createQueueWorker({ queueName: 'deployment-queue', processor: () => new Promise(() => {}), timeoutMs: 20 });
    await expect(mockProcessorFn(mkJob())).rejects.toMatchObject({ code: 'JOB_TIMEOUT', failureClass: 'permanent' });
  });
});

describe('failure handling', () => {
  it('transient failure with attempts left -> back to queued, not failed', async () => {
    seed('active');
    createQueueWorker({ queueName: 'events-queue', processor: async () => ({}) });
    await mockHandlers.failed(mkJob({ attemptsMade: 1 }), Object.assign(new Error('503'), { statusCode: 503 }));
    expect(QueueJob.__docs.get('k1').status).toBe('queued');
    expect(getWorkerStats()['events-queue'].retried).toBeGreaterThan(0);
  });

  it('retry exhaustion -> failed, onFinalFailure called once', async () => {
    seed('active');
    const onFinalFailure = jest.fn();
    createQueueWorker({ queueName: 'events-queue', processor: async () => ({}), onFinalFailure });
    await mockHandlers.failed(mkJob({ attemptsMade: 3 }), Object.assign(new Error('503'), { statusCode: 503 }));
    expect(QueueJob.__docs.get('k1').status).toBe('failed');
    expect(onFinalFailure).toHaveBeenCalledTimes(1);
  });

  it('permanent errors are never retried even when attempts remain', async () => {
    seed('active');
    createQueueWorker({ queueName: 'events-queue', processor: async () => ({}) });
    await mockHandlers.failed(mkJob({ attemptsMade: 1 }), new UnrecoverableError('bad input'));
    expect(QueueJob.__docs.get('k1').status).toBe('failed');
  });

  it('stalled-out jobs are marked failed so the record never stays "active" forever', async () => {
    seed('active');
    createQueueWorker({ queueName: 'events-queue', processor: async () => ({}) });
    await mockHandlers.failed(mkJob({ attemptsMade: 1 }), new Error('job stalled more than allowable limit'));
    expect(QueueJob.__docs.get('k1').status).toBe('failed');
  });

  it('stored error text is sanitized', async () => {
    seed('active');
    createQueueWorker({ queueName: 'events-queue', processor: async () => ({}) });
    await mockHandlers.failed(mkJob({ attemptsMade: 3 }), new Error('Authorization: Bearer abc.def.ghi to rediss://:pw@h.upstash.io'));
    expect(JSON.stringify(QueueJob.__docs.get('k1').error)).not.toMatch(/abc\.def|pw@/);
  });
});

describe('graceful shutdown', () => {
  it('closes workers, then runs cleanup callbacks', async () => {
    const order = [];
    const w = { close: jest.fn(async () => order.push('worker')) };
    expect(await gracefulClose([w], { extra: [async () => order.push('cleanup')] })).toBe(true);
    expect(order).toEqual(['worker', 'cleanup']);
  });

  it('force-closes when active jobs do not drain in time (BullMQ recovers them as stalled)', async () => {
    const w = { close: jest.fn((force) => (force ? Promise.resolve() : new Promise(() => {}))) };
    expect(await gracefulClose([w], { timeoutMs: 20 })).toBe(false);
    expect(w.close).toHaveBeenCalledWith(true);
  });
});
