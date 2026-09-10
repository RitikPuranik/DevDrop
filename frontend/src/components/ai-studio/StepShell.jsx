import React from 'react';
import { motion } from 'framer-motion';

const STEP_LABELS = ['Website Type', 'Details', 'Assets', 'Design', 'Review'];

/**
 * Shared header + progress indicator for every AI Studio step. Progress
 * dots double as an accessible step list (Section 28: proper labels,
 * aria-current) — not just decorative.
 */
export default function StepShell({ stepIndex, title, subtitle, children }) {
  return (
    <motion.div
      key={title}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
    >
      <ol className="flex items-center gap-2 mb-8" aria-label="AI Studio progress">
        {STEP_LABELS.map((label, i) => (
          <li key={label} className="flex items-center gap-2 flex-1 last:flex-none">
            <span
              aria-current={i === stepIndex ? 'step' : undefined}
              className={`h-1.5 rounded-full flex-1 transition-colors ${
                i <= stepIndex ? 'bg-[#8b7355]' : 'bg-white/10'
              }`}
              title={label}
            />
          </li>
        ))}
      </ol>

      <h2 className="text-[20px] font-bold tracking-tight mb-1">{title}</h2>
      {subtitle && <p className="text-white/35 text-sm mb-8 max-w-md">{subtitle}</p>}

      {children}
    </motion.div>
  );
}
