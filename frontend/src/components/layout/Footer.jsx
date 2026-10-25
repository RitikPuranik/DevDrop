import React, { useState, useEffect } from 'react';
import { ACCENT_THEMES } from '../../hooks/useAccentTheme';

// Dark footer that follows the site's black theme and the user's chosen accent (gold, beige, brown, charcoal).
const readAccent = () => {
  try {
    const t = ACCENT_THEMES[localStorage.getItem('devdrop_accent_theme')];
    return (t || ACCENT_THEMES.gold).accent;
  } catch {
    return ACCENT_THEMES.gold.accent;
  }
};

const NAV = [
  { label: 'Templates' },
  { label: 'Archive' },
  { label: 'Components' },
  { label: 'Documentation', href: '/docs' },
  { label: 'Process' },
  { label: 'Licensing' },
  { label: 'Contact' },
];

const SOCIAL = ['Instagram', 'Dribbble', 'X.com'];

const Rule = () => (
  <span aria-hidden="true" className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
);

const DevDropFooter = () => {
  const [accent, setAccent] = useState(readAccent);
  useEffect(() => {
    const sync = () => setAccent(readAccent());
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  return (
    <footer
      style={{ '--f-accent': accent }}
      className="relative w-full overflow-hidden border-t border-white/[0.08] bg-[#08090a] px-[5vw] pb-24 pt-20 text-[#e7e9ea] md:pb-8"
    >
      {/* soft ambient glow + top hairline */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div
          className="absolute -top-40 left-1/2 h-[420px] w-[760px] -translate-x-1/2 rounded-full blur-[110px]"
          style={{ background: 'radial-gradient(circle, rgba(255,170,90,0.20), rgba(255,100,150,0.10) 45%, transparent 70%)' }}
        />
        <div className="absolute inset-x-[10%] top-0 h-px bg-gradient-to-r from-transparent via-[#ffb457]/50 to-transparent" />
      </div>

      <div className="relative">
        {/* Wordmark between hairlines */}
        <div className="flex items-center gap-8">
          <Rule />
          <h2 className="font-display text-[52px] italic leading-none tracking-tight md:text-[76px]">
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(100deg, #ffffff 0%, #ffd27a 45%, #ff8fb0 85%)', WebkitBackgroundClip: 'text' }}
            >
              devdrop
            </span>
            <span className="text-[var(--f-accent)]">.</span>
          </h2>
          <Rule />
        </div>

        <p className="font-display mx-auto mt-6 max-w-2xl text-balance text-center text-[20px] italic leading-snug text-white/45 md:text-[24px]">
          Considered templates, components and sites — made with care.
        </p>

        {/* Navigation */}
        <nav aria-label="Footer" className="mx-auto mt-10 flex max-w-4xl flex-wrap items-center justify-center gap-x-3 gap-y-3">
          {NAV.map((item, i) => (
            <React.Fragment key={item.label}>
              {i > 0 && <span aria-hidden="true" className="text-white/20">·</span>}
              {item.href ? (
                <a href={item.href} className="font-display text-[19px] text-white/70 transition-colors hover:text-[#ffd27a]">{item.label}</a>
              ) : (
                <span className="font-display cursor-pointer text-[19px] text-white/70 transition-colors hover:text-[#ffd27a]">{item.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>

        {/* Social */}
        <div className="mt-6 flex items-center justify-center gap-8 text-[10.5px] uppercase tracking-[0.24em] text-white/35">
          {SOCIAL.map((s) => (
            <span
              key={s}
              className="cursor-pointer border-b border-transparent pb-0.5 transition-colors hover:border-[#ffb457] hover:text-white"
              style={{ fontWeight: 600 }}
            >
              {s}
            </span>
          ))}
        </div>

        {/* Legal */}
        <div className="mt-12 flex flex-col items-center gap-3 border-t border-white/[0.08] pt-6 text-[12px] text-white/35 md:flex-row md:justify-between md:pr-28">
          <p>© {new Date().getFullYear()} DevDrop Studio. All rights reserved.</p>
          <div className="flex items-center gap-7">
            <a href="/terms" className="transition-colors hover:text-white">Terms of Service</a>
            <a href="/privacy" className="transition-colors hover:text-white">Privacy Policy</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default DevDropFooter;