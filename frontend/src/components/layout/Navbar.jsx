import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import LinkTransition from '../navigation/TransitionLink';
import AuthModal from '../auth/AuthModal';
import { LogOut } from "lucide-react";
import { useNavigate } from 'react-router-dom';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [websitesExpanded, setWebsitesExpanded] = useState(false);
  const [hoveredSubIndex, setHoveredSubIndex] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const syncFromStorage = () => {
    const token = localStorage.getItem("token");
    setIsLoggedIn(!!token);
    if (!token) { setIsAdmin(false); return; }
    try {
      const stored = localStorage.getItem("user");
      const user = stored ? JSON.parse(stored) : null;
      setIsAdmin(user?.role === 'admin');
    } catch {
      setIsAdmin(false);
    }
  };

  useEffect(() => {
    syncFromStorage();
    window.addEventListener('storage', syncFromStorage);
    window.addEventListener('auth-changed', syncFromStorage);
    return () => {
      window.removeEventListener('storage', syncFromStorage);
      window.removeEventListener('auth-changed', syncFromStorage);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.dispatchEvent(new Event("auth-changed"));
    setIsLoggedIn(false);
    setIsAdmin(false);
    setIsOpen(false);
  };

  const menuItems = [
    {
      to: "/",
      label: "Home",
      src: "https://images.unsplash.com/photo-1642543349642-0d04e91511c9?q=80&w=871",
      hasSubMenu: false,
    },
    {
      to: "/template",
      label: "Websites",
      src: "https://images.unsplash.com/photo-1467232004584-a241de8bcf5d?q=80&w=869",
      hasSubMenu: true,
      subItems: [
        { label: "Free", filter: "free" },
        { label: "Paid", filter: "paid" },
        { label: "Exclusive", filter: "exclusive" },
      ],
    },
    {
      to: "/about",
      label: "About Us",
      src: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?q=80&w=870",
      hasSubMenu: false,
    },
    {
      to: "/review",
      label: "People's Love",
      src: "https://plus.unsplash.com/premium_photo-1739436074076-3c6d73478d59?q=80&w=812",
      hasSubMenu: false,
    },
    {
      to: "/contact",
      label: "Contact Us",
      src: "https://images.unsplash.com/photo-1534536281715-e28d76689b4d?q=80&w=870",
      hasSubMenu: false,
    },
  ];

  const finalMenuItems = isLoggedIn
    ? [
        ...menuItems,
        {
          to: "/profile",
          label: "Profile",
          src: "https://images.unsplash.com/photo-1511367461989-f85a21fda167?q=80&w=1000",
          hasSubMenu: false,
        },
        ...(isAdmin
          ? [{ to: "/admin", label: "Admin", src: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=1000", hasSubMenu: false }]
          : []),
      ]
    : menuItems;

  const fastEase = [0.19, 1, 0.22, 1];
  const openLogin = () => { setIsOpen(false); setShowAuthModal(true); };

  const closeMenu = () => {
    setIsOpen(false);
    setWebsitesExpanded(false);
    setHoveredIndex(null);
    setHoveredSubIndex(null);
  };

  const handleMenuItemClick = (item) => {
    if (item.hasSubMenu) {
      setWebsitesExpanded((prev) => !prev);
      setHoveredSubIndex(null);
    } else {
      closeMenu();
    }
  };

  const handleSubItemClick = (filter) => {
    closeMenu();
    navigate(`/template?filter=${filter}`);
  };

  const activeImageIndex =
    websitesExpanded
      ? finalMenuItems.findIndex((m) => m.hasSubMenu)
      : hoveredIndex !== null
      ? hoveredIndex
      : 0;

  return (
    <>
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => { setShowAuthModal(false); syncFromStorage(); }}
      />

      {/* NAVBAR TOP STRIP */}
      <nav className="fixed top-0 w-full px-5 sm:px-8 lg:px-12 py-5 sm:py-6 lg:py-8 flex justify-between items-center z-[110] mix-blend-difference pointer-events-none">
        <LinkTransition
          to="/"
          className="text-blue-50 font-serif italic text-2xl sm:text-3xl tracking-tighter pointer-events-auto"
        >
          devdrop
        </LinkTransition>

        <button
          onClick={() => {
            if (isOpen) {
              closeMenu();
            } else {
              setIsOpen(true);
            }
          }}
          className="w-10 h-10 sm:w-12 sm:h-12 flex flex-col justify-center items-center gap-1.5 cursor-pointer relative group pointer-events-auto"
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
            className="w-7 sm:w-8 h-[2px]"
          />
          <motion.div
            animate={isOpen ? { rotate: -45, y: -4, backgroundColor: "#000" } : { rotate: 0, y: 0, backgroundColor: "#e8e2d6" }}
            transition={{ duration: 0.9, ease: fastEase }}
            className="w-7 sm:w-8 h-[2px]"
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
            className="fixed inset-0 z-[100] overflow-hidden flex flex-col lg:flex-row bg-[#e8e2d6]"
          >
            {/* LEFT / MENU PANEL */}
            <div className="flex-[3] lg:flex-none w-full lg:w-1/2 lg:h-full flex flex-col justify-center text-center pt-28 pb-6 sm:pt-36 sm:pb-8 lg:pt-20 lg:pb-12 px-6 sm:px-14 md:px-20 lg:px-24 overflow-y-auto">
              <div className="flex flex-col w-full mb-5 sm:mb-8 -ml-0 lg:-ml-5">
                {finalMenuItems.map((item, index) => {
                  const anyHovered = hoveredIndex !== null;
                  const isDimmed = anyHovered
                    ? hoveredIndex !== index
                    : websitesExpanded
                    ? !item.hasSubMenu
                    : false;

                  return (
                    <MenuItem
                      key={`${isLoggedIn}-${index}`}
                      item={item}
                      isDimmed={isDimmed}
                      onHover={() => !isMobile && setHoveredIndex(index)}
                      onLeave={() => !isMobile && setHoveredIndex(null)}
                      onClick={() => handleMenuItemClick(item)}
                      closeMenu={closeMenu}
                      isExpanded={item.hasSubMenu && websitesExpanded}
                    />
                  );
                })}
              </div>

              {/* Auth button */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.6, ease: fastEase }}
                className="flex flex-col items-center w-full -ml-0 lg:-ml-5"
              >
                {!isLoggedIn ? (
                  <button
                    onClick={openLogin}
                    className="px-10 sm:px-12 py-3 sm:py-4 bg-[#8b7355] text-white rounded-full font-bold tracking-widest uppercase text-[10px] hover:bg-black transition-all duration-500 shadow-lg active:scale-95"
                  >
                    Login
                  </button>
                ) : (
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 px-7 sm:px-8 py-2.5 sm:py-3 bg-[#8b7355] text-white rounded-full text-[10px] uppercase tracking-[0.2em] font-bold hover:bg-black transition-all duration-500 shadow-lg active:scale-95"
                  >
                    <LogOut size={14} />
                    Logout
                  </button>
                )}
              </motion.div>
            </div>

            {/* RIGHT / IMAGE PANEL */}
            <div className="flex-[2] lg:flex-none w-full lg:w-1/2 min-h-[38vh] sm:min-h-[40vh] lg:min-h-0 lg:h-full relative bg-black overflow-hidden">
              <AnimatePresence initial={false}>
                <motion.div
                  key={activeImageIndex}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: websitesExpanded ? 0.35 : 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: "linear" }}
                  className="absolute inset-0 w-full h-full"
                >
                  <img
                    src={finalMenuItems[activeImageIndex]?.src || finalMenuItems[0].src}
                    className="w-full h-full object-cover"
                    alt="Menu Preview"
                  />
                </motion.div>
              </AnimatePresence>

              {/* Fully Centered Submenu overlay for both mobile and desktop views */}
              <AnimatePresence>
                {websitesExpanded && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25, ease: fastEase }}
                    className="absolute inset-0 flex flex-col justify-center items-center text-center p-6 sm:p-10 lg:px-16 z-10 bg-black/40"
                  >
                    <motion.p
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 0.6, y: 0 }}
                      transition={{ delay: 0.05, duration: 0.35 }}
                      className="text-[#e8e2d6] text-[10px] sm:text-xs lg:text-sm font-sans uppercase tracking-[0.3em] mb-3 lg:mb-6"
                    >
                      Websites
                    </motion.p>
                    <div className="flex flex-col gap-1 lg:gap-0 w-full items-center">
                      {finalMenuItems
                        .find((m) => m.hasSubMenu)
                        ?.subItems.map((sub, si) => {
                          const isSubDimmed = hoveredSubIndex !== null && hoveredSubIndex !== si;
                          return (
                            <SubMenuItem
                              key={sub.filter}
                              label={sub.label}
                              index={si}
                              isDimmed={isSubDimmed}
                              onHover={() => setHoveredSubIndex(si)}
                              onLeave={() => setHoveredSubIndex(null)}
                              onClick={() => handleSubItemClick(sub.filter)}
                            />
                          );
                        })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

/* ─── Menu Item ──────────────────────────────────────────────────── */
const MenuItem = ({ item, onHover, onLeave, onClick, closeMenu, isDimmed }) => (
  <div
    className="overflow-hidden py-0.5 sm:py-1"
    onMouseEnter={onHover}
    onMouseLeave={onLeave}
    onClick={onClick}
  >
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: [0.19, 1, 0.22, 1] }}
    >
      {item.hasSubMenu ? (
        <span
          className={`
            text-[11vw] sm:text-[8vw] lg:text-[5.0vw]
            leading-[0.9] font-serif italic tracking-tighter
            block transition-all duration-300 cursor-pointer select-none text-black
            ${isDimmed ? 'opacity-20' : 'opacity-100'}
          `}
        >
          {item.label}
        </span>
      ) : (
        <LinkTransition
          to={item.to}
          onClick={closeMenu}
          className={`
            text-[11vw] sm:text-[8vw] lg:text-[5.0vw]
            leading-[0.9] font-serif italic tracking-tighter
            block transition-all duration-300 cursor-pointer text-black
            ${isDimmed ? 'opacity-20' : 'opacity-100'}
          `}
        >
          {item.label}
        </LinkTransition>
      )}
    </motion.div>
  </div>
);

/* ─── Shared Universal Sub-Menu Item ────────────────── */
const SubMenuItem = ({ label, index, isDimmed, onHover, onLeave, onClick }) => (
  <motion.div
    initial={{ opacity: 0, y: 15 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.06 + 0.05, duration: 0.45, ease: [0.19, 1, 0.22, 1] }}
    className="overflow-hidden py-0.5 lg:py-1 w-fit w-full"
    onMouseEnter={onHover}
    onMouseLeave={onLeave}
    onClick={onClick}
  >
    <span
      className={`
        text-[8vw] sm:text-[6.5vw] lg:text-[5.0vw] leading-[0.95] lg:leading-[0.9] font-serif italic tracking-tighter
        block transition-all duration-300 cursor-pointer select-none text-[#e8e2d6]
        ${isDimmed ? 'opacity-25' : 'opacity-100'}
        hover:text-[#8b7355] lg:hover:text-[#e8e2d6]
      `}
    >
      {label}
    </span>
  </motion.div>
);

export default Navbar;