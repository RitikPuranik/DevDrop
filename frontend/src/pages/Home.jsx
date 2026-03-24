import React, { useRef, useState, useEffect } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';

const Home = () => (
  <div className="bg-black text-[#e8e2d6] selection:bg-[#e8e2d6] selection:text-black">
    <VideoHeroSection />
    <div className="relative z-10">
      <SmoothImageSection />
      <FuelUpSection />
    </div>
    <footer className="h-[60vh] flex items-center justify-center border-t border-[#e8e2d6]/10">
      <h2 className="text-[10vw] font-serif italic opacity-20">devdrop</h2>
    </footer>
  </div>
);

const VideoHeroSection = () => {
  const videoRef = useRef(null);
  const [ready, setReady] = useState(false);

  const { scrollY } = useScroll();
  const videoScale     = useTransform(scrollY, [0, 700], [1, 1.12]);
  const sectionOpacity = useTransform(scrollY, [0, 520], [1, 0]);
  const overlayOpacity = useTransform(scrollY, [0, 450], [0, 0.9]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onReady = () => { setReady(true); v.play().catch(() => {}); };
    v.addEventListener('canplaythrough', onReady);
    return () => v.removeEventListener('canplaythrough', onReady);
  }, []);

  return (
    <section className="sticky top-0 h-screen overflow-hidden z-0">
      {/* VIDEO */}
      <motion.div style={{ scale: videoScale }} className="absolute inset-0">
        <video
          ref={videoRef}
          src="/dewdrop.s3.mp4"
          muted playsInline preload="auto"
          className="w-full h-full object-cover"
          style={{ filter: 'brightness(0.8) contrast(1.12) saturate(0.85)' }}
        />
      </motion.div>

      {/* LETTERBOX */}
      <div className="absolute top-0 left-0 right-0 h-[6vh] bg-black pointer-events-none z-10" />
      <div className="absolute bottom-0 left-0 right-0 h-[6vh] bg-black pointer-events-none z-10" />

      {/* VIGNETTE */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 75% 75% at 50% 50%, transparent 25%, rgba(0,0,0,0.7) 100%)'
      }} />

      {/* GRAIN */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.04]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundSize: '180px',
      }} />

      {/* SCROLL FADE */}
      <motion.div style={{ opacity: overlayOpacity }} className="absolute inset-0 bg-black pointer-events-none" />

      {/* SCROLL HINT */}
      <motion.div style={{ opacity: sectionOpacity }}
        className="absolute bottom-[8vh] left-0 right-0 flex justify-center z-20 pointer-events-none">
        <motion.div
          animate={{ y: [0, 9, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}
        >
          <span style={{ fontFamily:"'Playfair Display',serif", fontSize:'.55rem', letterSpacing:'.35em', color:'rgba(232,226,214,.35)', textTransform:'uppercase' }}>scroll</span>
          <div style={{ width:1, height:44, background:'linear-gradient(to bottom, rgba(232,226,214,.4), transparent)' }} />
        </motion.div>
      </motion.div>
    </section>
  );
};

const SmoothImageSection = () => {
  const { scrollYProgress } = useScroll();
  const scale  = useTransform(scrollYProgress, [0.1, 0.3], [0.8, 1]);
  const rotate = useTransform(scrollYProgress, [0.1, 0.3], [5, 0]);
  return (
    <section className="h-screen flex items-center justify-center px-6">
      <motion.div style={{ scale, rotate }} className="w-full h-[80vh] overflow-hidden rounded-xl">
        <div className="w-full h-full bg-[#1a1a1a]">
          <img src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2070&auto=format&fit=crop"
            className="w-full h-full object-cover opacity-60 grayscale hover:grayscale-0 transition-all duration-1000" alt="Architecture" />
        </div>
      </motion.div>
    </section>
  );
};

const FuelUpSection = () => {
  const sectionRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'end start'] });
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 150, damping: 30, restDelta: 0.001 });
  return (
    <section ref={sectionRef} className="relative h-[180vh] bg-black">
      <div className="sticky top-0 h-screen w-full flex flex-col items-center justify-center px-6 overflow-hidden">
        <div className="relative flex flex-col items-center text-center max-w-[95vw]">
          <ScrubLine text="Stir Up Your" progress={smoothProgress} range={[0.1, 0.2]} /><br />
          <div className="relative flex flex-col items-center -my-4 z-10">
            <ScrubLine text="Fearless Past And" progress={smoothProgress} range={[0.15, 0.25]} />
            <motion.div style={{
              scale: useTransform(smoothProgress, [0.25, 0.35], [0, 1]),
              rotate: useTransform(smoothProgress, [0.25, 0.35], [-12, -4]),
              opacity: useTransform(smoothProgress, [0.25, 0.28], [0, 1]),
            }} className="bg-[#d2904b] text-black px-10 py-3 -my-6 relative z-20 select-none border-8 border-black">
              <span className="text-[6vw] font-black uppercase leading-none tracking-tighter italic">Fuel Up</span>
            </motion.div>
            <ScrubLine text="Your Future With" progress={smoothProgress} range={[0.35, 0.45]} />
          </div>
          <motion.span style={{ opacity: useTransform(smoothProgress, [0.45, 0.5], [0.1, 0.4]) }}
            className="text-[4vw] font-serif italic lowercase text-[#f4e6d9] mt-2 mb-0">every</motion.span>
          <ScrubLine text="Gulp of Perfect Protein" progress={smoothProgress} range={[0.5, 0.6]} isSubText={true} />
        </div>
      </div>
    </section>
  );
};

const ScrubLine = ({ text, progress, range, isSubText = false }) => {
  const words = text.split(' ');
  return (
    <span className={`flex flex-wrap justify-center gap-[0.3em] font-black uppercase tracking-tighter text-[#f4e6d9] leading-[0.8] ${isSubText ? 'text-[5.5vw]' : 'text-[8.5vw]'} relative z-0`}>
      {words.map((word, i) => {
        const start = range[0] + (i * (range[1] - range[0]) / words.length);
        const end = start + (range[1] - range[0]) / words.length;
        return <IndividualWord key={i} word={word} progress={progress} range={[start, end]} />;
      })}
    </span>
  );
};

const IndividualWord = ({ word, progress, range }) => {
  const opacity = useTransform(progress, range, [0.15, 1]);
  const y = useTransform(progress, range, [8, 0]);
  return <motion.span style={{ opacity, y }} className="inline-block">{word}</motion.span>;
};

export default Home;