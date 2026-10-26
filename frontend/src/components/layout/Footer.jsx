import React from 'react';
import { ArrowUpRight, ArrowUp, Sparkles, Heart, Flower2, Star, MousePointer2 } from 'lucide-react';

const LINKS = [
  { title: 'Explore', items: [{ label: 'Websites', href: '/template' }, { label: 'Free templates', href: '/template?filter=free' }, { label: 'Exclusive designs', href: '/template?filter=exclusive' }] },
  { title: 'Create', items: [{ label: 'AI Studio', href: '/ai-studio' }, { label: 'Deploy your project', href: '/deploy-own' }, { label: 'Workspace', href: '/workspace' }] },
  { title: 'DevDrop', items: [{ label: 'About us', href: '/about' }, { label: 'Documentation', href: '/docs' }, { label: 'Contact', href: '/contact' }] },
];

function Sticker({ children, className = '' }) {
  return <span aria-hidden="true" className={`pointer-events-none absolute z-10 inline-flex items-center justify-center border border-[#27251f]/15 bg-[#f0e7d8] text-[#24221d] shadow-[2px_3px_0_rgba(0,0,0,0.13)] ${className}`}>{children}</span>;
}

export default function DevDropFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-[#11110f] text-[#f0eee8]">
      <div className="mx-auto max-w-[1440px] px-5 pb-5 pt-9 sm:px-8 sm:pt-12 lg:px-14">
        <div className="relative grid gap-9 border-b border-white/10 pb-8 sm:grid-cols-[0.85fr_2fr] sm:gap-12 sm:pb-10">
          <div className="relative flex items-start">
            <a href="/" aria-label="DevDrop home" className="relative inline-flex items-baseline font-serif text-4xl italic tracking-tighter text-blue-50 transition-colors hover:text-white sm:text-5xl">
              devdrop<span className="not-italic text-[#d8c7a5]">.</span>
              <Sticker className="-right-5 -top-3 h-7 w-7 rotate-[13deg] rounded-[9px]"><Star size={15} fill="currentColor" strokeWidth={1.5}/></Sticker>
            </a>
            <Sticker className="left-1 top-[4.1rem] rotate-[-9deg] rounded-full px-2.5 py-1 text-[10px] font-medium sm:top-[4.7rem]">made with care <Heart size={10} className="ml-1" fill="currentColor"/></Sticker>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 sm:gap-8">
            {LINKS.map((group, index) => (
              <div key={group.title} className="relative">
                {index === 1 && <Sticker className="-right-1 -top-5 h-7 w-7 rotate-[12deg] rounded-full"><Flower2 size={16}/></Sticker>}
                {index === 2 && <Sticker className="-right-1 -top-5 h-7 w-7 rotate-[-10deg] rounded-lg"><Sparkles size={15}/></Sticker>}
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/45 sm:mb-4 sm:text-sm">{group.title}</h3>
                <ul className="space-y-2.5 sm:space-y-3">
                  {group.items.map((item) => <li key={item.label}><a href={item.href} className="group inline-flex items-center gap-1.5 text-[15px] text-white/75 transition-colors hover:text-[#e8d8b9] sm:text-base">{item.label}<ArrowUpRight size={13} className="opacity-0 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-80"/></a></li>)}
                </ul>
              </div>
            ))}
          </div>
          <Sticker className="bottom-3 right-[28%] hidden h-8 w-8 rotate-[8deg] rounded-[10px] lg:inline-flex"><MousePointer2 size={16}/></Sticker>
        </div>

        <div className="flex flex-col gap-3 pt-4 text-sm text-white/45 sm:flex-row sm:items-center sm:justify-between sm:pt-5">
          <p>© {new Date().getFullYear()} DevDrop Studio. Made for people who make things.</p>
          <div className="flex items-center gap-5"><a href="/terms" className="transition-colors hover:text-white/85">Terms</a><a href="/privacy" className="transition-colors hover:text-white/85">Privacy</a><button type="button" aria-label="Back to top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 transition-colors hover:border-white/50 hover:bg-white/[0.06] hover:text-white"><ArrowUp size={15}/></button></div>
        </div>
      </div>
    </footer>
  );
}
