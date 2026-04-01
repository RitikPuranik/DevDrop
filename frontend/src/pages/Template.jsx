import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, ShoppingCart, ArrowRight, Zap } from 'lucide-react';

const TEMPLATES = [
  { id: 1, title: "Onyx Alpha", price: "$59", color: "#1E1E1E", tag: "System" },
  { id: 2, title: "Neon Cyber", price: "$45", color: "#0F172A", tag: "Interactive" },
  { id: 3, title: "Ivory Dark", price: "$62", color: "#262626", tag: "Premium" },
  { id: 4, title: "Titanium", price: "$70", color: "#171717", tag: "Enterprise" },
];

// Smooth Easing Curve
const transition = { duration: 0.6, ease: [0.43, 0.13, 0.23, 0.96] };

export default function SmoothEliteGallery() {
  const [selectedId, setSelectedId] = useState(null);

  // Disable scrolling when modal is open to prevent jitter
  useEffect(() => {
    if (selectedId) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
  }, [selectedId]);

  return (
    <div className="min-h-screen bg-[#080808] text-white selection:bg-orange-500 font-sans antialiased">
      
      {/* --- MAIN GRID --- */}
      <main className="max-w-6xl mx-auto px-7 py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {TEMPLATES.map((item) => (
            <motion.div
              layoutId={`card-${item.id}`}
              key={item.id}
              onClick={() => setSelectedId(item)}
              transition={transition}
              className=" group cursor-pointer bg-[#111] rounded-[40px] p-4 border border-white/5 hover:border-orange-500/30 transition-colors will-change-transform"
            >
              <motion.div 
                layoutId={`image-box-${item.id}`}
                transition={transition}
                style={{ backgroundColor: item.color }}
                className="aspect-[3/4] rounded-[32px] mb-6 relative overflow-hidden flex items-center justify-center border border-white/5"
              >
                <div className="w-24 h-24 bg-white/5 blur-3xl rounded-full" />
              </motion.div>

              <div className="px-2">
                <motion.h3 layoutId={`title-${item.id}`} transition={transition} className="font-black text-xl tracking-tight">{item.title}</motion.h3>
                <motion.p layoutId={`price-${item.id}`} transition={transition} className="text-orange-500 font-bold text-sm tracking-widest">{item.price}</motion.p>
              </div>
            </motion.div>
          ))}
        </div>
      </main>

      {/* --- SMOOTH OVERLAY --- */}
      <AnimatePresence>
        {selectedId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            
            {/* Backdrop with Fade */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedId(null)}
              className="absolute inset-0 bg-black/90 backdrop-blur-2xl cursor-zoom-out"
            />

            {/* Expanded Card */}
            <motion.div
              layoutId={`card-${selectedId.id}`}
              transition={transition}
              className="relative w-full max-w-6xl bg-[#0F0F0F] rounded-[50px] border border-white/10 shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-2 h-fit max-h-[90vh] z-50 will-change-transform"
            >
              {/* INDEPENDENT CLOSE BUTTON (Guaranteed to work) */}
              <motion.button 
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(null);
                }}
                className="absolute top-8 right-8 z-[100] p-4 bg-white/10 text-white hover:bg-orange-500 hover:text-black rounded-full transition-all active:scale-90"
              >
                <X size={24} />
              </motion.button>

              {/* Left Side Visual */}
              <div className="p-4">
                <motion.div
                  layoutId={`image-box-${selectedId.id}`}
                  transition={transition}
                  style={{ backgroundColor: selectedId.color }}
                  className="h-full min-h-[400px] rounded-[40px] relative flex items-center justify-center overflow-hidden border border-white/5"
                >
                  <Play className="text-white/20" size={80} />
                </motion.div>
              </div>

              {/* Right Side Info */}
              <div className="p-12 md:p-16 flex flex-col justify-center">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="flex items-center gap-2 text-orange-500 mb-6 font-black uppercase tracking-[0.4em] text-[10px]">
                    <Zap size={14} fill="currentColor" /> Premium Layout
                  </div>
                  
                  <motion.h2 layoutId={`title-${selectedId.id}`} transition={transition} className="text-6xl font-black tracking-tighter mb-4">
                    {selectedId.title}
                  </motion.h2>
                  
                  <motion.div layoutId={`price-${selectedId.id}`} transition={transition} className="text-3xl font-light italic text-gray-500 mb-8">
                    {selectedId.price}
                  </motion.div>
                  
                  <p className="text-gray-400 text-lg leading-relaxed mb-10 max-w-md">
                    Engineered for high-performance interactions. This template uses hardware-accelerated animations for maximum smoothness.
                  </p>

                  <div className="flex gap-4">
                    <button className="flex-1 bg-white text-black py-5 rounded-[24px] font-black text-xl hover:bg-orange-400 transition-all">
                      Deploy Now
                    </button>
                    <button className="w-20 bg-white/5 border border-white/10 rounded-[24px] flex items-center justify-center text-white hover:bg-white/10">
                      <ShoppingCart size={24} />
                    </button>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}