const mockAdd = jest.fn();
const mockGetJob = jest.fn();
jest.mock('bullmq', () => ({
  ...jest.requireActual('bullmq'),
  Queue: jest.fn().mockImplementation(() => ({ add: (...a) => mockAdd(...a), getJob: (...a) => mockGetJob(...a), close: jest.fn(), upsertJobScheduler: jest.fn() })),
}));
jest.mock('../../../src/infrastructure/queue/connection', () => ({ createQueueRedisConnection: () => ({ quit: jest.fn(), disconnect: jest.fn(), on: jest.fn() }) }));
jest.mock('../../../src/infrastructure/queue/queueJob.model', () => require('./mockQueueJob'));

const QueueJob = require('../../../src/infrastructure/queue/queueJob.model');
const { enqueueJob, sweepPendingPublishes, QueueUnavailableError, toBullJobId, removeWaitingJob } = require('../../../src/infrastructure/queue/queues');

const base = { queue: 'events-queue', type: 'EMAIL_WELCOME', jobKey: 'email-welcome-u1', data: { userId: 'u1' } };

beforeEach(() => { QueueJob.__reset(); jest.clearAllMocks(); mockAdd.mockResolvedValue({}); });

describe('enqueueJob', () => {
  it('stores the durable record first, then publishes with a BullMQ-safe job id and only references in Redis', async () => {
    const res = await enqueueJob({ ...base, jobKey: 'ai:1234', payload: { huge: 'x' } });
    expect(res).toMatchObject({ accepted: true, duplicate: false });
    const [, data, opts] = mockAdd.mock.calls[0];
    expect(opts.jobId).not.toMatch(/:/);
    expect(JSON.stringify(data)).not.toContain('huge'); // large payload stays in MongoDB
    expect(QueueJob.__docs.get('ai:1234').payload).toEqual({ huge: 'x' });
  });

  it('duplicate submissions enqueue nothing (idempotent jobKey)', async () => {
    await enqueueJob(base);
    const again = await enqueueJob(base);
    expect(again.duplicate).toBe(true);
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });

  it('a finished job is not re-sent unless rerun is requested', async () => {
    await enqueueJob(base);
    QueueJob.__docs.get(base.jobKey).status = 'completed';
    expect((await enqueueJob(base)).duplicate).toBe(true);
    expect((await enqueueJob({ ...base, rerun: true })).duplicate).toBe(false);
  });

  it('non-durable: Redis failure marks the record failed and throws QueueUnavailableError (never claims "scheduled")', async () => {
    mockAdd.mockRejectedValue(new Error('ECONNREFUSED'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(enqueueJob({ ...base, jobKey: 'sec-1' })).rejects.toBeInstanceOf(QueueUnavailableError);
    expect(QueueJob.__docs.get('sec-1').status).toBe('failed');
  });

  it('durable (outbox): Redis failure keeps the intent pending and does not throw', async () => {
    mockAdd.mockRejectedValue(new Error('ECONNREFUSED'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await enqueueJob({ ...base, durable: true });
    expect(res).toMatchObject({ accepted: false, pending: true });
    const rec = QueueJob.__docs.get(base.jobKey);
    expect(rec.publishPending).toBe(true);
    expect(rec.status).toBe('queued');
  });

  it('durable success clears the pending flag', async () => {
    await enqueueJob({ ...base, durable: true });
    expect(QueueJob.__docs.get(base.jobKey).publishPending).toBe(false);
  });
});

describe('outbox sweeper', () => {
  it('republishes pending intents and marks them published; a second sweep does nothing', async () => {
    mockAdd.mockRejectedValueOnce(new Error('down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await enqueueJob({ ...base, durable: true });
    mockAdd.mockClear();

    expect(await sweepPendingPublishes({ olderThanMs: 0 })).toEqual({ checked: 1, published: 1 });
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(QueueJob.__docs.get(base.jobKey).publishPending).toBe(false);
    expect(await sweepPendingPublishes({ olderThanMs: 0 })).toEqual({ checked: 0, published: 0 });
  });

  it('keeps the intent when Redis is still down', async () => {
    mockAdd.mockRejectedValue(new Error('down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await enqueueJob({ ...base, durable: true });
    expect((await sweepPendingPublishes({ olderThanMs: 0 })).published).toBe(0);
    expect(QueueJob.__docs.get(base.jobKey).publishPending).toBe(true);
    expect(QueueJob.__docs.get(base.jobKey).publishAttempts).toBe(1);
  });
});

describe('helpers', () => {
  it('toBullJobId removes colons and avoids purely numeric ids', () => {
    expect(toBullJobId('a:b/c')).toBe('a-b-c');
    expect(toBullJobId('12345')).toBe('j-12345');
  });
  it('removeWaitingJob only removes jobs that have not started', async () => {
    const remove = jest.fn();
    mockGetJob.mockResolvedValueOnce({ getState: async () => 'active', remove });
    expect(await removeWaitingJob('ai-queue', 'k')).toBe(false);
    mockGetJob.mockResolvedValueOnce({ getState: async () => 'delayed', remove });
    expect(await removeWaitingJob('ai-queue', 'k')).toBe(true);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
