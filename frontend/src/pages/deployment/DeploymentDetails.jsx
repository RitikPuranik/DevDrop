import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ExternalLink,
  GitBranch,
  Loader2,
  PartyPopper,
  RefreshCw,
  Server,
  Triangle,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { deploymentAPI } from '../../api/deployment';

const POLL_INTERVAL_MS = 3000;

const FULLSTACK_STEPS = [
  { status: 'QUEUED', label: 'Deployment queued' },
  { status: 'DEPLOYING_BACKEND', label: 'Deploying backend to Render' },
  { status: 'BACKEND_DEPLOYED', label: 'Backend deployed' },
  { status: 'DEPLOYING_FRONTEND', label: 'Deploying frontend to Vercel' },
  { status: 'FRONTEND_DEPLOYED', label: 'Frontend deployed' },
  { status: 'SYNCHRONIZING_ENV', label: 'Synchronizing frontend/backend URLs' },
  { status: 'REDEPLOYING_BACKEND', label: 'Redeploying backend with final URLs' },
];
const BACKEND_ONLY_STEPS = [
  { status: 'QUEUED', label: 'Deployment queued' },
  { status: 'DEPLOYING_BACKEND', label: 'Deploying backend to Render' },
  { status: 'BACKEND_DEPLOYED', label: 'Backend deployed' },
];
const FRONTEND_ONLY_STEPS = [
  { status: 'QUEUED', label: 'Deployment queued' },
  { status: 'DEPLOYING_FRONTEND', label: 'Deploying frontend to Vercel' },
  { status: 'FRONTEND_DEPLOYED', label: 'Frontend deployed' },
];

const stepsFor = (architecture) =>
  ({ FULLSTACK: FULLSTACK_STEPS, BACKEND_ONLY: BACKEND_ONLY_STEPS, FRONTEND_ONLY: FRONTEND_ONLY_STEPS }[architecture] || FULLSTACK_STEPS);

export default function DeploymentDetails() {
  const { deploymentId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [deployment, setDeployment] = useState(null);
  const [redeploying, setRedeploying] = useState(false);
  const pollTimerRef = useRef(null);

  useEffect(() => {
    fetchDeployment();
    return () => clearTimeout(pollTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deploymentId]);

  const fetchDeployment = async () => {
    try {
      const res = await deploymentAPI.getById(deploymentId);
      const data = res.data?.data;
      setDeployment(data);
      if (data?.isActive) {
        pollTimerRef.current = setTimeout(fetchDeployment, POLL_INTERVAL_MS);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Deployment not found');
      navigate('/workspace', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  const handleRedeploy = async () => {
    try {
      setRedeploying(true);
      await deploymentAPI.redeploy(deploymentId);
      toast.success('Redeploy started');
      fetchDeployment();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not start redeploy');
    } finally {
      setRedeploying(false);
    }
  };

  if (loading) {
    return (
      <div className="ui-surface min-h-screen bg-[#08090a] flex items-center justify-center">
        <Loader2 className="animate-spin text-white/30" size={28} />
      </div>
    );
  }
  if (!deployment) return null;

  return (
    <div className="ui-surface min-h-screen bg-[#08090a] text-[#e7e9ea]">
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-10 md:py-14">
        <button
          type="button"
          onClick={() => navigate('/workspace')}
          className="inline-flex items-center gap-2 text-white/35 hover:text-white text-xs font-bold uppercase tracking-widest mb-8 transition-colors"
        >
          <ArrowLeft size={14} /> Back to Workspace
        </button>

        <h1 className="text-2xl font-black tracking-tight mb-1">{deployment.repository?.name}</h1>
        <p className="text-white/35 text-sm mb-10">{deployment.repository?.owner}/{deployment.repository?.name}</p>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {deployment.isActive && <ProgressView deployment={deployment} />}
          {deployment.status === 'SUCCESS' && <SuccessView deployment={deployment} onRedeploy={handleRedeploy} redeploying={redeploying} />}
          {deployment.status === 'FAILED' && <FailedView deployment={deployment} onRedeploy={handleRedeploy} redeploying={redeploying} />}
          {deployment.status === 'CANCELLED' && <CancelledView deployment={deployment} onRedeploy={handleRedeploy} redeploying={redeploying} />}
        </motion.div>
      </div>
    </div>
  );
}

function ProgressView({ deployment }) {
  const steps = stepsFor(deployment.architecture);
  const currentIndex = steps.findIndex((s) => s.status === deployment.status);

  return (
    <div className="rounded-[26px] border border-white/8 bg-[#0b0b0b] p-8">
      <div className="flex items-center gap-3 mb-6">
        <Loader2 className="animate-spin text-[#8b7355]" size={20} />
        <h3 className="font-bold text-base">Deploying {deployment.repository?.name}</h3>
      </div>
      <div className="space-y-3 max-w-md">
        {steps.map((step, i) => {
          const done = currentIndex === -1 ? false : i < currentIndex;
          const current = i === currentIndex;
          return (
            <div key={step.status} className="flex items-center gap-3 text-sm">
              {done ? (
                <span className="w-5 h-5 rounded-full bg-[#cbb392]/15 text-[#cbb392] flex items-center justify-center shrink-0"><Check size={12} /></span>
              ) : current ? (
                <span className="w-5 h-5 flex items-center justify-center shrink-0"><Loader2 size={14} className="animate-spin text-[#8b7355]" /></span>
              ) : (
                <span className="w-5 h-5 rounded-full border border-white/15 shrink-0" />
              )}
              <span className={done ? 'text-white/50' : current ? 'text-white' : 'text-white/25'}>{step.label}</span>
            </div>
          );
        })}
      </div>
      {deployment.render?.url && (
        <p className="mt-5 text-xs text-white/30 font-mono">{deployment.render.url}</p>
      )}
      <p className="text-white/20 text-[11px] mt-6">Builds can take a few minutes, especially the first time.</p>
    </div>
  );
}

function SuccessView({ deployment, onRedeploy, redeploying }) {
  return (
    <div className="rounded-[26px] border border-[#cbb392]/20 bg-[#cbb392]/5 p-8 text-center">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-[#cbb392]/10 border border-[#cbb392]/20 flex items-center justify-center mb-5">
        <PartyPopper size={24} className="text-[#cbb392]" />
      </div>
      <h3 className="font-bold text-lg mb-6">Deployment Successful</h3>

      <div className="space-y-3 max-w-sm mx-auto text-left mb-8">
        {deployment.vercel?.url && <UrlLine icon={Triangle} label="Frontend" url={deployment.vercel.url} />}
        {deployment.render?.url && <UrlLine icon={Server} label="Backend" url={deployment.render.url} />}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2.5">
        {(deployment.vercel?.url || deployment.render?.url) && (
          <PrimaryLink href={deployment.vercel?.url || deployment.render?.url} icon={ExternalLink} label="Open Website" />
        )}
        {deployment.repository?.url && <SecondaryLink href={deployment.repository.url} icon={GitBranch} label="GitHub" />}
        <SecondaryButton onClick={onRedeploy} loading={redeploying} icon={RefreshCw} label="Redeploy" />
      </div>
    </div>
  );
}

function FailedView({ deployment, onRedeploy, redeploying }) {
  return (
    <div className="rounded-[26px] border border-red-400/20 bg-red-500/5 p-8 text-center">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-red-500/10 border border-red-400/20 flex items-center justify-center mb-5">
        <XCircle size={24} className="text-red-300" />
      </div>
      <h3 className="font-bold text-lg mb-2">Deployment Failed</h3>
      <p className="text-red-200/80 text-sm max-w-md mx-auto leading-relaxed mb-6">{deployment.errorMessage || 'An unexpected error occurred.'}</p>
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        {deployment.repository?.url && <SecondaryLink href={deployment.repository.url} icon={GitBranch} label="GitHub" />}
        <PrimaryButton onClick={onRedeploy} loading={redeploying} icon={RefreshCw} label="Retry Deployment" />
      </div>
    </div>
  );
}

function CancelledView({ deployment, onRedeploy, redeploying }) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-white/[0.02] p-8 text-center">
      <AlertCircle className="mx-auto mb-4 text-white/30" size={24} />
      <h3 className="font-bold text-lg mb-6">Deployment Cancelled</h3>
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        {deployment.repository?.url && <SecondaryLink href={deployment.repository.url} icon={GitBranch} label="GitHub" />}
        <PrimaryButton onClick={onRedeploy} loading={redeploying} icon={RefreshCw} label="Redeploy" />
      </div>
    </div>
  );
}

function UrlLine({ icon: Icon, label, url }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/8">
      <Icon size={13} className="text-white/40 shrink-0" />
      <span className="text-[10px] uppercase tracking-wider text-white/35 font-bold shrink-0 w-14">{label}</span>
      <a href={url} target="_blank" rel="noreferrer" className="text-xs text-white/70 hover:text-white truncate transition-colors">
        {url.replace('https://', '')}
      </a>
    </div>
  );
}

function PrimaryLink({ href, icon: Icon, label }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-white text-black text-xs font-black uppercase tracking-[0.18em] hover:bg-[#f2ede6] transition-colors">
      <Icon size={14} /> {label}
    </a>
  );
}
function SecondaryLink({ href, icon: Icon, label }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/5 text-white/60 text-xs font-black uppercase tracking-[0.18em] hover:text-white hover:bg-white/10 transition-colors">
      <Icon size={14} /> {label}
    </a>
  );
}
function PrimaryButton({ onClick, loading, icon: Icon, label }) {
  return (
    <button type="button" onClick={onClick} disabled={loading} className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#8b7355] text-white text-xs font-black uppercase tracking-[0.18em] hover:bg-[#725e46] transition-colors disabled:opacity-60">
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />} {label}
    </button>
  );
}
function SecondaryButton({ onClick, loading, icon: Icon, label }) {
  return (
    <button type="button" onClick={onClick} disabled={loading} className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/5 text-white/60 text-xs font-black uppercase tracking-[0.18em] hover:text-white hover:bg-white/10 transition-colors disabled:opacity-60">
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />} {label}
    </button>
  );
}
