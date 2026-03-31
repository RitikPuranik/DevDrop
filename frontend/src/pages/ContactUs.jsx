import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, MapPin, Phone, ArrowUpRight, MessageSquare, Headphones } from 'lucide-react';

const ClassyObsidianTransition = () => {
  const [stage, setStage] = useState(1); // 1: Intro, 2: Reveal, 3: Final UI

  useEffect(() => {
    const timer1 = setTimeout(() => setStage(2), 1500); // Start Wipe
    const timer2 = setTimeout(() => setStage(3), 3000); // UI Active
    return () => { clearTimeout(timer1); clearTimeout(timer2); };
  }, []);

  return (
    <div className="relative h-screen w-full bg-[#050505] text-[#e5e2da] overflow-hidden font-serif">
      
      {/* 1. THE CLASSY NAVBAR (Always Visible, Primary Anchor) */}
      <nav className="fixed top-0 w-full p-8 flex justify-between items-center z-[100] mix-blend-difference">
        <motion.div 
          initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="text-[10px] tracking-[0.6em] font-bold uppercase"
        >
          Studio / Archive®
        </motion.div>
        <motion.div 
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          className="flex gap-8 text-[10px] tracking-widest uppercase opacity-40"
        >
          <span>Work</span>
          <span>About</span>
          <span className="text-white opacity-100 underline underline-offset-8">Contact</span>
        </motion.div>
      </nav>

      <AnimatePresence>
        {/* 2. THE INTRO CURTAIN (Inspired by Image 4 Elements) */}
        {stage < 3 && (
          <motion.div
            key="curtain"
            initial={{ y: 0 }}
            exit={{ y: "-100%" }}
            transition={{ duration: 1.2, ease: [0.76, 0, 0.24, 1] }}
            className="absolute inset-0 z-50 bg-[#ff8a7a] flex items-center justify-center"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, y: -100 }}
              className="flex gap-12"
            >
              {[MapPin, Mail, Phone].map((Icon, i) => (
                <div key={i} className="p-8 bg-white rounded-full shadow-2xl text-[#4b32c8]">
                  <Icon size={40} strokeWidth={1.5} />
                </div>
              ))}
            </motion.div>
            {/* Grid Pattern Overlay */}
            <div className="absolute inset-0 opacity-10 pointer-events-none" 
                 style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. THE FINAL OBSIDIAN UI (Image 5 & 6 Logic) */}
      <motion.main 
        initial={{ opacity: 0, scale: 1.1 }}
        animate={stage === 3 ? { opacity: 1, scale: 1 } : {}}
        transition={{ duration: 1, ease: "easeOut" }}
        className="relative h-full w-full flex flex-col justify-center px-8 md:px-24"
      >
        <div className="grid lg:grid-cols-2 gap-20 items-center">
          
          {/* Left: Editorial Content */}
          <div className="space-y-12">
            <div className="space-y-2">
              <motion.span 
                initial={{ opacity: 0 }} animate={stage === 3 ? { opacity: 0.4 } : {}}
                className="text-[10px] tracking-[0.5em] uppercase font-sans"
              >
                Inquiries / 2026
              </motion.span>
              <h1 className="text-[clamp(3rem,8vw,6rem)] leading-[0.9] font-medium tracking-tighter">
                Want to start <br /> <span className="italic font-light">a new project?</span>
              </h1>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <SupportCard 
                title="Sales" 
                icon={<MessageSquare size={20} />} 
                desc="Strategy and brand architecture." 
              />
              <SupportCard 
                title="Support" 
                icon={<Headphones size={20} />} 
                desc="Ongoing digital maintenance." 
              />
            </div>
          </div>

          {/* Right: The Persona "Artifact" */}
          <div className="relative flex justify-center">
            <motion.div 
              initial={{ opacity: 0, x: 50 }}
              animate={stage === 3 ? { opacity: 1, x: 0 } : {}}
              className="relative w-[380px] h-[520px] bg-[#111] rounded-[2rem] overflow-hidden border border-white/5"
            >
              <img 
                src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80" 
                className="w-full h-full object-cover grayscale opacity-40 hover:opacity-100 transition-opacity duration-1000"
                alt="Persona"
              />
              
              {/* Floating Black Retro Phone (The image 5 anchor) */}
              <motion.div 
                animate={{ y: [0, -15, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute bottom-10 -left-10 p-6 bg-white text-black rounded-3xl shadow-2xl"
              >
                <Phone size={40} fill="black" />
              </motion.div>
            </motion.div>
          </div>

        </div>
      </motion.main>

      {/* Decorative Corner Element (Image 1 squiggle vibe) */}
      <div className="absolute bottom-10 right-10 opacity-20 pointer-events-none">
        <svg width="100" height="40" viewBox="0 0 100 40">
          <path d="M0 20 Q 25 0, 50 20 T 100 20" fill="none" stroke="currentColor" strokeWidth="0.5" />
        </svg>
      </div>
    </div>
  );
};

const SupportCard = ({ title, icon, desc }) => (
  <motion.div 
    whileHover={{ backgroundColor: "rgba(255,255,255,0.03)" }}
    className="p-8 rounded-2xl border border-white/5 space-y-4 transition-colors group cursor-pointer"
  >
    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-[#ff8a7a]">
      {icon}
    </div>
    <div className="space-y-1">
      <h3 className="text-lg font-medium">{title}</h3>
      <p className="text-[10px] text-white/30 tracking-widest uppercase">{desc}</p>
    </div>
    <ArrowUpRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity text-[#ff8a7a]" />
  </motion.div>
);

export default ClassyObsidianTransition;