import React, { useRef, useEffect, useState } from 'react';
import { motion, useScroll, useTransform, useSpring, useInView } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
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
        <TemplatesMasonry introComplete={showContent} />
        {/* STRUCTURALLY RE-BALANCED EXPLICIT MATRIX GRID REVEAL */}
        <TemplatesGridReveal introComplete={showContent} />
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
  const videoBlur   = useTransform(scrollY, [200, 800], ["blur(0px)", "blur(10px)"]);
  const opacity     = useTransform(scrollY, [0, 800], [1, 0.55]);

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

/* ─── TEMPLATES MASONRY ─── */
const TemplatesMasonry = ({ introComplete }) => {
  const navigate = useNavigate();

  return (
    <motion.section 
      initial={{ opacity: 0 }}
      animate={{ opacity: introComplete ? 1 : 0 }}
      transition={{ duration: 0.8 }}
      className="relative z-20 bg-[#050505] pt-24 pb-24 px-6"
    >
      <div className="-mt-80 max-w-[1400px] mx-auto">
        
        <div className="text-center space-y-4 mb-16">
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
    navigate(`/template`);
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

/* ─── DYNAMIC GEOMETRIC REVEAL CONTAINER ─── */
const TemplatesGridReveal = ({ introComplete }) => {
  const containerRef = useRef(null);
  
  // FIXED: Changed once: true to once: false so the pop-up spring animation triggers every single time you scroll here
  const isSectionInView = useInView(containerRef, { once: false, amount: 0.15 });

  // Progressive ripple sequencing: Center expands slightly ahead of outer boundaries
  const getOutwardDelay = (customId) => {
    switch(customId) {
      case 'center-top':
      case 'center-bottom':
        return 0.15; 
      case 'left-tall-column':
      case 'right-tall-column':
      case 'bottom-left-panel':
        return 0.42; 
      case 'bottom-right-panel':
      case 'bottom-right-corner':
        return 0.65; 
      case 'bottom-wide':
        return 0.75;
      default:
        return 0.4;
    }
  };

  const structuralAnimationVariants = {
    hidden: { scale: 0.45, opacity: 0 },
    visible: (customId) => ({ 
      scale: 1, 
      opacity: 1,
      transition: { 
        type: "spring", 
        stiffness: 55, 
        damping: 15,
        mass: 1.15,
        delay: getOutwardDelay(customId)
      }
    })
  };

  const centerPieceVariants = {
    hidden: { scale: 0, x: "-50%", y: "-50%" },
    visible: { 
      scale: 1, 
      x: "-50%", 
      y: "-50%",
      transition: { type: "spring", stiffness: 45, damping: 12, delay: 0.3 }
    }
  };

  return (
    <motion.section 
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: introComplete ? 1 : 0 }}
      transition={{ duration: 0.8 }}
      className="relative z-20 bg-[#050505] pb-36 px-6 md:px-12 lg:px-16 select-none"
    >
      <div className="max-w-[1400px] mx-auto relative">
        
        {/* Precise 4-Column Mosaic Matrix Grid wrapper */}
        <motion.div 
          initial="hidden"
          animate={isSectionInView ? "visible" : "hidden"}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 auto-rows-[240px] gap-6 relative"
        >
          
          {/* Tile 1: Left Vertical Master Column Block */}
          <motion.div 
            variants={structuralAnimationVariants} custom="left-tall-column" style={{ originX: 0, originY: 0 }}
            className="lg:col-span-1 lg:row-span-2 bg-[#0d0d10] p-8 rounded-3xl flex flex-col justify-between cursor-pointer border border-white/5 hover:border-white/20 transition-all duration-300"
          >
            <div>
              <h2 className="text-2xl font-serif italic text-[#e8e2d6] leading-[1.2]">Best Quality</h2>
            </div>
            <p className="text-xl text-[#e8e2d6]/60 font-mono">Get best quality website </p>
          </motion.div>

          {/* Tile 2: Center Wide Core Title Block */}
          <motion.div 
            variants={structuralAnimationVariants} custom="center-top" style={{ originX: 0.5, originY: 0.3 }}
            className="sm:col-span-2 lg:col-span-2 bg-[#111115] p-8 rounded-3xl flex flex-col justify-between border border-white/5 relative"
          >
           
            <div className="mt-5">
              <h1 className="text-3xl md:text-4xl font-serif text-[#e8e2d6] tracking-tight leading-tight mb-4">Devdrop give website with full documentation and authorization</h1>
              <div className="flex gap-8 text-xs font-mono text-[#e8e2d6]/40">
                <span>✦ 100% your website once sold</span>
                <span>✦ 400% Output Rate</span>
              </div>
            </div>
          </motion.div>

          {/* Tile 3: Right Vertical Column Media Block */}
          <motion.div 
            variants={structuralAnimationVariants} custom="right-tall-column" style={{ originX: 1, originY: 0 }}
            className="lg:col-span-1 lg:row-span-2 rounded-3xl overflow-hidden cursor-pointer border border-white/5 bg-[#0d0d10] relative group"
          >
            <img src={ARTIFACTS[2].img} alt={ARTIFACTS[2].name} className="w-full h-full object-cover opacity-80 group-hover:scale-105 group-hover:opacity-100 transition-all duration-700" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent p-6 flex flex-col justify-end">
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#e8e2d6]/50">{ARTIFACTS[2].name}</span>
            </div>
          </motion.div>

          {/* Tile 4: Bottom Row Left Accent Block */}
          <motion.div 
            variants={structuralAnimationVariants} custom="bottom-left-panel" style={{ originX: 0.2, originY: 1 }}
           className="lg:col-span-1 rounded-3xl overflow-hidden cursor-pointer border border-white/5 bg-[#0d0d10] relative group"
          >
             <img src={ARTIFACTS[4].img} alt={ARTIFACTS[4].name} className="w-full h-full object-cover opacity-50 group-hover:scale-105 transition-all duration-700" />
            <div className="absolute inset-0 p-6 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/20 to-transparent">
              <span className="text-xs font-mono text-[#e8e2d6]/70">{ARTIFACTS[4].name} Space</span>
            </div>
          </motion.div>

          {/* Tile 5: Bottom Center Core Critique Block */}
          <motion.div 
            variants={structuralAnimationVariants} custom="center-bottom" style={{ originX: 0.5, originY: 0.8 }}
            className="lg:col-span-1 bg-[#16161c] p-8 rounded-3xl flex flex-col justify-between border border-white/5"
          >
            <div>
              <span className="text-[10px] font-mono tracking-[0.3em] uppercase text-[#e8e2d6]/30 block mb-3">CRITIQUE PRESS</span>
              <p className="text-xs italic font-serif text-[#e8e2d6]/80 line-clamp-4">"{REVIEWS[1].quote}"</p>
            </div>
            <span className="text-[9px] font-mono uppercase tracking-widest text-[#e8e2d6]/40">{REVIEWS[1].author}</span>
          </motion.div>

          {/* Tile 6: Bottom Right Inner Supplementary Text Card */}
          <motion.div 
            variants={structuralAnimationVariants} custom="bottom-right-panel" style={{ originX: 0.8, originY: 1 }}
            className="lg:col-span-1 bg-[#0d0d10] p-8 rounded-3xl flex flex-col justify-end border border-white/5 cursor-pointer group"
          >
            <h3 className="text-xl font-serif italic text-[#e8e2d6]/70 group-hover:text-[#e8e2d6] transition-colors leading-snug">Living Catalog Architecture</h3>
          </motion.div>

          {/* Tile 7: Restored Bottom Right Edge Grid Tile */}
          <motion.div 
            variants={structuralAnimationVariants} custom="bottom-right-corner" style={{ originX: 1, originY: 1 }}
            className="lg:col-span-1 rounded-3xl overflow-hidden cursor-pointer border border-white/5 bg-[#0d0d10] group relative"
          >
            <img src={ARTIFACTS[7].img} alt={ARTIFACTS[7].name} className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-700" />
            <div className="absolute inset-0 bg-black/50 p-6 flex flex-col justify-between">
              <span className="text-[9px] font-mono tracking-[0.2em] text-[#e8e2d6]/40 uppercase">SYSTEM EDGE</span>
              <span className="text-xs font-mono text-[#e8e2d6] self-end">✦ PREVIEW</span>
            </div>
          </motion.div>
          
          {/* Tile 8: Bottom Wide Panel */}
          <motion.div
            variants={structuralAnimationVariants}
            custom="bottom-wide"
            style={{ originX: 1, originY: 1 }}
            className="lg:col-span-2 lg:col-start-3 lg:row-start-3 bg-[#111115] rounded-3xl border border-white/5 p-8 flex items-center justify-between overflow-hidden relative"
          >
            <div>
              <span className="text-[10px] uppercase tracking-[0.3em] text-[#e8e2d6]/40 font-mono">
                WHY CHOOSE US
              </span>
              <h2 className="mt-4 text-3xl md:text-4xl font-serif text-[#e8e2d6] leading-tight">
                Trusted Marketplace<br />For Premium Websites
              </h2>
            </div>

            <div className="flex gap-10">
              <div className="text-center">
                <h3 className="text-4xl font-serif text-[#e8e2d6]">500+</h3>
                <p className="text-xs text-[#e8e2d6]/50">Projects</p>
              </div>
              <div className="text-center">
                <h3 className="text-4xl font-serif text-[#e8e2d6]">98%</h3>
                <p className="text-xs text-[#e8e2d6]/50">Satisfaction</p>
              </div>
              <div className="text-center">
                <h3 className="text-4xl font-serif text-[#e8e2d6]">24/7</h3>
                <p className="text-xs text-[#e8e2d6]/50">Support</p>
              </div>
            </div>
          </motion.div>
            
          {/* ─── THE FLOATING REVEAL CENTERPIECE OVERLAP CIRCLE (PERFECTLY ABSOLUTE CENTERED) ─── */}
          <motion.div 
            variants={centerPieceVariants}
            className="absolute hidden lg:block top-1/2 left-1/2 w-[250px] h-[250px] bg-[#050505] rounded-full p-3 shadow-[0_30px_70px_rgba(0,0,0,0.9)] z-30 pointer-events-auto"
          >
            <div className="w-full h-full rounded-full bg-gradient-to-br from-[#16161c] to-[#0d0d10] border border-white/10 flex items-center justify-center">
              <div className="text-center px-6">
                <h2 className="text-4xl md:text-5xl font-serif italic text-[#e8e2d6] leading-none">Why</h2>
                <h2 className="text-5xl md:text-6xl font-serif text-[#e8e2d6] leading-none my-1">Choose</h2>
                <h2 className="text-4xl md:text-5xl font-serif italic text-[#e8e2d6] leading-none">Us</h2>
              </div>
            </div>
          </motion.div>

        </motion.div>
      </div>
    </motion.section>
  );
};

export default Home;