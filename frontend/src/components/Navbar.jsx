import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import LinkTransition from './TransitionLink';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState(0);

  const menuItems = [
    { to: "/", label: "Home", src: "https://images.unsplash.com/photo-1578357078586-491adf1aa5ba?q=80&w=464&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" },
    { to: "/template", label: "Websites", src: "https://images.unsplash.com/photo-1467232004584-a241de8bcf5d?q=80&w=869" },
    { to: "/about", label: "About Us", src: "https://images.unsplash.com/photo-1642543348745-03b1219733d9?q=80&w=1470" },
    { to: "/work", label: "Programs", src: "https://images.unsplash.com/photo-1614850523296-d8c1af93d400?q=80&w=1500" },
    { to: "/contact", label: "Contacts", src: "https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=1500" },
  ];

  // Faster Spylt-style ease (ExpoOut)
  const fastEase = [0.19, 1, 0.22, 1];

  return (
    <>
      <nav className="fixed top-0 w-full px-12 py-8 flex justify-between items-center z-[110] mix-blend-difference">
        <LinkTransition to="/" className="text-white font-serif italic text-3xl tracking-tighter">
          devdrop
        </LinkTransition>

        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="w-12 h-12 flex flex-col justify-center items-center gap-1.5 cursor-pointer relative group"
        >
          {/* Circular background for the "X" to ensure it's visible over images */}
          <AnimatePresence>
            {isOpen && (
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute inset-0 bg-white rounded-full z-[-1]"
              />
            )}
          </AnimatePresence>
          
          <motion.div 
            animate={isOpen ? { rotate: 45, y: 4, backgroundColor: "#000" } : { rotate: 0, y: 0, backgroundColor: "#e8e2d6" }}
            transition={{ duration: 0.9, ease: [0.19, 1, 0.22, 1] }} 
            className="w-8 h-[2px]"
          />
          <motion.div 
            animate={isOpen ? { rotate: -45, y: -4, backgroundColor: "#000" } : { rotate: 0, y: 0, backgroundColor: "#e8e2d6" }}
            transition={{ duration: 0.9, ease: [0.19, 1, 0.22, 1] }} 
            className="w-8 h-[2px]"
          />
        </button>
      </nav>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ y: "-100%" }}
            animate={{ y: 0 }}
            exit={{ y: "-100%" }}
            transition={{ duration: 0.6, ease: fastEase }}
            className="fixed inset-0 z-[100] flex bg-white overflow-hidden" 
          >
            {/* LEFT SIDE: Text Anchored to Bottom */}
            <div className="w-1/2 h-full flex flex-col justify-end pb-24 px-24">
              <div className="flex flex-col">
                {menuItems.map((item, index) => (
                  <MenuItem 
                    key={index}
                    label={item.label} 
                    to={item.to}
                    isDimmed={hoveredIndex !== index}
                    onHover={() => setHoveredIndex(index)}
                    close={() => setIsOpen(false)} 
                  />
                ))}
              </div>
            </div>

            {/* RIGHT SIDE: FAST SIMULTANEOUS FADE */}
            <div className="w-1/2 h-full relative bg-black">
              <AnimatePresence initial={false}>
                <motion.div
                  key={hoveredIndex}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: "linear" }} // Faster fade
                  className="absolute inset-0 w-full h-full"
                >
                  <img
                    src={menuItems[hoveredIndex].src}
                    className="w-full h-full object-cover"
                    alt="Menu Preview"
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

const MenuItem = ({ label, to, onHover, close, isDimmed }) => (
  <div 
    className="overflow-hidden py-1" 
    onMouseEnter={onHover}
    onClick={close}
  >
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: [0.19, 1, 0.22, 1] }}
    >
      <LinkTransition 
        to={to} 
        className={`text-[5.5vw] leading-[0.9] font-bold italic uppercase tracking-tighter block transition-opacity duration-300 cursor-pointer ${isDimmed ? 'opacity-50' : 'opacity-100'} text-black`}
      >
        {label}
      </LinkTransition>
    </motion.div>
  </div>
);

export default Navbar;