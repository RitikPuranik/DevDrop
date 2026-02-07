import React from 'react';

const Home = () => {
  return (
    <div className="min-h-screen pt-32 px-10 text-white ">
      <section className="max-w-6xl mx-auto">
        <span className="text-beige/60 uppercase tracking-widest text-sm mb-4 block">
          Creative Design Studio
        </span>
      
        <h2 className="text-7xl md:text-[10rem] font-serif leading-[0.85] tracking-tighter">
          Crafting <br />
          Digital <br />
          <span className="italic text-[#e8e2d6]">Elegance.</span>
        </h2>
        
        <div className="mt-20 flex justify-between items-end border-t border-white/10 pt-10">
          <p className="max-w-md text-lg text-gray-400">
            We specialize in creating high-end digital experiences that blend 
            technical precision with artistic vision.
          </p>
          <div className="text-right">
            <p className="text-sm text-gray-500 uppercase">Based in London</p>
            <p className="text-xl">Available 2026</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;