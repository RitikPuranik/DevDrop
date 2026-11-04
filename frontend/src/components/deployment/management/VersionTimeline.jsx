import React from 'react';
import { GitCommit, History, Loader2, RefreshCw } from 'lucide-react';
import { TONE_CLASSES, formatAbsolute, formatDuration, formatRelative, stateMeta } from './versionUi';

const Pill = ({ tone, children, title }) => (
  <span title={title} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider ${TONE_CLASSES[tone]}`}>{children}</span>
);

const IN_PROGRESS = ['BUILDING', 'QUEUED', 'INITIALIZING'];

/** Role / environment / status badges for one version. */
export function VersionBadges({ v }) {
  const s = stateMeta(v.state);
  return (
    <>
      {v.isCurrentProduction && (
        <Pill tone="accent" title="Currently serving production traffic">
          <span className="h-1.5 w-1.5 rounded-full bg-[#cbb392]" /> Live
        </Pill>
      )}
      <Pill tone={v.environment === 'production' ? 'info' : 'muted'}>{v.environment === 'production' ? 'Production' : 'Preview'}</Pill>
      <Pill tone={s.tone}>
        {IN_PROGRESS.includes(v.state) && <Loader2 size={9} className="animate-spin" />}
        {s.label}
      </Pill>
      {v.isLatest && !v.isCurrentProduction && <Pill tone="muted" title="Most recent deployment">Latest</Pill>}
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
 * Chronological list of every Vercel deployment of the site. Selecting one
 * switches the logs panel to it. Purely presentational: the console owns the data.
 */
export default function VersionTimeline({
  versions, selectedId, onSelect, loading, error, onRetry, filter, onFilter,
  hasMore, loadingMore, onLoadMore, onRefresh, refreshing, syncError, truncated,
}) {
  return (
    <section className="rounded-2xl border border-white/[0.10] bg-[#101010] p-4 sm:p-5" aria-label="Deployment history">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[14px] font-medium text-white/90">
            <History size={14} className="text-white/40" /> Deployment History
          </h2>
          <p className="mt-1 text-[11px] text-white/35">Every Vercel deployment of this site.</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing || loading}
          aria-label="Refresh history from Vercel"
          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 text-white/55 text-[10px] font-bold uppercase tracking-wider hover:text-white hover:bg-white/10 disabled:opacity-40"
        >
          <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} /> Sync
        </button>
      </div>

      <div className="mt-3 inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-0.5" role="group" aria-label="Filter deployments">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => onFilter(f.id)}
            className={`px-2.5 py-1 rounded-[10px] text-[10px] font-bold uppercase tracking-wider transition-colors ${filter === f.id ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {syncError && <p className="mt-3 text-[11px] text-amber-300/80">Could not refresh from Vercel just now. Showing the last known history.</p>}
      {truncated && <p className="mt-3 text-[10px] text-white/30">Only the most recent deployments were imported from Vercel.</p>}

      <div className="mt-4">
        {loading ? (
          <div className="space-y-3" aria-label="Loading deployment history">
            {[0, 1, 2].map((i) => <div key={i} className="h-[84px] rounded-xl bg-white/[0.04] animate-pulse" />)}
          </div>
        ) : error ? (
          <div className="text-center py-6">
            <p className="text-[12px] text-red-300/80">{error}</p>
            <button type="button" onClick={onRetry} className="mt-3 px-3 py-1.5 rounded-lg bg-white/5 text-white/60 text-[10px] font-bold uppercase tracking-wider hover:text-white hover:bg-white/10">Try again</button>
          </div>
        ) : versions.length === 0 ? (
          <div className="text-center py-8">
            <History size={20} className="mx-auto text-white/20" />
            <p className="mt-3 text-[13px] text-white/60">No deployments to show</p>
            <p className="mt-1 text-[11px] text-white/30">{filter === 'all' ? 'Each Vercel deployment of this site will appear here.' : 'Nothing matches this filter.'}</p>
          </div>
        ) : (
          <ol className="relative space-y-3 before:absolute before:left-[8px] before:top-3 before:bottom-3 before:w-px before:bg-white/10">
            {versions.map((v) => {
              const selected = v.id === selectedId;
              return (
                <li key={v.id} className="relative pl-6">
                  <span className={`absolute left-[2px] top-5 h-3.5 w-3.5 rounded-full border-2 ${v.isCurrentProduction ? 'border-[#cbb392] bg-[#cbb392]' : v.state === 'ERROR' ? 'border-red-400/60 bg-[#101010]' : 'border-white/25 bg-[#101010]'}`} />
                  <button
                    type="button"
                    onClick={() => onSelect(v)}
                    aria-pressed={selected}
                    aria-label={`Show logs for ${v.label}`}
                    className={`w-full text-left rounded-xl border p-3 transition-colors ${selected ? 'border-[#cbb392]/40 bg-[#cbb392]/[0.06]' : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20'}`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-semibold text-white/90 tabular-nums mr-1">{v.label}</span>
                      <VersionBadges v={v} />
                    </div>
                    <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-white/55 min-w-0">
                      <GitCommit size={11} className="mt-0.5 shrink-0 text-white/25" />
                      <span className="truncate"><span className="font-mono text-white/70">{v.commitShortSha || '—'}</span>{v.commitMessage ? ` ${v.commitMessage}` : ''}</span>
                    </p>
                    <p className="mt-1.5 text-[10.5px] text-white/35" title={formatAbsolute(v.createdAt)}>
                      {formatRelative(v.createdAt)}{formatDuration(v.durationMs) ? ` · Built in ${formatDuration(v.durationMs)}` : ''}
                    </p>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        {hasMore && !loading && (
          <div className="mt-4 text-center">
            <button type="button" onClick={onLoadMore} disabled={loadingMore} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 text-white/60 text-[10px] font-bold uppercase tracking-wider hover:text-white hover:bg-white/10 disabled:opacity-40">
              {loadingMore && <Loader2 size={11} className="animate-spin" />} Load older deployments
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

