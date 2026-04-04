import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const leaders = [
  // LEFT HUMP (Spread out & slightly lowered)
  { id: 1, name: "Marcus", img: "https://i.pravatar.cc/150?u=11", pos: "top-[18%] left-[15%]", review: "Efficiency gains were immediate." },
  { id: 2, name: "Elena", img: "https://i.pravatar.cc/150?u=12", pos: "top-[8%] left-[28%]", review: "Stunning UI that converts." },
  { id: 3, name: "Julian", img: "https://i.pravatar.cc/150?u=13", pos: "top-[12%] left-[40%]", review: "Scales perfectly with growth." },
  
  // RIGHT HUMP (Mirrored spread)
  { id: 4, name: "Vikram", img: "https://i.pravatar.cc/150?u=14", pos: "top-[12%] left-[60%]", review: "Most robust API we've tested." },
  { id: 5, name: "Sarah", img: "https://i.pravatar.cc/150?u=15", pos: "top-[8%] left-[72%]", review: "Design-led engineering at its finest." },
  { id: 6, name: "Chen", img: "https://i.pravatar.cc/150?u=16", pos: "top-[18%] left-[85%]", review: "Seamless customer journeys." },
  
  // SIDES (Widened to give the heart "shoulders")
  { id: 7, name: "David", img: "https://i.pravatar.cc/150?u=17", pos: "top-[45%] left-[8%]", review: "Incredible support and features." },
  { id: 8, name: "Amara", img: "https://i.pravatar.cc/150?u=18", pos: "top-[45%] left-[92%]", review: "A game changer for workflow." },
  
  // BOTTOM V-SHAPE (Descending towards the point)
  { id: 9, name: "Leo", img: "https://i.pravatar.cc/150?u=19", pos: "top-[75%] left-[25%]", review: "Recommended for tech teams." },
  { id: 10, name: "Maya", img: "https://i.pravatar.cc/150?u=20", pos: "top-[75%] left-[75%]", review: "Dashboard is a masterpiece." },
  { id: 11, name: "Kenji", img: "https://i.pravatar.cc/150?u=21", pos: "top-[90%] left-[50%]", review: "Security and speed in one." },
];

const LeaderCard = ({ person, isAutoFlipped }) => {
  const [isHovered, setIsHovered] = useState(false);
  const flipped = isHovered || isAutoFlipped;

  return (
    <div 
      className={`absolute transition-all duration-1000 -translate-x-1/2 ${person.pos}`}
      style={{ perspective: "1200px" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <motion.div
        className="w-20 h-20 md:w-32 md:h-32 relative cursor-pointer"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ rotateY: flipped ? 180 : 0, scale: flipped ? 1.1 : 1 }}
        transition={{ type: "spring", stiffness: 150, damping: 15 }}
      >
        <div 
          className="absolute inset-0 rounded-[28px] overflow-hidden border-[5px] border-white shadow-2xl"
          style={{ backfaceVisibility: "hidden" }}
        >
          <img src={person.img} className="w-full h-full object-cover" alt={person.name} />
        </div>

        <div 
          className="absolute inset-0 rounded-[28px] bg-white shadow-2xl p-3 flex flex-col justify-center items-center text-center border border-slate-100"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <div className="flex text-yellow-400 text-[8px] mb-1">★★★★★</div>
          <p className="text-[9px] leading-tight font-bold text-slate-800">"{person.review}"</p>
          <p className="text-[8px] mt-2 text-slate-400 font-bold tracking-widest">{person.name.toUpperCase()}</p>
        </div>
      </motion.div>
    </div>
  );
};

export default function IndustryLeaders() {
  const [flippedIndex, setFlippedIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFlippedIndex((prev) => (prev + 1) % leaders.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full min-h-screen bg-black overflow-hidden flex items-center justify-center font-sans">
      
      {/* 1. Subtle Background Grid */}
      <div className="absolute inset-0 grid grid-cols-12 gap-4 opacity-[0.02] pointer-events-none p-10">
        {[...Array(60)].map((_, i) => (
          <div key={i} className="aspect-square bg-slate-900 rounded-3xl" />
        ))}
      </div>

      {/* 2. Floating Cards Layer (The Heart) */}
      <div className="absolute inset-0 z-10">
        {leaders.map((person, index) => (
          <LeaderCard 
            key={person.id} 
            person={person} 
            isAutoFlipped={flippedIndex === index} 
          />
        ))}
      </div>

      {/* 3. Centered Content (Shifted slightly for the V-point) */}
      <div className="relative z-20 text-center px-6 max-w-4xl pointer-events-none translate-y-16">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center"
        >
          <h1 className="text-6xl md:text-[90px] font-black text-yellow-100 leading-[0.85] tracking-tighter mb-8">
            Trusted by leaders <br />
            <span className="text-slate-500 font-medium italic">from various industries</span>
          </h1>
          
          <p className="text-slate-400 text-lg md:text-xl max-w-lg mx-auto mb-10 leading-relaxed">
            Learn why professionals trust our solutions to complete their customer journeys.
          </p>

          <button className="pointer-events-auto bg-amber-200 text-black px-10 py-5 rounded-full font-bold text-xs tracking-widest flex items-center gap-4 hover:bg-white transition-all hover:shadow-[0_0_30px_rgba(254,243,199,0.3)] active:scale-95 group">
            READ SUCCESS STORIES
            <span className="group-hover:translate-x-1 transition-transform">→</span>
          </button>
        </motion.div>
      </div>

    </div>
  );
}
