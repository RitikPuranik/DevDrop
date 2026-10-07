import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, KeyRound, Plus, RefreshCcw, Power, Trash2, Zap, Activity } from 'lucide-react';
import { toast } from 'sonner';

import { adminAPI } from '../../../api/admin';

/**
 * Admin view of the Groq key pool that powers Kashi (the assistant and the
 * Vercel build fixer). Same database as the Gemini pool, separate collection.
 * Kashi uses two models from this pool: a fast model for answers/navigation
 * and an edit model for fixing code (configured in ai-service/.env).
 */

const STATUS = {
  healthy: ['Healthy', 'bg-emerald-400', 'text-emerald-400'],
  busy: ['Busy', 'bg-blue-400', 'text-blue-400'],
  rate_limited: ['Rate limited', 'bg-amber-400', 'text-amber-400'],
  degraded: ['Degraded', 'bg-amber-400', 'text-amber-400'],
  invalid: ['Invalid', 'bg-red-400', 'text-red-400'],
  disabled: ['Disabled', 'bg-white/30', 'text-white/30'],
};

const fmtTokens = (n) => (!n ? '0' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));
const fmtCooldown = (ms) => (!ms || ms <= 0 ? '—' : ms >= 60000 ? `${Math.floor(ms / 60000)}m ${Math.ceil((ms % 60000) / 1000)}s` : `${Math.ceil(ms / 1000)}s`);
const rel = (v) => {
  if (!v) return '—';
  const d = Date.now() - new Date(v).getTime();
  if (d < 60000) return 'Just now';
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return `${Math.floor(d / 86400000)}d ago`;
};

export default function GroqPoolSection() {
  const [keys, setKeys] = useState([]);
  const [live, setLive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ label: '', apiKey: '' });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [list, status] = await Promise.all([
        adminAPI.getGroqKeys({ limit: 100 }),
        adminAPI.getGroqPoolStatus().catch(() => null),
      ]);
      setKeys(list.data?.data?.keys || []);
      setLive(status?.data?.data || null);
    } catch (err) {
      if (!silent) toast.error(err.response?.data?.message || 'Failed to load the Groq pool');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 10000);
    return () => clearInterval(t);
  }, [load]);

  const liveById = useMemo(() => new Map((live?.keys || []).map((k) => [k.id, k])), [live]);

  const run = async (id, fn, ok) => {
    try {
      setBusyId(id);
      const res = await fn();
      if (ok) toast.success(typeof ok === 'function' ? ok(res) : ok);
      await load(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const addKey = async (e) => {
    e.preventDefault();
    if (!form.label.trim() || form.apiKey.trim().length < 10) return toast.error('Enter a label and a valid Groq API key');
    try {
      setSaving(true);
      await adminAPI.addGroqKey({ label: form.label.trim(), apiKey: form.apiKey.trim() });
      setForm({ label: '', apiKey: '' });
      toast.success('Groq key added');
      await load(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not add the key');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-white/30" size={26} /></div>;

  const stats = [
    ['Keys', live?.totalKeys ?? keys.length],
    ['Healthy', live?.healthyKeys ?? '—'],
    ['Rate limited', live?.rateLimitedKeys ?? '—'],
    ['Invalid', live?.invalidKeys ?? '—'],
    ['Tokens today', live ? fmtTokens(live.totalDailyTokens) : '—'],
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-[26px] border border-white/8 bg-[#0b0b0b] p-6">
        <div className="flex items-center gap-3 mb-2"><KeyRound size={18} className="text-[#cbb392]" /><h2 className="font-bold text-lg">Groq Pool — Kashi</h2></div>
        <p className="text-white/40 text-sm leading-relaxed">
          Powers Kashi only (never the Gemini pool). Stored in the same database as the Gemini pool, in its own collection. Two models are used:
          a <b className="text-white/60">fast model</b> for quick answers and navigation, and an <b className="text-white/60">edit model</b> that fixes deployment build errors in code.
        </p>
        {live === null && <p className="text-amber-300/80 text-xs mt-3">Live stats unavailable — is ai-service reachable?</p>}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5">
          {stats.map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-white/[0.03] border border-white/8 px-4 py-3">
              <div className="text-[10px] uppercase tracking-widest text-white/35 font-bold">{label}</div>
              <div className="text-xl font-black mt-1">{value}</div>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={addKey} className="rounded-[26px] border border-white/8 bg-[#0b0b0b] p-6 flex flex-col md:flex-row gap-3">
        <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Label (e.g. Groq key 1)" className="flex-1 rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm outline-none focus:border-[#8b7355]" />
        <input value={form.apiKey} onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))} placeholder="gsk_…" type="password" autoComplete="off" className="flex-[2] rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm outline-none focus:border-[#8b7355]" />
        <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#8b7355] text-white text-xs font-black uppercase tracking-[0.18em] hover:bg-[#725e46] disabled:opacity-60">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add key
        </button>
      </form>

      <div className="rounded-[26px] border border-white/8 bg-[#0b0b0b] overflow-x-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <span className="text-xs uppercase tracking-widest text-white/40 font-bold">{keys.length} key{keys.length === 1 ? '' : 's'}</span>
          <button type="button" onClick={() => load(true)} className="inline-flex items-center gap-2 text-white/40 hover:text-white text-xs font-bold"><RefreshCcw size={13} /> Refresh</button>
        </div>
        {keys.length === 0 ? (
          <p className="text-white/35 text-sm p-8 text-center">No Groq keys yet. Add one above (or set GROQ_API_KEY in ai-service/.env as a fallback).</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-widest text-white/30">
                {['Key', 'Status', 'Requests', 'Tokens', 'Cooldown', 'Last used', ''].map((h) => <th key={h} className="px-6 py-3 font-bold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const l = liveById.get(k.id);
                const statusKey = !k.enabled ? 'disabled' : l?.status || k.status || 'healthy';
                const [label, dot, text] = STATUS[statusKey] || STATUS.healthy;
                const working = busyId === k.id;
                return (
                  <tr key={k.id} className="border-t border-white/5">
                    <td className="px-6 py-3"><div className="font-bold">{k.label}</div><div className="text-white/30 text-xs font-mono">{k.maskedKey}</div></td>
                    <td className="px-6 py-3"><span className={`inline-flex items-center gap-2 ${text}`}><span className={`w-2 h-2 rounded-full ${dot}`} />{label}</span>{k.lastErrorMessage && <div className="text-white/25 text-[11px] max-w-[220px] truncate" title={k.lastErrorMessage}>{k.lastErrorMessage}</div>}</td>
                    <td className="px-6 py-3 text-white/60">{k.totalSuccesses}/{k.totalRequests}</td>
                    <td className="px-6 py-3 text-white/60">{fmtTokens(l?.dailyTokensUsed ?? k.dailyTokensUsed)} <span className="text-white/25">today</span></td>
                    <td className="px-6 py-3 text-white/60">{fmtCooldown(l?.cooldownRemainingMs)}</td>
                    <td className="px-6 py-3 text-white/40">{rel(l?.lastUsedAt || k.lastUsedAt)}</td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        <IconBtn title="Test key" disabled={working} onClick={() => run(k.id, () => adminAPI.testGroqKey(k.id), (r) => { const c = r.data?.data?.classification; return c === 'success' ? 'Key works' : `Test: ${c}${r.data?.data?.message ? ` — ${r.data.data.message}` : ''}`; })}>{working ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}</IconBtn>
                        <IconBtn title={k.enabled ? 'Disable' : 'Enable'} disabled={working} onClick={() => run(k.id, () => adminAPI.updateGroqKey(k.id, { enabled: !k.enabled }), k.enabled ? 'Key disabled' : 'Key enabled')}><Power size={14} /></IconBtn>
                        <IconBtn title="Delete" disabled={working} danger onClick={() => { if (window.confirm(`Delete ${k.label}?`)) run(k.id, () => adminAPI.deleteGroqKey(k.id), 'Key deleted'); }}><Trash2 size={14} /></IconBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-white/25 text-[11px] flex items-center gap-1.5"><Activity size={12} /> Live health refreshes every 10 seconds.</p>
    </div>
  );
}

function IconBtn({ children, title, onClick, disabled, danger }) {
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled} className={`w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 hover:bg-white/10 disabled:opacity-50 ${danger ? 'text-red-300/70 hover:text-red-300' : 'text-white/50 hover:text-white'}`}>
      {children}
    </button>
  );
}
