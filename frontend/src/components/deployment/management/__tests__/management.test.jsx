import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { formatDuration, formatRelative, rangeToSince, apiErrorMessage, stateMeta } from '../versionUi';
import DeploymentConsole from '../DeploymentConsole';
import { deploymentAPI } from '../../../../api/deployment';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
vi.mock('../../../../api/deployment', () => ({
  deploymentAPI: { listVersions: vi.fn(), syncVersions: vi.fn(), getVersion: vi.fn(), versionLogs: vi.fn() },
}));

const ok = (data) => ({ data: { data } });
const ver = (n, o = {}) => ({
  id: `v${n}`, label: `v${n}`, versionNumber: n, environment: 'production', state: 'READY', commitShortSha: `abc000${n}`,
  commitMessage: `commit ${n}`, createdAt: '2026-01-01T00:00:00Z', durationMs: 18000, url: `https://d${n}.vercel.app`,
  isCurrentProduction: n === 3, isLatest: n === 3, availability: 'available', ...o,
});
const deployment = { id: 'dep1', status: 'SUCCESS', repository: { url: 'https://github.com/a/b' }, vercel: { url: 'https://site.vercel.app', projectId: 'prj' } };
const renderConsole = (props = {}) => render(<DeploymentConsole deployment={deployment} onRedeploy={vi.fn()} redeploying={false} {...props} />);

describe('versionUi helpers', () => {
  it('formats durations', () => {
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(45000)).toMatch(/45/);
  });
  it('formats relative time', () => {
    const now = Date.parse('2026-01-02T00:00:00Z');
    expect(formatRelative('2026-01-01T00:00:00Z', now)).toMatch(/day|d/i);
  });
  it('rangeToSince returns a past timestamp for presets', () => {
    const now = Date.now();
    const s = rangeToSince('1h', now);
    if (s != null) expect(Number(s)).toBeLessThan(now);
  });
  it('falls back for unknown states and extracts API errors', () => {
    expect(stateMeta('???').label).toBeTruthy();
    expect(apiErrorMessage({ response: { data: { message: 'nope' } } }, 'fb')).toBe('nope');
    expect(apiErrorMessage({}, 'fb')).toBe('fb');
  });
});

describe('DeploymentConsole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deploymentAPI.getVersion.mockResolvedValue(ok({ logs: null }));
    deploymentAPI.versionLogs.mockResolvedValue(ok({ entries: [], total: 0 }));
  });

  it('shows logs for the latest deployment by default', async () => {
    deploymentAPI.listVersions.mockResolvedValue(ok({ versions: [ver(3), ver(2), ver(1)], nextCursor: null, sync: {} }));
    renderConsole();
    await waitFor(() => expect(deploymentAPI.versionLogs).toHaveBeenCalled());
    expect(deploymentAPI.versionLogs.mock.calls[0].slice(0, 2)).toEqual(['dep1', 'v3']);
    expect(screen.getByText(/It.s live/)).toBeTruthy();
  });

  it('switches the logs when another version is selected', async () => {
    deploymentAPI.listVersions.mockResolvedValue(ok({ versions: [ver(3), ver(2)], nextCursor: null, sync: {} }));
    renderConsole();
    await waitFor(() => expect(deploymentAPI.versionLogs).toHaveBeenCalled());
    fireEvent.click(await screen.findByLabelText('Show logs for v2'));
    await waitFor(() => expect(deploymentAPI.versionLogs.mock.calls.some((c) => c[1] === 'v2')).toBe(true));
  });

  it('has no rollback controls', async () => {
    deploymentAPI.listVersions.mockResolvedValue(ok({ versions: [ver(3), ver(2)], nextCursor: null, sync: {} }));
    renderConsole();
    await screen.findByLabelText('Show logs for v2');
    expect(screen.queryByText(/roll ?back/i)).toBeNull();
  });

  it('shows an empty state when there are no deployments', async () => {
    deploymentAPI.listVersions.mockResolvedValue(ok({ versions: [], nextCursor: null, sync: {} }));
    renderConsole();
    expect(await screen.findByText('No deployments to show')).toBeTruthy();
    expect(deploymentAPI.versionLogs).not.toHaveBeenCalled();
  });

  it('offers retry when history fails to load', async () => {
    deploymentAPI.listVersions.mockRejectedValueOnce({ response: { data: { message: 'Vercel down' } } });
    deploymentAPI.listVersions.mockResolvedValueOnce(ok({ versions: [ver(3)], nextCursor: null, sync: {} }));
    renderConsole();
    expect(await screen.findByText('Vercel down')).toBeTruthy();
    fireEvent.click(screen.getByText('Try again'));
    await waitFor(() => expect(deploymentAPI.versionLogs).toHaveBeenCalled());
  });
});
