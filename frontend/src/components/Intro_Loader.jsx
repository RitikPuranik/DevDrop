import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const LETTERS = "devdrop".split("");
const TAGLINE = "WE BUILD WE BREAK WE FIX WE SHIP";

const CinematicLoader = ({ onComplete }) => {
  const [phase, setPhase] = useState(1);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Smooth non-linear increments
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev < 100) return prev + 1;
        return 100;
      });
    }, 40); // Slightly slower for a more premium feel

    const timers = [
      setTimeout(() => setPhase(2), 2400), // Show Tagline & Bar
      setTimeout(() => setPhase(3), 5200), // Start Exit Dissolve
      setTimeout(() => onComplete(), 7000), // Unmount
    ];
    
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(interval);
    };
  }, [onComplete]);

  const springTransition = {
    type: "spring",
    stiffness: 35,
    damping: 12,
    mass: 0.8,
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#030303] overflow-hidden">
      
      {/* ── FILM GRAIN OVERLAY ── */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.04] z-50 mix-blend-screen"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }}
      />

      <AnimatePresence>
        {phase < 3 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ 
              filter: "blur(40px)",
              scale: 1.05,
              opacity: 0,
              transition: { duration: 1.8, ease: [0.76, 0, 0.24, 1] }
            }}
            className="relative flex flex-col items-center w-full"
          >
            {/* ── THE LOGO ── */}
            <div className="flex items-center mb-4">
              {LETTERS.map((char, i) => (
                <motion.span
                  key={i}
                  initial={{ 
                    opacity: 0, 
                    x: (i - 3) * 100, 
                    y: (i % 2 === 0 ? -40 : 40),
                    filter: "blur(20px)",
                    scale: 1.2,
                  }}
                  animate={{ 
                    opacity: 1, 
                    x: 0, 
                    y: 0, 
                    filter: "blur(0px)",
                    scale: 1,
                  }}
                  transition={{ 
                    ...springTransition,
                    delay: i * 0.1,
                  }}
                  className="font-serif italic text-[14vw] md:text-[9vw] text-[#e8e2d6] leading-none px-1 select-none"
                  style={{ textShadow: '0 0 40px rgba(232,226,214,0.15)' }}
                >
                  {char}
                </motion.span>
              ))}
            </div>

            {/* ── PROGRESS SECTION ── */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={phase >= 2 ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center w-full mt-16"
            >
              {/* Tagline: Positioned well above the bar */}
              <div className="font-mono text-[9px] md:text-[11px] tracking-[0.4em] text-[#e8e2d6]/30 uppercase mb-24">
                {TAGLINE}
              </div>

              {/* Progress Bar Container */}
              <div className="relative w-56 md:w-80 h-[2px] bg-[#e8e2d6]/10">
                
                {/* Floating Percentage: Glides above the bar tip */}
                <motion.span 
                  className="absolute bottom-4 font-mono text-[10px] text-[#e8e2d6]/80 tabular-nums -translate-x-1/2"
                  animate={{ left: `${progress}%` }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                >
                  {progress}%
                </motion.span>

                {/* Animated Loading Line */}
                {/* Loading Bar Container - h-[8px] for boldness, rounded-full for curves */}
<div className="relative w-56 md:w-80 h-[8px] bg-[#e8e2d6]/10 rounded-full overflow-hidden">
  <motion.div 
    initial={{ width: "0%" }}
    animate={{ width: `${progress}%` }}
    transition={{ duration: 0.4, ease: "easeOut" }}
    className="h-full bg-[#e8e2d6] rounded-full shadow-[0_0_20px_rgba(232,226,214,0.6)]"
  />
</div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CINEMATIC EXIT RADIALLY ── */}
      <AnimatePresence>
        {phase === 3 && (
          <motion.div 
            initial={{ clipPath: 'circle(0% at 50% 50%)', opacity: 1 }}
            animate={{ clipPath: 'circle(150% at 50% 50%)', opacity: 0 }}
            transition={{ duration: 2.2, ease: [0.76, 0, 0.24, 1] }}
            className="absolute inset-0 bg-[#030303] z-[10001] pointer-events-none"
          >
             <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.1, 0] }}
                className="absolute inset-0 bg-[#e8e2d6]"
             />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CinematicLoader;