import React, { useRef, useState } from 'react';
import { toJpeg } from 'html-to-image';
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
  clay: { layout: 'clay', radius: 28, border: 'none', shadow: 'clay', hw: 800, upper: false, ls: '-0.02em', size: 26, btn: 'clay' },
  glass: { layout: 'glass', radius: 20, border: 'hairline', shadow: 'soft', hw: 700, upper: false, ls: '-0.02em', size: 25, btn: 'pill' },
  brutalist: { layout: 'poster', variant: 'brutal', radius: 0, border: 'thick', shadow: 'hard', hw: 800, upper: true, ls: '-0.02em', size: 24, btn: 'brutal' },
  bento: { layout: 'bento', radius: 16, border: 'hairline', shadow: 'none', hw: 700, upper: false, ls: '-0.02em', size: 19, btn: 'soft' },
  retro: { layout: 'retro', radius: 8, border: 'thick', shadow: 'hard', hw: 700, upper: false, ls: '0', size: 20, btn: 'chrome' },
  luxury: { layout: 'center', variant: 'luxury', radius: 0, border: 'hairline', shadow: 'none', hw: 400, upper: true, ls: '.12em', size: 19, btn: 'gold' },
  corporate: { layout: 'split', variant: 'corporate', radius: 6, border: 'hairline', shadow: 'soft', hw: 700, upper: false, ls: '-0.01em', size: 23, btn: 'block' },
  organic: { layout: 'split', variant: 'organic', radius: 34, border: 'none', shadow: 'soft', hw: 700, upper: false, ls: '-0.02em', size: 26, btn: 'pill' },
  retrofuturist: { layout: 'retrofuturist', radius: 6, border: 'hairline', shadow: 'glow', hw: 800, upper: false, ls: '-0.045em', size: 28, btn: 'retrofuture' },
  maximalist: { layout: 'maximalist', radius: 0, border: 'thick', shadow: 'hard', hw: 900, upper: true, ls: '-0.055em', size: 30, btn: 'maximalist' },
};

const HEADLINE = 'Build something people remember';

/* ───────────── live preview (full re-layout per style) ───────────── */
function LivePreview({ design, palette, paletteName, typo, captureRef }) {
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
  const glass = design.style === 'glass';
  const clay = design.style === 'clay';
  const dark = lum(th.bg) < 0.3;
  const canvas = clay ? (dark ? shade(th.bg, 0.1) : shade(accent, 0.9)) : th.bg;
  const clayFill = dark ? shade(th.bg, 0.2) : shade(accent, 0.96);
  const clayShadow = (d = 1) => `${10 * d}px ${10 * d}px ${24 * d}px ${dark ? 'rgba(0,0,0,.55)' : alpha(accent, 0.38)}, inset ${-6 * d}px ${-6 * d}px ${12 * d}px ${dark ? 'rgba(0,0,0,.35)' : 'rgba(0,0,0,.10)'}, inset ${6 * d}px ${6 * d}px ${12 * d}px ${dark ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.85)'}`;
  const mp = (i = 0) => {
    if (anim === 'none') return {};
    if (anim === 'subtle') return { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.45, delay: i * 0.04 } };
    if (anim === 'scroll') return { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45, delay: i * 0.08 } };
    if (anim === 'interactive') return { whileHover: { y: -3, scale: 1.025 }, whileTap: { scale: .985 }, transition: { type: 'spring', stiffness: 300, damping: 20 } };
    if (anim === 'parallax') return { animate: { y: [0, i % 2 ? 6 : -6, 0] }, transition: { repeat: Infinity, duration: 4 + i * .25, ease: 'easeInOut' } };
    if (anim === 'kinetic') return { initial: { opacity: 0, scale: .96 }, animate: { opacity: 1, scale: 1 }, transition: { duration: .35, delay: i * .07 } };
    return { animate: { y: [0, -4, 0] }, transition: { repeat: Infinity, duration: 3 + i * .2, delay: i * .15, ease: 'easeInOut' } };
  };

  const surface = {
    background: glass ? 'rgba(255,255,255,.14)' : clay ? clayFill : th.panel,
    border: glass ? '1px solid rgba(255,255,255,.30)' : t.border === 'thick' ? `2.5px solid ${th.fg}` : t.border === 'none' ? 'none' : `1px solid ${th.line}`,
    borderRadius: clay ? 28 : t.radius,
    boxShadow: clay ? clayShadow(.72) : t.shadow === 'hard' ? `4px 4px 0 ${th.fg}` : t.shadow === 'soft' ? '0 12px 32px -16px rgba(0,0,0,.55)' : t.shadow === 'glow' ? `0 0 24px ${alpha(accent,.22)}` : 'none',
    backdropFilter: glass ? 'blur(16px) saturate(150%)' : undefined,
    WebkitBackdropFilter: glass ? 'blur(16px) saturate(150%)' : undefined,
  };

  const card = (i, style, children) => <motion.div key={`card-${i}`} {...mp(i)} style={{ ...surface, ...style }}>{children}</motion.div>;
  const line = (w = '100%', opacity = .28) => <i style={{ display: 'block', width: w, height: 4, borderRadius: 2, background: th.sub, opacity, marginBottom: 4 }} />;
  const rule = (double = false) => <i style={{ display: 'block', height: double ? 3 : 1, borderTop: double ? `3px double ${th.fg}` : `1px solid ${th.line}` }} />;
  const chip = (label, color = accent) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 7px', borderRadius: t.radius || 3, border: `1px solid ${alpha(color, .35)}`, color, fontSize: 7.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}>{label}</span>;
  const btn = (label, primary = true) => {
    const base = { fontSize: 8.5, fontWeight: 800, padding: '7px 12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' };
    const maps = {
      minimal: { borderRadius: 2, background: 'transparent', color: th.fg, border: `1px solid ${primary ? th.fg : th.line}` },
      modern: { borderRadius: 9, background: primary ? accent : 'transparent', color: primary ? onAcc : th.fg, border: primary ? 'none' : `1px solid ${th.line}` },
      bold: { borderRadius: 0, background: primary ? accent : 'transparent', color: primary ? onAcc : th.fg, border: `2px solid ${th.fg}`, textTransform: 'uppercase' },
      editorial: { borderRadius: 0, background: 'transparent', color: th.fg, border: `1px solid ${primary ? th.fg : th.line}`, fontFamily: headFont },
      creative: { borderRadius: 999, background: primary ? `linear-gradient(135deg,${accent},${third})` : 'transparent', color: primary ? '#fff' : th.fg, border: primary ? 'none' : `1px solid ${th.line}` },
      glass: { borderRadius: 999, background: primary ? accent : 'rgba(255,255,255,.12)', color: primary ? onAcc : th.fg, border: `1px solid rgba(255,255,255,.25)` },
      clay: { borderRadius: 999, background: primary ? `linear-gradient(145deg,${shade(accent,.3)},${accent})` : clayFill, color: primary ? onAcc : th.fg, border: 'none', boxShadow: clayShadow(.5) },
      brutalist: { borderRadius: 0, background: primary ? accent : th.bg, color: primary ? onAcc : th.fg, border: `2.5px solid ${th.fg}`, boxShadow: `3px 3px 0 ${th.fg}`, textTransform: 'uppercase' },
      bento: { borderRadius: 10, background: primary ? accent : 'transparent', color: primary ? onAcc : th.fg, border: primary ? 'none' : `1px solid ${th.line}` },
      retro: { borderRadius: 999, background: primary ? `linear-gradient(180deg,${shade(accent,.55)},${accent} 55%,${shade(accent,-.2)})` : th.panel, color: primary ? onAcc : th.fg, border: `2px solid ${th.fg}`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.75)' },
      luxury: { borderRadius: 0, background: 'transparent', color: accent, border: `1px solid ${accent}`, textTransform: 'uppercase', letterSpacing: '.16em' },
      corporate: { borderRadius: 6, background: primary ? accent : 'transparent', color: primary ? onAcc : th.fg, border: primary ? 'none' : `1px solid ${th.line}` },
      organic: { borderRadius: 999, background: primary ? accent : 'transparent', color: primary ? onAcc : th.fg, border: primary ? 'none' : `1px solid ${th.line}` },
      retrofuturist: { borderRadius: 6, background: primary ? `linear-gradient(135deg,${accent},${third})` : 'rgba(255,255,255,.05)', color: primary ? onAcc : th.fg, border: `1px solid ${alpha(accent,.65)}`, boxShadow: primary ? `0 0 18px ${alpha(accent,.28)}` : 'none', textTransform: 'uppercase', letterSpacing: '.08em' },
      maximalist: { borderRadius: 0, background: primary ? accent : th.bg, color: primary ? onAcc : th.fg, border: `2px solid ${th.fg}`, boxShadow: primary ? `5px 5px 0 ${third}` : '3px 3px 0 rgba(0,0,0,.35)', textTransform: 'uppercase' },
    };
    return <span style={{ ...base, ...(maps[design.style] || maps.modern) }}>{label}</span>;
  };

  const headline = (text = 'Build something people remember', size) => (
    <h4 style={{ fontFamily: headFont, fontWeight: t.hw, fontSize: size || t.size, letterSpacing: t.ls, lineHeight: .98, textTransform: t.upper ? 'uppercase' : 'none', margin: 0 }}>
      {anim === 'kinetic' ? text.split(' ').map((w, i) => <motion.span key={i} style={{ display: 'inline-block', marginRight: '.24em' }} animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 1.8, delay: i * .12 }}>{w}</motion.span>) : text}
    </h4>
  );

  const body = (text = 'A considered digital experience with clear hierarchy, purposeful detail and a strong visual point of view.') => (
    <p style={{ margin: '8px 0 12px', color: th.sub, fontSize: 9.2, lineHeight: 1.55 }}>{text}</p>
  );

  const logo = <span style={{ fontWeight: 850, fontFamily: headFont, letterSpacing: t.variant === 'luxury' ? '.14em' : '-.02em' }}>● YOURBRAND</span>;
  const nav = ({ simple = false } = {}) => (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 8.5,
      padding: glass || clay ? '6px 10px' : '0 0 7px',
      ...(glass || clay ? { ...surface, borderRadius: 999 } : {}),
      ...(!glass && !clay ? { borderBottom: `1px solid ${th.line}` } : {}),
    }}>
      {logo}
      {!simple && <span style={{ display: 'flex', gap: 11, color: th.sub }}><span>Work</span><span>About</span><span>Notes</span><span>Contact</span></span>}
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{design.theme === 'auto' && <span style={{ color: th.sub }}>☾/☀</span>}{btn(design.style === 'luxury' ? 'Enquire' : 'Start', true)}</span>
    </div>
  );

  const visual = (i, style = {}) => (
    <motion.div {...mp(i)} style={{
      minHeight: 105, position: 'relative', overflow: 'hidden',
      background: `linear-gradient(135deg,${accent},${second} 52%,${third})`,
      borderRadius: design.style === 'bold' || design.style === 'brutalist' || design.style === 'luxury' ? 0 : t.radius,
      ...style,
    }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 25% 25%,rgba(255,255,255,.35),transparent 28%),linear-gradient(120deg,transparent 35%,rgba(0,0,0,.22))` }} />
      <span style={{ position: 'absolute', left: 9, bottom: 8, color: '#fff', fontSize: 7, fontWeight: 800, letterSpacing: '.1em' }}>ART-DIRECTED VISUAL</span>
    </motion.div>
  );

  const metric = (value, label, i = 0) => card(i, { padding: 10 }, <><strong style={{ display: 'block', fontFamily: headFont, fontSize: 18 }}>{value}</strong><span style={{ color: th.sub, fontSize: 7.5 }}>{label}</span></>);
  const projectRow = (i, title, kind = 'Web') => (
    <motion.div {...mp(i)} style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto', alignItems: 'center', gap: 7, padding: '7px 0', borderBottom: `1px solid ${th.line}` }}>
      <span style={{ fontSize: 7, color: accent, fontWeight: 900 }}>0{i + 1}</span><span style={{ fontSize: 8.5, fontWeight: 750 }}>{title}</span><span style={{ fontSize: 7, color: th.sub }}>{kind} ↗</span>
    </motion.div>
  );

  const minimalLayout = () => (
    <div style={{ padding: '18px 28px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {nav()}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.2fr .8fr', alignItems: 'center', gap: 24 }}>
        <div>{chip('Independent studio', accent)}<div style={{ marginTop: 8 }}>{headline('Designing quiet, useful digital products', 29)}</div>{body()}<div style={{ display: 'flex', gap: 7 }}>{btn('View work')}{btn('About', false)}</div></div>
        <div>{visual(1, { minHeight: 180, filter: 'grayscale(.8)' })}<div style={{ marginTop: 6, fontSize: 7, color: th.sub }}>Selected work · 2026</div></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, paddingTop: 10, borderTop: `1px solid ${th.line}` }}>{['Brand systems','Digital products','Art direction'].map((x,i)=><div key={x}><span style={{ fontSize: 7, color: th.sub }}>0{i+1}</span><div style={{ fontSize: 8.5, marginTop: 3 }}>{x}</div></div>)}</div>
    </div>
  );

  const modernLayout = () => (
    <div style={{ padding: '16px 20px', height: '100%' }}>
      {nav()}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 15, alignItems: 'stretch' }}>
        <div style={{ padding: 6 }}>{chip('Product studio', accent)}<div style={{ marginTop: 7 }}>{headline('Build faster. Look unmistakable.', 27)}</div>{body('A polished product experience with modular systems, strong conversion paths and an editorial layer.') }<div style={{ display: 'flex', gap: 6 }}>{btn('Book a call')}{btn('Explore', false)}</div></div>
        {card(1,{padding:8, minHeight:170},<><div style={{ display:'flex', justifyContent:'space-between', marginBottom:7 }}><span style={{fontSize:7,color:th.sub}}>Overview</span><span style={{fontSize:7,color:accent}}>Live</span></div>{visual(2,{minHeight:78,borderRadius:10})}<div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:5,marginTop:6}}>{metric('42%','growth',3)}{metric('18.4k','users',4)}{metric('4.9','rating',5)}</div></>)}
      </div>
      <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:7,marginTop:9 }}>{['Strategy','Design systems','Launch'].map((x,i)=>card(i+6,{padding:9},<><span style={{fontSize:7,color:accent}}>0{i+1}</span><strong style={{display:'block',fontSize:9,marginTop:4}}>{x}</strong><span style={{fontSize:7,color:th.sub}}>Clear, measurable output</span></>))}</div>
    </div>
  );

  const boldLayout = () => (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', background:th.bg }}>
      <div style={{padding:'11px 16px'}}>{nav()}</div>
      <div style={{padding:'5px 16px',flex:1,display:'flex',flexDirection:'column',justifyContent:'center'}}>
        <div style={{fontSize:8,fontWeight:900,letterSpacing:'.18em',color:accent}}>CREATIVE TECHNOLOGY / 2026</div>
        {headline('MAKE IT LOUD.', 42)}
        <div style={{display:'flex',alignItems:'center',gap:10,marginTop:10}}><span style={{fontSize:9,maxWidth:210,color:th.sub}}>Identity, interfaces and digital worlds built with a point of view.</span>{btn('See work')}</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',borderTop:`3px solid ${th.fg}`}}>{['01 / Work','02 / Studio','03 / Contact'].map((x,i)=><div key={x} style={{padding:'7px 10px',borderRight:i<2?`2px solid ${th.fg}`:'none',fontSize:8,fontWeight:900}}>{x}</div>)}</div>
      <div style={{background:accent,color:onAcc,padding:'6px 0',overflow:'hidden',whiteSpace:'nowrap',fontSize:8,fontWeight:900}}><motion.span animate={anim==='none'?{}:{x:[0,-180]}} transition={{repeat:Infinity,duration:5,ease:'linear'}} style={{display:'inline-block'}}>BUILD BOLD ✦ BREAK THE GRID ✦ BUILD BOLD ✦ BREAK THE GRID ✦</motion.span></div>
    </div>
  );

  const editorialLayout = () => (
    <div style={{padding:'10px 20px',height:'100%',fontFamily:headFont}}>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:7,color:th.sub,letterSpacing:'.14em'}}><span>VOL. 01 · OCTOBER 2026</span><span>SUBSCRIBE</span></div>
      <div style={{textAlign:'center',fontSize:23,fontWeight:800,padding:'6px 0',margin:'5px 0 9px'}}>{rule(true)}<div style={{padding:'4px 0'}}>THE JOURNAL</div>{rule(true)}</div>
      <div style={{display:'grid',gridTemplateColumns:'1.15fr .85fr',gap:14}}>
        <article>{chip('Cover story',accent)}<div style={{marginTop:5}}>{headline('The new language of digital craft',25)}</div><p style={{fontFamily:'Georgia,serif',fontSize:8.5,lineHeight:1.45,color:th.sub}}>A visual essay on systems, typography and the spaces between interfaces.</p><div style={{display:'flex',gap:8,fontSize:7,color:th.sub,fontStyle:'italic'}}>By The Editors · 7 min read</div></article>
        <div>{visual(2,{minHeight:145})}<div style={{fontFamily:'Georgia,serif',fontSize:7,color:th.sub,fontStyle:'italic',marginTop:4}}>Fig. 01 · Material studies in motion</div></div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginTop:10,paddingTop:8,borderTop:`1px solid ${th.line}`}}><div>{projectRow(3,'Interfaces after dark','Essay')}{projectRow(4,'The art of restraint','Interview')}</div><div>{projectRow(5,'A softer internet','Review')}{projectRow(6,'Archive / Issue 01','Index')}</div></div>
    </div>
  );

  const creativeLayout = () => (
    <div style={{height:'100%',padding:'14px 18px',position:'relative',overflow:'hidden'}}>
      <i style={{position:'absolute',right:-35,top:35,width:150,height:150,borderRadius:'50%',background:alpha(accent,.65)}}/><i style={{position:'absolute',left:-30,bottom:-35,width:130,height:130,borderRadius:'50%',background:alpha(second,.65)}}/>
      {nav()}
      <div style={{position:'relative',display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:15,alignItems:'center'}}>
        <div><span style={{display:'inline-block',transform:'rotate(-3deg)',background:third,color:lum(third)>.55?'#111':'#fff',padding:'4px 8px',fontSize:7,fontWeight:900}}>HELLO, INTERNET!</span><div style={{marginTop:7}}>{headline('Ideas with a little more color.',28)}</div>{body()}<div style={{display:'flex',gap:6}}>{btn('Let’s make')}</div></div>
        <div style={{position:'relative',height:195}}>{card(1,{position:'absolute',left:4,top:6,width:'72%',padding:9,transform:'rotate(-3deg)',background:accent,color:onAcc},<><span style={{fontSize:7}}>PROJECT 01</span><div style={{marginTop:9,fontWeight:900,fontSize:13}}>Motion / Brand</div></>)}{card(2,{position:'absolute',right:0,top:55,width:'65%',padding:9,transform:'rotate(2.5deg)',background:second},<>{line('80%',.55)}{line('55%',.4)}{line('70%',.3)}</>)}{card(3,{position:'absolute',left:28,bottom:4,width:'62%',padding:10,transform:'rotate(1deg)',background:third},<span style={{fontSize:15,fontWeight:900}}>✦ 12</span>)}</div>
      </div>
    </div>
  );

  const glassLayout = () => (
    <div style={{height:'100%',padding:'15px 18px',position:'relative',overflow:'hidden',background:`radial-gradient(circle at 15% 15%,${alpha(accent,.55)},transparent 34%),radial-gradient(circle at 85% 40%,${alpha(second,.5)},transparent 38%),radial-gradient(circle at 55% 100%,${alpha(third,.45)},transparent 40%),${th.bg}`}}>
      {nav()}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:15,alignItems:'center'}}>
        <div style={{padding:4}}>{chip('Liquid interface',accent)}<div style={{marginTop:7}}>{headline('Depth without the clutter.',28)}</div>{body('Translucent surfaces, luminous gradients and layered information create a calm spatial interface.')}{btn('Explore experience')}</div>
        <div style={{position:'relative',height:205}}>{card(1,{position:'absolute',top:0,left:6,width:'76%',padding:10},<><div style={{display:'flex',justifyContent:'space-between',fontSize:7,color:th.sub}}><span>Dashboard</span><span>•••</span></div>{visual(2,{minHeight:65,borderRadius:14,marginTop:6})}</>)}{card(3,{position:'absolute',top:76,right:0,width:'68%',padding:10},<><span style={{fontSize:7,color:th.sub}}>Revenue</span><strong style={{display:'block',fontSize:16,margin:'4px 0'}}>₹84.2k</strong><div style={{height:3,background:alpha(accent,.2),borderRadius:9}}><i style={{display:'block',width:'74%',height:'100%',background:accent,borderRadius:9}}/></div></>)}{card(4,{position:'absolute',bottom:0,left:0,width:'62%',padding:10},<><span style={{fontSize:7}}>Now playing</span><div style={{marginTop:5,fontWeight:800,fontSize:9}}>Ambient Systems</div></>)}</div>
      </div>
    </div>
  );

  const clayLayout = () => (
    <div style={{height:'100%',padding:'13px 18px',position:'relative',overflow:'hidden',background:canvas}}>
      <i style={{position:'absolute',right:-35,top:50,width:135,height:135,borderRadius:'50%',background:`linear-gradient(145deg,${shade(accent,.35)},${accent})`,boxShadow:clayShadow(1)}}/><i style={{position:'absolute',left:-28,bottom:-25,width:100,height:100,borderRadius:'50%',background:`linear-gradient(145deg,${shade(second,.35)},${second})`,boxShadow:clayShadow(.8)}}/>
      {nav()}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:14,alignItems:'center',position:'relative'}}>
        <div>{chip('Soft launch',accent)}<div style={{marginTop:6}}>{headline('Friendly by design.',27)}</div>{body('Puffy surfaces, warm color and tactile feedback make every action feel approachable.')}{btn('Get started')}</div>
        <div style={{position:'relative',height:190}}>{card(1,{position:'absolute',top:0,left:4,width:'76%',padding:10},<><div style={{display:'flex',alignItems:'center',gap:7}}><span style={{width:27,height:27,borderRadius:10,background:accent,color:onAcc,display:'grid',placeItems:'center',boxShadow:clayShadow(.25)}}>↗</span><div><strong style={{fontSize:13}}>12.4k</strong><div style={{fontSize:7,color:th.sub}}>happy users</div></div></div></>)}{card(2,{position:'absolute',top:65,right:0,width:'68%',padding:10},<><span style={{fontSize:7}}>Progress</span><div style={{height:12,borderRadius:99,marginTop:6,background:alpha(accent,.14),boxShadow:'inset 3px 3px 7px rgba(0,0,0,.12),inset -3px -3px 7px rgba(255,255,255,.75)',padding:2}}><i style={{display:'block',height:'100%',width:'68%',borderRadius:99,background:accent}}/></div></>)}{card(3,{position:'absolute',bottom:0,left:0,width:'61%',padding:'8px 10px'},<span style={{fontSize:8,fontWeight:800}}>★ Loved by humans</span>)}</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:7,marginTop:5}}>{['Playful','Tactile','Warm'].map((x,i)=>card(i+5,{padding:8},<><span style={{fontSize:13,color:[accent,second,third][i]}}>{['✦','♥','●'][i]}</span><strong style={{display:'block',fontSize:8}}>{x}</strong></>))}</div>
    </div>
  );

  const brutalistLayout = () => (
    <div style={{height:'100%',padding:'11px 15px',background:th.bg,backgroundImage:`linear-gradient(${alpha(th.fg,.08)} 1px,transparent 1px),linear-gradient(90deg,${alpha(th.fg,.08)} 1px,transparent 1px)`,backgroundSize:'18px 18px',position:'relative'}}>
      {nav()}
      <div style={{display:'grid',gridTemplateColumns:'1.15fr .85fr',gap:11,marginTop:13}}>
        <div>{chip('NO TEMPLATE',accent)}<div style={{marginTop:6}}>{headline('THE WEB IS NOT A BUSINESS CARD.',29)}</div>{body('Raw type. Visible structure. Useful weirdness. A digital identity that refuses to disappear.')}{btn('Enter archive')}</div>
        <div style={{display:'grid',gap:7}}>{card(1,{padding:9,background:accent,color:onAcc},<><span style={{fontSize:7}}>SELECTED WORK</span><strong style={{display:'block',fontSize:15,marginTop:8}}>01 / AETHER</strong></>)}{card(2,{padding:9},<>{projectRow(3,'Design systems','2026')}{projectRow(4,'Interfaces','2025')}</>)}</div>
      </div>
      <span style={{position:'absolute',right:20,bottom:20,transform:'rotate(-8deg)',background:third,color:lum(third)>.55?'#111':'#fff',border:`2px solid ${th.fg}`,boxShadow:`3px 3px 0 ${th.fg}`,padding:'5px 8px',fontSize:9,fontWeight:900}}>NEW / 001</span>
    </div>
  );

  const bentoLayout = () => (
    <div style={{height:'100%',padding:'12px 15px',display:'flex',flexDirection:'column',gap:7}}>
      {nav()}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gridTemplateRows:'repeat(3,1fr)',gap:6,flex:1,minHeight:0}}>
        {card(1,{gridColumn:'span 2',gridRow:'span 2',padding:12,display:'flex',flexDirection:'column',justifyContent:'space-between'},<><div>{chip('Featured',accent)}<div style={{marginTop:6}}>{headline('One idea per tile.',22)}</div>{body('A modular system where every block earns its space.')}</div>{btn('View work')}</>)}
        {card(2,{background:accent,color:onAcc,padding:9},<><span style={{fontSize:7}}>GROWTH</span><strong style={{display:'block',fontSize:19,marginTop:7}}>+42%</strong></>)}
        {card(3,{padding:8},<><span style={{fontSize:7,color:th.sub}}>Pulse</span><div style={{display:'flex',alignItems:'end',gap:3,height:43,marginTop:6}}>{[30,52,38,70,58,88].map((h,i)=><i key={i} style={{flex:1,height:`${h}%`,background:i===5?accent:alpha(accent,.35),borderRadius:2}}/>)}</div></>)}
        {card(4,{gridColumn:'span 2',padding:8},<><span style={{fontSize:7,color:th.sub}}>Capabilities</span><div style={{display:'flex',gap:5,marginTop:7}}>{['01 Strategy','02 Product','03 Motion'].map(x=><span key={x} style={{fontSize:7,padding:'4px 6px',borderRadius:6,background:alpha(accent,.12)}}>{x}</span>)}</div></>)}
        {card(5,{gridColumn:'span 2',padding:8},<><span style={{fontSize:7,color:th.sub}}>Project</span><strong style={{display:'block',fontSize:10,marginTop:4}}>Atlas / digital identity</strong></>)}
        {card(6,{padding:8,background:second,color:lum(second)>.55?'#111':'#fff'},<strong style={{fontSize:13}}>4.9★</strong>)}
        {card(7,{padding:8},<><span style={{fontSize:7}}>Contact</span><strong style={{display:'block',fontSize:10,marginTop:7}}>Let’s talk ↗</strong></>)}
      </div>
    </div>
  );

  const retroLayout = () => {
    const win = (i, title, children) => <motion.div {...mp(i)} style={{border:`2px solid ${th.fg}`,borderRadius:7,boxShadow:`4px 4px 0 ${th.fg}`,background:th.bg,overflow:'hidden'}}><div style={{background:`linear-gradient(90deg,${accent},${second})`,borderBottom:`2px solid ${th.fg}`,padding:'3px 7px',display:'flex',justifyContent:'space-between',fontSize:7,fontWeight:900,color:lum(accent)>.55?'#111':'#fff'}}><span>{title}</span><span>□ □ ✕</span></div><div style={{padding:8}}>{children}</div></motion.div>;
    return <div style={{height:'100%',padding:'12px 15px',background:`repeating-linear-gradient(0deg,transparent 0 15px,${alpha(th.fg,.06)} 15px 16px),repeating-linear-gradient(90deg,transparent 0 15px,${alpha(th.fg,.06)} 15px 16px),linear-gradient(135deg,${alpha(accent,.25)},${alpha(second,.25)})`}}>
      {nav()}
      <div style={{display:'grid',gridTemplateColumns:'1.25fr .75fr',gap:10,marginTop:12}}>{win(1,'WELCOME.EXE',<><div style={{fontFamily:headFont,fontWeight:900,fontSize:22}}>{headline('WELCOME, WEB SURFER.',22)}</div>{body('Best viewed with curiosity. Built for the next browser.')}{btn('ENTER SITE')}</>)}<div style={{display:'grid',gap:9}}>{win(2,'PALETTE.EXE',<div style={{display:'flex',gap:3}}>{palette.slice(0,5).map(c=><i key={c} style={{flex:1,height:24,background:c,border:`1px solid ${th.fg}`}}/>)}</div>)}{win(3,'NOTES.TXT',<>{line('80%',.5)}{line('62%',.4)}<span style={{fontSize:7,color:accent}}>★ guestbook open</span></>)}</div></div>
      <span style={{position:'absolute',right:18,bottom:10,fontSize:23,color:third}}>✦</span>
    </div>;
  };

  const luxuryLayout = () => (
    <div style={{height:'100%',padding:'13px 24px',fontFamily:headFont}}>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:7,letterSpacing:'.18em',color:th.sub}}><span>ATELIER / 2026</span><span>PRIVATE VIEWING</span></div>
      <div style={{textAlign:'center',padding:'7px 0'}}>{rule()}<div style={{fontSize:20,letterSpacing:'.24em',margin:'7px 0',fontWeight:500}}>MAISON NOIR</div>{rule()}</div>
      <div style={{display:'grid',gridTemplateColumns:'.8fr 1.2fr',gap:18,alignItems:'center',marginTop:12}}>
        <div><span style={{fontSize:7,letterSpacing:'.22em',color:accent}}>A STUDY IN RESTRAINT</span><div style={{marginTop:8}}>{headline('Objects with a quiet presence.',25)}</div><p style={{fontSize:8.5,lineHeight:1.55,color:th.sub}}>A considered portfolio for work that values material, proportion and time.</p><div style={{marginTop:10}}>{btn('Enquire')}</div></div>
        <div>{visual(2,{minHeight:175})}<div style={{display:'flex',justifyContent:'space-between',fontSize:7,color:th.sub,marginTop:4}}><span>Collection I</span><span>01 — 06</span></div></div>
      </div>
      <div style={{marginTop:12}}>{rule()}<div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,paddingTop:8}}>{['Selected work','Press & awards','Contact'].map((x,i)=><div key={x}><span style={{fontSize:7,color:accent}}>0{i+1}</span><div style={{fontSize:8,marginTop:4}}>{x}</div></div>)}</div></div>
    </div>
  );

  const corporateLayout = () => (
    <div style={{height:'100%',padding:'13px 17px'}}>
      {nav()}
      <div style={{display:'grid',gridTemplateColumns:'1.05fr .95fr',gap:12,marginTop:13}}>
        <div><span style={{fontSize:7,color:accent,fontWeight:900,letterSpacing:'.12em'}}>TRUSTED DIGITAL PARTNER</span><div style={{marginTop:6}}>{headline('Clarity that compounds.',25)}</div>{body('A structured experience for teams that need reliable delivery, measurable outcomes and a clear operating model.')}{btn('Request demo')} <span style={{marginLeft:6}}>{btn('Case studies',false)}</span><div style={{display:'flex',gap:5,marginTop:9}}>{['SOC 2','99.9% uptime','24/7'].map(x=><span key={x} style={{fontSize:6.5,padding:'3px 5px',border:`1px solid ${th.line}`,borderRadius:3,color:th.sub}}>✓ {x}</span>)}</div></div>
        {card(1,{padding:8},<><div style={{display:'flex',justifyContent:'space-between',fontSize:7,color:th.sub}}><span>Performance</span><span>Q3</span></div><div style={{display:'flex',alignItems:'end',gap:4,height:75,marginTop:8}}>{[35,55,48,72,65,92,78].map((h,i)=><i key={i} style={{flex:1,height:`${h}%`,background:i===5?accent:alpha(accent,.3),borderRadius:2}}/>)}</div><div style={{display:'flex',justifyContent:'space-between',marginTop:6}}><strong style={{fontSize:15}}>+31.8%</strong><span style={{fontSize:7,color:accent}}>↑ 8.2%</span></div></>)}
      </div>
      <div style={{marginTop:10,paddingTop:8,borderTop:`1px solid ${th.line}`}}><div style={{fontSize:7,color:th.sub,marginBottom:5}}>USED BY TEAMS AT</div><div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:5}}>{['NORTH','ARC','VIA','MOTION','FIELD'].map(x=><div key={x} style={{padding:'6px 3px',border:`1px solid ${th.line}`,textAlign:'center',fontSize:7,fontWeight:800}}>{x}</div>)}</div></div>
    </div>
  );

  const organicLayout = () => (
    <div style={{height:'100%',padding:'13px 18px',position:'relative',overflow:'hidden',background:th.bg}}>
      <i style={{position:'absolute',right:-45,top:-25,width:190,height:160,borderRadius:'60% 40% 55% 45%',background:alpha(second,.25)}}/><i style={{position:'absolute',left:-50,bottom:-45,width:210,height:160,borderRadius:'45% 55% 40% 60%',background:alpha(third,.22)}}/>
      {nav()}
      <div style={{position:'relative',display:'grid',gridTemplateColumns:'1fr 1fr',gap:13,alignItems:'center',marginTop:14}}>
        <div><span style={{fontSize:8,color:accent,fontWeight:800}}>GOOD THINGS, GENTLY MADE</span><div style={{marginTop:6}}>{headline('A softer way to show your work.',27)}</div>{body('Warm stories, natural imagery and calm interactions for brands that want to feel human.')}{btn('Say hello')}</div>
        <div>{visual(1,{minHeight:175,borderRadius:'45% 55% 48% 52%'})}</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:7,marginTop:9}}>{['Story','Craft','Care'].map((x,i)=>card(i+3,{padding:8,background:alpha([accent,second,third][i],.10),border:'none'},<><span style={{fontSize:14,color:[accent,second,third][i]}}>{['◒','✿','○'][i]}</span><strong style={{display:'block',fontSize:8,marginTop:4}}>{x}</strong><span style={{fontSize:6.5,color:th.sub}}>Thoughtful detail</span></>))}</div>
    </div>
  );

  const retrofuturistLayout = () => (
    <div style={{ padding: '15px 19px', height: '100%', background: `radial-gradient(circle at 50% 58%, ${alpha(accent,.18)}, transparent 31%), linear-gradient(180deg, ${th.bg}, ${alpha('#000000',.28)})`, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: '46% -10% auto', height: 1, background: `linear-gradient(90deg, transparent, ${alpha(accent,.8)}, ${alpha(th.fg,.35)}, transparent)`, boxShadow: `0 0 18px ${alpha(accent,.45)}` }} />
      <div style={{ position: 'absolute', width: 230, height: 230, border: `1px solid ${alpha(accent,.22)}`, borderRadius: '50%', right: -55, top: 80, boxShadow: `0 0 28px ${alpha(accent,.08)}` }} />
      <div style={{ position: 'absolute', width: 150, height: 150, border: `1px solid ${alpha(th.fg,.10)}`, borderRadius: '50%', right: -15, top: 120 }} />
      {nav()}
      <div style={{ display:'grid', gridTemplateColumns:'1.35fr .65fr', gap:16, alignItems:'center', minHeight:205, position:'relative' }}>
        <div>
          <div style={{ display:'flex', gap:7, alignItems:'center', marginBottom:8 }}><span style={{ fontSize:7, color:accent, letterSpacing:'.16em', fontWeight:900 }}>MISSION 01 / 2026</span><span style={{ fontSize:6.5, color:th.sub }}>SYSTEM ONLINE</span></div>
          {headline('The future has a visual language.', 30)}
          {body('A cinematic digital identity built from geometry, light, motion and optimistic science-fiction nostalgia.')}
          <div style={{ display:'flex', gap:6 }}>{btn('Enter system')}{btn('Archive', false)}</div>
        </div>
        <div style={{ position:'relative', minHeight:160, display:'grid', placeItems:'center' }}>
          <motion.div {...mp(2)} style={{ width:128, height:128, borderRadius:'50%', border:`1px solid ${alpha(accent,.65)}`, boxShadow:`0 0 32px ${alpha(accent,.22)}, inset 0 0 28px ${alpha(second,.14)}`, background:`radial-gradient(circle at 35% 30%, ${alpha('#fff',.34)}, transparent 8%), radial-gradient(circle, ${alpha(second,.18)}, transparent 55%)`, position:'relative' }}>
            <i style={{ position:'absolute', width:170, height:36, border:`1px solid ${alpha(th.fg,.35)}`, borderRadius:'50%', left:-22, top:45, transform:'rotate(-18deg)' }} />
            <i style={{ position:'absolute', width:170, height:36, border:`1px solid ${alpha(accent,.55)}`, borderRadius:'50%', left:-22, top:45, transform:'rotate(54deg)' }} />
            <span style={{ position:'absolute', inset:0, display:'grid', placeItems:'center', fontSize:9, color:th.fg, letterSpacing:'.14em' }}>ORBIT</span>
          </motion.div>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1.3fr .7fr 1fr', gap:7, marginTop:8 }}>
        {metric('98.4','signal',3)}{metric('04:28','launch window',4)}{card(5,{padding:10},<><span style={{fontSize:6.5,color:th.sub,letterSpacing:'.12em'}}>NEXT OBJECTIVE</span><strong style={{display:'block',fontSize:9,marginTop:5}}>Explore / Create / Repeat</strong></>)}
      </div>
    </div>
  );

  const maximalistLayout = () => (
    <div style={{ padding:'13px 17px', height:'100%', background:`linear-gradient(135deg,${th.bg},${alpha(second,.09)})`, position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', width:120, height:120, borderRadius:'50%', background:alpha(third,.25), right:-35, top:-40 }} />
      <div style={{ position:'absolute', width:90, height:90, background:alpha(accent,.18), left:-25, bottom:20, transform:'rotate(18deg)' }} />
      {nav()}
      <div style={{ display:'grid', gridTemplateColumns:'1.25fr .75fr', gap:10, marginTop:10, position:'relative' }}>
        <div style={{ position:'relative', minHeight:205 }}>
          <span style={{ position:'absolute', right:4, top:2, transform:'rotate(8deg)', padding:'5px 7px', background:third, color:onAcc, fontSize:7, fontWeight:900, border:`2px solid ${th.fg}` }}>NEW WORK ✦</span>
          <div style={{ maxWidth:310, paddingTop:13 }}>{headline('MAKE IT LOUD. MAKE IT MATTER.', 31)}{body('A layered visual world for brands that refuse to look like the template next door.')}</div>
          <div style={{ display:'flex', gap:6, marginTop:5 }}>{btn('See the work')}{btn('Manifesto', false)}</div>
          <motion.div {...mp(2)} style={{ position:'absolute', right:8, bottom:0, width:112, height:76, transform:'rotate(-5deg)', background:`linear-gradient(135deg,${accent},${second})`, border:`2px solid ${th.fg}`, boxShadow:`6px 6px 0 ${third}` }}><span style={{position:'absolute',left:7,bottom:6,color:'#fff',fontSize:7,fontWeight:900}}>IMAGE / 001</span></motion.div>
        </div>
        <div style={{ display:'grid', gridTemplateRows:'1fr 1fr', gap:7 }}>
          {card(3,{padding:9, transform:'rotate(2deg)', background:alpha(accent,.16)},<><span style={{fontSize:18}}>✦</span><strong style={{display:'block',fontSize:10,marginTop:5}}>ART DIRECTION</strong><span style={{fontSize:7,color:th.sub}}>Identity · Digital · Motion</span></>)}
          {card(4,{padding:9, transform:'rotate(-2deg)', background:alpha(third,.16)},<><span style={{fontSize:7,fontWeight:900,letterSpacing:'.12em'}}>SELECTED SIGNAL</span><strong style={{display:'block',fontSize:22,lineHeight:1,marginTop:7}}>24</strong><span style={{fontSize:7,color:th.sub}}>projects shipped</span></>)}
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:7, marginTop:8 }}>
        {['IDENTITY','DIGITAL','CAMPAIGNS'].map((x,i)=>card(i+7,{padding:8,background:[alpha(accent,.11),alpha(second,.11),alpha(third,.11)][i],transform:`rotate(${i===1?0:-1.2}deg)`},<><span style={{fontSize:6.5,color:th.sub}}>0{i+1}</span><strong style={{display:'block',fontSize:8.5,marginTop:4}}>{x}</strong><span style={{fontSize:6.5,color:th.sub}}>Built to be remembered.</span></>))}
      </div>
    </div>
  );

  const layouts = {
    minimal: minimalLayout, modern: modernLayout, bold: boldLayout, editorial: editorialLayout,
    creative: creativeLayout, glass: glassLayout, clay: clayLayout, brutalist: brutalistLayout,
    bento: bentoLayout, retro: retroLayout, luxury: luxuryLayout, corporate: corporateLayout, organic: organicLayout, retrofuturist: retrofuturistLayout, maximalist: maximalistLayout,
  };
  const render = (layouts[design.style] || modernLayout)();
  const descriptor = `${styleLabel} · ${themeLabel} · ${motionLabel} · ${paletteName}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/15" style={{ boxShadow: `0 24px 60px -24px ${alpha(accent, .55)}` }}>
        <div className="flex shrink-0 items-center gap-2 bg-neutral-800 px-3 py-2">
          <i className="h-2.5 w-2.5 rounded-full bg-red-400" /><i className="h-2.5 w-2.5 rounded-full bg-yellow-400" /><i className="h-2.5 w-2.5 rounded-full bg-green-400" />
          <div className="ml-2 flex-1 truncate rounded-md bg-black/40 px-3 py-1 text-[10px] text-white/50">yourwebsite.com</div>
          <span className="hidden text-[9px] text-white/35 sm:inline">{descriptor}</span>
        </div>
        <motion.div
          key={`${design.style}-${design.theme}-${anim}-${typo.id}-${accent}-${paletteName}`}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .28 }}
          ref={captureRef}
          style={{ background: canvas, color: th.fg, fontFamily: typo.font, flex: 1, minHeight: 430, position: 'relative', overflow: 'hidden', fontSize: 11 }}
        >
          {render}
        </motion.div>
      </div>
      <div className="mt-2 flex items-center justify-between px-1 text-[9px] text-white/30">
        <span>Live structural preview · hero + navigation + content system + CTA</span>
        <span className="hidden sm:inline">Research-informed style recipe</span>
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
    case 'clay': return <div className={`${box} gap-2 bg-[#efe4ff]`}><i className="h-11 w-11 rounded-[16px]" style={{ background: 'linear-gradient(145deg,#ffd0e6,#ff9ec9)', boxShadow: '5px 5px 11px rgba(190,120,200,.45), inset -3px -3px 6px rgba(0,0,0,.10), inset 3px 3px 6px rgba(255,255,255,.85)' }} /><i className="h-8 w-16 rounded-full" style={{ background: 'linear-gradient(145deg,#c9d8ff,#9db8ff)', boxShadow: '5px 5px 11px rgba(120,130,220,.45), inset -3px -3px 6px rgba(0,0,0,.10), inset 3px 3px 6px rgba(255,255,255,.85)' }} /></div>;
    case 'glass': return <div className={`${box} relative`} style={{ background: 'linear-gradient(135deg,#6366f1,#ec4899 60%,#f59e0b)' }}><i className="h-10 w-24 rounded-xl border border-white/40 bg-white/20 backdrop-blur-md" /></div>;
    case 'brutalist': return <div className={`${box} bg-yellow-300`}><span className="border-[3px] border-black bg-white px-3 py-1 text-[11px] font-black uppercase text-black" style={{ boxShadow: '4px 4px 0 #000' }}>Raw</span></div>;
    case 'bento': return <div className={`${box} grid grid-cols-4 grid-rows-2 gap-1 bg-neutral-900 p-2`}><i className="col-span-2 row-span-2 rounded-md bg-white/20" /><i className="rounded-md" style={{ background: accent }} /><i className="rounded-md bg-white/10" /><i className="col-span-2 rounded-md bg-white/15" /></div>;
    case 'retro': return <div className={`${box} p-2`} style={{ background: 'linear-gradient(135deg,#f9a8d4,#67e8f9)' }}><div className="w-full overflow-hidden rounded border-2 border-black bg-white"><div className="h-2.5 border-b-2 border-black bg-gradient-to-r from-pink-400 to-cyan-300" /><div className="h-5" /></div></div>;
    case 'luxury': return <div className={`${box} flex-col bg-black`}><span className="text-[15px] tracking-[0.3em] text-amber-300" style={{ fontFamily: 'Georgia,serif' }}>LUXE</span><i className="mt-1.5 block h-px w-12 bg-amber-300/70" /></div>;
    case 'corporate': return <div className={`${box} items-end gap-1 bg-slate-800 px-5 pb-3`}>{[40, 62, 48, 80, 94].map((h, k) => <i key={k} className="w-3 rounded-sm bg-sky-400/80" style={{ height: `${h * 0.55}%` }} />)}</div>;
    case 'retrofuturist': return <div className={`${box} relative overflow-hidden`} style={{ background: 'radial-gradient(circle at 65% 55%,#22d3ee55,transparent 22%),linear-gradient(180deg,#09051a,#10112f)' }}><i className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/70" /><i className="absolute left-[20%] top-[42%] h-7 w-20 rounded-[50%] border border-fuchsia-300/60" style={{transform:'rotate(-18deg)'}} /><span className="absolute bottom-2 left-3 text-[7px] font-bold tracking-[.18em] text-cyan-200">FUTURE / 01</span></div>;
    case 'maximalist': return <div className={`${box} relative overflow-hidden bg-fuchsia-300`}><i className="absolute left-2 top-2 h-12 w-16 rotate-[-8deg] border-2 border-black bg-yellow-300" /><i className="absolute right-1 top-5 h-10 w-12 rotate-[8deg] border-2 border-black bg-black" /><span className="absolute bottom-1 left-3 text-[18px] font-black uppercase leading-none text-black">LOUD!</span><i className="absolute bottom-1 right-2 h-7 w-7 rounded-full border-2 border-black bg-cyan-300" /></div>;
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
export default function DesignPreferencesStep({ design, onChange, onBack, onNext, topBar }) {
  const [customColor, setCustomColor] = useState('#e0b25c');
  const previewRef = useRef(null);
  const [capturing, setCapturing] = useState(false);
  const paletteId = design.paletteId || 'amber';
  const activePalette = DESIGN_PALETTES.find((p) => p.id === paletteId);
  const palette = paletteId === 'custom' ? [customColor, '#ffffff', '#222222'] : (activePalette || DESIGN_PALETTES[0]).colors;
  const paletteName = paletteId === 'custom' ? 'Custom Palette' : (activePalette || DESIGN_PALETTES[0]).name;
  const typo = DESIGN_TYPOGRAPHY.find((t) => t.id === (design.typography || 'grotesk')) || DESIGN_TYPOGRAPHY[0];
  const accent = design.primaryColor || palette[0];
  const onAcc = lum(accent) > 0.55 ? '#111' : '#fff';
  const set = (patch) => onChange({ ...design, ...patch });

  /* Screenshot the live mockup (downscaled to ~1024px JPEG) so the generator can use it as a visual reference. */
  const handleContinue = async () => {
    if (capturing) return;
    setCapturing(true);
    let referenceImage = null;
    try {
      const node = previewRef.current;
      if (node && node.offsetWidth > 0) {
        const width = 1024;
        const height = Math.round((width * node.offsetHeight) / node.offsetWidth);
        referenceImage = await toJpeg(node, { quality: 0.82, pixelRatio: 1, cacheBust: true, skipFonts: true, canvasWidth: width, canvasHeight: height, backgroundColor: '#ffffff' });
      }
    } catch (err) {
      console.warn('[AI Studio] could not capture style reference image', err);
    }
    onChange({ ...design, referenceImage });
    setCapturing(false);
    onNext();
  };

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
    <div className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-neutral-950 text-white lg:h-[100dvh]">
      <div className="pointer-events-none absolute inset-0 -z-0 opacity-60 transition-all duration-500" style={{ background: `radial-gradient(60% 50% at 75% 20%, ${alpha(accent, 0.18)}, transparent 70%)` }} />
      {topBar && <div className="relative z-10 shrink-0">{topBar}</div>}
      <div className="relative z-10 grid min-h-0 flex-1 gap-4 px-4 pb-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        {/* Controls: fills full height, scrolls inside */}
        <div className="min-h-0 rounded-3xl border border-white/10 bg-[#0a0a0c] p-6 lg:h-full lg:overflow-y-auto">
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

        {/* Preview: pinned in place, never scrolls with the options */}
        <div className="flex min-h-[560px] flex-col rounded-3xl border bg-[#0a0a0c] p-6 transition-colors lg:h-full lg:min-h-0" style={{ borderColor: alpha(accent, 0.28) }}>
          <div className="mb-5 flex shrink-0 items-center justify-between gap-3">
            <h2 className="text-[22px] font-bold tracking-tight">Live Mockup Preview <span className="text-white/60">(Agent Draft)</span></h2>
            <span className="inline-flex shrink-0 items-center gap-2 text-xs text-white/50"><Loader2 size={14} className="animate-spin" style={{ color: accent }} /> Rendering in Real-Time</span>
          </div>
          <LivePreview design={design} palette={palette} paletteName={paletteName} typo={typo} captureRef={previewRef} />
        </div>
      </div>

      {/* Bottom action bar */}
      <footer className="sticky bottom-0 z-20 flex shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-neutral-950/90 px-4 py-3 backdrop-blur">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-[14px] font-bold"><ArrowLeft size={15} /> Back</button>
        <div className="flex items-center gap-4">
          <span className="hidden items-center gap-2 text-xs text-white/40 sm:inline-flex"><Timer size={14} /> AI is ready to generate</span>
          <button type="button" onClick={handleContinue} disabled={capturing} className="inline-flex items-center gap-2 rounded-xl px-7 py-3 text-[14px] font-bold disabled:opacity-70" style={{ background: `linear-gradient(135deg,${shade(accent, 0.25)},${accent},${shade(accent, -0.25)})`, color: onAcc, boxShadow: `0 0 28px -6px ${alpha(accent, 0.75)}` }}>
            {capturing ? <><Loader2 size={16} className="animate-spin" /> Capturing style…</> : <>Continue to Generate <ArrowRight size={16} /></>}
          </button>
        </div>
      </footer>
    </div>
  );
}
