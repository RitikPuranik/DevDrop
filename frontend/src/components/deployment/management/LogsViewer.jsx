import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Loader2, RefreshCw, Search, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { deploymentAPI } from '../../../api/deployment';
import { LEVEL_CLASSES, RANGE_PRESETS, TONE_CLASSES, apiErrorMessage, formatLogTime, rangeToSince } from './versionUi';

const TABS = [
  { id: 'build', label: 'Build' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'error', label: 'Errors' },
];
const SEVERITIES = ['all', 'error', 'warning', 'info', 'debug'];
const AUTO_REFRESH_MS = 15000; // deliberately slow: every refresh is a request to Vercel
const AUTO_REFRESH_MAX_MS = 10 * 60 * 1000; // stop on its own so a forgotten tab doesn't poll forever
const PAGE_SIZE = 100;

const SOURCE_COPY = {
  expired: 'Vercel no longer has these logs. They may be past the retention period for your plan.',
  restricted: 'Vercel did not allow DevDrop to read these logs (integration permissions or plan).',
  unavailable: 'No logs are available for this deployment.',
  pending: 'This deployment has not started producing logs yet.',
};

/**
 * Logs for one deployment version. Everything is rendered as plain text nodes
 * (never HTML), and all log content arrives already redacted by the server.
 * These are Vercel build/runtime logs, not browser console output.
 */
export default function LogsViewer({ deploymentId, version, availability }) {
  const [tab, setTab] = useState('build');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [severity, setSeverity] = useState('all');
  const [range, setRange] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(false);

  const [entries, setEntries] = useState([]);
  const [meta, setMeta] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  const buildParams = useCallback(
    (extra = {}) => ({
      type: tab,
      limit: PAGE_SIZE,
      ...(debouncedQ ? { q: debouncedQ } : {}),
      ...(severity !== 'all' ? { severity } : {}),
      ...(rangeToSince(range) ? { since: rangeToSince(range) } : {}),
      ...extra,
    }),
    [tab, debouncedQ, severity, range]
  );

  const load = useCallback(
    async ({ refresh = false, silent = false } = {}) => {
      const id = ++requestId.current;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const res = await deploymentAPI.versionLogs(deploymentId, version.id, buildParams(refresh ? { refresh: 1 } : {}));
        if (id !== requestId.current) return; // a newer request superseded this one
        const data = res.data?.data;
        setEntries(data.entries || []);
        setMeta(data);
        setNextCursor(data.nextCursor || null);
      } catch (err) {
        if (id !== requestId.current) return;
        setError({ message: apiErrorMessage(err, 'Could not load logs.'), rateLimited: err?.response?.status === 429 });
        if (err?.response?.status === 429) setAutoRefresh(false);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [deploymentId, version.id, buildParams]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh: slow, paused while the tab is hidden, and self-terminating.
  useEffect(() => {
    if (!autoRefresh) return undefined;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (document.hidden) return;
      if (Date.now() - startedAt > AUTO_REFRESH_MAX_MS) {
        setAutoRefresh(false);
        toast.message('Auto-refresh turned off after 10 minutes.');
        return;
      }
      load({ refresh: true, silent: true });
    }, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, load]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await deploymentAPI.versionLogs(deploymentId, version.id, buildParams({ cursor: nextCursor }));
      const data = res.data?.data;
      setEntries((prev) => [...prev, ...(data.entries || [])]);
      setNextCursor(data.nextCursor || null);
    } catch (err) {
      if (err?.response?.data?.code === 'CURSOR_EXPIRED') {
        toast.message('Logs were refreshed — reloading from the start.');
        load();
      } else {
        toast.error(apiErrorMessage(err, 'Could not load more logs.'));
      }
    } finally {
      setLoadingMore(false);
    }
  };

  const copyEntry = async (entry) => {
    const line = `${new Date(entry.ts).toISOString()} [${entry.level}] ${entry.message}`;
    try {
      await navigator.clipboard.writeText(line);
      toast.success('Log line copied');
    } catch {
      toast.error('Could not copy — your browser blocked clipboard access.');
    }
  };

  const tabAvail = availability?.[tab];
  const sources = meta?.sources || {};
  const notices = Object.entries(sources).filter(([, s]) => s && s.status && s.status !== 'ok' && s.status !== 'available');
  const filtersActive = Boolean(debouncedQ) || severity !== 'all' || range !== 'all';

  return (
    <div className="space-y-3">
      {/* tabs */}
      <div className="flex items-center justify-between gap-2" role="tablist" aria-label="Log type">
        <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-[10px] text-[11px] font-bold uppercase tracking-wider transition-colors ${tab === t.id ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}
            >
              {t.label}
              {availability?.[t.id]?.status === 'unavailable' && <span className="ml-1 text-white/25">·</span>}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="hidden sm:flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40 cursor-pointer select-none">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="accent-[#cbb392]" />
            Auto-refresh
          </label>
          <button
            type="button"
            onClick={() => load({ refresh: true })}
            disabled={loading}
            aria-label="Refresh logs"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-white/60 text-[10px] font-bold uppercase tracking-wider hover:text-white hover:bg-white/10 disabled:opacity-40 transition-colors"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <label className="sm:hidden flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/40">
        <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="accent-[#cbb392]" /> Auto-refresh (every 15s)
      </label>

      {/* filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={200}
            placeholder="Search logs"
            aria-label="Search logs"
            className="w-full pl-8 pr-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-[12px] text-white/80 placeholder:text-white/25 focus:outline-none focus:border-white/25"
          />
        </div>
        <select value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Filter by severity" className="px-2.5 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-[11px] text-white/70 focus:outline-none">
          {SEVERITIES.map((s) => (
            <option key={s} value={s} className="bg-[#101010]">{s === 'all' ? 'All severities' : s[0].toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <select value={range} onChange={(e) => setRange(e.target.value)} aria-label="Filter by time range" className="px-2.5 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-[11px] text-white/70 focus:outline-none">
          {RANGE_PRESETS.map((r) => (
            <option key={r.id} value={r.id} className="bg-[#101010]">{r.label}</option>
          ))}
        </select>
      </div>

      {tabAvail?.message && tabAvail.status !== 'available' && (
        <p className="text-[11px] text-white/40">{tabAvail.message}</p>
      )}
      {tab === 'runtime' && tabAvail?.status === 'available' && tabAvail.message && (
        <p className="text-[11px] text-white/30">{tabAvail.message}</p>
      )}

      {notices.map(([name, s]) => (
        <div key={name} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] ${TONE_CLASSES.busy}`}>
          <TriangleAlert size={12} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-bold uppercase tracking-wider">{name}:</span> {s.message || SOURCE_COPY[s.status] || 'Unavailable.'}
          </span>
        </div>
      ))}

      {/* body */}
      <div className="rounded-xl border border-white/10 bg-black/40 overflow-hidden" aria-live="polite">
        {loading && entries.length === 0 ? (
          <div className="p-4 space-y-2" aria-label="Loading logs">
            {[70, 90, 55, 80, 65].map((w, i) => (
              <div key={i} className="h-3 rounded bg-white/[0.06] animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : error ? (
          <div className="p-5 text-center">
            <p className="text-[12px] text-red-300/80">{error.message}</p>
            <button type="button" onClick={() => load()} className="mt-3 px-3 py-1.5 rounded-lg bg-white/5 text-white/60 text-[10px] font-bold uppercase tracking-wider hover:text-white hover:bg-white/10">Try again</button>
          </div>
        ) : entries.length === 0 ? (
          <div className="p-6 text-center text-[12px] text-white/35">
            {filtersActive ? 'No log lines match these filters.' : notices.length ? 'Nothing to show for this log type.' : 'No log lines were returned for this deployment.'}
          </div>
        ) : (
          <ul className="max-h-[420px] overflow-auto divide-y divide-white/[0.04] font-mono text-[11px] leading-relaxed">
            {entries.map((e) => (
              <li key={e.id} className="group flex items-start gap-2 px-3 py-1.5 hover:bg-white/[0.03]">
                <span className="shrink-0 text-white/25 tabular-nums">{formatLogTime(e.ts)}</span>
                <span className={`shrink-0 w-12 uppercase text-[9px] font-bold tracking-wider pt-0.5 ${LEVEL_CLASSES[e.level] || 'text-white/40'}`}>{e.level}</span>
                {tab === 'error' && <span className="shrink-0 text-[9px] uppercase tracking-wider text-white/25 pt-0.5">{e.source}</span>}
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-white/75">
                  {e.request && <span className="text-white/40">{e.request.method} {e.request.path}{e.request.status ? ` → ${e.request.status} ` : ' '}</span>}
                  {e.message}
                </span>
                <button type="button" onClick={() => copyEntry(e)} aria-label="Copy log line" className="shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 text-white/30 hover:text-white transition-opacity">
                  <Copy size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 text-[10px] text-white/30">
        <span>
          {meta ? `${entries.length} of ${meta.total} line${meta.total === 1 ? '' : 's'}` : ''}
          {meta?.truncated ? ' · showing a limited window of Vercel\'s logs' : ''}
          {meta?.throttled ? ' · refreshed recently' : ''}
        </span>
        {nextCursor && (
          <button type="button" onClick={loadMore} disabled={loadingMore} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-white/60 font-bold uppercase tracking-wider hover:text-white hover:bg-white/10 disabled:opacity-40">
            {loadingMore && <Loader2 size={11} className="animate-spin" />} Load more
          </button>
        )}
      </div>
      <p className="text-[10px] text-white/25">Vercel build and runtime logs only — browser console output isn&apos;t included. Secrets are redacted.</p>
    </div>
  );
}
