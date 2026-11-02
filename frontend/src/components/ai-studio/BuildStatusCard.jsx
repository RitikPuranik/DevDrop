import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';

/**
 * Sidebar build activity — one slim card. Only the step that is running is
 * expanded; finished steps shrink to a single quiet line, upcoming ones fade.
 * When the build finishes the whole card folds into one "Website ready" row.
 */
export default function BuildStatusCard({ steps, percent, isGenerating, queued, failed, completed }) {
  if (!isGenerating && !failed && !completed) return null;

  const active = steps.find((s) => s.state === 'active');

  const title = isGenerating ? (queued ? 'Getting started' : active?.label || 'Working') : failed ? 'Build failed' : 'Website ready';
  const sub = isGenerating ? (active?.detail || 'Working on your website') : failed ? 'Something went wrong' : 'Your preview is ready';

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--s-line)] bg-white/[0.02]">
      <button
        type="button" disabled
        className={`flex w-full items-center gap-3 px-3.5 py-3 text-left ${isGenerating || failed ? 'cursor-default' : ''}`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06]">
          {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--s-text)]" />
            : failed ? <AlertTriangle className="h-3.5 w-3.5 text-[var(--s-err)]" />
            : <Check className="h-3.5 w-3.5 text-[var(--s-ok)]" strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-[var(--s-text)]">{title}</span>
          <span className="block text-[11px] text-[var(--s-faint)]">{sub}</span>
        </span>
        {isGenerating
          ? <span className="text-[11.5px] tabular-nums text-[var(--s-muted)]">{percent}%</span>
          : null}
      </button>

      {isGenerating && (
        <div className="mx-3.5 h-[2px] overflow-hidden rounded-full bg-white/10">
          <motion.div className="h-full bg-[var(--s-text)]" initial={false} animate={{ width: `${Math.max(percent, 3)}%` }} transition={{ type: 'spring', stiffness: 70, damping: 18 }} />
        </div>
      )}

    </div>
  );
}
