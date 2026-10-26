import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { deploymentAPI } from '../../api/deployment';
import KashiFixPanel from '../../components/kashi/KashiFixPanel';

const POLL_INTERVAL_MS = 3000;
const SERIF = { fontFamily: "'Cormorant Garamond', 'Playfair Display', Georgia, serif" };
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

  const tone = deployment.isActive ? 'gold' : deployment.status === 'SUCCESS' ? 'bloom' : deployment.status === 'FAILED' ? 'red' : 'dim';

  return (
    <div className="ui-surface relative min-h-screen overflow-hidden bg-[#08090a] text-[#e7e9ea] selection:bg-[#cbb392]/25">
      <Ambient tone={tone} />

      <div className="relative z-10 max-w-2xl mx-auto px-6 pt-12 pb-28 md:pt-16">
        <button
          type="button"
          onClick={() => navigate('/workspace')}
          className="group inline-flex items-center gap-2 text-white/30 hover:text-white/80 text-[10px] font-semibold uppercase tracking-[0.28em] transition-colors"
        >
          <ArrowLeft size={12} className="transition-transform group-hover:-translate-x-0.5" /> Workspace
        </button>

        <header className="mt-12 mb-10">
          <h1 className="text-[24px] md:text-[28px] font-medium leading-tight tracking-tight text-white/90">{deployment.repository?.name}</h1>
          <p className="mt-2 text-[12px] text-white/30 font-mono tracking-tight">
            {deployment.repository?.owner}/{deployment.repository?.name}
          </p>
        </header>

        <motion.main
          key={deployment.isActive ? 'active' : deployment.status}
          initial={{ opacity: 0, y: 14, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.9, ease: EASE }}
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

const TONES = {
  gold: ['rgba(255,170,70,0.38)', 'rgba(255,90,150,0.30)', 'rgba(120,90,255,0.34)'],
  bloom: ['rgba(60,230,190,0.34)', 'rgba(255,200,100,0.34)', 'rgba(120,150,255,0.30)'],
  red: ['rgba(255,80,100,0.34)', 'rgba(255,140,60,0.24)', 'rgba(150,70,255,0.22)'],
  dim: ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.04)'],
};

const SPARKS = Array.from({ length: 22 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  size: 1 + (i % 3),
  delay: (i * 0.7) % 9,
  duration: 9 + (i % 5) * 2.5,
}));

function Ambient({ tone }) {
  const [c1, c2, c3] = TONES[tone] || TONES.gold;
  return (
    <div className="pointer-events-none absolute inset-0 z-0">
      <motion.div
        className="absolute -top-60 -left-40 w-[760px] h-[760px] rounded-full blur-[110px]"
        style={{ background: `radial-gradient(circle, ${c1}, transparent 66%)` }}
        animate={{ x: [0, 90, 0], y: [0, 50, 0], scale: [1, 1.15, 1] }}
        transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute top-1/3 -right-52 w-[700px] h-[700px] rounded-full blur-[120px]"
        style={{ background: `radial-gradient(circle, ${c2}, transparent 66%)` }}
        animate={{ x: [0, -80, 0], y: [0, 70, 0], scale: [1.1, 0.95, 1.1] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-72 left-1/4 w-[800px] h-[640px] rounded-full blur-[130px]"
        style={{ background: `radial-gradient(circle, ${c3}, transparent 68%)` }}
        animate={{ x: [0, 60, -40, 0], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* dot grid, fading out from the top */}
      <div
        className="absolute inset-0 opacity-[0.22]"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.55) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 55% at 50% 0%, #000 20%, transparent 75%)',
          maskImage: 'radial-gradient(ellipse 70% 55% at 50% 0%, #000 20%, transparent 75%)',
        }}
      />

      {/* floating sparks */}
      {SPARKS.map((p, i) => (
        <motion.span
          key={i}
          className="absolute bottom-0 rounded-full bg-white"
          style={{ left: p.left, width: p.size, height: p.size, boxShadow: '0 0 8px 1px rgba(255,220,170,0.8)' }}
          initial={{ y: 0, opacity: 0 }}
          animate={{ y: '-100vh', opacity: [0, 0.9, 0] }}
          transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: 'linear' }}
        />
      ))}

      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 35%, rgba(8,9,10,0.85) 100%)' }} />
      <div className="absolute inset-0 opacity-[0.04] mix-blend-screen" style={{ backgroundImage: GRAIN }} />
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

      <div className="mt-10 flex items-center gap-4 text-[10px] font-semibold uppercase tracking-[0.3em]">
        <span className="text-[#ffb457]">Deploying</span>
        <span className="h-px w-8 bg-white/10" />
        <span className="font-mono tracking-[0.15em] text-white/30 tabular-nums">{elapsed}</span>
      </div>

      <motion.h2
        key={current.status}
        initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.8, ease: EASE }}
        style={SERIF}
        className="mt-5 text-[44px] md:text-[62px] leading-[1.02] italic font-normal"
      >
        <Shimmer>{current.label}</Shimmer>
      </motion.h2>

      {/* segmented track */}
      <div className="mt-12 flex gap-1.5">
        {steps.map((s, i) => (
          <div key={s.status} className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/[0.09]">
            {i < currentIndex && <div className="absolute inset-0 bg-gradient-to-r from-[#ffb457] to-[#ff7aa8] shadow-[0_0_10px_rgba(255,150,120,0.8)]" />}
            {i === currentIndex && (
              <motion.div
                className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white to-transparent"
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

      <div className="mt-12 space-y-4">
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
  live: { label: 'Live', dot: 'bg-[#5eead4]', glow: '0 0 12px 2px rgba(94,234,212,0.7)', text: 'text-[#5eead4]' },
  building: { label: 'Building', dot: 'bg-[#ffb457]', glow: '0 0 12px 2px rgba(255,180,87,0.8)', text: 'text-[#ffb457]' },
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
        <div className="mb-4 flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.25em] text-[#5eead4]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-[#5eead4] opacity-60" />
            <span className="relative h-2 w-2 rounded-full bg-[#5eead4]" />
          </span>
          {headline}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {services.map((svc) => {
          const m = STATE_META[svc.state];
          return (
            <div key={svc.name} className="flex items-center gap-4 rounded-2xl border border-white/[0.1] bg-white/[0.04] px-5 py-4 backdrop-blur-xl">
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
    <div className="rounded-2xl border border-white/[0.1] bg-black/30 p-5 backdrop-blur-xl">
      <div className="mb-4 flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/35">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ffb457] shadow-[0_0_8px_rgba(255,180,87,0.9)]" />
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
                <Loader2 size={12} className="shrink-0 animate-spin text-[#ffb457]" />
              ) : (
                <span className="w-3 shrink-0 text-center text-[#5eead4]">✓</span>
              )}
              <span className={isCurrent ? 'text-white/90' : 'text-white/40'}>
                {st.label}
                {isCurrent && (
                  <motion.span
                    className="ml-1 inline-block h-[13px] w-[7px] translate-y-[2px] bg-[#ffb457]/80"
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
    <div className="relative w-24 h-24 flex items-center justify-center">
      <motion.span
        className="absolute inset-0 rounded-full blur-xl opacity-70"
        style={{ background: 'conic-gradient(from 0deg, #ffb457, #ff6a9a, #8b6cff, #3ee0c5, #ffb457)' }}
        animate={{ rotate: 360 }}
        transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
      />
      <motion.span
        className="absolute inset-[6px] rounded-full"
        style={{ background: 'conic-gradient(from 0deg, #ffb457, #ff6a9a, #8b6cff, #3ee0c5, #ffb457)' }}
        animate={{ rotate: -360 }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
      />
      <span className="absolute inset-[9px] rounded-full bg-[#08090a]" />
      {[0, 1].map((i) => (
        <motion.span
          key={i}
          className="absolute inset-0 rounded-full border border-[#ffb457]/50"
          animate={{ scale: [0.7, 1.9], opacity: [0.7, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeOut', delay: i * 1.5 }}
        />
      ))}
      <motion.span
        className="relative w-[22px] h-[22px] rounded-full"
        style={{ background: 'radial-gradient(circle at 35% 30%, #fff, #ffd9a0 50%, #ff8fb0)', boxShadow: '0 0 40px 10px rgba(255,150,120,0.6)' }}
        animate={{ scale: [1, 1.22, 1] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

function Shimmer({ children }) {
  return (
    <motion.span
      className="bg-clip-text text-transparent"
      style={{
        backgroundImage: 'linear-gradient(110deg, #ffb457 10%, #ffffff 30%, #ff7aa8 50%, #a58bff 70%, #ffb457 90%)',
        backgroundSize: '300% 100%',
        WebkitBackgroundClip: 'text',
      }}
      animate={{ backgroundPosition: ['120% 0', '-120% 0'] }}
      transition={{ duration: 4.5, repeat: Infinity, ease: 'linear' }}
    >
      {children}
    </motion.span>
  );
}

/* ─────────────────────────────  Success  ───────────────────────────── */

function SuccessView({ deployment, onRedeploy, redeploying }) {
  const frontend = deployment.vercel?.url;
  const backend = deployment.render?.url;
  const primary = frontend || backend;

  return (
    <section>
      <p className="mb-6 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#5eead4]">Deployed</p>

      <div className="flex items-center gap-5 md:gap-8">
        <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
          <motion.span
            className="absolute inset-0 rounded-full border-2 border-[#5eead4]/70"
            initial={{ scale: 0.3, opacity: 1 }}
            animate={{ scale: 3, opacity: 0 }}
            transition={{ duration: 1.8, ease: 'easeOut' }}
          />
          <motion.span
            className="absolute inset-0 rounded-full blur-xl"
            style={{ background: 'conic-gradient(from 0deg, #5eead4, #ffd27a, #ff8fb0, #5eead4)' }}
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
          />
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full" style={{ background: 'linear-gradient(145deg, #5eead4, #ffd27a)', boxShadow: '0 0 50px 8px rgba(94,234,212,0.45)' }}>
            <motion.svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#08090a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7, delay: 0.25, ease: EASE }} />
            </motion.svg>
          </span>
        </div>

        <h2 style={SERIF} className="text-[56px] md:text-[84px] leading-[0.95] italic font-normal">
          <span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(100deg, #ffffff 0%, #ffd27a 40%, #ff8fb0 75%, #a58bff 100%)', WebkitBackgroundClip: 'text' }}>
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
            className="group inline-flex items-center gap-2 pl-6 pr-5 py-3 rounded-full bg-gradient-to-r from-[#ffd27a] via-[#ffb0a0] to-[#ff8fb0] text-black text-[11px] font-bold uppercase tracking-[0.2em] shadow-[0_0_44px_-6px_rgba(255,150,130,0.8)] hover:brightness-110 transition"
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
        <span className="w-[12px] h-[12px] rounded-full bg-red-300/80 shadow-[0_0_30px_6px_rgba(248,113,113,0.35)]" />
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
      className="group relative flex items-center gap-5 overflow-hidden rounded-2xl border border-white/[0.12] bg-white/[0.045] backdrop-blur-xl px-6 py-5 transition-colors hover:border-[#ffb457]/50"
    >
      <span
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: 'radial-gradient(260px circle at var(--x, 50%) var(--y, 50%), rgba(255,170,130,0.22), transparent 70%)' }}
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
        className="relative text-white/20 group-hover:text-[#ffd27a] transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
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