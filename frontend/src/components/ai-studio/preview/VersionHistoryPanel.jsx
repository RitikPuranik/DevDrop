import React, { useCallback, useEffect, useState } from 'react';
import { GitBranch, Loader2, RotateCcw } from 'lucide-react';

const SOURCE_LABEL = { generate: 'Generated', edit: 'Edited', sync: 'Saved' };

function formatWhen(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * Lists every saved snapshot of the project (newest first) and lets the
 * user select any of them. Selecting never creates or deletes a version; it
 * just moves the "selected" marker. Editing from an older version records
 * "Edited from vN" on the new version.
 */
export default function VersionHistoryPanel({ projectId, refreshKey, disabled, onList, onRestore }) {
  const [versions, setVersions] = useState([]);
  const [currentVersion, setCurrentVersion] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyVersion, setBusyVersion] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await onList();
      setVersions(data?.data?.versions || []);
      setCurrentVersion(data?.data?.currentVersion ?? null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load version history.');
    } finally {
      setLoading(false);
    }
  }, [projectId, onList]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const handleRestore = async (v) => {
    if (disabled || busyVersion) return;
    setBusyVersion(v.version);
    setError(null);
    try {
      await onRestore(v.version);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Restore failed.');
    } finally {
      setBusyVersion(null);
    }
  };

  return (
    <div className="absolute right-0 z-30 mt-2 max-h-80 w-80 overflow-y-auto rounded-xl border border-white/[0.12] bg-[#0b0b0c] p-2 shadow-2xl">
      {loading && versions.length === 0 && (
        <p className="flex items-center gap-2 px-2 py-1.5 text-xs text-white/40"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</p>
      )}
      {!loading && versions.length === 0 && !error && (
        <p className="px-2 py-1.5 text-xs text-white/40">No saved versions yet. One is saved after every generation or edit.</p>
      )}
      {error && <p className="px-2 py-1.5 text-xs text-red-300">{error}</p>}
      {versions.map((v) => (
        <div key={v.version} className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-2 py-2 last:border-0">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-medium text-white/85">
              <GitBranch className="h-3 w-3 text-violet-300" /> v{v.version} · {SOURCE_LABEL[v.source] || 'Saved'}
              {v.version === currentVersion && <span className="rounded bg-emerald-500/15 px-1.5 text-[10px] text-emerald-300">selected</span>}
            </p>
            {v.basedOnVersion && v.basedOnVersion !== v.version - 1 && (
              <p className="text-[11px] text-violet-300/80">Edited from v{v.basedOnVersion}</p>
            )}
            <p className="truncate text-[11px] text-white/45">
              {formatWhen(v.createdAt)} · {v.fileCount} files{v.label ? ` · ${v.label}` : ''}
            </p>
          </div>
          {v.version !== currentVersion && (
            <button
              onClick={() => handleRestore(v)}
              disabled={disabled || busyVersion !== null}
              title={disabled ? 'Wait for the current generation to finish' : `Switch to version ${v.version}`}
              className="flex shrink-0 items-center gap-1 rounded-md border border-white/[0.12] px-2 py-1 text-[11px] text-white/75 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busyVersion === v.version ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Select
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
