import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AdvancedBuildPanel, { AdvancedUpgradePrompt } from './AdvancedBuildPanel';
import { computeAdvancedPipeline } from './pipelineSteps';
import { quotaModalFromError } from '../billing/billingUtils';

const snap = { phases: [{ id: 'requirements', label: 'Understanding requirements', status: 'done' }, { id: 'pages', label: 'Generating pages', status: 'running' }, { id: 'repair', label: 'Repairing', status: 'skipped' }],
  pages: [{ id: 'home', title: 'Home', path: '/', status: 'done' }, { id: 'about', title: 'About', path: '/about', status: 'generating' }], pagesDone: 1, pagesTotal: 2, files: { planned: 5, written: 2, created: 1 }, currentTask: 'Writing About', validation: {}, repair: {} };

describe('advanced build UI', () => {
  it('derives steps from the real snapshot and hides skipped phases', () => {
    const { steps, percent } = computeAdvancedPipeline(snap, { isGenerating: true });
    expect(steps.map((s) => s.state)).toEqual(['done', 'active']);
    expect(steps[1].detail).toBe('1 of 2 pages');
    expect(percent).toBe(50);
  });
  it('shows planned pages, task and file counts', () => {
    render(<AdvancedBuildPanel snapshot={snap} isGenerating />);
    expect(screen.getAllByText(/About/).length).toBeGreaterThan(0);
    expect(screen.getByText(/2 of 5 files written/)).toBeTruthy();
    expect(screen.getByText('Writing About')).toBeTruthy();
  });
  it('free users see an upgrade prompt', () => {
    render(<AdvancedUpgradePrompt onUpgrade={() => {}} />);
    expect(screen.getByTestId('advanced-upgrade')).toBeTruthy();
  });
  it('maps FEATURE_NOT_IN_PLAN to the upgrade modal', () => {
    expect(quotaModalFromError({ response: { data: { code: 'FEATURE_NOT_IN_PLAN', message: 'x' } } }).variant).toBe('unlock');
  });
});

import { fireEvent } from '@testing-library/react';
import { ADVANCED_LEVELS } from './advancedLevels';
import AdvancedLevelPicker from './AdvancedLevelPicker';

describe('advanced build levels UI', () => {
  it('offers low, moderate and max', () => {
    expect(ADVANCED_LEVELS.map((l) => l.id)).toEqual(['low', 'moderate', 'max']);
  });
  it('shows the level badge on the build panel', () => {
    render(<AdvancedBuildPanel summary={{ level: 'low', pages: [], quality: { passed: true } }} isGenerating={false} />);
    expect(screen.getByTestId('advanced-level-badge').textContent).toMatch(/Low level/);
  });
  it('level picker selects a level and reports it', () => {
    const onChange = vi.fn();
    render(<AdvancedLevelPicker level="moderate" onChange={onChange} />);
    expect(screen.getByTestId('level-moderate').checked).toBe(true);
    fireEvent.click(screen.getByTestId('level-max'));
    expect(onChange).toHaveBeenCalledWith('max');
    fireEvent.click(screen.getByTestId('level-low'));
    expect(onChange).toHaveBeenCalledWith('low');
  });
});
