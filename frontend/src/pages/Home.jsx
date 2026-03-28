import React, { useRef, useEffect, useState } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import secondVideo from '../assets/videos/v2.mp4'; 

const Home = ({ preloadedVideoRef, introComplete, fromIntro }) => (
  <div className="bg-[#050505] text-[#e8e2d6] selection:bg-[#e8e2d6] selection:text-black antialiased">
    <VideoHeroSection
      preloadedVideoRef={preloadedVideoRef}
      introComplete={introComplete}
      fromIntro={fromIntro}
    />
    
    <div className="relative z-10">
      <SmoothVideoSection />
    </div>
  </div>
);

/* ─── VIDEO HERO (BACKGROUND) ─── */
const VideoHeroSection = ({ preloadedVideoRef, introComplete, fromIntro }) => {
  const wrapperRef = useRef(null);
  const hasAppended = useRef(false);
  const [visible, setVisible] = useState(false);
  const { scrollY } = useScroll();

  // Background video subtly shrinks and blurs as foreground arrives
  const videoScale = useTransform(scrollY, [0, 1000], [1.05, 1]);
  const videoBlur  = useTransform(scrollY, [200, 800], ["blur(0px)", "blur(10px)"]);
  const opacity    = useTransform(scrollY, [0, 800], [1, 0.55]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || hasAppended.current) return;
    const vid = preloadedVideoRef?.current;
    if (!vid) return;
    vid.className = 'w-full h-full object-cover';
    wrapper.appendChild(vid);
    hasAppended.current = true;
    return () => { if (wrapper.contains(vid)) wrapper.removeChild(vid); hasAppended.current = false; };
  }, []);

  useEffect(() => {
    if (!introComplete) return;
    const vid = preloadedVideoRef?.current;
    if (fromIntro?.current) {
      fromIntro.current = false;
      setVisible(true);
      vid?.play().catch(() => {});
    } else {
      const timer = setTimeout(() => { setVisible(true); vid?.play().catch(() => {}); }, 500);
      return () => clearTimeout(timer);
    }
  }, [introComplete]);

  return (
    <motion.section className="sticky top-0 h-screen overflow-hidden z-0" animate={{ opacity: visible ? 1 : 0 }}>
      <motion.div style={{ scale: videoScale, filter: videoBlur, opacity }} className="absolute inset-0">
        <div ref={wrapperRef} className="w-full h-full" />
      </motion.div>
    </motion.section>
  );
};

/* ─── SMOOTH VIDEO SECTION (PORTAL REVEAL) ─── */
const SmoothVideoSection = () => {
  const targetRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start end", "end start"]
  });

  // Smooth "Liquid" physics
  const smoothP = useSpring(scrollYProgress, { stiffness: 40, damping: 24 });

  // Matching the UI Screenshot geometry
  const width = useTransform(smoothP, [0.1, 0.45], ["60%", "92%"]);
  const height = useTransform(smoothP, [0.1, 0.45], ["65vh", "88vh"]);
  const borderRadius = useTransform(smoothP, [0.1, 0.45], ["80px", "54px"]);
  const cardY = useTransform(smoothP, [0, 0.4], [100, 0]); // "Lift" effect
  
  // Floating Controls (Search/Collection bar from your image)
  const controlsOp = useTransform(smoothP, [0.35, 0.5], [0, 1]);
  const controlsY  = useTransform(smoothP, [0.35, 0.5], [10, 0]);

  return (
    <section ref={targetRef} className="h-[200vh] relative">
      <div className="sticky top-0 h-screen w-full flex items-center justify-center z-10">
        
        {/* The Video Card */}
        <motion.div 
          style={{ 
            width, 
            height,
            borderRadius, 
            y: cardY,
            boxShadow: "0 50px 100px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.08)" 
          }} 
          className="relative overflow-hidden bg-[#121212] group"
        >
          {/* Inner Video with Parallax */}
          <motion.div 
            style={{ scale: useTransform(smoothP, [0.1, 0.6], [1.2, 1]) }}
            className="w-full h-full"
          >
            <video
              src={secondVideo}
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover opacity-90 transition-opacity duration-700 group-hover:opacity-100"
            />
          </motion.div>

          {/* Frosted Border Gradient (Bottom) */}
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
          
          {/* Subtle Label */}
          <div className="absolute bottom-10 left-10">
             <h3 className="text-xl font-serif italic tracking-tight opacity-40">visual perspective</h3>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Home;