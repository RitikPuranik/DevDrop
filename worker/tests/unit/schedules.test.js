const mockUpsert = jest.fn().mockResolvedValue({});
jest.mock('../../../backend/src/infrastructure/queue', () => ({
  upsertSchedule: (...a) => mockUpsert(...a),
  QUEUE_NAMES: { EVENTS: 'events-queue' },
  JOB_TYPES: { PROCESS_ENDED_AUCTIONS: 'PROCESS_ENDED_AUCTIONS', SUPABASE_CLEANUP: 'SUPABASE_CLEANUP', AI_STUDIO_CLEANUP: 'AI_STUDIO_CLEANUP', RUN_BACKUP: 'RUN_BACKUP', OUTBOX_SWEEP: 'OUTBOX_SWEEP' },
}));
const { buildSchedules, registerSchedules } = require('../../src/schedules');

const saved = { ...process.env };
const find = (id) => buildSchedules().find((s) => s.id === id).repeat;
beforeEach(() => {
  process.env = { ...saved };
  ['BACKUP_INTERVAL_HOURS', 'BACKUP_CRON_SCHEDULE', 'SUPABASE_CLEANUP_CRON', 'AI_STUDIO_CLEANUP_CRON', 'CRON_TIMEZONE'].forEach((k) => delete process.env[k]);
  jest.clearAllMocks();
});
afterAll(() => { process.env = saved; });

describe('preserved schedules', () => {
  it('auction check: every 60 seconds', () => expect(find('schedule:ended-auctions')).toEqual({ every: 60000 }));
  it('cleanups keep their cron defaults and the configured time zone', () => {
    expect(find('schedule:supabase-cleanup')).toEqual({ pattern: '0 3 * * 0', tz: 'UTC' });
    expect(find('schedule:ai-studio-cleanup')).toEqual({ pattern: '*/5 * * * *', tz: 'UTC' });
    process.env.CRON_TIMEZONE = 'Asia/Kolkata';
    process.env.AI_STUDIO_CLEANUP_CRON = '*/10 * * * *';
    expect(find('schedule:ai-studio-cleanup')).toEqual({ pattern: '*/10 * * * *', tz: 'Asia/Kolkata' });
  });
});

describe('backup schedule (same precedence as before)', () => {
  it('defaults to 24h', () => expect(find('schedule:backup')).toEqual({ every: 86400000 }));
  it('BACKUP_INTERVAL_HOURS (fractional ok)', () => {
    process.env.BACKUP_INTERVAL_HOURS = '0.5';
    expect(find('schedule:backup')).toEqual({ every: 1800000 });
  });
  it('caps at the 32-bit timer limit', () => {
    process.env.BACKUP_INTERVAL_HOURS = '100000000';
    expect(find('schedule:backup').every).toBe(2147483647);
  });
  it('falls back to the cron pattern, interval hours wins when both set, garbage is ignored', () => {
    process.env.BACKUP_CRON_SCHEDULE = '0 2 * * *';
    expect(find('schedule:backup')).toEqual({ pattern: '0 2 * * *', tz: 'UTC' });
    process.env.BACKUP_INTERVAL_HOURS = '6';
    expect(find('schedule:backup')).toEqual({ every: 21600000 });
    process.env.BACKUP_INTERVAL_HOURS = 'abc';
    expect(find('schedule:backup')).toEqual({ pattern: '0 2 * * *', tz: 'UTC' });
  });
});

describe('registration', () => {
  it('upserts each schedule by a stable id (restart-safe, no duplicates) on events-queue', async () => {
    const ids = await registerSchedules();
    expect(ids).toEqual(expect.arrayContaining(['schedule:ended-auctions', 'schedule:backup', 'schedule:outbox-sweep']));
    expect(mockUpsert).toHaveBeenCalledTimes(ids.length);
    expect(mockUpsert.mock.calls.every(([queue]) => queue === 'events-queue')).toBe(true);
    mockUpsert.mockClear();
    await registerSchedules();
    expect(mockUpsert.mock.calls.map((c) => c[1]).sort()).toEqual([...ids].sort());
  });
  it('one failed registration does not block the others', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockUpsert.mockRejectedValueOnce(new Error('redis'));
    const ids = await registerSchedules();
    expect(mockUpsert).toHaveBeenCalledTimes(ids.length);
  });
});

describe('Redis-command saving switches', () => {
  it('AUCTION_SWEEP_INTERVAL_MS overrides the 60s auction check; garbage falls back to 60s', () => {
    process.env.AUCTION_SWEEP_INTERVAL_MS = '300000';
    expect(find('schedule:ended-auctions')).toEqual({ every: 300000 });
    process.env.AUCTION_SWEEP_INTERVAL_MS = 'abc';
    expect(find('schedule:ended-auctions')).toEqual({ every: 60000 });
  });
  it('QUEUE_SCHEDULES_ENABLED=false registers nothing; default registers all', async () => {
    process.env.QUEUE_SCHEDULES_ENABLED = 'false';
    expect(await registerSchedules()).toEqual([]);
    expect(mockUpsert).not.toHaveBeenCalled();
    delete process.env.QUEUE_SCHEDULES_ENABLED;
    expect((await registerSchedules()).length).toBe(5);
  });
});
