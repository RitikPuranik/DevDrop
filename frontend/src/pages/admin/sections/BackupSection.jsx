import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  Database,
  DatabaseBackup,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { adminAPI } from '../../../api/admin';

function StatusPill({ ok, label }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] ${
        ok ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/15 text-red-400 border border-red-500/30'
      }`}
    >
      {ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
      {label}
    </span>
  );
}

function ConfirmModal({ open, title, description, confirmLabel, danger, onClose, onConfirm, loading }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-[#141414] rounded-[28px] border border-white/10 shadow-2xl w-full max-w-md p-7"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${danger ? 'bg-red-500/15 text-red-400' : 'bg-[#8b7355]/15 text-[#8b7355]'}`}>
            <ShieldAlert size={18} />
          </div>
          <h3 className="text-lg font-black tracking-tight text-white">{title}</h3>
        </div>
        <p className="text-sm text-white/50 leading-relaxed mb-7">{description}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-5 py-2.5 text-xs rounded-xl border border-white/10 text-white/50 hover:bg-white/5 transition-colors font-bold uppercase tracking-[0.1em] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-5 py-2.5 text-xs rounded-xl font-black uppercase tracking-[0.1em] transition-colors disabled:opacity-60 ${
              danger ? 'bg-red-500 text-white hover:bg-red-400' : 'bg-[#8b7355] text-white hover:bg-[#a08766]'
            }`}
          >
            {loading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function ActionCard({ icon, title, description, primaryLabel, secondaryLabel, onPrimary, onSecondary, disabled }) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-md hover:border-white/20 transition-all">
      <div className="flex items-start gap-4 mb-5">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-[#8b7355] bg-[#8b7355]/10 shrink-0">
          {icon}
        </div>
        <div>
          <h3 className="text-base font-black tracking-tight text-white mb-1">{title}</h3>
          <p className="text-xs text-white/40 leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={onPrimary}
          disabled={disabled}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#8b7355] text-white text-xs font-black uppercase tracking-[0.1em] hover:bg-[#a08766] transition-colors disabled:opacity-50"
        >
          <CloudUpload size={14} /> {primaryLabel}
        </button>
        <button
          onClick={onSecondary}
          disabled={disabled}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-amber-500/30 text-amber-400 text-xs font-black uppercase tracking-[0.1em] hover:bg-amber-500/10 transition-colors disabled:opacity-50"
        >
          <RotateCcw size={14} /> {secondaryLabel}
        </button>
      </div>
    </div>
  );
}

const STATUS_BADGE_STYLES = {
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  partial: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  failed: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const summarizeLog = (log) => {
  const s = log.summary || {};

  if (log.type === 'mongo') {
    const count = Object.keys(s.collections || {}).length;
    return count ? `${count} collection${count === 1 ? '' : 's'} synced` : '—';
  }

  if (log.type === 'supabase') {
    const parts = [];
    if (typeof s.copied === 'number') parts.push(`${s.copied} copied`);
    if (typeof s.skipped === 'number' && s.skipped > 0) parts.push(`${s.skipped} unchanged`);
    if (typeof s.deleted === 'number' && s.deleted > 0) parts.push(`${s.deleted} cleaned up`);
    if (s.failed?.length) parts.push(`${s.failed.length} failed`);
    return parts.length ? parts.join(' · ') : '—';
  }

  if (log.type === 'full') {
    const parts = [];
    if (s.mongo) parts.push(s.mongo.success === false ? 'Mongo failed' : 'Mongo OK');
    if (s.supabase) {
      if (s.supabase.success === false) {
        parts.push('Storage failed');
      } else {
        const bits = [];
        if (typeof s.supabase.copied === 'number') bits.push(`${s.supabase.copied} copied`);
        if (typeof s.supabase.deleted === 'number' && s.supabase.deleted > 0) bits.push(`${s.supabase.deleted} cleaned up`);
        parts.push(`Storage: ${bits.join(', ') || 'OK'}`);
      }
    }
    return parts.join(' · ') || '—';
  }

  return '—';
};

export default function BackupSection() {
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // { type, direction, label }

  const loadAll = async () => {
    try {
      const [statusRes, historyRes] = await Promise.all([
        adminAPI.getBackupStatus(),
        adminAPI.getBackupHistory(20),
      ]);
      setStatus(statusRes.data?.data || null);
      setHistory(historyRes.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load backup status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const runAction = async () => {
    if (!confirmAction) return;
    setActionLoading(true);

    try {
      const { type, direction } = confirmAction;
      let res;
      if (type === 'mongo') res = await adminAPI.backupMongo(direction);
      else if (type === 'supabase') res = await adminAPI.backupSupabase(direction);
      else res = await adminAPI.backupFull(direction);

      toast.success(res.data?.message || 'Operation completed');
      setConfirmAction(null);
      await loadAll();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Operation failed');
    } finally {
      setActionLoading(false);
    }
  };

  const mongoConfigured = status?.configured?.mongoConfigured;
  const supabaseConfigured = status?.configured?.supabaseConfigured;
  const mainMongoOk = status?.connections?.main?.mongo?.ok;
  const backupMongoOk = status?.connections?.backup?.mongo?.ok;
  const mainSupabaseOk = status?.connections?.main?.supabase?.ok;
  const backupSupabaseOk = status?.connections?.backup?.supabase?.ok;

  if (loading) {
    return (
      <div className="py-20 flex items-center justify-center text-white/30">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(139,115,85,0.28),_transparent_38%),linear-gradient(180deg,_rgba(255,255,255,0.04),_rgba(255,255,255,0.02))] p-6 md:p-10 backdrop-blur-2xl"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-[0.25em] text-white/40 mb-5">
              <DatabaseBackup size={12} /> Backup & Restore
            </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-none mb-3">Disaster Recovery</h1>
            <p className="text-white/45 max-w-lg leading-relaxed text-sm">
              Mirror MongoDB + Supabase storage to your backup credentials, or restore from them.
              {status?.schedule?.label && (
                <> Automatic backup runs: <span className="text-white/70 font-semibold">{status.schedule.label}</span>.</>
              )}
            </p>
          </div>
          <button
            onClick={loadAll}
            className="w-full sm:w-auto flex justify-center items-center gap-2 px-5 py-3 rounded-2xl border border-white/10 text-xs text-white/50 hover:text-white hover:bg-white/5 font-bold uppercase tracking-[0.1em] transition-all"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </motion.div>

      {!mongoConfigured && !supabaseConfigured && (
        <div className="rounded-[24px] border border-amber-500/30 bg-amber-500/10 p-5 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-200/80 leading-relaxed">
            No backup credentials configured yet. Add <code className="text-amber-300">BACKUP_MONGODB_URI</code> and/or{' '}
            <code className="text-amber-300">BACKUP_SUPABASE_URL</code> / <code className="text-amber-300">BACKUP_SUPABASE_SERVICE_ROLE_KEY</code> to
            your backend environment variables, then redeploy.
          </p>
        </div>
      )}

      <div className="rounded-[32px] border border-white/10 bg-[#0f0f0f] p-6 md:p-8">
        <p className="text-[10px] uppercase tracking-[0.3em] text-[#8b7355] font-bold mb-5">Connection Status</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">Main MongoDB</p>
              <p className="text-xs text-white/30 mt-0.5">Live application database</p>
            </div>
            <StatusPill ok={mainMongoOk} label={mainMongoOk ? 'Connected' : 'Unreachable'} />
          </div>
          <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">Backup MongoDB</p>
              <p className="text-xs text-white/30 mt-0.5">{mongoConfigured ? 'Configured' : 'Not configured'}</p>
            </div>
            <StatusPill ok={backupMongoOk} label={backupMongoOk ? 'Connected' : 'Unreachable'} />
          </div>
          <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">Main Supabase</p>
              <p className="text-xs text-white/30 mt-0.5">Live file storage</p>
            </div>
            <StatusPill ok={mainSupabaseOk} label={mainSupabaseOk ? 'Connected' : 'Unreachable'} />
          </div>
          <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">Backup Supabase</p>
              <p className="text-xs text-white/30 mt-0.5">{supabaseConfigured ? 'Configured' : 'Not configured'}</p>
            </div>
            <StatusPill ok={backupSupabaseOk} label={backupSupabaseOk ? 'Connected' : 'Unreachable'} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <ActionCard
          icon={<DatabaseBackup size={18} />}
          title="Full Backup"
          description="MongoDB + Supabase storage together — the recommended option for everyday use."
          primaryLabel="Backup Now"
          secondaryLabel="Restore"
          disabled={actionLoading}
          onPrimary={() => setConfirmAction({ type: 'full', direction: 'main_to_backup', label: 'Run a full backup', description: 'This copies your MongoDB data and Supabase files from MAIN to your BACKUP credentials, overwriting whatever is currently in the backup.', confirmLabel: 'Backup Now' })}
          onSecondary={() => setConfirmAction({ type: 'full', direction: 'backup_to_main', label: 'Restore from backup', description: 'This will OVERWRITE your live MongoDB data and Supabase files with whatever is currently stored in your BACKUP credentials. This cannot be undone.', confirmLabel: 'Restore Now', danger: true })}
        />
        <ActionCard
          icon={<Database size={18} />}
          title="MongoDB Only"
          description="Mirror just the database collections, leaving Supabase files untouched."
          primaryLabel="Backup Now"
          secondaryLabel="Restore"
          disabled={actionLoading}
          onPrimary={() => setConfirmAction({ type: 'mongo', direction: 'main_to_backup', label: 'Backup MongoDB', description: 'Copies all collections from the MAIN database into the BACKUP database, replacing its contents.', confirmLabel: 'Backup Now' })}
          onSecondary={() => setConfirmAction({ type: 'mongo', direction: 'backup_to_main', label: 'Restore MongoDB', description: 'Overwrites your LIVE MongoDB database with the contents of the BACKUP database. This cannot be undone.', confirmLabel: 'Restore Now', danger: true })}
        />
        <ActionCard
          icon={<CloudUpload size={18} />}
          title="Supabase Storage Only"
          description="Mirror uploaded files (source code, docs, videos, avatars) without touching MongoDB."
          primaryLabel="Backup Now"
          secondaryLabel="Restore"
          disabled={actionLoading}
          onPrimary={() => setConfirmAction({ type: 'supabase', direction: 'main_to_backup', label: 'Backup Supabase storage', description: 'Copies every file from the MAIN Supabase bucket into the BACKUP bucket.', confirmLabel: 'Backup Now' })}
          onSecondary={() => setConfirmAction({ type: 'supabase', direction: 'backup_to_main', label: 'Restore Supabase storage', description: 'Copies every file from the BACKUP Supabase bucket back into the LIVE bucket, overwriting files with the same path.', confirmLabel: 'Restore Now', danger: true })}
        />
      </div>

      <div className="rounded-[32px] border border-white/10 bg-[#0f0f0f] shadow-2xl shadow-black/30 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <History size={16} className="text-[#8b7355]" />
            <h2 className="text-xl font-black tracking-tight">Recent Activity</h2>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {['Type', 'Direction', 'Trigger', 'Status', 'Details', 'Duration', 'When'].map((heading) => (
                  <th key={heading} className="text-left text-[10px] font-bold text-white/25 uppercase tracking-[0.2em] px-6 py-4">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-20">
                    <div className="flex flex-col items-center gap-3 text-white/20">
                      <History size={36} />
                      <span className="text-sm">No backup runs yet</span>
                    </div>
                  </td>
                </tr>
              )}
              {history.map((log) => (
                <tr key={log._id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 text-sm text-white/70 capitalize">{log.type}</td>
                  <td className="px-6 py-4 text-sm text-white/50">
                    {log.direction === 'backup_to_main' ? 'Backup → Main' : 'Main → Backup'}
                  </td>
                  <td className="px-6 py-4 text-sm text-white/50 capitalize">{log.trigger}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.1em] border ${STATUS_BADGE_STYLES[log.status] || ''}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-white/40">{summarizeLog(log)}</td>
                  <td className="px-6 py-4 text-sm text-white/40">{log.durationMs ? `${(log.durationMs / 1000).toFixed(1)}s` : '—'}</td>
                  <td className="px-6 py-4 text-sm text-white/40 whitespace-nowrap">
                    {log.createdAt ? new Date(log.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        open={!!confirmAction}
        title={confirmAction?.label}
        description={confirmAction?.description}
        confirmLabel={confirmAction?.confirmLabel}
        danger={confirmAction?.danger}
        loading={actionLoading}
        onClose={() => setConfirmAction(null)}
        onConfirm={runAction}
      />
    </div>
  );
}
