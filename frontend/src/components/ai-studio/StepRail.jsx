import React from 'react';

const DEFAULT_LABELS = ['Details', 'Design', 'Review'];

/**
 * Progress indicator: a hairline with three numbered stops, set like a
 * table of contents. Active step is cream, finished steps stay readable,
 * upcoming ones recede. Purely typographic — no pills, no fills.
 */
export default function StepRail({ step, labels = DEFAULT_LABELS, className = '' }) {
  return (
    <ol className={`flex items-stretch ${className}`} aria-label="AI Studio progress">
      {labels.map((label, i) => {
        const active = i === step;
        const done = i < step;
        return (
          <li
            key={label}
            aria-current={active ? 'step' : undefined}
            className={`flex-1 border-t pt-3 ${active ? 'border-[var(--s-text)]' : done ? 'border-[var(--s-hi)]' : 'border-[var(--s-line)]'}`}
          >
            <span className={`s-mono block text-[10.5px] ${active ? 'text-[var(--s-text)]' : done ? 'text-[var(--s-hi)]' : 'text-[var(--s-faint)]'}`}>
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className={`mt-0.5 block text-[13px] ${active ? 'text-[var(--s-text)]' : done ? 'text-[var(--s-muted)]' : 'text-[var(--s-faint)]'}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
