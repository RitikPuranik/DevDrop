jest.mock('../../../backend/src/modules/kashi/kashiFixer.service', () => ({
  runLoop: jest.fn(async (_runId, { onProgress }) => {
    await onProgress({ type: 'step', runId: 'run1', step: { message: 'hello' } });
  }),
}));

jest.mock('../../src/callback', () => ({
  sendTaskProgress: jest.fn(async () => {}),
}));

const { handlers, TASK_TYPES } = require('../../src/handlers');
const kashiFixer = require('../../../backend/src/modules/kashi/kashiFixer.service');
const { sendTaskProgress } = require('../../src/callback');

describe('worker handlers', () => {
  it('runs Kashi in the Worker and forwards progress', async () => {
    await expect(handlers[TASK_TYPES.KASHI_FIX]({ runId: 'run1' }, { taskId: 'task1' })).resolves.toEqual({ ok: true, runId: 'run1' });
    expect(kashiFixer.runLoop).toHaveBeenCalledWith('run1', expect.objectContaining({ onProgress: expect.any(Function) }));
    expect(sendTaskProgress).toHaveBeenCalledWith({ taskId: 'task1' }, expect.objectContaining({ type: 'step', runId: 'run1' }));
  });

  it('rejects a Kashi task without a runId', async () => {
    await expect(handlers[TASK_TYPES.KASHI_FIX]({}, { taskId: 'task1' })).rejects.toThrow('KASHI_FIX requires runId');
  });
});
