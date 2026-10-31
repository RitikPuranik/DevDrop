import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DesignPreferencesStep from '../DesignPreferencesStep';

vi.mock('../preview/ReferenceDrivenLivePreview', () => ({ default: () => <div data-testid="preview" /> }));

function Harness({ initial, spy }) {
  const [design, setDesign] = React.useState(initial);
  spy.current = design;
  return <DesignPreferencesStep design={design} onChange={setDesign} onBack={() => {}} onNext={() => {}} />;
}
const base = { style: 'modern', theme: 'dark', animations: 'subtle', animationList: ['subtle'], customPrompt: '', paletteId: 'amber', typography: 'grotesk' };

describe('DesignPreferencesStep', () => {
  it('lets several animation options be selected at once and mirrors the strongest into design.animations', () => {
    const spy = { current: null };
    render(<Harness initial={base} spy={spy} />);
    const group = screen.getByRole('group', { name: /animation/i });
    const box = (name) => [...group.querySelectorAll('[role="checkbox"]')].find((b) => b.textContent.includes(name));
    fireEvent.click(box('Scroll Reveal')); fireEvent.click(box('Kinetic Type'));
    expect(spy.current.animationList).toEqual(['subtle', 'scroll', 'kinetic']); expect(spy.current.animations).toBe('kinetic');
    expect(box('Scroll Reveal').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(box('None')); expect(spy.current.animationList).toEqual(['none']);
  });
  it('has the custom text box in the design section and stores what is typed', () => {
    const spy = { current: null };
    render(<Harness initial={base} spy={spy} />);
    const area = screen.getByPlaceholderText(/reference look/i);
    fireEvent.change(area, { target: { value: 'Quiet hero, no gradients' } });
    expect(spy.current.customPrompt).toBe('Quiet hero, no gradients');
    fireEvent.click(screen.getByRole('button', { name: /more whitespace/i }));
    expect(spy.current.customPrompt).toMatch(/Quiet hero, no gradients\nUse generous whitespace/);
  });
});
