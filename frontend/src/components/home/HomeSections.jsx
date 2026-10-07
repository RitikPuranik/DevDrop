import React, { useRef, useEffect, useLayoutEffect, useState } from 'react';
import {
  motion, AnimatePresence, animate, useScroll, useTransform, useSpring, useInView,
  useMotionValue, useMotionValueEvent, useMotionTemplate, useVelocity,
  useAnimationFrame, useReducedMotion,
} from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, ArrowLeft, ArrowRight, Check } from 'lucide-react';

/* ──────────────────────────────────────────────────────────────
   DESIGN TOKENS
   ink #050505 · ivory #e8e2d6 · brass #b89b6e
   Display: Cormorant Garamond · Body: Plus Jakarta Sans · Meta: mono
   ────────────────────────────────────────────────────────────── */
const EASE = [0.76, 0, 0.24, 1];
const EASE_OUT = [0.16, 1, 0.3, 1];

const ARTIFACTS = [
  { id: 'kinetic', name: 'Kinetic', img: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fm=webp&q=65&w=700' },
  { id: 'lunar', name: 'Lunar', img: 'https://images.unsplash.com/photo-1551650975-87deedd944c3?auto=format&fm=webp&q=65&w=700' },
  { id: 'veil', name: 'Veil', img: 'https://images.unsplash.com/photo-1545231027-637d2f6210f8?auto=format&fm=webp&q=65&w=700' },
  { id: 'apex', name: 'Apex', img: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fm=webp&q=65&w=700' },
  { id: 'nova', name: 'Nova', img: 'https://images.unsplash.com/photo-1497366412874-3415097a27e7?auto=format&fm=webp&q=65&w=700' },
  { id: 'onyx', name: 'Onyx', img: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fm=webp&q=65&w=700' },
  { id: 'ghost', name: 'Ghost', img: 'https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?auto=format&fm=webp&q=65&w=700' },
  { id: 'shadow', name: 'Shadow', img: 'https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fm=webp&q=65&w=700' },
];

const REVIEWS = [
  { quote: 'As I was making my first deploy today, I told myself I was going to gatekeep this as my little secret.', author: 'Elena Rostova', role: 'Design Director, Aether Lab' },
  { quote: 'I just wanted to take a moment to congratulate the team on the incredible AI Studio pipeline — it actually ships working code.', author: 'Marcus Vance', role: 'Technical Lead, Nexus Studio' },
  { quote: 'I recently used DevDrop to publish and sell a template. The auction flow and payout process were seamless.', author: 'Sora Takahashi', role: 'Creative Producer, Neo-Tokyo' },
  { quote: "Deploying used to be the part I dreaded. Now I connect Vercel, click once, and it's live under my own account.", author: 'Priya Nandan', role: 'Founder, Loopwork' },
];

const wrapNum = (min, max, v) => {
  const r = max - min;
  return ((((v - min) % r) + r) % r) + min;
};

/* ─── hooks ─── */
const useMedia = (query) => {
  const [match, setMatch] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e) => setMatch(e.matches);
    setMatch(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return match;
};

const useGo = () => {
  const navigate = useNavigate();
  return (path) => () => { window.scrollTo(0, 0); navigate(path); };
};

const useLoopTick = (max, ms, active) => {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setT((x) => (x + 1) % (max + 1)), ms);
    return () => clearInterval(id);
  }, [max, ms, active]);
  return t;
};

const useTypewriter = (phrases, active) => {
  const [txt, setTxt] = useState('');
  useEffect(() => {
    if (!active) return undefined;
    let p = 0; let c = 0; let del = false; let id;
    const step = () => {
      const full = phrases[p];
      if (!del) {
        c += 1; setTxt(full.slice(0, c));
        if (c >= full.length) { del = true; id = setTimeout(step, 1900); return; }
        id = setTimeout(step, 36);
      } else {
        c -= 2;
        if (c <= 0) { c = 0; del = false; p = (p + 1) % phrases.length; setTxt(''); id = setTimeout(step, 350); return; }
        setTxt(full.slice(0, c)); id = setTimeout(step, 14);
      }
    };
    id = setTimeout(step, 400);
    return () => clearTimeout(id);
  }, [phrases, active]);
  return txt;
};

/* ─── primitives ─── */
const Eyebrow = ({ n, children, className = '' }) => (
  <div className={`flex items-center gap-4 font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.32em] text-[#b89b6e] ${className}`}>
    <span>{n}</span>
    <motion.span
      initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }}
      transition={{ duration: 1.1, ease: EASE }} style={{ transformOrigin: 'left' }}
      className="h-px w-12 bg-[#b89b6e]/60"
    />
    <span>{children}</span>
  </div>
);

const Hairline = ({ className = '', delay = 0 }) => (
  <motion.div
    initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true, margin: '-8%' }}
    transition={{ duration: 1.6, ease: EASE, delay }} style={{ transformOrigin: 'left' }}
    className={`h-px w-full bg-gradient-to-r from-[#e8e2d6]/30 via-[#e8e2d6]/10 to-transparent ${className}`}
  />
);

/* Each line slides up out of a clipping mask. Items may be strings or {em}. */
const MaskLines = ({ lines, className = '', style, delay = 0, as: Tag = 'h2' }) => (
  <Tag className={className} style={style}>
    {lines.map((line, li) => (
      <span key={li} className="block overflow-hidden pb-[0.14em] -mb-[0.14em]">
        <motion.span
          className="block"
          initial={{ y: '112%', rotate: 2.5 }}
          whileInView={{ y: 0, rotate: 0 }}
          viewport={{ once: true, margin: '-12%' }}
          transition={{ duration: 1.25, ease: EASE_OUT, delay: delay + li * 0.11 }}
          style={{ transformOrigin: 'left bottom' }}
        >
          {line.map((part, pi) =>
            typeof part === 'string'
              ? <React.Fragment key={pi}>{part}</React.Fragment>
              : <em key={pi} className="italic text-[#b89b6e]">{part.em}</em>
          )}
        </motion.span>
      </span>
    ))}
  </Tag>
);

const Magnetic = ({ children, strength = 0.32, className = '' }) => {
  const ref = useRef(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 220, damping: 16, mass: 0.4 });
  const y = useSpring(my, { stiffness: 220, damping: 16, mass: 0.4 });
  const move = (e) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    mx.set((e.clientX - (r.left + r.width / 2)) * strength);
    my.set((e.clientY - (r.top + r.height / 2)) * strength);
  };
  const leave = () => { mx.set(0); my.set(0); };
  return (
    <motion.div ref={ref} onMouseMove={move} onMouseLeave={leave} style={{ x, y }} className={`inline-block ${className}`}>
      {children}
    </motion.div>
  );
};

const PillButton = ({ children, onClick, variant = 'solid' }) => {
  const solid = variant === 'solid';
  return (
    <Magnetic>
      <button
        onClick={onClick}
        className={`group relative overflow-hidden rounded-full px-8 py-4 text-[13px] font-semibold tracking-[0.04em] ${
          solid ? 'bg-[#e8e2d6] text-[#050505]' : 'border border-[#e8e2d6]/25 text-[#e8e2d6]'
        }`}
      >
        <span
          className={`absolute inset-0 translate-y-[101%] rounded-[50%_50%_0_0/100%_100%_0_0] transition-all duration-[650ms] ease-[cubic-bezier(.76,0,.24,1)] group-hover:translate-y-0 group-hover:rounded-none ${
            solid ? 'bg-[#b89b6e]' : 'bg-[#e8e2d6]'
          }`}
        />
        <span className={`relative flex items-center gap-3 transition-colors duration-500 ${solid ? '' : 'group-hover:text-[#050505]'}`}>
          {children}
          <ArrowUpRight size={16} className="transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1" />
        </span>
      </button>
    </Magnetic>
  );
};

const Counter = ({ value, decimals = 1, suffix = '' }) => {
  const [v, setV] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const c = animate(prev.current, value, { duration: 0.9, ease: EASE_OUT, onUpdate: setV });
    prev.current = value;
    return () => c.stop();
  }, [value]);
  return <>{v.toFixed(decimals)}{suffix}</>;
};

const StatCount = ({ to, suffix = '' }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!inView) return undefined;
    const c = animate(0, to, { duration: 2.4, ease: EASE_OUT, onUpdate: (l) => setV(Math.round(l)) });
    return () => c.stop();
  }, [inView, to]);
  return <span ref={ref}>{v}{suffix}</span>;
};

const Grain = () => (
  <div
    aria-hidden="true"
    className="pointer-events-none absolute inset-0 z-[60] opacity-[0.045]"
    style={{
      backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`,
    }}
  />
);

/* ═══════════════════════════════════════════════════════════════
   I · MANIFESTO — words ignite one by one as you scroll
   ═══════════════════════════════════════════════════════════════ */
const MANIFESTO =
  'DevDrop is a quiet house for people who *make*, *own* and *trade* websites. Every template is composed with care, every deployment lives in your own cloud, and every sale ends with the keys placed in your hands.';

const Word = ({ children, em, progress, range }) => {
  const opacity = useTransform(progress, range, [0.12, 1]);
  const y = useTransform(progress, range, [10, 0]);
  const blur = useTransform(progress, range, ['blur(4px)', 'blur(0px)']);
  return (
    <span className="inline-block mr-[0.26em]">
      <motion.span style={{ opacity, y, filter: blur }} className={`inline-block ${em ? 'italic text-[#b89b6e]' : ''}`}>
        {children}
      </motion.span>
    </span>
  );
};

const Manifesto = () => {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.82', 'end 0.55'] });
  const ringRotate = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const ringY = useTransform(scrollYProgress, [0, 1], [80, -120]);
  const words = MANIFESTO.split(' ');

  return (
    <section ref={ref} className="relative px-6 md:px-12 pt-32 pb-28 md:pt-48 md:pb-44 overflow-hidden">
      <motion.svg
        aria-hidden="true" viewBox="0 0 400 400" style={{ rotate: ringRotate, y: ringY }}
        className="pointer-events-none absolute -right-40 top-10 w-[560px] md:w-[760px] opacity-[0.16]"
      >
        {[190, 150, 110].map((r, i) => (
          <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="#b89b6e" strokeWidth="0.6" strokeDasharray={i === 1 ? '2 7' : undefined} />
        ))}
        {Array.from({ length: 24 }).map((_, i) => (
          <line key={i} x1="200" y1="6" x2="200" y2={i % 6 === 0 ? 22 : 13} stroke="#b89b6e" strokeWidth="0.8" transform={`rotate(${i * 15} 200 200)`} />
        ))}
      </motion.svg>

      <div className="relative mx-auto max-w-[1300px]">
        <Eyebrow n="§ 01">The House Principles</Eyebrow>
        <p
          className="font-display mt-10 md:mt-14 max-w-[1100px] leading-[1.14] text-[#e8e2d6]"
          style={{ fontSize: 'clamp(2.1rem, 5vw, 4.6rem)' }}
        >
          {words.map((raw, i) => {
            const em = raw.startsWith('*');
            const start = (i / words.length) * 0.82;
            return (
              <Word key={i} em={em} progress={scrollYProgress} range={[start, start + 0.16]}>
                {raw.replace(/\*/g, '')}
              </Word>
            );
          })}
        </p>
        <div className="mt-16 md:mt-24 flex items-center gap-6">
          <Hairline className="max-w-[260px]" />
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#e8e2d6]/35">Continue reading — scroll</span>
        </div>
      </div>
    </section>
  );
};

/* ═══════════════════════════════════════════════════════════════
   II · CHAPTERS — three stacked plates, each sliding over the last
   ═══════════════════════════════════════════════════════════════ */
const Plate = ({ caption, fig, children }) => (
  <motion.figure
    initial={{ opacity: 0, y: 50, clipPath: 'inset(10% 10% 10% 10% round 24px)' }}
    whileInView={{ opacity: 1, y: 0, clipPath: 'inset(0% 0% 0% 0% round 24px)' }}
    viewport={{ once: true, amount: 0.25 }}
    transition={{ duration: 1.4, ease: EASE_OUT }}
    className="relative w-full"
  >
    <div className="relative aspect-[5/4] md:aspect-[4/3] max-h-[62vh] w-full overflow-hidden rounded-[1.5rem] border border-[#e8e2d6]/15 bg-gradient-to-b from-[#0e0d0b] to-[#080808] shadow-[0_40px_120px_rgba(0,0,0,0.7)]">
      {['top-3 left-3 border-t border-l', 'top-3 right-3 border-t border-r', 'bottom-3 left-3 border-b border-l', 'bottom-3 right-3 border-b border-r'].map((c) => (
        <span key={c} className={`absolute h-3 w-3 border-[#b89b6e]/60 ${c}`} />
      ))}
      {children}
    </div>
    <figcaption className="mt-4 flex justify-between font-mono text-[10px] uppercase tracking-[0.28em] text-[#e8e2d6]/40">
      <span>{caption}</span><span>{fig}</span>
    </figcaption>
  </motion.figure>
);

/* Plate I — deployment route */
const DeployPlate = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { amount: 0.3 });
  const tick = useLoopTick(4, 1300, inView);
  const logs = ['Analysed Vite + React project', 'Configured runtime & build target', 'Pushed to your Vercel account', 'Live — your-project.vercel.app'];
  return (
    <Plate caption="Plate I — The Handoff" fig="Fig. 01">
      <div ref={ref} className="absolute inset-0 flex flex-col">
        <svg viewBox="0 0 600 260" className="w-full flex-1 min-h-0" aria-hidden="true">
          <defs>
            <linearGradient id="routeGrad" x1="0" x2="1">
              <stop offset="0" stopColor="#e8e2d6" stopOpacity="0.2" />
              <stop offset="1" stopColor="#b89b6e" />
            </linearGradient>
          </defs>
          {[60, 110, 160, 210].map((y) => (
            <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="#e8e2d6" strokeOpacity="0.04" />
          ))}
          <motion.path
            id="deploy-route" d="M60 190 C 150 190, 170 80, 300 100 S 450 180, 540 100"
            fill="none" stroke="url(#routeGrad)" strokeWidth="1.4"
            initial={{ pathLength: 0 }} animate={inView ? { pathLength: 1 } : {}}
            transition={{ duration: 2.2, ease: EASE, delay: 0.3 }}
          />
          <circle r="3.5" fill="#e8e2d6">
            <animateMotion dur="4.2s" repeatCount="indefinite" begin="0.8s"><mpath href="#deploy-route" /></animateMotion>
          </circle>
          {[[60, 190, 'REPOSITORY'], [300, 100, 'ROUTER'], [540, 100, 'YOUR CLOUD']].map(([cx, cy, label], i) => (
            <g key={label}>
              <circle cx={cx} cy={cy} r="14" fill="#0b0a09" stroke="#e8e2d6" strokeOpacity="0.25" />
              <circle cx={cx} cy={cy} r="4.5" fill="#b89b6e" />
              {i === 2 && (
                <motion.circle
                  cx={cx} cy={cy} fill="none" stroke="#b89b6e"
                  animate={{ r: [14, 38], opacity: [0.7, 0] }}
                  transition={{ repeat: Infinity, duration: 2.6, ease: 'easeOut' }}
                />
              )}
              <text x={cx} y={cy + 36} textAnchor="middle" fontSize="9.5" letterSpacing="2.5" fill="#e8e2d6" fillOpacity="0.5" className="font-mono">{label}</text>
            </g>
          ))}
        </svg>
        <div className="border-t border-[#e8e2d6]/10 bg-black/30 px-5 py-4 font-mono text-[10.5px] sm:text-[11px] space-y-1.5">
          {logs.map((l, i) => (
            <motion.div
              key={l} animate={{ opacity: i < tick || tick === 0 && i === 0 ? 1 : 0.18, x: i < tick ? 0 : -6 }}
              transition={{ duration: 0.5 }} className="flex items-center gap-3 text-[#e8e2d6]/80"
            >
              <Check size={11} className={i < tick ? 'text-[#b89b6e]' : 'text-transparent'} /> {l}
            </motion.div>
          ))}
        </div>
      </div>
    </Plate>
  );
};

/* Plate II — AI studio */
const PROMPTS = [
  'A portfolio for a ceramic artist — warm, editorial, minimal.',
  'A SaaS landing page with pricing and a changelog.',
  'A restaurant site with menu, booking and gallery.',
];
const AIPlate = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { amount: 0.3 });
  const tick = useLoopTick(4, 1500, inView);
  const typed = useTypewriter(PROMPTS, inView);
  const agents = ['Design agent', 'Architecture agent', 'Code agent'];
  return (
    <Plate caption="Plate II — The Studio" fig="Fig. 02">
      <div ref={ref} className="absolute inset-0 grid sm:grid-cols-5 gap-5 p-5 sm:p-7">
        <div className="sm:col-span-3 flex flex-col gap-4 min-h-0">
          <div className="rounded-xl border border-[#e8e2d6]/12 bg-white/[0.02] p-4">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.3em] text-[#b89b6e] mb-2">Prompt</div>
            <p className="font-display text-xl sm:text-2xl leading-snug text-[#e8e2d6] min-h-[3.4em]">
              {typed}<span className="ml-0.5 inline-block w-[2px] h-[1em] translate-y-[3px] bg-[#b89b6e] animate-pulse" />
            </p>
          </div>
          <div className="space-y-3">
            {agents.map((a, j) => {
              const pct = tick > j ? 100 : tick === j ? 55 : 0;
              const status = tick > j ? 'Done' : tick === j ? 'Working' : 'Queued';
              return (
                <div key={a}>
                  <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-[#e8e2d6]/55 mb-1.5">
                    <span>{a}</span><span className={tick > j ? 'text-[#b89b6e]' : ''}>{status}</span>
                  </div>
                  <div className="h-px w-full bg-[#e8e2d6]/12">
                    <motion.div animate={{ width: `${pct}%` }} transition={{ duration: 1.1, ease: EASE_OUT }} className="h-px bg-[#b89b6e]" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="hidden sm:flex sm:col-span-2 flex-col rounded-xl border border-[#e8e2d6]/12 bg-[#0a0a0a] p-3 gap-2">
          <div className="flex gap-1.5">{[0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 rounded-full bg-[#e8e2d6]/20" />)}</div>
          {[['h-12', 0], ['h-3 w-2/3', 1], ['h-3 w-1/2', 1], ['h-16', 2], ['h-3 w-3/4', 3]].map(([cls, at], k) => (
            <motion.div
              key={k} animate={{ opacity: tick >= at + 1 ? 1 : 0.07, scaleX: tick >= at + 1 ? 1 : 0.6 }}
              transition={{ duration: 0.8, ease: EASE_OUT }} style={{ transformOrigin: 'left' }}
              className={`${cls} rounded-md ${k === 0 || k === 3 ? 'bg-[#b89b6e]/25' : 'bg-[#e8e2d6]/15'}`}
            />
          ))}
        </div>
      </div>
    </Plate>
  );
};

/* Plate III — auction lot */
const BIDS = [1.2, 1.6, 2.0, 2.4];
const MarketPlate = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { amount: 0.3 });
  const tick = useLoopTick(4, 1500, inView);
  const bid = BIDS[Math.min(tick, 3)];
  const sold = tick === 4;
  return (
    <Plate caption="Plate III — The Auction" fig="Fig. 03">
      <div ref={ref} className="absolute inset-0 grid sm:grid-cols-2">
        <div className="relative overflow-hidden">
          <motion.img
            src={ARTIFACTS[2].img} alt="Featured template Veil" loading="lazy"
            animate={{ scale: [1.05, 1.16] }} transition={{ duration: 14, repeat: Infinity, repeatType: 'reverse', ease: 'linear' }}
            className="h-full w-full object-cover brightness-[0.7]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
          <div className="absolute bottom-4 left-4 font-mono text-[10px] uppercase tracking-[0.3em] text-[#e8e2d6]/80">Lot 07 · Veil</div>
        </div>
        <div className="relative flex flex-col justify-between p-5 sm:p-7">
          <div>
            <div className="font-mono text-[9.5px] uppercase tracking-[0.3em] text-[#b89b6e]">Current bid</div>
            <div className="font-display mt-1 text-5xl sm:text-6xl text-[#e8e2d6] tabular-nums">
              <Counter value={bid} /> <span className="text-xl italic text-[#e8e2d6]/50">ETH</span>
            </div>
          </div>
          <div className="space-y-2 font-mono text-[10.5px] text-[#e8e2d6]/60">
            <AnimatePresence initial={false}>
              {BIDS.slice(0, Math.min(tick + 1, 4)).map((b, i) => ({ b, i })).reverse().slice(0, 3).map(({ b, i }) => (
                <motion.div
                  key={`${b}-${i}`} layout initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1 - (Math.min(tick, 3) - i) * 0.3, y: 0 }}
                  exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: EASE_OUT }}
                  className="flex justify-between border-b border-[#e8e2d6]/10 pb-1.5"
                >
                  <span>Bidder 0x{(i * 7919 + 4172).toString(16).slice(0, 4)}</span><span>{b.toFixed(1)} ETH</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <motion.div
            animate={{ opacity: sold ? 1 : 0, y: sold ? 0 : 8 }} transition={{ duration: 0.6, ease: EASE_OUT }}
            className="flex items-center gap-2 rounded-full border border-[#b89b6e]/50 bg-[#b89b6e]/10 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#b89b6e] self-start"
          >
            <Check size={12} /> Sold — repository transferred
          </motion.div>
        </div>
      </div>
    </Plate>
  );
};

const CHAPTERS = [
  {
    numeral: 'I', eyebrow: 'Deployment', Visual: DeployPlate, to: '/deploy-own', cta: 'Deploy your project',
    title: [['Deploy to a cloud'], ['you ', { em: 'completely own.' }]],
    desc: 'Connect Vercel or Render once. DevDrop reads your codebase, configures the runtime and ships straight to production.',
    steps: [
      { t: 'Connect your provider', d: 'Link your own Vercel workspace or Render API keys, securely.' },
      { t: 'Intelligent analysis', d: 'React, Next.js, Express or Vite — mapped to the right target.' },
      { t: 'Live, and entirely yours', d: 'Every build, rollback and domain stays in your control.' },
    ],
  },
  {
    numeral: 'II', eyebrow: 'The Studio', Visual: AIPlate, to: '/ai-studio', cta: 'Open AI Studio',
    title: [['Describe the vision.'], [{ em: 'Receive the code.' }]],
    desc: 'A multi-agent framework designs the interface, shapes the architecture and tests every line before it reaches you.',
    steps: [
      { t: 'Write your concept', d: 'A rough outline, a wireframe idea or a full specification.' },
      { t: 'Agents divide the work', d: 'Layout, component architecture and code — each by a specialist.' },
      { t: 'Export, ready to ship', d: 'Clean React + Vite repositories, straight to GitHub or deploy.' },
    ],
  },
  {
    numeral: 'III', eyebrow: 'The Marketplace', Visual: MarketPlate, to: '/template', cta: 'Browse the marketplace',
    title: [['Buy, sell & auction'], [{ em: 'verified templates.' }]],
    desc: 'Publish complete applications and earn through fixed-price sales or live bidding — with instant, verifiable transfer.',
    steps: [
      { t: 'List full source codebases', d: 'Fixed prices, royalties, or timed auctions for exclusive designs.' },
      { t: 'Seamless checkout', d: 'Instant payment and total transparency for creator and buyer.' },
      { t: 'Direct GitHub handoff', d: 'On purchase, the repository lands in the buyer’s own account.' },
    ],
  },
];

const Chapter = ({ data, index, total, progress, pinned }) => {
  const go = useGo();
  const isLast = index === total - 1;
  const start = index / (total - 1);
  const end = (index + 1) / (total - 1);
  const scale = useTransform(progress, [start, end], [1, 0.93]);
  const dim = useTransform(progress, [start, end], [0, 0.7]);
  const { Visual } = data;
  const glow = ['18% 20%', '82% 22%', '50% 85%'][index];

  return (
    <div className={pinned ? 'sticky top-0 h-screen' : 'relative'} style={{ zIndex: index + 1 }}>
      <motion.div
        style={pinned && !isLast ? { scale, transformOrigin: '50% 0%' } : undefined}
        className="relative h-full overflow-hidden border-t border-[#e8e2d6]/12 bg-[#070707] md:rounded-t-[2.75rem]"
      >
        <div
          aria-hidden="true" className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(60% 55% at ${glow}, rgba(184,155,110,0.10), transparent 70%)` }}
        />
        <span
          aria-hidden="true"
          className="font-display pointer-events-none absolute right-4 md:right-10 -top-4 md:top-4 select-none italic leading-none text-transparent"
          style={{ fontSize: 'clamp(9rem, 20vw, 19rem)', WebkitTextStroke: '1px rgba(184,155,110,0.22)' }}
        >
          {data.numeral}
        </span>

        <div className="relative mx-auto grid h-full max-w-[1400px] grid-cols-1 items-center gap-10 px-6 py-24 md:px-12 lg:grid-cols-12 lg:gap-14 lg:py-0 lg:pt-16">
          <div className="lg:col-span-5">
            <Eyebrow n={`Chapter ${data.numeral}`}>{data.eyebrow}</Eyebrow>
            <MaskLines
              lines={data.title} delay={0.1}
              className="font-display mt-6 leading-[1.02] text-[#e8e2d6]"
              style={{ fontSize: 'clamp(2.6rem, 4.6vw, 4.6rem)' }}
            />
            <motion.p
              initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ duration: 1, delay: 0.35, ease: EASE_OUT }}
              className="mt-5 max-w-md text-[14px] leading-relaxed text-[#e8e2d6]/55"
            >
              {data.desc}
            </motion.p>
            <ol className="mt-7 border-t border-[#e8e2d6]/12">
              {data.steps.map((s, i) => (
                <motion.li
                  key={s.t}
                  initial={{ opacity: 0, x: -18 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
                  transition={{ duration: 0.8, delay: 0.45 + i * 0.1, ease: EASE_OUT }}
                  className="group flex gap-5 border-b border-[#e8e2d6]/12 py-3.5"
                >
                  <span className="pt-1 font-mono text-[10.5px] text-[#b89b6e]">0{i + 1}</span>
                  <div className="transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] group-hover:translate-x-2">
                    <h4 className="font-display text-[1.35rem] leading-tight text-[#e8e2d6]">{s.t}</h4>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#e8e2d6]/45">{s.d}</p>
                  </div>
                </motion.li>
              ))}
            </ol>
            <div className="mt-8"><PillButton onClick={go(data.to)}>{data.cta}</PillButton></div>
          </div>
          <div className="lg:col-span-7"><Visual /></div>
        </div>

        {pinned && !isLast && <motion.div style={{ opacity: dim }} className="pointer-events-none absolute inset-0 z-20 bg-black" />}
      </motion.div>
    </div>
  );
};

const Chapters = () => {
  const ref = useRef(null);
  const pinned = useMedia('(min-width: 1024px) and (min-height: 720px)');
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  return (
    <section ref={ref} className="relative">
      {CHAPTERS.map((c, i) => (
        <Chapter key={c.numeral} data={c} index={i} total={CHAPTERS.length} progress={scrollYProgress} pinned={pinned} />
      ))}
    </section>
  );
};

/* ═══════════════════════════════════════════════════════════════
   III · MARQUEE — scroll-velocity driven ribbon
   ═══════════════════════════════════════════════════════════════ */
const MarqueeRow = ({ text, base, outline = false }) => {
  const reduce = useReducedMotion();
  const baseX = useMotionValue(0);
  const { scrollY } = useScroll();
  const velocity = useVelocity(scrollY);
  const smooth = useSpring(velocity, { damping: 50, stiffness: 400 });
  const factor = useTransform(smooth, [0, 1000], [0, 4], { clamp: false });
  const dir = useRef(base < 0 ? -1 : 1);
  const x = useTransform(baseX, (v) => `${wrapNum(-25, 0, v)}%`);

  useAnimationFrame((_, delta) => {
    if (reduce) return;
    const f = factor.get();
    let move = dir.current * Math.abs(base) * (delta / 1000);
    if (f < 0) dir.current = -1; else if (f > 0) dir.current = base < 0 ? -1 : 1;
    move += dir.current * move * Math.abs(f);
    baseX.set(baseX.get() + move);
  });

  const unit = (
    <span className="flex shrink-0 items-center pr-[3vw]">
      {text.map((w, i) => (
        <React.Fragment key={w}>
          <span>{w}</span>
          <span className="mx-[3vw] text-[#b89b6e] not-italic" style={{ fontSize: '0.4em' }}>✦</span>
          {i === text.length - 1 && null}
        </React.Fragment>
      ))}
    </span>
  );

  return (
    <div className="overflow-hidden whitespace-nowrap">
      <motion.div
        style={{ x, fontSize: 'clamp(3.5rem, 10vw, 9rem)', ...(outline ? { WebkitTextStroke: '1px rgba(232,226,214,0.4)', color: 'transparent' } : {}) }}
        className={`font-display flex w-max leading-[1.05] ${outline ? '' : 'italic text-[#e8e2d6]'}`}
      >
        {unit}{unit}{unit}{unit}
      </motion.div>
    </div>
  );
};

const Marquee = () => (
  <section className="relative overflow-hidden border-y border-[#e8e2d6]/10 bg-[#050505] py-14 md:py-20" aria-label="Deploy, compose, auction, transfer">
    <MarqueeRow text={['Deploy', 'Compose', 'Auction', 'Transfer']} base={-1.6} />
    <MarqueeRow text={['Own', 'Ship', 'Collect', 'Sell']} base={1.6} outline />
  </section>
);

/* ═══════════════════════════════════════════════════════════════
   IV · THE COLLECTION — pinned horizontal gallery with parallax
   ═══════════════════════════════════════════════════════════════ */
const Collection = () => {
  const go = useGo();
  const desktop = useMedia('(min-width: 900px)');
  const sectionRef = useRef(null);
  const trackRef = useRef(null);
  const [dist, setDist] = useState(0);
  const [active, setActive] = useState(0);
  const [hover, setHover] = useState(false);
  const n = ARTIFACTS.length;

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] });
  const smooth = useSpring(scrollYProgress, { stiffness: 90, damping: 28, mass: 0.4 });
  const x = useTransform(smooth, [0, 1], [0, -dist]);
  const imgX = useTransform(smooth, [0, 1], [48, -48]);
  useMotionValueEvent(scrollYProgress, 'change', (v) => setActive(Math.min(n - 1, Math.max(0, Math.round(v * (n - 1))))));

  useLayoutEffect(() => {
    if (!desktop) return undefined;
    const measure = () => {
      const t = trackRef.current;
      if (t) setDist(Math.max(0, t.scrollWidth - window.innerWidth));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (trackRef.current) ro.observe(trackRef.current);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [desktop]);

  // magnetic "View" cursor
  const cx = useSpring(useMotionValue(0), { stiffness: 260, damping: 26 });
  const cy = useSpring(useMotionValue(0), { stiffness: 260, damping: 26 });
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    cx.set(e.clientX - r.left); cy.set(e.clientY - r.top);
  };

  const Header = (
    <div className="flex w-[84vw] max-w-[560px] shrink-0 flex-col justify-center pr-10 md:pr-20">
      <Eyebrow n="§ 04">The Collection</Eyebrow>
      <MaskLines
        lines={[['Templates,'], ['composed ', { em: 'to be kept.' }]]}
        className="font-display mt-6 leading-[1.02] text-[#e8e2d6]" style={{ fontSize: 'clamp(2.8rem, 5vw, 5rem)' }}
      />
      <p className="mt-6 max-w-sm text-[14px] leading-relaxed text-[#e8e2d6]/50">
        Each piece is reviewed for build quality, documented in full and handed over entirely — yours once collected.
      </p>
      <div className="mt-8"><PillButton variant="outline" onClick={go('/template')}>Enter the archive</PillButton></div>
    </div>
  );

  const Card = ({ item, i }) => (
    <article
      onClick={go('/template')}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      className={`group relative shrink-0 cursor-pointer ${desktop ? 'w-[30vw] max-w-[460px]' : 'w-[72vw] snap-start'} ${desktop && i % 2 ? 'mt-24' : ''}`}
    >
      <div className={`relative overflow-hidden rounded-[1.25rem] border border-[#e8e2d6]/12 ${desktop ? 'h-[56vh]' : 'h-[52vh]'}`}>
        <div className="h-full w-full transition-transform duration-[1400ms] ease-[cubic-bezier(.16,1,.3,1)] group-hover:scale-[1.06]">
          <motion.img
            src={item.img} alt={`${item.name} template`} loading="lazy" draggable="false"
            style={desktop ? { x: imgX, scale: 1.22 } : undefined}
            className="h-full w-full object-cover brightness-[0.78] grayscale-[0.35] transition-all duration-700 group-hover:brightness-100 group-hover:grayscale-0"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <span className="absolute left-4 top-4 font-mono text-[10px] tracking-[0.3em] text-[#e8e2d6]/70">0{i + 1}</span>
      </div>
      <div className="mt-4 flex items-baseline justify-between">
        <h3 className="font-display text-3xl italic text-[#e8e2d6]">{item.name}</h3>
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-[#e8e2d6]/45 transition-colors group-hover:text-[#b89b6e]">
          View <ArrowRight size={12} className="transition-transform duration-500 group-hover:translate-x-1.5" />
        </span>
      </div>
    </article>
  );

  if (!desktop) {
    return (
      <section className="relative py-24">
        <div className="px-6">{Header}</div>
        <div className="mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto px-6 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {ARTIFACTS.map((a, i) => <Card key={a.id} item={a} i={i} />)}
        </div>
      </section>
    );
  }

  return (
    <section ref={sectionRef} className="relative" style={{ height: `calc(100vh + ${dist}px)` }}>
      <div onMouseMove={onMove} className="sticky top-0 flex h-screen items-center overflow-hidden">
        <motion.div ref={trackRef} style={{ x }} className="flex items-start gap-[3vw] pl-[8vw] pr-[12vw] will-change-transform">
          {Header}
          {ARTIFACTS.map((a, i) => <Card key={a.id} item={a} i={i} />)}
          <div className="flex h-[56vh] w-[26vw] shrink-0 items-center justify-center">
            <Magnetic strength={0.2}>
              <button
                onClick={go('/template')}
                className="group relative flex h-48 w-48 items-center justify-center rounded-full border border-[#e8e2d6]/25 transition-colors duration-500 hover:border-[#b89b6e]"
              >
                <span className="absolute inset-0 scale-0 rounded-full bg-[#e8e2d6] transition-transform duration-[700ms] ease-[cubic-bezier(.76,0,.24,1)] group-hover:scale-100" />
                <span className="font-display relative text-2xl italic text-[#e8e2d6] transition-colors duration-500 group-hover:text-[#050505]">
                  View all <ArrowUpRight className="ml-1 inline" size={18} />
                </span>
              </button>
            </Magnetic>
          </div>
        </motion.div>

        {/* "View" cursor */}
        <motion.div
          aria-hidden="true" style={{ x: cx, y: cy }}
          className="pointer-events-none absolute left-0 top-0 z-30 -ml-10 -mt-10"
        >
          <motion.div
            animate={{ scale: hover ? 1 : 0, opacity: hover ? 1 : 0 }} transition={{ duration: 0.4, ease: EASE_OUT }}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-[#e8e2d6] font-mono text-[10px] uppercase tracking-[0.2em] text-[#050505]"
          >
            View
          </motion.div>
        </motion.div>

        {/* counter + progress */}
        <div className="absolute bottom-8 left-[8vw] right-[8vw] flex items-center gap-6">
          <div className="relative h-5 w-14 overflow-hidden font-mono text-[11px] tracking-[0.25em] text-[#e8e2d6]/70">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={active} initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '-100%' }}
                transition={{ duration: 0.5, ease: EASE_OUT }} className="absolute inset-0"
              >
                {String(active + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}
              </motion.span>
            </AnimatePresence>
          </div>
          <div className="relative h-px flex-1 bg-[#e8e2d6]/12">
            <motion.div style={{ scaleX: smooth, transformOrigin: 'left' }} className="absolute inset-0 bg-[#b89b6e]" />
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#e8e2d6]/35">Scroll</span>
        </div>
      </div>
    </section>
  );
};

/* ═══════════════════════════════════════════════════════════════
   V · ASSURANCES — ivory sweep rows + count-up figures
   ═══════════════════════════════════════════════════════════════ */
const ASSURANCES = [
  { n: 'I', t: 'Best quality standard', d: 'Every template is reviewed for build quality before it goes live.' },
  { n: 'II', t: 'Full package ownership', d: 'Full documentation and authorization on every website — 100% yours once purchased.' },
  { n: 'III', t: 'A curated ecosystem', d: 'Verified access and a smoother handoff after every purchase.' },
];

const Assurances = () => (
  <section className="relative px-6 py-28 md:px-12 md:py-40">
    <div className="mx-auto max-w-[1300px]">
      <Eyebrow n="§ 05">Our Assurances</Eyebrow>
      <MaskLines
        lines={[['Three promises,'], ['kept ', { em: 'without exception.' }]]}
        className="font-display mt-6 mb-14 leading-[1.02] text-[#e8e2d6] md:mb-20" style={{ fontSize: 'clamp(2.6rem, 5.4vw, 5.2rem)' }}
      />

      <div>
        {ASSURANCES.map((a, i) => (
          <motion.div
            key={a.n}
            initial={{ opacity: 0, y: 36 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-8%' }}
            transition={{ duration: 1, delay: i * 0.08, ease: EASE_OUT }}
            className="group relative overflow-hidden border-t border-[#e8e2d6]/15 last:border-b"
          >
            <span className="absolute inset-0 origin-left scale-x-0 bg-[#e8e2d6] transition-transform duration-[800ms] ease-[cubic-bezier(.76,0,.24,1)] group-hover:scale-x-100" />
            <div className="relative grid grid-cols-12 items-center gap-4 py-8 transition-colors duration-500 group-hover:text-[#050505] md:py-11">
              <span className="font-display col-span-2 text-3xl italic text-[#b89b6e] transition-colors duration-500 group-hover:text-[#050505]/60 md:col-span-1 md:text-4xl">{a.n}</span>
              <h3 className="font-display col-span-10 text-3xl leading-tight text-[#e8e2d6] transition-all duration-700 group-hover:translate-x-3 group-hover:text-[#050505] md:col-span-5 md:text-5xl">{a.t}</h3>
              <p className="col-span-10 col-start-3 text-[13.5px] leading-relaxed text-[#e8e2d6]/50 transition-colors duration-500 group-hover:text-[#050505]/70 md:col-span-5 md:col-start-auto">{a.d}</p>
              <ArrowUpRight className="col-span-12 hidden justify-self-end text-[#e8e2d6]/40 transition-all duration-500 group-hover:rotate-45 group-hover:text-[#050505] md:col-span-1 md:block" size={28} />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 md:mt-28">
        {[
          { to: 500, suffix: '+', label: 'Projects delivered' },
          { to: 98, suffix: '%', label: 'Satisfaction' },
          { text: '24/7', label: 'Support' },
        ].map((s, i) => (
          <div key={s.label} className={`py-8 text-center sm:py-4 ${i ? 'border-t border-[#e8e2d6]/12 sm:border-l sm:border-t-0' : ''}`}>
            <div className="font-display text-7xl leading-none text-[#e8e2d6] tabular-nums md:text-[8rem]">
              {s.text ? s.text : <StatCount to={s.to} suffix={s.suffix} />}
            </div>
            <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.32em] text-[#b89b6e]">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

/* ═══════════════════════════════════════════════════════════════
   VI · TESTIMONIALS — one voice at a time, word by word
   ═══════════════════════════════════════════════════════════════ */
const INTERVAL = 8;
const Testimonials = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { amount: 0.35 });
  const [i, setI] = useState(0);
  const r = REVIEWS[i];
  const step = (d) => setI((x) => (x + d + REVIEWS.length) % REVIEWS.length);

  useEffect(() => {
    if (!inView) return undefined;
    const id = setTimeout(() => step(1), INTERVAL * 1000);
    return () => clearTimeout(id);
  }, [i, inView]);

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.022 } }, exit: { opacity: 0, y: -16, transition: { duration: 0.45 } } };
  const word = { hidden: { y: '110%' }, show: { y: 0, transition: { duration: 0.9, ease: EASE_OUT } } };

  return (
    <section ref={ref} className="relative overflow-hidden border-t border-[#e8e2d6]/10 px-6 py-28 md:px-12 md:py-40">
      <span
        aria-hidden="true" className="font-display pointer-events-none absolute -left-4 top-6 select-none italic leading-none text-[#b89b6e]/[0.09] md:left-10"
        style={{ fontSize: 'clamp(14rem, 34vw, 32rem)' }}
      >“</span>

      <div className="relative mx-auto max-w-[1100px]">
        <Eyebrow n="§ 06">Voices</Eyebrow>
        <div className="mt-12 min-h-[19rem] md:min-h-[20rem]">
          <AnimatePresence mode="wait">
            <motion.div key={i} initial="hidden" animate="show" exit="exit" variants={container}>
              <blockquote
                className="font-display leading-[1.2] text-[#e8e2d6]" style={{ fontSize: 'clamp(1.7rem, 3.5vw, 3.3rem)' }}
              >
                {r.quote.split(' ').map((w, k) => (
                  <span key={k} className="inline-block overflow-hidden align-bottom pb-[0.1em] mr-[0.26em]">
                    <motion.span variants={word} className="inline-block">{w}</motion.span>
                  </span>
                ))}
              </blockquote>
              <motion.figcaption
                variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.8, delay: 0.7 } } }}
                className="mt-10 flex items-center gap-5"
              >
                <span className="h-px w-12 bg-[#b89b6e]" />
                <div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-[#e8e2d6]">{r.author}</div>
                  <div className="mt-1 text-[12px] text-[#e8e2d6]/45">{r.role}</div>
                </div>
              </motion.figcaption>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-14 flex items-center gap-6">
          <div className="flex gap-3">
            {[[-1, ArrowLeft, 'Previous'], [1, ArrowRight, 'Next']].map(([d, Icon, label]) => (
              <button
                key={label} onClick={() => step(d)} aria-label={label}
                className="group relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-[#e8e2d6]/20 text-[#e8e2d6] transition-colors duration-500 hover:text-[#050505]"
              >
                <span className="absolute inset-0 scale-0 rounded-full bg-[#e8e2d6] transition-transform duration-500 ease-[cubic-bezier(.76,0,.24,1)] group-hover:scale-100" />
                <Icon size={16} className="relative" />
              </button>
            ))}
          </div>
          <div className="relative h-px flex-1 bg-[#e8e2d6]/12">
            <motion.div
              key={`${i}-${inView}`} initial={{ scaleX: 0 }} animate={{ scaleX: inView ? 1 : 0 }}
              transition={{ duration: INTERVAL, ease: 'linear' }} style={{ transformOrigin: 'left' }}
              className="absolute inset-0 bg-[#b89b6e]"
            />
          </div>
          <span className="font-mono text-[11px] tracking-[0.25em] text-[#e8e2d6]/55">
            {String(i + 1).padStart(2, '0')} / {String(REVIEWS.length).padStart(2, '0')}
          </span>
        </div>
      </div>
    </section>
  );
};

/* ═══════════════════════════════════════════════════════════════
   VII · FINALE — pointer-lit stage with a rotating seal
   ═══════════════════════════════════════════════════════════════ */
const Finale = () => {
  const go = useGo();
  const mx = useMotionValue(50);
  const my = useMotionValue(40);
  const sx = useSpring(mx, { stiffness: 60, damping: 20 });
  const sy = useSpring(my, { stiffness: 60, damping: 20 });
  const bg = useMotionTemplate`radial-gradient(520px circle at ${sx}% ${sy}%, rgba(184,155,110,0.16), transparent 65%)`;
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set(((e.clientX - r.left) / r.width) * 100);
    my.set(((e.clientY - r.top) / r.height) * 100);
  };

  return (
    <section onMouseMove={onMove} className="relative overflow-hidden border-t border-[#e8e2d6]/10 px-6 py-32 text-center md:px-12 md:py-48">
      <motion.div aria-hidden="true" style={{ background: bg }} className="pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-[1100px]">
        <div className="flex justify-center"><Eyebrow n="§ 07">Begin</Eyebrow></div>
        <MaskLines
          lines={[['Build it, buy it,'], ['or deploy it.'], [{ em: 'Ship today.' }]]}
          className="font-display mt-8 leading-[0.98] text-[#e8e2d6]" style={{ fontSize: 'clamp(3rem, 8.4vw, 8rem)' }}
        />

        <div className="mt-14 flex justify-center">
          <Magnetic strength={0.25}>
            <button onClick={go('/ai-studio')} aria-label="Open AI Studio" className="group relative h-44 w-44 md:h-56 md:w-56">
              <motion.svg
                viewBox="0 0 200 200" className="absolute inset-0 h-full w-full"
                animate={{ rotate: 360 }} transition={{ duration: 24, ease: 'linear', repeat: Infinity }}
              >
                <defs><path id="seal-ring" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" /></defs>
                <text fontSize="12.5" fill="#e8e2d6" className="font-mono uppercase" letterSpacing="3">
                  <textPath href="#seal-ring" textLength="486" lengthAdjust="spacing">Deploy • Compose • Auction • Transfer •</textPath>
                </text>
              </motion.svg>
              <span className="absolute inset-[22%] flex items-center justify-center rounded-full bg-[#e8e2d6] text-[#050505] transition-all duration-700 ease-[cubic-bezier(.16,1,.3,1)] group-hover:inset-[14%] group-hover:bg-[#b89b6e]">
                <ArrowUpRight size={34} className="transition-transform duration-500 group-hover:rotate-45" />
              </span>
            </button>
          </Magnetic>
        </div>

        <p className="mt-10 text-[13px] text-[#e8e2d6]/45">Get started instantly — no long setup required.</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 font-mono text-[11px] uppercase tracking-[0.25em]">
          {[['Deploy a project', '/deploy-own'], ['Try AI Studio', '/ai-studio'], ['Browse marketplace', '/template']].map(([l, to]) => (
            <button key={l} onClick={go(to)} className="group relative pb-1 text-[#e8e2d6]/70 transition-colors hover:text-[#e8e2d6]">
              {l}
              <span className="absolute bottom-0 left-0 h-px w-full origin-right scale-x-0 bg-[#b89b6e] transition-transform duration-500 ease-[cubic-bezier(.76,0,.24,1)] group-hover:origin-left group-hover:scale-x-100" />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ─── composition ─── */
const HomeSections = () => (
  <div className="relative bg-[#050505] font-napkin text-[#e8e2d6]">
    <Grain />
    <Manifesto />
    <Chapters />
    <Marquee />
    <Collection />
    <Assurances />
    <Testimonials />
    <Finale />
  </div>
);

export default HomeSections;
