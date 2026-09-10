import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Check, Loader2, RefreshCw, RotateCcw, Sparkles } from 'lucide-react';

// Mirrors ai-service/orchestrator/state.py::PipelineStage exactly. Order
// here is the pipeline's real execution order — this is not a guess.
const STAGE_ORDER = [
  { id: 'QUEUED', label: 'Queued' },
  { id: 'ANALYZING_REQUIREMENTS', label: 'Understanding your requirements' },
  { id: 'CREATING_DESIGN', label: 'Designing your website' },
  { id: 'CREATING_ARCHITECTURE', label: 'Planning the project' },
  { id: 'GENERATING_CODE', label: 'Writing the code' },
  { id: 'VALIDATING_PROJECT', label: 'Validating the project' },
  { id: 'BUILDING', label: 'Building your website' },
  { id: 'DEBUGGING', label: 'Fixing issues' },
  { id: 'PATCHING', label: 'Applying fixes' },
];

const STAGE_INDEX = Object.fromEntries(STAGE_ORDER.map((s, i) => [s.id, i]));

function StageRow({ stage, state }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span
        className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
          state === 'done' ? 'bg-[#8b7355]' : state === 'current' ? 'bg-white/10 border border-[#8b7355]' : 'bg-white/5 border border-white/10'
        }`}
      >
        {state === 'done' && <Check size={12} className="text-black" />}
        {state === 'current' && <Loader2 size={11} className="animate-spin text-[#8b7355]" />}
      </span>
      <span className={`text-sm ${state === 'pending' ? 'text-white/25' : state === 'current' ? 'text-white' : 'text-white/50'}`}>
        {stage.label}
      </span>
    </li>
  );
}

export default function GenerationProgress({ job, pollError, onRetry, onBackToForm, retrying }) {
  if (pollError && !job) {
    return (
      <div className="rounded-[26px] border border-white/8 bg-[#0b0b0b] p-8 text-center">
        <AlertTriangle className="mx-auto mb-4 text-[#a6603f]" size={28} />
        <p className="text-[15px] font-semibold mb-2">Lost connection</p>
        <p className="text-white/40 text-sm mb-6">{pollError}</p>
        <button type="button" onClick={onBackToForm} className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-[13px] font-bold">
          Back to form
        </button>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="rounded-[26px] border border-white/8 bg-[#0b0b0b] p-8 text-center">
        <Loader2 className="mx-auto mb-4 animate-spin text-white/30" size={24} />
        <p className="text-white/40 text-sm">Starting generation…</p>
      </div>
    );
  }

  if (job.status === 'failed') {
    return (
      <div className="rounded-[26px] border border-[#a6603f]/25 bg-[#a6603f]/5 p-8 text-center">
        <AlertTriangle className="mx-auto mb-4 text-[#a6603f]" size={28} />
        <p className="text-[15px] font-semibold mb-1">Generation failed</p>
        {job.currentStage && <p className="text-white/40 text-xs uppercase tracking-wider mb-3">Stage: {job.currentStage.replace(/_/g, ' ')}</p>}
        <p className="text-white/50 text-sm mb-6 max-w-sm mx-auto">
          {job.failureMessage || 'Something went wrong while generating your website. You can retry or go back and adjust your details.'}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button type="button" onClick={onBackToForm} className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-[13px] font-bold">
            Back to form
          </button>
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-black text-[13px] font-bold disabled:opacity-60"
          >
            {retrying ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (job.status === 'completed') {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-[26px] border border-[#8b7355]/25 bg-[#8b7355]/5 p-8 text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-[#8b7355]/15 border border-[#8b7355]/30 flex items-center justify-center">
          <Sparkles size={20} className="text-[#8b7355]" />
        </div>
        <p className="text-[16px] font-semibold mb-1">Project ready</p>
        <p className="text-white/40 text-sm mb-1">Generated successfully.</p>
        <p className="text-white/25 text-xs font-mono mb-6">Project ID: {job.projectId}</p>
        <div className="flex items-center justify-center gap-3">
          <button type="button" onClick={onBackToForm} className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-[13px] font-bold">
            Start another
          </button>
          <button
            type="button"
            disabled
            title="Preview is coming in a future update"
            className="px-6 py-3 rounded-xl bg-white text-black text-[13px] font-bold opacity-50 cursor-not-allowed"
          >
            Preview (coming soon)
          </button>
        </div>
      </motion.div>
    );
  }

  // In-progress (queued / running)
  const currentIdx = STAGE_INDEX[job.currentStage] ?? 0;

  return (
    <div className="rounded-[26px] border border-white/8 bg-[#0b0b0b] p-6">
      <div className="flex items-center gap-3 mb-6">
        <Loader2 size={16} className="animate-spin text-[#8b7355]" />
        <p className="text-[14px] font-semibold">Generating your website…</p>
      </div>
      <ol>
        {STAGE_ORDER.filter((s) => s.id !== 'QUEUED').map((stage) => {
          const idx = STAGE_INDEX[stage.id];
          const state = idx < currentIdx ? 'done' : idx === currentIdx ? 'current' : 'pending';
          return <StageRow key={stage.id} stage={stage} state={state} />;
        })}
      </ol>
      {job.repairAttempts > 0 && (
        <p className="mt-4 inline-flex items-center gap-1.5 text-white/30 text-[11px]">
          <RefreshCw size={11} /> Repair attempt {job.repairAttempts}
        </p>
      )}
    </div>
  );
}
