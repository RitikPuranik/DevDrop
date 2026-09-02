import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, LogOut, Menu, X, Settings, ChevronRight } from 'lucide-react';
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
    <div className="min-h-screen bg-[#050505] text-[#f1ece2] antialiased">
      <div className="flex">
        {/* ── DESKTOP SIDEBAR ── */}
        <aside className="hidden lg:flex lg:flex-col w-[272px] shrink-0 h-screen sticky top-0 border-r border-white/8 bg-[#0a0a0a]">
          <SidebarInner
            profile={profile}
            navItems={navItems}
            activeSection={activeSection}
            onSelectSection={onSelectSection}
            onLogout={onLogout}
            navigate={navigate}
          />
        </aside>

        {/* ── MOBILE TOPBAR (workspace section menu) — sits below the site navbar ── */}
        <div className="lg:hidden fixed top-[78px] left-0 right-0 z-40 flex items-center justify-between px-4 py-3 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/8">
          <p className="font-serif italic text-[15px] text-white/70">Workspace</p>
          <button
            onClick={() => setMobileOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 text-[10px] font-bold uppercase tracking-wider"
          >
            <Menu size={14} /> Sections
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
                className="lg:hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
              />
              <motion.aside
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', bounce: 0.1, duration: 0.45 }}
                className="lg:hidden fixed top-0 left-0 bottom-0 z-50 w-[82%] max-w-[300px] bg-[#0a0a0a] border-r border-white/8 flex flex-col"
              >
                <div className="flex items-center justify-end p-3">
                  <button onClick={() => setMobileOpen(false)} className="p-2 rounded-xl bg-white/5 text-white/60">
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

        {/* ── MAIN CONTENT ── */}
        <main className="flex-1 min-w-0 pt-36 lg:pt-28">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 lg:py-12">
            {(pageTitle || headerAction) && (
              <div className="flex items-start justify-between gap-4 mb-9 pb-7 border-b border-white/[0.06]">
                <div>
                  {activeItem && (
                    <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-white/35 font-semibold mb-3">
                      Workspace <ChevronRight size={11} /> <span className="text-[var(--accent)]">{activeItem.label}</span>
                    </p>
                  )}
                  <h1 className="text-[28px] md:text-4xl font-serif italic tracking-tight text-white leading-tight">{pageTitle}</h1>
                  {pageSubtitle && <p className="text-white/50 text-sm mt-2 max-w-md">{pageSubtitle}</p>}
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
      {/* Spacer so the site navbar (fixed, top-right hamburger) has room above the sidebar content */}
      <div className="hidden lg:flex h-24 shrink-0 items-end pb-4 px-6">
        <p className="font-serif italic text-lg text-white/85 tracking-tight">Workspace</p>
      </div>

      {/* User mini card */}
      <button
        onClick={() => navigate('/profile')}
        className="mx-4 mb-6 flex items-center gap-3 px-3 py-3 rounded-2xl bg-white/[0.03] border border-white/8 hover:bg-white/[0.06] hover:border-white/15 transition-all text-left"
      >
        <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 ring-1 ring-white/10">
          {profile?.avatar ? (
            <img src={profile.avatar} alt={profile?.name || 'User'} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[var(--accent)] to-black/40 flex items-center justify-center text-sm font-serif italic text-white">
              {profile?.name?.[0]?.toUpperCase() || 'U'}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{profile?.name || 'User'}</p>
          <p className="text-[11px] text-white/40 truncate">{profile?.email || ''}</p>
        </div>
        <Settings size={14} className="text-white/30 shrink-0" />
      </button>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectSection(item.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.75 rounded-xl text-sm font-medium transition-all group relative ${
                isActive ? 'text-white' : 'text-white/50 hover:text-white hover:bg-white/[0.04]'
              }`}
              style={isActive ? { backgroundColor: 'var(--accent-soft)' } : undefined}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-[var(--accent)]" />
              )}
              <item.icon size={16} className={isActive ? 'text-[var(--accent)]' : 'text-white/35 group-hover:text-white/70'} />
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge != null && item.badge > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-white/70">{item.badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-5 pt-3 mt-2 border-t border-white/8 space-y-1">
        <button
          onClick={() => navigate('/profile')}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:text-white hover:bg-white/[0.04] transition-all"
        >
          <Settings size={16} className="text-white/35" />
          Profile &amp; Settings
        </button>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:text-red-300 hover:bg-red-500/10 transition-all"
        >
          <LogOut size={16} className="text-white/35" />
          Logout
        </button>
      </div>
    </div>
  );
}

export function WorkspaceLoading() {
  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center">
      <Loader2 className="animate-spin text-[var(--accent,#8b7355)]" size={36} />
    </div>
  );
}
