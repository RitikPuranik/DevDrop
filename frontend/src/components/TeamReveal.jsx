import React, { useRef, useEffect, useState, useMemo } from 'react';
import { motion, useTransform, useSpring } from 'framer-motion';

/*
  TEAM REVEAL v3 — Paper Tear on Scroll
  ─────────────────────────────────────
  DROP-IN for About.jsx STAGE 3 block.

  In About.jsx:
    1. import { TeamReveal } from './TeamReveal';
    2. Change height to '1800vh' so the pause feels long enough
    3. Delete the old STAGE 3 motion.div block
    4. Replace with: <TeamReveal sp={sp} />
*/

const TEAM = [
  { name: 'Rideema Singh', role: 'Software Developer', img: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&q=80' },
  { name: 'Co-Founder',    role: 'Creative Director',  img: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80' },
  { name: 'Lead Designer', role: 'Visual Design',      img: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&q=80' },
  { name: 'Dev Engineer',  role: 'Full-Stack',         img: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&q=80' },
];

/* ─── Deterministic jagged tear seam ─── */
function buildTearPoints(H, steps = 36) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = t * H;
    const jag =
      Math.sin(i * 2.3)  * 7.0 +
      Math.sin(i * 5.7)  * 3.5 +
      Math.sin(i * 11.3) * 1.5;
    pts.push({ x: jag, y });
  }
  return pts;
}

function makePaths(progress, W, H, pts) {
  const slideL = progress * W * 0.62;
  const slideR = progress * W * 0.62;
  const cx     = W / 2;

  // LEFT half: left-edge → tear seam → back to left-edge
  let L = `M${-slideL},0 `;
  pts.forEach(p => { L += `L${cx + p.x - slideL},${p.y} `; });
  L += `L${-slideL},${H} Z`;

  // RIGHT half: right-edge → tear seam (reversed) → back to right-edge
  let R = `M${W + slideR},0 `;
  [...pts].reverse().forEach(p => { R += `L${cx + p.x + slideR},${p.y} `; });
  R += `L${W + slideR},${H} Z`;

  // Seam highlight line (no translation, stays centred)
  let T = `M${cx + pts[0].x},0 `;
  pts.forEach(p => { T += `L${cx + p.x},${p.y} `; });

  return { L, R, T };
}

/* ─── Paper texture fibres ─── */
const FL = [ // [x1%, y1%, x2%, y2%]
  [0.0, 0.09, 0.49, 0.095], [0.02, 0.19, 0.50, 0.187],
  [0.0, 0.29, 0.49, 0.288], [0.01, 0.39, 0.50, 0.393],
  [0.0, 0.49, 0.49, 0.487], [0.02, 0.59, 0.50, 0.588],
  [0.0, 0.69, 0.49, 0.693], [0.01, 0.79, 0.50, 0.787],
  [0.0, 0.89, 0.49, 0.893],
];
const FR = [
  [0.51, 0.07, 1.0,  0.075], [0.50, 0.17, 0.99, 0.172],
  [0.51, 0.27, 1.0,  0.268], [0.50, 0.37, 0.99, 0.373],
  [0.51, 0.47, 1.0,  0.468], [0.50, 0.57, 0.99, 0.572],
  [0.51, 0.67, 1.0,  0.668], [0.50, 0.77, 0.99, 0.772],
  [0.51, 0.87, 1.0,  0.873],
];

/* ─── Flying scrap word ─── */
function Scrap({ word, x, y, dx, dy, rot }) {
  return (
    <motion.span
      initial={{ opacity: 0.85, x: 0, y: 0, rotate: 0, scale: 1 }}
      animate={{ opacity: 0, x: dx, y: dy, rotate: rot, scale: 0.65 }}
      transition={{ duration: 1.4, ease: [0.1, 0, 0.85, 1] }}
      style={{
        position: 'absolute', left: x, top: y,
        pointerEvents: 'none',
        fontFamily: "'IM Fell English', serif",
        fontStyle: 'italic', fontSize: 11,
        color: '#7a5830', letterSpacing: '0.1em',
        whiteSpace: 'nowrap', zIndex: 520,
      }}
    >
      {word}
    </motion.span>
  );
}

export function TeamReveal({ sp }) {
  /*
    Scroll choreography (sp = spring-smoothed scrollYProgress):

      0.86 → 0.90  : section fades in, paper fully covers screen
      0.90 → 0.94  : PAUSE — paper sits still (user reads / notices it)
      0.94 → 0.992 : paper tears open
      0.992        : team fully revealed, paper gone
  */

  const sectionOpacity = useTransform(sp, [0.84, 0.89], [0, 1]);
  const rawTear        = useTransform(sp, [0.94, 0.992], [0, 1]);
  const tearSpring     = useSpring(rawTear, { stiffness: 28, damping: 22 });

  const photoOpacity   = useTransform(rawTear, [0.28, 0.62], [0, 1]);
  const photoScale     = useTransform(rawTear, [0.28, 0.70], [1.07, 1]);
  const labelOpacity   = useTransform(rawTear, [0.58, 0.88], [0, 1]);
  const labelY         = useTransform(rawTear, [0.58, 0.88], [30, 0]);
  const paperOpacity   = useTransform(rawTear, [0.80, 0.99], [1, 0]);

  const containerRef   = useRef(null);
  const [dims, setDims]    = useState({ W: 1440, H: 800 });
  const [paths, setPaths]  = useState({ L: '', R: '', T: '' });
  const [scraps, setScraps] = useState([]);
  const scrapsSpawned = useRef(false);

  const tearPts = useMemo(() => buildTearPoints(dims.H), [dims.H]);

  // Measure container
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

  // Drive SVG paths from spring value
  useEffect(() => {
    return tearSpring.on('change', v => {
      setPaths(makePaths(v, dims.W, dims.H, tearPts));
    });
  }, [tearSpring, dims, tearPts]);

  // Spawn word scraps once at ~28% tear
  useEffect(() => {
    return rawTear.on('change', v => {
      if (v > 0.28 && !scrapsSpawned.current) {
        scrapsSpawned.current = true;
        const words = ['craft', 'vision', 'est. 2026', 'identity', 'motion', 'the studio', 'obsession', 'no shortcuts', 'memory'];
        const cx = dims.W / 2;
        setScraps(words.map((word, i) => ({
          id: i, word,
          x: cx + (Math.random() - 0.5) * 130,
          y: dims.H * 0.15 + Math.random() * dims.H * 0.65,
          dx: (Math.random() - 0.5) * 430,
          dy: -(60 + Math.random() * 230),
          rot: (Math.random() - 0.5) * 68,
        })));
        setTimeout(() => setScraps([]), 1700);
      }
    });
  }, [rawTear, dims]);

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

      {/* ══ TEAM PHOTO (behind paper) ══ */}
      <motion.div style={{
        position: 'absolute', inset: 0,
        opacity: photoOpacity, scale: photoScale,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>

        {/* photo frame */}
        <div style={{
          width: '76%', maxWidth: 860,
          height: '50vh', minHeight: 300,
          position: 'relative', borderRadius: 2,
          overflow: 'hidden',
          boxShadow: '0 0 0 1px rgba(200,165,90,0.1), 0 0 0 7px rgba(200,165,90,0.04)',
        }}>
          <img
            src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1400&q=90"
            alt="The whole team"
            style={{
              width: '100%', height: '100%',
              objectFit: 'cover', objectPosition: 'center 25%',
              filter: 'sepia(22%) contrast(1.08) brightness(0.85) saturate(0.9)',
            }}
          />
          {/* vignette */}
          <div style={{
            position: 'absolute', inset: 0,
            background:
              'linear-gradient(to bottom, rgba(7,6,4,0.52) 0%, rgba(7,6,4,0) 32%, rgba(7,6,4,0) 62%, rgba(7,6,4,0.68) 100%)',
          }} />
          {/* top-left stamp */}
          <div style={{
            position: 'absolute', top: 16, left: 18,
            borderLeft: '1px solid rgba(200,165,90,0.38)',
            borderTop:  '1px solid rgba(200,165,90,0.38)',
            padding: '6px 11px',
          }}>
            <div style={{ fontFamily:"'Space Mono',monospace", fontSize:8, letterSpacing:'0.5em', color:'#c8a55a' }}>
              EST. MMXXVI
            </div>
          </div>
          {/* bottom-right count */}
          <div style={{
            position: 'absolute', bottom: 14, right: 16,
            borderRight:  '1px solid rgba(200,165,90,0.38)',
            borderBottom: '1px solid rgba(200,165,90,0.38)',
            padding: '6px 11px', textAlign: 'right',
          }}>
            <div style={{ fontFamily:"'Space Mono',monospace", fontSize:8, letterSpacing:'0.45em', color:'#c8a55a' }}>
              {String(TEAM.length).padStart(2,'0')} MEMBERS
            </div>
          </div>
        </div>

        {/* label + pills */}
        <motion.div style={{
          y: labelY, opacity: labelOpacity,
          textAlign: 'center', marginTop: 30,
          width: '76%', maxWidth: 860,
        }}>
          {/* eyebrow */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:14, marginBottom:13 }}>
            <div style={{ flex:1, height:1, background:'linear-gradient(to left, rgba(200,165,90,0.45), transparent)' }} />
            <span style={{ fontFamily:"'Space Mono',monospace", fontSize:8, letterSpacing:'0.6em', color:'#c8a55a', textTransform:'uppercase', whiteSpace:'nowrap' }}>
              The People Behind the Work
            </span>
            <div style={{ flex:1, height:1, background:'linear-gradient(to right, rgba(200,165,90,0.45), transparent)' }} />
          </div>

          {/* headline */}
          <h2 style={{
            fontFamily:"'IM Fell English',serif", fontStyle:'italic', fontWeight:400,
            fontSize:'clamp(24px, 3.6vw, 50px)',
            color:'#f0e6cc', margin:0, lineHeight:1.05, letterSpacing:'-0.01em',
          }}>
            Driven by{' '}
            <span style={{ color:'#c8903a' }}>Obsession</span>
          </h2>

          {/* member pills */}
          <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap', marginTop:22 }}>
            {TEAM.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity:0, y:10 }}
                animate={{ opacity:1, y:0 }}
                transition={{ delay:0.09*i + 0.22, duration:0.55, ease:[0.22,1,0.36,1] }}
                style={{
                  display:'flex', alignItems:'center', gap:9,
                  padding:'7px 14px 7px 8px',
                  border:'1px solid rgba(200,165,90,0.16)',
                  borderRadius:1,
                  background:'rgba(200,165,90,0.04)',
                }}
              >
                <img src={m.img} alt={m.name} style={{
                  width:28, height:28, borderRadius:'50%',
                  objectFit:'cover',
                  filter:'sepia(25%) contrast(1.05)',
                  border:'1px solid rgba(200,165,90,0.28)',
                }} />
                <div style={{ textAlign:'left' }}>
                  <div style={{ fontFamily:"'IM Fell English',serif", fontStyle:'italic', fontSize:13, color:'#e8d9b8', lineHeight:1.1 }}>{m.name}</div>
                  <div style={{ fontFamily:"'Space Mono',monospace", fontSize:7.5, color:'#9a7c4a', letterSpacing:'0.38em', marginTop:2, textTransform:'uppercase' }}>{m.role}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

      </motion.div>

      {/* ══ PAPER SVG ══ */}
      <motion.svg
        style={{ position:'absolute', inset:0, width:'100%', height:'100%', opacity:paperOpacity, overflow:'visible' }}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="shL" x="-5%" y="-5%" width="120%" height="110%">
            <feDropShadow dx="16" dy="0" stdDeviation="22" floodColor="#000000" floodOpacity="0.6" />
          </filter>
          <filter id="shR" x="-15%" y="-5%" width="120%" height="110%">
            <feDropShadow dx="-16" dy="0" stdDeviation="22" floodColor="#000000" floodOpacity="0.6" />
          </filter>
          <linearGradient id="pL" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#f9eedd" />
            <stop offset="80%"  stopColor="#f1e3ca" />
            <stop offset="100%" stopColor="#e8d8b8" />
          </linearGradient>
          <linearGradient id="pR" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#ecdfc5" />
            <stop offset="25%"  stopColor="#f3e8d0" />
            <stop offset="100%" stopColor="#f8eddc" />
          </linearGradient>
        </defs>

        {/* LEFT HALF */}
        <g filter="url(#shL)">
          <path d={paths.L} fill="url(#pL)" />

          {/* fibres */}
          {FL.map(([x1r,y1r,x2r,y2r],i) => (
            <line key={`fl${i}`} x1={x1r*W} y1={y1r*H} x2={x2r*W} y2={y2r*H}
              stroke="#b8902a" strokeOpacity="0.1" strokeWidth="0.5" />
          ))}
          {[0.10,0.22,0.35].map((xr,i) => (
            <line key={`fvl${i}`} x1={xr*W} y1={0} x2={xr*W+1.5} y2={H}
              stroke="#b8902a" strokeOpacity="0.07" strokeWidth="0.4" />
          ))}

          {/* stain spots */}
          {[[0.07,0.13],[0.28,0.34],[0.14,0.61],[0.39,0.77],[0.21,0.90]].map(([xr,yr],i) => (
            <ellipse key={`sl${i}`} cx={xr*W} cy={yr*H} rx={3+i*1.5} ry={2+i}
              fill="#b8902a" fillOpacity="0.05" />
          ))}

          {/* ghost text */}
          <text x={W*0.045} y={H*0.08} fontFamily="'IM Fell English',serif" fontStyle="italic"
            fontSize={12} fill="#7a5a28" fillOpacity={0.4} letterSpacing="0.25">The Studio</text>
          <text x={W*0.045} y={H*0.185} fontFamily="'IM Fell English',serif"
            fontSize={8.5} fill="#7a5a28" fillOpacity={0.2} letterSpacing="1.1">FOUNDED IN TWO THOUSAND</text>
          <text x={W*0.045} y={H*0.21} fontFamily="'IM Fell English',serif"
            fontSize={8.5} fill="#7a5a28" fillOpacity={0.2} letterSpacing="1.1">AND TWENTY SIX</text>
          <text x={W*0.045} y={H*0.38} fontFamily="'IM Fell English',serif" fontStyle="italic"
            fontSize={Math.min(W*0.042,34)} fill="#6a4820" fillOpacity={0.07} letterSpacing="-0.5">
            Rideema Singh
          </text>
          <text x={W*0.045} y={H*0.56} fontFamily="'IM Fell English',serif"
            fontSize={8} fill="#7a5a28" fillOpacity={0.15} letterSpacing="0.9">CRAFT · VISION · EXCELLENCE</text>
          <text x={W*0.045} y={H*0.72} fontFamily="'IM Fell English',serif" fontStyle="italic"
            fontSize={10} fill="#7a5a28" fillOpacity={0.18}>A digital artifact worth remembering.</text>

          {/* ruled lines */}
          {[0.30,0.335,0.37,0.405,0.44,0.475,0.51,0.545].map((yr,i) => (
            <line key={`rl${i}`} x1={W*0.045} y1={yr*H} x2={W*0.485} y2={yr*H}
              stroke="#b8902a" strokeOpacity="0.1" strokeWidth="0.5" />
          ))}

          {/* margin rules */}
          <line x1={W*0.04} y1={0} x2={W*0.04} y2={H} stroke="#c8902a" strokeOpacity="0.2" strokeWidth="0.9"/>
          <line x1={W*0.046} y1={0} x2={W*0.046} y2={H} stroke="#c8902a" strokeOpacity="0.08" strokeWidth="0.4"/>

          {/* tear highlight */}
          <path d={paths.T} fill="none" stroke="#fff8e8" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.75"/>
          {/* inner shadow on tear */}
          <path d={paths.T} fill="none" stroke="#000" strokeWidth="5" strokeLinecap="round" strokeOpacity="0.15"
            transform="translate(4,0)"/>
        </g>

        {/* RIGHT HALF */}
        <g filter="url(#shR)">
          <path d={paths.R} fill="url(#pR)" />

          {/* fibres */}
          {FR.map(([x1r,y1r,x2r,y2r],i) => (
            <line key={`fr${i}`} x1={x1r*W} y1={y1r*H} x2={x2r*W} y2={y2r*H}
              stroke="#b8902a" strokeOpacity="0.1" strokeWidth="0.5" />
          ))}
          {[0.63,0.75,0.88].map((xr,i) => (
            <line key={`fvr${i}`} x1={xr*W} y1={0} x2={xr*W+1.5} y2={H}
              stroke="#b8902a" strokeOpacity="0.07" strokeWidth="0.4" />
          ))}

          {/* stain spots */}
          {[[0.57,0.11],[0.71,0.29],[0.84,0.51],[0.59,0.68],[0.77,0.84]].map(([xr,yr],i) => (
            <ellipse key={`sr${i}`} cx={xr*W} cy={yr*H} rx={3+i*1.2} ry={2+i*0.8}
              fill="#b8902a" fillOpacity="0.05" />
          ))}

          {/* ghost text */}
          <text x={W*0.53} y={H*0.08} fontFamily="'IM Fell English',serif" fontStyle="italic"
            fontSize={12} fill="#7a5a28" fillOpacity={0.4} letterSpacing="0.25">Est. MMXXVI</text>
          <text x={W*0.53} y={H*0.36} fontFamily="'IM Fell English',serif" fontStyle="italic"
            fontSize={Math.min(W*0.035,28)} fill="#6a4820" fillOpacity={0.07} letterSpacing="-0.3">
            Co-Founder
          </text>
          <text x={W*0.53} y={H*0.56} fontFamily="'IM Fell English',serif"
            fontSize={8} fill="#7a5a28" fillOpacity={0.15} letterSpacing="0.9">IDENTITY · MOTION · BRAND</text>
          <text x={W*0.53} y={H*0.72} fontFamily="'IM Fell English',serif" fontStyle="italic"
            fontSize={10} fill="#7a5a28" fillOpacity={0.18}>No templates, no shortcuts.</text>

          {/* ruled lines */}
          {[0.30,0.335,0.37,0.405,0.44,0.475,0.51,0.545].map((yr,i) => (
            <line key={`rr${i}`} x1={W*0.515} y1={yr*H} x2={W*0.955} y2={yr*H}
              stroke="#b8902a" strokeOpacity="0.1" strokeWidth="0.5" />
          ))}

          {/* margin rules */}
          <line x1={W*0.96} y1={0} x2={W*0.96} y2={H} stroke="#c8902a" strokeOpacity="0.2" strokeWidth="0.9"/>
          <line x1={W*0.954} y1={0} x2={W*0.954} y2={H} stroke="#c8902a" strokeOpacity="0.08" strokeWidth="0.4"/>

          {/* inner shadow on tear */}
          <path d={paths.T} fill="none" stroke="#000" strokeWidth="5" strokeLinecap="round" strokeOpacity="0.15"
            transform="translate(-4,0)"/>
        </g>

      </motion.svg>

      {/* ══ FLYING SCRAPS ══ */}
      <div style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:520 }}>
        {scraps.map(s => <Scrap key={s.id} {...s} />)}
      </div>

    </motion.div>
  );
}
export default TeamReveal;