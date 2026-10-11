const mockSweep = jest.fn();
const mockGetQueue = jest.fn();
const mockMarkFailed = jest.fn();
const mockFind = jest.fn();
jest.mock('../../../backend/src/infrastructure/queue/queues', () => ({
  sweepPendingPublishes: (...a) => mockSweep(...a),
  getQueue: (...a) => mockGetQueue(...a),
  toBullJobId: (k) => k,
  upsertSchedule: jest.fn(),
}));
jest.mock('../../../backend/src/infrastructure/queue/jobStore', () => ({ markFailed: (...a) => mockMarkFailed(...a) }));
jest.mock('../../../backend/src/infrastructure/queue/queueJob.model', () => ({ find: (...a) => mockFind(...a) }));
jest.mock('../../../backend/src/infrastructure/events/emailProcessor', () => ({ processEmailJob: jest.fn(async () => ({ result: 'email' })) }));
jest.mock('../../src/jobs/auction.cron.service', () => ({ processEndedAuctions: jest.fn(async () => {}) }));
jest.mock('../../src/jobs/aiStudio.cleanup.cron.service', () => ({ runScheduledAiStudioCleanup: jest.fn(async () => {}) }));
jest.mock('../../src/jobs/supabase.cleanup.cron.service', () => ({ runScheduledCleanup: jest.fn(async () => {}) }));
jest.mock('../../src/jobs/backup.cron.service', () => ({ runScheduledBackup: jest.fn(async () => {}), runManualBackup: jest.fn(async () => ({ done: true })) }));

const { UnrecoverableError } = require('../../../backend/src/infrastructure/queue/errors');
const { processEventsJob, reconcileJobs } = require('../../src/processors/events');
const emailProcessor = require('../../../backend/src/infrastructure/events/emailProcessor');
const auctions = require('../../src/jobs/auction.cron.service');
const backups = require('../../src/jobs/backup.cron.service');

const chain = (rows) => ({ limit: async () => rows });
beforeEach(() => jest.clearAllMocks());

describe('events-queue routing', () => {
  it('sends every email job type to the email processor', async () => {
    for (const name of ['EMAIL_WELCOME', 'EMAIL_OUTBID', 'EMAIL_VERIFICATION', 'EMAIL_PASSWORD_RESET', 'EMAIL_PURCHASE_CONFIRMATION']) {
      await processEventsJob({ name, data: {} }, { jobKey: 'k' });
    }
    expect(emailProcessor.processEmailJob).toHaveBeenCalledTimes(5);
  });

  it('runs scheduled maintenance through the existing job functions', async () => {
    await processEventsJob({ name: 'PROCESS_ENDED_AUCTIONS', data: {} }, {});
    expect(auctions.processEndedAuctions).toHaveBeenCalled();
    await processEventsJob({ name: 'RUN_BACKUP', data: {} }, {});
    expect(backups.runScheduledBackup).toHaveBeenCalled();
    await processEventsJob({ name: 'RUN_BACKUP', data: { params: { kind: 'mongo' } } }, {});
    expect(backups.runManualBackup).toHaveBeenCalledWith({ kind: 'mongo' });
  });

  it('OUTBOX_SWEEP republishes stranded jobs and reconciles', async () => {
    mockSweep.mockResolvedValue({ checked: 2, published: 2 });
    mockFind.mockReturnValue(chain([]));
    const out = await processEventsJob({ name: 'OUTBOX_SWEEP', data: {} }, {});
    expect(out.result.published).toEqual({ checked: 2, published: 2 });
  });

  it('unknown types are permanent failures', async () => {
    await expect(processEventsJob({ name: 'NOPE', data: {} }, {})).rejects.toBeInstanceOf(UnrecoverableError);
  });
});

describe('reconcileJobs (jobs whose worker died without reporting)', () => {
  const rec = { jobKey: 'ai1', queue: 'ai-queue' };

  it('fails records whose BullMQ job vanished', async () => {
    mockFind.mockReturnValue(chain([rec]));
    mockGetQueue.mockReturnValue({ getJob: async () => null });
    expect(await reconcileJobs()).toEqual({ checked: 1, fixed: 1 });
    expect(mockMarkFailed).toHaveBeenCalledWith('ai1', expect.objectContaining({ code: 'JOB_LOST' }), expect.any(Object));
  });

  it('mirrors a BullMQ failure into MongoDB', async () => {
    mockFind.mockReturnValue(chain([rec]));
    mockGetQueue.mockReturnValue({ getJob: async () => ({ getState: async () => 'failed', failedReason: 'boom', attemptsMade: 2 }) });
    expect((await reconcileJobs()).fixed).toBe(1);
  });

  it('leaves healthy jobs alone, and decides nothing when Redis is unreachable', async () => {
    mockFind.mockReturnValue(chain([rec]));
    mockGetQueue.mockReturnValue({ getJob: async () => ({ getState: async () => 'active' }) });
    expect((await reconcileJobs()).fixed).toBe(0);
    mockGetQueue.mockReturnValue({ getJob: async () => { throw new Error('redis down'); } });
    expect((await reconcileJobs()).fixed).toBe(0);
    expect(mockMarkFailed).not.toHaveBeenCalled();
  });
});
