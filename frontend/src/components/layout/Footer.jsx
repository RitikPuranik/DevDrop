// import React, { useState, useEffect } from 'react';
// import { ACCENT_THEMES } from '../../hooks/useAccentTheme';

// // Follows the site's black + beige theme and the user's chosen accent (gold, beige, brown, charcoal).
// const readAccent = () => {
//   try {
//     const t = ACCENT_THEMES[localStorage.getItem('devdrop_accent_theme')];
//     return (t || ACCENT_THEMES.gold).accent;
//   } catch {
//     return ACCENT_THEMES.gold.accent;
//   }
// };

// const NAV = [
//   { label: 'Templates' },
//   { label: 'Archive' },
//   { label: 'Components' },
//   { label: 'Documentation', href: '/docs' },
//   { label: 'Process' },
//   { label: 'Licensing' },
//   { label: 'Contact' },
// ];

// const SOCIAL = ['Instagram', 'Dribbble', 'X.com'];

// const Rule = () => <span aria-hidden="true" className="h-px flex-1 bg-[var(--f-accent)]" />;

// const DevDropFooter = () => {
//   const [accent, setAccent] = useState(readAccent);
//   useEffect(() => {
//     const sync = () => setAccent(readAccent());
//     window.addEventListener('storage', sync);
//     return () => window.removeEventListener('storage', sync);
//   }, []);

//   return (
//   <footer style={{ '--f-accent': accent }} className="mb-2  h-100 w-full border-t border-[#050505]/15 bg-[#e8e2d6] px-[5vw] pb-24 pt-16 text-[#050505] md:pb-6">
//     {/* Wordmark between hairlines */}
//     <div className="flex items-center gap-8">
//       <Rule />
//       <h2 className="font-display text-[52px] italic leading-none tracking-tight md:text-[76px]">devdrop<span className="text-[var(--f-accent)]">.</span></h2>
//       <Rule />
//     </div>

//     <p className="font-display mx-auto mt-6 max-w-2xl text-balance text-center text-[20px] italic leading-snug text-[#050505]/65 md:text-[24px]">
//       Considered templates, components and sites — made with care.
//     </p>

//     {/* Navigation */}
//     <nav aria-label="Footer" className="mx-auto mt-10 flex max-w-4xl flex-wrap items-center justify-center gap-x-3 gap-y-3">
//       {NAV.map((item, i) => (
//         <React.Fragment key={item.label}>
//           {i > 0 && <span aria-hidden="true" className="text-[var(--f-accent)]">·</span>}
//           {item.href ? (
//             <a href={item.href} className="font-display text-[19px] text-[#050505] transition-colors hover:text-[var(--f-accent)]/80">{item.label}</a>
//           ) : (
//             <span className="font-display cursor-pointer text-[19px] text-[#050505] transition-colors hover:text-[var(--f-accent)]/80">{item.label}</span>
//           )}
//         </React.Fragment>
//       ))}
//     </nav>

//     {/* Social */}
//     <div className="mt-5 flex items-center justify-center gap-8 text-[10.5px] uppercase tracking-[0.24em] text-[#050505]/55">
//       {SOCIAL.map((s) => (
//         <span key={s} className="cursor-pointer border-b border-transparent pb-0.5 transition-colors hover:border-[var(--f-accent)] hover:text-[#050505]" style={{ fontWeight: 600 }}>{s}</span>
//       ))}
//     </div>

//     {/* Legal */}
//     <div className="mt-10 flex flex-col items-center gap-3 border-t border-[#050505]/15 pt-5 text-[12px] text-[#050505]/80 md:flex-row md:justify-between md:pr-28">
//       <p>© {new Date().getFullYear()} DevDrop Studio. All rights reserved.</p>
//       <div className="flex items-center gap-7">
//         <a href="/terms" className="transition-colors hover:text-[#050505]">Terms of Service</a>
//         <a href="/privacy" className="transition-colors hover:text-[#050505]">Privacy Policy</a>
//       </div>
//     </div>
//   </footer>
//   );
// };

// export default DevDropFooter;