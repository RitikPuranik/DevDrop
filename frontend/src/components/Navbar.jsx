import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import LinkTransition from './TransitionLink';
import img from '../assets/image.png'; 

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState(0);

  const menuItems = [
    { to: "/", label: "Home", src: "https://images.unsplash.com/photo-1642543349642-0d04e91511c9?q=80&w=871&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" },
    { to: "/template", label: "Websites", src: "https://images.unsplash.com/photo-1467232004584-a241de8bcf5d?q=80&w=869" },
    { to: "/about", label: "About Us", src: img },
    { to: "/review", label: "People's Love", src: "https://plus.unsplash.com/premium_photo-1739436074076-3c6d73478d59?q=80&w=812&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" },
    { to: "/contact", label: "Make Your Own", src: "https://images.unsplash.com/photo-1703669020883-66f3e77ae929?q=80&w=435&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" },
    { to: "/contact", label: "Contact Us", src: "https://images.unsplash.com/photo-1703669020883-66f3e77ae929?q=80&w=435&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" },
  ];

  const fastEase = [0.19, 1, 0.22, 1];

  return (
    <>
      <nav className="fixed top-0 w-full px-12 py-8 flex justify-between items-center z-[110] mix-blend-difference">
        <LinkTransition to="/" className="text-blue-50 font-serif italic text-3xl tracking-tighter">
          devdrop
        </LinkTransition>

        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="w-12 h-12 flex flex-col justify-center items-center gap-1.5 cursor-pointer relative group"
        >
          <AnimatePresence>
            {isOpen && (
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute inset-0 bg-[#e8e2d6] rounded-full z-[-1]"
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
            className="fixed inset-0 z-[100] flex bg-[#e8e2d6] overflow-hidden" 
          >
            {/* LEFT SIDE: Content shifted up and centered */}
            <div className=" mt-12  w-1/2 h-full flex flex-col justify-center text-center pb-12 px-24">
              
              {/* Menu Section */}
              <div className="flex flex-col -ml-5 mb-5">
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

              {/* Login Button Section - Centered with Brown Color */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.6, ease: fastEase }}
                className="flex flex-col items-center -ml-5"
              >
                <LinkTransition 
                  to="/login"
                  onClick={() => setIsOpen(false)}
                  className="px-12 py-4 bg-[#8b7355] text-white  rounded-full font-bold tracking-widest uppercase text-[10px] hover:bg-black transition-all duration-500 shadow-lg active:scale-95"
                >
                   Login
                </LinkTransition>
              </motion.div>

            </div>

            {/* RIGHT SIDE: FAST SIMULTANEOUS FADE */}
            <div className="w-1/2 h-full relative bg-black">
              <AnimatePresence initial={false}>
                <motion.div
                  key={hoveredIndex}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: "linear" }}
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
        className={`text-[5.0vw] leading-[1.1] font-serif italic tracking-tighter block transition-opacity duration-300 cursor-pointer ${isDimmed ? 'opacity-50' : 'opacity-100'} text-black`}
      >
        {label}
      </LinkTransition>
    </motion.div>
  </div>
);

export default Navbar;