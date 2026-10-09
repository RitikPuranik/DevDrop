import React from 'react';
import { motion } from 'framer-motion';

const STEP_LABELS = ['Type', 'Details', 'Assets', 'Design', 'Review'];

/** Shared header + progress pills for AI Studio steps (aria-current on the active step). */
export default function StepShell({ stepIndex, title, subtitle, children }) {
  return (
    <motion.div key={title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
      <ol className="mb-10 flex flex-wrap items-center justify-center gap-2" aria-label="AI Studio progress">
        {STEP_LABELS.map((label, i) => {
          const done = i < stepIndex; const active = i === stepIndex;
          return (
            <li key={label} aria-current={active ? 'step' : undefined}
              className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors ${active ? 'border-transparent bg-[var(--s-text)] text-[#050505]' : done ? 'border-white/15 bg-white/5 text-[var(--s-text)]' : 'border-white/8 text-[var(--s-faint)]'}`}>
              <span className="tabular-nums">{done ? '✓' : String(i + 1).padStart(2, '0')}</span>
              <span className="hidden sm:inline">{label}</span>
            </li>
          );
        })}
      </ol>
      <h2 className="s-display mb-2 text-center text-3xl md:text-4xl">{title}</h2>
      {subtitle && <p className="mx-auto mb-10 max-w-xl text-center text-[14.5px] leading-7 text-[var(--s-muted)]">{subtitle}</p>}
      {children}
    </motion.div>
  );
}
