import React, { useRef, useEffect, useState } from 'react';
import { motion, useScroll, useTransform, useSpring, useInView } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  LayoutTemplate,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Quote,
  GitFork,
  ShoppingBag,
  Gavel,
  Wallet,
  CheckCircle
} from 'lucide-react';
import secondVideo from '../../assets/videos/v2.mp4';
import { DeployUSP, AIStudioUSP, MarketplaceUSP } from '../../components/sections/Uspsections';

const ARTIFACTS = [
  { id: 'kinetic', name: 'Kinetic', h: 'h-64', img: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fm=webp&q=65&w=500' },
  { id: 'lunar', name: 'Lunar', h: 'h-40', img: 'https://images.unsplash.com/photo-1551650975-87deedd944c3?auto=format&fm=webp&q=65&w=500' },
  { id: 'veil', name: 'Veil', h: 'h-80', img: 'https://images.unsplash.com/photo-1545231027-637d2f6210f8?auto=format&fm=webp&q=65&w=500' },
  { id: 'apex', name: 'Apex', h: 'h-48', img: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fm=webp&q=65&w=500' },
  { id: 'nova', name: 'Nova', h: 'h-72', img: 'https://images.unsplash.com/photo-1497366412874-3415097a27e7?auto=format&fm=webp&q=65&w=500' },
  { id: 'onyx', name: 'Onyx', h: 'h-52', img: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fm=webp&q=65&w=500' },
  { id: 'ghost', name: 'Ghost', h: 'h-44', img: 'https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?auto=format&fm=webp&q=65&w=500' },
  { id: 'shadow', name: 'Shadow', h: 'h-60', img: 'https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fm=webp&q=65&w=500' },
];

const REVIEWS = [
  { quote: "As I was making my first deploy today, I told myself I was going to gatekeep this as my little secret.", author: "Elena Rostova", role: "Design Director, Aether Lab", tint: 'rgba(42, 32, 24, 0.4)' },
  { quote: "I just wanted to take a moment to congratulate the team on the incredible AI Studio pipeline — it actually ships working code.", author: "Marcus Vance", role: "Technical Lead, Nexus Studio", tint: 'rgba(24, 39, 34, 0.4)' },
  { quote: "I recently used DevDrop to publish and sell a template. The auction flow and payout process were seamless.", author: "Sora Takahashi", role: "Creative Producer, Neo-Tokyo", tint: 'rgba(36, 28, 44, 0.4)' },
  { quote: "Deploying used to be the part I dreaded. Now I connect Vercel, click once, and it's live under my own account.", author: "Priya Nandan", role: "Founder, Loopwork", tint: 'rgba(36, 31, 24, 0.4)' },
];

const Home = ({ preloadedVideoRef, introComplete, fromIntro }) => {
  const [isReady, setIsReady] = useState(false);
  const { scrollY } = useScroll();

  useEffect(() => {
    // The browser already starts a fresh document at the top. Avoid forcing a
    // synchronous scroll/layout pass during the critical first render.
    const timer = setTimeout(() => setIsReady(true), 150);
    return () => clearTimeout(timer);
  }, []);

  const showContent = introComplete || isReady;

  return (
    <div className="bg-[#050505] text-[#e8e2d6] selection:bg-[#e8e2d6] selection:text-black antialiased overflow-x-hidden">
      {/* ── First Video (Hero) — Untouched ── */}
      <VideoHeroSection
        scrollY={scrollY}
        preloadedVideoRef={preloadedVideoRef}
        introComplete={showContent}
        fromIntro={fromIntro}
      />

      <div className="relative z-10">
        {/* ── Second Video — expands once on entry, then stays pinned ── */}
        <SmoothVideoSection scrollY={scrollY} />

        {/* ── Seamless Blending & Dynamic Flowchart Sections ── */}
        <div className="-mt-16 md:-mt-28 relative z-20 font-napkin bg-[#050505]">
          <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-full h-[250px] bg-gradient-to-b from-transparent via-[#050505]/90 to-[#050505]" />
          
          <DeployUSP />
          <AIStudioUSP />
          <MarketplaceUSP />

          <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-4" />

          <TemplatesMasonry introComplete={showContent} />
          <TemplatesGridReveal introComplete={showContent} />
          <FinalCTASection />
        </div>
      </div>
    </div>
  );
};

/* ─── VIDEO HERO ─── */
const VideoHeroSection = ({ scrollY, preloadedVideoRef, introComplete, fromIntro }) => {
  const wrapperRef = useRef(null);
  // The hero is mounted behind the intro overlay, so keep it paintable from
  // the first render. The intro still visually covers it until it exits.
  const [visible, setVisible] = useState(true);
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
const SmoothVideoSection = ({ scrollY }) => {
  const videoRef = useRef(null);
  const [shouldLoadVideo, setShouldLoadVideo] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || shouldLoadVideo) return;

    const loadVideo = () => setShouldLoadVideo(true);

    if (!('IntersectionObserver' in window)) {
      loadVideo();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadVideo();
          observer.disconnect();
        }
      },
      { rootMargin: '800px 0px' }
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, [shouldLoadVideo]);

  // Reuse the homepage-level scroll MotionValue. This avoids creating a
  // second global scroll subscription for the same page.
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
            ref={videoRef}
            {...(shouldLoadVideo ? { src: secondVideo } : {})}
            autoPlay
            loop
            muted
            playsInline
            preload="none"
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