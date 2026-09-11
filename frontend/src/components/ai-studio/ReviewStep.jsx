import React from 'react';
import { Loader2, Pencil } from 'lucide-react';
import { DESIGN_STYLES, DESIGN_THEMES, ANIMATION_OPTIONS } from '../../config/aiStudio.config';
import StepShell from './StepShell';

function Row({ label, value }) {
  if (!value) return null;
  return <div className="flex justify-between gap-4 border-b border-white/5 py-2.5 last:border-0"><span className="shrink-0 text-xs uppercase tracking-wider text-white/35">{label}</span><span className="text-right text-sm">{value}</span></div>;
}

export default function ReviewStep({ details, design, onBack, onEditStep, onGenerate, generating }) {
  const style = DESIGN_STYLES.find((item) => item.id === design.style)?.label || design.style;
  const theme = DESIGN_THEMES.find((item) => item.id === design.theme)?.label || design.theme;
  const animation = ANIMATION_OPTIONS.find((item) => item.id === design.animations)?.label || design.animations;
  const contentCount = details.projects.length + details.experience.length + details.education.length + details.achievements.length;

  return (
    <StepShell stepIndex={2} title="Review your portfolio" subtitle="Everything here is converted into a detailed generation specification before it reaches the AI builder.">
      <div className="space-y-4">
        <section className="rounded-[22px] border border-white/8 bg-[#0b0b0b] p-5">
          <div className="mb-2 flex items-center justify-between"><p className="text-[13px] font-semibold text-[#c9a876]">Profile</p><button type="button" onClick={() => onEditStep(0)} className="inline-flex items-center gap-1 text-xs text-white/40 hover:text-white"><Pencil size={12} /> Edit</button></div>
          <Row label="Name" value={details.name} /><Row label="Role" value={details.role} /><Row label="Location" value={details.location} /><Row label="Goal" value={details.primaryGoal} /><Row label="Audience" value={details.targetAudience} />
        </section>
        <section className="rounded-[22px] border border-white/8 bg-[#0b0b0b] p-5">
          <div className="mb-2 flex items-center justify-between"><p className="text-[13px] font-semibold text-[#c9a876]">Content</p><button type="button" onClick={() => onEditStep(0)} className="text-xs text-white/40 hover:text-white">Edit</button></div>
          <Row label="Skills" value={details.skills.join(', ')} /><Row label="Projects" value={`${details.projects.length} added`} /><Row label="Experience" value={`${details.experience.length} added`} /><Row label="Education" value={`${details.education.length} added`} /><Row label="Other content" value={`${details.achievements.length + details.interests.length} items`} /><Row label="Resume" value={details.resumeFile ? details.resumeFile.name : 'Not uploaded'} /><Row label="Content blocks" value={`${contentCount} structured entries`} />
        </section>
        <section className="rounded-[22px] border border-white/8 bg-[#0b0b0b] p-5">
          <div className="mb-2 flex items-center justify-between"><p className="text-[13px] font-semibold text-[#c9a876]">Design</p><button type="button" onClick={() => onEditStep(1)} className="text-xs text-white/40 hover:text-white">Edit</button></div>
          <Row label="Style" value={style} /><Row label="Theme" value={theme} /><Row label="Animation" value={animation} /><Row label="Primary color" value={design.primaryColor || 'AI-selected palette'} />
        </section>
      </div>

      <div className="mt-8 flex gap-3">
        <button type="button" onClick={onBack} disabled={generating} className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-[13px] font-bold disabled:opacity-40">Back</button>
        <button type="button" onClick={onGenerate} disabled={generating} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-8 py-3 text-[13px] font-bold tracking-wide text-black disabled:opacity-60 sm:flex-none">
          {generating && <Loader2 size={14} className="animate-spin" />}{generating ? 'Generating…' : 'Generate Portfolio'}
        </button>
      </div>
    </StepShell>
  );
}
