const mockRunDeployment = jest.fn();
const mockRunExport = jest.fn();
const mockRunAiExport = jest.fn();
const mockRunLoop = jest.fn();
const mockDeployment = { findById: jest.fn(), updateOne: jest.fn() };
const mockExport = { findById: jest.fn(), updateOne: jest.fn() };
const mockKashi = { findOneAndUpdate: jest.fn() };
const mockProgress = jest.fn();

jest.mock('../../../backend/src/services/deployment/orchestrator', () => ({ runDeployment: (...a) => mockRunDeployment(...a) }));
jest.mock('../../../backend/src/services/projectExport.service', () => ({ runExport: (...a) => mockRunExport(...a), runAiStudioExport: (...a) => mockRunAiExport(...a) }));
jest.mock('../../../backend/src/modules/kashi/kashiFixer.service', () => ({ runLoop: (...a) => mockRunLoop(...a) }));
jest.mock('../../../backend/src/modules/deployment/deployment.model', () => mockDeployment);
jest.mock('../../../backend/src/modules/github/projectExport.model', () => mockExport);
jest.mock('../../../backend/src/modules/kashi/kashiFixRun.model', () => mockKashi);
jest.mock('../../src/callback', () => ({ sendTaskProgress: (...a) => mockProgress(...a) }));

const { UnrecoverableError } = require('../../../backend/src/infrastructure/queue/errors');
const { processDeploymentJob, onDeploymentFinalFailure } = require('../../src/processors/deployment');

beforeEach(() => jest.clearAllMocks());

describe('RUN_DEPLOYMENT', () => {
  const job = { name: 'RUN_DEPLOYMENT', data: { jobKey: 'k', deploymentId: 'd1' } };

  it('runs the existing resumable orchestrator once and reports the final status', async () => {
    mockDeployment.findById.mockReturnValue({ select: async () => ({ status: 'SUCCESS' }) });
    const out = await processDeploymentJob(job);
    expect(mockRunDeployment).toHaveBeenCalledTimes(1);
    expect(mockRunDeployment).toHaveBeenCalledWith('d1');
    expect(out.result).toMatchObject({ deploymentId: 'd1', status: 'SUCCESS' });
  });

  it('a failed deployment is a permanent job failure: BullMQ must not re-run provider calls', async () => {
    mockDeployment.findById.mockReturnValue({ select: async () => ({ status: 'FAILED', errorMessage: 'Vercel build failed' }) });
    await expect(processDeploymentJob(job)).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('a deployment deleted meanwhile is skipped', async () => {
    mockDeployment.findById.mockReturnValue({ select: async () => null });
    expect((await processDeploymentJob(job)).result.skipped).toBe(true);
  });
});

describe('EXPORT_PROJECT', () => {
  it('routes purchase vs ai-studio exports to the right runner', async () => {
    mockExport.findById.mockReturnValue({ select: async () => ({ status: 'success' }) });
    await processDeploymentJob({ name: 'EXPORT_PROJECT', data: { jobKey: 'k', exportId: 'e1', source: 'purchase' } });
    await processDeploymentJob({ name: 'EXPORT_PROJECT', data: { jobKey: 'k', exportId: 'e2', source: 'ai-studio' } });
    expect(mockRunExport).toHaveBeenCalledWith('e1');
    expect(mockRunAiExport).toHaveBeenCalledWith('e2');
  });

  it('a failed export is permanent (the user retries from the UI)', async () => {
    mockExport.findById.mockReturnValue({ select: async () => ({ status: 'failed' }) });
    await expect(processDeploymentJob({ name: 'EXPORT_PROJECT', data: { jobKey: 'k', exportId: 'e1', source: 'purchase' } })).rejects.toBeInstanceOf(UnrecoverableError);
  });
});

describe('KASHI_FIX', () => {
  it('runs the loop and forwards progress to the backend callback', async () => {
    mockRunLoop.mockImplementation(async (_id, { onProgress }) => { await onProgress({ type: 'step' }); });
    await processDeploymentJob({ name: 'KASHI_FIX', data: { jobKey: 'k', runId: 'r1' } });
    expect(mockRunLoop).toHaveBeenCalledWith('r1', expect.any(Object));
    expect(mockProgress).toHaveBeenCalledWith({ taskId: 'k' }, { type: 'step' });
  });
});

it('unknown job names are permanent failures', async () => {
  await expect(processDeploymentJob({ name: 'NOPE', data: {} })).rejects.toBeInstanceOf(UnrecoverableError);
});

describe('final-failure recovery (crash / stall / timeout)', () => {
  it('only moves a still-running deployment to FAILED; never overwrites a finished one', async () => {
    await onDeploymentFinalFailure({ name: 'RUN_DEPLOYMENT', data: { deploymentId: 'd1' } }, new Error('stalled'));
    const [filter, update] = mockDeployment.updateOne.mock.calls[0];
    expect(filter.status.$nin).toEqual(expect.arrayContaining(['SUCCESS', 'FAILED', 'CANCELLED']));
    expect(update.$set.status).toBe('FAILED');
  });

  it('marks stuck exports failed and notifies the Kashi room', async () => {
    await onDeploymentFinalFailure({ name: 'EXPORT_PROJECT', data: { exportId: 'e1' } }, new Error('x'));
    expect(mockExport.updateOne).toHaveBeenCalled();
    mockKashi.findOneAndUpdate.mockResolvedValue({ _id: 'r1' });
    await onDeploymentFinalFailure({ name: 'KASHI_FIX', data: { runId: 'r1', jobKey: 'k' } }, new Error('x'));
    expect(mockProgress).toHaveBeenCalledWith({ taskId: 'k' }, expect.objectContaining({ type: 'status', status: 'failed' }));
  });
});
