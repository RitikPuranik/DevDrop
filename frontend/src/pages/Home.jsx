import React,{useRef} from 'react';
import { motion, useScroll, useTransform,useSpring} from 'framer-motion';

const Home = () => {
  return (
    <div className="bg-black text-[#e8e2d6] selection:bg-[#e8e2d6] selection:text-black">
      {/* 1. HERO SECTION - Pinned and Fades Out */}
      <HeroSection />

      {/* 2. OVERLAPPING CONTENT - Slides over Hero */}
      <div className="relative z-10">
        <SmoothImageSection />
        <FuelUpSection />
      </div>

      {/* 3. FOOTER - Revealed behind content */}
      <footer className="h-[60vh] flex items-center justify-center border-t border-[#e8e2d6]/10">
        <h2 className="text-[10vw] font-serif italic opacity-20">devdrop</h2>
      </footer>
    </div>
    
  );
};

const HeroSection = () => {
  const { scrollY } = useScroll();
  // Hero text moves slower than scroll for parallax effect
  const y = useTransform(scrollY, [0, 500], [0, 200]);
  const opacity = useTransform(scrollY, [0, 400], [1, 0]);

  return (
    <section className="sticky top-0 h-screen flex flex-col justify-center px-12 z-0">
      <motion.div style={{ y, opacity }}>
        <h1 className="text-[15vw] leading-[0.8] font-serif italic tracking-tighter">
          Crafting <br /> 
          <span className="ml-[10vw]">The Void</span>
        </h1>
        <div className="mt-12 flex gap-20 items-end">
          <p className="max-w-xs text-sm uppercase tracking-widest opacity-50">
            A boutique studio merging digital craft with architectural soul.
          </p>
        </div>
      </motion.div>
    </section>
  );
};

const SmoothImageSection = () => {
  const { scrollYProgress } = useScroll();
  // Image expands and corners round off as you scroll
  const scale = useTransform(scrollYProgress, [0.1, 0.3], [0.8, 1]);
  const rotate = useTransform(scrollYProgress, [0.1, 0.3], [5, 0]);

  return (
    <section className="h-screen flex items-center justify-center px-6">
      <motion.div 
        style={{ scale, rotate }}
        className="w-full h-[80vh] overflow-hidden rounded-xl"
      >
        <div className="w-full h-full bg-[#1a1a1a] flex items-center justify-center">
           {/* Replace with a high-end architectural image */}
           <img 
             src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2070&auto=format&fit=crop" 
             className="w-full h-full object-cover opacity-60 grayscale hover:grayscale-0 transition-all duration-1000"
             alt="Luxury Architecture"
           />
        </div>
      </motion.div>
    </section>
    
  );
};
const FuelUpSection = () => {
  const sectionRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"]
  });

  const smoothProgress = useSpring(scrollYProgress, { 
    stiffness: 150, 
    damping: 30,
    restDelta: 0.001 
  });

  return (
    <section ref={sectionRef} className="relative h-[180vh] bg-black">
      <div className="sticky top-0 h-screen w-full flex flex-col items-center justify-center px-6  overflow-hidden">
        <div className="relative flex flex-col items-center text-center  max-w-[95vw]">
          
          <ScrubLine text="Stir Up Your" progress={smoothProgress} range={[0.1, 0.2]} /><br></br>
          
          <div className="relative flex flex-col items-center -my-4 z-10">
             <ScrubLine text="Fearless Past And" progress={smoothProgress} range={[0.15, 0.25]} />

             {/* THE STICKER */}
             <motion.div 
               style={{ 
                 scale: useTransform(smoothProgress, [0.25, 0.35], [0, 1]),
                 rotate: useTransform(smoothProgress, [0.25, 0.35], [-12, -4]),
                 opacity: useTransform(smoothProgress, [0.25, 0.28], [0, 1]),
               }}
               className="bg-[#d2904b] text-black px-10 py-3 -my-6 relative z-20  select-none border-8 border-black"
             >
               <span className="text-[6vw] font-black uppercase leading-none tracking-tighter italic">
                 Fuel Up
               </span>
             </motion.div>

             <ScrubLine text="Your Future With" progress={smoothProgress} range={[0.35, 0.45]} />
          </div>
          
          <motion.span 
             style={{ opacity: useTransform(smoothProgress, [0.45, 0.5], [0.1, 0.4]) }}
             className="text-[4vw] font-serif italic lowercase text-[#f4e6d9] mt-2 mb-0"
          >
            every
          </motion.span>

          <ScrubLine text="Gulp of Perfect Protein" progress={smoothProgress} range={[0.5, 0.6]} isSubText={true} />
          
        </div>
      </div>
    </section>
  );
};

// 1. The main line component (No hooks inside map here!)
const ScrubLine = ({ text, progress, range, isSubText = false }) => {
  const words = text.split(" ");
  
  return (
    <span className={`flex flex-wrap justify-center gap-[0.3em] font-black uppercase tracking-tighter text-[#f4e6d9] leading-[0.8] 
      ${isSubText ? 'text-[5.5vw]' : 'text-[8.5vw]'} relative z-0`}>
      {words.map((word, i) => {
        // Calculate the specific timing for this word
        const start = range[0] + (i * (range[1] - range[0]) / words.length);
        const end = start + (range[1] - range[0]) / words.length;

        // Render a NEW component for each word to keep hooks stable
        return (
          <IndividualWord 
            key={i} 
            word={word} 
            progress={progress} 
            range={[start, end]} 
          />
        );
      })}
    </span>
  );
};

// 2. The sub-component that handles the hooks safely
const IndividualWord = ({ word, progress, range }) => {
  const opacity = useTransform(progress, range, [0.15, 1]);
  const y = useTransform(progress, range, [8, 0]);

  return (
    <motion.span style={{ opacity, y }} className="inline-block">
      {word}
    </motion.span>
  );
};

export default Home;