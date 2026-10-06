import React from 'react';
import { Sparkles } from 'lucide-react';

const LABELS = ['Details', 'Design', 'Review'];

/**
 * Compact one-line header used on the full-height Design step so the
 * options panel and preview can reach the bottom of the screen.
 */
export default function StudioTopBar({ title, step }) {
  return (
    <div className="border-b border-white/[0.06] bg-neutral-950/80 px-5 py-3 backdrop-blur-xl md:px-8">
      <div className="mx-auto flex max-w-6xl items-center gap-5">
        <div className="hidden shrink-0 items-center gap-2 text-xs text-white/45 sm:inline-flex">
          <Sparkles size={14} className="text-violet-400" /> {title}
        </div>
        <div className="flex flex-1 gap-2" aria-label="AI Studio progress">
          {LABELS.map((label, i) => (
            <div key={label} className="flex-1">
              <div className={`h-1 rounded-full ${i <= step ? 'bg-violet-500' : 'bg-white/10'}`} />
              <p className={`mt-1 text-[10px] ${i === step ? 'text-white' : 'text-white/30'}`}>{String(i + 2).padStart(2, '0')} {label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
