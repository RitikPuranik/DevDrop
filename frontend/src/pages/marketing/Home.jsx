import React, { useRef, useEffect, useState } from 'react';
import { motion, useScroll, useTransform, useSpring, useInView } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  UploadCloud, Globe2, RotateCcw, ShieldCheck,
  Sparkles, LayoutTemplate, Wand2, MessageSquareCode,
  ArrowUpRight, ArrowRight, ArrowLeft, GitBranch, Rocket, Quote,
  GitFork, ShoppingBag, Gavel, Wallet, Bot, FileCode2, Cloud, CheckCircle2,
  Terminal, Code2, Check, ArrowRightLeft, Cpu, Server, Layers, Zap, Play, CheckCircle
} from 'lucide-react';
import secondVideo from '../../assets/videos/v2.mp4';

const ARTIFACTS = [
  { id: 'kinetic', name: 'Kinetic', h: 'h-64', img: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?q=80&w=500' },
  { id: 'lunar', name: 'Lunar', h: 'h-40', img: 'https://images.unsplash.com/photo-1551650975-87deedd944c3?q=80&w=500' },
  { id: 'veil', name: 'Veil', h: 'h-80', img: 'https://images.unsplash.com/photo-1545231027-637d2f6210f8?q=80&w=500' },
  { id: 'apex', name: 'Apex', h: 'h-48', img: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=500' },
  { id: 'nova', name: 'Nova', h: 'h-72', img: 'https://images.unsplash.com/photo-1497366412874-3415097a27e7?q=80&w=500' },
  { id: 'onyx', name: 'Onyx', h: 'h-52', img: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=500' },
  { id: 'ghost', name: 'Ghost', h: 'h-44', img: 'https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?q=80&w=500' },
  { id: 'shadow', name: 'Shadow', h: 'h-60', img: 'https://images.unsplash.com/photo-1518005020951-eccb494ad742?q=80&w=500' },
];

const REVIEWS = [
  { quote: "As I was making my first deploy today, I told myself I was going to gatekeep this as my little secret.", author: "Elena Rostova", role: "Design Director, Aether Lab", tint: 'rgba(42, 32, 24, 0.4)' },
  { quote: "I just wanted to take a moment to congratulate the team on the incredible AI Studio pipeline — it actually ships working code.", author: "Marcus Vance", role: "Technical Lead, Nexus Studio", tint: 'rgba(24, 39, 34, 0.4)' },
  { quote: "I recently used DevDrop to publish and sell a template. The auction flow and payout process were seamless.", author: "Sora Takahashi", role: "Creative Producer, Neo-Tokyo", tint: 'rgba(36, 28, 44, 0.4)' },
  { quote: "Deploying used to be the part I dreaded. Now I connect Vercel, click once, and it's live under my own account.", author: "Priya Nandan", role: "Founder, Loopwork", tint: 'rgba(36, 31, 24, 0.4)' },
];

const Home = ({ preloadedVideoRef, introComplete, fromIntro }) => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    const timer = setTimeout(() => setIsReady(true), 150);
    return () => clearTimeout(timer);
  }, []);

  const showContent = introComplete || isReady;

  return (
    <div className="bg-[#050505] text-[#e8e2d6] selection:bg-[#e8e2d6] selection:text-black antialiased overflow-x-hidden">
      {/* ── First Video (Hero) — Untouched ── */}
      <VideoHeroSection
        preloadedVideoRef={preloadedVideoRef}
        introComplete={showContent}
        fromIntro={fromIntro}
      />

      <div className="relative z-10">
        {/* ── Second Video — Untouched ── */}
        <SmoothVideoSection />

        {/* ── Seamless Blending & Dynamic Flowchart Sections ── */}
        <div className="-mt-16 md:-mt-28 relative z-20 font-napkin bg-[#050505]">
          <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-full h-[250px] bg-gradient-to-b from-transparent via-[#050505]/90 to-[#050505]" />
          
          <DeployHighlight />
          
          <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-4" />
          
          <AIStudioHighlight />
          
          <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-4" />
          
          <MarketplaceHighlight />

          <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-4" />

          <TemplatesMasonry introComplete={showContent} />
          <TemplatesGridReveal introComplete={showContent} />
          <TestimonialsSection />
          <FinalCTASection />
        </div>
      </div>
    </div>
  );
};

/* ─── VIDEO HERO ─── */
const VideoHeroSection = ({ preloadedVideoRef, introComplete, fromIntro }) => {
  const wrapperRef = useRef(null);
  // The hero is mounted behind the intro overlay, so keep it paintable from
  // the first render. The intro still visually covers it until it exits.
  const [visible, setVisible] = useState(true);
  const { scrollY } = useScroll();

  const videoScale = useTransform(scrollY, [0, 1000], [1.03, 1]);
  const videoBlur = useTransform(scrollY, [200, 800], ["blur(0px)", "blur(8px)"]);
  const opacity = useTransform(scrollY, [0, 800], [1, 0.62]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const vid = preloadedVideoRef?.current;
    if (!wrapper || !vid) return;

    // The initial HTML element is intentionally invisible while it waits
    // outside the React tree. Remove those preload-only inline styles before
    // moving the same element into its real hero wrapper.
    vid.removeAttribute('style');
    vid.className = 'w-full h-full object-cover absolute inset-0 rounded-[1.75rem] sm:rounded-[2rem] lg:rounded-none';
    if (!wrapper.contains(vid)) wrapper.appendChild(vid);
  }, [preloadedVideoRef]);

  useEffect(() => {
    if (!introComplete) return;

    const vid = preloadedVideoRef?.current;
    if (!vid) return;

    const comingFromIntro = fromIntro?.current === true;

    if (comingFromIntro) {
      fromIntro.current = false;
      setVisible(true);
      return;
    }

    // Do not delay the LCP hero by an extra second after the page is ready.
    // Keep the existing fade transition, but let the video become visible
    // immediately so its first frame can be painted as the LCP candidate.
    setVisible(true);
    vid.currentTime = 0;
    vid.play().catch(() => {});
  }, [introComplete]);

  return (
    <motion.section 
      className="relative lg:sticky lg:top-0 w-full overflow-hidden z-0 flex flex-col justify-center items-center px-4 sm:px-5 md:px-6 lg:px-0 pt-24 sm:pt-28 md:pt-32 lg:pt-0 pb-8 sm:pb-10 lg:pb-0 min-h-[56vh] sm:min-h-[62vh] md:min-h-[72vh] lg:h-screen"
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 1 }}
    >
      <motion.div 
        style={{ scale: videoScale, filter: videoBlur, opacity }} 
        className="relative w-full max-w-[28rem] sm:max-w-[40rem] md:max-w-[56rem] lg:max-w-none aspect-[16/12] sm:aspect-[16/10] md:aspect-video lg:absolute lg:inset-0 lg:w-full lg:h-full"
      >
        <div
          ref={wrapperRef}
          className="absolute inset-0 w-full h-full overflow-hidden rounded-[1.75rem] sm:rounded-[2rem] border border-white/10 bg-[#0b0b0b] shadow-[0_24px_80px_rgba(0,0,0,0.42)] lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none"
        />
      </motion.div>
    </motion.section>
  );
};

/* ─── SMOOTH VIDEO SECTION ─── */
const SmoothVideoSection = () => {
  // Use the global scroll position instead of Motion's target-based useScroll.
  // Target-based useScroll measures the section's DOM rect and can force layout
  // during startup. The section is positioned directly after the hero, so its
  // scroll range can be derived from viewport height without DOM measurement.
  const { scrollY } = useScroll();
  const [viewportHeight, setViewportHeight] = useState(
    () => (typeof window !== 'undefined' ? window.innerHeight : 800)
  );

  useEffect(() => {
    const updateViewportHeight = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', updateViewportHeight);
    return () => window.removeEventListener('resize', updateViewportHeight);
  }, []);

  const sectionStart = useTransform(scrollY, (value) => {
    const start = viewportHeight * 0.72;
    const end = start + viewportHeight * 1.4;
    return Math.min(1, Math.max(0, (value - start) / (end - start)));
  });
  const smoothP = useSpring(sectionStart, { stiffness: 40, damping: 24 });

  // Keep the layout box at its final dimensions so the card never changes
  // document geometry while scroll progress settles. Animate only transforms.
  const desktopScaleX = useTransform(smoothP, [0.1, 0.45], [60 / 92, 1]);
  const desktopScaleY = useTransform(smoothP, [0.1, 0.45], [65 / 88, 1]);
  const desktopRadius = useTransform(smoothP, [0.1, 0.45], ["80px", "54px"]);

  const mobileScaleY = useTransform(smoothP, [0.1, 0.45], [35 / 45, 1]);
  const mobileRadius = useTransform(smoothP, [0.1, 0.45], ["16px", "12px"]);

  const cardY = useTransform(smoothP, [0, 0.4], [60, 0]); 

  // Read the viewport during the initial client render so mobile does not
  // briefly render the desktop card dimensions and then jump to mobile.
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 767px)').matches
      : false
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const checkMobile = (event) => setIsMobile(event.matches);
    mq.addEventListener('change', checkMobile);
    return () => mq.removeEventListener('change', checkMobile);
  }, []);

  return (
    <section className="h-auto my-12 md:my-0 md:h-[140vh] relative">
      <div className="relative md:sticky md:top-0 md:h-screen w-full flex items-center justify-center z-10 px-4">
        <motion.div 
          style={{ 
            width: isMobile ? "100%" : "92%",
            height: isMobile ? "45vh" : "88vh",
            scaleX: isMobile ? 1 : desktopScaleX,
            scaleY: isMobile ? mobileScaleY : desktopScaleY,
            borderRadius: isMobile ? mobileRadius : desktopRadius,
            y: isMobile ? 0 : cardY,
            boxShadow: "0 50px 100px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.08)" 
          }} 
          className="relative overflow-hidden bg-[#121212] group w-full"
        >
          <video 
            src={secondVideo} 
            autoPlay 
            loop 
            muted 
            playsInline 
            preload="auto"
            fetchPriority="high"
            poster="/hero-poster.svg"
            className="w-full h-full object-cover opacity-90 transition-opacity duration-700 group-hover:opacity-100" 
          />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
        </motion.div>
      </div>
    </section>
  );
};

/* ─── Shared UI Elements ─── */
const Squiggle = ({ className = '', color = '#e8e2d6' }) => (
  <svg viewBox="0 0 200 16" preserveAspectRatio="none" className={className} aria-hidden="true">
    <motion.path
      d="M2 9 C 14 1, 26 1, 38 9 S 62 17, 74 9 S 98 1, 110 9 S 134 17, 146 9 S 170 1, 182 9 S 198 13, 198 9"
      fill="none"
      stroke={color}
      strokeWidth="5"
      strokeLinecap="round"
      initial={{ pathLength: 0, opacity: 0 }}
      whileInView={{ pathLength: 1, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, ease: 'easeInOut', delay: 0.2 }}
    />
  </svg>
);

/* ─── ELEGANT FLOWCHART 1: SYSTEM ARCHITECTURE FLOW (DEPLOY) ─── */
const DeploySystemFlowchart = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });

  const nodes = [
    { title: 'Local Repository', sub: 'React / Next.js Source', icon: FileCode2, color: 'border-blue-500/30 bg-blue-500/10 text-blue-400' },
    { title: 'DevDrop Router', sub: 'Automated Build Analysis', icon: Cpu, color: 'border-amber-500/40 bg-amber-500/10 text-amber-300' },
    { title: 'Personal Vercel Account', sub: 'Production SSL & Edge', icon: Cloud, color: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' }
  ];

  return (
    <div ref={ref} className="relative rounded-[2.5rem] border border-white/10 bg-[#090b10] p-6 sm:p-8 shadow-[0_30px_90px_rgba(0,0,0,0.85)] overflow-hidden">
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-blue-600/10 rounded-full blur-3xl" />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-8">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
          <span className="text-xs font-mono uppercase tracking-widest text-[#e8e2d6]/70">Infrastructure Deployment Flow</span>
        </div>
        <span className="text-[10px] font-mono text-blue-300 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">
          Zero-Downtime Handoff
        </span>
      </div>

      {/* Dynamic Flowchart Nodes */}
      <div className="relative flex flex-col sm:flex-row items-center justify-between gap-6 sm:gap-2 my-4 z-10">
        
        {nodes.map((node, index) => (
          <React.Fragment key={node.title}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 15 }}
              animate={inView ? { opacity: 1, scale: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.2 }}
              className={`w-full sm:w-1/3 rounded-2xl border ${node.color} p-4 flex flex-col items-center text-center relative backdrop-blur-md shadow-xl`}
            >
              <div className="p-3 rounded-xl bg-black/40 border border-white/10 mb-3 text-white">
                <node.icon size={22} />
              </div>
              <h4 className="text-sm font-bold text-white mb-1">{node.title}</h4>
              <p className="text-[11px] text-[#e8e2d6]/60 font-mono">{node.sub}</p>

              {/* Status pulse pill */}
              <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[9px] font-mono text-white/80">
                <CheckCircle size={10} className="text-emerald-400" /> Connected
              </div>
            </motion.div>

            {/* Connecting Flow Arrow & Line */}
            {index < nodes.length - 1 && (
              <div className="relative flex sm:flex-col items-center justify-center my-2 sm:my-0 w-full sm:w-12 h-8 sm:h-auto">
                <div className="hidden sm:block h-0.5 w-full bg-gradient-to-r from-blue-500/50 via-amber-500/50 to-emerald-500/50 relative">
                  <motion.div
                    animate={{ x: [0, 48, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    className="absolute -top-1 left-0 w-2 h-2 rounded-full bg-amber-300 shadow-[0_0_8px_#f59e0b]"
                  />
                </div>
                <div className="sm:hidden w-0.5 h-full bg-gradient-to-b from-blue-500/50 to-emerald-500/50" />
                <ArrowRight size={16} className="text-white/40 hidden sm:block" />
              </div>
            )}
          </React.Fragment>
        ))}

      </div>

      {/* Terminal Footer Indicator */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ delay: 0.8 }}
        className="mt-8 pt-4 border-t border-white/10 flex items-center justify-between text-xs font-mono text-[#e8e2d6]/60"
      >
        <span className="flex items-center gap-2">
          <Terminal size={14} className="text-amber-400" /> target: vercel.com/api/deploy
        </span>
        <span className="text-emerald-400 font-bold">100% Owner Key Authenticated</span>
      </motion.div>
    </div>
  );
};

/* ─── ELEGANT FLOWCHART 2: VIDEO & AI COMPILER PIPELINE (AI STUDIO) ─── */
const AIStudioVideoFlowchart = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });

  return (
    <div ref={ref} className="relative rounded-[2.5rem] border border-purple-500/30 bg-[#0c0814] p-6 sm:p-8 shadow-[0_30px_90px_rgba(0,0,0,0.85)] overflow-hidden">
      <div className="pointer-events-none absolute top-0 right-0 w-[400px] h-[400px] bg-purple-600/15 rounded-full blur-3xl" />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-purple-400 animate-pulse" />
          <span className="text-xs font-mono uppercase tracking-widest text-[#e8e2d6]/70">AI Prompt-to-Code Pipeline</span>
        </div>
        <span className="text-[10px] font-mono bg-purple-500/20 text-purple-300 px-3 py-1 rounded-full border border-purple-500/30">
          Real-Time Video Preview
        </span>
      </div>

      {/* Main Container Grid: Embedded Live Video Preview & Pipeline Flow */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
        
        {/* Left Side: Video Output Container (5 cols) */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={inView ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.5 }}
          className="md:col-span-5 relative rounded-2xl overflow-hidden border border-purple-500/30 bg-black aspect-video md:aspect-square flex items-center justify-center group"
        >
          <video 
            src={secondVideo}
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-700"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/30" />
          
          <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-[10px] font-mono text-purple-300">
            <Play size={10} className="fill-purple-300" /> Live AST Render
          </div>

          <div className="absolute bottom-3 inset-x-3 p-2.5 rounded-xl bg-purple-950/80 backdrop-blur-md border border-purple-500/30 text-xs font-mono text-purple-200">
            <span className="text-purple-400 font-bold">&gt; Code generation complete</span>
          </div>
        </motion.div>

        {/* Right Side: Flowchart Engine (7 cols) */}
        <div className="md:col-span-7 space-y-3">
          {[
            { step: '01', title: 'Prompt Ingestion', sub: 'Parses UX specs & component layout', icon: MessageSquareCode, color: 'text-purple-400' },
            { step: '02', title: 'Multi-Agent Assembly', sub: 'Tailwind + React code synthesis', icon: Bot, color: 'text-amber-300' },
            { step: '03', title: 'Sandbox Validation', sub: 'Zero-error build compilation & output', icon: Code2, color: 'text-emerald-400' }
          ].map((item, index) => (
            <motion.div
              key={item.step}
              initial={{ opacity: 0, x: 20 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.4, delay: 0.2 + (index * 0.15) }}
              className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between hover:bg-white/[0.06] transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-bold text-white/40">{item.step}</span>
                <div className={`p-2 rounded-lg bg-white/5 border border-white/10 ${item.color}`}>
                  <item.icon size={16} />
                </div>
                <div>
                  <h5 className="text-xs font-bold text-white">{item.title}</h5>
                  <p className="text-[10px] text-[#e8e2d6]/50">{item.sub}</p>
                </div>
              </div>
              <CheckCircle2 size={16} className="text-purple-400/80 shrink-0" />
            </motion.div>
          ))}
        </div>

      </div>
    </div>
  );
};

/* ─── ELEGANT FLOWCHART 3: MARKETPLACE AUCTION & HANDOFF FLOW ─── */
const MarketplaceHandoffFlowchart = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });

  return (
    <div ref={ref} className="relative rounded-[2.5rem] border border-amber-500/30 bg-[#120c07] p-6 sm:p-8 shadow-[0_30px_90px_rgba(0,0,0,0.85)] overflow-hidden">
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-amber-600/10 rounded-full blur-3xl" />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
        <div className="flex items-center gap-2">
          <Gavel size={16} className="text-amber-400" />
          <span className="text-xs font-mono uppercase tracking-widest text-[#e8e2d6]/70">Auction Escrow & Repository Handoff</span>
        </div>
        <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 px-3 py-1 rounded-full border border-amber-500/30">
          Automated GitHub Transfer
        </span>
      </div>

      {/* Visual Flow Diagram */}
      <div className="space-y-4 relative z-10">
        
        {/* Top Step: Bid Placed */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="p-4 rounded-2xl bg-white/[0.03] border border-amber-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <Wallet size={18} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">1. Verified Bid & Escrow Lock</h4>
              <p className="text-[11px] text-[#e8e2d6]/60">Buyer funds held safely in automated escrow protocol</p>
            </div>
          </div>
          <span className="text-xs font-mono text-amber-300 font-bold bg-amber-500/10 px-3 py-1 rounded-lg border border-amber-500/20">
            2.4 ETH Confirmed
          </span>
        </motion.div>

        {/* Central Connecting Flow Bar */}
        <div className="flex justify-center my-1">
          <div className="w-0.5 h-6 bg-gradient-to-b from-amber-500/60 to-emerald-500/60 relative">
            <motion.div
              animate={{ y: [0, 20, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              className="absolute -left-1 top-0 w-2 h-2 rounded-full bg-amber-300"
            />
          </div>
        </div>

        {/* Bottom Step: Handoff Execution */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <GitFork size={18} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">2. Direct GitHub Transfer</h4>
              <p className="text-[11px] text-[#e8e2d6]/60">Instant ownership migration & full codebase repository commit</p>
            </div>
          </div>
          <span className="text-xs font-mono text-emerald-400 font-bold bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/20 flex items-center gap-1.5">
            <CheckCircle size={12} /> Handoff Complete
          </span>
        </motion.div>

      </div>
    </div>
  );
};

/* ─── HIGHLIGHT CONTAINER ─── */
const FeatureHighlight = ({ 
  eyebrow, 
  EyebrowIcon, 
  titleLead, 
  titleHighlight, 
  titleTail, 
  description, 
  steps, 
  ctaLabel, 
  onCta, 
  RightAnimation,
  glowColor,
  isHeroHighlight = false
}) => (
  <section className="relative px-4 sm:px-6 md:px-10 py-12 md:py-20 overflow-hidden">
    <div className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] ${glowColor} opacity-15 blur-[140px] rounded-full`} />

    <div className="max-w-[1300px] mx-auto relative z-10">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10 md:mb-14">
        <div className="max-w-2xl">
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 backdrop-blur-xl px-4 py-1.5 text-xs font-semibold tracking-wider text-[#e8e2d6] uppercase shadow-lg"
          >
            <EyebrowIcon size={14} className="text-amber-300" /> {eyebrow}
          </motion.div>
          
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className={`font-napkin-display mt-5 font-bold tracking-tight text-[#e8e2d6] leading-[1.08] ${
              isHeroHighlight ? 'text-3xl sm:text-4xl md:text-5xl lg:text-6xl' : 'text-3xl sm:text-4xl md:text-5xl'
            }`}
          >
            {titleLead}{' '}
            <span className="relative inline-block text-white">
              {titleHighlight}
              <Squiggle className="absolute left-0 -bottom-2.5 w-full h-3.5" color="#f59e0b" />
            </span>{' '}
            {titleTail}
          </motion.h2>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="mt-4 text-sm sm:text-base text-[#e8e2d6]/65 leading-relaxed max-w-xl"
          >
            {description}
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.25 }}
        >
          <motion.button
            onClick={onCta}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            className="shrink-0 inline-flex items-center gap-2 rounded-full bg-[#e8e2d6] text-[#050505] px-7 py-3.5 text-sm font-extrabold shadow-[0_12px_30px_rgba(0,0,0,0.5)] transition-all"
          >
            {ctaLabel} <ArrowUpRight size={16} />
          </motion.button>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Left Step Details (5 cols) */}
        <div className="space-y-4 lg:col-span-5 order-2 lg:order-1">
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.45, delay: i * 0.1 }}
              className="group p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 hover:bg-white/[0.05] transition-all duration-300 flex gap-4"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-200 to-amber-500 text-[#050505] text-sm font-black shadow-md group-hover:scale-105 transition-transform">
                {i + 1}
              </span>
              <div>
                <h3 className="text-base font-bold text-[#e8e2d6] group-hover:text-white transition-colors">{step.title}</h3>
                <p className="mt-1 text-xs sm:text-sm text-[#e8e2d6]/60 leading-relaxed">{step.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Dynamic Diagram / Flowchart (7 cols) */}
        <div className="lg:col-span-7 order-1 lg:order-2">
          <RightAnimation />
        </div>
      </div>
    </div>
  </section>
);

/* ─── HIGHLIGHT 1: DEPLOY ─── */
const DeployHighlight = () => {
  const navigate = useNavigate();
  return (
    <FeatureHighlight
      isHeroHighlight
      glowColor="bg-blue-600"
      eyebrow="Deployment Infrastructure"
      EyebrowIcon={Rocket}
      titleLead="Deploy directly to cloud infrastructure"
      titleHighlight="you completely own."
      titleTail=""
      description="Connect your Vercel or Render accounts once. DevDrop inspects your code structure, configures runtime specs, and pushes direct to production automatically."
      steps={[
        { title: 'Connect Cloud Provider', desc: 'Link your personal Vercel workspace or integrate custom Render API keys securely.' },
        { title: 'Intelligent Code Analysis', desc: 'React, Next.js, Express, or Vite codebases are mapped automatically to optimal hosting targets.' },
        { title: 'Automated Live Environments', desc: 'Enjoy absolute ownership. Every build, rollback, and domain configuration stays under your control.' },
      ]}
      ctaLabel="Deploy Your Project"
      onCta={() => { window.scrollTo(0, 0); navigate('/deploy-own'); }}
      RightAnimation={DeploySystemFlowchart}
    />
  );
};

/* ─── HIGHLIGHT 2: AI STUDIO ─── */
const AIStudioHighlight = () => {
  const navigate = useNavigate();
  return (
    <FeatureHighlight
      glowColor="bg-purple-600"
      eyebrow="Autonomous AI Studio"
      EyebrowIcon={Sparkles}
      titleLead="Describe your vision."
      titleHighlight="AI builds production code"
      titleTail="in real-time."
      description="Transform simple text prompts into production-grade React & Tailwind codebases. Our multi-agent AI framework designs UI, structures architecture, and tests code before delivery."
      steps={[
        { title: 'Prompt Your Application Concept', desc: 'Provide a rough text outline, design wireframe idea, or functional requirements specification.' },
        { title: 'Multi-Agent Validation Engine', desc: 'Specialized AI agents divide tasks: interface layout design, component architecture, and code generation.' },
        { title: 'Export Ready-to-Ship Code', desc: 'Receive clean, modular React + Vite repositories ready to export directly to GitHub or deploy.' },
      ]}
      ctaLabel="Launch AI Studio"
      onCta={() => { window.scrollTo(0, 0); navigate('/ai-studio'); }}
      RightAnimation={AIStudioVideoFlowchart}
    />
  );
};

/* ─── HIGHLIGHT 3: MARKETPLACE ─── */
const MarketplaceHighlight = () => {
  const navigate = useNavigate();
  return (
    <FeatureHighlight
      glowColor="bg-amber-600"
      eyebrow="Asset Marketplace"
      EyebrowIcon={ShoppingBag}
      titleLead="Buy, sell & auction"
      titleHighlight="verified templates"
      titleTail="with instant transfers."
      description="Publish digital templates, software components, or complete applications. Earn directly through fixed-price sales or high-visibility live bidding auctions."
      steps={[
        { title: 'List Full Source Codebases', desc: 'Set fixed prices, royalty arrangements, or open up timed auctions for exclusive designs.' },
        { title: 'Seamless Auction & Checkout Flow', desc: 'Automated instant payment processing with complete transaction transparency for creators and buyers.' },
        { title: 'Direct GitHub Repository Handoff', desc: 'Upon purchase completion, project repositories instantly clone into the buyer’s GitHub account.' },
      ]}
      ctaLabel="Browse Marketplace"
      onCta={() => { window.scrollTo(0, 0); navigate('/template'); }}
      RightAnimation={MarketplaceHandoffFlowchart}
    />
  );
};

/* ─── TEMPLATES MASONRY ─── */
const TemplatesMasonry = ({ introComplete }) => {
  const navigate = useNavigate();

  return (
    <motion.section 
      initial={{ opacity: 0 }}
      animate={{ opacity: introComplete ? 1 : 0 }}
      transition={{ duration: 0.8 }}
      className="px-4 sm:px-6 md:px-10 py-16 md:py-24 relative"
    >
      <div className="max-w-[1300px] mx-auto">
        <div className="text-center space-y-3 mb-12 md:mb-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 backdrop-blur-lg px-4 py-1.5 text-xs font-semibold tracking-wider text-[#e8e2d6] uppercase">
            <LayoutTemplate size={14} className="text-amber-300" /> Gallery
          </span>
          <h2 className="font-napkin-display text-3xl md:text-5xl font-bold tracking-tight text-[#e8e2d6]">
            Explore Featured Templates
          </h2>
        </div>

        <div className="columns-2 gap-4 space-y-4 sm:columns-2 sm:gap-6 sm:space-y-6 md:columns-3 lg:columns-4">
          {ARTIFACTS.map((item, idx) => (
            <ArtifactCard key={item.id} item={item} index={idx} />
          ))}
        </div>

        <div className="mt-12 flex justify-center">
          <motion.button
            onClick={() => { window.scrollTo(0, 0); navigate('/template'); }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 rounded-full bg-[#e8e2d6] text-[#050505] px-7 py-3.5 text-sm font-extrabold shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-all"
          >
            See More Options <ArrowUpRight size={16} />
          </motion.button>
        </div>
      </div>
    </motion.section>
  );
};

const ArtifactCard = ({ item, index }) => {
  const navigate = useNavigate();
  const [hov, setHov] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.04, ease: [0.21, 1, 0.36, 1] }}
      viewport={{ once: true, margin: "-20px" }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => { window.scrollTo(0, 0); navigate(`/template`); }}
      className={`relative w-full ${item.h} break-inside-avoid cursor-pointer group rounded-2xl overflow-hidden bg-[#0d0d0f] border border-white/10 transition-all duration-300 hover:border-white/25 hover:shadow-lg`}
    >
      <motion.img
        src={item.img}
        alt={item.name}
        animate={{ scale: hov ? 1.05 : 1 }}
        transition={{ duration: 0.6 }}
        className="w-full h-full object-cover brightness-[0.85] group-hover:brightness-100 transition-all duration-500"
      />
      <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#e8e2d6]">
          {item.name}
        </span>
        <span className={`text-[#e8e2d6] transition-transform duration-300 ${hov ? 'translate-x-1' : ''}`}>
          →
        </span>
      </div>
    </motion.div>
  );
};

/* ─── STAT / FEATURE GRID ─── */
const TemplatesGridReveal = ({ introComplete }) => {
  const containerRef = useRef(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.15 });

  const cards = [
    { title: 'Best Quality Standard', desc: 'Every template is reviewed for build quality before it goes live.', span: 'lg:col-span-1' },
    { title: 'Full Package Ownership', desc: 'Full documentation and authorization on every website — 100% yours once purchased.', span: 'lg:col-span-2' },
    { title: 'Curated Ecosystem', desc: 'Verified access and a smoother handoff after every purchase.', span: 'lg:col-span-1' },
  ];

  return (
    <motion.section 
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: introComplete ? 1 : 0 }}
      transition={{ duration: 0.8 }}
      className="px-4 sm:px-6 md:px-10 py-16 md:py-24 border-y border-white/8 bg-[#0a0a0c]"
    >
      <div className="max-w-[1300px] mx-auto">
        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.12 } } }}
          className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6 mb-6"
        >
          {cards.map((c) => (
            <motion.div
              key={c.title}
              variants={{ hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.21, 1, 0.36, 1] } } }}
              className={`${c.span} rounded-3xl bg-white/[0.03] border border-white/8 p-6 md:p-8 flex flex-col justify-between min-h-[200px]`}
            >
              <h3 className="text-xl md:text-2xl font-bold text-[#e8e2d6] mb-3">{c.title}</h3>
              <p className="text-sm text-[#e8e2d6]/55 leading-relaxed">{c.desc}</p>
            </motion.div>
          ))}
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
          {[
            { n: '500+', label: 'Projects Delivered' },
            { n: '98%', label: 'Satisfaction' },
            { n: '24/7', label: 'Support' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-white/[0.03] border border-white/8 px-6 py-8 text-center">
              <h4 className="font-napkin-display text-3xl md:text-4xl font-bold text-[#e8e2d6]">{stat.n}</h4>
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[#e8e2d6]/45">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  );
};

/* ─── TESTIMONIALS ─── */
const TestimonialsSection = () => {
  const scrollerRef = useRef(null);
  const scrollBy = (dir) => {
    scrollerRef.current?.scrollBy({ left: dir * 340, behavior: 'smooth' });
  };

  return (
    <section className="py-16 md:py-24 border-b border-white/8 overflow-hidden">
      <div className="max-w-[1300px] mx-auto px-4 sm:px-6 md:px-10">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-10 md:mb-14">
          <h2 className="font-napkin-display text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-[#e8e2d6] relative inline-block">
            Don&rsquo;t take our word<br className="hidden sm:block" /> for{' '}
            <span className="relative inline-block">
              it.
              <Squiggle className="absolute left-0 -bottom-2 w-full h-3" />
            </span>
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => scrollBy(-1)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5 border border-white/10 text-[#e8e2d6] hover:bg-white/10 transition-colors"
              aria-label="Previous"
            >
              <ArrowLeft size={18} />
            </button>
            <button
              onClick={() => scrollBy(1)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5 border border-white/10 text-[#e8e2d6] hover:bg-white/10 transition-colors"
              aria-label="Next"
            >
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>

      <div ref={scrollerRef} className="flex gap-4 md:gap-6 overflow-x-auto px-4 sm:px-6 md:px-10 pb-4 snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {REVIEWS.map((r, i) => (
          <motion.div
            key={r.author}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.08 }}
            style={{ backgroundColor: r.tint }}
            className="snap-start shrink-0 w-[280px] sm:w-[320px] rounded-3xl border border-white/8 p-6 md:p-7"
          >
            <Quote size={22} className="text-[#e8e2d6]/30 mb-4" />
            <p className="text-sm md:text-base text-[#e8e2d6]/85 leading-relaxed mb-6">{r.quote}</p>
            <div>
              <p className="text-sm font-bold text-[#e8e2d6]">{r.author}</p>
              <p className="text-xs text-[#e8e2d6]/45">{r.role}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

/* ─── FINAL CTA ─── */
const FinalCTASection = () => {
  const navigate = useNavigate();
  return (
    <section className="py-20 md:py-28 px-4 sm:px-6 md:px-10 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="max-w-2xl mx-auto"
      >
        <h2 className="font-napkin-display text-3xl md:text-5xl font-bold tracking-tight text-[#e8e2d6] mb-5">
          Build it, buy it, or deploy it.<br className="hidden sm:block" /> Either way, ship today.
        </h2>
        <p className="text-sm md:text-base text-[#e8e2d6]/50 mb-8">
          Get started instantly — no long setup required.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <motion.button
            onClick={() => { window.scrollTo(0, 0); navigate('/deploy-own'); }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center gap-2 rounded-full bg-[#e8e2d6] text-[#050505] px-6 py-3 text-sm font-bold shadow-[0_10px_30px_rgba(0,0,0,0.4)]"
          >
            Deploy a project <ArrowUpRight size={16} />
          </motion.button>
          <motion.button
            onClick={() => { window.scrollTo(0, 0); navigate('/ai-studio'); }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/15 text-[#e8e2d6] px-6 py-3 text-sm font-bold"
          >
            Try AI Studio <ArrowUpRight size={16} />
          </motion.button>
        </div>
      </motion.div>
    </section>
  );
};

export default Home;