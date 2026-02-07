import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import LinkTransition from './TransitionLink';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* THE TOGGLE (The 2 Lines) */}
      <nav className="fixed top-0 w-full px-8 py-8 flex justify-between items-center z-[100] mix-blend-difference">
        <LinkTransition to="/" className="text-[#e8e2d6] font-serif italic text-2xl tracking-tighter">
          devdrop.
        </LinkTransition>

        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="flex flex-col gap-2 p-2 group"
        >
          {/* Top Line */}
          <motion.div 
            animate={isOpen ? { rotate: 45, y: 5 } : { rotate: 0, y: 0 }}
            className="w-8 h-[1px] bg-[#e8e2d6] transition-transform duration-500"
          />
          {/* Bottom Line */}
          <motion.div 
            animate={isOpen ? { rotate: -45, y: -4 } : { rotate: 0, y: 0 }}
            className="w-8 h-[1px] bg-[#e8e2d6] transition-transform duration-500"
          />
        </button>
      </nav>

      {/* THE FULLSCREEN OVERLAY */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ y: "-100%" }}
            animate={{ y: 0 }}
            exit={{ y: "-100%" }}
            transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
            className="fixed inset-0 z-[90] bg-[#0c0c0c] flex flex-col justify-center items-center"
          >
            {/* Background Text Decor */}
            <div className="absolute inset-0 flex items-center justify-center opacity-[0.02] pointer-events-none">
              <h2 className="text-[30vw] font-serif italic uppercase">Menu</h2>
            </div>

            <div className="relative flex flex-col items-center gap-8">
              <MenuItem to="/" label="Index" delay={0.1} close={() => setIsOpen(false)} />
              <MenuItem to="/about" label="About" delay={0.2} close={() => setIsOpen(false)} />
              <MenuItem to="/work" label="Showcase" delay={0.3} close={() => setIsOpen(false)} />
              
              <div className="mt-20 flex gap-8 opacity-40 uppercase text-[10px] tracking-[0.4em]">
                <span>Instagram</span>
                <span>Twitter</span>
                <span>Behance</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

const MenuItem = ({ to, label, delay, close }) => (
  <motion.div
    initial={{ y: 80, opacity: 0 }}
    animate={{ y: 0, opacity: 1 }}
    transition={{ delay, duration: 0.8, ease: "easeOut" }}
    onClick={close}
  >
    <LinkTransition 
      to={to} 
      className="text-6xl md:text-8xl font-serif italic tracking-tighter text-[#e8e2d6] hover:opacity-40 transition-opacity"
    >
      {label}
    </LinkTransition>
  </motion.div>
);

export default Navbar;