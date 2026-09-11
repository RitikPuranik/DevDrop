import { useEffect, useState } from 'react';
import { Loader2, KeyRound, Plus, RefreshCcw, Power, Trash2, FlaskConical, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';

import { adminAPI } from '../../../api/admin';

const initialForm = { label: '', apiKey: '' };

const STATUS_TONE = {
  healthy: 'text-emerald-300 border-emerald-500/20 bg-emerald-500/10',
  busy: 'text-blue-300 border-blue-500/20 bg-blue-500/10',
  rate_limited: 'text-amber-300 border-amber-500/20 bg-amber-500/10',
  degraded: 'text-amber-300 border-amber-500/20 bg-amber-500/10',
  invalid: 'text-red-300 border-red-500/20 bg-red-500/10',
  disabled: 'text-white/40 border-white/10 bg-white/5',
};

const STATUS_LABEL = {
  healthy: 'Healthy',
  busy: 'Busy',
  rate_limited: 'Rate limited',
  degraded: 'Degraded',
  invalid: 'Invalid',
  disabled: 'Disabled',
};

function statusFor(key) {
  if (!key.enabled) return 'disabled';
  if (key.isCoolingDown && key.status !== 'invalid') return 'rate_limited';
  return key.status || 'healthy';
}

function formatDate(value) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

function secondsUntil(value) {
  if (!value) return 0;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 1000));
}

export default function GeminiPoolSection() {
  const [keys, setKeys] = useState([]);
  const [poolStatus, setPoolStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [showForm, setShowForm] = useState(false);

  const load = async ({ silent = false } = {}) => {
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
  };

  useEffect(() => {
    load();
    // Poll so cooldowns/health update without the admin having to refresh
    // manually — this is display-only and doesn't affect selection.
    const interval = setInterval(() => load({ silent: true }), 15000);
    return () => clearInterval(interval);
  }, []);

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

  const handleTest = async (key) => {
    try {
      setTestingId(key.id);
      const res = await adminAPI.testGeminiKey(key.id);
      const result = res.data?.data;
      if (result?.valid) toast.success(`${key.label}: key is valid`);
      else toast.error(`${key.label}: ${result?.message || 'test failed'}`);
      await load({ silent: true });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to test the key');
    } finally {
      setTestingId(null);
    }
  };

  const handleReorder = async (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= keys.length) return;
    const reordered = [...keys];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    setKeys(reordered); // optimistic
    try {
      await adminAPI.reorderGeminiKeys(reordered.map((k) => k.id));
      await load({ silent: true });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to reorder keys');
      await load({ silent: true });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-[#8b7355]" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pool health overview */}
      <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-2xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <KeyRound className="text-[#8b7355]" size={20} />
            <h2 className="text-lg font-black tracking-tight">Gemini API Pool</h2>
          </div>
          <div className="flex items-center gap-3">
            {refreshing && <Loader2 className="animate-spin text-white/30" size={16} />}
            <button
              onClick={() => load({ silent: true })}
              className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 text-xs font-bold uppercase tracking-[0.1em] text-white/60 hover:text-white hover:bg-white/5"
            >
              <RefreshCcw size={14} /> Refresh
            </button>
            <button
              onClick={() => setShowForm((s) => !s)}
              className="flex items-center gap-2 px-5 py-2 rounded-full bg-[#8b7355] text-white text-xs font-bold uppercase tracking-[0.1em]"
            >
              <Plus size={14} /> Add API Key
            </button>
          </div>
        </div>

        {!poolStatus?.aiServiceReachable && (
          <div className="mb-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
            ai-service isn't reachable right now — showing saved key config only; live health/queue numbers are unavailable.
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
          <StatBox label="Active Keys" value={poolStatus?.enabledKeys ?? '—'} />
          <StatBox label="Healthy" value={poolStatus?.healthyKeys ?? '—'} />
          <StatBox label="Rate Limited" value={poolStatus?.rateLimitedKeys ?? '—'} />
          <StatBox label="Invalid" value={poolStatus?.invalidKeys ?? '—'} />
          <StatBox label="Active Requests" value={poolStatus?.activeRequests ?? '—'} />
          <StatBox label="Global Concurrency" value={poolStatus?.globalConcurrency ?? '—'} />
          <StatBox label="Per-Key Concurrency" value={poolStatus?.perKeyConcurrency ?? 'Unlimited'} />
          <StatBox
            label="Pool Health"
            value={poolStatus?.hasAvailableKey === false ? 'No key available' : 'Healthy'}
            tone={poolStatus?.hasAvailableKey === false ? 'text-red-300' : 'text-emerald-300'}
          />
        </div>
      </div>

      {/* Add key form */}
      {showForm && (
        <form
          onSubmit={handleAddKey}
          className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6 space-y-4 backdrop-blur-2xl"
        >
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-[0.1em] text-white/40 mb-2">Label</label>
              <input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Primary AI"
                className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-[#8b7355]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-[0.1em] text-white/40 mb-2">Gemini API Key</label>
              <input
                value={form.apiKey}
                onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                placeholder="AIza..."
                type="password"
                className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-sm focus:outline-none focus:border-[#8b7355]"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-3 rounded-full bg-[#8b7355] text-white text-xs font-bold uppercase tracking-[0.1em] disabled:opacity-50"
            >
              {submitting ? 'Adding…' : 'Save Key'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setForm(initialForm); }}
              className="px-6 py-3 rounded-full border border-white/10 text-xs font-bold uppercase tracking-[0.1em] text-white/60"
            >
              Cancel
            </button>
          </div>
          <p className="text-[11px] text-white/30">
            The raw key is encrypted at rest and never shown again after saving — only a masked form (e.g. AIza...7xP2).
          </p>
        </form>
      )}

      {/* Key list */}
      <div className="space-y-3">
        {keys.length === 0 && (
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-8 text-center text-white/40 text-sm">
            No Gemini API keys configured yet. Add one above, or set GEMINI_API_KEY in ai-service/.env as a fallback.
          </div>
        )}

        {keys.map((key, index) => {
          const status = statusFor(key);
          const tone = STATUS_TONE[status] || STATUS_TONE.healthy;
          return (
            <div key={key.id} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 backdrop-blur-2xl">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm">{key.label}</h3>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${tone}`}>
                      ● {STATUS_LABEL[status] || status}
                    </span>
                  </div>
                  <p className="text-white/40 text-xs mt-1 font-mono">{key.maskedKey}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleReorder(index, -1)}
                    disabled={index === 0}
                    title="Move up in priority"
                    className="p-2 rounded-full border border-white/10 text-white/50 hover:text-white hover:bg-white/5 disabled:opacity-20"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    onClick={() => handleReorder(index, 1)}
                    disabled={index === keys.length - 1}
                    title="Move down in priority"
                    className="p-2 rounded-full border border-white/10 text-white/50 hover:text-white hover:bg-white/5 disabled:opacity-20"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    onClick={() => handleTest(key)}
                    disabled={testingId === key.id}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-white/10 text-xs font-bold uppercase tracking-wider text-white/60 hover:text-white hover:bg-white/5"
                  >
                    {testingId === key.id ? <Loader2 className="animate-spin" size={12} /> : <FlaskConical size={12} />}
                    Test
                  </button>
                  <button
                    onClick={() => handleToggle(key)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-white/10 text-xs font-bold uppercase tracking-wider text-white/60 hover:text-white hover:bg-white/5"
                  >
                    <Power size={12} /> {key.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => handleDelete(key)}
                    className="p-2 rounded-full border border-red-500/20 text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                <MiniStat label="Priority" value={key.priority} />
                <MiniStat label="Requests" value={key.totalRequests} />
                <MiniStat label="Successes" value={key.totalSuccesses} />
                <MiniStat label="Failures" value={key.totalFailures} />
                <MiniStat
                  label="Cooldown"
                  value={key.isCoolingDown ? `${secondsUntil(key.cooldownUntil)}s` : '—'}
                />
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-[11px] text-white/30">
                <span>Last success: {formatDate(key.lastSuccessAt)}</span>
                <span>Last failure: {formatDate(key.lastFailureAt)}</span>
                {key.lastErrorMessage && (
                  <span className="text-amber-300/70">Last error: {key.lastErrorMessage}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatBox({ label, value, tone = 'text-white' }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/30 mb-1">{label}</p>
      <p className={`text-lg font-black ${tone}`}>{value}</p>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div>
      <p className="text-white/30 uppercase tracking-wider text-[10px] font-bold mb-0.5">{label}</p>
      <p className="text-white/80 font-bold">{value}</p>
    </div>
  );
}
