import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle, CheckCircle2, Clock, Eye, Globe, HelpCircle, Loader2, MessageCircle, RefreshCw,
  RotateCcw, Send, Settings2, ShieldCheck, Users, Wallet, XCircle, BadgeCheck,
} from 'lucide-react';
import { toast } from 'sonner';

import { adminAPI } from '../../../api/admin';
import { describeStat } from './whatsappStats';

const METRIC_ICONS = {
  pending_verifications: <ShieldCheck size={20} />,
  pending_payouts: <Wallet size={20} />,
  subscriptions: <Users size={20} />,
  bought_websites: <Globe size={20} />,
};

const STATUS_STYLES = {
  sent: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  pending: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  sending: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  failed: 'bg-red-500/15 text-red-400 border-red-500/30',
  unconfirmed: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  skipped: 'bg-white/5 text-white/40 border-white/10',
};

const TYPE_LABELS = {
  SUBSCRIPTION_PURCHASED: 'New subscription', SUBSCRIPTION_RENEWED: 'Subscription renewal',
  WEBSITE_PURCHASED: 'Website purchase', ADMIN_REPORT: 'Admin report', WHATSAPP_TEST: 'Test message',
};

const CATEGORY_LABELS = {
  subscription: 'New subscriptions', renewal: 'Renewals', websitePurchase: 'Website purchases', adminReport: 'Admin reports',
};

const errMessage = (e, fallback) => e?.response?.data?.message || fallback;

function Pill({ ok, label }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] border ${ok ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-red-500/15 text-red-400 border-red-500/30'}`}>
      {ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}{label}
    </span>
  );
}

function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-40 ${checked ? 'bg-[#8b7355]' : 'bg-white/10'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

function ReportsTab({ overview, canSend }) {
  const metrics = overview.metrics;
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [selected, setSelected] = useState([]);
  const [preview, setPreview] = useState(null); // { message, token, forKey }
  const [busy, setBusy] = useState(null); // 'preview' | 'send'

  const key = useMemo(() => [...selected].sort().join(','), [selected]);
  const previewIsCurrent = preview && preview.forKey === key;

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try { setStats((await adminAPI.getWhatsAppReportStats()).data.data.stats); }
    catch (e) { toast.error(errMessage(e, 'Could not load statistics')); }
    finally { setLoadingStats(false); }
  }, []);
  useEffect(() => { loadStats(); }, [loadStats]);

  const toggle = (id) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const runPreview = async () => {
    setBusy('preview');
    try {
      const data = (await adminAPI.previewWhatsAppReport(selected)).data.data;
      setPreview({ message: data.message, token: data.previewToken, forKey: key });
    } catch (e) { toast.error(errMessage(e, 'Could not build the preview')); }
    finally { setBusy(null); }
  };

  const runSend = async () => {
    if (!previewIsCurrent) { // never send blind: show the exact text first
      await runPreview();
      toast.info('Review the message, then press Send again.');
      return;
    }
    setBusy('send');
    try {
      const res = await adminAPI.sendWhatsAppReport(selected, preview.token);
      toast.success(res.data.message || 'Report queued');
      setPreview(null);
    } catch (e) {
      toast.error(errMessage(e, 'Could not send the report'));
      if (e?.response?.data?.code === 'PREVIEW_EXPIRED') setPreview(null);
    } finally { setBusy(null); }
  };

  const none = selected.length === 0;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/40">Choose what to include. Numbers are live from the database.</p>
        <div className="flex gap-2">
          <button onClick={() => setSelected(metrics.map((m) => m.id))} className="px-4 py-2 rounded-xl border border-white/10 text-white/60 text-[11px] font-bold uppercase tracking-[0.1em] hover:bg-white/5">Select all</button>
          <button onClick={() => setSelected([])} disabled={none} className="px-4 py-2 rounded-xl border border-white/10 text-white/60 text-[11px] font-bold uppercase tracking-[0.1em] hover:bg-white/5 disabled:opacity-40">Clear selection</button>
          <button onClick={loadStats} aria-label="Refresh numbers" className="p-2 rounded-xl border border-white/10 text-white/60 hover:bg-white/5"><RefreshCw size={14} className={loadingStats ? 'animate-spin' : ''} /></button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {metrics.map((m) => {
          const on = selected.includes(m.id);
          return (
            <button key={m.id} type="button" aria-pressed={on} onClick={() => toggle(m.id)}
              className={`text-left rounded-[28px] border p-6 transition-all ${on ? 'border-[#8b7355] bg-[#8b7355]/10 shadow-[0_0_30px_rgba(139,115,85,0.15)]' : 'border-white/10 bg-white/[0.03] hover:border-white/20'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${on ? 'bg-[#8b7355] text-white' : 'bg-[#8b7355]/10 text-[#8b7355]'}`}>{METRIC_ICONS[m.id]}</div>
                <span className={`w-6 h-6 rounded-lg border flex items-center justify-center ${on ? 'bg-[#8b7355] border-[#8b7355] text-white' : 'border-white/20'}`}>{on && <CheckCircle2 size={14} />}</span>
              </div>
              <h3 className="mt-5 text-base font-black tracking-tight text-white">{m.label}</h3>
              <p className="text-xs text-white/40 mt-1">{m.description}</p>
              <p className="mt-4 text-sm font-bold text-[#c9b08a]">{loadingStats ? <Loader2 size={14} className="animate-spin" /> : describeStat(m.id, stats?.[m.id])}</p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button onClick={runPreview} disabled={none || busy !== null} className="flex-1 flex items-center justify-center gap-2 px-5 py-4 rounded-2xl border border-white/15 text-white text-xs font-black uppercase tracking-[0.1em] hover:bg-white/5 disabled:opacity-40">
          {busy === 'preview' ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />} Preview report
        </button>
        <button onClick={runSend} disabled={none || busy !== null || !canSend} className="flex-1 flex items-center justify-center gap-2 px-5 py-4 rounded-2xl bg-[#8b7355] text-white text-xs font-black uppercase tracking-[0.1em] hover:bg-[#a08766] disabled:opacity-40">
          {busy === 'send' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send WhatsApp report
        </button>
      </div>
      {!canSend && <p className="text-xs text-amber-400 flex items-center gap-2"><AlertTriangle size={14} /> Sending is unavailable: switch notifications on and finish the server credentials first.</p>}

      {preview && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-black uppercase tracking-[0.15em] text-white/50">Exact message{previewIsCurrent ? '' : ' (selection changed - preview again)'}</h4>
            <span className="text-[10px] text-white/30">Valid for 10 minutes</span>
          </div>
          <pre data-testid="whatsapp-preview" className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white/80 bg-[#0d1f17] border border-emerald-900/40 rounded-2xl p-5 font-sans">{preview.message}</pre>
        </motion.div>
      )}
    </div>
  );
}

function HistoryTab() {
  const [filter, setFilter] = useState('');
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData((await adminAPI.getWhatsAppNotifications({ status: filter, page })).data.data); }
    catch (e) { toast.error(errMessage(e, 'Could not load history')); }
    finally { setLoading(false); }
  }, [filter, page]);
  useEffect(() => { load(); }, [load]);

  const retry = async (n) => {
    if (n.retryMayDuplicate && !window.confirm('Delivery of this message could not be confirmed. Retrying may send a duplicate. Retry anyway?')) return;
    setRetrying(n.id);
    try { await adminAPI.retryWhatsAppNotification(n.id); toast.success('Re-queued'); await load(); }
    catch (e) { toast.error(errMessage(e, 'Could not retry')); }
    finally { setRetrying(null); }
  };

  const FILTERS = [['', 'All'], ['failed', 'Failed'], ['unconfirmed', 'Unconfirmed'], ['pending,sending', 'In progress'], ['sent', 'Sent'], ['skipped', 'Skipped']];
  const counts = data?.counts || {};
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(([value, label]) => (
          <button key={label} onClick={() => { setFilter(value); setPage(1); }} className={`px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-[0.1em] border ${filter === value ? 'bg-[#8b7355] border-[#8b7355] text-white' : 'border-white/10 text-white/50 hover:bg-white/5'}`}>
            {label}{value === 'failed' && counts.failed ? ` (${counts.failed})` : ''}{value === 'unconfirmed' && counts.unconfirmed ? ` (${counts.unconfirmed})` : ''}
          </button>
        ))}
        <button onClick={load} aria-label="Refresh history" className="ml-auto p-2 rounded-xl border border-white/10 text-white/60 hover:bg-white/5"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <div className="rounded-[28px] border border-white/10 bg-white/[0.03] overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[10px] uppercase tracking-[0.15em] text-white/30">
            {['Event', 'Status', 'Attempts', 'Created', 'Details', ''].map((h) => <th key={h} className="px-5 py-4 font-bold">{h}</th>)}
          </tr></thead>
          <tbody>
            {loading && !data && <tr><td colSpan={6} className="px-5 py-10 text-center text-white/40"><Loader2 className="animate-spin inline" size={18} /></td></tr>}
            {data?.notifications.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-white/30">No notifications yet.</td></tr>}
            {data?.notifications.map((n) => (
              <tr key={n.id} className="border-t border-white/5 align-top">
                <td className="px-5 py-4"><div className="font-bold text-white">{TYPE_LABELS[n.type] || n.type}</div><div className="text-xs text-white/40">{n.summary || '—'}</div></td>
                <td className="px-5 py-4"><span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.1em] border ${STATUS_STYLES[n.status]}`}>{n.status}</span></td>
                <td className="px-5 py-4 text-white/60">{n.attempts}{n.manualRetries ? ` (+${n.manualRetries} manual)` : ''}</td>
                <td className="px-5 py-4 text-white/50 whitespace-nowrap">{new Date(n.createdAt).toLocaleString()}</td>
                <td className="px-5 py-4 text-xs text-white/50 max-w-xs">
                  {n.failure ? <span className="text-red-300/80">{n.failure.message}</span> : n.skippedReason ? `Skipped: ${n.skippedReason.replace(/_/g, ' ')}` : n.sentAt ? `Delivered to API ${new Date(n.sentAt).toLocaleTimeString()}` : '—'}
                </td>
                <td className="px-5 py-4 text-right">
                  {n.canRetry && (
                    <button onClick={() => retry(n)} disabled={retrying === n.id} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-500/30 text-amber-400 text-[11px] font-black uppercase tracking-[0.1em] hover:bg-amber-500/10 disabled:opacity-50">
                      {retrying === n.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Retry
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-xs text-white/50">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-2 rounded-lg border border-white/10 disabled:opacity-30">Prev</button>
          Page {page} of {data.pagination.pages}
          <button disabled={page >= data.pagination.pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-2 rounded-lg border border-white/10 disabled:opacity-30">Next</button>
        </div>
      )}
    </div>
  );
}

function SettingsTab({ overview, onChanged }) {
  const { config, settings } = overview;
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const save = async (patch) => {
    setSaving(true);
    try { await adminAPI.updateWhatsAppSettings(patch); await onChanged(); toast.success('Settings saved'); }
    catch (e) { toast.error(errMessage(e, 'Could not save settings')); }
    finally { setSaving(false); }
  };
  const test = async () => {
    setTesting(true);
    try { toast.success((await adminAPI.sendWhatsAppTest()).data.message || 'Test queued'); }
    catch (e) { toast.error(errMessage(e, 'Could not queue the test')); }
    finally { setTesting(false); }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 space-y-5">
        <h3 className="text-base font-black text-white">Notifications</h3>
        <div className="flex items-center justify-between gap-4">
          <div><p className="text-sm font-bold text-white">Send admin notifications</p><p className="text-xs text-white/40">Turning this off never affects purchases, payouts or checkout.</p></div>
          <Toggle checked={settings.enabled} onChange={(v) => save({ enabled: v })} disabled={saving} label="Enable WhatsApp notifications" />
        </div>
        <div className="border-t border-white/5 pt-4 space-y-4">
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between"><span className="text-sm text-white/70">{label}</span>
              <Toggle checked={settings.categories[key]} onChange={(v) => save({ categories: { [key]: v } })} disabled={saving || !settings.enabled} label={label} /></div>
          ))}
        </div>
      </div>

      <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 space-y-5">
        <h3 className="text-base font-black text-white">Connection</h3>
        <div className="flex flex-wrap gap-2">
          <Pill ok={config.masterEnabled} label={config.masterEnabled ? 'Server switch on' : 'Server switch off'} />
          <Pill ok={config.configured} label={config.configured ? 'Credentials set' : 'Credentials missing'} />
        </div>
        <dl className="text-sm space-y-2">
          <div className="flex justify-between"><dt className="text-white/40">Recipient (admin)</dt><dd className="text-white/80 font-mono">{config.recipient || 'Not set'}</dd></div>
          <div className="flex justify-between"><dt className="text-white/40">Graph API</dt><dd className="text-white/80 font-mono">{config.graphApiVersion}</dd></div>
        </dl>
        <p className="text-xs text-white/40 leading-relaxed">Credentials live in the server environment only (WHATSAPP_* variables). With Meta&apos;s test number, the recipient must be a verified number and must have messaged the business number in the last 24 hours.</p>
        <button onClick={test} disabled={testing || !config.masterEnabled || !config.configured} className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#8b7355] text-white text-xs font-black uppercase tracking-[0.1em] hover:bg-[#a08766] disabled:opacity-40">
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send test notification
        </button>
      </div>
    </div>
  );
}

export default function WhatsAppSection() {
  const [tab, setTab] = useState('reports');
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try { setOverview((await adminAPI.getWhatsAppOverview()).data.data); setError(null); }
    catch (e) { setError(errMessage(e, 'Could not load WhatsApp settings')); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="rounded-[28px] border border-red-500/30 bg-red-500/10 p-6 text-red-300 text-sm flex items-center gap-3"><XCircle size={18} />{error}<button onClick={load} className="ml-auto underline">Retry</button></div>;
  if (!overview) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#8b7355]" size={32} /></div>;

  const canSend = overview.config.masterEnabled && overview.config.configured && overview.settings.enabled && overview.settings.categories.adminReport;
  const TABS = [['reports', 'WhatsApp Admin Reports', <MessageCircle key="r" size={14} />], ['history', 'Delivery history', <Clock key="h" size={14} />], ['settings', 'Settings', <Settings2 key="s" size={14} />]];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-3"><BadgeCheck className="text-[#8b7355]" size={24} /> WhatsApp Admin Reports</h2>
          <p className="text-sm text-white/40 mt-1">Alerts and summaries go only to your configured admin number.</p>
        </div>
        <div className="flex gap-2"><Pill ok={overview.config.masterEnabled && overview.settings.enabled} label={overview.config.masterEnabled && overview.settings.enabled ? 'Notifications on' : 'Notifications off'} />
          {!overview.config.configured && <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] bg-amber-500/15 text-amber-400 border border-amber-500/30"><HelpCircle size={12} /> Setup needed</span>}</div>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {TABS.map(([id, label, icon]) => (
          <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-2 px-5 py-3 rounded-[16px] text-xs font-bold uppercase tracking-[0.1em] whitespace-nowrap ${tab === id ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white hover:bg-white/5'}`}>{icon}{label}</button>
        ))}
      </div>

      {tab === 'reports' && <ReportsTab overview={overview} canSend={canSend} />}
      {tab === 'history' && <HistoryTab />}
      {tab === 'settings' && <SettingsTab overview={overview} onChanged={load} />}
    </div>
  );
}
