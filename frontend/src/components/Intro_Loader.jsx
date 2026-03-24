import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useAnimate, stagger } from 'framer-motion';

/*
  ╔══════════════════════════════════════════════╗
  ║         DEVDROP — INTRO LOADER               ║
  ║                                              ║
  ║  A cinematic 4-act opening sequence          ║
  ║                                              ║
  ║  ACT 1 (0–1.2s)  Black. A single dot.        ║
  ║  ACT 2 (1.2–3s)  Dot expands into circle,    ║
  ║                  letters scatter inward      ║
  ║  ACT 3 (3–4.8s)  "devdrop" fully assembled,  ║
  ║                  tagline rises               ║
  ║  ACT 4 (4.8–6s)  Curtain wipe upward exits  ║
  ╚══════════════════════════════════════════════╝
*/

const LETTERS  = ['d','e','v','d','r','o','p'];
const TAGLINE  = 'crafting the void';

// Where each letter scatters FROM (random-ish positions around center)
const SCATTER = [
  { x: -320, y: -160, rotate: -45, scale: 0.4 },
  { x:  180, y: -240, rotate:  30, scale: 0.3 },
  { x: -200, y:  180, rotate: -20, scale: 0.5 },
  { x:  260, y:  140, rotate:  55, scale: 0.35 },
  { x: -380, y:   60, rotate: -60, scale: 0.45 },
  { x:  140, y:  260, rotate:  15, scale: 0.4 },
  { x:  320, y: -100, rotate: -35, scale: 0.5 },
];

const IntroLoader = ({ onComplete }) => {
  const [act, setAct] = useState(1);
  const [scope, animate] = useAnimate();

  // Act sequencing
  useEffect(() => {
    const timers = [
      setTimeout(() => setAct(2), 600),
      setTimeout(() => setAct(3), 2200),
      setTimeout(() => setAct(4), 4200),
      setTimeout(() => onComplete(), 5800),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <motion.div
      ref={scope}
      className="fixed inset-0 z-[10000] overflow-hidden flex items-center justify-center"
      style={{ background: '#030303' }}
      exit={{ y: '-100%' }}
      transition={{ duration: 0.9, ease: [0.76, 0, 0.24, 1] }}
    >
      {/* ── BACKGROUND TEXTURE ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.08'/%3E%3C/svg%3E")`,
          backgroundSize: '256px 256px',
          opacity: 0.6,
        }}
      />

      {/* ── ACT 1: PULSING DOT ── */}
      <AnimatePresence>
        {act === 1 && (
          <motion.div
            key="dot"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1, 0.85, 1], opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#e8e2d6',
              boxShadow: '0 0 30px rgba(232,226,214,0.6), 0 0 60px rgba(232,226,214,0.2)',
            }}
          />
        )}
      </AnimatePresence>

      {/* ── ACT 2 + 3: RING + SCATTERED LETTERS ASSEMBLE ── */}
      <AnimatePresence>
        {(act === 2 || act === 3) && (
          <motion.div
            key="ring-scene"
            className="relative flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4 }}
          >
            {/* Expanding ring */}
            <motion.div
              initial={{ scale: 0, opacity: 0.8 }}
              animate={{ scale: act >= 2 ? [0, 4, 3.2] : 0, opacity: act >= 3 ? 0.06 : [0.8, 0.3, 0.12] }}
              transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
              style={{
                position: 'absolute',
                width: 120,
                height: 120,
                borderRadius: '50%',
                border: '1px solid rgba(232,226,214,0.9)',
                pointerEvents: 'none',
              }}
            />
            {/* Second ring, delayed */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: act >= 2 ? [0, 3.5, 2.8] : 0, opacity: act >= 3 ? 0.04 : [0, 0.2, 0.08] }}
              transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
              style={{
                position: 'absolute',
                width: 120,
                height: 120,
                borderRadius: '50%',
                border: '1px solid rgba(232,226,214,0.5)',
                pointerEvents: 'none',
              }}
            />

            {/* ── THE WORDMARK ── */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
              {LETTERS.map((letter, i) => (
                <motion.span
                  key={i}
                  initial={{
                    x: SCATTER[i].x,
                    y: SCATTER[i].y,
                    rotate: SCATTER[i].rotate,
                    scale: SCATTER[i].scale,
                    opacity: 0,
                  }}
                  animate={{
                    x: 0,
                    y: 0,
                    rotate: 0,
                    scale: 1,
                    opacity: 1,
                  }}
                  transition={{
                    duration: 1.1,
                    delay: 0.05 + i * 0.06,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  style={{
                    fontFamily: "'Playfair Display', serif",
                    fontStyle: 'italic',
                    fontWeight: 300,
                    fontSize: 'clamp(3.5rem, 9vw, 8rem)',
                    color: '#e8e2d6',
                    letterSpacing: '-0.02em',
                    lineHeight: 1,
                    display: 'inline-block',
                    textShadow: '0 0 80px rgba(232,226,214,0.15)',
                  }}
                >
                  {letter}
                </motion.span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ACT 3: TAGLINE ── */}
      <AnimatePresence>
        {act === 3 && (
          <motion.div
            key="tagline"
            className="absolute"
            style={{ bottom: '38%' }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.7, delay: 0.3, ease: 'easeOut' }}
          >
            <div style={{ position: 'relative', textAlign: 'center' }}>
              {/* Decorative line left */}
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ duration: 0.6, delay: 0.5 }}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: 0,
                  right: 0,
                  height: '1px',
                  background: 'linear-gradient(to right, transparent, rgba(232,226,214,0.2), transparent)',
                  transform: 'translateY(-50%)',
                }}
              />
              <span style={{
                fontFamily: "'Playfair Display', serif",
                fontWeight: 300,
                fontStyle: 'normal',
                fontSize: 'clamp(0.55rem, 1.2vw, 0.8rem)',
                color: 'rgba(232,226,214,0.45)',
                letterSpacing: '0.38em',
                textTransform: 'uppercase',
                padding: '0 1.2rem',
                background: '#030303',
                position: 'relative',
                zIndex: 1,
              }}>
                {TAGLINE}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ACT 4: COUNTDOWN DOTS ── */}
      <AnimatePresence>
        {act === 3 && (
          <motion.div
            key="dots"
            className="absolute"
            style={{ bottom: '28%', display: 'flex', gap: 8 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, delay: 0.8 }}
          >
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
                transition={{
                  duration: 1.1,
                  delay: i * 0.18,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: 'rgba(232,226,214,0.5)',
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── BOTTOM CORNER: year stamp ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: act >= 3 ? 0.2 : 0 }}
        transition={{ duration: 0.6, delay: 0.6 }}
        style={{
          position: 'absolute',
          bottom: '2.4rem',
          right: '2.4rem',
          fontFamily: "'Playfair Display', serif",
          fontStyle: 'italic',
          fontSize: '0.65rem',
          color: 'rgba(232,226,214,0.6)',
          letterSpacing: '0.15em',
        }}
      >
        © 2025
      </motion.div>

      {/* ── TOP LEFT: subtle logo mark ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: act >= 3 ? 0.15 : 0 }}
        transition={{ duration: 0.6, delay: 0.5 }}
        style={{
          position: 'absolute',
          top: '2.2rem',
          left: '2.4rem',
        }}
      >
        <img
          src="/Logo.jpeg"
          alt=""
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            objectFit: 'contain',
            filter: 'grayscale(1)',
          }}
        />
      </motion.div>

      {/* ── ACT 4: CURTAIN EXIT FLASH ── */}
      <AnimatePresence>
        {act === 4 && (
          <motion.div
            key="curtain"
            initial={{ scaleY: 0, originY: 1 }}
            animate={{ scaleY: 1 }}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to top, #e8e2d6 0%, #c8bfaf 100%)',
              transformOrigin: 'bottom',
            }}
            transition={{ duration: 0.65, ease: [0.76, 0, 0.24, 1] }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default IntroLoader;