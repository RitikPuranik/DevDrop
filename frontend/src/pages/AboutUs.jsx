import React, { useState } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';

/* ═══════════════════════════════════════════
   ABOUT — CINEMATIC SCROLL STORY  v2
   No progress dots · Fully blended stages
   Requires: framer-motion, Google Fonts:
   Playfair Display + Space Mono
═══════════════════════════════════════════ */

const PHOTOS = [
  { src: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600', top: '7%',  left: '5%',  w: 170, h: 210, r: '-5deg'  },
  { src: 'https://images.unsplash.com/photo-1635776062127-d379bfcba9f8?w=600', top: '9%',  left: '64%', w: 180, h: 225, r: '3.5deg' },
  { src: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600', top: '57%', left: '7%',  w: 195, h: 155, r: '-2.5deg' },
  { src: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600', top: '54%', left: '68%', w: 155, h: 200, r: '5deg'   },
  { src: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600', top: '32%', left: '39%', w: 145, h: 178, r: '-1.5deg' },
];

const BOGIES = [
  {
    num: '01', label: 'Vision', accent: '#f97316',
    head: ['Where', "We're", 'Going'],
    body: "A digital landscape where brands don't just exist — they linger in memory. Every pixel deliberate, every interaction felt.",
  },
  {
    num: '02', label: 'Mission', accent: '#a78bfa',
    head: ['Why', 'We', 'Build'],
    body: 'To craft digital artifacts so refined they become cultural touchpoints — not just products, but pieces of the internet worth remembering.',
  },
  {
    num: '03', label: 'Craft', accent: '#34d399',
    head: ['How', 'We', 'Work'],
    body: 'Boutique methodology. No templates, no shortcuts. Each project receives the undivided obsession of our two-person studio.',
  },
  {
    num: '04', label: 'Services', accent: '#fb923c',
    head: ['What', 'We', 'Deliver'],
    body: 'Web platforms · Brand identity · Motion design · Digital strategy. Full-spectrum creative engineering for excellence.',
  },
];

/* ═══════════════════════════════════════════
   ROOT COMPONENT
═══════════════════════════════════════════ */
export default function About() {
  const containerRef = React.useRef(null);
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start start', 'end end'] });
  const smooth = useSpring(scrollYProgress, { stiffness: 38, damping: 17 });

  // Stage 1 — photos scale away
  const photoOpacity = useTransform(smooth, [0, 0.2],  [1, 0]);
  const photoScale   = useTransform(smooth, [0, 0.22], [1, 2.6]);

  // Stage 2 — hero pops in then fades
  const heroOpacity  = useTransform(smooth, [0.04, 0.14, 0.22, 0.3], [0, 1, 1, 0]);
  const heroScale    = useTransform(smooth, [0.04, 0.14, 0.22, 0.3], [0.75, 1, 1, 1.08]);

  // Stage 3 — train rolls right → left
  const trainOpacity = useTransform(smooth, [0.28, 0.38], [0, 1]);
  const trainX       = useTransform(smooth, [0.32, 0.82], ['100vw', '-200vw']);

  // Stage 4 — team slides up
  const teamOpacity  = useTransform(smooth, [0.84, 0.94], [0, 1]);
  const teamY        = useTransform(smooth, [0.84, 0.96], ['60px', '0px']);

  // Scroll hint fades quickly
  const hintOpacity  = useTransform(smooth, [0, 0.08], [1, 0]);

  return (
    <div
      ref={containerRef}
      style={{
        height: '750vh',
        background: '#080808',
        color: '#e8e2d6',
        fontFamily: "'Space Mono', monospace",
        position: 'relative',
      }}
    >
      {/* ── STICKY CANVAS ── */}
      <div style={{
        position: 'sticky', top: 0, height: '100vh',
        overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>

        {/* GRAIN OVERLAY */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 200, pointerEvents: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '200px 200px', opacity: 0.028, mixBlendMode: 'overlay',
        }} />

        {/* VIGNETTE */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 150, pointerEvents: 'none',
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,.75) 100%)',
        }} />

        {/* ══ STAGE 1 — FLOATING PHOTOS ══ */}
        <motion.div style={{ opacity: photoOpacity, scale: photoScale, position: 'absolute', inset: 0, zIndex: 10 }}>
          {PHOTOS.map((p, i) => (
            <motion.div key={i} style={{
              position: 'absolute', top: p.top, left: p.left,
              width: p.w, height: p.h, borderRadius: 20, overflow: 'hidden',
              transform: `rotate(${p.r})`,
              boxShadow: '0 12px 60px rgba(0,0,0,.8)',
            }}>
              <img src={p.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(55%) contrast(1.08) brightness(.9)', display: 'block' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 40%,rgba(0,0,0,.55) 100%)' }} />
            </motion.div>
          ))}
        </motion.div>

        {/* ══ STAGE 2 — HERO HEADLINE ══ */}
        <motion.div style={{
          opacity: heroOpacity, scale: heroScale,
          position: 'absolute', zIndex: 20,
          display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
          pointerEvents: 'none',
        }}>
          <h1 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: 'italic',
            fontSize: 'clamp(80px, 16vw, 160px)',
            lineHeight: 0.82,
            letterSpacing: '-.045em',
            color: '#e8e2d6',
          }}>
            Since <span style={{ color: '#f97316' }}>'26</span>
          </h1>
          <p style={{ fontSize: 9, letterSpacing: '.55em', textTransform: 'uppercase', color: 'rgba(232,226,214,.28)', marginTop: 28 }}>
            Scroll to discover
          </p>
        </motion.div>

        {/* ══ STAGE 3 — LOCOMOTIVE TRAIN ══ */}
        <motion.div style={{ opacity: trainOpacity, position: 'absolute', inset: 0, zIndex: 30 }}>
          {/* Rail tracks */}
          <div style={{ position: 'absolute', bottom: 'calc(32% - 2px)', left: 0, right: 0, pointerEvents: 'none' }}>
            <div style={{ width: '100%', height: 2, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.07) 15%,rgba(255,255,255,.07) 85%,transparent)' }} />
            <div style={{ width: '100%', height: 2, marginTop: 9, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.07) 15%,rgba(255,255,255,.07) 85%,transparent)' }} />
          </div>

          {/* The train */}
          <motion.div style={{
            x: trainX,
            display: 'flex', alignItems: 'flex-end',
            position: 'absolute', bottom: '32%',
          }}>
            <Engine />
            {BOGIES.map((b, i) => (
              <React.Fragment key={i}>
                <Bogie {...b} />
                {i < BOGIES.length - 1 && <Rail />}
              </React.Fragment>
            ))}
            <Caboose />
          </motion.div>
        </motion.div>

        {/* ══ STAGE 4 — TEAM REVEAL ══ */}
        <motion.div style={{
          opacity: teamOpacity, y: teamY,
          position: 'absolute', inset: 0, zIndex: 40,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: '#080808',
          borderTop: '1px solid rgba(249,115,22,.12)',
        }}>
          <p style={{ fontSize: 9, letterSpacing: '.65em', textTransform: 'uppercase', color: '#f97316', marginBottom: 14 }}>
            / Meet the Duo
          </p>
          <h2 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: 'italic', fontSize: 'clamp(34px,5vw,60px)',
            letterSpacing: '-.03em', marginBottom: 40,
          }}>
            The Studio
          </h2>
          <div style={{ display: 'flex', gap: 28, maxWidth: 580, width: '100%', padding: '0 24px' }}>
            <TeamCard name="Rideema" role="Software Dev" initial="R" />
            <TeamCard name="Partner" role="Creative Dir" initial="P" />
          </div>
        </motion.div>

        {/* ══ SCROLL HINT ══ */}
        <motion.div style={{
          opacity: hintOpacity,
          position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)',
          zIndex: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
          pointerEvents: 'none',
        }}>
          {[0, 0.2, 0.4].map((delay, i) => (
            <motion.div key={i}
              animate={{ opacity: [0.15, 0.7, 0.15], y: [0, -5, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, delay }}
              style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(232,226,214,.25)' }}
            />
          ))}
        </motion.div>

      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   SUB-COMPONENTS
═══════════════════════════════════════════ */

function Engine() {
  return (
    <div style={{
      flexShrink: 0, width: 230, height: 180, position: 'relative',
      background: 'linear-gradient(155deg,#191919 0%,#0f0f0f 100%)',
      borderRadius: '22px 5px 5px 22px',
      border: '1px solid rgba(249,115,22,.3)',
      boxShadow: '0 0 60px rgba(249,115,22,.08),inset 0 1px 0 rgba(255,255,255,.05)',
    }}>
      {/* Chimney */}
      <div style={{
        position: 'absolute', top: -26, left: 30, width: 24, height: 30,
        background: '#151515', borderRadius: '5px 5px 0 0',
        border: '1px solid rgba(249,115,22,.2)', borderBottom: 'none',
      }} />
      {/* Animated smoke puffs */}
      {[
        { w: 14, t: -42, l: 32, delay: 0,    dur: 2.2 },
        { w: 22, t: -58, l: 38, delay: 0.45, dur: 2.7 },
        { w: 28, t: -74, l: 44, delay: 0.9,  dur: 3.2 },
      ].map((s, i) => (
        <motion.div key={i}
          animate={{ y: [0, -14, 0], opacity: [0.4, 0.06, 0.4], scale: [1, 1.3, 1] }}
          transition={{ duration: s.dur, repeat: Infinity, delay: s.delay, ease: 'easeInOut' }}
          style={{
            position: 'absolute', top: s.t, left: s.l,
            width: s.w, height: s.w, borderRadius: '50%',
            background: 'rgba(200,200,200,.1)', filter: 'blur(4px)',
          }}
        />
      ))}
      {/* Status lights */}
      <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', gap: 7, alignItems: 'center' }}>
        {[{ s: 13, c: '#f97316', d: 0 }, { s: 8, c: '#fbbf24', d: 0.35 }].map((l, i) => (
          <motion.div key={i}
            animate={{ opacity: [1, 0.45, 1] }}
            transition={{ duration: 2.2, repeat: Infinity, delay: l.d }}
            style={{ width: l.s, height: l.s, borderRadius: '50%', background: l.c, boxShadow: `0 0 ${i === 0 ? 14 : 8}px ${l.c}` }}
          />
        ))}
      </div>
      <div style={{
        fontFamily: "'Playfair Display', Georgia, serif",
        fontStyle: 'italic', fontSize: 28, color: '#e8e2d6', letterSpacing: '-.03em',
        position: 'absolute', top: 40, left: 16,
      }}>Studio</div>
      <div style={{ fontSize: 8, letterSpacing: '.45em', textTransform: 'uppercase', color: '#f97316', position: 'absolute', top: 76, left: 16 }}>
        Since '26
      </div>
      <Wheels />
    </div>
  );
}

function Bogie({ num, label, accent, head, body }) {
  return (
    <div style={{
      flexShrink: 0, width: 310, height: 180, position: 'relative',
      background: 'linear-gradient(165deg,#131313 0%,#0c0c0c 100%)',
      borderTop: '1px solid rgba(255,255,255,.06)',
      borderBottom: '1px solid rgba(255,255,255,.06)',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      padding: '18px 20px 16px',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: accent, opacity: 0.85 }} />
      <div style={{ fontSize: 9, letterSpacing: '.28em', textTransform: 'uppercase', position: 'absolute', top: 16, right: 16, textAlign: 'right', lineHeight: 1.7, color: accent }}>
        {num}<br /><span style={{ color: 'rgba(232,226,214,.22)', letterSpacing: '.38em' }}>{label}</span>
      </div>
      <div style={{
        fontFamily: "'Playfair Display', Georgia, serif",
        fontStyle: 'italic', fontSize: 32,
        lineHeight: 1.05, letterSpacing: '-.03em', color: '#e8e2d6', flex: 1,
      }}>
        {head[0]}<br />
        <span style={{ color: accent }}>{head[1]}</span><br />
        {head[2]}
      </div>
      <p style={{ fontSize: 8.5, lineHeight: 1.8, color: 'rgba(232,226,214,.33)', letterSpacing: '.02em', maxWidth: 230 }}>
        {body}
      </p>
      <Wheels />
    </div>
  );
}

function Rail() {
  return (
    <div style={{
      flexShrink: 0, width: 38, height: 14, alignSelf: 'flex-end', marginBottom: 26,
      background: 'linear-gradient(90deg,#1e1e1e,#2a2a2a,#1e1e1e)', position: 'relative',
    }}>
      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, background: '#363636', transform: 'translateY(-50%)' }} />
    </div>
  );
}

function Caboose() {
  return (
    <div style={{
      flexShrink: 0, width: 110, height: 140,
      background: 'linear-gradient(135deg,#111,#181818)',
      borderRadius: '5px 16px 16px 5px',
      border: '1px solid rgba(255,255,255,.05)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
      alignSelf: 'flex-end', marginBottom: 20,
    }}>
      <p style={{ fontSize: 10, color: 'rgba(232,226,214,.25)', textAlign: 'center', lineHeight: 1.6 }}>
        End of<br />Line
      </p>
      <motion.div
        animate={{ opacity: [1, 0.2, 1] }}
        transition={{ duration: 1.3, repeat: Infinity }}
        style={{ width: 11, height: 11, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 16px #ef4444' }}
      />
    </div>
  );
}

function Wheels() {
  return (
    <div style={{ position: 'absolute', bottom: -2, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 12 }}>
      {[0, 0.6, 1.2].map((delay, i) => (
        <motion.div key={i}
          animate={{ rotate: 360 }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'linear', delay: -delay }}
          style={{
            width: 22, height: 22, borderRadius: '50%',
            border: '2px solid rgba(255,255,255,.16)',
            background: '#0a0a0a', flexShrink: 0, position: 'relative',
          }}
        >
          <div style={{ position: 'absolute', inset: 4, borderRadius: '50%', border: '1px solid rgba(255,255,255,.06)' }} />
        </motion.div>
      ))}
    </div>
  );
}

function TeamCard({ name, role, initial }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: '100%', aspectRatio: '3/4', maxHeight: 200, borderRadius: 34,
          background: 'linear-gradient(160deg,rgba(255,255,255,.04),rgba(255,255,255,.01))',
          border: `1px solid ${hovered ? 'rgba(249,115,22,.35)' : 'rgba(255,255,255,.07)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'border-color .5s', cursor: 'pointer',
        }}
      >
        <span style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontStyle: 'italic', fontSize: 60,
          color: hovered ? 'rgba(232,226,214,.22)' : 'rgba(232,226,214,.06)',
          transition: 'color .5s', userSelect: 'none',
        }}>{initial}</span>
      </div>
      <h4 style={{
        fontFamily: "'Playfair Display', Georgia, serif",
        fontStyle: 'italic', fontSize: 22,
        letterSpacing: '-.02em', color: '#e8e2d6', marginTop: 14,
      }}>{name}</h4>
      <p style={{ fontSize: 8, letterSpacing: '.5em', textTransform: 'uppercase', color: 'rgba(232,226,214,.22)', marginTop: 5 }}>
        {role}
      </p>
    </div>
  );
}