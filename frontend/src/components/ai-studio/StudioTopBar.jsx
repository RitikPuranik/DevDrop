import React from 'react';

const LABELS = ['Details', 'Design', 'Review'];

/** Compact one-line header used on the full-height Design step. */
export default function StudioTopBar({ title, step }) {
  return (
    <div className="studio border-b border-[var(--s-line)] px-5 py-3 md:px-8">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6">
        <div className="s-display hidden text-[17px] sm:block">{title}</div>
        <ol className="flex w-full items-center justify-center gap-1.5 sm:w-auto sm:gap-2" aria-label="AI Studio progress">
          {LABELS.map((label, i) => (
            <li key={label} aria-current={i === step ? 'step' : undefined}
              className={`flex-1 whitespace-nowrap rounded-full border px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-[0.08em] sm:flex-none sm:px-3.5 sm:text-[11px] sm:tracking-[0.14em] ${i === step ? 'border-transparent bg-[var(--s-text)] text-[#050505]' : i < step ? 'border-white/15 bg-white/5 text-[var(--s-text)]' : 'border-white/8 text-[var(--s-faint)]'}`}>
              {String(i + 1).padStart(2, '0')} {label}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
