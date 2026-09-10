import React from 'react';
import { Loader2 } from 'lucide-react';
import StepShell from './StepShell';
import { DESIGN_STYLES, DESIGN_THEMES } from '../../config/aiStudio.config';

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 py-2.5 border-b border-white/5 last:border-0">
      <span className="text-white/35 text-xs uppercase tracking-wider shrink-0">{label}</span>
      <span className="text-sm text-right">{value}</span>
    </div>
  );
}

export default function ReviewStep({ details, design, assets, onBack, onEditStep, onGenerate, generating }) {
  const totalAssets = (assets.profileImage ? 1 : 0) + (assets.resume ? 1 : 0) + assets.projectImages.length;
  const styleLabel = DESIGN_STYLES.find((s) => s.id === design.style)?.label;
  const themeLabel = DESIGN_THEMES.find((t) => t.id === design.theme)?.label;

  return (
    <StepShell stepIndex={4} title="Review" subtitle="Take a last look before generation starts.">
      <div className="space-y-4">
        <section className="rounded-[22px] border border-white/8 bg-[#0b0b0b] p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[13px] font-semibold text-[#c9a876]">Website</p>
            <button type="button" onClick={() => onEditStep(0)} className="text-[11px] font-bold text-white/40 hover:text-white underline underline-offset-4">
              Edit
            </button>
          </div>
          <Row label="Type" value="Portfolio" />
        </section>

        <section className="rounded-[22px] border border-white/8 bg-[#0b0b0b] p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[13px] font-semibold text-[#c9a876]">Details</p>
            <button type="button" onClick={() => onEditStep(1)} className="text-[11px] font-bold text-white/40 hover:text-white underline underline-offset-4">
              Edit
            </button>
          </div>
          <Row label="Name" value={details.name} />
          <Row label="Role" value={details.role} />
          <Row label="Goal" value={details.primaryGoal} />
          <Row label="Skills" value={details.skills.join(', ')} />
          <Row label="Projects" value={`${details.projects.length} added`} />
        </section>

        <section className="rounded-[22px] border border-white/8 bg-[#0b0b0b] p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[13px] font-semibold text-[#c9a876]">Design</p>
            <button type="button" onClick={() => onEditStep(3)} className="text-[11px] font-bold text-white/40 hover:text-white underline underline-offset-4">
              Edit
            </button>
          </div>
          <Row label="Style / Theme" value={[styleLabel, themeLabel].filter(Boolean).join(' / ') || 'Not set'} />
          <Row label="Animation" value={design.animations ? 'Subtle' : 'None'} />
        </section>

        <section className="rounded-[22px] border border-white/8 bg-[#0b0b0b] p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[13px] font-semibold text-[#c9a876]">Assets</p>
            <button type="button" onClick={() => onEditStep(2)} className="text-[11px] font-bold text-white/40 hover:text-white underline underline-offset-4">
              Edit
            </button>
          </div>
          <Row label="Uploaded" value={`${totalAssets} asset${totalAssets === 1 ? '' : 's'}`} />
        </section>
      </div>

      <div className="flex gap-3 mt-8">
        <button type="button" onClick={onBack} disabled={generating} className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-[13px] font-bold disabled:opacity-40">
          Back
        </button>
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-8 py-3 rounded-xl bg-white text-black text-[13px] font-bold tracking-wide disabled:opacity-60"
        >
          {generating && <Loader2 size={14} className="animate-spin" />}
          {generating ? 'Starting…' : 'Generate Website'}
        </button>
      </div>
    </StepShell>
  );
}
