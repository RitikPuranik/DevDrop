import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const Footer = () => {
  const [time, setTime] = useState("");

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <footer className="relative w-full bg-black text-[#E8E2D6] px-[6vw] pt-32 pb-8 overflow-hidden font-sans border-t border-white/5">
      
      {/* 1. BACKGROUND TEXTURE & SKETCHES */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
      
      {/* Halftone Dots (Matching Hero Style) */}
      <div className="absolute top-0 right-0 w-1/3 h-full opacity-5 pointer-events-none" 
           style={{ backgroundImage: `radial-gradient(#fbb034 1.5px, transparent 0)`, backgroundSize: '16px 16px' }} />

      {/* 2. DECORATIVE STICKERS (Foliage & Loops) */}
      <div className="absolute bottom-[-20px] left-[-20px] w-64 z-20 pointer-events-none opacity-20 grayscale">
        <img src="https://png.pngtree.com/png-vector/20220616/ourmid/pngtree-green-leaf-tropical-palm-png-image_5091871.png" alt="foliage" className="w-full" />
      </div>

      <div className="max-w-[1400px] mx-auto relative z-30">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 pb-20 border-b border-white/10">
          
          {/* LEFT: DIRECTORY & BRAND */}
          <div className="flex flex-col justify-between">
            <div className="mb-16">
              <span className="text-[#fbb034] font-['Permanent_Marker',cursive] text-2xl block mb-2 rotate-[-3deg]">devdrop</span>
              <h2 className="text-4xl font-black uppercase tracking-tighter italic">Creative <span className="text-[#fbb034]">Solutions</span></h2>
              <p className="text-xs uppercase tracking-[0.4em] opacity-40 mt-4 max-w-sm leading-relaxed">
                Architecting digital perspectives <br /> through fluid motion systems.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-10">
              <FooterGroup title="Resources" links={['Case Studies', 'Our Process', 'Pricing', 'Blog']} />
              <FooterGroup title="Agency" links={['About Us', 'Careers', 'Contact', 'Privacy']} />
              <FooterGroup title="Connect" links={['Instagram', 'LinkedIn', 'Bento', 'Twitter']} />
            </div>
          </div>

          {/* RIGHT: ACTION ZONE + MAN IMAGE */}
          <div className="relative pt-12 lg:pt-0 lg:pl-16 lg:border-l border-white/5">
            <div className="relative z-40">
              {/* Handwritten Note */}
              <div className="absolute -top-16 right-0 hidden md:block">
              </div>
              {/* PILL INPUT (OfficeSpace Style) */}
              <div className="relative mt-30 max-w-md group shadow-2xl">
                <input 
                  type="email" 
                  placeholder="Drop your email..." 
                  className="w-full bg-[#E8E2D6] text-black rounded-full py-5 px-8 outline-none text-sm font-bold"
                />
                <button className="absolute right-2 top-1/2 -translate-y-1/2 bg-[#fbb034] hover:bg-black text-white w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500">
                  <span className="text-xl font-bold">→</span>
                </button>
              </div>
            </div>

            {/* THE MAN IMAGE (Transparent without URL container) */}
            <motion.div 
              initial={{ y: 50, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true }}
              className="absolute -bottom-24 -right-16 w-[320px] md:w-[480px] z-10 pointer-events-none hidden md:block"
            >
              <img 
                src="https://www.pngarts.com/files/3/Man-Transparent-Background-PNG.png" 
                alt="Business Man" 
                className="w-full h-auto drop-shadow-[0_30px_60px_rgba(0,0,0,0.8)]"
              />
            </motion.div>
          </div>
        </div>

        {/* BOTTOM STRIP */}
        <div className="flex flex-col md:flex-row justify-between items-center pt-8 gap-6 text-[10px] uppercase tracking-[0.5em] opacity-30">
          <div className="flex items-center gap-6">
            <p>© 2026 devdrop studio</p>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span>System: Online</span>
            </div>
          </div>
          <div className="flex gap-10 font-mono">
            <span>{time} IST</span>
            <span className="hover:text-white cursor-pointer transition-colors">/Privacy</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

const FooterGroup = ({ title, links }) => (
  <div className="flex flex-col gap-5">
    <h5 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#fbb034]">{title}</h5>
    <ul className="flex flex-col gap-2">
      {links.map(link => (
        <li key={link} className="text-[11px] uppercase tracking-widest opacity-40 hover:opacity-100 cursor-pointer transition-all hover:translate-x-1">
          {link}
        </li>
      ))}
    </ul>
  </div>
);

export default Footer;