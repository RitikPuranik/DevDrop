import React from 'react';
import StepShell from './StepShell';
import { WEBSITE_TYPES } from '../../config/aiStudio.config';

export default function WebsiteTypeStep({ value, onChange, onNext }) {
  return (
    <StepShell stepIndex={0} title="Choose your website type" subtitle="Pick what you're building — more types are on the way.">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" role="radiogroup" aria-label="Website type">
        {WEBSITE_TYPES.map((type) => {
          const Icon = type.icon;
          const selected = value === type.id;
          return (
            <button
              key={type.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!type.enabled}
              onClick={() => type.enabled && onChange(type.id)}
              className={`text-left rounded-[22px] border p-5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8b7355]/60 ${
                selected
                  ? 'border-[#8b7355] bg-[#8b7355]/10'
                  : 'border-white/8 bg-[#0b0b0b] hover:border-white/20'
              } ${!type.enabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                <Icon size={18} className="text-[#8b7355]" />
              </div>
              <p className="text-[15px] font-semibold mb-1">{type.title}</p>
              <p className="text-white/35 text-xs leading-relaxed">{type.description}</p>
              {!type.enabled && <p className="text-white/25 text-[11px] mt-2 uppercase tracking-wider">Coming soon</p>}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={!value}
        className="mt-8 w-full sm:w-auto px-8 py-3 rounded-xl bg-white text-black text-[13px] font-bold tracking-wide disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Continue
      </button>
    </StepShell>
  );
}
