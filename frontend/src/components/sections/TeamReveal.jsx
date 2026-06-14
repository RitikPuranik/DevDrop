import React, { useRef, useEffect, useState, useMemo } from 'react';
import { motion, useTransform, useSpring } from 'framer-motion';

const TEAM = [
  { initials: 'RS', name: 'Rideema Singh', role: 'Software Developer', img: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800&q=80' },
  { initials: 'AM', name: 'Aryan Mehta', role: 'Creative Director', img: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80' },
  { initials: 'RP', name: 'Ritik Puranik', role: 'Full-Stack Engineer', img: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=800&q=80' },
  { initials: 'PP', name: 'Priyal Patel', role: 'Frontend Developer', img: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=800&q=80' },
  { initials: 'SE', name: 'Sara El-Amin', role: 'Motion Designer', img: 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=800&q=80' },
];

function AccordionGallery() {
  const [hovered, setHovered] = useState(null);

  return (
    <div style={{ display: 'flex', gap: '1.5vw', width: '85%', maxWidth: 1200, height: '55vh', minHeight: 400 }}>
      {TEAM.map((m, i) => {
        const isHovered = hovered === i;
        const isAnyHovered = hovered !== null;
        const flexValue = isHovered ? 6 : (isAnyHovered ? 1 : 1);

        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: flexValue, transition: 'flex 0.6s cubic-bezier(0.16, 1, 0.3, 1)', minWidth: 0 }}>
            {/* The Window Card */}
            <div
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{
                position: 'relative',
                width: '100%',
                flex: 1,
                borderRadius: 24,
                overflow: 'hidden',
                background: '#111',
                cursor: 'pointer',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.03), 0 20px 40px rgba(0,0,0,0.6)',
                marginBottom: 20
              }}
            >
              {/* Image */}
              <img src={m.img} alt={m.name} style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
                opacity: isHovered ? 0.9 : 0, transition: 'opacity 0.6s ease',
                filter: 'sepia(15%) contrast(1.05)',
                transform: isHovered ? 'scale(1)' : 'scale(1.1)'
              }} />

              {/* Initials */}
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: isHovered ? 0 : 1, transition: 'opacity 0.4s ease'
              }}>
                <span style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontSize: 'clamp(24px, 3vw, 50px)', color: '#5a4a3a' }}>
                  {m.initials}
                </span>
              </div>
            </div>

            {/* Name and Role */}
            <div style={{ textAlign: 'center', width: '100%', paddingBottom: '4px' }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(14px, 1.2vw, 20px)', color: '#e8d9b8', marginBottom: 8, whiteSpace: 'nowrap' }}>
                {m.name}
              </div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 'clamp(8px, 0.6vw, 11px)', letterSpacing: '0.15em', color: '#c8903a', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                {m.role}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

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

export function TeamReveal({ sp }) {
  /*
    Scroll map (relative to About.jsx's 1000vh):
    0.60 – 0.65  : section fades in — immediately after gallery ends at 0.62
    0.65 – 0.72  : paper rests, user reads / registers it
    0.72 – 0.88  : tear opens (faster spring: stiffness 55, damping 22)
    0.88+        : group photo fully visible, paper gone
  */

  // Fade in right as the last gallery card finishes
  const sectionOpacity = useTransform(sp, [0.60, 0.655], [0, 1]);

  // Faster, snappier tear spring
  const rawTear = useTransform(sp, [0.72, 0.88], [0, 1]);
  const tearSpring = useSpring(rawTear, { stiffness: 55, damping: 22 });

  // Photo fades in mid-tear — slightly earlier so it's visible sooner
  const photoOpacity = useTransform(rawTear, [0.20, 0.60], [0, 1]);
  const photoScale = useTransform(rawTear, [0.20, 0.75], [1.05, 1]);

  // Labels appear after photo
  const labelOpacity = useTransform(rawTear, [0.55, 0.85], [0, 1]);
  const labelY = useTransform(rawTear, [0.55, 0.85], [22, 0]);

  // Paper fades out sooner so photo isn't blocked long
  const paperOpacity = useTransform(rawTear, [0.75, 0.96], [1, 0]);

  const containerRef = useRef(null);
  const [dims, setDims] = useState({ W: 1440, H: 900 });
  const [paths, setPaths] = useState({ L: '', R: '', T: '' });

  const tearPts = useMemo(() => buildTearPoints(dims.H), [dims.H]);

  useEffect(() => {
    const measure = () => {
      const el = containerRef.current;
      setDims({
        W: el ? el.offsetWidth : window.innerWidth,
        H: el ? el.offsetHeight : window.innerHeight,
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  useEffect(() => {
    const initial = makePaths(0, dims.W, dims.H, tearPts);
    setPaths(initial);
  }, [dims, tearPts]);

  useEffect(() => {
    return tearSpring.on('change', v => {
      setPaths(makePaths(v, dims.W, dims.H, tearPts));
    });
  }, [tearSpring, dims, tearPts]);

  const { W, H } = dims;

  // Background opacity: covers the page the moment gallery fades out, no gap
  const bgOpacity = useTransform(sp, [0.56, 0.60], [0, 1]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, zIndex: 400, overflow: 'hidden' }}
    >
      {/* Always-dark backing — eliminates black flash between gallery and reveal */}
      <motion.div style={{
        position: 'absolute', inset: 0,
        background: '#080704',
        opacity: bgOpacity,
        pointerEvents: 'none',
      }} />

      {/* Content fades in on cue */}
      <motion.div style={{ opacity: sectionOpacity, position: 'absolute', inset: 0 }}>
        {/* ══ INNER CONTENT — Accordion Windows ══ */}
        <motion.div style={{
          position: 'absolute', inset: 0,
          opacity: photoOpacity,
          scale: photoScale,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 0,
          paddingTop: '2vh'
        }}>
          <motion.div style={{ opacity: labelOpacity, y: labelY, textAlign: 'center', marginBottom: 40, width: '80%', maxWidth: 1000 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
              <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, rgba(200,165,90,0.45), transparent)' }} />
              <span style={{
                fontFamily: "'Space Mono',monospace", fontSize: 10, letterSpacing: '0.58em',
                color: '#c8a55a', textTransform: 'uppercase', whiteSpace: 'nowrap'
              }}>
                The People Behind the Work
              </span>
              <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, rgba(200,165,90,0.45), transparent)' }} />
            </div>
            <h2 style={{
              fontFamily: "'IM Fell English',serif", fontStyle: 'italic', fontWeight: 400,
              fontSize: 'clamp(32px, 5vw, 70px)', color: '#f0e6cc', margin: '0',
              lineHeight: 1.05, letterSpacing: '-0.01em'
            }}>
              Driven by <span style={{ color: '#c8903a' }}>Obsession</span>
            </h2>
          </motion.div>

          {/* 5-Member Accordion Windows */}
          <AccordionGallery />
        </motion.div>

        {/* ══ PAPER ══ */}
        <motion.svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: paperOpacity, overflow: 'visible' }}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid slice"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="parchL" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#f8edd8" />
              <stop offset="60%" stopColor="#f2e2c2" />
              <stop offset="100%" stopColor="#e9d6ae" />
            </linearGradient>
            <linearGradient id="parchR" x1="1" y1="0" x2="0" y2="0">
              <stop offset="0%" stopColor="#f8edd8" />
              <stop offset="60%" stopColor="#f2e2c2" />
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

          <path d={paths.T} fill="none" stroke="rgba(0,0,0,0.28)" strokeWidth="14" strokeLinecap="round" />
          <path d={paths.T} fill="none" stroke="rgba(0,0,0,0.14)" strokeWidth="6" strokeLinecap="round" />
          <path d={paths.T} fill="none" stroke="rgba(255,248,228,0.75)" strokeWidth="1.5" strokeLinecap="round" />
        </motion.svg>
      </motion.div>{/* end content fade wrapper */}
    </div>
  );
}

export default TeamReveal;