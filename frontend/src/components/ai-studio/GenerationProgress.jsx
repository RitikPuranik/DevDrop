import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, ExternalLink, Loader2, RefreshCw, RotateCcw, Sparkles, X, Maximize2 } from 'lucide-react';
import { aiStudioAPI } from '../../api/ai';
import { toast } from 'sonner';

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
  const [previewUrl, setPreviewUrl] = React.useState(job?.previewUrl || null);
  const [previewStatus, setPreviewStatus] = React.useState(job?.deploymentStatus || null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);

  React.useEffect(() => {
    setPreviewUrl(job?.previewUrl || null);
    setPreviewStatus(job?.deploymentStatus || null);
  }, [job?.previewUrl, job?.deploymentStatus]);

  const startPreview = async () => {
    if (!job?.jobId) return;
    if (previewUrl) {
      setPreviewOpen(true);
      return;
    }

    setPreviewLoading(true);
    setPreviewStatus('deploying');
    try {
      const response = await aiStudioAPI.createPreview(job.jobId);
      const data = response.data || {};

      if (data.previewUrl) {
        setPreviewUrl(data.previewUrl);
        setPreviewStatus('deployed');
        setPreviewOpen(true);
        return;
      }

      // Preview deployment runs asynchronously on the ai-service/Fly.io.
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const statusResponse = await aiStudioAPI.getPreviewStatus(job.jobId);
        const status = statusResponse.data || {};
        setPreviewStatus(status.deploymentStatus);
        if (status.previewUrl) setPreviewUrl(status.previewUrl);

        if (status.ready && status.previewUrl) {
          setPreviewOpen(true);
          return;
        }
        if (status.deploymentStatus === 'failed') {
          throw new Error(status.error || 'Preview deployment failed.');
        }
      }

      throw new Error('Preview is taking longer than expected. Check again in a moment.');
    } catch (error) {
      setPreviewStatus('failed');
      toast.error(error.response?.data?.message || error.message || 'Could not create preview.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const openPreview = () => {
    if (previewUrl) setPreviewOpen(true);
    else startPreview();
  };

  const previewModal = previewOpen && previewUrl ? (
    <div
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm p-3 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Website preview"
    >
      <div className="h-full w-full max-w-[1600px] mx-auto rounded-2xl overflow-hidden border border-white/10 bg-[#111] flex flex-col shadow-2xl">
        <div className="h-12 shrink-0 px-4 flex items-center justify-between border-b border-white/10 bg-[#0b0b0b]">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/60">
            <Sparkles size={14} /> Live website preview
          </div>
          <div className="flex items-center gap-2">
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-white/70 hover:text-white"
            >
              <ExternalLink size={13} /> Open in new tab
            </a>
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white"
              aria-label="Close preview"
            >
              <X size={17} />
            </button>
          </div>
        </div>
        <iframe
          title="Generated website preview"
          src={previewUrl}
          className="w-full flex-1 bg-white"
          sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
        />
      </div>
    </div>
  ) : null;

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
      <>
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
              onClick={openPreview}
              disabled={previewLoading}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-black text-[13px] font-bold disabled:opacity-60"
            >
              {previewLoading ? <Loader2 size={14} className="animate-spin" /> : <Maximize2 size={14} />}
              {previewLoading ? 'Building preview…' : previewUrl ? 'Open Preview' : 'Preview Website'}
            </button>
          </div>
          {previewStatus === 'failed' && <p className="mt-4 text-xs text-[#a6603f]">Preview deployment failed. Try again.</p>}
        </motion.div>
        {previewModal}
      </>
    );
  }

  // In-progress (pending / processing)
  return (
    <div className="rounded-[26px] border border-white/8 bg-[#0b0b0b] p-8 text-center">
      <Loader2 size={20} className="mx-auto mb-4 animate-spin text-[#8b7355]" />
      <p className="text-[14px] font-semibold mb-1">
        {IN_PROGRESS_MESSAGES[job.status] || 'Generating your website…'}
      </p>
      <p className="text-white/30 text-xs">Deep-thinking agents are reviewing the project. This can take several minutes.</p>
      {job.repairAttempts > 0 && (
        <p className="mt-4 inline-flex items-center gap-1.5 justify-center text-white/30 text-[11px]">
          <RefreshCw size={11} /> Repair attempt {job.repairAttempts}
        </p>
      )}
    </div>
  );
}
