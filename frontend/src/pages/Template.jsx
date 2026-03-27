import React, { useState, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { ShoppingCart, ArrowRight, ArrowLeft, Plus, Zap, Star } from 'lucide-react';

const products = [
  {
    id: "01",
    name: "CYBERPUNK 2077",
    category: "Gaming / Futuristic",
    price: "79",
    img: "https://images.unsplash.com/photo-1614850523296-d8c1af93d400?q=80&w=2000",
    description: "Neon-infused layouts with high-speed performance scores.",
    accent: "#00f2ff"
  },
  {
    id: "02",
    name: "ZENITH ARCH",
    category: "Architecture / Luxury",
    price: "120",
    img: "https://images.unsplash.com/photo-1600607687940-47a04b629753?q=80&w=2000",
    description: "Clean lines and brutalist typography for high-end studios.",
    accent: "#ff3e00"
  },
  {
    id: "03",
    name: "LUNAR UI",
    category: "SaaS / Fintech",
    price: "95",
    img: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?q=80&w=2000",
    description: "Glass-morphism components for complex data visualization.",
    accent: "#7000ff"
  }
];

export default function PrismMarketplace() {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const item = products[index];

  const paginate = (newDirection) => {
    setDirection(newDirection);
    setIndex((prev) => (prev + newDirection + products.length) % products.length);
  };

  return (
    <div className="h-screen w-full bg-[#050505] text-white flex flex-col items-center justify-center overflow-hidden font-sans select-none">
      
      {/* BACKGROUND TEXT (HUGE & BLURRED) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5">
        <h1 className="text-[30vw] font-black tracking-tighter uppercase leading-none">
          {item.name.split(' ')[0]}
        </h1>
      </div>

      {/* MAIN INTERACTIVE AREA */}
      <div className="relative w-[90%] h-[80%] flex flex-col md:flex-row items-center gap-12 z-10">
        
        {/* IMAGE BOX WITH CUSTOM MASKING */}
        <div className="relative w-full md:w-1/2 h-full overflow-hidden rounded-3xl border border-white/10 group">
          <AnimatePresence initial={false} custom={direction}>
            <motion.div
              key={index}
              custom={direction}
              initial={{ x: direction > 0 ? '100%' : '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: direction > 0 ? '-100%' : '100%' }}
              transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
              className="absolute inset-0"
            >
              <img src={item.img} className="w-full h-full object-cover scale-110 group-hover:scale-100 transition-transform duration-1000" alt="" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            </motion.div>
          </AnimatePresence>

          {/* Floater Badge */}
          <motion.div 
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 4, repeat: Infinity }}
            className="absolute top-8 left-8 bg-white/10 backdrop-blur-xl px-4 py-2 rounded-full border border-white/20 flex items-center gap-2"
          >
            <Zap size={14} style={{ color: item.accent }} fill="currentColor" />
            <span className="text-[10px] font-black uppercase tracking-widest">Trending Now</span>
          </motion.div>
        </div>

        {/* CONTENT BOX */}
        <div className="w-full md:w-1/2 flex flex-col justify-center">
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center gap-4 mb-4">
               <span className="text-zinc-500 font-mono italic">{item.id}</span>
               <div className="h-px w-12 bg-zinc-800" />
               <span className="text-xs font-bold tracking-[0.3em] uppercase opacity-50">{item.category}</span>
            </div>

            <h2 className="text-6xl md:text-8xl font-black tracking-tighter mb-6 leading-none italic">
                {item.name}
            </h2>

            <p className="text-zinc-400 text-lg max-w-md mb-8 leading-relaxed">
              {item.description}
            </p>

            <div className="flex items-center gap-8 mb-12">
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Price</span>
                    <span className="text-4xl font-black italic tracking-tighter">${item.price}</span>
                </div>
                <div className="flex flex-col border-l border-zinc-800 pl-8">
                    <span className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Rating</span>
                    <div className="flex items-center gap-1 text-yellow-500">
                        <Star size={18} fill="currentColor"/>
                        <span className="text-white font-bold text-xl">5.0</span>
                    </div>
                </div>
            </div>

            <div className="flex gap-4">
                <button 
                  className="px-12 py-5 bg-white text-black font-black text-xl hover:scale-105 active:scale-95 transition-all rounded-full flex items-center gap-3 group"
                  style={{ boxShadow: `0 10px 40px -10px ${item.accent}44` }}
                >
                    PURCHASE <ShoppingCart size={20} className="group-hover:rotate-12 transition-transform"/>
                </button>
                <button className="h-16 w-16 rounded-full border border-white/10 flex items-center justify-center hover:bg-white hover:text-black transition-colors">
                    <Plus />
                </button>
            </div>
          </motion.div>
        </div>
      </div>

      {/* CONTROLS AREA (BOTTOM) */}
      <div className="absolute bottom-10 w-[90%] flex justify-between items-end z-20">
        <div className="flex gap-4">
           <button onClick={() => paginate(-1)} className="p-6 border border-white/5 rounded-2xl hover:bg-white hover:text-black transition-all">
              <ArrowLeft />
           </button>
           <button onClick={() => paginate(1)} className="p-6 border border-white/5 rounded-2xl hover:bg-white hover:text-black transition-all">
              <ArrowRight />
           </button>
        </div>
        
        <div className="hidden md:flex gap-2">
            {products.map((p, i) => (
                <div 
                  key={p.id} 
                  className={`h-1 transition-all duration-500 rounded-full ${index === i ? 'w-12 bg-white' : 'w-4 bg-zinc-800'}`} 
                />
            ))}
        </div>
      </div>

    </div>
  );
}