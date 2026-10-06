import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Ban, Check, ChevronsDown, Layers, Loader2, MousePointerClick, Plus, Sparkles, Spline, Timer, Type,
} from 'lucide-react';
import { DESIGN_STYLES, DESIGN_THEMES, ANIMATION_OPTIONS, DESIGN_PALETTES, DESIGN_TYPOGRAPHY } from '../../config/aiStudio.config';

/* ───────────── helpers ───────────── */
const hexToRgb = (h) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h || '');
  if (!m) return [184, 147, 90];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lum = (h) => { const [r, g, b] = hexToRgb(h).map((v) => v / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const alpha = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };
const shade = (h, amt) => {
  const [r, g, b] = hexToRgb(h).map((v) => Math.max(0, Math.min(255, Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt)))));
  return `rgb(${r},${g},${b})`;
};

const MOTION_ICONS = { none: Ban, subtle: Spline, scroll: ChevronsDown, interactive: MousePointerClick, parallax: Layers, kinetic: Type, dynamic: Sparkles };

const THEME_COLORS = {
  dark: { bg: '#0b0b0d', fg: '#ffffff', sub: 'rgba(255,255,255,.55)', panel: 'rgba(255,255,255,.06)', line: 'rgba(255,255,255,.14)' },
  light: { bg: '#f8f8f6', fg: '#141414', sub: 'rgba(0,0,0,.55)', panel: 'rgba(255,255,255,.92)', line: 'rgba(0,0,0,.12)' },
  neutral: { bg: '#d9d9d6', fg: '#1b1b1b', sub: 'rgba(0,0,0,.55)', panel: 'rgba(255,255,255,.6)', line: 'rgba(0,0,0,.14)' },
  midnight: { bg: '#0a1228', fg: '#eaf0ff', sub: 'rgba(220,230,255,.55)', panel: 'rgba(120,150,255,.09)', line: 'rgba(150,175,255,.2)' },
  warm: { bg: '#f3ead9', fg: '#2b2118', sub: 'rgba(43,33,24,.6)', panel: 'rgba(255,255,255,.55)', line: 'rgba(43,33,24,.15)' },
  auto: { bg: '#0b0b0d', fg: '#ffffff', sub: 'rgba(255,255,255,.55)', panel: 'rgba(255,255,255,.06)', line: 'rgba(255,255,255,.14)' },
};

const STYLE_TOKENS = {
  minimal: { layout: 'center', radius: 2, border: 'hairline', shadow: 'none', hw: 500, upper: false, ls: '-0.02em', size: 26, btn: 'outline' },
  modern: { layout: 'split', radius: 14, border: 'hairline', shadow: 'soft', hw: 700, upper: false, ls: '-0.02em', size: 24, btn: 'soft' },
  bold: { layout: 'poster', radius: 0, border: 'none', shadow: 'none', hw: 900, upper: true, ls: '-0.04em', size: 34, btn: 'block' },
  editorial: { layout: 'editorial', radius: 0, border: 'hairline', shadow: 'none', hw: 600, upper: false, ls: '-0.01em', size: 28, btn: 'outline' },
  creative: { layout: 'split', variant: 'creative', radius: 26, border: 'none', shadow: 'soft', hw: 800, upper: false, ls: '-0.03em', size: 26, btn: 'pill' },
  glass: { layout: 'glass', radius: 20, border: 'hairline', shadow: 'soft', hw: 700, upper: false, ls: '-0.02em', size: 25, btn: 'pill' },
  brutalist: { layout: 'poster', variant: 'brutal', radius: 0, border: 'thick', shadow: 'hard', hw: 800, upper: true, ls: '-0.02em', size: 24, btn: 'brutal' },
  bento: { layout: 'bento', radius: 16, border: 'hairline', shadow: 'none', hw: 700, upper: false, ls: '-0.02em', size: 19, btn: 'soft' },
  retro: { layout: 'retro', radius: 8, border: 'thick', shadow: 'hard', hw: 700, upper: false, ls: '0', size: 20, btn: 'chrome' },
  luxury: { layout: 'center', variant: 'luxury', radius: 0, border: 'hairline', shadow: 'none', hw: 400, upper: true, ls: '.12em', size: 19, btn: 'gold' },
  corporate: { layout: 'split', variant: 'corporate', radius: 6, border: 'hairline', shadow: 'soft', hw: 700, upper: false, ls: '-0.01em', size: 23, btn: 'block' },
  organic: { layout: 'split', variant: 'organic', radius: 34, border: 'none', shadow: 'soft', hw: 700, upper: false, ls: '-0.02em', size: 26, btn: 'pill' },
};

const HEADLINE = 'Build something people remember';

/* ───────────── live preview (full re-layout per style) ───────────── */
function LivePreview({ design, palette, paletteName, typo }) {
  const reduce = useReducedMotion();
  const th = THEME_COLORS[design.theme] || THEME_COLORS.dark;
  const t = STYLE_TOKENS[design.style] || STYLE_TOKENS.modern;
  const accent = design.primaryColor || palette[0];
  const second = palette[1] || accent;
  const third = palette[2] || accent;
  const onAcc = lum(accent) > 0.55 ? '#111111' : '#ffffff';
  const anim = reduce ? 'none' : design.animations || 'subtle';
  const headFont = typo.font;
  const styleLabel = DESIGN_STYLES.find((s) => s.id === design.style)?.label || 'Modern';
  const themeLabel = DESIGN_THEMES.find((s) => s.id === design.theme)?.label || 'Dark';
  const motionLabel = ANIMATION_OPTIONS.find((s) => s.id === design.animations)?.label || 'Subtle';
  const glass = t.layout === 'glass';
  const sub = `${styleLabel} direction · ${themeLabel} theme · ${motionLabel} motion`;

  const mp = (i = 0) => {
    switch (anim) {
      case 'subtle': return { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.6, delay: i * 0.05 } };
      case 'scroll': return { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, delay: 0.1 + i * 0.12 } };
      case 'interactive': return { whileHover: { scale: 1.05, y: -3 }, whileTap: { scale: 0.98 }, transition: { type: 'spring', stiffness: 300, damping: 18 } };
      case 'parallax': return { animate: { y: [0, i % 2 ? 8 : -8, 0] }, transition: { repeat: Infinity, duration: 4 + i * 0.4, ease: 'easeInOut' } };
      case 'kinetic': return { initial: { opacity: 0, scale: 0.9 }, animate: { opacity: 1, scale: 1 }, transition: { duration: 0.4, delay: i * 0.08 } };
      case 'dynamic': return { animate: { y: [0, -5, 0], rotate: [0, i % 2 ? 1.2 : -1.2, 0] }, transition: { repeat: Infinity, duration: 2.6, delay: i * 0.25, ease: 'easeInOut' } };
      default: return {};
    }
  };

  const surface = {
    background: glass ? 'rgba(255,255,255,.14)' : th.panel,
    border: glass ? '1px solid rgba(255,255,255,.3)' : t.border === 'thick' ? `2.5px solid ${th.fg}` : t.border === 'none' ? 'none' : `1px solid ${th.line}`,
    borderRadius: t.radius,
    boxShadow: t.shadow === 'hard' ? `4px 4px 0 ${th.fg}` : t.shadow === 'soft' ? '0 10px 30px -14px rgba(0,0,0,.5)' : 'none',
    backdropFilter: glass ? 'blur(14px)' : undefined,
    WebkitBackdropFilter: glass ? 'blur(14px)' : undefined,
  };
  const card = (i, style, children) => <motion.div key={i} {...mp(i)} style={{ ...surface, ...style }}>{children}</motion.div>;
  const bar = (w, o = 0.35) => <i style={{ display: 'block', height: 4, width: w, borderRadius: 2, background: th.sub, opacity: o, marginBottom: 4 }} />;
  const sq = (c) => <i style={{ width: 10, height: 10, borderRadius: Math.min(t.radius, 4), background: c, display: 'inline-block' }} />;

  const btn = (label, primary = true) => {
    const base = { fontSize: 10, fontWeight: 700, padding: '6px 14px', display: 'inline-block', whiteSpace: 'nowrap' };
    const bg = primary ? accent : 'transparent';
    const col = primary ? onAcc : th.fg;
    const map = {
      pill: { borderRadius: 999, background: bg, color: col, border: primary ? 'none' : `1px solid ${th.line}` },
      soft: { borderRadius: t.radius / 1.6, background: bg, color: col, border: primary ? 'none' : `1px solid ${th.line}` },
      outline: { borderRadius: 2, background: 'transparent', color: th.fg, border: `1px solid ${primary ? th.fg : th.line}` },
      block: { borderRadius: t.radius, background: bg, color: col, textTransform: 'uppercase', letterSpacing: '.08em', border: primary ? 'none' : `2px solid ${th.fg}` },
      brutal: { borderRadius: 0, background: primary ? accent : th.bg, color: primary ? onAcc : th.fg, border: `2.5px solid ${th.fg}`, boxShadow: `3px 3px 0 ${th.fg}`, textTransform: 'uppercase' },
      chrome: { borderRadius: 999, background: primary ? `linear-gradient(180deg,${shade(accent, 0.55)},${accent} 55%,${shade(accent, -0.2)})` : th.panel, color: primary ? onAcc : th.fg, border: `2px solid ${th.fg}`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.7)' },
      gold: { borderRadius: 0, background: 'transparent', color: accent, border: `1px solid ${accent}`, textTransform: 'uppercase', letterSpacing: '.2em', fontSize: 9 },
    };
    return <span key={label} style={{ ...base, ...map[t.btn] }}>{label}</span>;
  };

  const words = HEADLINE.split(' ');
  const headline = (size) => (
    <h4 style={{ fontFamily: headFont, fontWeight: t.hw, fontSize: size || t.size, letterSpacing: t.ls, lineHeight: 1.08, textTransform: t.upper ? 'uppercase' : 'none', margin: 0 }}>
      {anim === 'kinetic'
        ? words.map((w, i) => <motion.span key={i} style={{ display: 'inline-block', marginRight: '.25em' }} animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 1.8, delay: i * 0.15 }}>{w}</motion.span>)
        : HEADLINE}
    </h4>
  );

  const logo = <span style={{ fontWeight: 800, fontFamily: headFont }}>● YourBrand</span>;
  const links = <span style={{ display: 'flex', gap: 14, color: th.sub }}><span>Home</span><span>Work</span><span>Contact</span></span>;
  const toggle = design.theme === 'auto' ? <span style={{ fontSize: 9, border: `1px solid ${th.line}`, borderRadius: 99, padding: '2px 7px', color: th.sub }}>☾ / ☀</span> : null;
  const navWrap = glass ? { ...surface, borderRadius: 999, padding: '6px 14px' }
    : t.border === 'thick' ? { borderBottom: `2.5px solid ${th.fg}`, paddingBottom: 8 }
      : (t.layout === 'center' || t.variant === 'corporate') ? { borderBottom: `1px solid ${th.line}`, paddingBottom: 8 } : {};
  const nav = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, gap: 8, ...navWrap }}>
      {logo}{links}<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{toggle}{btn('Get Started')}</span>
    </div>
  );
  const para = (extra) => <p style={{ fontSize: 10, color: th.sub, lineHeight: 1.5, margin: '8px 0 12px', ...extra }}>{sub}</p>;
  const btns = <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{btn('Get Started')}{btn('Learn more', false)}</div>;

  /* ── layouts ── */
  const centerLayout = () => {
    const lux = t.variant === 'luxury';
    return (
      <div style={{ padding: '20px 28px', height: '100%', display: 'flex', flexDirection: 'column' }}>
        {nav()}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 10 }}>
          {lux && <span style={{ fontSize: 9, letterSpacing: '.3em', color: accent }}>◆ EST. 2026 ◆</span>}
          <div style={{ maxWidth: 300 }}>{headline()}</div>
          {lux && <i style={{ display: 'block', width: 60, height: 1, background: accent }} />}
          {para({ maxWidth: 260, letterSpacing: lux ? '.08em' : 0, margin: '0 0 6px' })}
          {btns}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${th.line}`, paddingTop: 8, fontSize: 9, color: th.sub }}><span>Work</span><span>About</span><span>Contact</span></div>
      </div>
    );
  };

  const splitLayout = () => {
    const v = t.variant;
    const cards = [0, 1, 2, 3].map((i) => {
      if (v === 'creative') {
        const bgs = [accent, second, third, th.panel];
        const rot = [-3, 2.5, 2, -2][i];
        return card(i, { padding: 10, minHeight: 70, background: bgs[i], transform: `rotate(${rot}deg)`, color: i < 3 ? (lum(bgs[i]) > 0.55 ? '#111' : '#fff') : th.fg }, <>{bar('70%', 0.7)}{bar('45%', 0.5)}</>);
      }
      if (v === 'organic') {
        const bgs = [alpha(accent, 0.22), alpha(second, 0.4), alpha(third, 0.28), alpha(accent, 0.12)];
        return card(i, { padding: 12, minHeight: 70, background: bgs[i] }, <>{bar('65%', 0.6)}{bar('40%', 0.4)}</>);
      }
      if (v === 'corporate') {
        if (i === 0) return card(i, { gridColumn: '1 / -1', padding: 10 }, <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 62 }}>{[40, 62, 48, 80, 66, 92].map((h, k) => <i key={k} style={{ flex: 1, height: `${h}%`, background: k === 5 ? accent : alpha(accent, 0.35), borderRadius: 1 }} />)}</div>);
        if (i === 3) return null;
        return card(i, { padding: 10 }, <>{bar('70%', 0.6)}{bar('45%')}</>);
      }
      return card(i, { padding: 10, minHeight: 66 }, <><i style={{ display: 'block', width: 12, height: 12, borderRadius: 4, background: i === 0 ? accent : th.sub, opacity: i === 0 ? 1 : 0.3, marginBottom: 8 }} />{bar('80%', 0.4)}{bar('55%', 0.25)}{i === 1 && <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>{palette.slice(0, 4).map((c) => <span key={c}>{sq(c)}</span>)}</div>}</>);
    });
    return (
      <div style={{ padding: '20px 24px', height: '100%', position: 'relative', overflow: 'hidden' }}>
        {v === 'creative' && <>
          <i style={{ position: 'absolute', right: -30, top: 40, width: 150, height: 150, borderRadius: '50%', background: accent, opacity: 0.85 }} />
          <i style={{ position: 'absolute', left: -20, bottom: -30, width: 120, height: 120, borderRadius: '50%', background: second, opacity: 0.8 }} />
          <i style={{ position: 'absolute', left: '45%', bottom: 10, width: 70, height: 70, borderRadius: '50%', background: third, opacity: 0.8 }} />
        </>}
        {v === 'organic' && <>
          <i style={{ position: 'absolute', right: -40, top: -30, width: 230, height: 200, borderRadius: '60% 40% 55% 45%', background: alpha(second, 0.45) }} />
          <i style={{ position: 'absolute', left: -50, bottom: -60, width: 240, height: 190, borderRadius: '45% 55% 40% 60%', background: alpha(third, 0.35) }} />
        </>}
        {!v && <i style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 82% 22%, ${alpha(accent, 0.28)}, transparent 55%)` }} />}
        <div style={{ position: 'relative' }}>
          {nav()}
          <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 18, marginTop: 26, alignItems: 'center' }}>
            <div>
              {v === 'corporate' && <span style={{ fontSize: 9, color: accent, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>● Trusted platform</span>}
              {headline()}
              {para()}
              {btns}
              {v === 'corporate' && <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>{['Secure', 'Fast', 'Reliable'].map((x) => <span key={x} style={{ fontSize: 8, border: `1px solid ${th.line}`, padding: '2px 6px', color: th.sub }}>✓ {x}</span>)}</div>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>{cards}</div>
          </div>
        </div>
      </div>
    );
  };

  const bentoLayout = () => (
    <div style={{ padding: '16px 18px', height: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {nav()}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gridTemplateRows: 'repeat(3,1fr)', gap: 8, flex: 1, minHeight: 0 }}>
        {card(0, { gridColumn: 'span 2', gridRow: 'span 2', padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }, <><div>{headline()}{para({ margin: '6px 0 0' })}</div><div>{btn('Get Started')}</div></>)}
        {card(1, { background: accent, border: 'none', padding: 10, color: onAcc, fontWeight: 800, fontSize: 12 }, <>Fast<br /><span style={{ fontSize: 9, fontWeight: 500 }}>by design</span></>)}
        {card(2, { padding: 10, display: 'flex', alignItems: 'flex-end', gap: 3 }, <>{[40, 70, 50, 90].map((h, k) => <i key={k} style={{ flex: 1, height: `${h}%`, background: alpha(accent, 0.3 + k * 0.2), borderRadius: 2 }} />)}</>)}
        {card(3, { gridColumn: 'span 2', padding: 10, display: 'flex', alignItems: 'center', gap: 6 }, <>{palette.slice(0, 5).map((c) => <i key={c} style={{ flex: 1, height: 30, borderRadius: 8, background: c }} />)}</>)}
        {card(4, { gridColumn: 'span 2', padding: 10 }, <>{bar('80%', 0.5)}{bar('60%')}{bar('70%', 0.25)}</>)}
        {card(5, { background: second, border: 'none' }, null)}
        {card(6, { display: 'flex', alignItems: 'center', justifyContent: 'center' }, <i style={{ width: 22, height: 22, borderRadius: '50%', border: `3px solid ${accent}` }} />)}
      </div>
    </div>
  );

  const editorialLayout = () => (
    <div style={{ padding: '14px 26px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, letterSpacing: '.15em', color: th.sub }}><span>VOL. 01 · 2026</span><span>SUBSCRIBE</span></div>
      <div style={{ textAlign: 'center', fontFamily: headFont, fontSize: 24, fontWeight: 700, padding: '6px 0', borderTop: `3px double ${th.fg}`, borderBottom: `3px double ${th.fg}`, margin: '6px 0 14px' }}>The Journal</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 18, flex: 1 }}>
        <div style={{ borderRight: `1px solid ${th.line}`, paddingRight: 16 }}>
          <span style={{ fontSize: 8, color: accent, letterSpacing: '.2em', fontWeight: 700 }}>FEATURE</span>
          {headline()}
          <p style={{ fontSize: 9, color: th.sub, margin: '8px 0', fontStyle: 'italic' }}>By the Editors · 5 min read</p>
          {bar('100%', 0.3)}{bar('96%', 0.3)}{bar('100%', 0.3)}{bar('72%', 0.3)}
          <div style={{ marginTop: 8 }}>{btn('Read story')}</div>
        </div>
        <div>
          <div style={{ height: 110, background: `linear-gradient(135deg,${accent},${second})`, border: `1px solid ${th.line}` }} />
          <p style={{ fontSize: 8, color: th.sub, margin: '5px 0 10px', fontStyle: 'italic' }}>Fig. 1 — {sub}</p>
          {bar('90%', 0.35)}{bar('80%', 0.3)}
        </div>
      </div>
    </div>
  );

  const posterLayout = () => {
    const brutal = t.variant === 'brutal';
    if (brutal) {
      return (
        <div style={{ padding: '16px 20px', height: '100%', position: 'relative' }}>
          {nav()}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 18, marginTop: 22 }}>
            {card(0, { padding: 14, background: accent, color: onAcc }, <>{headline(22)}<div style={{ marginTop: 12 }}>{btn('Get Started', false)}</div></>)}
            <div style={{ display: 'grid', gap: 12 }}>
              {card(1, { padding: 10 }, <>{bar('80%', 0.6)}{bar('55%')}</>)}
              {card(2, { padding: 10, background: second, color: lum(second) > 0.55 ? '#111' : '#fff' }, <span style={{ fontWeight: 800, fontSize: 11, textTransform: 'uppercase' }}>No fluff.</span>)}
            </div>
          </div>
          <span style={{ position: 'absolute', right: 26, bottom: 24, transform: 'rotate(-12deg)', background: third, color: lum(third) > 0.55 ? '#111' : '#fff', border: `2.5px solid ${th.fg}`, boxShadow: `3px 3px 0 ${th.fg}`, padding: '6px 10px', fontWeight: 900, fontSize: 11 }}>NEW!</span>
        </div>
      );
    }
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 20px 0' }}>{nav()}</div>
        <div style={{ flex: 1, padding: '0 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
          <div style={{ fontFamily: headFont, fontSize: 40, fontWeight: 900, lineHeight: 0.95, textTransform: 'uppercase', letterSpacing: '-.04em' }}>
            Build<br /><span style={{ background: accent, color: onAcc, padding: '0 8px' }}>something</span><br />bold
          </div>
          {btns}
        </div>
        <div style={{ background: accent, color: onAcc, overflow: 'hidden', whiteSpace: 'nowrap', padding: '8px 0', fontWeight: 900, fontSize: 11, letterSpacing: '.1em' }}>
          <motion.div animate={anim === 'none' ? {} : { x: [0, -160] }} transition={{ repeat: Infinity, duration: 6, ease: 'linear' }} style={{ display: 'inline-block' }}>
            {'GET STARTED ✦ BUILD BOLD ✦ GET STARTED ✦ BUILD BOLD ✦ GET STARTED ✦ BUILD BOLD ✦ GET STARTED ✦ BUILD BOLD ✦'}
          </motion.div>
        </div>
      </div>
    );
  };

  const glassLayout = () => (
    <div style={{ height: '100%', position: 'relative', padding: '18px 22px', overflow: 'hidden' }}>
      <i style={{ position: 'absolute', left: -30, top: -20, width: 190, height: 190, borderRadius: '50%', background: accent, filter: 'blur(34px)', opacity: 0.8 }} />
      <i style={{ position: 'absolute', right: -20, top: 60, width: 170, height: 170, borderRadius: '50%', background: second, filter: 'blur(34px)', opacity: 0.7 }} />
      <i style={{ position: 'absolute', left: '40%', bottom: -50, width: 190, height: 170, borderRadius: '50%', background: third, filter: 'blur(36px)', opacity: 0.7 }} />
      <div style={{ position: 'relative' }}>
        {nav()}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 22, alignItems: 'center' }}>
          <div>{headline()}{para()}{btns}</div>
          <div style={{ position: 'relative', height: 210 }}>
            {card(0, { position: 'absolute', top: 0, left: 10, width: '70%', padding: 12 }, <>{bar('70%', 0.7)}{bar('45%', 0.5)}</>)}
            {card(1, { position: 'absolute', top: 70, right: 0, width: '62%', padding: 12 }, <><div style={{ display: 'flex', gap: 3 }}>{palette.slice(0, 4).map((c) => <span key={c}>{sq(c)}</span>)}</div>{bar('80%', 0.5)}</>)}
            {card(2, { position: 'absolute', bottom: 0, left: 0, width: '66%', padding: 12 }, <>{bar('90%', 0.6)}{bar('60%', 0.4)}</>)}
          </div>
        </div>
      </div>
    </div>
  );

  const retroLayout = () => {
    const win = (i, title, children, style) => (
      <motion.div key={i} {...mp(i)} style={{ border: `2.5px solid ${th.fg}`, borderRadius: 8, boxShadow: `4px 4px 0 ${th.fg}`, background: th.bg, overflow: 'hidden', ...style }}>
        <div style={{ background: `linear-gradient(90deg,${accent},${second})`, borderBottom: `2.5px solid ${th.fg}`, padding: '3px 8px', display: 'flex', justifyContent: 'space-between', fontSize: 9, fontWeight: 700, color: lum(accent) > 0.55 ? '#111' : '#fff' }}>
          <span>{title}</span><span>▫ ▫ ✕</span>
        </div>
        <div style={{ padding: 10 }}>{children}</div>
      </motion.div>
    );
    return (
      <div style={{ height: '100%', padding: '16px 20px', position: 'relative', background: `linear-gradient(135deg,${alpha(accent, 0.3)},${alpha(second, 0.35)})`, backgroundImage: `repeating-linear-gradient(0deg,transparent 0 17px,${alpha(th.fg, 0.06)} 17px 18px),repeating-linear-gradient(90deg,transparent 0 17px,${alpha(th.fg, 0.06)} 17px 18px),linear-gradient(135deg,${alpha(accent, 0.3)},${alpha(second, 0.35)})` }}>
        {nav()}
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 14, marginTop: 18 }}>
          {win(0, 'welcome.exe', <>{headline()}{para()}{btns}</>)}
          <div style={{ display: 'grid', gap: 12 }}>
            {win(1, 'palette.exe', <div style={{ display: 'flex', gap: 3 }}>{palette.slice(0, 5).map((c) => <i key={c} style={{ flex: 1, height: 18, background: c, border: `1.5px solid ${th.fg}` }} />)}</div>)}
            {win(2, 'notes.txt', <>{bar('85%', 0.5)}{bar('60%')}</>)}
          </div>
        </div>
        <span style={{ position: 'absolute', right: 18, bottom: 12, fontSize: 26, color: third }}>✦</span>
      </div>
    );
  };

  const layouts = { center: centerLayout, split: splitLayout, bento: bentoLayout, editorial: editorialLayout, poster: posterLayout, glass: glassLayout, retro: retroLayout };
  const render = layouts[t.layout] || splitLayout;
  const frameBg = t.layout === 'retro' ? th.bg : th.bg;

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-white/15" style={{ boxShadow: `0 24px 60px -24px ${alpha(accent, 0.55)}` }}>
        <div className="flex items-center gap-2 bg-neutral-800 px-3 py-2">
          <i className="h-2.5 w-2.5 rounded-full bg-red-400" /><i className="h-2.5 w-2.5 rounded-full bg-yellow-400" /><i className="h-2.5 w-2.5 rounded-full bg-green-400" />
          <div className="ml-2 flex-1 truncate rounded-md bg-black/40 px-3 py-1 text-[10px] text-white/50">yourwebsite.com</div>
        </div>
        <motion.div
          key={`${design.style}-${design.theme}-${anim}-${typo.id}-${accent}`}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}
          style={{ background: frameBg, color: th.fg, fontFamily: typo.font, height: 430, overflow: 'hidden', fontSize: 11 }}
        >
          {render()}
        </motion.div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-white/80">
        {[`${styleLabel} Layout Draft`, `${themeLabel} Theme`, `${paletteName} Applied`, `Typography: ${typo.label}`, `Motion: ${motionLabel}`].map((chip) => (
          <span key={chip} className="rounded-lg border border-white/15 bg-neutral-900/95 px-3 py-1.5">{chip}</span>
        ))}
      </div>
    </div>
  );
}

/* ───────────── left-side option art ───────────── */
function StyleArt({ id, accent }) {
  const box = 'flex h-[72px] w-full items-center justify-center overflow-hidden';
  switch (id) {
    case 'minimal': return <div className={`${box} flex-col !items-start !justify-center gap-1.5 bg-neutral-700/40 px-5`}><i className="h-1.5 w-14 rounded bg-white/80" /><i className="h-1 w-24 rounded bg-white/30" /><i className="h-1 w-16 rounded bg-white/30" /></div>;
    case 'modern': return <div className={box} style={{ background: 'radial-gradient(circle at 70% 60%, #8a8a8a 0%, #2b2b2b 45%, #0e0e0e 100%)' }} />;
    case 'bold': return <div className={`${box} bg-black text-[32px] font-black tracking-tight text-white`}>Bold</div>;
    case 'editorial': return <div className={`${box} flex-col bg-neutral-200 text-black`}><span style={{ fontFamily: 'Georgia,serif' }} className="text-[21px] leading-none">Editorial</span><span className="mt-1.5 h-px w-4/5 bg-black/30" /><span className="mt-1 h-px w-4/5 bg-black/30" /></div>;
    case 'creative': return <div className={`${box} relative`} style={{ background: 'linear-gradient(135deg,#6d28d9,#ec4899)' }}><i className="absolute -left-3 top-6 h-14 w-14 rounded-full bg-yellow-400/90" /><i className="absolute right-2 top-0 h-12 w-12 rounded-full bg-orange-400" /><i className="absolute bottom-1 left-1/2 h-8 w-8 rounded-full bg-indigo-500" /></div>;
    case 'glass': return <div className={`${box} relative`} style={{ background: 'linear-gradient(135deg,#6366f1,#ec4899 60%,#f59e0b)' }}><i className="h-10 w-24 rounded-xl border border-white/40 bg-white/20 backdrop-blur-md" /></div>;
    case 'brutalist': return <div className={`${box} bg-yellow-300`}><span className="border-[3px] border-black bg-white px-3 py-1 text-[11px] font-black uppercase text-black" style={{ boxShadow: '4px 4px 0 #000' }}>Raw</span></div>;
    case 'bento': return <div className={`${box} grid grid-cols-4 grid-rows-2 gap-1 bg-neutral-900 p-2`}><i className="col-span-2 row-span-2 rounded-md bg-white/20" /><i className="rounded-md" style={{ background: accent }} /><i className="rounded-md bg-white/10" /><i className="col-span-2 rounded-md bg-white/15" /></div>;
    case 'retro': return <div className={`${box} p-2`} style={{ background: 'linear-gradient(135deg,#f9a8d4,#67e8f9)' }}><div className="w-full overflow-hidden rounded border-2 border-black bg-white"><div className="h-2.5 border-b-2 border-black bg-gradient-to-r from-pink-400 to-cyan-300" /><div className="h-5" /></div></div>;
    case 'luxury': return <div className={`${box} flex-col bg-black`}><span className="text-[15px] tracking-[0.3em] text-amber-300" style={{ fontFamily: 'Georgia,serif' }}>LUXE</span><i className="mt-1.5 block h-px w-12 bg-amber-300/70" /></div>;
    case 'corporate': return <div className={`${box} items-end gap-1 bg-slate-800 px-5 pb-3`}>{[40, 62, 48, 80, 94].map((h, k) => <i key={k} className="w-3 rounded-sm bg-sky-400/80" style={{ height: `${h * 0.55}%` }} />)}</div>;
    default: return <div className={`${box} relative bg-[#efe3cf]`}><i className="absolute -left-4 -top-4 h-16 w-20 bg-[#c2693e]/70" style={{ borderRadius: '60% 40% 55% 45%' }} /><i className="absolute -bottom-5 right-0 h-16 w-24 bg-[#7d8a4b]/70" style={{ borderRadius: '45% 55% 40% 60%' }} /></div>;
  }
}

function ThemeArt({ id }) {
  const c = THEME_COLORS[id];
  if (id === 'auto') {
    return <div className="relative h-[84px] w-full overflow-hidden"><div className="absolute inset-0" style={{ background: `linear-gradient(115deg,${THEME_COLORS.dark.bg} 50%,${THEME_COLORS.light.bg} 50%)` }} /><div className="absolute bottom-0 right-0 h-[58px] w-[56%] rounded-tl-xl bg-white/90 p-2"><i className="mb-1 block h-1 w-3/5 rounded bg-black/20" /><i className="block h-6 w-full rounded bg-amber-100" /></div></div>;
  }
  const dark = lum(c.bg) < 0.3;
  return (
    <div className="relative h-[84px] w-full" style={{ background: c.bg }}>
      <div className="absolute bottom-0 right-0 h-[66px] w-[62%] rounded-tl-xl p-2" style={{ background: dark ? 'rgba(255,255,255,.1)' : '#fff' }}>
        <div className="mb-1.5 flex gap-1"><i className="h-1.5 w-1.5 rounded-full bg-red-400" /><i className="h-1.5 w-1.5 rounded-full bg-yellow-400" /><i className="h-1.5 w-1.5 rounded-full bg-green-400" /></div>
        <i className="mb-1 block h-1 w-3/5 rounded" style={{ background: c.line }} /><i className="block h-7 w-full rounded" style={{ background: dark ? 'rgba(255,255,255,.12)' : '#fde9c4' }} />
      </div>
    </div>
  );
}

function Section({ n, title, children }) {
  return (
    <section>
      <h3 className="mb-3 text-[15px] font-semibold text-white"><span className="mr-1.5 text-white/40">{n}.</span>{title}</h3>
      {children}
    </section>
  );
}

/* ───────────── main step ───────────── */
export default function DesignPreferencesStep({ design, onChange, onBack, onNext }) {
  const [customColor, setCustomColor] = useState('#e0b25c');
  const paletteId = design.paletteId || 'amber';
  const activePalette = DESIGN_PALETTES.find((p) => p.id === paletteId);
  const palette = paletteId === 'custom' ? [customColor, '#ffffff', '#222222'] : (activePalette || DESIGN_PALETTES[0]).colors;
  const paletteName = paletteId === 'custom' ? 'Custom Palette' : (activePalette || DESIGN_PALETTES[0]).name;
  const typo = DESIGN_TYPOGRAPHY.find((t) => t.id === (design.typography || 'grotesk')) || DESIGN_TYPOGRAPHY[0];
  const accent = design.primaryColor || palette[0];
  const onAcc = lum(accent) > 0.55 ? '#111' : '#fff';
  const set = (patch) => onChange({ ...design, ...patch });

  const pickStyle = (s) => set({ style: s.id, ...(design.typographyTouched ? {} : { typography: s.typo }) });
  const pickPalette = (p) => set({ paletteId: p.id, palette: p.colors.join(', '), primaryColor: p.colors[0] });
  const pickCustom = (color) => { setCustomColor(color); set({ paletteId: 'custom', palette: color, primaryColor: color }); };

  const optStyle = (sel) => (sel ? { borderColor: alpha(accent, 0.85), background: alpha(accent, 0.1), boxShadow: `0 0 24px -6px ${alpha(accent, 0.6)}` } : undefined);
  const optCls = (sel) => `relative overflow-hidden rounded-2xl border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${sel ? '' : 'border-white/10 bg-white/[0.03] hover:border-white/25'}`;
  const badge = (text) => (
    <span className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide backdrop-blur" style={{ color: accent }}>
      {text}<span className="flex h-4 w-4 items-center justify-center rounded-full" style={{ background: accent, color: onAcc }}><Check size={10} strokeWidth={3} /></span>
    </span>
  );

  return (
    <div className="relative left-1/2 w-[min(1280px,94vw)] -translate-x-1/2">
      <div className="pointer-events-none absolute -inset-8 -z-10 opacity-60 transition-all duration-500" style={{ background: `radial-gradient(60% 50% at 75% 20%, ${alpha(accent, 0.18)}, transparent 70%)` }} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        {/* Left: controls */}
        <div className="rounded-3xl border border-white/10 bg-[#0a0a0c] p-6 lg:max-h-[calc(100vh-150px)] lg:overflow-y-auto">
          <h2 className="text-[26px] font-bold tracking-tight">Design Preferences</h2>
          <p className="mb-6 mt-1 text-sm text-white/45">Guide the AI's Design Agent to match your exact brand aesthetic. The whole preview re-designs as you choose.</p>

          <div className="space-y-7">
            <Section n={1} title="Vibe & Style">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Style">
                {DESIGN_STYLES.map((s) => {
                  const sel = design.style === s.id;
                  return (
                    <button key={s.id} type="button" role="radio" aria-checked={sel} onClick={() => pickStyle(s)} className={optCls(sel)} style={optStyle(sel)}>
                      {sel && badge('Selected')}
                      <StyleArt id={s.id} accent={accent} />
                      <p className="py-2 text-center text-[13px] font-medium">{s.label}</p>
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section n={2} title="Theme">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Theme">
                {DESIGN_THEMES.map((t) => {
                  const sel = design.theme === t.id;
                  const dark = lum(THEME_COLORS[t.id].bg) < 0.3;
                  return (
                    <button key={t.id} type="button" role="radio" aria-checked={sel} onClick={() => set({ theme: t.id })} className={`${optCls(sel)} text-left`} style={optStyle(sel)}>
                      {sel && <span className="absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full" style={{ background: accent, color: onAcc }}><Check size={11} strokeWidth={3} /></span>}
                      <ThemeArt id={t.id} />
                      <p className="absolute bottom-2 left-3 text-[13px] font-medium" style={{ color: t.id === 'auto' ? '#fff' : dark ? '#fff' : '#222' }}>{t.label}</p>
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section n={3} title="Color Palette">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Color palette">
                {DESIGN_PALETTES.map((p) => {
                  const sel = paletteId === p.id;
                  return (
                    <button key={p.id} type="button" role="radio" aria-checked={sel} onClick={() => pickPalette(p)} className={`${optCls(sel)} p-3 text-left`} style={optStyle(sel)}>
                      <p className="mb-2 text-[12px] font-medium leading-tight">{p.name}</p>
                      <div className="flex gap-1.5">{p.colors.map((c) => <i key={c} className="h-5 w-5 rounded-full border border-white/20" style={{ background: c }} />)}</div>
                    </button>
                  );
                })}
                <label className={`${optCls(paletteId === 'custom')} flex cursor-pointer items-center justify-center gap-2 p-3 text-[14px] font-medium`} style={optStyle(paletteId === 'custom')}>
                  Custom <Plus size={14} />
                  <input type="color" value={customColor} onChange={(e) => pickCustom(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Custom primary color" />
                  {paletteId === 'custom' && <i className="ml-1 h-4 w-4 rounded-full border border-white/30" style={{ background: customColor }} />}
                </label>
              </div>
            </Section>

            <Section n={4} title="Animation & Motion">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup" aria-label="Animation">
                {ANIMATION_OPTIONS.map((m) => {
                  const sel = design.animations === m.id;
                  const Icon = MOTION_ICONS[m.id] || Sparkles;
                  return (
                    <button key={m.id} type="button" role="radio" aria-checked={sel} onClick={() => set({ animations: m.id })} className={`${optCls(sel)} flex flex-col items-center gap-1.5 px-2 py-4`} style={optStyle(sel)}>
                      {sel && <span className="absolute right-1.5 top-1.5 rounded-full bg-black/65 px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: accent }}>Selected</span>}
                      <Icon size={24} style={{ color: sel ? accent : 'rgba(255,255,255,.6)' }} />
                      <span className="text-[13px] font-medium">{m.label}</span>
                      <span className="text-[10px] text-white/35">{m.hint}</span>
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section n={5} title="Typography Accent">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Typography">
                {DESIGN_TYPOGRAPHY.map((t) => {
                  const sel = typo.id === t.id;
                  return (
                    <button key={t.id} type="button" role="radio" aria-checked={sel} onClick={() => set({ typography: t.id, typographyTouched: true })} className={`${optCls(sel)} px-4 py-3 text-left`} style={optStyle(sel)}>
                      <span className="block text-[26px] leading-none" style={{ fontFamily: t.font }}>Aa</span>
                      <span className="mt-1.5 block text-[12px] text-white/70">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </Section>
          </div>
        </div>

        {/* Right: live preview */}
        <div className="flex flex-col self-start rounded-3xl border bg-[#0a0a0c] p-6 transition-colors" style={{ borderColor: alpha(accent, 0.28) }}>
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-[22px] font-bold tracking-tight">Live Mockup Preview <span className="text-white/60">(Agent Draft)</span></h2>
            <span className="inline-flex shrink-0 items-center gap-2 text-xs text-white/50"><Loader2 size={14} className="animate-spin" style={{ color: accent }} /> Rendering in Real-Time</span>
          </div>
          <LivePreview design={design} palette={palette} paletteName={paletteName} typo={typo} />
          <div className="mt-6 flex items-center justify-between gap-3">
            <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-[14px] font-bold"><ArrowLeft size={15} /> Back</button>
            <div className="flex items-center gap-4">
              <span className="hidden items-center gap-2 text-xs text-white/40 sm:inline-flex"><Timer size={14} /> AI is ready to generate</span>
              <button type="button" onClick={onNext} className="inline-flex items-center gap-2 rounded-xl px-7 py-3 text-[14px] font-bold" style={{ background: `linear-gradient(135deg,${shade(accent, 0.25)},${accent},${shade(accent, -0.25)})`, color: onAcc, boxShadow: `0 0 28px -6px ${alpha(accent, 0.75)}` }}>
                Continue to Generate <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
