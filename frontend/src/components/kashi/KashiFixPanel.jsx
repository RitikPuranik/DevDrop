import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, CircleAlert, Loader2, Sparkles, Square, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { kashiAPI } from '../../api/kashi';

const POLL_MS = 3000;
const ACTIVE = ['queued', 'running'];

/**
 * "Works in preview but fails on Vercel?" — lets Kashi read the failed build,
 * make the smallest fix, push it to the repo and redeploy until the build
 * succeeds. Shows the live step log of the run.
 */
export default function KashiFixPanel({ deployment, onChanged }) {
  const deploymentId = deployment?._id || deployment?.id;
  const canFix = Boolean(deployment?.vercel?.projectId && deployment?.repository?.name);
  const [run, setRun] = useState(null);
  const [starting, setStarting] = useState(false);
  const timer = useRef(null);
  const lastStatus = useRef(null);

  const poll = useCallback(async (runId) => {
    try {
      const res = await kashiAPI.getRun(runId);
      const next = res.data?.data?.run;
      setRun(next);
      if (next && ACTIVE.includes(next.status)) {
        timer.current = setTimeout(() => poll(runId), POLL_MS);
      } else if (next && lastStatus.current !== next.status) {
        lastStatus.current = next.status;
        onChanged?.();
      }
    } catch {
      timer.current = setTimeout(() => poll(runId), POLL_MS * 2);
    }
  }, [onChanged]);

  // Pick up a run already in progress / most recent when the page opens.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!deploymentId || !canFix) return;
      try {
        const res = await kashiAPI.getLatestRun(deploymentId);
        const latest = res.data?.data?.run;
        if (cancelled || !latest) return;
        setRun(latest);
        lastStatus.current = latest.status;
        if (ACTIVE.includes(latest.status)) poll(latest.id);
      } catch { /* no previous run */ }
    })();
    return () => { cancelled = true; clearTimeout(timer.current); };
  }, [deploymentId, canFix, poll]);

  // Started from the Kashi chat ("fix this deployment").
  useEffect(() => {
    const handler = (e) => { if (e.detail?.deploymentId === deploymentId) start(true); };
    window.addEventListener('kashi-fix-started', handler);
    return () => window.removeEventListener('kashi-fix-started', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deploymentId]);

  const start = async (alreadyStarted = false) => {
    try {
      setStarting(true);
      clearTimeout(timer.current);
      const res = await kashiAPI.startFix(deploymentId); // idempotent: returns the active run if one exists
      const next = res.data?.data?.run;
      setRun(next);
      lastStatus.current = null;
      if (!alreadyStarted) toast.success('Kashi is on it');
      poll(next.id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not start Kashi');
    } finally {
      setStarting(false);
    }
  };

  const stop = async () => {
    try {
      await kashiAPI.cancelRun(run.id);
      clearTimeout(timer.current);
      poll(run.id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not stop the run');
    }
  };

  if (!canFix) return null;
  const active = run && ACTIVE.includes(run.status);

  return (
    <div className="mt-5 rounded-[22px] border border-[#8b7355]/25 bg-[#8b7355]/[0.06] p-5 text-left">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-[#8b7355]/20 border border-[#8b7355]/30 flex items-center justify-center shrink-0"><Sparkles size={16} className="text-[#cbb392]" /></span>
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-sm">Works in preview but fails on Vercel?</h4>
          <p className="text-white/45 text-xs leading-relaxed mt-1">
            Kashi reads the build error, changes only what the error requires, pushes the fix to your repo and redeploys — repeating until the build passes.
          </p>
        </div>
      </div>

      {!active && (
        <button type="button" onClick={() => start()} disabled={starting} className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#8b7355] text-white text-xs font-black uppercase tracking-[0.16em] hover:bg-[#725e46] transition-colors disabled:opacity-60">
          {starting ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />} {run ? 'Run Kashi again' : 'Let Kashi fix it'}
        </button>
      )}

      {run && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-widest text-white/35 font-bold">
              {active ? `Attempt ${Math.max(run.round, 1)} of ${run.maxRounds}` : 'Last run'}
            </span>
            {active && <button type="button" onClick={stop} className="inline-flex items-center gap-1.5 text-[11px] text-white/45 hover:text-white"><Square size={11} /> Stop</button>}
          </div>
          <ol className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {run.steps.map((s, i) => {
              const last = i === run.steps.length - 1;
              return (
                <li key={`${s.at}-${i}`} className="flex items-start gap-2 text-xs">
                  {s.kind === 'success' ? <Check size={13} className="text-emerald-400 mt-0.5 shrink-0" />
                    : s.kind === 'error' ? <CircleAlert size={13} className="text-red-300 mt-0.5 shrink-0" />
                      : active && last ? <Loader2 size={13} className="animate-spin text-[#cbb392] mt-0.5 shrink-0" />
                        : <span className="w-[13px] h-[13px] flex items-center justify-center mt-0.5 shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-white/25" /></span>}
                  <span className={s.kind === 'error' ? 'text-red-200/80' : s.kind === 'success' ? 'text-emerald-200/90' : s.kind === 'fix' ? 'text-[#e6d5bc]' : 'text-white/55'}>{s.message}</span>
                </li>
              );
            })}
          </ol>
          {run.status === 'succeeded' && run.needsRedeploy && (
            <p className="text-[11px] text-white/45 mt-3">The frontend build now passes. Use Redeploy to finish syncing the backend and environment URLs.</p>
          )}
        </div>
      )}
    </div>
  );
}
