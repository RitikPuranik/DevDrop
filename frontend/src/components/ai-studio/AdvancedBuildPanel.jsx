import React from 'react';
import { FileText, Layers, Wrench, ShieldCheck, LockKeyhole } from 'lucide-react';

const LAYER_LABEL = { structural: 'Structure', build: 'Build', functional: 'Functionality', responsive: 'Responsive', visual: 'Visual' };
const tone = (s) => (s === 'passed' ? 'text-[var(--s-ok)]' : s === 'failed' ? 'text-[var(--s-err)]' : s === 'running' ? 'text-[var(--s-hi)]' : 'text-[var(--s-faint)]');

/** Live + final detail for the Plus/Pro advanced pipeline. Pure display of the snapshot the server reports. */
export default function AdvancedBuildPanel({ snapshot, summary, isGenerating }) {
  const s = snapshot || summary?.progress;
  if (!s && !summary) return null;
  const pages = s?.pages || summary?.pages || [];
  const files = s?.files || {};
  const validation = s?.validation || summary?.quality?.layers && Object.fromEntries(Object.entries(summary.quality.layers).map(([k, v]) => [k, v.status])) || {};
  const repair = s?.repair || {};
  const repairs = summary?.repairs || [];
  return (
    <div className="space-y-3 rounded-2xl border border-[var(--s-line)] bg-white/[0.02] p-3.5 text-[12px] text-[var(--s-muted)]" data-testid="advanced-panel">
      <div className="flex items-center gap-2 text-[var(--s-text)]"><Layers className="h-3.5 w-3.5" /><span className="font-medium">Advanced build</span>
        {s?.complexity && <span className="rounded-full border border-[var(--s-line)] px-2 py-0.5 text-[10px] uppercase tracking-wide">{s.complexity}</span>}</div>
      {pages.length > 0 && <div>
        <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-[var(--s-faint)]">Planned pages{s?.pagesTotal ? ` · ${s.pagesDone || 0}/${s.pagesTotal} done` : ''}</p>
        <ul className="space-y-1">{pages.map((p) => <li key={p.id} className="flex items-center justify-between gap-2"><span className="truncate">{p.title} <span className="text-[var(--s-faint)]">{p.path}</span></span><span className={`shrink-0 text-[10px] ${p.status === 'done' ? 'text-[var(--s-ok)]' : p.status === 'generating' ? 'text-[var(--s-hi)]' : 'text-[var(--s-faint)]'}`}>{p.status || 'planned'}</span></li>)}</ul>
      </div>}
      {(files.planned > 0 || summary?.architecture) && <p className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />{summary?.architecture ? `${summary.architecture.fileCount} files in ${summary.architecture.folders?.length || 0} folders` : `${files.written || 0} of ${files.planned} files written${files.created ? ` · ${files.created} created on demand` : ''}`}</p>}
      {isGenerating && s?.currentTask && <p className="text-[var(--s-hi)]">{s.currentTask}</p>}
      {Object.keys(validation).length > 0 && <div>
        <p className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-[var(--s-faint)]"><ShieldCheck className="h-3 w-3" />Validation</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1">{Object.entries(validation).map(([k, v]) => <span key={k} className={tone(v)}>{LAYER_LABEL[k] || k}: {v}</span>)}</div>
      </div>}
      {(repair.attempts > 0 || repairs.length > 0) && <p className="flex items-center gap-1.5"><Wrench className="h-3.5 w-3.5" />{repairs.length ? `${repairs.length} automatic repair round${repairs.length === 1 ? '' : 's'}` : `Repair attempt ${repair.attempts}${repair.max ? ` of ${repair.max}` : ''}`}</p>}
      {summary && !isGenerating && <div className="border-t border-[var(--s-line)] pt-2">
        <p className="text-[var(--s-text)]">{summary.quality?.passed ? 'All quality checks passed.' : 'Finished with notes.'}</p>
        {(summary.quality?.remaining || []).slice(0, 5).map((i, n) => <p key={n} className="mt-1 text-[11px]">• {i.message}</p>)}
      </div>}
    </div>
  );
}

/** Free-plan prompt: the existing pipeline keeps working; this only offers the upgrade. */
export function AdvancedUpgradePrompt({ onUpgrade }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--s-line)] px-3 py-2" data-testid="advanced-upgrade">
      <p className="flex items-center gap-2 text-[11px] leading-4 text-[var(--s-muted)]"><LockKeyhole className="h-3.5 w-3.5 shrink-0" />Advanced multi-page generation with automatic testing and repair is available on Plus and Pro.</p>
      <button type="button" onClick={onUpgrade} className="shrink-0 rounded-full bg-[var(--s-text)] px-3 py-1.5 text-[11px] font-semibold text-[#050505]">Upgrade</button>
    </div>
  );
}
