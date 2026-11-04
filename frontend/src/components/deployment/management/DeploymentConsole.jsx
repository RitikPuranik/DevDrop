import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, ExternalLink, GitCommit, Loader2, RefreshCw, ScrollText } from 'lucide-react';
import { toast } from 'sonner';
import { deploymentAPI } from '../../../api/deployment';
import LogsViewer from './LogsViewer';
import VersionTimeline, { VersionBadges } from './VersionTimeline';
import { apiErrorMessage, formatAbsolute, formatDuration, formatRelative } from './versionUi';

const EASE = [0.22, 1, 0.36, 1];
const PAGE = 20;
const IN_PROGRESS = ['BUILDING', 'QUEUED', 'INITIALIZING'];
const WATCH_MS = 8000; // slow poll while a deployment is still building
const WATCH_MAX_MS = 10 * 60 * 1000;

const ghost = 'inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-white/12 bg-white/[0.03] text-white/70 text-[11px] font-bold uppercase tracking-[0.16em] hover:bg-white/[0.07] hover:text-white transition-colors disabled:opacity-50';

/**
 * Settled Vercel deployment page: status hero, logs for the selected
 * deployment (the latest one by default) and the deployment history.
 */
export default function DeploymentConsole({ deployment, onRedeploy, redeploying }) {
  const deploymentId = deployment.id;
  const [versions, setVersions] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [availability, setAvailability] = useState(null);
  const mounted = useRef(true);
  const selectedRef = useRef(null);
  selectedRef.current = selectedId;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const apply = useCallback((d) => {
    const list = d.versions || [];
    setVersions(list);
    setCursor(d.nextCursor || null);
    setMeta(d);
    // Default to the latest deployment; keep the user's choice while it is still listed.
    setSelectedId((cur) => (cur && list.some((v) => v.id === cur) ? cur : list[0]?.id || null));
  }, []);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await deploymentAPI.listVersions(deploymentId, { limit: PAGE, ...(filter !== 'all' ? { environment: filter } : {}) });
      if (mounted.current) apply(res.data.data);
    } catch (err) {
      if (mounted.current && !silent) setError(apiErrorMessage(err, 'Could not load deployment history.'));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [deploymentId, filter, apply]);

  useEffect(() => { load(); }, [load]);

  // While something is building, check back slowly (bounded) so the list and logs catch up.
  const building = versions.some((v) => IN_PROGRESS.includes(v.state));
  useEffect(() => {
    if (!building) return undefined;
    const startedAt = Date.now();
    const t = setInterval(() => {
      if (document.hidden) return;
      if (Date.now() - startedAt > WATCH_MAX_MS) { clearInterval(t); return; }
      load({ silent: true });
    }, WATCH_MS);
    return () => clearInterval(t);
  }, [building, load]);

  const selected = versions.find((v) => v.id === selectedId) || null;

  // Which log tabs have data (dims empty tabs). Best-effort: logs still load without it.
  useEffect(() => {
    setAvailability(null);
    if (!selectedId) return undefined;
    let cancelled = false;
    deploymentAPI.getVersion(deploymentId, selectedId)
      .then((res) => { if (!cancelled) setAvailability(res.data.data?.logs || null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [deploymentId, selectedId]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await deploymentAPI.syncVersions(deploymentId);
      const d = res.data.data;
      apply(filter === 'all' ? d : { ...d, versions: d.versions.filter((v) => v.environment === filter) });
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
      const res = await deploymentAPI.listVersions(deploymentId, { limit: PAGE, cursor, ...(filter !== 'all' ? { environment: filter } : {}) });
      setVersions((prev) => [...prev, ...res.data.data.versions]);
      setCursor(res.data.data.nextCursor || null);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not load more.'));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <div className="min-w-0 space-y-5">
        <StatusHero deployment={deployment} onRedeploy={onRedeploy} redeploying={redeploying} />
        <LogsPanel deploymentId={deploymentId} version={selected} availability={availability} loading={loading} />
      </div>
      <aside className="min-w-0 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-auto">
        <VersionTimeline
          versions={versions}
          selectedId={selectedId}
          onSelect={(v) => setSelectedId(v.id)}
          loading={loading}
          error={error}
          onRetry={() => load()}
          filter={filter}
          onFilter={setFilter}
          hasMore={Boolean(cursor)}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          onRefresh={refresh}
          refreshing={refreshing}
          syncError={Boolean(meta?.sync?.error)}
          truncated={Boolean(meta?.sync?.historyTruncated)}
        />
      </aside>
    </div>
  );
}

/* ─────────────────────────────  Logs panel  ───────────────────────────── */

function LogsPanel({ deploymentId, version, availability, loading }) {
  return (
    <section className="rounded-2xl border border-white/[0.10] bg-[#101010] p-4 sm:p-5" aria-label="Deployment logs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-white/90">
            <ScrollText size={14} className="text-white/40" />
            Logs{version ? <span className="text-white/50">· {version.label}</span> : null}
          </h2>
          {version && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <VersionBadges v={version} />
            </div>
          )}
        </div>
        {version?.url && (
          <a href={version.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-white/60 text-[10px] font-bold uppercase tracking-wider hover:text-white hover:bg-white/10">
            <ExternalLink size={11} /> Open deployment
          </a>
        )}
      </div>

      {version && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/40">
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <GitCommit size={12} className="shrink-0 text-white/25" />
            <span className="font-mono text-white/65">{version.commitShortSha || '—'}</span>
            {version.commitMessage && <span className="truncate max-w-[320px]">{version.commitMessage}</span>}
          </span>
          <span title={formatAbsolute(version.createdAt)}>{formatRelative(version.createdAt)}</span>
          {formatDuration(version.durationMs) && <span>Built in {formatDuration(version.durationMs)}</span>}
        </div>
      )}
      {version?.state === 'ERROR' && version.errorMessage && (
        <p className="mt-3 rounded-lg border border-red-400/15 bg-red-500/[0.05] px-3 py-2 text-[11.5px] text-red-200/80 break-words">{version.errorMessage}</p>
      )}

      <div className="mt-4">
        {version ? (
          <LogsViewer key={version.id} deploymentId={deploymentId} version={version} availability={availability} />
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-white/35"><Loader2 size={14} className="animate-spin" /> Loading deployments…</div>
        ) : (
          <div className="py-10 text-center">
            <p className="text-[13px] text-white/60">No deployment selected</p>
            <p className="mt-1 text-[11px] text-white/30">Logs appear here once Vercel reports a deployment for this site.</p>
          </div>
        )}
      </div>
    </section>
  );
}

/* ─────────────────────────────  Status hero  ───────────────────────────── */

function StatusHero({ deployment, onRedeploy, redeploying }) {
  const frontend = deployment.vercel?.url;
  const backend = deployment.render?.url;
  const primary = frontend || backend;
  const ok = deployment.status === 'SUCCESS';
  const failed = deployment.status === 'FAILED';
  const title = ok ? 'It’s live.' : failed ? 'Deployment failed.' : 'Deployment cancelled.';

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="rounded-2xl border border-white/[0.10] bg-[#101010] p-5 sm:p-6"
    >
      <div className="flex items-center gap-4">
        <span className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${ok ? 'bg-[#87998b]/30' : failed ? 'bg-red-400/15' : 'bg-white/10'}`}>
          {ok ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b8c8bb" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          ) : (
            <span className={`h-3 w-3 rounded-full ${failed ? 'bg-red-300/80' : 'border border-white/40'}`} />
          )}
        </span>
        <h2 className="text-[30px] sm:text-[36px] leading-tight font-semibold tracking-tight text-white/90">{title}</h2>
      </div>

      {failed && (
        <p className="mt-4 max-h-28 overflow-y-auto rounded-xl border border-red-300/10 bg-red-400/[0.03] p-3 text-[12px] leading-relaxed text-white/55 font-mono break-words">
          {deployment.errorMessage || 'An unexpected error occurred.'}
        </p>
      )}

      {(frontend || backend) && (
        <div className="mt-5 space-y-2">
          {frontend && <UrlRow label="Frontend" provider="Vercel" url={frontend} live={ok} />}
          {backend && <UrlRow label="Backend" provider="Render" url={backend} live={ok} />}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        {ok && primary && (
          <a href={primary} target="_blank" rel="noreferrer" className="group inline-flex items-center gap-2 pl-5 pr-4 py-2.5 rounded-lg bg-[#e7e7e7] text-[#111] text-[11px] font-bold uppercase tracking-[0.16em] hover:bg-white transition-colors">
            Open site <ArrowUpRight size={14} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        )}
        {deployment.repository?.url && <a href={deployment.repository.url} target="_blank" rel="noreferrer" className={ghost}>GitHub</a>}
        <button type="button" onClick={onRedeploy} disabled={redeploying} className={ghost}>
          {redeploying ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} {failed ? 'Retry' : 'Redeploy'}
        </button>
      </div>
    </motion.section>
  );
}

function UrlRow({ label, provider, url, live }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0 text-[12px]">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${live ? 'bg-emerald-300/80' : 'bg-white/25'}`} />
      <span className="shrink-0 text-white/70">{label}</span>
      <span className="shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/35">{provider}</span>
      {live && <span className="shrink-0 rounded border border-emerald-300/20 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-300">Live</span>}
      <a href={url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-white/40 hover:text-white/80">{url.replace(/^https?:\/\//, '')}</a>
    </div>
  );
}
