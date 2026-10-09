import React, { useState, useEffect } from 'react';

const COLUMNS = [
  { title: 'Explore', links: [{ label: 'Templates' }, { label: 'Archive' }, { label: 'Components' }, { label: 'Documentation', href: '/docs' }] },
  { title: 'Studio', links: [{ label: 'Process' }, { label: 'Licensing' }, { label: 'Contact' }] },
  { title: 'Elsewhere', links: [{ label: 'Instagram' }, { label: 'Dribbble' }, { label: 'X.com' }] },
];

const LINK = 'text-[15px] text-[#e8e2d6]/60 transition-colors duration-200 hover:text-[#e8e2d6]';

const DevDropFooter = () => {
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }));
    tick();
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, []);

  return (
    <footer className="w-full border-t border-[#e8e2d6]/15 bg-[#050505] px-[6vw] pb-8 pt-20 text-[#e8e2d6]">
      <div className="grid gap-16 lg:grid-cols-[1.3fr_1fr]">
        {/* Wordmark + statement */}
        <div>
          <h2 className="font-display text-[64px] italic leading-[0.9] tracking-tight md:text-[104px]">devdrop</h2>
          <p className="mt-8 max-w-md text-[15px] leading-7 text-[#e8e2d6]/55">
            A marketplace for considered web templates, components and AI-built sites. Made carefully, shipped quickly.
          </p>
        </div>

        {/* Link columns */}
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-12 sm:grid-cols-3">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="mb-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#b89f78]" style={{ fontWeight: 600 }}>{col.title}</h3>
              <ul className="space-y-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.href ? <a href={l.href} className={LINK}>{l.label}</a> : <span className={`${LINK} cursor-pointer`}>{l.label}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      {/* Bottom bar */}
      <div className="mt-20 flex flex-col gap-4 border-t border-[#e8e2d6]/15 pt-6 text-[12px] text-[#e8e2d6]/45 md:flex-row md:items-center md:justify-between md:pr-28">
        <p>© {new Date().getFullYear()} DevDrop Studio</p>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
          <a href="/terms" className="transition-colors hover:text-[#e8e2d6]">Terms of Service</a>
          <a href="/privacy" className="transition-colors hover:text-[#e8e2d6]">Privacy Policy</a>
          {time && <span className="tabular-nums">Local time {time}</span>}
        </div>
      </div>
    </footer>
  );
};

export default DevDropFooter;