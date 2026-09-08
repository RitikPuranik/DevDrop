import React from 'react';
import StepShell from './StepShell';
import { DESIGN_STYLES, DESIGN_THEMES, ANIMATION_OPTIONS } from '../../config/aiStudio.config';

function OptionGroup({ label, options, value, onChange, getKey = (o) => o.id }) {
  return (
    <div>
      <p className="text-[13px] font-semibold text-[#c9a876] mb-3">{label}</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map((opt) => {
          const selected = getKey(opt) === value;
          return (
            <button
              key={String(getKey(opt))}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(getKey(opt))}
              className={`px-4 py-2.5 rounded-xl border text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8b7355]/60 ${
                selected ? 'border-[#8b7355] bg-[#8b7355]/10 text-white' : 'border-white/10 bg-white/[0.03] text-white/50 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const COLOR_SWATCHES = ['#8b7355', '#cbb392', '#a6603f', '#2c2c2c', '#e7e9ea', '#4a5568'];

export default function DesignPreferencesStep({ design, onChange, onBack, onNext }) {
  return (
    <StepShell stepIndex={3} title="Design preferences" subtitle="Guides the AI's Design Agent — these map directly to supported values.">
      <div className="space-y-8">
        <OptionGroup label="Style" options={DESIGN_STYLES} value={design.style} onChange={(style) => onChange({ ...design, style })} />
        <OptionGroup label="Theme" options={DESIGN_THEMES} value={design.theme} onChange={(theme) => onChange({ ...design, theme })} />
        <OptionGroup
          label="Animation"
          options={ANIMATION_OPTIONS}
          value={design.animations}
          onChange={(animations) => onChange({ ...design, animations })}
        />

        <div>
          <p className="text-[13px] font-semibold text-[#c9a876] mb-3">Primary color (optional)</p>
          <div className="flex flex-wrap gap-2">
            {COLOR_SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Primary color ${color}`}
                aria-pressed={design.primaryColor === color}
                onClick={() => onChange({ ...design, primaryColor: design.primaryColor === color ? null : color })}
                className={`w-8 h-8 rounded-full border-2 transition-transform ${
                  design.primaryColor === color ? 'border-white scale-110' : 'border-white/20'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <p className="text-white/25 text-[11px] mt-2">Used as a hint for the Design Agent; not yet part of the core generation contract.</p>
        </div>
      </div>

      <div className="flex gap-3 mt-8">
        <button type="button" onClick={onBack} className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-[13px] font-bold">
          Back
        </button>
        <button type="button" onClick={onNext} className="flex-1 sm:flex-none px-8 py-3 rounded-xl bg-white text-black text-[13px] font-bold tracking-wide">
          Continue
        </button>
      </div>
    </StepShell>
  );
}
