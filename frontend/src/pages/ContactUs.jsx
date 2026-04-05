import React, { useState, useEffect } from 'react';
import { Phone, Mail, MapPin, Linkedin, Instagram, Globe, ExternalLink, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import img from '../assets/man.png'; 

export default function ZohoInspiredUI() {
  const TAGLINE = "WE BUILD WE BREAK WE FIX WE SHIP";
  const [displayedTagline, setDisplayedTagline] = useState("");


  return (
    <div className="min-h-screen bg-[#020202] text-[#e8e2d6] font-sans p-4 md:p-12 overflow-hidden flex items-center justify-center relative">
      
      {/* ── 1. CINEMATIC BACKGROUND (From Loader Code) ── */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.04] z-0 mix-blend-screen"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }}
      />
      
      {/* Ambient Radial Glares */}
      <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[120px] z-0 pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-cyan-600/10 rounded-full blur-[120px] z-0 pointer-events-none" />

      <div className="max-w-6xl w-full relative z-10">
        <div className="relative h-[500px] md:h-[600px] w-full flex items-center justify-center">
          
          {/* ── 2. THE BROWSER MOCKUP (Back Part Redesign) ── */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, ease: [0.76, 0, 0.24, 1] }}
            className="absolute w-full md:w-[95%] aspect-[16/10] border border-[#e8e2d6]/10 rounded-[2.5rem] bg-[#0A0A0A]/80 backdrop-blur-3xl shadow-[0_40px_100px_rgba(0,0,0,0.8)] overflow-hidden z-0"
          >
             {/* Browser Top Bar */}
             <div className="h-12 bg-white/5 border-b border-[#e8e2d6]/10 flex items-center px-6 gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-[#FF5F57]"></div>
                  <div className="w-3 h-3 rounded-full bg-[#FFBD2E]"></div>
                  <div className="w-3 h-3 rounded-full bg-[#28C940]"></div>
                </div>
                <div className="ml-8 flex-1 max-w-sm  border rounded-full h-7 flex items-center px-4 text-[10px] text-gray-500 font-mono tracking-widest">
                  <Globe size={12} className="mr-2 text-blue-500" />
                  studiosites.co/contact-hub
                </div>
             </div>
             
             {/* Centered Content Area */}
             <div className="p-8 md:p-12 h-[calc(100%-48px)] flex flex-col items-center justify-center">
                
                {/* Heading with Typewriter Cursor */}
                <motion.div className="mb-10 text-center">
                  <h2 className="text-3xl md:text-5xl font-black tracking-tighter mb-2 italic">
                    {TAGLINE}
                
                  </h2>
                  <div className="h-[2px] w-24 bg-gradient-to-right from-blue-500 to-transparent mx-auto rounded-full mt-4"></div>
                </motion.div>

                {/* Glassmorphism Tiles */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-3xl">
                   {[
                     { icon: <Mail className="text-blue-400" />, label: "Email", val: "hello@studiosites.co" },
                     { icon: <Linkedin className="text-blue-600" />, label: "LinkedIn", val: "Studio Sites Agency" },
                     { icon: <Instagram className="text-[#E1306C]" />, label: "Instagram", val: "@studiosites.official" }
                   ].map((item, idx) => (
                     <div key={idx} className="bg-white/[0.03] border border-white/10 p-5 rounded-2xl hover:bg-white/[0.07] transition-all group">
                        <div className="mb-3 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all">
                          {item.icon}
                        </div>
                        <p className="text-[9px] uppercase font-bold text-gray-500 tracking-[0.2em] mb-1">{item.label}</p>
                        <p className="text-sm font-bold truncate tracking-tight">{item.val}</p>
                     </div>
                   ))}

                   <div className="md:col-span-2 lg:col-span-3 bg-blue-500/5 border border-blue-500/20 p-4 rounded-2xl flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <MapPin className="text-blue-400" size={18} />
                        <p className="text-[11px] font-bold tracking-widest uppercase opacity-70">South Civil Lines, Jabalpur, MP</p>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-mono opacity-40">
                        <Clock size={12} /> GMT+5:30
                      </div>
                   </div>
                </div>
                
                <button className="mt-10 flex items-center gap-2 px-8 py-3 bg-[#e8e2d6] text-black rounded-full text-[10px] font-black tracking-[0.3em] hover:bg-blue-400 hover:text-white transition-all shadow-[0_10px_30px_rgba(232,226,214,0.1)]">
                  VISIT PORTFOLIO <ExternalLink size={14} />
                </button>
             </div>
          </motion.div>

          {/* ── 3. RETAINED: STICKERS (NO LOGIC CHANGES) ── */}
          {/* THE PHONE STICKER */}
          <div className="absolute -left-8 md:left-[2%] lg:left-[-4%] top-[15%] md:top-[20%] z-20 pointer-events-none md:pointer-events-auto">
             <motion.div 
               whileHover={{ rotate: -5, scale: 1.05 }}
               className="relative p-6 bg-gray-700 border-[3px] border-gray-800 rounded-[40px] rotate-[-15deg] shadow-[15px_15px_0px_0px_rgba(6,182,212,0.15)]"
             >
                <Phone size={70} className="text-white fill-white md:w-[80px] md:h-[80px]" />
                <div className="mt-4 text-center border-t border-cyan-400/30 pt-4">
                  <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-1">Quick Call</p>
                  <p className="text-sm font-bold text-white">+91 98765 43210</p>
                </div>
             </motion.div>
          </div>

          {/* THE PERSON STICKER */}
          <div className="absolute -right-8 md:right-[2%] lg:right-[-15%] bottom-[-5%] md:bottom-[-8%] z-30 pointer-events-none">
              <div className="relative ml-0 flex justify-end items-end">
                <motion.img 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.8 }}
                  src={img} 
                  alt="Contact Person"
                  className=" relative z-30 h-[280px] md:h-[400px] lg:h-[480px] w-auto object-contain"
                />
              </div>
          </div>

        </div>
      </div>
    </div>
  );
}