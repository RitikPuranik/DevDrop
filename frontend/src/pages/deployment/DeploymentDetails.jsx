import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { deploymentAPI } from '../../api/deployment';
import KashiFixPanel from '../../components/kashi/KashiFixPanel';

const POLL_INTERVAL_MS = 3000;
const SERIF = { fontFamily: 'var(--font-ui, Inter, system-ui, sans-serif)' };
const EASE = [0.22, 1, 0.36, 1];
const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

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
        <Loader2 className="animate-spin text-white/25" size={22} strokeWidth={1.5} />
      </div>
    );
  }
  if (!deployment) return null;

  

  return (
    <div className="ui-surface relative min-h-screen overflow-hidden bg-[#090909] text-[#e7e7e7] selection:bg-white/15">
      <Ambient />

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 pt-7 pb-20 md:pt-10">
        <button
          type="button"
          onClick={() => navigate('/workspace')}
          className="group inline-flex items-center gap-2 text-white/30 hover:text-white/80 text-[10px] font-semibold uppercase tracking-[0.28em] transition-colors"
        >
          <ArrowLeft size={12} className="transition-transform group-hover:-translate-x-0.5" /> Workspace
        </button>

        <header className="mt-7 mb-6">
          <h1 className="text-[22px] md:text-[26px] font-medium leading-tight tracking-tight text-white/90">{deployment.repository?.name}</h1>
          <p className="mt-2 text-[12px] text-white/30 font-mono tracking-tight">
            {deployment.repository?.owner}/{deployment.repository?.name}
          </p>
        </header>

        <motion.main
          key={deployment.isActive ? 'active' : deployment.status}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="rounded-2xl border border-white/[0.10] bg-[#101010] p-5 sm:p-7 md:p-8 shadow-[0_16px_48px_rgba(0,0,0,0.16)]"
        >
          {deployment.isActive && <ProgressView deployment={deployment} />}
          {deployment.status === 'SUCCESS' && (
            <SuccessView deployment={deployment} onRedeploy={handleRedeploy} redeploying={redeploying} />
          )}
          {deployment.status === 'FAILED' && (
            <FailedView deployment={deployment} onRedeploy={handleRedeploy} redeploying={redeploying} />
          )}
          {deployment.status === 'CANCELLED' && (
            <CancelledView deployment={deployment} onRedeploy={handleRedeploy} redeploying={redeploying} />
          )}
        </motion.main>

        {['FAILED', 'SUCCESS'].includes(deployment.status) && (
          <KashiFixPanel deployment={deployment} onChanged={fetchDeployment} />
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────  Ambient background  ───────────────────────────── */

function Ambient() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.035),transparent_58%)]" />
      <div className="absolute inset-0 opacity-[0.035]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.35) 0.6px, transparent 0.6px)', backgroundSize: '24px 24px' }} />
    </div>
  );
}

/* ─────────────────────────────  Progress  ───────────────────────────── */

function useElapsed(since) {
  const startRef = useRef(since ? new Date(since).getTime() : Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.floor((now - (Number.isFinite(startRef.current) ? startRef.current : now)) / 1000));
  return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
}

function ProgressView({ deployment }) {
  const steps = stepsFor(deployment.architecture);
  const found = steps.findIndex((s) => s.status === deployment.status);
  const currentIndex = found === -1 ? 0 : found;
  const current = steps[currentIndex];
  const next = steps[currentIndex + 1];
  const elapsed = useElapsed(deployment.createdAt);

  return (
    <section>
      <Orb />

      <div className="mt-5 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.2em]">
        <span className="text-[#d6d0c5]">Deploying</span>
        <span className="h-px w-8 bg-white/10" />
        <span className="font-mono tracking-[0.15em] text-white/30 tabular-nums">{elapsed}</span>
      </div>

      <motion.h2
        key={current.status}
        initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.8, ease: EASE }}
        style={SERIF}
        className="mt-3 text-[26px] sm:text-[30px] md:text-[34px] leading-tight font-semibold tracking-tight"
      >
        <Shimmer>{current.label}</Shimmer>
      </motion.h2>

      {/* segmented track */}
      <div className="mt-7 flex gap-1.5">
        {steps.map((s, i) => (
          <div key={s.status} className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/[0.09]">
            {i < currentIndex && <div className="absolute inset-0 bg-[#a9a9a9]" />}
            {i === currentIndex && (
              <motion.div
                className="absolute inset-y-0 w-1/2 bg-white/35"
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between text-[11px] text-white/25">
        <span className="font-mono tabular-nums">
          {String(currentIndex + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}
        </span>
        {next ? <span>Next — {next.label}</span> : <span>Almost there</span>}
      </div>

      <div className="mt-8 space-y-3">
        <ServiceStatus services={serviceStates(steps, currentIndex)} />
        <ActivityLog steps={steps} currentIndex={currentIndex} />
      </div>

      {deployment.render?.url && (
        <p className="mt-8 text-[11px] text-white/15 font-mono truncate">{deployment.render.url}</p>
      )}
      <p className="mt-3 text-[11px] text-white/20 tracking-wide">
        Builds can take a few minutes, especially the first time.
      </p>
    </section>
  );
}

/* ─────────────────────────────  "Everything is working" pieces  ───────────────────────────── */

const STATE_META = {
  live: { label: 'Live', dot: 'bg-[#87998b]', glow: 'none', text: 'text-[#b8c8bb]' },
  building: { label: 'Building', dot: 'bg-[#bdb7ac]', glow: 'none', text: 'text-[#d6d0c5]' },
  waiting: { label: 'Waiting', dot: 'bg-white/20', glow: 'none', text: 'text-white/30' },
};

function serviceStates(steps, currentIndex, allLive = false) {
  const idx = (st) => steps.findIndex((x) => x.status === st);
  const out = [];
  const pick = (build, done, extraBuilding) => {
    if (allLive) return 'live';
    if (extraBuilding) return 'building';
    if (currentIndex >= done) return 'live';
    if (currentIndex >= build) return 'building';
    return 'waiting';
  };
  if (idx('DEPLOYING_BACKEND') !== -1) {
    const redeploy = idx('REDEPLOYING_BACKEND');
    out.push({ name: 'Backend', host: 'Render', state: pick(idx('DEPLOYING_BACKEND'), idx('BACKEND_DEPLOYED'), redeploy !== -1 && currentIndex === redeploy) });
  }
  if (idx('DEPLOYING_FRONTEND') !== -1) {
    out.push({ name: 'Frontend', host: 'Vercel', state: pick(idx('DEPLOYING_FRONTEND'), idx('FRONTEND_DEPLOYED'), false) });
  }
  return out;
}

function ServiceStatus({ services, headline }) {
  if (!services.length) return null;
  return (
    <div>
      {headline && (
        <div className="mb-4 flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.25em] text-[#b8c8bb]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-[#87998b] opacity-60" />
            <span className="relative h-2 w-2 rounded-full bg-[#87998b]" />
          </span>
          {headline}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {services.map((svc) => {
          const m = STATE_META[svc.state];
          return (
            <div key={svc.name} className="flex items-center gap-4 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                {svc.state !== 'waiting' && (
                  <span className={`absolute inset-0 animate-ping rounded-full ${m.dot} opacity-50`} />
                )}
                <span className={`relative h-2.5 w-2.5 rounded-full ${m.dot}`} style={{ boxShadow: m.glow }} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-white/85">{svc.name}</p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/30">{svc.host}</p>
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${m.text}`}>{m.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityLog({ steps, currentIndex }) {
  const lines = steps.slice(0, currentIndex + 1).slice(-4);
  const firstShown = Math.max(0, currentIndex + 1 - 4);
  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/20 p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#bdb7ac] " />
        Live activity
      </div>
      <ul className="space-y-2.5 font-mono text-[12.5px]">
        {lines.map((st, i) => {
          const isCurrent = firstShown + i === currentIndex;
          return (
            <motion.li
              key={st.status}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease: EASE }}
              className="flex items-center gap-3"
            >
              {isCurrent ? (
                <Loader2 size={12} className="shrink-0 animate-spin text-[#d6d0c5]" />
              ) : (
                <span className="w-3 shrink-0 text-center text-[#b8c8bb]">✓</span>
              )}
              <span className={isCurrent ? 'text-white/90' : 'text-white/40'}>
                {st.label}
                {isCurrent && (
                  <motion.span
                    className="ml-1 inline-block h-[13px] w-[7px] translate-y-[2px] bg-[#bdb7ac]/80"
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                )}
              </span>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

function Orb() {
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/[0.035]">
      <motion.span
        className="h-3.5 w-3.5 rounded-full bg-[#d6d0c5]"
        animate={{ opacity: [0.65, 1, 0.65] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

function Shimmer({ children }) {
  return <span className="text-white/90">{children}</span>;
}

/* ─────────────────────────────  Success  ───────────────────────────── */

function SuccessView({ deployment, onRedeploy, redeploying }) {
  const frontend = deployment.vercel?.url;
  const backend = deployment.render?.url;
  const primary = frontend || backend;

  return (
    <section>
      <p className="mb-6 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#b8c8bb]">Deployed</p>

      <div className="flex items-center gap-5 md:gap-8">
        <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
          <motion.span
            className="absolute inset-0 rounded-full border-2 border-[#87998b]/60"
            initial={{ scale: 0.3, opacity: 1 }}
            animate={{ scale: 3, opacity: 0 }}
            transition={{ duration: 1.8, ease: 'easeOut' }}
          />
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ background: '#87998b' }}
            animate={{ opacity: [0.65, 0.9, 0.65] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full" style={{ background: '#b8c8bb' }}>
            <motion.svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#08090a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7, delay: 0.25, ease: EASE }} />
            </motion.svg>
          </span>
        </div>

        <h2 style={SERIF} className="text-[36px] sm:text-[44px] md:text-[52px] leading-tight font-semibold tracking-tight">
          <span className="text-white/90">
            It's live.
          </span>
        </h2>
      </div>

      <div className="mt-12">
        <ServiceStatus
          headline="All systems operational"
          services={serviceStates(stepsFor(deployment.architecture), 0, true)}
        />
      </div>

      <div className="mt-6 space-y-3">
        {frontend && <LinkCard label="Frontend" sub="Vercel" url={frontend} />}
        {backend && <LinkCard label="Backend" sub="Render" url={backend} />}
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-3">
        {primary && (
          <a
            href={primary}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-2 pl-6 pr-5 py-3 rounded-lg bg-[#e7e7e7] text-[#111] text-[11px] font-bold uppercase tracking-[0.16em] hover:bg-white transition-colors"
          >
            Open site
            <ArrowUpRight size={14} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        )}
        {deployment.repository?.url && <GhostLink href={deployment.repository.url} label="GitHub" />}
        <GhostButton onClick={onRedeploy} loading={redeploying} label="Redeploy" />
      </div>
    </section>
  );
}

/* ─────────────────────────────  Failed / Cancelled  ───────────────────────────── */

function FailedView({ deployment, onRedeploy, redeploying }) {
  return (
    <section>
      <div className="relative w-16 h-16 flex items-center justify-center">
        <span className="w-[12px] h-[12px] rounded-full bg-red-300/80 " />
      </div>
      <p className="mt-10 text-[10px] font-semibold uppercase tracking-[0.3em] text-red-200/70">Failed</p>

      <h2 style={SERIF} className="mt-5 text-[44px] md:text-[56px] leading-[1.02] italic font-light text-white/90">
        Something went wrong.
      </h2>

      <div className="mt-10 rounded-2xl border border-red-300/10 bg-red-400/[0.03] backdrop-blur-sm p-5">
        <p className="text-[12.5px] leading-relaxed text-white/50 font-mono break-words max-h-40 overflow-y-auto">
          {deployment.errorMessage || 'An unexpected error occurred.'}
        </p>
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onRedeploy}
          disabled={redeploying}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#f2ede6] text-black text-[11px] font-bold uppercase tracking-[0.2em] hover:bg-white transition-colors disabled:opacity-50"
        >
          {redeploying ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Retry
        </button>
        {deployment.repository?.url && <GhostLink href={deployment.repository.url} label="GitHub" />}
      </div>
    </section>
  );
}

function CancelledView({ deployment, onRedeploy, redeploying }) {
  return (
    <section>
      <div className="w-16 h-16 flex items-center justify-center">
        <span className="w-[12px] h-[12px] rounded-full border border-white/30" />
      </div>
      <p className="mt-10 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/40">Cancelled</p>
      <h2 style={SERIF} className="mt-5 text-[44px] md:text-[56px] leading-[1.02] italic font-light text-white/80">
        Deployment stopped.
      </h2>
      <div className="mt-10 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onRedeploy}
          disabled={redeploying}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#f2ede6] text-black text-[11px] font-bold uppercase tracking-[0.2em] hover:bg-white transition-colors disabled:opacity-50"
        >
          {redeploying ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Redeploy
        </button>
        {deployment.repository?.url && <GhostLink href={deployment.repository.url} label="GitHub" />}
      </div>
    </section>
  );
}

/* ─────────────────────────────  Pieces  ───────────────────────────── */

// Glass link card with a soft spotlight that follows the cursor.
function LinkCard({ label, sub, url }) {
  const ref = useRef(null);
  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty('--x', `${e.clientX - r.left}px`);
    ref.current.style.setProperty('--y', `${e.clientY - r.top}px`);
  };
  return (
    <a
      ref={ref}
      onMouseMove={onMove}
      href={url}
      target="_blank"
      rel="noreferrer"
      className="group relative flex items-center gap-5 overflow-hidden rounded-xl border border-white/[0.09] bg-white/[0.025] px-4 sm:px-5 py-4 transition-colors hover:border-white/25"
    >
      <span
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: 'radial-gradient(260px circle at var(--x, 50%) var(--y, 50%), rgba(255,255,255,0.045), transparent 70%)' }}
      />
      <div className="relative w-20 shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{label}</p>
        <p className="text-[10px] text-white/20 mt-1">{sub}</p>
      </div>
      <span className="relative flex-1 min-w-0 text-[13px] text-white/75 group-hover:text-white truncate transition-colors">
        {url.replace(/^https?:\/\//, '')}
      </span>
      <ArrowUpRight
        size={16}
        className="relative text-white/20 group-hover:text-white transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
      />
    </a>
  );
}

const ghostClass =
  'inline-flex items-center gap-2 px-5 py-3 rounded-full border border-white/10 bg-white/[0.02] backdrop-blur-sm text-white/50 text-[11px] font-bold uppercase tracking-[0.2em] hover:text-white hover:border-white/25 transition-colors disabled:opacity-50';

function GhostLink({ href, label }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={ghostClass}>
      {label}
    </a>
  );
}

function GhostButton({ onClick, loading, label }) {
  return (
    <button type="button" onClick={onClick} disabled={loading} className={ghostClass}>
      {loading && <Loader2 size={13} className="animate-spin" />} {label}
    </button>
  );
}