import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Zap, Sparkles } from 'lucide-react';

const LoadingScreen = () => {
  const letters = "DEVDROP".split("");
  
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#010103] overflow-hidden">
      {/* BACKGROUND ENERGY FIELD */}
      <motion.div 
        animate={{ 
          scale: [1, 1.2, 1],
          opacity: [0.1, 0.2, 0.1]
        }}
        transition={{ duration: 4, repeat: Infinity }}
        className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#9333ea_0%,_transparent_60%)]"
      />

      {/* THE CORE ASSEMBLY */}
      <div className="relative scale-110">
        <div className="flex justify-center items-center gap-2 perspective-[2000px]">
          {letters.map((l, i) => (
            <motion.span
              key={i}
              initial={{ 
                opacity: 0, 
                rotateY: -90, 
                z: -1000,
                filter: "blur(20px)"
              }}
              animate={{ 
                opacity: 1, 
                rotateY: 0, 
                z: 0,
                filter: "blur(0px)"
              }}
              transition={{ 
                duration: 1.5, 
                delay: i * 0.1, 
                ease: [0.16, 1, 0.3, 1] 
              }}
              className={`text-7xl md:text-9xl font-black tracking-tighter inline-block relative ${
                l === 'D' || l === 'P' ? 'text-purple-500' : 'text-white'
              }`}
            >
              {l}
              {/* Ghost Layer for Glow */}
              <motion.span 
                animate={{ opacity: [0, 0.5, 0] }}
                transition={{ duration: 2, repeat: Infinity, delay: i * 0.1 }}
                className="absolute inset-0 blur-2xl text-purple-600"
              >
                {l}
              </motion.span>
            </motion.span>
          ))}
        </div>

        {/* LOGO ICON REVEAL */}
        <motion.div 
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1.5, duration: 1 }}
          className="flex justify-center mt-10"
        >
          <div className="relative group">
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="absolute -inset-4 border border-dashed border-purple-500/30 rounded-full"
            />
            <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-[0_0_50px_rgba(168,85,247,0.5)]">
              <Zap className="w-10 h-10 text-black fill-black" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* SCANLINE EFFECT */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_bottom,transparent_50%,rgba(0,0,0,0.5)_50%)] bg-[length:100%_4px] opacity-10" />
    </div>
  );
};

export default LoadingScreen;