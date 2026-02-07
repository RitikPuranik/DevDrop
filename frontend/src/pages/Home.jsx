import React from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

const Home = () => {
  return (
    <div className="bg-black text-[#e8e2d6] selection:bg-[#e8e2d6] selection:text-black">
      {/* 1. HERO SECTION - Pinned and Fades Out */}
      <HeroSection />

      {/* 2. OVERLAPPING CONTENT - Slides over Hero */}
      <div className="relative z-10">
        <SmoothImageSection />
        <ProjectShowcase />
        <Marquee />
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

const ProjectShowcase = () => {
  return (
    <section className="py-40 px-12 border-t border-[#e8e2d6]/10">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-32">
        <div className="space-y-6">
          <span className="text-[10px] tracking-[0.5em] uppercase opacity-40">Selected Work</span>
          <h2 className="text-6xl font-serif italic">The Obsidian <br/> Portfolio</h2>
        </div>
        <div className="space-y-20 pt-32">
          <ProjectItem title="Lumina" category="Brand Identity" />
          <ProjectItem title="Vertex" category="Web Experience" />
        </div>
      </div>
    </section>
  );
};

const ProjectItem = ({ title, category }) => (
  <motion.div 
    whileHover={{ x: 20 }}
    className="border-b border-[#e8e2d6]/20 pb-8 flex justify-between items-end group cursor-pointer"
  >
    <h3 className="text-5xl font-serif italic group-hover:text-[#e8e2d6] transition-colors">{title}</h3>
    <span className="text-xs uppercase tracking-widest opacity-40">{category}</span>
  </motion.div>
);

const Marquee = () => (
  <div className="py-20 overflow-hidden whitespace-nowrap border-y border-[#e8e2d6]/10">
    <motion.div 
      animate={{ x: [0, -1000] }}
      transition={{ repeat: Infinity, ease: "linear", duration: 25 }}
      className="flex gap-20 text-[6vw] font-serif italic tracking-tighter uppercase"
    >
      {[...Array(4)].map((_, i) => (
        <span key={i} className={i % 2 === 0 ? "" : "text-transparent stroke-beige"}>
          Innovative Design • Seamless Motion • devdrop Studio •
        </span>
      ))}
    </motion.div>
  </div>
);

export default Home;