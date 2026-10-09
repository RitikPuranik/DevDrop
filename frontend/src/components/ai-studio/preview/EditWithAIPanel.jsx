import React, { useState } from 'react';
import { AlertTriangle, ArrowUp, Check, Loader2, Sparkles } from 'lucide-react';

const STAGE_LABELS = {
  pending: 'Understanding request…',
  processing: 'Updating files…',
};

export default function EditWithAIPanel({ history, isApplying, applyStatus, lastError, onSubmit }) {
  const [value, setValue] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const message = value.trim();
    if (!message || isApplying) return;
    onSubmit(message);
    setValue('');
  };

  return (
    <div className="flex h-full flex-col border-t border-[var(--s-line)] bg-[var(--s-surface)]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--s-line)]">
        <Sparkles size={14} className="text-[var(--s-accent)]" />
        <span className="text-[12px] font-bold uppercase tracking-widest text-[var(--s-muted)]">Edit with AI</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
        {history.length === 0 && !isApplying && (
          <p className="text-[var(--s-faint)] text-[12.5px] leading-relaxed">
            Describe a change and DevDrop will update the actual generated project — e.g. “Make the hero background dark
            green” or “Add a testimonials section below the projects.”
          </p>
        )}
        {history.map((entry, i) => (
          <div key={i} className={entry.role === 'user' ? 'text-right' : 'text-left'}>
            <span
              className={`inline-block max-w-[90%] rounded-xl px-3 py-2 text-[12.5px] leading-relaxed ${
                entry.role === 'user' ? 'bg-[var(--s-text)] text-[#050505]' : 'bg-white/[0.04] text-[var(--s-muted)] border border-[var(--s-line)]'
              }`}
            >
              {entry.message}
            </span>
          </div>
        ))}

        {isApplying && (
          <div className="flex items-center gap-2 text-[var(--s-faint)] text-[12px]">
            <Loader2 size={13} className="animate-spin" />
            {STAGE_LABELS[applyStatus] || 'Working…'}
          </div>
        )}

        {!isApplying && applyStatus === 'completed' && (
          <div className="flex items-center gap-2 text-[var(--s-accent)] text-[12px]">
            <Check size={13} /> Preview updated
          </div>
        )}

        {!isApplying && lastError && (
          <div className="flex items-start gap-2 rounded-lg border border-[#a6603f]/25 bg-[#a6603f]/5 px-3 py-2 text-[#a6603f] text-[12px]">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>{lastError}</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t border-[var(--s-line)]">
        <div className="flex items-end gap-2 rounded-xl border border-[var(--s-line)] bg-[var(--s-surface)] p-2 focus-within:border-[var(--s-line)] transition-colors">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) handleSubmit(e);
            }}
            placeholder="What would you like to change?"
            rows={2}
            disabled={isApplying}
            className="flex-1 resize-none bg-transparent text-[13px] text-[var(--s-text)] placeholder:text-[var(--s-faint)] outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isApplying || !value.trim()}
            className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white text-black disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isApplying ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={14} />}
          </button>
        </div>
      </form>
    </div>
  );
}
