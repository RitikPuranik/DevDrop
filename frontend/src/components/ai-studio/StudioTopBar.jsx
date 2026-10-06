import React from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';

const LABELS = ['Details', 'Design', 'Review'];

/**
 * Compact one-line header used on the full-height Design step so the
 * options panel and preview can reach the bottom of the screen.
 */
export default function StudioTopBar({ onBack, disabled, title, step }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <button type="button" onClick={onBack} disabled={disabled} className="inline-flex shrink-0 items-center gap-2 text-sm text-white/50 hover:text-white disabled:opacity-40">
        <ArrowLeft size={16} /> Website types
      </button>
      <div className="flex flex-1 gap-2" aria-label="Progress">
        {LABELS.map((label, i) => (
          <div key={label} className="flex-1">
            <div className={`h-1 rounded-full ${i <= step ? 'bg-violet-500' : 'bg-white/10'}`} />
            <p className={`mt-1 text-[10px] ${i === step ? 'text-white' : 'text-white/30'}`}>{label}</p>
          </div>
        ))}
      </div>
      <div className="hidden shrink-0 items-center gap-2 text-xs text-white/35 sm:inline-flex">
        <Sparkles size={14} className="text-violet-400" /> {title}
      </div>
    </div>
  );
}
