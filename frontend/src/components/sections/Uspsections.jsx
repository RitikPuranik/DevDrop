import React, { useRef, useEffect, useState } from 'react';
import {
  motion,
  AnimatePresence,
  animate,
  useScroll,
  useTransform,
  useInView,
} from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  GitBranch,
  Check,
  Sparkles,
  Rocket,
  ShoppingBag,
  Gavel,
  CheckCircle,
} from 'lucide-react';

const EASE_OUT = [0.16, 1, 0.3, 1];
const INK = '#1a1612';
const BROWN = '#8b7355';
const ACCENT = '#d2b48c';

const IMG = {
  hero: 'https://images.unsplash.com/photo-1545231027-637d2f6210f8?auto=format&fm=webp&q=70&w=900',
  a: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fm=webp&q=65&w=400',
  b: 'https://images.unsplash.com/photo-1551650975-87deedd944c3?auto=format&fm=webp&q=65&w=400',
  c: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fm=webp&q=65&w=400',
};

const useLoopTick = (max, ms, active) => {
  const [t, setT] = useState(0);

  useEffect(() => {
    if (!active) return undefined;

    const id = setInterval(() => {
      setT((x) => (x + 1) % (max + 1));
    }, ms);

    return () => clearInterval(id);
  }, [max, ms, active]);

  return t;
};

const Scribble = ({ color = BROWN }) => (
  <svg
    viewBox="0 0 300 18"
    preserveAspectRatio="none"
    className="absolute -bottom-2 left-0 h-3 w-full"
    aria-hidden="true"
  >
    <motion.path
      d="M3 12 C 50 3, 90 17, 140 8 S 235 4, 297 11"
      fill="none"
      stroke={color}
      strokeWidth="4"
      strokeLinecap="round"
      initial={{ pathLength: 0 }}
      whileInView={{ pathLength: 1 }}
      viewport={{ once: true }}
      transition={{
        duration: 1.1,
        delay: 0.5,
        ease: 'easeInOut',
      }}
    />
  </svg>
);

export const Sheet = ({
  blobs,
  label,
  Icon,
  headline,
  accent,
  sub,
  cta,
  to,
  children,
}) => {
  const navigate = useNavigate();

  return (
    <section className="relative overflow-hidden px-4 py-14 sm:px-8 md:px-12 md:py-20">
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          aria-hidden="true"
          animate={{
            x: [0, b.dx, 0],
            y: [0, b.dy, 0],
          }}
          transition={{
            duration: 14 + i * 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="pointer-events-none absolute rounded-full blur-[110px]"
          style={{
            background: b.c,
            width: b.s,
            height: b.s,
            left: b.x,
            top: b.y,
            opacity: 0.16,
          }}
        />
      ))}

      <div className="relative z-10 mx-auto grid max-w-[1240px] items-center gap-10 lg:grid-cols-12 lg:gap-14">
        {/* Text — left */}
        <div className="flex flex-col items-start text-left lg:col-span-5">
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 rounded-full bg-white/[0.08] px-4 py-1.5 text-[12px] font-bold uppercase tracking-[0.14em] text-[#e8e2d6]"
          >
            <Icon size={13} style={{ color: ACCENT }} />
            {label}
          </motion.span>

          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{
              duration: 0.9,
              delay: 0.08,
              ease: EASE_OUT,
            }}
            className="font-napkin-display mt-4 text-[2.4rem] font-bold leading-[1.04] tracking-tight text-[#f4efe6] sm:text-5xl lg:text-[3.4rem] xl:text-[4rem]"
          >
            {headline}{' '}
            <span
              className="relative inline-block"
              style={{ color: ACCENT }}
            >
              {accent}
              <Scribble color={ACCENT} />
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{
              delay: 0.3,
              duration: 0.8,
            }}
            className="mt-5 max-w-md text-base font-medium text-white/60 md:text-lg"
          >
            {sub}
          </motion.p>

          <motion.button
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{
              delay: 0.4,
              duration: 0.7,
            }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              window.scrollTo(0, 0);
              navigate(to);
            }}
            className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#f4efe6] px-6 py-3 text-sm font-bold text-[#1a1612] shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
          >
            {cta}
            <ArrowUpRight size={16} />
          </motion.button>
        </div>

        {/* Animation — right */}
        <div className="min-w-0 lg:col-span-7">{children}</div>
      </div>
    </section>
  );
};

const Window = ({ url, children, tabs, activeTab }) => {
  const ref = useRef(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'center center'],
  });

  const rotateX = useTransform(scrollYProgress, [0, 1], [16, 0]);
  const y = useTransform(scrollYProgress, [0, 1], [70, 0]);

  return (
    <div
      style={{ perspective: 1600 }}
      className="@container w-full"
    >
      <motion.div
        ref={ref}
        style={{
          rotateX,
          y,
          transformOrigin: '50% 100%',
        }}
        className="overflow-hidden rounded-[1.35rem] border border-black/10 bg-white shadow-[0_42px_85px_-30px_rgba(26,22,18,0.45)]"
      >
        <div className="flex items-center gap-3 border-b border-black/[0.07] bg-[#faf8f4] px-4 py-3">
          <div className="flex gap-1.5">
            {['#ff6b5e', '#ffc040', '#3ccf5c'].map((c) => (
              <span
                key={c}
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: c }}
              />
            ))}
          </div>

          <div className="mx-auto flex h-7 min-w-0 max-w-[340px] flex-1 items-center justify-center overflow-hidden rounded-full bg-black/[0.05] px-4 text-[11px] font-semibold text-black/50">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={url}
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -12, opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="truncate"
              >
                {url}
              </motion.span>
            </AnimatePresence>
          </div>

          <div className="hidden gap-1 sm:flex">
            {tabs.map((t, i) => (
              <span
                key={t}
                className={`rounded-full px-3 py-1 text-[11px] font-bold transition-all duration-500 ${
                  i === activeTab
                    ? 'bg-[#1a1612] text-white'
                    : 'text-black/35'
                }`}
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {children}
      </motion.div>
    </div>
  );
};

const DeployDemo = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { amount: 0.35 });

  const tick = useLoopTick(4, 1700, inView);

  const live = tick >= 3;
  const step = tick <= 1 ? 0 : tick === 2 ? 1 : 2;
  const progress = tick === 0 ? 0 : tick === 1 ? 45 : 100;

  return (
    <div ref={ref}>
      <Window
        url={live ? 'your-project.vercel.app' : 'devdrop.app/deploy'}
        tabs={['Connect', 'Build', 'Live']}
        activeTab={step}
      >
        <div className="grid min-h-[255px] @xl:grid-cols-5">
          <div className="flex flex-col justify-center gap-3 border-b border-black/[0.07] p-4 @xl:col-span-2 @xl:border-b-0 @xl:border-r @xl:p-5">
            <div className="flex items-center gap-2 rounded-xl bg-[#f6f2ea] p-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1a1612] text-white">
                <GitBranch size={18} />
              </span>

              <div className="text-left">
                <div className="text-sm font-bold">my-portfolio</div>
                <div className="text-[11px] font-semibold text-black/45">
                  React · Vite · main
                </div>
              </div>
            </div>

            <div className="relative">
              <motion.div
                animate={{
                  scale: tick === 1 ? 0.95 : 1,
                }}
                transition={{ duration: 0.2 }}
                className={`flex h-10 items-center justify-center gap-2 rounded-full text-xs font-bold text-white transition-colors duration-500 ${
                  live ? 'bg-[#2f8f57]' : 'bg-[#8b7355]'
                }`}
              >
                {live ? (
                  <>
                    <Check size={16} />
                    Live
                  </>
                ) : tick === 0 ? (
                  <>
                    <Rocket size={15} />
                    Deploy
                  </>
                ) : (
                  'Deploying…'
                )}
              </motion.div>

              <motion.svg
                viewBox="0 0 24 24"
                className="pointer-events-none absolute z-10 h-6 w-6 drop-shadow"
                animate={
                  tick === 0
                    ? {
                        left: '95%',
                        top: '210%',
                        opacity: 1,
                      }
                    : live
                    ? {
                        left: '70%',
                        top: '95%',
                        opacity: 0,
                      }
                    : {
                        left: '58%',
                        top: '55%',
                        opacity: 1,
                      }
                }
                transition={{
                  duration: 0.9,
                  ease: EASE_OUT,
                }}
              >
                <path
                  d="M4 2 L4 19 L8.5 15 L11.5 22 L14 21 L11 14 L17 14 Z"
                  fill="#1a1612"
                  stroke="#fff"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </motion.svg>
            </div>

            <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.07]">
              <motion.div
                animate={{ width: `${progress}%` }}
                transition={{
                  duration: 1.2,
                  ease: EASE_OUT,
                }}
                className="h-full rounded-full"
                style={{
                  background: live ? '#2f8f57' : BROWN,
                }}
              />
            </div>

            <div className="flex gap-2">
              {['Vercel', 'Render'].map((p) => (
                <span
                  key={p}
                  className="rounded-full bg-black/[0.06] px-3 py-1 text-[11px] font-bold text-black/55"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>

          <div className="relative min-h-[220px] overflow-hidden bg-[#f1ede4] @xl:col-span-3">
            <AnimatePresence>
              {!live && (
                <motion.div
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6 }}
                  className="absolute inset-0 grid place-items-center"
                >
                  <div className="w-3/5 space-y-3">
                    {[100, 70, 85].map((w, i) => (
                      <motion.div
                        key={i}
                        animate={{
                          opacity: [0.35, 0.8, 0.35],
                        }}
                        transition={{
                          duration: 1.4,
                          repeat: Infinity,
                          delay: i * 0.2,
                        }}
                        className="h-3 rounded-full bg-black/10"
                        style={{ width: `${w}%` }}
                      />
                    ))}

                    <motion.div
                      animate={{
                        opacity: [0.35, 0.8, 0.35],
                      }}
                      transition={{
                        duration: 1.4,
                        repeat: Infinity,
                      }}
                      className="h-24 rounded-2xl bg-black/10"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.img
              src={IMG.hero}
              alt="Deployed site preview"
              loading="lazy"
              animate={{
                opacity: live ? 1 : 0,
                scale: live ? 1 : 1.12,
              }}
              transition={{
                duration: 1.1,
                ease: EASE_OUT,
              }}
              className="absolute inset-0 h-full w-full object-cover"
            />

            <motion.div
              animate={{
                opacity: live ? 1 : 0,
                y: live ? 0 : 12,
              }}
              transition={{
                duration: 0.6,
                delay: 0.3,
              }}
              className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold shadow-lg"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2f8f57] opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#2f8f57]" />
              </span>
              Live on your cloud
            </motion.div>
          </div>
        </div>
      </Window>
    </div>
  );
};

const PROMPT = 'A portfolio site for a ceramic artist';

const AIDemo = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { amount: 0.35 });

  const tick = useLoopTick(5, 1500, inView);
  const [chars, setChars] = useState(0);

  useEffect(() => {
    if (tick !== 0 || !inView) return undefined;

    setChars(0);

    const c = animate(0, PROMPT.length, {
      duration: 1.2,
      ease: 'linear',
      onUpdate: (v) => setChars(Math.floor(v)),
    });

    return () => c.stop();
  }, [tick, inView]);

  const typed = tick === 0 ? PROMPT.slice(0, chars) : PROMPT;

  const show = (n) => tick >= n;

  const pop = (n) => ({
    opacity: show(n) ? 1 : 0,
    y: show(n) ? 0 : 14,
    scale: show(n) ? 1 : 0.96,
  });

  const t = {
    duration: 0.7,
    ease: EASE_OUT,
  };

  return (
    <div ref={ref}>
      <Window
        url={
          tick >= 5
            ? 'ceramic-studio · exported'
            : 'devdrop.app/ai-studio'
        }
        tabs={['Prompt', 'Build', 'Ship']}
        activeTab={tick <= 1 ? 0 : tick < 5 ? 1 : 2}
      >
        <div className="grid min-h-[270px] @xl:grid-cols-5">
          <div className="flex flex-col justify-between gap-3 border-b border-black/[0.07] p-4 @xl:col-span-2 @xl:border-b-0 @xl:border-r @xl:p-5">
            <div className="space-y-3 text-left">
              <div className="ml-auto w-fit max-w-[92%] rounded-2xl rounded-br-md bg-[#1a1612] px-4 py-3 text-sm font-semibold leading-snug text-white">
                {typed}

                {tick === 0 && (
                  <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-white" />
                )}
              </div>

              {[
                'Designing the layout',
                'Writing components',
                'Testing the build',
              ].map((s, i) => (
                <motion.div
                  key={s}
                  animate={pop(i + 2)}
                  transition={t}
                  className="flex w-fit items-center gap-2 rounded-full bg-[#f6f2ea] px-3.5 py-2 text-xs font-bold"
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#2f8f57] text-white">
                    <Check size={10} strokeWidth={4} />
                  </span>
                  {s}
                </motion.div>
              ))}
            </div>

            <motion.div
              animate={{
                scale: tick === 1 ? [1, 1.05, 1] : 1,
              }}
              transition={{ duration: 0.6 }}
              className={`flex h-10 items-center justify-center gap-2 rounded-full text-xs font-bold text-white transition-colors duration-500 ${
                tick >= 5 ? 'bg-[#2f8f57]' : 'bg-[#8b7355]'
              }`}
            >
              {tick >= 5 ? (
                <>
                  <Check size={16} />
                  Exported to GitHub
                </>
              ) : (
                <>
                  <Sparkles size={15} />
                  {tick === 0 ? 'Generate' : 'Building…'}
                </>
              )}
            </motion.div>
          </div>

          <div className="relative overflow-hidden bg-[#f1ede4] p-4 @xl:col-span-3 @xl:p-6">
            <div className="h-full min-h-[220px] overflow-hidden rounded-xl bg-white shadow-sm">
              <motion.div
                animate={pop(2)}
                transition={t}
                className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3"
              >
                <span className="h-3 w-12 rounded-full bg-[#1a1612]" />

                <span className="flex gap-2">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-2 w-8 rounded-full bg-black/10"
                    />
                  ))}
                </span>
              </motion.div>

              <div className="grid grid-cols-2 gap-4 p-4">
                <div className="flex flex-col justify-center gap-2.5">
                  {[
                    ['w-full h-4', 3],
                    ['w-3/4 h-4', 3],
                    ['w-full h-2', 3],
                    ['w-2/3 h-2', 3],
                  ].map(([c, n], i) => (
                    <motion.span
                      key={i}
                      animate={{
                        opacity: show(n) ? 1 : 0,
                        x: show(n) ? 0 : -16,
                      }}
                      transition={{
                        ...t,
                        delay: i * 0.08,
                      }}
                      className={`${c} rounded-full ${
                        i < 2 ? 'bg-[#1a1612]' : 'bg-black/15'
                      }`}
                    />
                  ))}

                  <motion.span
                    animate={{
                      opacity: show(3) ? 1 : 0,
                      scale: show(3) ? 1 : 0.8,
                    }}
                    transition={{
                      ...t,
                      delay: 0.35,
                    }}
                    className="mt-1 h-7 w-20 rounded-full bg-[#8b7355]"
                  />
                </div>

                <motion.img
                  src={IMG.hero}
                  alt=""
                  loading="lazy"
                  animate={{
                    opacity: show(3) ? 1 : 0,
                    scale: show(3) ? 1 : 1.1,
                  }}
                  transition={{
                    duration: 1,
                    ease: EASE_OUT,
                  }}
                  className="aspect-[4/3] w-full rounded-xl object-cover"
                />
              </div>

              <div className="grid grid-cols-3 gap-3 px-4 pb-4">
                {[IMG.a, IMG.b, IMG.c].map((src, i) => (
                  <motion.img
                    key={src}
                    src={src}
                    alt=""
                    loading="lazy"
                    animate={pop(4)}
                    transition={{
                      ...t,
                      delay: i * 0.12,
                    }}
                    className="aspect-[4/3] w-full rounded-lg object-cover"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </Window>
    </div>
  );
};

export const DeployUSP = () => (
  <Sheet
    Icon={Rocket}
    label="Deploy"
    headline="Ship it on"
    accent="your own cloud."
    sub="One click. Your account. Your rules."
    cta="Deploy your project"
    to="/deploy-own"
    blobs={[
      {
        c: '#e9c9a8',
        s: 380,
        x: '-6%',
        y: '8%',
        dx: 60,
        dy: 40,
      },
      {
        c: '#c4d3b5',
        s: 340,
        x: '72%',
        y: '30%',
        dx: -50,
        dy: 50,
      },
    ]}
  >
    <DeployDemo />
  </Sheet>
);

export const AIStudioUSP = () => (
  <Sheet
    Icon={Sparkles}
    label="AI Studio"
    headline="Describe it. Get"
    accent="the whole app."
    sub="Type an idea. Watch it build itself."
    cta="Open AI Studio"
    to="/ai-studio"
    blobs={[
      {
        c: '#d9c3e0',
        s: 360,
        x: '70%',
        y: '5%',
        dx: -60,
        dy: 40,
      },
      {
        c: '#f0cdb0',
        s: 400,
        x: '-8%',
        y: '40%',
        dx: 50,
        dy: -40,
      },
    ]}
  >
    <AIDemo />
  </Sheet>
  
);
const MarketplaceDemo = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { amount: 0.35 });

  const tick = useLoopTick(4, 1700, inView);

  const purchased = tick >= 3;

  return (
    <div ref={ref}>
      <Window
        url={
          purchased
            ? 'devdrop.app/purchase/complete'
            : 'devdrop.app/marketplace'
        }
        tabs={['Browse', 'Bid', 'Owned']}
        activeTab={
          tick === 0 ? 0 :
          tick === 1 || tick === 2 ? 1 : 2
        }
      >
        <div className="grid min-h-[255px] @xl:grid-cols-5">

          {/* LEFT — Marketplace */}
          <div className="flex flex-col justify-between gap-3 border-b border-black/[0.07] p-4 @xl:col-span-2 @xl:border-b-0 @xl:border-r @xl:p-5">

            <div className="space-y-3">

              {/* Product */}
              <div className="rounded-xl bg-[#f6f2ea] p-3">

                <div className="flex items-center gap-3">

                  <div className="h-12 w-12 overflow-hidden rounded-lg bg-[#ddd4c5]">
                    <img
                      src={IMG.a}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="text-sm font-bold">
                      Kinetic Portfolio
                    </div>

                    <div className="text-[11px] font-semibold text-black/45">
                      React · Premium Template
                    </div>
                  </div>

                </div>

                <div className="mt-3 flex items-center justify-between">

                  <span className="text-[11px] font-bold text-black/45">
                    {tick >= 1 ? 'Current bid' : 'Starting at'}
                  </span>

                  <motion.span
                    key={tick}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm font-black text-[#8b7355]"
                  >
                    {tick === 0
                      ? '$49'
                      : tick === 1
                      ? '$79'
                      : '$99'}
                  </motion.span>

                </div>

              </div>

              {/* Action */}
              <motion.div
                animate={{
                  scale: tick === 1 ? [1, 1.04, 1] : 1
                }}
                transition={{ duration: 0.6 }}
                className={`flex h-10 items-center justify-center gap-2 rounded-full text-xs font-bold text-white transition-colors duration-500 ${
                  purchased
                    ? 'bg-[#2f8f57]'
                    : 'bg-[#8b7355]'
                }`}
              >

                {purchased ? (
                  <>
                    <CheckCircle size={15} />
                    Ownership secured
                  </>
                ) : tick >= 1 ? (
                  <>
                    <Gavel size={15} />
                    Bid placed
                  </>
                ) : (
                  <>
                    <ShoppingBag size={15} />
                    Buy / Bid
                  </>
                )}

              </motion.div>

            </div>

            {/* Verification */}
            <div className="flex flex-wrap gap-2">

              <span className="rounded-full bg-black/[0.06] px-3 py-1 text-[11px] font-bold text-black/55">
                Verified
              </span>

              <span className="rounded-full bg-black/[0.06] px-3 py-1 text-[11px] font-bold text-black/55">
                Full Source
              </span>

              <span className="rounded-full bg-black/[0.06] px-3 py-1 text-[11px] font-bold text-black/55">
                Secure Handoff
              </span>

            </div>

          </div>

          {/* RIGHT — Preview */}
          <div className="relative min-h-[220px] overflow-hidden bg-[#f1ede4] p-4 @xl:col-span-3 @xl:p-5">

            <div className="h-full overflow-hidden rounded-xl bg-white shadow-sm">

              {/* Browser header */}
              <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3">

                <span className="h-3 w-16 rounded-full bg-[#1a1612]" />

                <div className="flex gap-2">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-2 w-10 rounded-full bg-black/10"
                    />
                  ))}
                </div>

              </div>

              {/* Website preview */}
              <div className="grid grid-cols-2 gap-4 p-4">

                <div className="flex flex-col justify-center gap-2.5">

                  <motion.span
                    animate={{
                      opacity: tick >= 1 ? 1 : 0.5,
                      x: tick >= 1 ? 0 : -8
                    }}
                    className="h-4 w-full rounded-full bg-[#1a1612]"
                  />

                  <motion.span
                    animate={{
                      opacity: tick >= 1 ? 1 : 0.5,
                      x: tick >= 1 ? 0 : -8
                    }}
                    className="h-4 w-3/4 rounded-full bg-[#1a1612]"
                  />

                  <span className="h-2 w-full rounded-full bg-black/10" />
                  <span className="h-2 w-2/3 rounded-full bg-black/10" />

                  <motion.span
                    animate={{
                      scale: purchased ? 1.05 : 1,
                      backgroundColor: purchased
                        ? '#2f8f57'
                        : '#8b7355'
                    }}
                    className="mt-2 h-7 w-24 rounded-full"
                  />

                </div>

                <motion.img
                  src={IMG.a}
                  alt=""
                  animate={{
                    scale: purchased ? 1.03 : 1
                  }}
                  transition={{
                    duration: 1,
                    ease: EASE_OUT
                  }}
                  className="aspect-[4/3] w-full rounded-xl object-cover"
                />

              </div>

              {/* Status */}
              <AnimatePresence mode="wait">

                {!purchased ? (

                  <motion.div
                    key="market"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{
                      opacity: tick >= 2 ? 1 : 0.4,
                      y: 0
                    }}
                    className="mx-4 mb-4 flex items-center justify-between rounded-xl bg-[#f6f2ea] px-4 py-3"
                  >

                    <div>
                      <div className="text-[11px] font-bold text-black/40">
                        Marketplace status
                      </div>

                      <div className="text-xs font-bold">
                        {tick >= 2
                          ? 'Winning bid confirmed'
                          : 'Live auction'}
                      </div>
                    </div>

                    <Gavel
                      size={18}
                      className="text-[#8b7355]"
                    />

                  </motion.div>

                ) : (

                  <motion.div
                    key="owned"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mx-4 mb-4 flex items-center justify-between rounded-xl bg-[#edf5ee] px-4 py-3"
                  >

                    <div>
                      <div className="text-[11px] font-bold text-[#2f8f57]/60">
                        Purchase complete
                      </div>

                      <div className="text-xs font-bold text-[#2f8f57]">
                        Full ownership transferred
                      </div>
                    </div>

                    <CheckCircle
                      size={18}
                      className="text-[#2f8f57]"
                    />

                  </motion.div>

                )}

              </AnimatePresence>

            </div>

          </div>

        </div>
      </Window>
    </div>
  );
};


export const MarketplaceUSP = () => (
  <Sheet
    Icon={ShoppingBag}
    label="Asset Marketplace"
    headline="Buy, sell & auction"
    accent="verified templates."
    sub="Fixed-price sales, live bidding, and instant ownership handoff."
    cta="Browse Marketplace"
    to="/template"
    blobs={[
      {
        c: '#e9c9a8',
        s: 380,
        x: '-6%',
        y: '8%',
        dx: 60,
        dy: 40
      },
      {
        c: '#c4d3b5',
        s: 340,
        x: '72%',
        y: '30%',
        dx: -50,
        dy: 50
      }
    ]}
  >
    <MarketplaceDemo />
  </Sheet>
);