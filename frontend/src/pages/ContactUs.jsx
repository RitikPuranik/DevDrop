import React from 'react';
import { Phone, Mail, MapPin, Linkedin, Instagram, Globe, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import img from '../assets/man.png'; // Placeholder image for the right sticker 
export default function ZohoInspiredUI() {
  return (
    <div className="min-h-screen bg-[#050505] text-[#E5E2DA] font-sans p-4 md:p-12 overflow-hidden flex items-center justify-center">
      {/* Background Subtle Grid */}
      <div className="fixed inset-0 z-0 opacity-20 pointer-events-none bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px]"></div>

      <div className="max-w-6xl w-full relative z-10">
        {/* MAIN COMPOSITION AREA */}
        <div className="relative h-[500px] md:h-[600px] w-full flex items-center justify-center">
          
          {/* 1. THE BROWSER MOCKUP (Background Layer) */}
          <div className="absolute w-[95%] md:w-[85%] lg:w-[75%] aspect-[16/10] border-4 border-blue-500/40 rounded-3xl bg-[#0D0D0D] shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden z-0">
             {/* Browser Top Bar */}
             <div className="h-10 bg-[#1A1A1A] border-b-2 border-blue-500/20 flex items-center px-6 gap-2">
                <div className="w-3 h-3 rounded-full bg-[#FF5F57]"></div>
                <div className="w-3 h-3 rounded-full bg-[#FFBD2E]"></div>
                <div className="w-3 h-3 rounded-full bg-[#28C940]"></div>
                <div className="ml-4 flex-1 bg-black/40 rounded-md h-6 flex items-center px-3 text-[10px] text-gray-500 font-mono">
                  studiosites.co/contact-hub
                </div>
             </div>
             
             {/* MAIN CENTERED CONTENT - Optimized for visibility */}
             <div className="p-8 md:p-12 h-[calc(100%-40px)] flex flex-col items-center justify-center text-center">
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-8"
                >
                  <h2 className="text-3xl md:text-4xl font-black tracking-tighter mb-2">CONNECT WITH US</h2>
                  <div className="h-1 w-20 bg-blue-500 mx-auto rounded-full"></div>
                </motion.div>

                {/* THE HUB GRID - Centered and detailed */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-3xl">
                   
                   {/* Email Tile */}
                   <div className="bg-white/5 border border-white/10 p-5 rounded-2xl hover:bg-white/[0.08] transition-all group">
                      <Mail className="text-blue-400 mb-3 mx-auto" size={24} />
                      <p className="text-[10px] uppercase font-bold text-gray-500 tracking-widest mb-1">Email</p>
                      <p className="text-sm font-bold truncate">hello@studiosites.co</p>
                   </div>

                   {/* LinkedIn Tile */}
                   <div className="bg-white/5 border border-white/10 p-5 rounded-2xl hover:bg-white/[0.08] transition-all group">
                      <Linkedin className="text-blue-600 mb-3 mx-auto" size={24} />
                      <p className="text-[10px] uppercase font-bold text-gray-500 tracking-widest mb-1">LinkedIn</p>
                      <p className="text-sm font-bold">Studio Sites Agency</p>
                   </div>

                   {/* Instagram Tile */}
                   <div className="bg-white/5 border border-white/10 p-5 rounded-2xl hover:bg-white/[0.08] transition-all group">
                      <Instagram className="text-[#E1306C] mb-3 mx-auto" size={24} />
                      <p className="text-[10px] uppercase font-bold text-gray-500 tracking-widest mb-1">Instagram</p>
                      <p className="text-sm font-bold">@studiosites.official</p>
                   </div>

                   {/* Location Tile (Spans bottom on mobile) */}
                   <div className="md:col-span-2 lg:col-span-3 bg-blue-500/5 border border-blue-500/20 p-4 rounded-2xl flex items-center justify-center gap-4">
                      <MapPin className="text-blue-400" size={18} />
                      <p className="text-xs font-semibold tracking-wide">South Civil Lines, Jabalpur, Madhya Pradesh</p>
                   </div>
                </div>
                
                <button className="mt-8 flex items-center gap-2 text-xs font-bold text-blue-400 hover:text-white transition-colors">
                  VISIT PORTFOLIO <ExternalLink size={14} />
                </button>
             </div>
          </div>

          {/* 2. THE PHONE STICKER (Left Layer) */}
          <div className="absolute -left-8 md:left-[2%] lg:left-[4%] top-[15%] md:top-[20%] z-20 pointer-events-none md:pointer-events-auto">
             <motion.div 
               whileHover={{ rotate: -5, scale: 1.05 }}
               className="relative p-6 bg-black border-[3px] border-cyan-400 rounded-[40px] rotate-[-15deg] shadow-[15px_15px_0px_0px_rgba(6,182,212,0.15)]"
             >
                <Phone size={70} className="text-white fill-white md:w-[80px] md:h-[80px]" />
                <div className="mt-4 text-center border-t border-cyan-400/30 pt-4">
                  <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-1">Quick Call</p>
                  <p className="text-sm font-bold text-white">+91 98765 43210</p>
                </div>
             </motion.div>
          </div>

          {/* 3. THE PERSON STICKER (Right Layer) */}
          <div className="absolute -right-8 md:right-[2%] lg:right-[-4%] bottom-[-5%] md:bottom-[-8%] z-30 pointer-events-none">
              <div className="relative  ml-0 flex justify-end items-end">
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