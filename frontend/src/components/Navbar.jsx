
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import LinkTransition from './TransitionLink';
import AuthModal from './Login'; 
import img from '../assets/image.png'; 
import { LogOut } from "lucide-react";

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState(0);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Sync login state
  const checkLoginStatus = () => {
    const token = localStorage.getItem("token");
    setIsLoggedIn(!!token);
  };

  useEffect(() => {
    checkLoginStatus();
    // Listen for storage changes (in case of login in another tab)
    window.addEventListener('storage', checkLoginStatus);
    return () => window.removeEventListener('storage', checkLoginStatus);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    setIsLoggedIn(false);
    setIsOpen(false);
  };

  // 1. Define your menu items
  const menuItems = [
    { to: "/", label: "Home", src: "https://images.unsplash.com/photo-1642543349642-0d04e91511c9?q=80&w=871" },
    { to: "/template", label: "Websites", src: "https://images.unsplash.com/photo-1467232004584-a241de8bcf5d?q=80&w=869" },
    { to: "/about", label: "About Us", src: img },
    { to: "/review", label: "People's Love", src: "https://plus.unsplash.com/premium_photo-1739436074076-3c6d73478d59?q=80&w=812" },
    { to: "/contact", label: "Contact Us", src: "https://images.unsplash.com/photo-1534536281715-e28d76689b4d?q=80&w=870" },
  ];

  // 2. Conditionally add Profile to the bottom of the list
  const finalMenuItems = isLoggedIn 
    ? [...menuItems, { to: "/profile", label: "Profile", src: "https://images.unsplash.com/photo-1511367461989-f85a21fda167?q=80&w=1000" }] 
    : menuItems;

  const fastEase = [0.19, 1, 0.22, 1];

  const openLogin = () => {
    setIsOpen(false);
    setShowAuthModal(true);
  };

  return (
    <>
      {/* AUTH MODAL */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => {
            setShowAuthModal(false);
            checkLoginStatus(); // Re-check status when modal closes
        }} 
      />

      {/* NAVBAR TOP STRIP */}
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
            transition={{ duration: 0.9, ease: fastEase }} 
            className="w-8 h-[2px]"
          />
          <motion.div 
            animate={isOpen ? { rotate: -45, y: -4, backgroundColor: "#000" } : { rotate: 0, y: 0, backgroundColor: "#e8e2d6" }}
            transition={{ duration: 0.9, ease: fastEase }} 
            className="w-8 h-[2px]"
          />
        </button>
      </nav>

      {/* FULL SCREEN MENU */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ y: "-100%" }}
            animate={{ y: 0 }}
            exit={{ y: "-100%" }}
            transition={{ duration: 0.6, ease: fastEase }}
            className="fixed inset-0 z-[100] flex bg-[#e8e2d6] overflow-hidden" 
          >
            {/* LEFT SIDE: Navigation Links */}
            <div className="mt-12 w-1/2 h-full flex flex-col justify-center text-center pb-12 px-24">
              <div className="flex flex-col -ml-5 mb-8">
                {finalMenuItems.map((item, index) => (
                  <MenuItem 
                    key={`${isLoggedIn}-${index}`} // Key change triggers re-render on login
                    label={item.label} 
                    to={item.to}
                    isDimmed={hoveredIndex !== index}
                    onHover={() => setHoveredIndex(index)}
                    close={() => setIsOpen(false)} 
                  />
                ))}
              </div>

              {/* ACTION BUTTONS (Login/Logout) */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.6, ease: fastEase }}
                className="flex flex-col items-center -ml-5"
              >
                {!isLoggedIn ? (
                  <button 
                    onClick={openLogin}
                    className="px-12 py-4 bg-[#8b7355] text-white rounded-full font-bold tracking-widest uppercase text-[10px] hover:bg-black transition-all duration-500 shadow-lg active:scale-95"
                  >
                    Login
                  </button>
                ) : (
                  <button 
                    onClick={handleLogout}
                    className="flex items-center gap-2 px-8 py-3 bg-[#8b7355] text-white rounded-full text-[10px] uppercase tracking-[0.2em] font-bold hover:bg-black transition-all duration-500 shadow-lg active:scale-95"
                  >
                    <LogOut size={14} />
                    Logout
                  </button>
                )}
              </motion.div>
            </div>

            {/* RIGHT SIDE: Hover Images */}
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
                    src={finalMenuItems[hoveredIndex]?.src || menuItems[0].src}
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
  <div className="overflow-hidden py-1" onMouseEnter={onHover} onClick={close}>
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: [0.19, 1, 0.22, 1] }}
    >
      <LinkTransition 
        to={to} 
        className={`text-[5.2vw] leading-[1.0] font-serif italic tracking-tighter block transition-all duration-300 cursor-pointer ${isDimmed ? 'opacity-30 scale-95' : 'opacity-100 scale-100'} text-black hover:opacity-100`}
      >
        {label}
      </LinkTransition>
    </motion.div>
  </div>
);

export default Navbar;