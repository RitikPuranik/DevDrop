import React, { useRef } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import TeamReveal from '../../components/sections/TeamReveal';
import ritikImg from '../../assets/people/ritik.jpeg';
import priyalImg from '../../assets/people/priyal.jpeg';
import rideemaImg from '../../assets/people/rideema.jpeg';
import saralImg from '../../assets/people/saral.jpeg';


/* ABOUT PAGE v12 — FULL-SCREEN BOGIES + SEAMLESS TEAM REVEAL
  
  Scroll timeline (total: 1000vh):
  ─────────────────────────────────────────────────────────
  0.00 – 0.05   → "About Us" hero fades out
  0.06 – 0.22   → "Since '26" appears + fades
  0.22 – 0.62   → Horizontal gallery (4 full-screen bogies)
  0.62 – 1.00   → Team Reveal fades in immediately + tears open
  ─────────────────────────────────────────────────────────
*/

const BOGIES = [
  {
    num: '01', label: 'Vision', accent: '#f97316',
    head: ['Where', "We're", 'Going'],
    body: "A digital landscape where brands don't just exist — they linger in memory. Every pixel deliberate, every interaction felt deeply.",
    img: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800',
  },
  {
    num: '02', label: 'Mission', accent: '#a78bfa',
    head: ['Why', 'We', 'Build'],
    body: 'To craft digital artifacts so refined they become cultural touchpoints — not just products, but pieces of the internet worth remembering.',
    img: 'https://images.unsplash.com/photo-1635776062127-d379bfcba9f8?w=800',
  },
  {
    num: '03', label: 'Craft', accent: '#34d399',
    head: ['How', 'We', 'Work'],
    body: 'Boutique methodology. No templates, no shortcuts. Each project receives the full, undivided obsession of our studio.',
    img: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800',
  },
  {
    num: '04', label: 'Services', accent: '#fb923c',
    head: ['What', 'We', 'Deliver'],
    body: 'Web platforms · Brand identity · Motion design · Strategy. Full-spectrum creative engineering for brands that demand excellence.',
    img: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800',
  },
];

const CORNER_PHOTOS = {
  topLeft:    ritikImg,
  bottomLeft: priyalImg,
  topRight:   rideemaImg,
  bottomRight: saralImg,
};

export default function About() {
  const containerRef = useRef(null);

  // 1000vh — tighter, snappier feel
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });
  const sp = useSpring(scrollYProgress, { stiffness: 40, damping: 26 });

  /* ── STAGE 0: "About Us" hero ── */
  const s0O = useTransform(sp, [0, 0.05], [1, 0]);
  const photoOpacity = useTransform(sp, [0, 0.005, 0.04, 0.06], [1, 1, 1, 0]);
  const tlScale = useTransform(sp, [0, 0.05], [1, 0.88]);
  const brScale = useTransform(sp, [0, 0.05], [1, 0.88]);
  const tlX = useTransform(sp, [0, 0.05], [0, -40]);
  const tlY = useTransform(sp, [0, 0.05], [0, -40]);
  const trX = useTransform(sp, [0, 0.05], [0, 40]);
  const trY = useTransform(sp, [0, 0.05], [0, -40]);
  const blX = useTransform(sp, [0, 0.05], [0, -40]);
  const blY = useTransform(sp, [0, 0.05], [0, 40]);
  const brX = useTransform(sp, [0, 0.05], [0, 40]);
  const brY = useTransform(sp, [0, 0.05], [0, 40]);

  /* ── STAGE 1: "Since '26" ── */
  const s2O = useTransform(sp, [0.06, 0.11, 0.18, 0.22], [0, 1, 1, 0]);
  const s2S = useTransform(sp, [0.06, 0.11, 0.18, 0.22], [0.85, 1, 1, 1.06]);

  /* ── STAGE 2: Horizontal gallery ──
     4 bogies × 100vw = 400vw of travel, starting at 0.22 → 0.62 */
  const xTranslate    = useTransform(sp, [0.22, 0.62], ['0vw', '-400vw']);
  // Hidden until its stage begins, fades out just as the dark backing covers it
  const galleryOpacity = useTransform(sp, [0.20, 0.24, 0.58, 0.62], [0, 1, 1, 0]);

  return (
    <div
      ref={containerRef}
      style={{
        height: '1000vh',
        background: '#060606',
        color: '#e8e2d6',
        fontFamily: "'Space Mono', monospace",
      }}
    >
      <div
        style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          width: '100vw',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* GLOBAL VIGNETTE */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 300, pointerEvents: 'none',
          background: 'radial-gradient(circle at 50% 50%, transparent 25%, rgba(0,0,0,0.75) 100%)',
        }} />

        {/* ════════════════════════════════════════════
            STAGE 0 — ABOUT US HERO WITH CORNER PHOTOS
            ════════════════════════════════════════════ */}
        <motion.div
          style={{
            opacity: s0O,
            position: 'absolute',
            inset: 0,
            zIndex: 100,
          }}
        >
          <motion.div style={{
            position: 'absolute', top: 0, left: 0,
            width: 'clamp(200px, 22vw, 340px)',
            height: 'clamp(260px, 48vh, 480px)',
            opacity: photoOpacity, x: tlX, y: tlY, scale: tlScale,
            transformOrigin: 'top left', overflow: 'hidden',
            borderRadius: '0 0 clamp(20px,3vw,42px) 0',
            boxShadow: '20px 20px 60px rgba(0,0,0,0.6)',
          }}>
            <img src={CORNER_PHOTOS.topLeft} alt=""
              style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'center top' }} />
            <div style={{ position:'absolute', inset:0, background:'linear-gradient(135deg, rgba(249,115,22,0.12) 0%, transparent 60%)' }} />
          </motion.div>

          <motion.div style={{
            position: 'absolute', bottom: 0, left: 0,
            width: 'clamp(160px, 18vw, 280px)',
            height: 'clamp(200px, 38vh, 380px)',
            opacity: photoOpacity, x: blX, y: blY,
            transformOrigin: 'bottom left', overflow: 'hidden',
            borderRadius: '0 clamp(20px,3vw,42px) 0 0',
            boxShadow: '20px -20px 60px rgba(0,0,0,0.6)',
          }}>
            <img src={CORNER_PHOTOS.bottomLeft} alt=""
              style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'center top' }} />
            <div style={{ position:'absolute', inset:0, background:'linear-gradient(315deg, rgba(52,211,153,0.1) 0%, transparent 60%)' }} />
          </motion.div>

          <motion.div style={{
            position: 'absolute', top: 0, right: 0,
            width: 'clamp(180px, 20vw, 310px)',
            height: 'clamp(230px, 44vh, 430px)',
            opacity: photoOpacity, x: trX, y: trY,
            transformOrigin: 'top right', overflow: 'hidden',
            borderRadius: '0 0 0 clamp(20px,3vw,42px)',
            boxShadow: '-20px 20px 60px rgba(0,0,0,0.6)',
          }}>
            <img src={CORNER_PHOTOS.topRight} alt=""
              style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'center top' }} />
            <div style={{ position:'absolute', inset:0, background:'linear-gradient(225deg, rgba(167,139,250,0.12) 0%, transparent 60%)' }} />
          </motion.div>

          <motion.div style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 'clamp(200px, 24vw, 360px)',
            height: 'clamp(250px, 46vh, 460px)',
            opacity: photoOpacity, x: brX, y: brY, scale: brScale,
            transformOrigin: 'bottom right', overflow: 'hidden',
            borderRadius: 'clamp(20px,3vw,42px) 0 0 0',
            boxShadow: '-20px -20px 60px rgba(0,0,0,0.6)',
          }}>
            <img src={CORNER_PHOTOS.bottomRight} alt=""
              style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'center top' }} />
            <div style={{ position:'absolute', inset:0, background:'linear-gradient(45deg, rgba(251,146,60,0.1) 0%, transparent 60%)' }} />
          </motion.div>

          {/* ── CENTER TEXT ── */}
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            zIndex: 10, textAlign: 'center',
          }}>
            <motion.span
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1, duration: 0.7 }}
              style={{
                display: 'block', fontSize: 10, letterSpacing: '0.5em',
                textTransform: 'uppercase', color: '#8b7355', marginBottom: 20, opacity: 0.85,
              }}
            >
              Our Story
            </motion.span>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              style={{
                fontFamily: "'Playfair Display', serif", fontStyle: 'italic',
                fontSize: 'clamp(64px, 11vw, 160px)', lineHeight: 0.85,
                margin: 0, letterSpacing: '-0.02em', color: '#e8e2d6',
              }}
            >
              About<br />
              <span style={{ color: '#8b7355' }}>Us</span>
            </motion.h1>

            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 1.3, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              style={{
                width: 'clamp(60px, 8vw, 120px)', height: 1,
                background: 'rgba(232,226,214,0.2)', margin: '24px auto', transformOrigin: 'left',
              }}
            />

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5, duration: 0.7 }}
              style={{
                fontSize: 'clamp(11px, 1.1vw, 14px)', letterSpacing: '0.2em',
                textTransform: 'uppercase', opacity: 0.35, maxWidth: 280, lineHeight: 1.8,
              }}
            >
              A boutique studio obsessed with craft
            </motion.p>
          </div>
        </motion.div>

        {/* ════════════════════════════════════
            STAGE 1 — SINCE '26
            ════════════════════════════════════ */}
        <motion.div style={{
          opacity: s2O, scale: s2S,
          position: 'absolute', width: '100%', textAlign: 'center', zIndex: 100,
        }}>
          <h1 style={{
            fontFamily: "'Playfair Display', serif", fontStyle: 'italic',
            fontSize: '14vw', lineHeight: 0.85, margin: 0,
          }}>
            Since <span style={{ color: '#8b7355' }}>'26</span>
          </h1>
        </motion.div>

        {/* ════════════════════════════════════
            STAGE 2 — HORIZONTAL GALLERY (full-screen)
            ════════════════════════════════════ */}
        <motion.div style={{
          x: xTranslate,
          opacity: galleryOpacity,
          display: 'flex',
          height: '100%',
          alignItems: 'stretch',
          position: 'absolute',
          top: 0,
          left: 0,
          willChange: 'transform',
          pointerEvents: 'none',
        }}>
          {BOGIES.map((bogie, i) => (
            <HorizontalNode key={i} bogie={bogie} index={i} />
          ))}
        </motion.div>

        {/* ════════════════════════════════════
            STAGE 3 — TEAM REVEAL
            Fades in right as gallery ends (0.60+)
            ════════════════════════════════════ */}
        <TeamReveal sp={sp} />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────── */
function HorizontalNode({ bogie, index }) {
  return (
    <div style={{
      position: 'relative',
      // Each card is exactly one viewport wide — fills the screen
      minWidth: '100vw',
      width: '100vw',
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6vw',
      padding: '0 6vw',
      boxSizing: 'border-box',
      // Subtle per-card background tint so they feel distinct
      background: `radial-gradient(ellipse at 60% 50%, ${bogie.accent}08 0%, transparent 70%)`,
    }}>
      {/* Giant ghost number */}
      <span style={{
        position: 'absolute',
        left: '50%', top: '50%',
        transform: 'translate(-50%, -50%)',
        fontSize: '30vw', fontWeight: 900,
        color: '#fff', opacity: 0.02,
        zIndex: 0, pointerEvents: 'none', userSelect: 'none',
      }}>
        0{index + 1}
      </span>

      {/* Text column */}
      <div style={{ maxWidth: 520, zIndex: 2, flex: '0 0 auto' }}>
        <div style={{ display: 'flex', gap: 15, alignItems: 'center', marginBottom: 28 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: bogie.accent }}>0{index + 1}</span>
          <div style={{ height: 1, width: 40, background: 'rgba(255,255,255,0.1)' }} />
          <span style={{ fontSize: 10, letterSpacing: '.4em', textTransform: 'uppercase', opacity: 0.4 }}>
            {bogie.label}
          </span>
        </div>
        <h3 style={{
          fontFamily: "'Playfair Display', serif", fontStyle: 'italic',
          fontSize: 'clamp(48px, 6.5vw, 100px)',
          lineHeight: 0.85, marginBottom: 36,
        }}>
          {bogie.head[0]} <br />
          <span style={{ color: bogie.accent }}>{bogie.head[1]}</span> <br />
          {bogie.head[2]}
        </h3>
        <p style={{ fontSize: 16, lineHeight: 1.8, opacity: 0.4, maxWidth: 420 }}>{bogie.body}</p>
      </div>

      {/* Image card — taller, fills more screen height */}
      <div style={{
        width: 'clamp(300px, 38vw, 580px)',
        height: 'clamp(400px, 72vh, 800px)',
        borderRadius: 40,
        overflow: 'hidden',
        position: 'relative',
        zIndex: 2,
        boxShadow: '0 60px 120px rgba(0,0,0,0.85)',
        border: '1px solid rgba(255,255,255,0.06)',
        flex: '0 0 auto',
      }}>
        <img src={bogie.img} alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(to bottom, transparent, ${bogie.accent}18)`,
        }} />
      </div>
    </div>
  );
}
