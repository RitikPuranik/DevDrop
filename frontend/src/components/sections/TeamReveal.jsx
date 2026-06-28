import React, { useRef, useEffect, useState, useMemo } from 'react';
import { motion, useTransform, useSpring } from 'framer-motion';
import ritikImg from '../../assets/people/ritik.jpeg';
import priyalImg from '../../assets/people/priyal.jpeg';
import rideemaImg from '../../assets/people/rideema.jpeg';
import saralImg from '../../assets/people/saral.jpeg';


const TEAM = [
  { title:'Founder', name: 'Ritik Puranik', role: 'Lead Developer', img: ritikImg },
  { name: 'Priyal Patel', role: 'Full-Stack Developer', img: priyalImg },
  { name: 'Rideema Singh', role: 'Software Developer', img: rideemaImg },
  { name: 'Saral Singore', role: 'UI/UX Designer', img: saralImg },
];



function useBreakpoint() {
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 1280 : true
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const update = (e) => setIsDesktop(e.matches);
    update(mq);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isDesktop;
}

/* ── 2×2 GRID CARD ── */
function GridCard({ m, isActive, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        cursor: 'pointer',
        width: '100%',
      }}
    >
      {/* Photo box — intrinsic square via aspect-ratio */}
      <div style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '1 / 1',
        borderRadius: 'clamp(14px, 2.5vw, 22px)',
        overflow: 'hidden',
        background: '#111',
        boxShadow: isActive
          ? 'inset 0 0 0 1px rgba(200,144,58,0.35), 0 16px 36px rgba(0,0,0,0.7)'
          : 'inset 0 0 0 1px rgba(255,255,255,0.03), 0 12px 28px rgba(0,0,0,0.55)',
        transition: 'box-shadow 0.45s ease',
        marginBottom: 'clamp(8px, 1.5vw, 14px)',
      }}>
        <img
          src={m.img}
          alt={m.name}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover',
            opacity: 0.88,
            filter: 'sepia(15%) contrast(1.05)',
          }}
        />

        {/* Name overlay at bottom — always visible */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(to top, rgba(8,7,4,0.85) 0%, transparent 100%)',
          padding: 'clamp(12px, 3vw, 20px)',
          opacity: 1,
        }}>
          <div style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 'clamp(13px, 3vw, 18px)',
            color: '#e8d9b8',
            marginBottom: 3,
          }}>
            {m.name}
          </div>
          <div style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 'clamp(7px, 1.8vw, 10px)',
            letterSpacing: '0.14em',
            color: '#c8903a',
            textTransform: 'uppercase',
          }}>
            {m.role}
          </div>
        </div>
      </div>

      {/* Name + role below card — always hidden since overlay shows it */}
      <div style={{
        textAlign: 'center',
        width: '100%',
        opacity: 0,
        pointerEvents: 'none',
        height: 0,
        overflow: 'hidden',
      }}>
        <div style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 'clamp(12px, 2.8vw, 17px)',
          color: '#e8d9b8',
          marginBottom: 3,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {m.name}
        </div>
        <div style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 'clamp(6px, 1.5vw, 9px)',
          letterSpacing: '0.13em',
          color: '#c8903a',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}>
          {m.role}
        </div>
      </div>
    </div>
  );
}

/* ── ACCORDION GALLERY ── */
function AccordionGallery() {
  const [active, setActive] = useState(null);
  const isDesktop = useBreakpoint();
  const toggle = (i) => setActive(active === i ? null : i);

  /* ── TABLET / PHONE: 2×2 grid, fills available space ── */
  if (!isDesktop) {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        /* gap scales with viewport so grid fills width symmetrically */
        gap: 'clamp(12px, 3vw, 22px)',
        /* take full available width up to a sensible max */
        width: 'min(92%, 720px)',
        /* no fixed height — let cards (aspect-ratio squares) define it */
        alignItems: 'start',
      }}>
        {TEAM.map((m, i) => (
          <GridCard
            key={i}
            m={m}
            isActive={active === i}
            onClick={() => toggle(i)}
          />
        ))}
      </div>
    );
  }

  /* ── DESKTOP: equal-width cards, click to reveal photo, no size change ── */
  return (
    <div style={{
      display: 'flex',
      gap: '1.5vw',
      width: '85%',
      maxWidth: 1200,
      height: '55vh',
      minHeight: 400,
    }}>
      {TEAM.map((m, i) => {
        const isActive = active === i;
        return (
          <div key={i} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            flex: 1,
            minWidth: 0,
          }}>
            <div
              onClick={() => toggle(i)}
              style={{
                position: 'relative',
                width: '100%',
                flex: 1,
                borderRadius: 24,
                overflow: 'hidden',
                background: '#111',
                cursor: 'pointer',
                boxShadow: isActive
                  ? 'inset 0 0 0 1px rgba(200,144,58,0.35), 0 20px 40px rgba(0,0,0,0.6)'
                  : 'inset 0 0 0 1px rgba(255,255,255,0.03), 0 20px 40px rgba(0,0,0,0.6)',
                marginBottom: 20,
                transition: 'box-shadow 0.45s ease',
              }}
            >
              <img src={m.img} alt={m.name} style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'cover',
                opacity: 0.9,
                filter: 'sepia(15%) contrast(1.05)',
              }} />
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: 0,
              }}>
                <span style={{
                  fontFamily: "'Playfair Display', serif",
                  fontStyle: 'italic',
                  fontSize: 'clamp(24px, 3vw, 50px)',
                  color: '#5a4a3a',
                }}>
                  {m.initials}
                </span>
              </div>
            </div>
            <div style={{ textAlign: 'center', width: '100%', paddingBottom: '4px' }}>
              <div style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 'clamp(14px, 1.2vw, 20px)',
                color: '#e8d9b8',
                marginBottom: 8,
                whiteSpace: 'nowrap',
              }}>
                {m.name}
              </div>
              <div style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 'clamp(8px, 0.6vw, 11px)',
                letterSpacing: '0.15em',
                color: '#c8903a',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}>
                {m.role}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── TEAR PATH HELPERS (unchanged) ── */
function buildTearPoints(H, steps = 60) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const y = (i / steps) * H;
    const jag =
      Math.sin(i * 1.7) * 9 +
      Math.sin(i * 4.1) * 4 +
      Math.sin(i * 9.3) * 1.5;
    pts.push({ x: jag, y });
  }
  return pts;
}

function makePaths(progress, W, H, pts) {
  const slide = progress * W * 0.56;
  const cx = W / 2;
  let L = `M${cx + pts[0].x - slide},0 `;
  pts.forEach(p => { L += `L${cx + p.x - slide},${p.y} `; });
  L += `L${-20},${H} L${-20},0 Z`;
  let R = `M${cx + pts[pts.length - 1].x + slide},${H} `;
  [...pts].reverse().forEach(p => { R += `L${cx + p.x + slide},${p.y} `; });
  R += `L${W + 20},0 L${W + 20},${H} Z`;
  let T = `M${cx + pts[0].x},0 `;
  pts.forEach(p => { T += `L${cx + p.x},${p.y} `; });
  return { L, R, T };
}

/* ── TEAM REVEAL ── */
export function TeamReveal({ sp }) {
  const sectionOpacity = useTransform(sp, [0.60, 0.655], [0, 1]);
  const rawTear        = useTransform(sp, [0.72, 0.88], [0, 1]);
  const tearSpring     = useSpring(rawTear, { stiffness: 55, damping: 22 });
  const photoOpacity   = useTransform(rawTear, [0.20, 0.60], [0, 1]);
  const photoScale     = useTransform(rawTear, [0.20, 0.75], [1.05, 1]);
  const labelOpacity   = useTransform(rawTear, [0.55, 0.85], [0, 1]);
  const labelY         = useTransform(rawTear, [0.55, 0.85], [22, 0]);
  const paperOpacity   = useTransform(rawTear, [0.75, 0.96], [1, 0]);
  const bgOpacity      = useTransform(sp, [0.56, 0.60], [0, 1]);

  const containerRef = useRef(null);
  const [dims, setDims]   = useState({ W: 1440, H: 900 });
  const [paths, setPaths] = useState({ L: '', R: '', T: '' });
  const tearPts = useMemo(() => buildTearPoints(dims.H), [dims.H]);

  useEffect(() => {
    const measure = () => {
      const el = containerRef.current;
      setDims({
        W: el ? el.offsetWidth  : window.innerWidth,
        H: el ? el.offsetHeight : window.innerHeight,
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    setPaths(makePaths(0, dims.W, dims.H, tearPts));
  }, [dims, tearPts]);

  useEffect(() => {
    return tearSpring.on('change', v => {
      setPaths(makePaths(v, dims.W, dims.H, tearPts));
    });
  }, [tearSpring, dims, tearPts]);

  const { W, H } = dims;
  const isDesktop = useBreakpoint();

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, zIndex: 400, overflow: 'hidden' }}
    >
      <motion.div style={{
        position: 'absolute', inset: 0,
        background: '#080704',
        opacity: bgOpacity,
        pointerEvents: 'none',
      }} />

      <motion.div style={{ opacity: sectionOpacity, position: 'absolute', inset: 0 }}>

        {/* ══ INNER CONTENT ══ */}
        <motion.div style={{
          position: 'absolute', inset: 0,
          opacity: photoOpacity,
          scale: photoScale,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: isDesktop ? 'flex-start' : 'center',
          boxSizing: 'border-box',
          paddingTop:    isDesktop ? '10vh' : '0',
          paddingBottom: isDesktop ? '0'    : '0',
          paddingLeft: 0,
          paddingRight: 0,
          gap: 0,
          overflow: 'hidden',
        }}>

          {/* Header */}
          <motion.div style={{
            opacity: labelOpacity,
            y: labelY,
            textAlign: 'center',
            /*
              Space between header and grid.
              Slightly tighter on mobile so grid has room.
            */
            marginBottom: isDesktop
              ? 'clamp(20px, 3.5vh, 40px)'
              : 'clamp(20px, 4vh, 36px)',
            width: '88%',
            maxWidth: 1000,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
              <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, rgba(200,165,90,0.45), transparent)' }} />
              <span style={{
                fontFamily: "'Space Mono',monospace",
                fontSize: 'clamp(7px, 1.8vw, 10px)',
                letterSpacing: '0.4em',
                color: '#c8a55a',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}>
                The People Behind the Work
              </span>
              <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, rgba(200,165,90,0.45), transparent)' }} />
            </div>
            <h2 style={{
              fontFamily: "'IM Fell English',serif",
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: 'clamp(26px, 5vw, 70px)',
              color: '#f0e6cc',
              margin: 0,
              lineHeight: 1.05,
              letterSpacing: '-0.01em',
            }}>
              Driven by <span style={{ color: '#c8903a' }}>Obsession</span>
            </h2>
          </motion.div>

          {/* Gallery */}
          <AccordionGallery />

        </motion.div>

        {/* ══ PAPER TEAR SVG ══ */}
        <motion.svg
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            opacity: paperOpacity,
            overflow: 'visible',
            pointerEvents: 'none',
          }}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid slice"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="parchL" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor="#f8edd8" />
              <stop offset="60%"  stopColor="#f2e2c2" />
              <stop offset="100%" stopColor="#e9d6ae" />
            </linearGradient>
            <linearGradient id="parchR" x1="1" y1="0" x2="0" y2="0">
              <stop offset="0%"   stopColor="#f8edd8" />
              <stop offset="60%"  stopColor="#f2e2c2" />
              <stop offset="100%" stopColor="#e9d6ae" />
            </linearGradient>
            <filter id="shadowL" x="-2%" y="-2%" width="120%" height="104%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="28" />
              <feOffset dx="22" dy="0" />
              <feComposite in2="SourceGraphic" operator="out" />
              <feComponentTransfer><feFuncA type="linear" slope="0.60" /></feComponentTransfer>
              <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="shadowR" x="-18%" y="-2%" width="120%" height="104%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="28" />
              <feOffset dx="-22" dy="0" />
              <feComposite in2="SourceGraphic" operator="out" />
              <feComponentTransfer><feFuncA type="linear" slope="0.60" /></feComponentTransfer>
              <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="paperGrain" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
              <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" result="noise" />
              <feColorMatrix type="saturate" values="0" in="noise" result="grey" />
              <feBlend in="SourceGraphic" in2="grey" mode="multiply" result="blend" />
              <feComposite in="blend" in2="SourceGraphic" operator="in" />
            </filter>
          </defs>
          <g filter="url(#shadowL)">
            <path d={paths.L} fill="url(#parchL)" filter="url(#paperGrain)" />
            <path d={paths.L} fill="url(#parchL)" opacity="0.18" />
          </g>
          <g filter="url(#shadowR)">
            <path d={paths.R} fill="url(#parchR)" filter="url(#paperGrain)" />
            <path d={paths.R} fill="url(#parchR)" opacity="0.18" />
          </g>
          <path d={paths.T} fill="none" stroke="rgba(0,0,0,0.28)"      strokeWidth="14" strokeLinecap="round" />
          <path d={paths.T} fill="none" stroke="rgba(0,0,0,0.14)"       strokeWidth="6"  strokeLinecap="round" />

        </motion.svg>

      </motion.div>
    </div>
  );
}

export default TeamReveal;