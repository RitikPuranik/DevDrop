const { createTaskRunner } = require('../../src/taskRunner');

const tick = () => new Promise((r) => setTimeout(r, 20));

describe('taskRunner', () => {
  let logSpy;
  let errSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { logSpy.mockRestore(); errSpy.mockRestore(); });

  it('reports queued -> running -> completed and returns handler result', async () => {
    const onStatus = jest.fn().mockResolvedValue();
    const runner = createTaskRunner({ handlers: { A: async () => ({ n: 1 }) }, onStatus });
    expect(runner.enqueue({ taskId: 't1', type: 'A' }).accepted).toBe(true);
    await tick();
    expect(onStatus.mock.calls.map((c) => c[1])).toEqual(['queued', 'running', 'completed']);
    expect(onStatus.mock.calls[2][2]).toEqual({ result: { n: 1 } });
  });

  it('a failing task reports failed and does not break later tasks', async () => {
    const onStatus = jest.fn().mockResolvedValue();
    const ok = jest.fn().mockResolvedValue('fine');
    const runner = createTaskRunner({
      handlers: { BAD: async () => { throw new Error('boom'); }, OK: ok },
      concurrency: 1,
      onStatus,
    });
    runner.enqueue({ taskId: 'bad', type: 'BAD' });
    runner.enqueue({ taskId: 'good', type: 'OK' });
    await tick();
    expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'bad' }), 'failed', { error: 'boom' });
    expect(ok).toHaveBeenCalled();
  });

  it('limits concurrency and rejects when the queue is full', async () => {
    let active = 0;
    let peak = 0;
    const release = [];
    const handler = () => new Promise((resolve) => {
      active += 1; peak = Math.max(peak, active);
      release.push(() => { active -= 1; resolve(); });
    });
    const runner = createTaskRunner({ handlers: { S: handler }, concurrency: 2, maxQueue: 1 });
    runner.enqueue({ taskId: '1', type: 'S' });
    runner.enqueue({ taskId: '2', type: 'S' });
    runner.enqueue({ taskId: '3', type: 'S' });
    await tick();
    expect(peak).toBe(2);
    expect(runner.enqueue({ taskId: '4', type: 'S' })).toEqual({ accepted: false, reason: 'queue_full' });
    release.splice(0).forEach((r) => r());
    await tick();
    release.splice(0).forEach((r) => r());
    await tick();
  });

  it('rejects unknown types, ignores duplicate ids, and swallows callback errors', async () => {
    const onStatus = jest.fn().mockRejectedValue(new Error('callback down'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const handler = jest.fn().mockResolvedValue();
    const runner = createTaskRunner({ handlers: { A: handler }, onStatus });
    expect(runner.enqueue({ taskId: 'x', type: 'NOPE' })).toEqual({ accepted: false, reason: 'unknown_type' });
    runner.enqueue({ taskId: 'd', type: 'A' });
    expect(runner.enqueue({ taskId: 'd', type: 'A' }).duplicate).toBe(true);
    await tick();
    expect(handler).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('drain stops accepting work and waits for running tasks', async () => {
    let finish;
    const runner = createTaskRunner({ handlers: { S: () => new Promise((r) => { finish = r; }) } });
    runner.enqueue({ taskId: '1', type: 'S' });
    await tick();
    const drained = runner.drain(1000);
    expect(runner.enqueue({ taskId: '2', type: 'S' })).toEqual({ accepted: false, reason: 'shutting_down' });
    finish();
    await expect(drained).resolves.toBe(true);
  });
});
