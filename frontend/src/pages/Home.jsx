import React, { useRef, useEffect, useState } from 'react';
import { motion, useScroll, useTransform, useSpring, AnimatePresence } from 'framer-motion';
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

const Home = ({ preloadedVideoRef, introComplete, fromIntro }) => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    const timer = setTimeout(() => setIsReady(true), 150);
    return () => clearTimeout(timer);
  }, []);

  const showContent = introComplete || isReady;

  return (
    <div className="bg-[#050505] text-[#e8e2d6] selection:bg-[#e8e2d6] selection:text-black antialiased">
      <VideoHeroSection
        preloadedVideoRef={preloadedVideoRef}
        introComplete={showContent}
        fromIntro={fromIntro}
      />
      
      <div className="relative z-10">
        <SmoothVideoSection />
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

  // Separate effect: handles play timing based on entry route
  useEffect(() => {
  if (!introComplete) return;

  const vid = preloadedVideoRef?.current;
  if (!vid) return;

  const comingFromIntro = fromIntro?.current === true;

  if (comingFromIntro) {
    fromIntro.current = false;
    setVisible(true);
    // ✅ Video already playing from App.jsx — just show it, don't restart
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
/* ─── TEMPLATES MASONRY ─── */
const TemplatesMasonry = ({ introComplete }) => {
  const navigate = useNavigate();

  return (
    <motion.section 
      initial={{ opacity: 0 }}
      animate={{ opacity: introComplete ? 1 : 0 }}
      transition={{ duration: 0.8 }}
      className="relative z-20 bg-[#050505] pt-10 pb-32 px-6"
    >
      <div className="max-w-[1400px] mx-auto">
        {/* The Grid */}
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
            {/* Using a refined Serif font for a high-fashion/studio look */}
            <span className="text-xl md:text-2xl font-serif italic tracking-tight text-[#e8e2d6]/50 group-hover:text-[#e8e2d6] transition-all duration-700">
                 See more options
            </span>
            
      

            {/* Premium Underline: Expands from center */}
            <div className="relative mt-4 w-40 h-[1px] bg-white/5 overflow-hidden">
              <motion.div 
                className="absolute inset-0 bg-gradient-to-r from-transparent via-orange-500 to-transparent"
                initial={{ x: "-100%" }}
                whileHover={{ x: "100%" }}
                transition={{ 
                  repeat: Infinity, 
                  duration: 1.5, 
                  ease: "linear" 
                }}
              />
              {/* Static hover line */}
              <motion.div 
                className="absolute inset-0 bg-orange-500 origin-center"
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

      {/* Persistent Information Label (Always Colorful/Visible) */}
      <div className="absolute inset-x-0 bottom-0 p-5 bg-gradient-to-t from-black/80 via-black/20 to-transparent">
        <div className="flex items-center justify-between w-full">
          <span className="text-[10px] font-mono font-black tracking-[0.3em] uppercase text-[#e8e2d6]">
            {item.name}
          </span>
          <span className={`text-orange-500 font-bold transition-transform duration-300 ${hov ? 'translate-x-1' : ''}`}>
            →
          </span>
        </div>
      </div>
    </motion.div>
  );
};

export default Home;