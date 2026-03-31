import React, { useRef, useEffect, useState, useMemo } from 'react';
import { motion, useTransform, useSpring } from 'framer-motion';

const TEAM = [
  { name: 'Rideema Singh',  role: 'Software Developer',  img: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=500&q=80' },
  { name: 'Aryan Mehta',    role: 'Creative Director',   img: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&q=80' },
  { name: 'Priya Nair',     role: 'Lead Designer',       img: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=500&q=80' },
  { name: 'Dev Kapoor',     role: 'Full-Stack Engineer',  img: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=500&q=80' },
  { name: 'Sara El-Amin',   role: 'Motion Designer',     img: 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=500&q=80' },
  { name: 'Lucas Ferreira', role: 'Brand Strategist',    img: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500&q=80' },
];

/* Smooth tear seam — gentle, not jagged */
function buildTearPoints(H, steps = 60) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const y = (i / steps) * H;
    const jag =
      Math.sin(i * 1.7)  * 9  +
      Math.sin(i * 4.1)  * 4  +
      Math.sin(i * 9.3)  * 1.5;
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

  let R = `M${cx + pts[pts.length-1].x + slide},${H} `;
  [...pts].reverse().forEach(p => { R += `L${cx + p.x + slide},${p.y} `; });
  R += `L${W+20},0 L${W+20},${H} Z`;

  let T = `M${cx + pts[0].x},0 `;
  pts.forEach(p => { T += `L${cx + p.x},${p.y} `; });

  return { L, R, T };
}

export function TeamReveal({ sp }) {
  /* Scroll map:
     0.72–0.76 : section fades in (paper already visible)
     0.76–0.84 : paper rests — user reads it
     0.84–0.97 : buttery tear opens
     0.97+     : group photo fully visible, holds
  */
  const sectionOpacity = useTransform(sp, [0.62, 0.755], [0, 1]);

  // Tear driven by a very soft spring — feels like real paper
  const rawTear    = useTransform(sp, [0.84, 0.97], [0, 1]);
  const tearSpring = useSpring(rawTear, { stiffness: 22, damping: 20 });

  // Photo fades in mid-tear
  const photoOpacity = useTransform(rawTear, [0.30, 0.72], [0, 1]);
  const photoScale   = useTransform(rawTear, [0.30, 0.80], [1.05, 1]);

  // Labels appear after photo
  const labelOpacity = useTransform(rawTear, [0.62, 0.90], [0, 1]);
  const labelY       = useTransform(rawTear, [0.62, 0.90], [22, 0]);

  // Paper fades completely out at the end
  const paperOpacity = useTransform(rawTear, [0.82, 0.99], [1, 0]);

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

  // Update SVG paths on every spring tick
  useEffect(() => {
    return tearSpring.on('change', v => {
      setPaths(makePaths(v, dims.W, dims.H, tearPts));
    });
  }, [tearSpring, dims, tearPts]);

  const { W, H } = dims;

  return (
    <motion.div
      ref={containerRef}
      style={{
        opacity: sectionOpacity,
        position: 'absolute', inset: 0, zIndex: 400,
        background: '#080704',
        overflow: 'hidden',
      }}
    >

      {/* ══ GROUP PHOTO — revealed behind paper ══ */}
      <motion.div style={{
        position: 'absolute', inset: 0,
        opacity: photoOpacity,
        scale: photoScale,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 0,
      }}>
        {/* Full-bleed group photo */}
        <div style={{
          width: '74%', maxWidth: 860,
          height: '46vh', minHeight: 280,
          position: 'relative', borderRadius: 4,
          overflow: 'hidden',
          boxShadow: '0 0 0 1px rgba(200,165,90,0.12), 0 40px 100px rgba(0,0,0,0.85)',
        }}>
          <img
            src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1400&q=90"
            alt="The Team"
            style={{
              width: '100%', height: '100%',
              objectFit: 'cover', objectPosition: 'center 28%',
              filter: 'sepia(15%) contrast(1.05) brightness(0.84) saturate(0.9)',
            }}
          />
          {/* Subtle vignette */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to bottom, rgba(8,7,4,0.48) 0%, transparent 28%, transparent 65%, rgba(8,7,4,0.70) 100%)',
          }} />
          {/* Corner stamps */}
          <div style={{ position:'absolute', top:14, left:16,
            borderLeft:'1px solid rgba(200,165,90,0.32)', borderTop:'1px solid rgba(200,165,90,0.32)', padding:'5px 10px' }}>
            <div style={{ fontFamily:"'Space Mono',monospace", fontSize:7.5, letterSpacing:'0.55em', color:'#c8a55a' }}>EST. MMXXVI</div>
          </div>
          <div style={{ position:'absolute', bottom:12, right:14,
            borderRight:'1px solid rgba(200,165,90,0.32)', borderBottom:'1px solid rgba(200,165,90,0.32)', padding:'5px 10px', textAlign:'right' }}>
            <div style={{ fontFamily:"'Space Mono',monospace", fontSize:7.5, letterSpacing:'0.48em', color:'#c8a55a' }}>06 MEMBERS</div>
          </div>
        </div>

        {/* Eyebrow + headline */}
        <motion.div style={{ opacity: labelOpacity, y: labelY, textAlign: 'center', marginTop: 26, width: '74%', maxWidth: 860 }}>
          <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:14 }}>
            <div style={{ flex:1, height:'1px', background:'linear-gradient(to left, rgba(200,165,90,0.45), transparent)' }} />
            <span style={{ fontFamily:"'Space Mono',monospace", fontSize:8, letterSpacing:'0.58em',
              color:'#c8a55a', textTransform:'uppercase', whiteSpace:'nowrap' }}>
              The People Behind the Work
            </span>
            <div style={{ flex:1, height:'1px', background:'linear-gradient(to right, rgba(200,165,90,0.45), transparent)' }} />
          </div>
          <h2 style={{ fontFamily:"'IM Fell English',serif", fontStyle:'italic', fontWeight:400,
            fontSize:'clamp(24px, 3.4vw, 50px)', color:'#f0e6cc', margin:'0 0 22px',
            lineHeight:1.05, letterSpacing:'-0.01em' }}>
            Driven by <span style={{ color:'#c8903a' }}>Obsession</span>
          </h2>

          {/* 6-member pills — 3 per row */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px 14px' }}>
            {TEAM.map((m, i) => (
              <motion.div key={i}
                initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
                transition={{ delay: i * 0.06 + 0.1, duration: 0.5, ease:[0.22,1,0.36,1] }}
                style={{ display:'flex', alignItems:'center', gap:10,
                  padding:'8px 12px 8px 9px',
                  border:'1px solid rgba(200,165,90,0.13)', borderRadius:2,
                  background:'rgba(200,165,90,0.035)' }}>
                <img src={m.img} alt={m.name} style={{
                  width:30, height:30, borderRadius:'50%', objectFit:'cover', flexShrink:0,
                  filter:'sepia(20%) contrast(1.04)', border:'1px solid rgba(200,165,90,0.26)' }} />
                <div style={{ minWidth:0 }}>
                  <div style={{ fontFamily:"'IM Fell English',serif", fontStyle:'italic',
                    fontSize:13, color:'#e8d9b8', lineHeight:1.1,
                    whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.name}</div>
                  <div style={{ fontFamily:"'Space Mono',monospace", fontSize:6.5, color:'#9a7c4a',
                    letterSpacing:'0.34em', marginTop:2, textTransform:'uppercase',
                    whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.role}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </motion.div>

      {/* ══ PAPER — clean, no lines, no text, pure parchment ══ */}
      <motion.svg
        style={{ position:'absolute', inset:0, width:'100%', height:'100%', opacity:paperOpacity, overflow:'visible' }}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Identical parchment — both halves use same gradient */}
          <linearGradient id="parchL" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#f8edd8" />
            <stop offset="60%"  stopColor="#f2e2c2" />
            <stop offset="100%" stopColor="#e9d6ae" />
          </linearGradient>
          {/* Right half: same stops, mirrored direction */}
          <linearGradient id="parchR" x1="1" y1="0" x2="0" y2="0">
            <stop offset="0%"   stopColor="#f8edd8" />
            <stop offset="60%"  stopColor="#f2e2c2" />
            <stop offset="100%" stopColor="#e9d6ae" />
          </linearGradient>

          {/* Matching shadows — same blur, inward toward seam */}
          <filter id="shadowL" x="-2%" y="-2%" width="120%" height="104%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="28" />
            <feOffset dx="22" dy="0" />
            <feComposite in2="SourceGraphic" operator="out" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.60" />
            </feComponentTransfer>
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="shadowR" x="-18%" y="-2%" width="120%" height="104%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="28" />
            <feOffset dx="-22" dy="0" />
            <feComposite in2="SourceGraphic" operator="out" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.60" />
            </feComponentTransfer>
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>

          {/* Very subtle paper noise — just enough to feel physical */}
          <filter id="paperGrain" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" result="noise"/>
            <feColorMatrix type="saturate" values="0" in="noise" result="grey"/>
            <feBlend in="SourceGraphic" in2="grey" mode="multiply" result="blend"/>
            <feComposite in="blend" in2="SourceGraphic" operator="in"/>
          </filter>
        </defs>

        {/* LEFT */}
        <g filter="url(#shadowL)">
          <path d={paths.L} fill="url(#parchL)" filter="url(#paperGrain)" />
          {/* Subtle warm overlay near tear edge for depth */}
          <path d={paths.L} fill="url(#parchL)" opacity="0.18" />
        </g>

        {/* RIGHT — same gradient mirrored, same shadow mirrored */}
        <g filter="url(#shadowR)">
          <path d={paths.R} fill="url(#parchR)" filter="url(#paperGrain)" />
          <path d={paths.R} fill="url(#parchR)" opacity="0.18" />
        </g>

        {/* Seam — soft, blended, no harsh lines */}
        {/* Deep shadow at the fold */}
        <path d={paths.T} fill="none" stroke="rgba(0,0,0,0.28)" strokeWidth="14" strokeLinecap="round" />
        {/* Mid shadow */}
        <path d={paths.T} fill="none" stroke="rgba(0,0,0,0.14)" strokeWidth="6" strokeLinecap="round" />
        {/* Bright highlight — the torn paper edge catching light */}
        <path d={paths.T} fill="none" stroke="rgba(255,248,228,0.75)" strokeWidth="1.5" strokeLinecap="round" />

      </motion.svg>

    </motion.div>
  );
}

export default TeamReveal;