import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGenerationPolling } from '../useGenerationPolling';
import { aiStudioAPI } from '../../api/ai';

vi.mock('../../api/ai', () => ({
  aiStudioAPI: { getJobStatus: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// Flushes pending microtasks (the mocked API promise resolving) without
// relying on @testing-library's waitFor, which polls via real timers and
// deadlocks once fake timers are active.
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('useGenerationPolling', () => {
  it('polls once immediately and stops when status is completed', async () => {
    aiStudioAPI.getJobStatus.mockResolvedValue({ data: { jobId: 'job-1', status: 'completed', currentStage: 'COMPLETED' } });

    const { result } = renderHook(() => useGenerationPolling('job-1'));
    await flush();

    expect(result.current.job?.status).toBe('completed');
    expect(aiStudioAPI.getJobStatus).toHaveBeenCalledTimes(1);

    // Advance time — should NOT poll again once terminal.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(aiStudioAPI.getJobStatus).toHaveBeenCalledTimes(1);
  });

  it('keeps polling on a fixed interval while status is running', async () => {
    aiStudioAPI.getJobStatus.mockResolvedValue({ data: { jobId: 'job-1', status: 'running', currentStage: 'BUILDING' } });

    const { result } = renderHook(() => useGenerationPolling('job-1'));
    await flush();
    expect(result.current.job?.status).toBe('running');
    expect(aiStudioAPI.getJobStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(aiStudioAPI.getJobStatus).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(aiStudioAPI.getJobStatus).toHaveBeenCalledTimes(3);
  });

  it('stops polling and clears timers on unmount', async () => {
    aiStudioAPI.getJobStatus.mockResolvedValue({ data: { jobId: 'job-1', status: 'running', currentStage: 'BUILDING' } });

    const { result, unmount } = renderHook(() => useGenerationPolling('job-1'));
    await flush();
    expect(result.current.job?.status).toBe('running');

    unmount();
    aiStudioAPI.getJobStatus.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(aiStudioAPI.getJobStatus).not.toHaveBeenCalled();
  });

  it('surfaces a poll error after repeated network failures without crashing', async () => {
    aiStudioAPI.getJobStatus.mockRejectedValue(new Error('Network Error'));

    const { result } = renderHook(() => useGenerationPolling('job-1'));
    await flush();

    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });
    }

    expect(result.current.pollError).toBeTruthy();
  });

  it('does nothing when jobId is null', () => {
    const { result } = renderHook(() => useGenerationPolling(null));
    expect(result.current.job).toBeNull();
    expect(aiStudioAPI.getJobStatus).not.toHaveBeenCalled();
  });
});
