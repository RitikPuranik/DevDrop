import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, Loader2, RefreshCw, RotateCcw, Sparkles } from 'lucide-react';

// Genie (services/genie) reports generation status as a flat
// pending/processing/completed/failed value over its polled REST API —
// it does not expose the old ai-service's granular pipeline stages that
// way. Genie *does* emit richer `generation:progress` Socket.io events,
// but DevDrop's backend does not proxy those yet (see docs/AI_STUDIO.md,
// "Streaming/progress" TODO), so the UI shows an honest generic
// in-progress state rather than a fabricated step checklist.
const IN_PROGRESS_MESSAGES = {
  pending: 'Queued — your generation will start shortly…',
  processing: 'Genie is generating your website…',
};

export default function GenerationProgress({ job, pollError, onRetry, onBackToForm, retrying }) {
  const navigate = useNavigate();

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
        {job.projectId && <p className="text-white/25 text-xs font-mono mb-6">Project ID: {job.projectId}</p>}
        <div className="flex items-center justify-center gap-3">
          <button type="button" onClick={onBackToForm} className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-[13px] font-bold">
            Start another
          </button>
          <button
            type="button"
            onClick={() => navigate(`/ai-studio/preview/${job.jobId}`)}
            className="px-6 py-3 rounded-xl bg-white text-black text-[13px] font-bold"
          >
            Preview
          </button>
        </div>
      </motion.div>
    );
  }

  // In-progress (pending / processing)
  return (
    <div className="rounded-[26px] border border-white/8 bg-[#0b0b0b] p-8 text-center">
      <Loader2 size={20} className="mx-auto mb-4 animate-spin text-[#8b7355]" />
      <p className="text-[14px] font-semibold mb-1">
        {IN_PROGRESS_MESSAGES[job.status] || 'Generating your website…'}
      </p>
      <p className="text-white/30 text-xs">This usually takes a minute or two.</p>
      {job.repairAttempts > 0 && (
        <p className="mt-4 inline-flex items-center gap-1.5 justify-center text-white/30 text-[11px]">
          <RefreshCw size={11} /> Repair attempt {job.repairAttempts}
        </p>
      )}
    </div>
  );
}
