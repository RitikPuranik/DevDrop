import React, { useEffect, useState } from 'react';
import { ExternalLink, GitCommit, RotateCcw, X } from 'lucide-react';
import { deploymentAPI } from '../../../api/deployment';
import LogsViewer from './LogsViewer';
import { VersionBadges } from './DeploymentHistory';
import { apiErrorMessage, formatAbsolute, formatDuration } from './versionUi';

/** Details + logs for one version, in a right-hand drawer (full-screen on phones). */
export default function VersionDrawer({ deploymentId, version, onClose, onRollback }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    deploymentAPI
      .getVersion(deploymentId, version.id)
      .then((res) => !cancelled && setDetail(res.data.data))
      .catch((err) => !cancelled && setError(apiErrorMessage(err, 'Could not load version details.')));
    return () => { cancelled = true; };
  }, [deploymentId, version.id]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const v = detail || version;
  return (
    <div className="fixed inset-0 z-[90] flex justify-end" role="dialog" aria-modal="true" aria-label={`Deployment ${version.label}`}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative w-full sm:max-w-xl h-full overflow-auto border-l border-white/10 bg-[#0c0c0c] p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-medium text-white/90">{v.label}</h2>
              <VersionBadges v={v} />
            </div>
            <p className="mt-1 text-[11px] text-white/30 font-mono truncate">{v.vercelDeploymentId}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close details" className="text-white/30 hover:text-white p-1"><X size={18} /></button>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-[12px]">
          <Item k="Environment" v={v.environment === 'production' ? 'Production' : 'Preview'} />
          <Item k="Status" v={v.state} />
          <Item k="Created" v={formatAbsolute(v.createdAt)} />
          <Item k="Build time" v={formatDuration(v.durationMs) || '—'} />
          <Item k="Branch" v={v.commitRef || '—'} />
          <Item k="Source" v={v.origin === 'devdrop' ? 'Deployed from DevDrop' : 'Created on Vercel'} />
          <div className="col-span-2">
            <dt className="text-white/30 text-[10px] uppercase tracking-wider">Commit</dt>
            <dd className="mt-0.5 flex items-start gap-1.5 text-white/70"><GitCommit size={13} className="mt-0.5 shrink-0 text-white/30" />
              <span className="break-words"><span className="font-mono">{v.commitShortSha || '—'}</span>{v.commitMessage ? ` — ${v.commitMessage}` : ''}</span></dd>
          </div>
          {v.errorMessage && (
            <div className="col-span-2"><dt className="text-white/30 text-[10px] uppercase tracking-wider">Error</dt><dd className="mt-0.5 text-red-300/80 break-words">{v.errorMessage}</dd></div>
          )}
        </dl>

        <div className="mt-5 flex flex-wrap gap-2">
          {v.url && (
            <a href={v.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 text-white/70 text-[11px] font-bold uppercase tracking-wider hover:text-white hover:bg-white/10">
              <ExternalLink size={12} /> Preview deployment
            </a>
          )}
          {v.rollback?.eligible ? (
            <button type="button" onClick={() => onRollback(v)} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#cbb392] text-black text-[11px] font-black uppercase tracking-wider hover:bg-[#d8c4a6]">
              <RotateCcw size={12} /> Roll back to {v.label}
            </button>
          ) : (
            v.rollback?.reason && <p className="text-[11px] text-white/35 self-center">{v.rollback.reason.message}</p>
          )}
        </div>
        {v.url && <p className="mt-2 text-[10px] text-white/25">If Vercel Deployment Protection is on, you may need to sign in to Vercel to open a non-production URL.</p>}

        <h3 className="mt-8 mb-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/30">Logs</h3>
        {error ? <p className="text-[12px] text-red-300/80">{error}</p> : (
          <LogsViewer deploymentId={deploymentId} version={version} availability={detail?.logs} />
        )}
      </aside>
    </div>
  );
}

const Item = ({ k, v }) => (
  <div><dt className="text-white/30 text-[10px] uppercase tracking-wider">{k}</dt><dd className="mt-0.5 text-white/70">{v}</dd></div>
);
