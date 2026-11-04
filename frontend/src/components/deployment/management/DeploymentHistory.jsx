import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ExternalLink, GitCommit, History, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { deploymentAPI } from '../../../api/deployment';
import RollbackModal from './RollbackModal';
import VersionDrawer from './VersionDrawer';
import { TONE_CLASSES, apiErrorMessage, formatAbsolute, formatDuration, formatRelative, isOperationActive, stateMeta } from './versionUi';

const Pill = ({ tone, children, title }) => (
  <span title={title} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider ${TONE_CLASSES[tone]}`}>{children}</span>
);

/** Version / role / status badges, shared with the drawer. */
export function VersionBadges({ v }) {
  const s = stateMeta(v.state);
  return (
    <>
      {v.isCurrentProduction && <Pill tone="accent" title="Currently serving production traffic"><span className="h-1.5 w-1.5 rounded-full bg-[#cbb392]" /> Live</Pill>}
      <Pill tone={v.environment === 'production' ? 'info' : 'muted'}>{v.environment === 'production' ? 'Production' : 'Preview'}</Pill>
      <Pill tone={s.tone}>{['BUILDING', 'QUEUED', 'INITIALIZING'].includes(v.state) && <Loader2 size={9} className="animate-spin" />}{s.label}</Pill>
      {v.isLatest && <Pill tone="muted" title="Most recent deployment">Latest</Pill>}
      {v.isLatestSuccessful && !v.isLatest && <Pill tone="muted" title="Most recent successful deployment">Latest ready</Pill>}
      {v.availability === 'unavailable' && <Pill tone="bad">Unavailable</Pill>}
    </>
  );
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'production', label: 'Production' },
  { id: 'preview', label: 'Preview' },
];

/**
 * Deployment history for one site: timeline of Vercel deployments with
 * persistent version numbers, the live production deployment, details/logs
 * and one-click rollback. All truth (eligibility, outcome) comes from the server.
 */
export default function DeploymentHistory({ deploymentId }) {
  const [data, setData] = useState(null);
  const [versions, setVersions] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [drawer, setDrawer] = useState(null);
  const [rollback, setRollback] = useState(null); // { version, resume }
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await deploymentAPI.listVersions(deploymentId, { limit: 20, ...(filter !== 'all' ? { environment: filter } : {}) });
      if (!mounted.current) return;
      const d = res.data.data;
      setData(d);
      setVersions(d.versions || []);
      setCursor(d.nextCursor || null);
    } catch (err) {
      if (mounted.current) setError(apiErrorMessage(err, 'Could not load deployment history.'));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [deploymentId, filter]);

  useEffect(() => { load(); }, [load]);

  // An operation already running (started earlier / in another tab): resume tracking it.
  useEffect(() => {
    const op = data?.activeOperation;
    if (op && isOperationActive(op) && !rollback) {
      const target = (data.versions || []).find((v) => v.id === op.target.versionId);
      if (target) setRollback({ version: target, resume: op });
    }
  }, [data, rollback]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await deploymentAPI.syncVersions(deploymentId);
      const d = res.data.data;
      setData(d);
      setVersions(filter === 'all' ? d.versions : d.versions.filter((v) => v.environment === filter));
      setCursor(d.nextCursor || null);
      toast.success('History refreshed from Vercel');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not refresh from Vercel.'));
    } finally {
      setRefreshing(false);
    }
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await deploymentAPI.listVersions(deploymentId, { limit: 20, cursor, ...(filter !== 'all' ? { environment: filter } : {}) });
      setVersions((prev) => [...prev, ...res.data.data.versions]);
      setCursor(res.data.data.nextCursor || null);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not load more.'));
    } finally {
      setLoadingMore(false);
    }
  };

  if (data && data.supported === false) return null; // not a Vercel site: nothing to manage here

  const live = versions.find((v) => v.isCurrentProduction);

  return (
    <section className="mt-6 rounded-2xl border border-white/[0.10] bg-[#101010] p-5 sm:p-7" aria-label="Deployment history">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-medium text-white/90"><History size={15} className="text-white/40" /> Deployment history</h2>
          <p className="mt-1 text-[11px] text-white/35">Every Vercel deployment of this site, with its DevDrop version number.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-0.5" role="group" aria-label="Filter deployments">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
                className={`px-2.5 py-1 rounded-[10px] text-[10px] font-bold uppercase tracking-wider transition-colors ${filter === f.id ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}>{f.label}</button>
            ))}
          </div>
          <button type="button" onClick={refresh} disabled={refreshing || loading} aria-label="Refresh history from Vercel"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-white/60 text-[10px] font-bold uppercase tracking-wider hover:text-white hover:bg-white/10 disabled:opacity-40">
            <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {data?.autoAssign?.paused && (
        <Banner tone="busy" icon={AlertTriangle}>
          Automatic production deployments are paused (Vercel does this after a rollback). New pushes won&apos;t go live until you promote a deployment in the Vercel dashboard (&quot;Undo Rollback&quot;) or run <code className="font-mono">vercel promote</code>.
        </Banner>
      )}
      {data?.deployInProgress && <Banner tone="info" icon={Loader2}>A deployment is running. Rollbacks are disabled until it finishes.</Banner>}
      {data?.sync?.error && <Banner tone="busy" icon={AlertTriangle}>Couldn&apos;t refresh from Vercel just now — showing the last known history.</Banner>}
      {data?.sync?.historyTruncated && <p className="mt-3 text-[10px] text-white/30">Only the most recent deployments were imported from Vercel.</p>}

      <div className="mt-5">
        {loading ? (
          <div className="space-y-3" aria-label="Loading deployment history">
            {[0, 1, 2].map((i) => <div key={i} className="h-[88px] rounded-xl bg-white/[0.04] animate-pulse" />)}
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-[12px] text-red-300/80">{error}</p>
            <button type="button" onClick={() => load()} className="mt-3 px-3 py-1.5 rounded-lg bg-white/5 text-white/60 text-[10px] font-bold uppercase tracking-wider hover:text-white hover:bg-white/10">Try again</button>
          </div>
        ) : versions.length === 0 ? (
          <div className="text-center py-10">
            <History size={22} className="mx-auto text-white/20" />
            <p className="mt-3 text-[13px] text-white/60">No deployments to show yet</p>
            <p className="mt-1 text-[11px] text-white/30">{filter === 'all' ? 'Once this site is deployed on Vercel, each deployment appears here.' : 'Nothing matches this filter.'}</p>
          </div>
        ) : (
          <ol className="relative space-y-3 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-white/10">
            {versions.map((v) => (
              <li key={v.id} className="relative pl-8">
                <span className={`absolute left-[5px] top-5 h-3.5 w-3.5 rounded-full border-2 ${v.isCurrentProduction ? 'border-[#cbb392] bg-[#cbb392]' : v.state === 'ERROR' ? 'border-red-400/60 bg-[#101010]' : 'border-white/25 bg-[#101010]'}`} />
                <div className={`rounded-xl border p-3.5 transition-colors ${v.isCurrentProduction ? 'border-[#cbb392]/30 bg-[#cbb392]/[0.04]' : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold text-white/90 tabular-nums">{v.label}</span>
                    <VersionBadges v={v} />
                  </div>
                  <p className="mt-2 flex items-start gap-1.5 text-[12px] text-white/55 min-w-0">
                    <GitCommit size={12} className="mt-0.5 shrink-0 text-white/25" />
                    <span className="truncate"><span className="font-mono text-white/70">{v.commitShortSha || '—'}</span>{v.commitMessage ? ` ${v.commitMessage}` : ''}</span>
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/35">
                    <span title={formatAbsolute(v.createdAt)}>{formatRelative(v.createdAt)}</span>
                    {formatDuration(v.durationMs) && <span>Built in {formatDuration(v.durationMs)}</span>}
                    {v.url && <a href={v.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-white/70 truncate max-w-[220px]">{v.url.replace('https://', '')} <ExternalLink size={9} /></a>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => setDrawer(v)} className="px-3 py-1.5 rounded-lg bg-white/5 text-white/60 text-[10px] font-bold uppercase tracking-wider hover:text-white hover:bg-white/10">Details & logs</button>
                    {v.rollback?.eligible && !data?.deployInProgress && (
                      <button type="button" onClick={() => setRollback({ version: v })} disabled={Boolean(data?.activeOperation && isOperationActive(data.activeOperation))}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#cbb392]/15 text-[#cbb392] text-[10px] font-bold uppercase tracking-wider hover:bg-[#cbb392]/25 disabled:opacity-40">
                        <RotateCcw size={10} /> Roll back
                      </button>
                    )}
                    {!v.rollback?.eligible && v.rollback?.reason && !v.isCurrentProduction && (
                      <span className="self-center text-[10px] text-white/25" title={v.rollback.reason.message}>Can&apos;t restore: {v.rollback.reason.code.replace(/_/g, ' ').toLowerCase()}</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
        {cursor && !loading && (
          <div className="mt-4 text-center">
            <button type="button" onClick={loadMore} disabled={loadingMore} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 text-white/60 text-[10px] font-bold uppercase tracking-wider hover:text-white hover:bg-white/10 disabled:opacity-40">
              {loadingMore && <Loader2 size={11} className="animate-spin" />} Load older deployments
            </button>
          </div>
        )}
        {!loading && !error && versions.length > 0 && !live && filter !== 'preview' && (
          <p className="mt-3 text-[10px] text-white/30">DevDrop couldn&apos;t determine which deployment is live on Vercel yet.</p>
        )}
      </div>

      {drawer && (
        <VersionDrawer
          deploymentId={deploymentId}
          version={drawer}
          onClose={() => setDrawer(null)}
          onRollback={(v) => { setDrawer(null); setRollback({ version: v }); }}
        />
      )}
      {rollback && (
        <RollbackModal
          deploymentId={deploymentId}
          version={rollback.version}
          resumeOperation={rollback.resume || null}
          onClose={() => { setRollback(null); load({ silent: true }); }}
          onSettled={() => load({ silent: true })}
        />
      )}
    </section>
  );
}

function Banner({ tone, icon: Icon, children }) {
  return (
    <div className={`mt-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed ${TONE_CLASSES[tone]}`}>
      <Icon size={13} className={`mt-0.5 shrink-0 ${Icon === Loader2 ? 'animate-spin' : ''}`} />
      <span className="text-white/65">{children}</span>
    </div>
  );
}
