import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Check, ChevronDown, Loader2 } from 'lucide-react';

/**
 * Sidebar build activity — one slim card. Only the step that is running is
 * expanded; finished steps shrink to a single quiet line, upcoming ones fade.
 * When the build finishes the whole card folds into one "Website ready" row.
 */
export default function BuildStatusCard({ steps, percent, isGenerating, queued, failed, completed }) {
  const [open, setOpen] = useState(false);
  if (!isGenerating && !failed && !completed) return null;

  const total = steps.length;
  const done = steps.filter((s) => s.state === 'done').length;
  const active = steps.find((s) => s.state === 'active');
  const expanded = isGenerating || failed || open;

  const title = isGenerating ? (queued ? 'Getting started' : active?.label || 'Working') : failed ? 'Build failed' : 'Website ready';
  const sub = isGenerating ? `Step ${Math.min(done + 1, total)} of ${total}` : failed ? 'Something went wrong' : `${total} steps completed`;

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--s-line)] bg-white/[0.02]">
      <button
        type="button"
        onClick={() => !isGenerating && !failed && setOpen((v) => !v)}
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
          : completed && !failed && <ChevronDown className={`h-4 w-4 text-[var(--s-faint)] transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>

      {isGenerating && (
        <div className="mx-3.5 h-[2px] overflow-hidden rounded-full bg-white/10">
          <motion.div className="h-full bg-[var(--s-text)]" initial={false} animate={{ width: `${Math.max(percent, 3)}%` }} transition={{ type: 'spring', stiffness: 70, damping: 18 }} />
        </div>
      )}

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.ul
            key="steps"
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden px-3.5"
          >
            <li className="pt-2.5" />
            {steps.map((s) => {
              const isActive = s.state === 'active';
              const isDone = s.state === 'done';
              return (
                <li key={s.id} className="pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                      {isDone ? <Check className="h-3.5 w-3.5 text-[var(--s-ok)]" strokeWidth={3} />
                        : isActive ? <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--s-text)]" />
                        : <span className="h-1.5 w-1.5 rounded-full bg-white/20" />}
                    </span>
                    <span className={`text-[12.5px] transition-colors ${isActive ? 'font-semibold text-[var(--s-text)]' : isDone ? 'text-[var(--s-muted)]' : 'text-[var(--s-faint)]'}`}>{s.label}</span>
                  </div>
                  <AnimatePresence initial={false}>
                    {isActive && (
                      <motion.p
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22 }}
                        className="overflow-hidden pl-[26px] text-[11.5px] leading-5 text-[var(--s-muted)]"
                      >
                        <span className="block pt-1">
                          {s.detail || s.description}
                        </span>
                      </motion.p>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
