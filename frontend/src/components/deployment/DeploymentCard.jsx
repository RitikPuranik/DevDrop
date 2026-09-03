import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ExternalLink, GitBranch, Loader2, Server, Triangle } from 'lucide-react';

const STATUS_META = {
  SUCCESS: { label: 'Live', className: 'text-[#cbb392] bg-[#cbb392]/10 border-[#cbb392]/20' },
  FAILED: { label: 'Failed', className: 'text-red-300 bg-red-500/10 border-red-400/20' },
  CANCELLED: { label: 'Cancelled', className: 'text-white/40 bg-white/5 border-white/10' },
};
const ACTIVE_META = { label: 'Deploying', className: 'text-[#cbb392] bg-[#cbb392]/10 border-[#cbb392]/20' };

export default function DeploymentCard({ deployment }) {
  const navigate = useNavigate();
  const statusMeta = deployment.isActive ? ACTIVE_META : STATUS_META[deployment.status] || STATUS_META.CANCELLED;

  // Links inside the card open in a new tab on their own — just keep the
  // click from also triggering the card's navigate-to-details handler.
  const stopBubble = (e) => e.stopPropagation();

  return (
    <div
      onClick={() => navigate(`/deployments/${deployment.id}`)}
      className="rounded-[24px] border border-white/8 bg-[#0c0c0c] p-5 cursor-pointer hover:border-white/20 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p className="font-bold text-sm truncate">{deployment.repository?.name || 'Deployment'}</p>
          <p className="text-[11px] text-white/30 truncate">{deployment.repository?.owner}/{deployment.repository?.name}</p>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${statusMeta.className}`}>
          {deployment.isActive && <Loader2 size={10} className="animate-spin" />}
          {deployment.status === 'FAILED' && <AlertCircle size={10} />}
          {statusMeta.label}
        </span>
      </div>

      <div className="space-y-2 mb-4">
        {deployment.frontendProvider && (
          <UrlRow icon={Triangle} label="Vercel" url={deployment.vercel?.url} />
        )}
        {deployment.backendProvider && (
          <UrlRow icon={Server} label="Render" url={deployment.render?.url} />
        )}
      </div>

      {deployment.status === 'FAILED' && deployment.errorMessage && (
        <p className="text-[11px] text-red-300/70 mb-4 line-clamp-2">{deployment.errorMessage}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {deployment.vercel?.url && (
          <SmallLink icon={ExternalLink} label="Open Website" href={deployment.vercel.url} onClick={stopBubble} />
        )}
        {!deployment.vercel?.url && deployment.render?.url && (
          <SmallLink icon={ExternalLink} label="Open Website" href={deployment.render.url} onClick={stopBubble} />
        )}
        {deployment.repository?.url && (
          <SmallLink icon={GitBranch} label="GitHub" href={deployment.repository.url} onClick={stopBubble} />
        )}
      </div>
    </div>
  );
}

function UrlRow({ icon: Icon, label, url }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <Icon size={12} className="text-white/30 shrink-0" />
      <span className="text-white/35 w-14 shrink-0">{label}</span>
      <span className="text-white/60 truncate">{url ? url.replace('https://', '') : '—'}</span>
    </div>
  );
}

function SmallLink({ icon: Icon, label, href, onClick }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-white/45 text-[10px] font-bold uppercase tracking-wider hover:text-white hover:bg-white/10 transition-colors"
    >
      <Icon size={11} /> {label}
    </a>
  );
}
