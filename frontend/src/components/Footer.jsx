import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const DevDropCompactFooter = () => {
  const [time, setTime] = useState("");

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString('en-GB', { 
        hour: '2-digit', minute: '2-digit', hour12: false 
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <footer className="relative w-full py-12 px-[6vw] bg-transparent overflow-hidden border-t border-white/5">
      
      {/* ─── THE TOP ROW: BRANDING & STATUS ─── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 border-b border-white/5 pb-8">
        <div className="flex items-center gap-6">
          <h2 className="text-3xl font-serif italic text-[#e8e2d6] tracking-tighter">devdrop</h2>
          <div className="h-4 w-[1px] bg-white/10 hidden md:block" />
          <p className="text-[9px] font-mono text-white/30 uppercase tracking-[0.5em]">Digital Artifact Marketplace</p>
        </div>
        
        <div className="mt-4 md:mt-0 flex items-center gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-[#e8e2d6]  animate-pulse" />
          <span className="text-[10px] font-mono text-[#e8e2d6]/60 uppercase tracking-widest">System Active / {time} IST</span>
        </div>
      </div>

      {/* ─── THE MAIN GRID ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-10 md:gap-4">
        
        {/* Column 1: Directory */}
        <div className="space-y-4">
          <h5 className="text-[12px] font-mono text-[#8b7355] uppercase tracking-[0.3em]">Navigation</h5>
          <ul className="space-y-2">
            {['Templates', 'Archive', 'Components'].map(link => (
              <li key={link} className="text-xs font-serif italic text-[#e8e2d6]/40 hover:text-[#e8e2d6] cursor-pointer transition-colors">
                {link}
              </li>
            ))}
          </ul>
        </div>

        {/* Column 2: Studio */}
        <div className="space-y-4">
          <h5 className="text-[12px] font-mono text-[#8b7355] uppercase tracking-[0.3em]">Studio</h5>
          <ul className="space-y-2">
            {['Process', 'Licensing', 'Contact'].map(link => (
              <li key={link} className="text-xs font-serif italic text-[#e8e2d6]/40 hover:text-[#e8e2d6] cursor-pointer transition-colors">
                {link}
              </li>
            ))}
          </ul>
        </div>

        {/* Column 3: Social */}
        <div className="space-y-4">
          <h5 className="text-[12px] font-mono text-[#8b7355] uppercase tracking-[0.3em]">Social</h5>
          <ul className="space-y-2">
            {['Instagram', 'Dribbble', 'X.com'].map(link => (
              <li key={link} className="text-xs font-serif italic text-[#e8e2d6]/40 hover:text-[#e8e2d6] cursor-pointer transition-colors">
                {link}
              </li>
            ))}
          </ul>
        </div>

        {/* Column 4: Invisible Spacer for Desktop */}
        <div className="hidden lg:block"></div>

        {/* Column 5: The "Legal" Anchor */}
        <div className="col-span-2 lg:col-span-1 flex flex-col justify-between items-start md:items-end text-left md:text-right">
          <div className="space-y-2">
             <p className="text-[9px] font-mono text-white/20 uppercase tracking-[0.2em] leading-relaxed">
               Boutique Design & <br /> Technical Excellence
             </p>
          </div>
          <p className="text-[8px] font-mono text-white/10 uppercase tracking-[0.4em] mt-8">
            © 2026 DEVDROP STUDIO
          </p>
        </div>
      </div>

      {/* Subtle Noise Overlay for Texture */}
      <div className="absolute inset-0 z-[-1] opacity-[0.03] pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
    </footer>
  );
};

export default DevDropCompactFooter;