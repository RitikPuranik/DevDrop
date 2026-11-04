import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, RotateCcw, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { deploymentAPI } from '../../../api/deployment';
import { OPERATION_STEPS, TONE_CLASSES, apiErrorMessage, formatAbsolute, isOperationActive, newIdempotencyKey } from './versionUi';

const POLL_MS = 2000;

/**
 * Confirmation + progress dialog for restoring a historical production
 * deployment. Phases: check -> confirm -> progress -> done.
 * The server decides everything (eligibility, target, outcome); this only
 * sends the DevDrop version id and renders what the server reports.
 */
export default function RollbackModal({ deploymentId, version, resumeOperation = null, onClose, onSettled }) {
  const [phase, setPhase] = useState(resumeOperation ? 'progress' : 'check');
  const [check, setCheck] = useState(null);
  const [checkError, setCheckError] = useState(null);
  const [ack, setAck] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [op, setOp] = useState(resumeOperation);
  const keyRef = useRef(newIdempotencyKey()); // one key per dialog: a double click can't create two operations
  const settledRef = useRef(false);

  const runCheck = useCallback(async () => {
    setPhase('check');
    setCheckError(null);
    try {
      const res = await deploymentAPI.rollbackCheck(deploymentId, version.id);
      setCheck(res.data.data);
      setPhase('confirm');
    } catch (err) {
      setCheckError(apiErrorMessage(err, 'Could not verify this deployment with Vercel.'));
      setPhase('check-error');
    }
  }, [deploymentId, version.id]);

  useEffect(() => {
    if (!resumeOperation) runCheck();
  }, [resumeOperation, runCheck]);

  // Poll the operation until the server says it has settled.
  useEffect(() => {
    if (phase !== 'progress' || !op || !isOperationActive(op)) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await deploymentAPI.getRollback(deploymentId, op.id);
        if (!cancelled) setOp(res.data.data);
      } catch {
        // transient: the next tick tries again
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phase, op, deploymentId]);

  useEffect(() => {
    if (!op || isOperationActive(op) || settledRef.current) return;
    settledRef.current = true;
    setPhase('done');
    if (op.status === 'succeeded') toast.success(`Production is now serving ${op.target.label}`);
    else if (op.status === 'failed') toast.error(op.error?.message || 'Rollback failed');
    else toast.warning('Rollback could not be confirmed yet');
    onSettled?.(op);
  }, [op, onSettled]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await deploymentAPI.rollback(deploymentId, version.id, keyRef.current);
      settledRef.current = false;
      setOp(res.data.data);
      setPhase('progress');
    } catch (err) {
      const code = err?.response?.data?.code;
      toast.error(apiErrorMessage(err, 'Could not start the rollback.'));
      if (code === 'OPERATION_IN_PROGRESS' || code === 'DEPLOY_IN_PROGRESS') onSettled?.(null);
      else runCheck();
    } finally {
      setSubmitting(false);
    }
  };

  const retry = async () => {
    if (!op) return;
    try {
      const res = await deploymentAPI.retryRollback(deploymentId, op.id);
      settledRef.current = false;
      setOp(res.data.data);
      setPhase('progress');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not retry.'));
    }
  };

  const busy = phase === 'progress' && isOperationActive(op);

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="rollback-title">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-auto rounded-t-3xl sm:rounded-3xl border border-white/10 bg-[#0c0c0c] p-5 sm:p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/30">Restore deployment</p>
            <h2 id="rollback-title" className="mt-1 text-lg font-medium text-white/90">Roll back to {version.label}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-white/30 hover:text-white p-1"><X size={16} /></button>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[12px] space-y-1.5">
          <Row k="Version" v={`${version.label}${version.environment === 'production' ? ' · production' : ''}`} />
          <Row k="Created" v={formatAbsolute(version.createdAt)} />
          <Row k="Commit" v={version.commitShortSha ? `${version.commitShortSha}${version.commitMessage ? ` — ${version.commitMessage}` : ''}` : '—'} mono />
          <div className="flex gap-3">
            <span className="w-16 shrink-0 text-white/35">URL</span>
            {version.url ? (
              <a href={version.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-white/70 hover:text-white inline-flex items-center gap-1">
                {version.url.replace('https://', '')} <ExternalLink size={10} />
              </a>
            ) : <span className="text-white/60">—</span>}
          </div>
        </div>

        {phase === 'check' && <Centered><Loader2 size={18} className="animate-spin text-white/40" /><span className="text-[12px] text-white/40">Verifying with Vercel…</span></Centered>}

        {phase === 'check-error' && (
          <div className="mt-4 text-center">
            <p className="text-[12px] text-red-300/80">{checkError}</p>
            <button type="button" onClick={runCheck} className="mt-3 px-3 py-1.5 rounded-lg bg-white/5 text-white/60 text-[10px] font-bold uppercase tracking-wider hover:text-white hover:bg-white/10">Try again</button>
          </div>
        )}

        {phase === 'confirm' && check && (
          check.eligible ? (
            <>
              {check.currentProduction && (
                <p className="mt-3 text-[11px] text-white/40">Production currently serves <span className="text-white/70">{check.currentProduction.label}</span>. It will be replaced by {version.label} — no rebuild.</p>
              )}
              {!check.productionStateKnown && <p className="mt-2 text-[11px] text-amber-300/80">Vercel didn&apos;t report which deployment is live, so DevDrop may not be able to confirm the result automatically.</p>}
              <div className={`mt-4 rounded-xl border p-3 ${TONE_CLASSES.busy}`}>
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider"><AlertTriangle size={12} /> Before you continue</p>
                <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-white/60 list-disc pl-4">
                  {check.warnings.map((w) => <li key={w}>{w}</li>)}
                </ul>
              </div>
              <p className="mt-3 text-[11px] text-white/35">{check.previewNote}</p>
              <label className="mt-4 flex items-start gap-2 text-[12px] text-white/70 cursor-pointer">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 accent-[#cbb392]" />
                I understand this changes what visitors see on my live site right now.
              </label>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                {version.url && (
                  <a href={version.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 text-white/60 text-[11px] font-bold uppercase tracking-wider hover:text-white hover:bg-white/10">
                    <ExternalLink size={12} /> Preview deployment
                  </a>
                )}
                <button type="button" onClick={onClose} className="px-3.5 py-2 rounded-xl text-white/45 text-[11px] font-bold uppercase tracking-wider hover:text-white">Cancel</button>
                <button type="button" onClick={submit} disabled={!ack || submitting} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#cbb392] text-black text-[11px] font-black uppercase tracking-wider disabled:opacity-35 hover:bg-[#d8c4a6] transition-colors">
                  {submitting ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Roll back to {version.label}
                </button>
              </div>
            </>
          ) : (
            <div className="mt-4">
              <p className={`rounded-xl border px-3 py-2.5 text-[12px] ${TONE_CLASSES.bad}`}>{check.reason?.message || 'This deployment cannot be restored.'}</p>
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-white/5 text-white/70 text-[11px] font-bold uppercase tracking-wider hover:bg-white/10">Close</button>
              </div>
            </div>
          )
        )}

        {(phase === 'progress' || phase === 'done') && op && (
          <div className="mt-5">
            <Steps op={op} />
            {phase === 'progress' && (
              <p className="mt-3 text-[11px] text-white/40">Production keeps serving the previous version until Vercel confirms the switch. You can close this — DevDrop keeps tracking it.</p>
            )}
            {phase === 'done' && <Outcome op={op} onRetry={retry} onClose={onClose} />}
          </div>
        )}
      </div>
    </div>
  );
}

const Row = ({ k, v, mono }) => (
  <div className="flex gap-3">
    <span className="w-16 shrink-0 text-white/35">{k}</span>
    <span className={`min-w-0 break-words text-white/70 ${mono ? 'font-mono text-[11px]' : ''}`}>{v}</span>
  </div>
);

const Centered = ({ children }) => <div className="mt-6 mb-2 flex items-center justify-center gap-2">{children}</div>;

function Steps({ op }) {
  const reached = op.progress?.reached ?? 1;
  const failed = op.status === 'failed';
  return (
    <div>
      <div className="h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden" role="progressbar" aria-valuenow={op.progress?.percent ?? 0} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full transition-all duration-700 ${failed ? 'bg-red-400/70' : 'bg-[#cbb392]'}`} style={{ width: `${op.progress?.percent ?? 0}%` }} />
      </div>
      <ol className="mt-3 grid grid-cols-4 gap-1 text-[10px] uppercase tracking-wider">
        {OPERATION_STEPS.map((s, i) => (
          <li key={s.key} className={i < reached ? 'text-white/70' : 'text-white/25'}>{s.label}</li>
        ))}
      </ol>
    </div>
  );
}

function Outcome({ op, onRetry, onClose }) {
  const ok = op.status === 'succeeded';
  const Icon = ok ? CheckCircle2 : op.status === 'failed' ? XCircle : AlertTriangle;
  const tone = ok ? TONE_CLASSES.ok : op.status === 'failed' ? TONE_CLASSES.bad : TONE_CLASSES.busy;
  return (
    <div className="mt-4">
      <div className={`rounded-xl border p-3 ${tone}`}>
        <p className="flex items-center gap-2 text-[12px] font-bold"><Icon size={14} />
          {ok ? `Production is now serving ${op.target.label}` : op.status === 'failed' ? 'Rollback failed' : 'Not confirmed yet'}
        </p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-white/60">
          {ok
            ? 'Vercel confirmed the switch. Git history, databases and backend services were not changed.'
            : op.error?.message || 'DevDrop could not confirm the result.'}
        </p>
      </div>
      {ok && op.autoAssignAffected && (
        <p className={`mt-3 rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed ${TONE_CLASSES.busy}`}>
          Vercel has paused automatic production deployments for this project. New pushes won&apos;t go live until you promote a deployment in the Vercel dashboard (&quot;Undo Rollback&quot;) or run <code className="font-mono">vercel promote</code>.
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        {op.retry?.safe && (
          <button type="button" onClick={onRetry} className="px-3.5 py-2 rounded-xl bg-white/5 text-white/70 text-[11px] font-bold uppercase tracking-wider hover:bg-white/10">
            {op.retry.mode === 'verify' ? 'Check again' : 'Try again'}
          </button>
        )}
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-white/10 text-white text-[11px] font-bold uppercase tracking-wider hover:bg-white/15">Done</button>
      </div>
    </div>
  );
}
