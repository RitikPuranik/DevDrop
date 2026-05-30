import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import LinkTransition from './TransitionLink';
import AuthModal from './Login';
import { LogOut } from "lucide-react";
import { useNavigate } from 'react-router-dom';
import { userAPI } from '../api/user';

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

  const checkLoginStatus = async () => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    let parsedUser = null;
    try {
      parsedUser = storedUser ? JSON.parse(storedUser) : null;
    } catch {
      parsedUser = null;
    }
    setIsLoggedIn(!!token);
    if (!token) {
      setIsAdmin(false);
      return;
    }

    try {
      const res = await userAPI.getProfile();
      const freshUser = res.data?.data?.user;
      const role = freshUser?.role;
      if (freshUser) {
        localStorage.setItem("user", JSON.stringify(freshUser));
      }
      setIsAdmin(role === 'admin');
    } catch {
      setIsAdmin(false);
    }
  };

  useEffect(() => {
    checkLoginStatus();
    window.addEventListener('storage', checkLoginStatus);
    window.addEventListener('auth-changed', checkLoginStatus);
    return () => {
      window.removeEventListener('storage', checkLoginStatus);
      window.removeEventListener('auth-changed', checkLoginStatus);
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
        onClose={() => { setShowAuthModal(false); checkLoginStatus(); }}
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
              setIsOpen(false);
              setWebsitesExpanded(false);
              setHoveredIndex(null);
              setHoveredSubIndex(null);
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
            className="fixed inset-0 z-[100] overflow-hidden
                        flex flex-col lg:flex-row
                        bg-[#e8e2d6]"
          >

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                LEFT / MENU PANEL
                — Full width on mobile, half width on desktop
                — On mobile: takes ~60% of screen height (flex-[3])
                — On desktop: takes 50% width, full height (original)
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <div className="
              flex-[3] lg:flex-none
              w-full lg:w-1/2
              lg:h-full
              flex flex-col justify-center text-center
              pt-24 pb-6 sm:pt-28 sm:pb-8 lg:pt-0 lg:pb-12
              px-6 sm:px-14 md:px-20 lg:px-24
              overflow-y-auto
            ">
              {/* Menu links */}
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

                {/* Mobile inline sub-menu — expands below "Websites" */}
                <AnimatePresence>
                  {websitesExpanded && isMobile && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.35, ease: fastEase }}
                      className="overflow-hidden pl-5"
                    >
                      {finalMenuItems
                        .find((m) => m.hasSubMenu)
                        ?.subItems.map((sub, si) => (
                          <MobileSubMenuItem
                            key={sub.filter}
                            label={sub.label}
                            index={si}
                            onClick={() => handleSubItemClick(sub.filter)}
                          />
                        ))}
                    </motion.div>
                  )}
                </AnimatePresence>
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

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                RIGHT / IMAGE PANEL
                — On desktop: right half, full height (original)
                — On mobile: bottom strip, ~40% screen height (flex-[2])
                  with the same crossfade image + sub-menu overlay
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <div className="
              flex-[2] lg:flex-none
              w-full lg:w-1/2
              min-h-[38vh] sm:min-h-[40vh] lg:min-h-0 lg:h-full
              relative bg-black overflow-hidden
            ">
              {/* Crossfading image — same logic on both mobile and desktop */}
              <AnimatePresence initial={false}>
                <motion.div
                  key={activeImageIndex}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: websitesExpanded ? 0.3 : 1 }}
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

              {/* Sub-menu overlay on image panel
                  Desktop: shown when websitesExpanded (original behaviour)
                  Mobile:  hidden — sub-menu renders inline in the menu panel above */}
              <AnimatePresence>
                {websitesExpanded && !isMobile && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25, ease: fastEase }}
                    className="absolute inset-0 flex flex-col justify-center px-16 z-10"
                  >
                    <motion.p
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 0.55, y: 0 }}
                      transition={{ delay: 0.05, duration: 0.35 }}
                      className="text-[#e8e2d6] text-sm font-sans uppercase tracking-[0.3em] mb-6"
                    >
                      Websites
                    </motion.p>
                    <div className="flex flex-col">
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
const MenuItem = ({ item, onHover, onLeave, onClick, closeMenu, isDimmed, isExpanded }) => (
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
          <motion.span
            animate={{ x: isExpanded ? 6 : 0, opacity: isExpanded ? 1 : 0.4 }}
            transition={{ duration: 0.3 }}
            className="inline-block ml-2 text-[5.5vw] sm:text-[4vw] lg:text-[2.8vw] align-middle"
          >
            ›
          </motion.span>
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

/* ─── Desktop Sub-Menu Item (image panel overlay) ────────────────── */
const SubMenuItem = ({ label, index, isDimmed, onHover, onLeave, onClick }) => (
  <motion.div
    initial={{ opacity: 0, x: 24 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: index * 0.08 + 0.08, duration: 0.45, ease: [0.19, 1, 0.22, 1] }}
    className="overflow-hidden py-0.5"
    onMouseEnter={onHover}
    onMouseLeave={onLeave}
    onClick={onClick}
  >
    <span
      className={`
        text-[5.0vw] leading-[0.9] font-serif italic tracking-tighter
        block transition-all duration-300 cursor-pointer select-none text-[#e8e2d6]
        ${isDimmed ? 'opacity-20' : 'opacity-100'}
      `}
    >
      {label}
    </span>
  </motion.div>
);

/* ─── Mobile Sub-Menu Item (inline in menu panel) ────────────────── */
const MobileSubMenuItem = ({ label, index, onClick }) => (
  <motion.div
    initial={{ opacity: 0, x: 16 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: index * 0.07 + 0.05, duration: 0.4, ease: [0.19, 1, 0.22, 1] }}
    className="overflow-hidden py-0.5"
    onClick={onClick}
  >
    <span className="text-[8.5vw] sm:text-[6.5vw] leading-[0.95] font-serif italic tracking-tighter block cursor-pointer select-none text-[#8b7355]">
      {label}
    </span>
  </motion.div>
);

export default Navbar;
