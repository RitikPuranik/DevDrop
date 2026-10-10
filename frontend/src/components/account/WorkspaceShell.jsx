import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, LogOut, Menu, X, Settings, Boxes } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function WorkspaceShell({
  profile,
  navItems,
  activeSection,
  onSelectSection,
  onLogout,
  pageTitle,
  pageSubtitle,
  headerAction,
  children,
}) {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeItem = navItems.find((n) => n.id === activeSection);

  return (
    <div className="ws min-h-screen">
      <div className="flex">
        {/* DESKTOP SIDEBAR */}
        <aside className="hidden lg:flex lg:flex-col w-[272px] shrink-0 h-screen sticky top-0 border-r border-white/[0.08] bg-[#050505]">
          <SidebarInner
            profile={profile}
            navItems={navItems}
            activeSection={activeSection}
            onSelectSection={onSelectSection}
            onLogout={onLogout}
            navigate={navigate}
          />
        </aside>

        {/* MOBILE TOPBAR */}
        <div className="lg:hidden fixed top-[78px] left-0 right-0 z-40 flex items-center justify-between px-4 py-3 bg-[#0a0a0a]  border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#e8e2d6] flex items-center justify-center">
              <Boxes size={14} className="text-[#050505]" />
            </div>
            <p className="ws-display text-[17px] text-white">Workspace</p>
          </div>
          <button
            onClick={() => setMobileOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/[0.05] border border-white/[0.15] text-white/85 text-[13px] font-semibold"
          >
            <Menu size={15} /> Sections
          </button>
        </div>

        <AnimatePresence>
          {mobileOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMobileOpen(false)}
                className="lg:hidden fixed inset-0 z-50 bg-black/70 "
              />
              <motion.aside
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', bounce: 0.1, duration: 0.4 }}
                className="lg:hidden fixed top-0 left-0 bottom-0 z-50 w-[84%] max-w-[300px] bg-[#0a0a0a] border-r border-white/[0.08] flex flex-col"
              >
                <div className="flex items-center justify-end p-3">
                  <button onClick={() => setMobileOpen(false)} className="p-2 rounded-lg bg-white/[0.06] text-white/70">
                    <X size={16} />
                  </button>
                </div>
                <SidebarInner
                  profile={profile}
                  navItems={navItems}
                  activeSection={activeSection}
                  onSelectSection={(id) => { onSelectSection(id); setMobileOpen(false); }}
                  onLogout={onLogout}
                  navigate={navigate}
                />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* MAIN CONTENT */}
        <main className="flex-1 min-w-0 overflow-x-clip pt-[10rem] lg:pt-6">
  <div className="max-w-6xl mx-auto px-5 sm:px-8 py-5 lg:py-6">
    {(pageTitle || headerAction) && (
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8 pb-6 border-b border-white/[0.08]">
        <div>
          {activeItem && (
            <div className="flex items-center gap-2 mb-2.5">
              <activeItem.icon
                size={14}
                strokeWidth={2}
                className="text-[#cbb392]"
              />
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/55">
                {activeItem.label}
              </span>
            </div>
          )}

          <h1 className="ws-display text-[30px] md:text-[40px] text-white leading-[1.1]">
            {pageTitle}
          </h1>

          {pageSubtitle && (
            <p className="text-white/60 text-[15px] mt-2 max-w-xl leading-relaxed">
              {pageSubtitle}
            </p>
          )}
        </div>

        {headerAction}
      </div>
    )}

    {children}
  </div>
</main>
      </div>
    </div>
  );
}

function SidebarInner({ profile, navItems, activeSection, onSelectSection, onLogout, navigate }) {
  return (
    <div className="flex flex-col h-full">
      {/* Spacer clears the site's fixed floating logo/menu bar (~112px tall on desktop) */}
      <div className="hidden lg:block h-28 shrink-0" />
      <div className="hidden lg:flex items-center gap-3 px-5 pb-5 border-b border-white/[0.08]">
        <div
  className="w-9 h-9 rounded-xl bg-[#e8e2d6] flex items-center justify-center shrink-0"
>
          <Boxes size={17} className="text-[#050505]" strokeWidth={2.25} />
        </div>
        <p className="ws-display text-[20px] text-white leading-none">Workspace</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectSection(item.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[14.5px] font-semibold transition-colors relative ${
                isActive
                  ? 'bg-[#e8e2d6] text-[#050505]'
                  : 'text-white/60 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
                            <item.icon size={17} strokeWidth={2} className={isActive ? 'text-[#050505]' : 'text-white/50'} />
              <span className="flex-1 whitespace-nowrap text-left">{item.label}</span>
              {item.badge && (
                <span className="text-[9px] font-bold px-1.5 py-[3px] rounded-full leading-none tracking-wide" style={isActive ? { backgroundColor: 'rgba(5,5,5,0.12)', color: '#050505' } : { backgroundColor: 'var(--accent-soft)', color: '#cbb392' }}>
                  {item.badge}
                </span>
              )}
              {item.count != null && item.count > 0 && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/[0.1] text-white/70">{item.count}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-3 pb-4 pt-3 border-t border-white/[0.08] space-y-0.5">
        <button
          onClick={() => navigate('/profile')}
          className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/[0.04] transition-colors text-left mb-1"
        >
          <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 ring-1 ring-white/[0.12]">
            {profile?.avatar ? (
              <img src={profile.avatar} alt={profile?.name || 'User'} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[13px] font-bold text-black" style={{ backgroundColor: 'var(--accent)' }}>
                {profile?.name?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold text-white truncate leading-tight">{profile?.name || 'User'}</p>
            <p className="text-[12px] text-white/50 truncate leading-tight mt-0.5">{profile?.email || ''}</p>
          </div>
          <Settings size={14} className="text-white/30 shrink-0" />
        </button>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] font-semibold text-white/55 hover:text-red-300 hover:bg-red-500/[0.08] transition-colors"
        >
          <LogOut size={15} className="text-white/35" />
          Log out
        </button>
      </div>
    </div>
  );
}

export function WorkspaceLoading() {
  return (
    <div className="ws min-h-screen flex items-center justify-center">
      <Loader2 className="animate-spin text-[#cbb392]" size={30} />
    </div>
  );
}
