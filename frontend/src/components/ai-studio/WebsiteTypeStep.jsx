import React from 'react';
import StepShell from './StepShell';
import { WEBSITE_TYPES } from '../../config/aiStudio.config';

export default function WebsiteTypeStep({ value, onChange, onNext }) {
  return (
    <StepShell stepIndex={0} title="Choose your website type" subtitle="Select a website type to initialize your AI blueprints.">
      <div
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5"
        role="radiogroup"
        aria-label="Website type"
      >
        {WEBSITE_TYPES.map((type) => {
          const Icon = type.icon;
          const ArtIcon = type.artIcon || type.icon;
          const selected = value === type.id;

          return (
            <button
              key={type.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!type.enabled}
              onClick={() => type.enabled && onChange(type.id)}
              className={`group relative min-h-[126px] overflow-hidden rounded-[15px] border px-3 py-3 text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${
                selected
                  ? 'border-violet-400/80 bg-[linear-gradient(145deg,rgba(44,32,62,.58),rgba(15,15,20,.94))] shadow-[0_0_24px_rgba(139,92,246,.13)]'
                  : 'border-white/[0.09] bg-[linear-gradient(145deg,rgba(255,255,255,.045),rgba(10,10,13,.92))] hover:border-white/20 hover:bg-white/[0.055]'
              } ${!type.enabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <div className="relative z-10 flex h-7 w-7 items-center justify-center rounded-[8px] border border-white/[0.10] bg-black/10 text-white/60">
                <Icon size={15} strokeWidth={1.35} />
              </div>

              <div className="relative z-10 mt-4 max-w-[78%]">
                <p className="text-[13px] font-medium tracking-[-0.01em] text-white/90">{type.title}</p>
                <p className="mt-1 text-[10px] leading-[1.45] text-white/38">{type.description}</p>
                {!type.enabled && <p className="mt-2 text-[9px] uppercase tracking-[0.16em] text-white/25">Coming soon</p>}
              </div>

              <div className={`pointer-events-none absolute -right-1 -bottom-2 text-white/[0.20] transition-all duration-200 group-hover:text-white/[0.28] ${selected ? 'text-violet-200/[0.38]' : ''}`}>
                <ArtIcon size={58} strokeWidth={1.05} />
              </div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={!value}
        className="mt-7 w-full sm:w-auto rounded-xl bg-white px-7 py-2.5 text-[12px] font-semibold tracking-wide text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-35"
      >
        Continue
      </button>
    </StepShell>
  );
}
