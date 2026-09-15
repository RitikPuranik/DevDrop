import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Loader2, KeyRound, Plus, RefreshCcw, Power, Trash2,
  AlertTriangle, Zap, Clock, ShieldCheck, Ban, Activity,
  Search, Filter,
} from 'lucide-react';
import { toast } from 'sonner';

import { adminAPI } from '../../../api/admin';

const initialForm = { label: '', apiKey: '' };

/* ── Status visual mapping ─────────────────────────────────────────── */

const STATUS_CONFIG = {
  healthy:      { label: 'Healthy',      dot: 'bg-emerald-400', text: 'text-emerald-400' },
  busy:         { label: 'Busy',         dot: 'bg-blue-400',    text: 'text-blue-400' },
  rate_limited: { label: 'Rate Limited', dot: 'bg-amber-400',   text: 'text-amber-400' },
  degraded:     { label: 'Degraded',     dot: 'bg-amber-400',   text: 'text-amber-400' },
  invalid:      { label: 'Invalid',      dot: 'bg-red-400',     text: 'text-red-400' },
  disabled:     { label: 'Disabled',     dot: 'bg-white/30',    text: 'text-white/30' },
};

function statusFor(key) {
  if (!key.enabled) return 'disabled';
  if (key.isCoolingDown && key.status !== 'invalid') return 'rate_limited';
  return key.status || 'healthy';
}

/* ── Formatters ─────────────────────────────────────────────────────── */

function formatTokens(n) {
  if (n == null || n === 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function relativeTime(value) {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatCooldown(ms) {
  if (!ms || ms <= 0) return '—';
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec >= 60) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}m ${s}s`;
  }
  return `${totalSec}s`;
}

function successRate(key) {
  if (!key.totalRequests || key.totalRequests === 0) return '—';
  return `${Math.round((key.totalSuccesses / key.totalRequests) * 100)}%`;
}

/* ── Live cooldown tick ─────────────────────────────────────────────── */

function useCooldownTick(keys) {
  const [, setTick] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    const hasCooldown = keys.some(
      (k) => k.cooldownUntil && new Date(k.cooldownUntil).getTime() > Date.now()
    );
    if (hasCooldown && !intervalRef.current) {
      intervalRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    } else if (!hasCooldown && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [keys]);
}

/* ── Token bar ──────────────────────────────────────────────────────── */

function TokenBar({ used, limit }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            pct >= 90 ? 'bg-red-400' : pct >= 70 ? 'bg-amber-400' : 'bg-emerald-400'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-white/40 tabular-nums w-8 text-right">{pct}%</span>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────── */

export default function GeminiPoolSection() {
  const [keys, setKeys] = useState([]);
  const [poolStatus, setPoolStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useCooldownTick(keys);

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      const [keysRes, statusRes] = await Promise.all([
        adminAPI.getGeminiKeys(),
        adminAPI.getGeminiPoolStatus(),
      ]);
      setKeys(keysRes.data?.data?.keys || []);
      setPoolStatus(statusRes.data?.data || null);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load the Gemini API pool');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => load({ silent: true }), 15000);
    return () => clearInterval(interval);
  }, [load]);

  const handleAddKey = async (event) => {
    event.preventDefault();
    if (!form.label.trim() || !form.apiKey.trim()) {
      toast.error('Both a label and an API key are required');
      return;
    }
    try {
      setSubmitting(true);
      await adminAPI.addGeminiKey({ label: form.label.trim(), apiKey: form.apiKey.trim() });
      toast.success('Gemini API key added');
      setForm(initialForm);
      setShowForm(false);
      await load({ silent: true });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add the Gemini API key');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (key) => {
    try {
      await adminAPI.updateGeminiKey(key.id, { enabled: !key.enabled });
      toast.success(`Key ${key.enabled ? 'disabled' : 'enabled'}`);
      await load({ silent: true });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update the key');
    }
  };

  const handleDelete = async (key) => {
    if (!window.confirm(`Remove "${key.label}"? Any request already using it will finish normally.`)) return;
    try {
      await adminAPI.deleteGeminiKey(key.id);
      toast.success('Gemini API key removed');
      await load({ silent: true });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to remove the key');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-[#8b7355]" size={32} />
      </div>
    );
  }

  // Merge DB keys with live pool snapshot
  const liveKeyMap = {};
  if (poolStatus?.keys) {
    for (const lk of poolStatus.keys) liveKeyMap[lk.id] = lk;
  }

  const enrichedKeys = keys.map((k) => {
    const live = liveKeyMap[k.id];
    return {
      ...k,
      dailyTokensUsed: live?.dailyTokensUsed ?? k.dailyTokensUsed ?? 0,
      totalTokensUsed: live?.totalTokensUsed ?? k.totalTokensUsed ?? 0,
      promptTokensUsed: live?.promptTokensUsed ?? k.promptTokensUsed ?? 0,
      candidateTokensUsed: live?.candidateTokensUsed ?? k.candidateTokensUsed ?? 0,
      dailyTokenLimit: live?.dailyTokenLimit ?? poolStatus?.dailyTokenLimit ?? 1_500_000,
      isOutOfTokens: live?.isOutOfTokens ?? false,
      cooldownRemainingMs: live?.cooldownRemainingMs ?? 0,
      cooldownUntil: live?.cooldownUntil ?? k.cooldownUntil,
      inFlight: live?.inFlight ?? 0,
    };
  });

  // Apply search + status filter
  const filteredKeys = enrichedKeys.filter((key) => {
    // Search filter
    if (search) {
      const q = search.toLowerCase();
      const matchLabel = key.label?.toLowerCase().includes(q);
      const matchKey = key.maskedKey?.toLowerCase().includes(q);
      if (!matchLabel && !matchKey) return false;
    }
    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'out_of_tokens') {
        if (!key.isOutOfTokens) return false;
      } else {
        if (statusFor(key) !== statusFilter) return false;
      }
    }
    return true;
  });

  return (
    <div className="space-y-5">
      {/* ── Header & Summary ─────────────────────────────────────── */}
      <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5 backdrop-blur-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <KeyRound className="text-[#8b7355]" size={20} />
            <h2 className="text-lg font-black tracking-tight">Gemini API Pool</h2>
            {poolStatus?.hasAvailableKey !== false && (
              <span className="relative flex h-2 w-2 ml-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {refreshing && <Loader2 className="animate-spin text-white/30" size={14} />}
            <button
              onClick={() => load({ silent: true })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 text-[11px] font-bold uppercase tracking-[0.1em] text-white/50 hover:text-white hover:bg-white/5 transition-colors"
            >
              <RefreshCcw size={12} /> Refresh
            </button>
            <button
              onClick={() => setShowForm((s) => !s)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#8b7355] text-white text-[11px] font-bold uppercase tracking-[0.1em] hover:bg-[#9d8565] transition-colors"
            >
              <Plus size={12} /> Add Key
            </button>
          </div>
        </div>

        {!poolStatus?.aiServiceReachable && poolStatus?.aiServiceReachable !== undefined && (
          <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300 flex items-center gap-2">
            <AlertTriangle size={12} />
            ai-service unreachable — live stats unavailable.
          </div>
        )}

        {/* Summary strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <SummaryCell label="Total" value={poolStatus?.totalKeys ?? '—'} />
          <SummaryCell label="Active" value={poolStatus?.enabledKeys ?? '—'} />
          <SummaryCell label="Healthy" value={poolStatus?.healthyKeys ?? '—'} tone="text-emerald-400" />
          <SummaryCell label="Rate Ltd" value={poolStatus?.rateLimitedKeys ?? '—'} tone="text-amber-400" />
          <SummaryCell label="Invalid" value={poolStatus?.invalidKeys ?? '—'} tone="text-red-400" />
          <SummaryCell label="Out of Tkns" value={poolStatus?.outOfTokensKeys ?? '—'} tone="text-red-400" />
          <SummaryCell label="In-Flight" value={poolStatus?.activeRequests ?? '—'} />
          <SummaryCell label="Tkns Today" value={formatTokens(poolStatus?.totalDailyTokens)} tone="text-violet-400" />
        </div>
      </div>

      {/* ── Add Key Form ─────────────────────────────────────────── */}
      {showForm && (
        <form
          onSubmit={handleAddKey}
          className="rounded-[20px] border border-white/10 bg-white/[0.03] p-5 space-y-3 backdrop-blur-2xl"
        >
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-white/40 mb-1">Label</label>
              <input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Primary AI"
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-[#8b7355] transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-white/40 mb-1">Gemini API Key</label>
              <input
                value={form.apiKey}
                onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                placeholder="AIza..."
                type="password"
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-[#8b7355] transition-colors"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-full bg-[#8b7355] text-white text-[11px] font-bold uppercase tracking-[0.1em] disabled:opacity-50 hover:bg-[#9d8565] transition-colors"
            >
              {submitting ? 'Adding…' : 'Save Key'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setForm(initialForm); }}
              className="px-5 py-2 rounded-full border border-white/10 text-[11px] font-bold uppercase tracking-[0.1em] text-white/50 hover:text-white hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
          </div>
          <p className="text-[10px] text-white/25">
            Encrypted at rest — only a masked form (e.g. AIza...7xP2) is shown after saving.
          </p>
        </form>
      )}

      {/* ── Search & Filter Bar ──────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by label or key..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-[#8b7355] transition-colors"
          />
        </div>

        {/* Status filter */}
        <div className="relative">
          <Filter size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="appearance-none pl-8 pr-8 py-2 rounded-xl bg-[#141414] border border-white/10 text-xs text-white/70 focus:outline-none focus:border-[#8b7355] transition-colors cursor-pointer"
            style={{ colorScheme: 'dark' }}
          >
            <option value="all" className="bg-[#141414] text-white">All Status</option>
            <option value="healthy" className="bg-[#141414] text-white">Healthy</option>
            <option value="busy" className="bg-[#141414] text-white">Busy</option>
            <option value="rate_limited" className="bg-[#141414] text-white">Rate Limited</option>
            <option value="degraded" className="bg-[#141414] text-white">Degraded</option>
            <option value="invalid" className="bg-[#141414] text-white">Invalid</option>
            <option value="disabled" className="bg-[#141414] text-white">Disabled</option>
            <option value="out_of_tokens" className="bg-[#141414] text-white">Out of Tokens</option>
          </select>
          <ChevronIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
        </div>

        {/* Result count */}
        {(search || statusFilter !== 'all') && (
          <span className="text-[10px] text-white/30 font-bold uppercase tracking-wider self-center shrink-0">
            {filteredKeys.length} / {enrichedKeys.length}
          </span>
        )}
      </div>

      {/* ── Excel-style Table ────────────────────────────────────── */}
      <div className="rounded-[20px] border border-white/10 bg-white/[0.03] backdrop-blur-2xl overflow-hidden">
        {keys.length === 0 ? (
          <div className="p-8 text-center text-white/40 text-sm">
            No Gemini API keys configured yet. Add one above, or set GEMINI_API_KEY in ai-service/.env.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              {/* Header */}
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02]">
                  <Th>Label</Th>
                  <Th>Key</Th>
                  <Th>Status</Th>
                  <Th align="right">Requests</Th>
                  <Th align="right">Success</Th>
                  <Th align="right">Failures</Th>
                  <Th align="right">Rate</Th>
                  <Th align="right">Daily Tokens</Th>
                  <Th>Usage</Th>
                  <Th align="right">Total Tokens</Th>
                  <Th>Cooldown</Th>
                  <Th>Last Used</Th>
                  <Th>Last Error</Th>
                  <Th align="center">Actions</Th>
                </tr>
              </thead>

              {/* Body */}
              <tbody>
                {filteredKeys.map((key) => {
                  const status = statusFor(key);
                  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.healthy;
                  const cooldownMs = key.cooldownUntil
                    ? Math.max(0, new Date(key.cooldownUntil).getTime() - Date.now())
                    : 0;

                  return (
                    <tr
                      key={key.id}
                      className={`border-b border-white/[0.04] transition-colors hover:bg-white/[0.02] ${
                        key.isOutOfTokens ? 'bg-red-500/[0.03]' : ''
                      }`}
                    >
                      {/* Label */}
                      <Td>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white truncate max-w-[140px]">{key.label}</span>
                          {key.isOutOfTokens && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-red-500/20 text-red-300 border border-red-500/30 animate-pulse leading-none">
                              Exhausted
                            </span>
                          )}
                        </div>
                      </Td>

                      {/* Masked Key */}
                      <Td><code className="text-white/40 text-[11px]">{key.maskedKey}</code></Td>

                      {/* Status */}
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          <span className={`font-semibold ${cfg.text}`}>{cfg.label}</span>
                        </div>
                      </Td>

                      {/* Requests */}
                      <Td align="right"><span className="tabular-nums">{key.totalRequests}</span></Td>

                      {/* Successes */}
                      <Td align="right"><span className="tabular-nums text-emerald-400/80">{key.totalSuccesses}</span></Td>

                      {/* Failures */}
                      <Td align="right">
                        <span className={`tabular-nums ${key.totalFailures > 0 ? 'text-red-400/80' : ''}`}>
                          {key.totalFailures}
                        </span>
                      </Td>

                      {/* Success Rate */}
                      <Td align="right">
                        {(() => {
                          const r = successRate(key);
                          if (r === '—') return <span className="text-white/30">—</span>;
                          const n = parseInt(r);
                          return (
                            <span className={`font-semibold tabular-nums ${
                              n >= 90 ? 'text-emerald-400' : n >= 70 ? 'text-amber-400' : 'text-red-400'
                            }`}>{r}</span>
                          );
                        })()}
                      </Td>

                      {/* Daily Tokens */}
                      <Td align="right">
                        <span className="tabular-nums">{formatTokens(key.dailyTokensUsed)}</span>
                        <span className="text-white/20 ml-0.5">/ {formatTokens(key.dailyTokenLimit)}</span>
                      </Td>

                      {/* Usage Bar */}
                      <Td><TokenBar used={key.dailyTokensUsed} limit={key.dailyTokenLimit} /></Td>

                      {/* Total Tokens */}
                      <Td align="right"><span className="tabular-nums">{formatTokens(key.totalTokensUsed)}</span></Td>

                      {/* Cooldown */}
                      <Td>
                        {cooldownMs > 0 ? (
                          <span className="flex items-center gap-1 text-amber-400 font-semibold tabular-nums">
                            <Clock size={10} /> {formatCooldown(cooldownMs)}
                          </span>
                        ) : (
                          <span className="text-white/20">—</span>
                        )}
                      </Td>

                      {/* Last Used */}
                      <Td><span className="text-white/50">{relativeTime(key.lastUsedAt)}</span></Td>

                      {/* Last Error */}
                      <Td>
                        {key.lastErrorMessage ? (
                          <span className="text-amber-300/70 truncate block max-w-[160px]" title={key.lastErrorMessage}>
                            {key.lastErrorMessage}
                          </span>
                        ) : (
                          <span className="text-white/15">—</span>
                        )}
                      </Td>

                      {/* Actions */}
                      <Td align="center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleToggle(key)}
                            title={key.enabled ? 'Disable' : 'Enable'}
                            className={`p-1.5 rounded-md border transition-colors ${
                              key.enabled
                                ? 'border-white/10 text-white/50 hover:text-amber-400 hover:border-amber-500/30 hover:bg-amber-500/10'
                                : 'border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10'
                            }`}
                          >
                            <Power size={12} />
                          </button>
                          <button
                            onClick={() => handleDelete(key)}
                            title="Remove key"
                            className="p-1.5 rounded-md border border-white/10 text-white/40 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Table primitives ────────────────────────────────────────────────── */

function Th({ children, align = 'left' }) {
  return (
    <th
      className={`px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/30 whitespace-nowrap text-${align}`}
    >
      {children}
    </th>
  );
}

function Td({ children, align = 'left' }) {
  return (
    <td className={`px-3 py-2.5 whitespace-nowrap text-${align}`}>
      {children}
    </td>
  );
}

/* ── Summary cell ────────────────────────────────────────────────────── */

function SummaryCell({ label, value, tone = 'text-white' }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2 text-center">
      <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-white/25 mb-0.5">{label}</p>
      <p className={`text-sm font-black tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function ChevronIcon({ className }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={className}>
      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
