import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const IntroLoader = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(onComplete, 1200); 
          return 100;
        }
        return prev + 1;
      });
    }, 30); 
    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <motion.div 
      exit={{ y: "-100%" }}
      transition={{ duration: 1.1, ease: [0.76, 0, 0.24, 1] }}
      className="fixed inset-0 z-[10000] bg-black flex flex-col items-center justify-center overflow-hidden"
    >
      {/* 1. YOUR IMAGE BACKGROUND */}
      <div 
        className="absolute inset-0 z-0 opacity-60"
        style={{ 
          backgroundImage: `url('/mesh-bg.png')`, // Replace with your file name
          backgroundSize: 'cover',
          backgroundPosition: 'center' 
        }}
      />

      <div className="relative z-10 flex flex-col items-center justify-center">
        
        {/* 2. THE FOLDER (Centered, No Shifting) */}
        <div className="relative flex flex-col items-center mb-12 scale-[1.3] md:scale-[1.5]">
          
          {/* Popping Website Cards (White, Light Brown, Dark Brown) */}
          <div className="absolute -top-10 flex gap-2">
            <AnimatePresence>
              {progress > 25 && <SolidCard color="bg-[#FFFFFF]" rot={-6} />}
              {progress > 55 && <SolidCard color="bg-[#D2B48C]" rot={0} height="h-20" />}
              {progress > 85 && <SolidCard color="bg-[#8B4513]" rot={6} />}
            </AnimatePresence>
          </div>

          {/* Premium Beige Folder */}
          <div className="relative z-20 drop-shadow-[0_25px_40px_rgba(0,0,0,0.6)]">
            <svg width="220" height="160" viewBox="0 0 180 140" fill="none">
              {/* Back part (Darker shade) */}
              <path d="M0 15C0 6.7 6.7 0 15 0H65L85 20H165C173.3 20 180 26.7 180 35V120C180 131 171 140 160 140H20C8.9 140 0 131 0 120V15Z" fill="#3d3830" />
              {/* Front flap (Main Beige) */}
              <motion.path 
                animate={{ rotateX: progress > 90 ? -25 : 0 }}
                style={{ transformOrigin: "bottom" }}
                d="M0 45C0 33.9 8.9 25 20 25H160C171 25 180 33.9 180 45V120C180 131 171 140 160 140H20C8.9 140 0 131 0 120V45Z" 
                fill="#e8e2d6" 
              />
            </svg>
          </div>
        </div>

        {/* 3. BOLD PROGRESS UI (Centered) */}
        <div className="w-80 md:w-96 px-4">
          <div className="flex justify-between items-baseline mb-4">
            <h2 className="text-[#e8e2d6] text-4xl font-serif italic tracking-tighter">devdrop</h2>
            <span className="text-[#e8e2d6] text-3xl font-light">{progress}%</span>
          </div>
          
          {/* Bold Progress Bar */}
          <div className="h-[10px] w-full border border-[#e8e2d6]/30 rounded-full p-[2px] overflow-hidden bg-black/20">
            <motion.div 
              className="h-full bg-[#e8e2d6] rounded-full shadow-[0_0_10px_rgba(232,226,214,0.3)]" 
              style={{ width: `${progress}%` }} 
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const SolidCard = ({ color, rot, height = "h-16" }) => (
  <motion.div
    initial={{ y: 40, opacity: 0 }}
    animate={{ y: 0, opacity: 1, rotate: rot }}
    className={`w-14 ${height} ${color} rounded-sm shadow-2xl border border-black/10`}
  />
);

export default IntroLoader;