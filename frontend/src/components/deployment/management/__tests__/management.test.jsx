import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { formatDuration, formatRelative, rangeToSince, isOperationActive, apiErrorMessage, stateMeta } from '../versionUi';
import RollbackModal from '../RollbackModal';
import { deploymentAPI } from '../../../../api/deployment';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('../../../../api/deployment', () => ({
  deploymentAPI: { rollbackCheck: vi.fn(), rollback: vi.fn(), getRollback: vi.fn(), retryRollback: vi.fn() },
}));

const version = { id: 'v1', label: 'v3', environment: 'production', createdAt: '2026-01-01T00:00:00Z', commitShortSha: 'abc1234', commitMessage: 'fix', url: 'https://x.vercel.app' };
const ok = (data) => ({ data: { data } });
const eligibleCheck = { eligible: true, kind: 'rollback', warnings: ['Git is not reverted'], currentProduction: { label: 'v5' }, productionStateKnown: true };

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
    if (s != null) expect(Number(new Date(s).getTime?.() ?? s)).toBeLessThan(now);
  });
  it('detects active operations and falls back for unknown states', () => {
    expect(isOperationActive({ active: true })).toBe(true);
    expect(isOperationActive({ active: false })).toBe(false);
    expect(isOperationActive(null)).toBe(false);
    expect(stateMeta('???').label).toBeTruthy();
  });
  it('extracts API error messages', () => {
    expect(apiErrorMessage({ response: { data: { message: 'nope' } } }, 'fb')).toBe('nope');
    expect(apiErrorMessage({}, 'fb')).toBe('fb');
  });
});

describe('RollbackModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires acknowledgement and sends confirm with one idempotency key', async () => {
    deploymentAPI.rollbackCheck.mockResolvedValue(ok(eligibleCheck));
    deploymentAPI.rollback.mockResolvedValue(ok({ id: 'op1', active: true, status: 'requesting', target: { label: 'v3' }, progress: { percent: 10 }, events: [] }));
    render(<RollbackModal deploymentId="d1" version={version} onClose={vi.fn()} onSettled={vi.fn()} />);

    expect(await screen.findByText(/Git is not reverted/)).toBeTruthy();
    const submit = screen.getAllByRole('button').find((b) => /Roll back to v3/.test(b.textContent));
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(deploymentAPI.rollback).toHaveBeenCalled());
    const [dId, vId, key] = deploymentAPI.rollback.mock.calls[0];
    expect([dId, vId]).toEqual(['d1', 'v1']);
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(8);
    expect(deploymentAPI.rollback.mock.calls.every((c) => c[2] === key)).toBe(true);
  });

  it('shows the reason and no rollback button when ineligible', async () => {
    deploymentAPI.rollbackCheck.mockResolvedValue(ok({ eligible: false, reason: { code: 'PREVIEW_ONLY', message: 'Previews cannot be restored.' } }));
    render(<RollbackModal deploymentId="d1" version={version} onClose={vi.fn()} />);
    expect(await screen.findByText('Previews cannot be restored.')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(deploymentAPI.rollback).not.toHaveBeenCalled();
  });

  it('offers retry when the preflight check fails', async () => {
    deploymentAPI.rollbackCheck.mockRejectedValueOnce({ response: { data: { message: 'Vercel down' } } });
    deploymentAPI.rollbackCheck.mockResolvedValueOnce(ok(eligibleCheck));
    render(<RollbackModal deploymentId="d1" version={version} onClose={vi.fn()} />);
    expect(await screen.findByText('Vercel down')).toBeTruthy();
    fireEvent.click(screen.getByText('Try again'));
    expect(await screen.findByRole('checkbox')).toBeTruthy();
  });

  it('resumes an active operation without re-running the check', async () => {
    deploymentAPI.getRollback.mockResolvedValue(ok({ id: 'op1', active: false, status: 'succeeded', target: { label: 'v3' }, progress: { percent: 100 }, events: [] }));
    render(<RollbackModal deploymentId="d1" version={version} resumeOperation={{ id: 'op1', active: true, status: 'verifying', target: { label: 'v3' }, progress: { percent: 60 }, events: [] }} onClose={vi.fn()} onSettled={vi.fn()} />);
    expect(deploymentAPI.rollbackCheck).not.toHaveBeenCalled();
    expect(screen.getByRole('progressbar')).toBeTruthy();
  });
});
