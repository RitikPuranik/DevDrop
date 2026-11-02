import React from 'react';
import { ADVANCED_LEVELS } from './advancedLevels';

/** Low / Moderate / Max selector shown on the Review step once "Advanced build" is on. */
export default function AdvancedLevelPicker({ level, onChange, disabled = false }) {
  return (
    <fieldset className="mt-3 rounded-xl border border-[var(--s-raised)] bg-[var(--s-surface)] p-4" disabled={disabled} data-testid="advanced-levels">
      <legend className="px-1 text-xs font-semibold text-[var(--s-accent)]">Build level</legend>
      <div className="mt-1 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Advanced build level">
        {ADVANCED_LEVELS.map((l) => (
          <label key={l.id} className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-left transition-colors ${level === l.id ? 'border-[var(--s-hi)] bg-white/[0.05]' : 'border-[var(--s-line)] hover:border-[var(--s-line-strong)]'}`}>
            <input type="radio" name="advanced-level" value={l.id} checked={level === l.id} onChange={() => onChange(l.id)} className="sr-only" data-testid={`level-${l.id}`} />
            <span className="flex items-center justify-between gap-2 text-sm font-semibold text-[var(--s-text)]">{l.label}<span className="rounded-full border border-[var(--s-line)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--s-muted)]">{l.tagline}</span></span>
            <span className="text-xs leading-4 text-[var(--s-muted)]">{l.blurb}</span>
            <span className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[var(--s-faint)]">{l.checks}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
