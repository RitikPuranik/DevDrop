import React, { useRef, useEffect, useState } from 'react';
import { motion, useScroll, useTransform, useSpring, useInView } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import secondVideo from '../assets/videos/v2.mp4'; 

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
  { quote: "An absolute masterclass in visual composition. Our engagement figures exploded by over 400% after rolling out the new interface design system.", author: "Elena Rostova", role: "Design Director, Aether Lab" },
  { quote: "The motion dynamics feel incredibly heavy yet effortless. It's rare to see optimization and complex cinematic fluid transitions play so beautifully together.", author: "Marcus Vance", role: "Technical Lead, Nexus Studio" },
  { quote: "They didn't just build a portfolio layout; they generated a living, breathing luxury catalog that communicates raw artistic value on every single frame.", author: "Sora Takahashi", role: "Creative Producer, Neo-Tokyo" }
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
      <VideoHeroSection
        preloadedVideoRef={preloadedVideoRef}
        introComplete={showContent}
        fromIntro={fromIntro}
      />
      
      <div className="relative z-10">
        <SmoothVideoSection />
        <MetricsImpactSection />
        <AsymmetricGridReviews />
        <TemplatesMasonry introComplete={showContent} />
      </div>
    </div>
  );
};

/* ─── VIDEO HERO ─── */
const VideoHeroSection = ({ preloadedVideoRef, introComplete, fromIntro }) => {
  const wrapperRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const { scrollY } = useScroll();

  const videoScale = useTransform(scrollY, [0, 1000], [1.05, 1]);
  const videoBlur  = useTransform(scrollY, [200, 800], ["blur(0px)", "blur(10px)"]);
  const opacity    = useTransform(scrollY, [0, 800], [1, 0.55]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const vid = preloadedVideoRef?.current;
    if (!wrapper || !vid) return;

    vid.className = 'w-full h-full object-cover';
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
    } else {
      const timer = setTimeout(() => {
        setVisible(true);
        vid.currentTime = 0;
        vid.play().catch(() => {});
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [introComplete]);

  return (
    <motion.section 
      className="sticky top-0 h-screen overflow-hidden z-0" 
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 1 }}
    >
      <motion.div style={{ scale: videoScale, filter: videoBlur, opacity }} className="absolute inset-0">
        <div ref={wrapperRef} className="w-full h-full" />
      </motion.div>
    </motion.section>
  );
};

/* ─── SMOOTH VIDEO SECTION ─── */
const SmoothVideoSection = () => {
  const targetRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: targetRef, offset: ["start end", "end start"] });
  const smoothP = useSpring(scrollYProgress, { stiffness: 40, damping: 24 });

  const width = useTransform(smoothP, [0.1, 0.45], ["60%", "92%"]);
  const height = useTransform(smoothP, [0.1, 0.45], ["65vh", "88vh"]);
  const borderRadius = useTransform(smoothP, [0.1, 0.45], ["80px", "54px"]);
  const cardY = useTransform(smoothP, [0, 0.4], [100, 0]); 

  return (
    <section ref={targetRef} className="h-[160vh] relative">
      <div className="sticky top-0 h-screen w-full flex items-center justify-center z-10 px-4">
        <motion.div 
          style={{ width, height, borderRadius, y: cardY,
            boxShadow: "0 50px 100px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.08)" 
          }} 
          className="relative overflow-hidden bg-[#121212] group"
        >
          <video src={secondVideo} autoPlay loop muted playsInline className="w-full h-full object-cover opacity-90 transition-opacity duration-700 group-hover:opacity-100" />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
          <div className="absolute bottom-10 left-10">
             <h3 className="text-xl font-serif italic tracking-tight opacity-40">visual perspective</h3>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

/* ─── PREMIUM SMOOTH COUNTER ENGINE ─── */
const RollingCounter = ({ value }) => {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  useEffect(() => {
    if (isInView) {
      let start = 0;
      const end = parseInt(value);
      if (start === end) return;

      let totalDuration = 2000;
      let startTime = null;

      const animate = (timestamp) => {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / totalDuration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 4);
        
        setCount(Math.floor(easeProgress * (end - start) + start));

        if (progress < 1) {
          window.requestAnimationFrame(animate);
        }
      };

      window.requestAnimationFrame(animate);
    }
  }, [isInView, value]);

  return <span ref={ref}>{count.toLocaleString()}</span>;
};

/* ─── WHAT WE PROVIDE (KINETIC METRICS VISUALIZATION) ─── */
const MetricsImpactSection = () => {
  return (
    <section className="relative z-20 bg-[#050505] py-32 px-6 border-b border-white/5">
      <div className="max-w-[1400px] mx-auto">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-end mb-24">
          <div className="lg:col-span-6 space-y-3">
            <span className="text-[10px] font-mono tracking-[0.4em] uppercase text-[#e8e2d6]/30 block">SYSTEM METRICS</span>
            <h2 className="text-4xl md:text-6xl font-serif italic tracking-tighter text-[#e8e2d6] leading-[1.05]">
              Engineered architecture. <br />Driven by scale.
            </h2>
          </div>
          <div className="lg:col-span-6 lg:justify-self-end">
            <p className="text-sm text-[#e8e2d6]/40 max-w-sm font-light tracking-wide leading-relaxed">
              A detailed cross-section reflection of distributed design frameworks, secure global transactions, and deployment volumes ecosystem wide.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Card 1: Sold Platforms */}
          <div className="bg-[#0b0b0c] border border-white/5 rounded-[32px] p-10 flex flex-col justify-between h-[540px] overflow-hidden relative group hover:bg-[#0f0f11] transition-all duration-700">
            <div className="space-y-2">
              <span className="text-[10px] font-mono tracking-widest uppercase text-[#e8e2d6]/30 block">01 // CONVERGENCE</span>
              <h4 className="text-xl font-serif font-light tracking-tight text-[#e8e2d6]/90">WEBSITES DEPLOYED & SOLD</h4>
            </div>

            <div className="relative w-full h-44 flex items-end justify-center overflow-hidden bg-[#050505]/60 rounded-2xl border border-white/[0.03] px-6 py-4">
              <div className="flex gap-2.5 items-end w-full h-28">
                {[45, 75, 40, 95, 55, 115, 70, 130, 60, 105, 85, 120].map((val, i) => (
                  <motion.div
                    key={i}
                    className="flex-1 bg-[#e8e2d6]/10 rounded-sm group-hover:bg-[#e8e2d6]/20 transition-colors duration-700"
                    initial={{ height: 0 }}
                    whileInView={{ height: `${val}%` }}
                    transition={{ duration: 1.5, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                    viewport={{ once: true }}
                  />
                ))}
              </div>
              <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#050505] to-transparent pointer-events-none" />
            </div>

            <div className="space-y-1.5 pt-6 border-t border-white/[0.04]">
              <div className="text-5xl font-mono font-light text-[#e8e2d6] tracking-tight">
                <RollingCounter value={3419} />
              </div>
              <p className="text-xs text-[#e8e2d6]/40 font-light tracking-wide leading-relaxed">High-fidelity production layouts configured and deployed permanently across global nodes.</p>
            </div>
          </div>

          {/* Card 2: Unique Buyers */}
          <div className="bg-[#0b0b0c] border border-white/5 rounded-[32px] p-10 flex flex-col justify-between h-[540px] overflow-hidden relative group hover:bg-[#0f0f11] transition-all duration-700">
            <div className="space-y-2">
              <span className="text-[10px] font-mono tracking-widest uppercase text-[#e8e2d6]/30 block">02 // VELOCITY</span>
              <h4 className="text-xl font-serif font-light tracking-tight text-[#e8e2d6]/90">UNIQUE BUYERS & PARTNERS</h4>
            </div>

            <div className="relative w-full h-44 flex flex-col justify-center gap-3.5 px-4 bg-[#050505]/60 rounded-2xl border border-white/[0.03] overflow-hidden">
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex gap-3.5 whitespace-nowrap overflow-hidden relative">
                  <motion.div 
                    className="flex gap-3.5"
                    animate={{ x: row % 2 === 0 ? [0, -150] : [-150, 0] }}
                    transition={{ repeat: Infinity, ease: "linear", duration: 16 + row * 4 }}
                  >
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="px-3.5 py-1.5 border border-white/5 bg-white/[0.02] rounded-md text-[9px] font-mono text-[#e8e2d6]/50 tracking-widest uppercase">
                        ID_NODE_0{row}{i}
                      </div>
                    ))}
                  </motion.div>
                </div>
              ))}
              <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#050505] to-transparent pointer-events-none" />
              <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#050505] to-transparent pointer-events-none" />
            </div>

            <div className="space-y-1.5 pt-6 border-t border-white/[0.04]">
              <div className="text-5xl font-mono font-light text-[#e8e2d6] tracking-tight">
                <RollingCounter value={6872} />
              </div>
              <p className="text-xs text-[#e8e2d6]/40 font-light tracking-wide leading-relaxed">Unique corporate creative agencies, developers, and collectors purchasing software assets.</p>
            </div>
          </div>

          {/* Card 3: Community Registered */}
          <div className="bg-[#0b0b0c] border border-white/5 rounded-[32px] p-10 flex flex-col justify-between h-[540px] overflow-hidden relative group hover:bg-[#0f0f11] transition-all duration-700">
            <div className="space-y-2">
              <span className="text-[10px] font-mono tracking-widest uppercase text-[#e8e2d6]/30 block">03 // INTELLECT</span>
              <h4 className="text-xl font-serif font-light tracking-tight text-[#e8e2d6]/90">REGISTERED USER COMMUNITY</h4>
            </div>

            <div className="relative w-full h-44 flex items-center justify-center bg-[#050505]/60 rounded-2xl border border-white/[0.03] overflow-hidden">
              <div className="grid grid-cols-4 gap-2.5 w-[90%] transform -rotate-6 opacity-30 group-hover:opacity-40 group-hover:rotate-0 transition-all duration-1000">
                {[...Array(12)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="aspect-square bg-white/[0.01] border border-white/5 rounded-lg flex items-center justify-center text-[9px] font-mono text-[#e8e2d6]/30"
                    initial={{ opacity: 0, scale: 0.7 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8, delay: (i % 4) * 0.08, ease: [0.16, 1, 0.3, 1] }}
                    viewport={{ once: true }}
                  >
                    USR_{i}
                  </motion.div>
                ))}
              </div>
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#050505]/80 pointer-events-none" />
            </div>

            <div className="space-y-1.5 pt-6 border-t border-white/[0.04]">
              <div className="text-5xl font-mono font-light text-[#e8e2d6] tracking-tight">
                <RollingCounter value={11654} />
              </div>
              <p className="text-xs text-[#e8e2d6]/40 font-light tracking-wide leading-relaxed">Integrated members validating source mechanics and tracking project generation data.</p>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

/* ─── NEW: CRAVBURGERS SPLIT LOCATION-STYLE ASYMMETRIC GRID ─── */
const AsymmetricGridReviews = () => {
  return (
    <section className="relative z-20 bg-[#050505] py-32 px-6 border-b border-white/5">
      <div className="max-w-[1400px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-8">
          
          {/* Left Column Anchor Block (Matches left info header) */}
          <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-32 h-fit">
            <div className="space-y-2">
              <span className="text-[10px] font-mono tracking-[0.4em] uppercase text-[#e8e2d6]/30 block">
                VALUATION REPORT
              </span>
              <h2 className="text-4xl md:text-5xl font-serif italic tracking-tighter text-[#e8e2d6] leading-[1.1]">
                Trusted by industry leading creators.
              </h2>
            </div>
            <p className="text-sm text-[#e8e2d6]/40 max-w-sm font-light tracking-wide leading-relaxed">
              Read transparent evaluations from engineering heads, creative studio founders, and digital architects leveraging our system blueprints daily.
            </p>
          </div>

          {/* Right Column Stacked List Block (Matches right side content list) */}
          <div className="lg:col-span-7 space-y-6">
            {REVIEWS.map((rev, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6, delay: idx * 0.1, ease: [0.215, 0.61, 0.355, 1] }}
                className="bg-[#0b0b0c] border border-white/5 rounded-3xl p-8 md:p-10 transition-all duration-500 hover:border-white/20 hover:bg-[#0d0d0f] group flex flex-col justify-between min-h-[220px]"
              >
                <p className="text-base md:text-lg font-serif font-light italic leading-relaxed text-[#e8e2d6]/80 tracking-wide mb-8">
                  "{rev.quote}"
                </p>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-6 border-t border-white/[0.04]">
                  <div>
                    <h5 className="font-mono text-xs tracking-widest text-[#e8e2d6] uppercase font-bold">
                      {rev.author}
                    </h5>
                    <p className="text-[11px] font-mono tracking-wider text-[#e8e2d6]/30 mt-0.5">
                      {rev.role}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-1.5 self-start sm:self-auto bg-white/[0.02] border border-white/5 px-3 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#e8e2d6]/40 group-hover:bg-[#e8e2d6] transition-colors duration-500 animate-pulse" />
                    <span className="text-[9px] font-mono uppercase tracking-widest text-[#e8e2d6]/40">
                      verified credential
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

        </div>
      </div>
    </section>
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
      className="relative z-20 bg-[#050505] pt-24 pb-32 px-6"
    >
      <div className="max-w-[1400px] mx-auto">
        
        <div className="text-center space-y-4 mb-16">
          <span className="text-xs font-mono tracking-[0.4em] uppercase text-[#e8e2d6]/30 block">Curated Artifacts</span>
          <h2 className="text-4xl md:text-5xl font-serif italic tracking-tight text-[#e8e2d6]">
            Explore Templates
          </h2>
        </div>

        <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
          {ARTIFACTS.map((item, idx) => (
            <ArtifactCard key={item.id} item={item} index={idx} />
          ))}
        </div>

        {/* ─── ENHANCED SEE MORE SECTION ─── */}
        <div className="mt-12 flex justify-center">
          <motion.button 
            onClick={() => { window.scrollTo(0, 0); navigate('/template'); }}
            whileHover={{ y: -2 }}
            className="group relative flex flex-col items-center cursor-pointer"
          >
            <span className="text-xl md:text-2xl font-serif italic tracking-tight text-[#e8e2d6]/50 group-hover:text-[#e8e2d6] transition-all duration-700">
                 See more options
            </span>
            
            <div className="relative mt-4 w-40 h-[1px] bg-white/5 overflow-hidden">
              <motion.div 
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                initial={{ x: "-100%" }}
                whileHover={{ x: "100%" }}
                transition={{ 
                  repeat: Infinity, 
                  duration: 1.5, 
                  ease: "linear" 
                }}
              />
              <motion.div 
                className="absolute inset-0 bg-[#e8e2d6] origin-center"
                initial={{ scaleX: 0 }}
                whileHover={{ scaleX: 1 }}
                transition={{ duration: 0.6, ease: [0.21, 1, 0.36, 1] }}
              />
            </div>
          </motion.button>
        </div>
      </div>
    </motion.section>
  );
};

const ArtifactCard = ({ item, index }) => {
  const navigate = useNavigate();
  const [hov, setHov] = useState(false);

  const handleNav = () => {
    window.scrollTo(0, 0);
    navigate(`/templates/${item.id}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: index * 0.05, ease: [0.21, 1, 0.36, 1] }}
      viewport={{ once: true, margin: "-50px" }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={handleNav}
      className={`relative w-full ${item.h} break-inside-avoid cursor-pointer group rounded-2xl overflow-hidden bg-[#0d0d0f] border border-white/5 transition-all duration-500 hover:border-white/20`}
    >
      <motion.img
        src={item.img}
        alt={item.name}
        animate={{ scale: hov ? 1.05 : 1 }}
        transition={{ duration: 0.6 }}
        className="w-full h-full object-cover brightness-[0.85] group-hover:brightness-100 transition-all duration-500"
      />

      <div className="absolute inset-x-0 bottom-0 p-5 bg-gradient-to-t from-black/80 via-black/20 to-transparent">
        <div className="flex items-center justify-between w-full">
          <span className="text-[10px] font-mono font-black tracking-[0.3em] uppercase text-[#e8e2d6]">
            {item.name}
          </span>
          <span className={`text-[#e8e2d6] transition-transform duration-300 ${hov ? 'translate-x-1' : ''}`}>
            →
          </span>
        </div>
      </div>
    </motion.div>
  );
};

export default Home;