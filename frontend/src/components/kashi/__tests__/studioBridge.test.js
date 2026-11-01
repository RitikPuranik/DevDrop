import { describe, expect, test, beforeEach, vi } from 'vitest';
import { mergeKashiDesign } from '../../../config/aiStudio.config';
import { getStudioSnapshot, peekStudioFill, queueStudioFill, setStudioSnapshot, takeStudioFill } from '../studioBridge';

describe('mergeKashiDesign', () => {
  const base = { style: 'modern', theme: 'dark', animations: 'subtle', animationList: ['subtle'], customPrompt: 'keep it clean', primaryColor: '#b8935a', paletteId: 'amber', typography: 'grotesk' };

  test('applies valid ids, keeps the rest, and keeps animations in sync with the list', () => {
    const next = mergeKashiDesign(base, { style: 'luxury', theme: 'warm', paletteId: 'emerald', animationList: ['scroll', 'interactive'], typography: 'serif' });
    expect(next).toMatchObject({ style: 'luxury', theme: 'warm', themeTouched: true, paletteId: 'emerald', paletteTouched: true, typography: 'serif', animations: 'interactive' });
    expect(next.primaryColor).toBe('#22c55e');
    expect(next.animationList).toEqual(['scroll', 'interactive']);
  });

  test('ignores unknown ids and appends (not replaces) design notes', () => {
    const next = mergeKashiDesign(base, { style: 'nope', paletteId: 'nope', primaryColor: 'red', customPrompt: 'more whitespace' });
    expect(next.style).toBe('modern');
    expect(next.paletteId).toBe('amber');
    expect(next.primaryColor).toBe('#b8935a');
    expect(next.customPrompt).toBe('keep it clean\nmore whitespace');
  });
});

describe('studio bridge', () => {
  beforeEach(() => { window.__kashiStudioFill = null; window.__kashiStudioSnapshot = null; vi.useRealTimers(); });

  test('a builder snapshot is restored to the page snapshot when the builder unmounts', () => {
    const stopPage = setStudioSnapshot(() => ({ step: 'types' }));
    const stopBuilder = setStudioSnapshot(() => ({ step: 'details' }));
    expect(getStudioSnapshot()).toEqual({ step: 'details' });
    stopBuilder();
    expect(getStudioSnapshot()).toEqual({ step: 'types' });
    stopPage();
    expect(getStudioSnapshot()).toBeNull();
  });

  test('a fill is only taken by a form that accepts it, and only once', () => {
    queueStudioFill({ websiteType: 'cafe', details: { venueName: 'X' }, design: {} });
    expect(takeStudioFill((f) => f.websiteType === 'hotel')).toBeNull();
    expect(peekStudioFill()).not.toBeNull();
    expect(takeStudioFill((f) => f.websiteType === 'cafe')).toMatchObject({ details: { venueName: 'X' } });
    expect(takeStudioFill()).toBeNull();
  });

  test('a stale fill expires', () => {
    vi.useFakeTimers();
    queueStudioFill({ websiteType: 'cafe', details: {}, design: {} });
    vi.advanceTimersByTime(3 * 60 * 1000);
    expect(takeStudioFill()).toBeNull();
  });
});
