jest.mock('axios');
const axios = require('axios');
const registry = require('../../../src/services/taskRegistry.service');
const { dispatchTask } = require('../../../src/services/worker.client');
const { verifySignature } = require('../../../src/shared/utils/internalSignature');

describe('worker.client dispatchTask', () => {
  beforeEach(() => {
    process.env.WORKER_URL = 'http://worker.test/';
    process.env.INTERNAL_WEBHOOK_SECRET = 'secret-1';
    registry.clear();
  });

  it('POSTs a signed body to the worker and registers the task as queued', async () => {
    axios.post.mockResolvedValue({ status: 202 });
    const { taskId } = await dispatchTask('RUN_BACKUP', { a: 1 });

    const [url, body, opts] = axios.post.mock.calls[0];
    expect(url).toBe('http://worker.test/internal/webhooks/tasks');
    expect(JSON.parse(body)).toEqual({ taskId, type: 'RUN_BACKUP', payload: { a: 1 } });
    expect(verifySignature('secret-1', opts.headers, body)).toBe(true);
    expect(registry.get(taskId).status).toBe('queued');
  });

  it('marks the task failed and throws when the worker is unreachable', async () => {
    axios.post.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(dispatchTask('RUN_BACKUP')).rejects.toThrow('Worker dispatch failed');
  });

  it('throws when not configured', async () => {
    delete process.env.WORKER_URL;
    await expect(dispatchTask('X')).rejects.toThrow('WORKER_URL');
  });
});
