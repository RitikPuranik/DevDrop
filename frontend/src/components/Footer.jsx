import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const DevDropStudioFooter = () => {
  const [time, setTime] = useState("");

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <footer className="w-full bg-[#050505] font-sans selection:bg-[#E31E24] selection:text-white">
      
      {/* ─── SECTION 1: THE ARC (Newsletter Area) ─── */}
      <div className="relative overflow-hidden bg-transparent pt-10">
        <div 
          className="relative bg-[#e8e2d6] pt-20 pb-24 px-6 flex flex-col items-center justify-center text-center"
          style={{ clipPath: 'ellipse(100% 100% at 50% 100%)' }}
        >
          {/* FLOATING STICKERS: Anchored to the color-change line */}
          <GeometricShard bottom="10px" left="15%" rotate={15} size={70} color="#E31E24" opacity={0.4} />
          <GeometricShard bottom="20px" left="40%" rotate={-10} size={50} color="#050505" opacity={0.2} />
          <GeometricShard bottom="5px" right="20%" rotate={45} size={60} color="#E31E24" opacity={0.3} />
          <GeometricShard bottom="10px" right="5%" rotate={-25} size={40} color="#050505" opacity={0.15} />

          <div className="relative z-10 max-w-2xl">
            <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter italic text-[#050505] mb-4">
              Subscribe to <span className="text-[#E31E24]">Perspective</span>
            </h2>
            <p className="text-[10px] uppercase tracking-[0.4em] font-bold opacity-40 mb-10 max-w-md mx-auto">
              to stay up to date on all the latest builds
            </p>

            {/* THE PILL INPUT (Sleek sizing like reference) */}
            <div className="relative flex items-center bg-white rounded-full p-1.5 w-full max-w-lg mx-auto shadow-xl border border-black/5">
              <input 
                type="email" 
                placeholder="Enter your email address" 
                className="flex-1 bg-transparent text-[#050505] px-6 outline-none text-[10px] font-bold placeholder:opacity-30"
              />
              <button className="bg-[#E31E24] text-white px-8 py-3.5 rounded-full font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all duration-500 shadow-md">
                Subscribe
              </button>
            </div>
          </div>
        </div>
      </div>

    

      {/* ─── SECTION 3: DIRECTORY (Bottom Layout) ─── */}
      <div className="bg-[#050505] text-[#e8e2d6] py-16 px-[8vw] border-t border-white/5">
        <div className="max-w-[1200px] mx-auto grid grid-cols-2 lg:grid-cols-4 gap-12">
          <LinkGroup title="Product Categories" links={['Web Architecture', 'Branding', 'Motion Studio', 'Bento Systems']} />
          <LinkGroup title="Resources" links={['Our Story', 'Process', 'Privacy Policy', 'Sitemap']} />
          <LinkGroup title="Follow Us On" links={['Instagram', 'LinkedIn', 'X.com', 'Dribbble']} />
          
          <div className="space-y-6">
            <h5 className="text-[#E31E24] text-[10px] font-black uppercase tracking-[0.3em]">Build Stack</h5>
            <div className="grid grid-cols-4 gap-2 opacity-10">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-7 w-full border border-[#e8e2d6] rounded-sm flex items-center justify-center text-[5px] font-bold italic">DEV</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

/* --- Abstract SVG Geometric Sticker --- */
const GeometricShard = ({ top, bottom, left, right, rotate, size, color, opacity }) => (
  <motion.div 
    initial={{ y: 20, opacity: 0 }}
    whileInView={{ y: 0, opacity: opacity }}
    animate={{ 
        rotate: [rotate, rotate + 8, rotate],
        y: [0, -10, 0] 
    }}
    transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
    className="absolute pointer-events-none z-20"
    style={{ top, bottom, left, right }}
  >
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ filter: 'drop-shadow(0px 4px 4px rgba(0,0,0,0.1))' }}>
      <path d="M50 10L90 90H10L50 10Z" fill={color} fillOpacity={0.8} />
      <circle cx="50" cy="55" r="20" stroke="white" strokeWidth="2" strokeDasharray="4 4" />
    </svg>
  </motion.div>
);

const ContactBlock = ({ title, top, bottom }) => (
  <div className="border-l border-white/10 pl-8 space-y-2">
    <h5 className="text-[#E31E24] text-[10px] uppercase font-black tracking-widest">{title}</h5>
    <p className="text-lg font-black text-white tracking-tight">{top}</p>
    <p className="text-[11px] font-bold text-white/40 uppercase tracking-tighter">{bottom}</p>
  </div>
);

const LinkGroup = ({ title, links }) => (
  <div className="space-y-6">
    <h5 className="text-[#E31E24] text-[10px] font-black uppercase tracking-[0.3em]">{title}</h5>
    <ul className="space-y-3">
      {links.map(link => (
        <li key={link} className="text-[10px] font-bold text-white/40 hover:text-white cursor-pointer transition-all uppercase tracking-[0.1em]">
          {link}
        </li>
      ))}
    </ul>
  </div>
);

export default DevDropStudioFooter;