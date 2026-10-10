import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useReducedMotion } from 'framer-motion';
import { Check, Code2, FileText, Loader2, Palette, ShieldCheck } from 'lucide-react';
import { PIPELINE_TITLES } from './pipelineSteps';

// Generating screen. It lives INSIDE the preview pane (the div that will later
// hold the live preview), so it can never run under the navbar. One centered
// scene, almost no text: each pipeline step plays its own looping animation and
// an icon stepper underneath shows where the build is. Flat on purpose: cream on
// near-black with one tan accent — no glows or blurred orbs.

const CREAM = '#e8e2d6';
const TAN = '#cbb392';
const INK = '#0d0c0a';
const LAV = '#b8a4f0';
const TEAL = '#7fc8c0';
const CORAL = '#e8a87c';

const STEP_META = {
  requirements: { icon: FileText, short: 'Reading your brief' },
  design: { icon: Palette, short: 'Designing the layout' },
  code: { icon: Code2, short: 'Writing the code' },
  validation: { icon: ShieldCheck, short: 'Checking everything' },
};
const MESSAGES = {
  edit: ['Finding the files your change touches', 'Making the smallest safe edit', 'Double-checking it still builds'],
  debug: ['Reading the error output', 'Repairing the broken code', 'Re-validating the build'],
};

/* ───────────── small hooks ───────────── */

function useRotating(list, ms = 2600) {
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    if (list.length < 2) return undefined;
    const t = setInterval(() => setI((n) => (n + 1) % list.length), ms);
    return () => clearInterval(t);
  }, [list, ms]);
  return list[i % list.length];
}

function useBox(ref) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof ResizeObserver === 'undefined') { setBox({ w: 1000, h: 640 }); return undefined; }
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

function AnimatedNumber({ value }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const controls = animate(from.current, value, { duration: 0.8, ease: 'easeOut', onUpdate: (v) => setShown(Math.round(v)) });
    from.current = value;
    return () => controls.stop();
  }, [value]);
  return <>{shown}</>;
}

/* ───────────── scenes (viewBox 520 × 300) ───────────── */

const VB_W = 520;
const VB_H = 300;

function Panel({ x, y, w, h, r = 14 }) {
  return <rect x={x} y={y} width={w} height={h} rx={r} fill={INK} stroke={CREAM} strokeOpacity="0.14" />;
}

// A little pointer that wanders around a scene, so it feels like someone is working.
function Cursor({ xs, ys, d, times, reduce }) {
  if (reduce) return null;
  return (
    <motion.g initial={{ x: xs[0], y: ys[0] }} animate={{ x: xs, y: ys }} transition={{ duration: d, times, repeat: Infinity, ease: 'easeInOut' }}>
      <path d="M0 0L0 16l4.2-3.8L7 18.5l2.6-1.2-2.8-6.2H12.6z" fill={CREAM} stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />
    </motion.g>
  );
}

// 1 · Requirements — a brief gets scanned and turns into structured requirements.
function SceneRequirements({ reduce }) {
  const D = 7.5;
  const widths = [176, 148, 184, 120, 164, 136, 92];
  const lineY = (i) => 98 + i * 22;
  const lineDelay = (i) => 0.15 + i * 0.52;
  const chips = [
    { label: 'Brand', line: 0 },
    { label: 'Pages', line: 2 },
    { label: 'Sections', line: 3 },
    { label: 'Tone', line: 5 },
    { label: 'Audience', line: 6 },
  ];
  return (
    <g>
      <Panel x={36} y={26} w={244} h={248} />
      <rect x={56} y={48} width={104} height={9} rx={4.5} fill={CREAM} opacity={0.6} />
      <rect x={56} y={64} width={64} height={6} rx={3} fill={CREAM} opacity={0.2} />
      <path d="M56 84h204" stroke={CREAM} strokeOpacity="0.08" />
      {widths.map((w, i) => (
        <g key={i}>
          <rect x={56} y={lineY(i)} width={w} height={6} rx={3} fill={CREAM} opacity={0.13} />
          <rect className="sg-fill" x={56} y={lineY(i)} width={w} height={6} rx={3} fill={TAN} style={{ '--delay': `${lineDelay(i)}s`, '--d': `${D}s` }} />
        </g>
      ))}
      {!reduce && (
        <motion.rect
          x={46} width={224} height={2} rx={1} fill={CREAM}
          initial={{ y: 90, opacity: 0 }}
          animate={{ y: [90, 250, 250], opacity: [0.7, 0.7, 0] }}
          transition={{ duration: D, times: [0, 0.5, 0.58], repeat: Infinity, ease: 'linear' }}
        />
      )}
      <Cursor reduce={reduce} d={D} xs={[70, 130, 200, 230, 330, 330]} ys={[92, 120, 160, 224, 120, 92]} />
      {chips.map((c, i) => {
        const y = 44 + i * 46;
        const delay = lineDelay(c.line) + 0.5;
        const ly = lineY(c.line) + 3;
        const st = { '--delay': `${delay}s`, '--d': `${D}s` };
        return (
          <g key={c.label}>
            <path className="sg-rise" d={`M284 ${ly}C300 ${ly} 298 ${y + 18} 312 ${y + 18}`} fill="none" stroke={TAN} strokeOpacity="0.5" strokeWidth="1.2" strokeDasharray="3 3" style={st} />
            <g className="sg-rise" style={st}>
              <rect x={312} y={y} width={176} height={36} rx={11} fill={INK} stroke={TAN} strokeOpacity="0.4" />
              <circle cx={330} cy={y + 18} r={5} fill={TAN} />
              <path d={`M327.6 ${y + 18}l1.8 1.8 3.2-3.6`} fill="none" stroke={INK} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              <text x={344} y={y + 22} fontSize="11.5" fontWeight="600" fill={CREAM}>{c.label}</text>
              <rect x={432} y={y + 15} width={42} height={6} rx={3} fill={CREAM} opacity={0.22} />
            </g>
          </g>
        );
      })}
    </g>
  );
}

// 2 · Design — palette + type are chosen while a responsive wireframe builds up.
function SceneDesign({ reduce }) {
  const D = 8.5;
  const swatches = [CREAM, TAN, LAV, TEAL, CORAL];
  const st = (i, base = 0.3, step = 0.3) => ({ '--delay': `${base + i * step}s`, '--d': `${D}s` });
  const cols = Array.from({ length: 7 }, (_, i) => 112 + i * 46);
  return (
    <g>
      {swatches.map((c, i) => (
        <circle key={c} className="sg-pop" cx={54} cy={52 + i * 49} r={13} fill={c} style={st(i, 0.2, 0.38)} />
      ))}

      <Panel x={100} y={26} w={300} h={248} r={12} />
      {cols.map((x) => <path key={x} d={`M${x} 40V262`} stroke={CREAM} strokeOpacity="0.06" strokeDasharray="2 4" />)}
      {[[100, 26], [400, 26], [100, 274], [400, 274]].map(([x, y], i) => (
        <rect key={i} className="sg-pop" x={x - 3} y={y - 3} width={6} height={6} rx={1.5} fill={TAN} style={st(i, 0.1, 0.1)} />
      ))}

      {/* nav */}
      <g className="sg-rise" style={st(0)}>
        <rect x={112} y={38} width={276} height={18} rx={5} fill={CREAM} opacity={0.07} />
        <rect x={120} y={44} width={30} height={6} rx={3} fill={TAN} />
        {[300, 330, 360].map((x) => <rect key={x} x={x} y={45} width={22} height={4} rx={2} fill={CREAM} opacity={0.35} />)}
      </g>
      {/* hero copy */}
      <rect className="sg-rise" x={116} y={76} width={150} height={11} rx={5.5} fill={CREAM} opacity={0.65} style={st(1)} />
      <rect className="sg-rise" x={116} y={94} width={112} height={11} rx={5.5} fill={CREAM} opacity={0.65} style={st(2)} />
      <g className="sg-rise" style={st(3)}>
        <rect x={116} y={118} width={138} height={5} rx={2.5} fill={CREAM} opacity={0.3} />
        <rect x={116} y={128} width={116} height={5} rx={2.5} fill={CREAM} opacity={0.3} />
      </g>
      <rect className="sg-rise" x={116} y={146} width={60} height={18} rx={9} fill={TAN} style={st(4)} />
      {/* hero image */}
      <g className="sg-rise" style={st(5)}>
        <rect x={284} y={72} width={100} height={94} rx={10} fill={TAN} opacity={0.2} />
        <circle cx={338} cy={100} r={9} fill={TAN} opacity={0.6} />
        <path d="M292 156l28-26 22 17 18-12 24 21" fill="none" stroke={TAN} strokeOpacity="0.6" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {/* cards */}
      {[112, 208, 304].map((x, i) => (
        <g key={x} className="sg-rise" style={st(6 + i)}>
          <rect x={x} y={182} width={84} height={62} rx={8} fill={CREAM} fillOpacity={0.05} stroke={CREAM} strokeOpacity="0.16" />
          <circle cx={x + 16} cy={198} r={5} fill={i === 1 ? LAV : i === 2 ? TEAL : TAN} />
          <rect x={x + 10} y={214} width={58} height={5} rx={2.5} fill={CREAM} opacity={0.38} />
          <rect x={x + 10} y={225} width={40} height={5} rx={2.5} fill={CREAM} opacity={0.2} />
        </g>
      ))}
      <rect className="sg-rise" x={112} y={254} width={276} height={10} rx={5} fill={CREAM} opacity={0.08} style={st(9)} />

      <Cursor reduce={reduce} d={D} xs={[60, 120, 130, 250, 330, 450, 60]} ys={[60, 90, 150, 190, 110, 100, 60]} />
      {/* type specimen */}
      <g className="sg-rise" style={st(0, 1.1, 0)}>
        <text x={456} y={110} textAnchor="middle" fontSize="46" fontWeight="800" fill={CREAM}>Aa</text>
        <text x={456} y={130} textAnchor="middle" fontSize="9.5" fontWeight="600" fill={CREAM} opacity={0.5} letterSpacing="1.6">HEADING</text>
        <text x={456} y={182} textAnchor="middle" fontSize="26" fontWeight="400" fill={CREAM} opacity={0.7}>Aa</text>
        <text x={456} y={202} textAnchor="middle" fontSize="9.5" fontWeight="500" fill={CREAM} opacity={0.4} letterSpacing="1.6">BODY</text>
      </g>
    </g>
  );
}

// 3 · Code — files are written one after another; the tree ticks them off.
const CODE_PATTERNS = [
  [[0, [[38, TAN], [70, CREAM]]], [0, [[56, LAV], [48, CREAM], [34, TAN]]], [1, [[30, TEAL], [92, CREAM]]], [1, [[44, TAN], [26, CREAM], [66, CORAL]]], [2, [[60, CREAM], [40, LAV]]], [2, [[34, TEAL], [84, CREAM]]], [1, [[24, TAN]]], [0, [[56, LAV], [30, CREAM]]], [0, [[20, CREAM]]]],
  [[0, [[44, LAV], [62, CREAM], [28, TAN]]], [1, [[34, TEAL], [70, CREAM]]], [1, [[52, CREAM], [38, CORAL]]], [2, [[26, TAN], [88, CREAM]]], [2, [[64, CREAM], [30, LAV]]], [1, [[22, TAN]]], [1, [[48, TEAL], [54, CREAM], [24, TAN]]], [0, [[18, CREAM]]], [0, [[40, LAV], [26, CREAM]]]],
  [[0, [[30, CORAL], [76, CREAM]]], [1, [[42, TAN], [58, CREAM]]], [1, [[36, TEAL], [34, CREAM], [44, LAV]]], [0, [[14, CREAM]]], [0, [[50, LAV], [40, CREAM]]], [1, [[28, TAN], [96, CREAM]]], [1, [[60, CREAM], [26, TEAL]]], [0, [[14, CREAM]]], [0, [[34, CORAL]]]],
];
const CODE_FILES = ['App.jsx', 'Navbar.jsx', 'Hero.jsx', 'Sections.jsx', 'styles.css'];

function SceneCode() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => (n + 1) % (CODE_FILES.length + 2)), 2200);
    return () => clearInterval(t);
  }, []);
  const active = Math.min(tick, CODE_FILES.length - 1);
  const finished = tick >= CODE_FILES.length;
  const pattern = CODE_PATTERNS[active % CODE_PATTERNS.length];
  const written = Math.min(tick, CODE_FILES.length);
  return (
    <g>
      <Panel x={28} y={24} w={464} h={252} />
      <path d="M150 24V250" stroke={CREAM} strokeOpacity="0.1" />
      <path d="M28 52H492" stroke={CREAM} strokeOpacity="0.1" />
      <path d="M28 250H492" stroke={CREAM} strokeOpacity="0.1" />
      <text x={44} y={42} fontSize="9" fontWeight="700" letterSpacing="1.6" fill={CREAM} opacity={0.4}>FILES</text>

      {CODE_FILES.map((f, i) => {
        const done = tick > i;
        const running = tick === i;
        const y = 82 + i * 30;
        return (
          <g key={f}>
            {running && <rect x={36} y={y - 16} width={106} height={26} rx={8} fill={CREAM} opacity={0.06} />}
            {done ? (
              <motion.path key="c" d={`M46 ${y - 3}l3.2 3.2 6-6.4`} fill="none" stroke={TAN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3 }} />
            ) : running ? (
              <circle className="animate-spin" cx={51} cy={y - 3} r={5.5} fill="none" stroke={TAN} strokeWidth="1.8" strokeDasharray="9 26" strokeLinecap="round" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
            ) : (
              <circle cx={51} cy={y - 3} r={2.4} fill={CREAM} opacity={0.22} />
            )}
            <text x={64} y={y} fontSize="11" fontWeight="600" fill={CREAM} opacity={done || running ? 0.95 : 0.38}>{f}</text>
          </g>
        );
      })}

      <text x={168} y={42} fontSize="11" fontWeight="600" fill={CREAM} opacity={0.95}>{CODE_FILES[active]}</text>
      <rect x={166} y={48} width={CODE_FILES[active].length * 6.2 + 4} height={2} rx={1} fill={TAN} />

      <g key={`${active}-${finished}`}>
        {pattern.map(([indent, parts], n) => {
          const y = 72 + n * 19;
          let x = 170 + indent * 14;
          return (
            <g key={n}>
              {parts.map(([w, c], k) => {
                const rx = x;
                x += w + 6;
                return <rect key={k} className="sg-fill" x={rx} y={y} width={w} height={7} rx={3.5} fill={c} fillOpacity={c === CREAM ? 0.4 : 0.9} style={{ '--delay': `${n * 0.14 + k * 0.05}s`, '--d': '6s' }} />;
              })}
            </g>
          );
        })}
      </g>

      <text x={44} y={267} fontSize="10.5" fontWeight="600" fill={TAN}>{finished ? 'All files written' : `Writing ${CODE_FILES[active]}`}</text>
      <text x={476} y={267} fontSize="10.5" textAnchor="end" fill={CREAM} opacity={0.5}>{written} / {CODE_FILES.length} files</text>
    </g>
  );
}

// 4 · Validation — checks run one by one and a ring fills as they pass.
function SceneValidate() {
  const checks = [['Syntax', 'No errors found'], ['Imports', 'All resolved'], ['Build', 'Compiled cleanly'], ['Assets', 'Images and fonts ready']];
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => (n >= 7 ? 0 : n + 1)), 800);
    return () => clearInterval(t);
  }, []);
  const passed = Math.min(tick, checks.length);
  const clear = tick >= checks.length;
  const R = 58;
  return (
    <g>
      {checks.map(([label, ok], i) => {
        const done = tick > i;
        const running = tick === i;
        const y = 40 + i * 58;
        return (
          <g key={label}>
            <rect x={44} y={y} width={268} height={46} rx={12} fill={INK} stroke={done ? TAN : CREAM} strokeOpacity={done ? 0.5 : 0.14} />
            <circle cx={70} cy={y + 23} r={10} fill={done ? TAN : 'none'} stroke={done ? TAN : CREAM} strokeOpacity={done ? 1 : 0.25} strokeWidth="1.6" />
            {done && (
              <motion.path key="c" d={`M65.5 ${y + 23}l3.2 3.2 6-6.4`} fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3 }} />
            )}
            {running && <circle className="animate-spin" cx={70} cy={y + 23} r={10} fill="none" stroke={TAN} strokeWidth="2" strokeDasharray="14 50" strokeLinecap="round" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />}
            <text x={92} y={y + 20} fontSize="12.5" fontWeight="600" fill={CREAM} opacity={done || running ? 0.95 : 0.4}>{label}</text>
            <text x={92} y={y + 35} fontSize="10" fill={CREAM} opacity={0.42}>{done ? ok : running ? 'Checking…' : 'Waiting'}</text>
            <text x={296} y={y + 27} fontSize="10" fontWeight="700" letterSpacing="1.2" textAnchor="end" fill={TAN} opacity={done ? 1 : 0}>PASS</text>
          </g>
        );
      })}
      <g transform="translate(410 150)">
        <circle r={R} fill="none" stroke={CREAM} strokeOpacity="0.1" strokeWidth="6" />
        <g transform="rotate(-90)">
          <motion.circle r={R} fill="none" stroke={TAN} strokeWidth="6" strokeLinecap="round" initial={false} animate={{ pathLength: passed / checks.length, opacity: passed ? 1 : 0 }} transition={{ duration: 0.5, ease: 'easeOut' }} />
        </g>
        <text textAnchor="middle" y={8} fontSize="30" fontWeight="800" fill={CREAM}>{passed}<tspan fontSize="16" opacity="0.5">/{checks.length}</tspan></text>
        <text textAnchor="middle" y={30} fontSize="9" fontWeight="700" letterSpacing="1.4" fill={clear ? TAN : CREAM} opacity={clear ? 1 : 0.45}>{clear ? 'ALL CLEAR' : 'PASSED'}</text>
      </g>
    </g>
  );
}

const SCENES = { requirements: SceneRequirements, design: SceneDesign, code: SceneCode, validation: SceneValidate };
const SCENE_ORDER = [SceneRequirements, SceneDesign, SceneCode, SceneValidate];

/* ───────────── icon stepper (no words — hover/tap any step to preview it) ───────────── */

function StepIcons({ steps, shownIdx, liveIdx, allDone, onPeek }) {
  const n = steps.length;
  const fill = allDone ? 100 : n > 1 ? (liveIdx / (n - 1)) * 100 : 0;
  return (
    <div className="relative w-full max-w-[300px]">
      <div className="absolute left-[12.5%] right-[12.5%] top-5 h-px bg-white/10" aria-hidden="true">
        <motion.div className="h-full bg-[var(--s-hi)]" initial={false} animate={{ width: `${fill}%` }} transition={{ duration: 0.7, ease: 'easeOut' }} />
      </div>
      <div className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => {
          const Icon = STEP_META[s.id]?.icon || FileText;
          const isShown = i === shownIdx;
          const tone = s.state === 'done'
            ? 'border-transparent bg-[var(--s-text)] text-[#050505]'
            : s.state === 'active'
              ? 'border-[var(--s-hi)] bg-[var(--s-bg)] text-[var(--s-hi)]'
              : 'border-white/15 bg-[var(--s-bg)] text-[var(--s-faint)] group-hover:text-[var(--s-muted)]';
          return (
            <button key={s.id} type="button" onClick={() => onPeek(i === liveIdx ? null : i)} aria-pressed={isShown} aria-label={s.label} title={s.label} className="group flex justify-center">
              <span className="relative flex h-10 w-10 items-center justify-center">
                {s.state === 'active' && <span className="absolute inset-0 animate-ping rounded-full border border-[var(--s-hi)]/50" />}
                <motion.span
                  animate={{ scale: isShown ? 1.1 : 1 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  className={`relative flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${tone} ${isShown && s.state !== 'done' ? 'ring-1 ring-white/25' : ''}`}
                >
                  {s.state === 'done'
                    ? <motion.span key="d" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 18 }}><Check className="h-4 w-4" strokeWidth={3} /></motion.span>
                    : <Icon className="h-[17px] w-[17px]" strokeWidth={1.8} />}
                </motion.span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BackToLive({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="rounded-full border border-[var(--s-line)] px-3 py-0.5 text-[11px] font-medium text-[var(--s-muted)] transition-colors hover:border-[var(--s-line-strong)] hover:text-[var(--s-text)]">
      Back to live
    </button>
  );
}

/* ───────────── generation / debug screen ───────────── */

function FullScreen({ steps, percent, mode }) {
  const reduce = useReducedMotion();
  const rootRef = useRef(null);
  const box = useBox(rootRef);

  const activeIdx = Math.max(0, steps.findIndex((s) => s.state === 'active'));
  const allDone = steps.length > 0 && steps.every((s) => s.state === 'done');
  const liveIdx = allDone ? steps.length - 1 : activeIdx;
  const [peek, setPeek] = useState(null);
  useEffect(() => { setPeek(null); }, [liveIdx]);

  const shownIdx = peek ?? liveIdx;
  const shown = steps[shownIdx] || steps[0];
  const Scene = SCENES[shown?.id] || SCENE_ORDER[shownIdx % SCENE_ORDER.length];
  const label = allDone && peek === null ? 'Almost ready' : STEP_META[shown?.id]?.short || shown?.label;

  // The scene is sized from the space it is given (never a scroll bar, never under the navbar).
  const sceneW = Math.max(240, Math.min(440, (box.h - 200) * (VB_W / VB_H)));

  return (
    <div ref={rootRef} className="sg-dotgrid absolute inset-0 z-20 overflow-hidden bg-[var(--s-bg)]">
      <span className="sr-only" role="status" aria-live="polite">{`${PIPELINE_TITLES[mode] || ''}. Step ${shownIdx + 1} of ${steps.length}: ${shown?.label || ''}`}</span>
      {box.w > 0 && (
        <div className="flex h-full flex-col items-center justify-center gap-5 px-4 py-4">
          <AnimatePresence mode="wait" initial={false}>
            <motion.svg
              key={shown?.id || mode}
              viewBox={`0 0 ${VB_W} ${VB_H}`}
              className="block w-full"
              style={{ maxWidth: Math.min(sceneW, box.w - 32) }}
              initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.28 }}
              role="img" aria-label={shown?.label}
            >
              <Scene reduce={reduce} />
            </motion.svg>
          </AnimatePresence>

          <div className="flex h-8 items-center gap-3">
            <AnimatePresence mode="wait" initial={false}>
              <motion.h2 key={label} className="s-display text-[20px] leading-none" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                {label}
              </motion.h2>
            </AnimatePresence>
            <span className="text-[13px] font-semibold tabular-nums text-[var(--s-hi)]"><AnimatedNumber value={percent} />%</span>
          </div>

          <StepIcons steps={steps} shownIdx={shownIdx} liveIdx={liveIdx} allDone={allDone} onPeek={setPeek} />
          <div className="h-6">{peek !== null && <BackToLive onClick={() => setPeek(null)} />}</div>
        </div>
      )}
    </div>
  );
}

/* ───────────── edit / debug: floating status card with live scene header ───────────── */

function FloatingCard({ steps, percent, mode }) {
  const reduce = useReducedMotion();
  const message = useRotating(MESSAGES[mode] || MESSAGES.edit, 2800);
  const activeIdx = Math.max(0, steps.findIndex((s) => s.state === 'active'));
  const active = steps[activeIdx] || steps[0];
  const title = PIPELINE_TITLES[mode] || PIPELINE_TITLES.edit;
  const Scene = SCENES[active?.id] || SCENE_ORDER[activeIdx % SCENE_ORDER.length];

  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="pointer-events-auto w-full max-w-[420px] overflow-hidden rounded-2xl border border-[var(--s-line-strong)] bg-[var(--s-surface)] shadow-2xl"
      >
        {/* Animated scene preview header for edit / debug */}
        <div className="relative h-[150px] w-full overflow-hidden border-b border-[var(--s-line)] bg-[var(--s-bg)] p-2">
          <AnimatePresence mode="wait" initial={false}>
            <motion.svg
              key={active?.id || mode}
              viewBox={`0 0 ${VB_W} ${VB_H}`}
              className="block h-full w-auto mx-auto"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.25 }}
              role="img"
              aria-label={active?.label || title}
            >
              <Scene reduce={reduce} />
            </motion.svg>
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-3 px-4 py-3">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--s-text)]" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-[var(--s-text)]">{active?.label || title}</div>
            <p className="truncate text-[11.5px] text-[var(--s-muted)]">{active?.detail || message}</p>
          </div>
          <span className="text-[11.5px] tabular-nums text-[var(--s-muted)]">{percent}%</span>
        </div>
        <div className="h-[2px] w-full bg-white/10">
          <motion.div className="h-full bg-[var(--s-text)]" initial={false} animate={{ width: `${Math.max(percent, 4)}%` }} transition={{ type: 'spring', stiffness: 70, damping: 18 }} />
        </div>
      </motion.div>
    </div>
  );
}

export default function GeneratingScreen({ steps, mode = 'generate', percent = 0 }) {
  // 'generate' and 'debug' both trigger the full scene animation view
  return mode === 'generate' || mode === 'debug'
    ? <FullScreen steps={steps} percent={percent} mode={mode} />
    : <FloatingCard steps={steps} percent={percent} mode={mode} />;
}