import React from 'react';

const About = () => {
  return (
    <div className="min-h-screen pt-32 px-10">
      <section className="max-w-5xl mx-auto">
        <h2 className="text-5xl md:text-7xl font-serif mb-16 tracking-tight">
          We believe in the power <br /> of <span className="italic">understated</span> design.
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-20">
          <div className="space-y-6 text-xl text-gray-300 leading-relaxed">
            <p>
              Founded with the goal of dropping the noise and focusing on 
              the drop of perfection, devdrop has grown into a collective 
              of thinkers and makers.
            </p>
            <p>
              Our approach is rooted in the "arc" of discovery—finding the 
              perfect curve between functionality and beauty.
            </p>
          </div>
          
          <div className="space-y-8">
            <div>
              <h4 className="text-[#e8e2d6] uppercase text-xs tracking-widest mb-2">Philosophy</h4>
              <p className="text-gray-400">Modern. Minimal. Meaningful.</p>
            </div>
            <div>
              <h4 className="text-[#e8e2d6] uppercase text-xs tracking-widest mb-2">Services</h4>
              <ul className="text-gray-400 space-y-1">
                <li>Art Direction</li>
                <li>Digital Strategy</li>
                <li>Full-Stack Development</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default About;