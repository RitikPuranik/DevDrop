import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Sparkles, Square } from 'lucide-react';
import { toast } from 'sonner';
import { kashiAPI } from '../../api/kashi';
import { subscribeToKashiRun } from '../../api/socket';

const ACTIVE = ['queued', 'running'];
const SERIF = { fontFamily: "'Cormorant Garamond', 'Playfair Display', Georgia, serif" };
const EASE = [0.22, 1, 0.36, 1];

const dotFor = (kind) =>
  kind === 'success' ? 'bg-[#5eead4] shadow-[0_0_8px_rgba(94,234,212,0.9)]'
    : kind === 'error' ? 'bg-red-300/80'
      : kind === 'fix' ? 'bg-[#ffb457] shadow-[0_0_8px_rgba(255,180,87,0.9)]'
        : 'bg-white/25';

const textFor = (kind) =>
  kind === 'success' ? 'text-[#a7f3e6]'
    : kind === 'error' ? 'text-red-200/80'
      : kind === 'fix' ? 'text-[#ffd9a0]'
        : 'text-white/50';

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
  const socketCleanup = useRef(null);
  const logRef = useRef(null);

  const subscribe = useCallback((runId) => {
    socketCleanup.current?.();
    socketCleanup.current = subscribeToKashiRun(runId, {
      onStep: ({ step }) => {
        setRun((current) => {
          if (!current || current.id !== runId || !step) return current;
          const existing = current.steps || [];
          if (existing.some((item) => String(item.at) === String(step.at) && item.message === step.message)) return current;
          return { ...current, steps: [...existing, step].slice(-120) };
        });
      },
      onStatus: (payload) => {
        setRun((current) => current && current.id === runId ? { ...current, ...payload } : current);
        if (payload.status && !ACTIVE.includes(payload.status)) {
          socketCleanup.current?.();
          socketCleanup.current = null;
          onChanged?.();
        }
      },
    });
  }, [onChanged]);

  // Pick up a run already in progress / most recent when the page opens; after that, Socket.IO owns live updates.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!deploymentId || !canFix) return;
      try {
        const res = await kashiAPI.getLatestRun(deploymentId);
        const latest = res.data?.data?.run;
        if (cancelled || !latest) return;
        setRun(latest);
        if (ACTIVE.includes(latest.status)) subscribe(latest.id);
      } catch { /* no previous run */ }
    })();
    return () => {
      cancelled = true;
      socketCleanup.current?.();
      socketCleanup.current = null;
    };
  }, [deploymentId, canFix, subscribe]);

  // Started from the Kashi chat ("fix this deployment").
  useEffect(() => {
    const handler = (e) => { if (e.detail?.deploymentId === deploymentId) start(true); };
    window.addEventListener('kashi-fix-started', handler);
    return () => window.removeEventListener('kashi-fix-started', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deploymentId]);

  // Keep the newest step in view while Kashi works.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [run?.steps?.length]);

  const start = async (alreadyStarted = false) => {
    try {
      setStarting(true);
      const res = await kashiAPI.startFix(deploymentId); // idempotent: returns the active run if one exists
      const next = res.data?.data?.run;
      setRun(next);
      subscribe(next.id);
      if (!alreadyStarted) toast.success('Kashi is on it');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not start Kashi');
    } finally {
      setStarting(false);
    }
  };

  const stop = async () => {
    try {
      const res = await kashiAPI.cancelRun(run.id);
      const next = res.data?.data?.run;
      if (next) setRun(next);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not stop the run');
    }
  };

  if (!canFix) return null;
  const active = run && ACTIVE.includes(run.status);
  const steps = run?.steps || [];
  const rounds = Math.max(run?.maxRounds || 0, 0);
  const round = Math.max(run?.round || 0, 1);

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: EASE, delay: 0.15 }}
      className="relative mt-16 overflow-hidden rounded-3xl p-px text-left"
    >
      {/* animated gradient border */}
      <motion.span
        className="pointer-events-none absolute left-1/2 top-1/2 h-[220%] w-[220%] -translate-x-1/2 -translate-y-1/2"
        style={{ background: 'conic-gradient(from 0deg, transparent 0%, #ffb457 12%, #ff6a9a 25%, #8b6cff 38%, transparent 55%, transparent 100%)', opacity: active ? 1 : 0.55 }}
        animate={{ rotate: 360 }}
        transition={{ duration: active ? 3.5 : 9, repeat: Infinity, ease: 'linear' }}
      />
      <div className="relative overflow-hidden rounded-[23px] bg-[#0a0a0d] p-7 md:p-9">
      {/* soft gold glow + top hairline */}
      <motion.span
        className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full blur-[80px]"
        style={{ background: 'radial-gradient(circle, rgba(255,120,160,0.30), transparent 70%)' }}
        animate={{ opacity: active ? [0.6, 1, 0.6] : 0.55, scale: active ? [1, 1.15, 1] : 1 }}
        transition={{ duration: 4, repeat: active ? Infinity : 0, ease: 'easeInOut' }}
      />
      <span className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#ffb457]/60 to-transparent" />

      <div className="relative flex items-center gap-2.5 mb-5">
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#ffb457]/40 bg-gradient-to-br from-[#ffb457]/25 to-[#ff6a9a]/20 shadow-[0_0_28px_-2px_rgba(255,130,150,0.7)]">
          <Sparkles size={12} className="text-[#ffe2b0]" strokeWidth={1.75} />
        </span>
        <span
          style={{ ...SERIF, backgroundImage: 'linear-gradient(110deg, #ffb457, #fff 45%, #ff8fb0 75%, #a58bff)', WebkitBackgroundClip: 'text' }}
          className="bg-clip-text text-[26px] italic font-light leading-none text-transparent"
        >
          Kashi
        </span>
      </div>

      <h4 className="relative text-[15px] text-white/85">Works in preview but fails on Vercel?</h4>
      <p className="relative mt-2 max-w-md text-[12.5px] leading-relaxed text-white/35">
        Kashi reads the build error, changes only what it requires, pushes the fix to your repo and redeploys — until the build passes.
      </p>

      {!active && (
        <button
          type="button"
          onClick={() => start()}
          disabled={starting}
          className="relative mt-7 inline-flex items-center gap-2.5 px-6 py-3 rounded-full bg-gradient-to-r from-[#ffd27a] via-[#ffb0a0] to-[#ff8fb0] text-black text-[11px] font-bold uppercase tracking-[0.2em] shadow-[0_0_40px_-6px_rgba(255,140,130,0.85)] hover:brightness-110 transition disabled:opacity-50"
        >
          {starting && <Loader2 size={13} className="animate-spin" />}
          {run ? 'Run again' : 'Let Kashi fix it'}
        </button>
      )}

      <AnimatePresence initial={false}>
        {run && (
          <motion.div
            key="log"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="relative mt-9">
              {/* attempt meter */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  {active && <span className="w-[6px] h-[6px] rounded-full bg-[#ffb457] shadow-[0_0_10px_rgba(255,180,87,1)] animate-pulse" />}
                  <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/35">
                    {active ? `Attempt ${round} of ${rounds || round}` : `Last run · ${String(run.status || '').replace(/_/g, ' ')}`}
                  </span>
                </div>
                {active && (
                  <button
                    type="button"
                    onClick={stop}
                    className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30 hover:text-white/80 transition-colors"
                  >
                    <Square size={9} /> Stop
                  </button>
                )}
              </div>

              {rounds > 1 && (
                <div className="flex gap-1.5 mb-6">
                  {Array.from({ length: rounds }).map((_, i) => (
                    <span
                      key={i}
                      className={`h-[2px] flex-1 rounded-full transition-colors duration-700 ${
                        i < round ? 'bg-gradient-to-r from-[#ffb457] to-[#ff7aa8] shadow-[0_0_8px_rgba(255,140,130,0.8)]' : 'bg-white/[0.1]'
                      }`}
                    />
                  ))}
                </div>
              )}

              {/* step log */}
              <ol
                ref={logRef}
                className="relative max-h-64 overflow-y-auto pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <span className="absolute left-[3px] top-2 bottom-2 w-px bg-white/[0.07]" />
                {steps.map((s, i) => {
                  const last = i === steps.length - 1;
                  const working = active && last && !['success', 'error'].includes(s.kind);
                  return (
                    <motion.li
                      key={`${s.at}-${i}`}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.5, ease: EASE }}
                      className="relative flex items-start gap-5 py-[7px]"
                    >
                      <span className="relative mt-[7px] w-[7px] h-[7px] shrink-0 flex items-center justify-center">
                        <span className={`w-[7px] h-[7px] rounded-full ring-4 ring-[#08090a] ${dotFor(s.kind)} ${working ? 'animate-pulse' : ''}`} />
                      </span>
                      <span className={`text-[12.5px] leading-[20px] ${working ? 'text-white/85' : textFor(s.kind)}`}>
                        {s.message}
                      </span>
                    </motion.li>
                  );
                })}
              </ol>

              {run.status === 'succeeded' && run.needsRedeploy && (
                <p className="mt-6 text-[12px] leading-relaxed text-[#ffd9a0]">
                  The frontend build now passes. Hit Redeploy to finish syncing the backend and environment URLs.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </motion.section>
  );
}