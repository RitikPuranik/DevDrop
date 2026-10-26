const fs = require('fs');
const path = require('path');
const { UnrecoverableError } = require('bullmq');
const { classifyError, sanitizeError, permanent, FAILURE } = require('../../../src/infrastructure/queue/errors');
const { QUEUE_NAMES, JOB_TYPES, EMAIL_JOB_TYPES, PRIORITY } = require('../../../src/infrastructure/queue/names');
const { getQueueConfig } = require('../../../src/infrastructure/queue/config');
const { maskRedisUrl, requireQueueRedisUrl } = require('../../../src/infrastructure/queue/connection');

describe('queue names', () => {
  it('defines exactly the three queues', () => {
    expect(Object.values(QUEUE_NAMES).sort()).toEqual(['ai-queue', 'deployment-queue', 'events-queue']);
  });
  it('stays in sync with the ai-service copy', () => {
    const aiNames = require('../../../../ai-service/src/queue/names');
    expect(aiNames.QUEUE_NAMES.AI).toBe(QUEUE_NAMES.AI);
    expect(aiNames.JOB_TYPES.AI_GENERATE).toBe(JOB_TYPES.AI_GENERATE);
  });
  it('security emails outrank ordinary emails (lower number = earlier)', () => {
    expect(PRIORITY.SECURITY).toBeLessThan(PRIORITY.TRANSACTIONAL);
    expect(PRIORITY.TRANSACTIONAL).toBeLessThan(PRIORITY.NOTIFICATION);
    expect(EMAIL_JOB_TYPES.has(JOB_TYPES.EMAIL_OUTBID)).toBe(true);
    expect(EMAIL_JOB_TYPES.has(JOB_TYPES.RUN_BACKUP)).toBe(false);
  });
});

describe('config defaults (conservative, env-overridable)', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });
  it('uses AI 1 / deployment 1 / events 2', () => {
    delete process.env.AI_QUEUE_CONCURRENCY; delete process.env.DEPLOYMENT_QUEUE_CONCURRENCY; delete process.env.EVENTS_QUEUE_CONCURRENCY;
    expect(getQueueConfig().concurrency).toEqual({ ai: 1, deployment: 1, events: 2 });
  });
  it('honours overrides and ignores garbage', () => {
    process.env.EVENTS_QUEUE_CONCURRENCY = '5';
    process.env.AI_QUEUE_CONCURRENCY = 'abc';
    const c = getQueueConfig().concurrency;
    expect(c.events).toBe(5);
    expect(c.ai).toBe(1);
  });
});

describe('error classification', () => {
  it('treats pool exhaustion and HTTP 429 as quota (delay, do not blindly retry)', () => {
    expect(classifyError({ code: 'GEMINI_POOL_EXHAUSTED' })).toBe(FAILURE.QUOTA);
    expect(classifyError({ response: { status: 429 } })).toBe(FAILURE.QUOTA);
  });
  it('treats network errors and 5xx as transient', () => {
    expect(classifyError({ code: 'ECONNRESET' })).toBe(FAILURE.TRANSIENT);
    expect(classifyError({ statusCode: 503 })).toBe(FAILURE.TRANSIENT);
  });
  it('treats other 4xx and unknown errors as permanent', () => {
    expect(classifyError({ statusCode: 422 })).toBe(FAILURE.PERMANENT);
    expect(classifyError(new Error('boom'))).toBe(FAILURE.PERMANENT);
  });
  it('permanent() produces a BullMQ UnrecoverableError (never retried)', () => {
    const e = permanent('nope', 'X');
    expect(e).toBeInstanceOf(UnrecoverableError);
    expect(e.code).toBe('X');
  });
  it('sanitizeError strips tokens, keys and redis urls', () => {
    const { message } = sanitizeError(new Error('failed Bearer abc.def.ghi api_key=SECRET123 at rediss://:pw@host.upstash.io:6379'));
    expect(message).not.toMatch(/abc\.def|SECRET123|pw@/);
  });
});

describe('queue connection', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });
  it('requires QUEUE_REDIS_URL and never falls back to CACHE_REDIS_URL', () => {
    delete process.env.QUEUE_REDIS_URL;
    process.env.CACHE_REDIS_URL = 'rediss://cache.example:6379';
    expect(() => requireQueueRedisUrl()).toThrow(/QUEUE_REDIS_URL/);
  });
  it('masks credentials when logging', () => {
    expect(maskRedisUrl('rediss://default:supersecret@eu1-x.upstash.io:6379')).toBe('rediss://eu1-x.upstash.io:6379');
    expect(maskRedisUrl('garbage')).not.toMatch(/garbage/);
  });
});

describe('queue/cache separation (static)', () => {
  const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const read = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => stripComments(fs.readFileSync(path.join(dir, f), 'utf8'))).join('\n');
  const root = path.join(__dirname, '../../../src/infrastructure');
  it('queue modules never touch the cache URL or cache service', () => {
    const src = read(path.join(root, 'queue'));
    expect(src).not.toMatch(/CACHE_REDIS_URL/);
    expect(src).not.toMatch(/\.\.\/cache/);
  });
  it('cache modules never touch the queue URL, BullMQ or queue modules', () => {
    const src = read(path.join(root, 'cache'));
    expect(src).not.toMatch(/QUEUE_REDIS_URL/);
    expect(src).not.toMatch(/bullmq|\.\.\/queue/);
  });
});
