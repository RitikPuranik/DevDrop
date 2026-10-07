import React, { useRef, useState } from 'react';
import { toJpeg } from 'html-to-image';
import {
  ArrowLeft, ArrowRight, Ban, Check, ChevronsDown, Layers, Laptop, Loader2, MousePointerClick, Plus, Smartphone, Sparkles, Spline, Timer, Type,
} from 'lucide-react';
import { DESIGN_STYLES, DESIGN_THEMES, ANIMATION_OPTIONS, DESIGN_PALETTES, DESIGN_TYPOGRAPHY } from '../../config/aiStudio.config';
import ReferenceDrivenLivePreview from './preview/ReferenceDrivenLivePreview';

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
  dark: { bg: '#0b0b0d', fg: '#ffffff', body: '#f2f4f7', link: '#8de9ff', sub: 'rgba(255,255,255,.55)', panel: 'rgba(255,255,255,.06)', line: 'rgba(255,255,255,.14)' },
  light: { bg: '#f8f8f6', fg: '#0a0a0a', body: '#242424', link: '#2458c6', sub: 'rgba(0,0,0,.55)', panel: 'rgba(255,255,255,.92)', line: 'rgba(0,0,0,.12)' },
  neutral: { bg: '#d9d9d6', fg: '#121212', body: '#2a2a2a', link: '#365a88', sub: 'rgba(0,0,0,.55)', panel: 'rgba(255,255,255,.6)', line: 'rgba(0,0,0,.14)' },
  midnight: { bg: '#0a1228', fg: '#ffffff', body: '#e6edff', link: '#73ddff', sub: 'rgba(220,230,255,.55)', panel: 'rgba(120,150,255,.09)', line: 'rgba(150,175,255,.2)' },
  warm: { bg: '#f3ead9', fg: '#21150e', body: '#3a2b20', link: '#8a4f25', sub: 'rgba(43,33,24,.6)', panel: 'rgba(255,255,255,.55)', line: 'rgba(43,33,24,.15)' },
  auto: { bg: '#0b0b0d', fg: '#ffffff', body: '#f2f4f7', link: '#8de9ff', sub: 'rgba(255,255,255,.55)', panel: 'rgba(255,255,255,.06)', line: 'rgba(255,255,255,.14)' },
};

/* The preview is a code-built reconstruction of the reference packs, not an image gallery. */

/* ───────────── left-side option art ───────────── */
function StyleArt({ id, accent }) {
  const box = 'relative flex h-[72px] w-full items-center justify-center overflow-hidden';
  const frame = { boxSizing: 'border-box', border: '1px solid rgba(0,0,0,.12)' };
  switch (id) {
    case 'minimal': return <div className={`${box} flex-col !items-start !justify-center gap-1 bg-[#fafaf8] px-5`}><span className="text-[8px] tracking-[.14em] text-black/45">QUIET / 01</span><i className="mt-1 block h-px w-4/5 bg-black/20" /><i className="mt-2 block h-1.5 w-2/5 rounded bg-black/70" /><i className="block h-px w-3/5 bg-black/15" /></div>;
    case 'modern': return <div className={`${box} gap-1.5 bg-[#f6f8fb] p-2`}><div className="h-full w-[58%] rounded-xl bg-white" style={{ boxShadow:'0 8px 18px rgba(20,35,60,.08)' }} /><div className="grid h-full flex-1 grid-cols-2 gap-1"><i className="rounded-lg bg-blue-100" /><i className="rounded-lg bg-emerald-100" /><i className="col-span-2 rounded-lg bg-slate-100" /></div></div>;
    case 'bold': return <div className={`${box} items-end bg-[#f5f1e8] px-2 pb-2`}><span className="absolute left-2 top-2 bg-black px-2 py-1 text-[7px] font-black text-white">LOUD.</span><span className="text-[28px] font-black uppercase leading-[.72] tracking-[-.08em] text-black">TYPE<br /><span style={{ color: accent }}>FIRST</span></span></div>;
    case 'editorial': return <div className={`${box} flex-col items-start justify-center bg-[#f5f1e8] px-4 text-black`}><span className="text-[8px] tracking-[.16em] text-black/50">THE DAILY</span><span className="mt-1 text-[20px] leading-none" style={{ fontFamily:'Georgia,serif' }}>The new<br /><b>editorial.</b></span><span className="mt-2 h-px w-4/5 bg-black/30" /></div>;
    case 'creative': return <div className={`${box}`} style={{ background:'linear-gradient(135deg,#6d28d9,#ec4899)' }}><i className="absolute -left-4 top-6 h-14 w-14 rounded-full bg-yellow-300" /><i className="absolute right-3 top-2 h-10 w-10 rounded-full bg-orange-300" /><span className="relative z-10 rounded-lg bg-white/90 px-2 py-1 text-[8px] font-black -rotate-2">PLAY / MAKE</span></div>;
    case 'glass': return <div className={`${box} p-2`} style={{ background:'radial-gradient(circle at 18% 20%,#4f46e5,transparent 35%),radial-gradient(circle at 88% 65%,#c026d3,transparent 40%),#111b42' }}><div className="h-full w-4/5 rounded-xl border border-white/30 bg-white/15 backdrop-blur-md" /></div>;
    case 'clay': return <div className={`${box} gap-2 bg-[#e8dfdb]`}><i className="h-11 w-11 rounded-[18px] bg-[#e89a7a]" style={{ boxShadow:'6px 6px 12px rgba(108,82,88,.22),-6px -6px 12px rgba(255,255,255,.8)' }} /><i className="h-8 w-16 rounded-full bg-[#a996dc]" style={{ boxShadow:'6px 6px 12px rgba(108,82,88,.18),-6px -6px 12px rgba(255,255,255,.8)' }} /></div>;
    case 'brutalist': return <div className={`${box} gap-1 bg-[#f3efe4] p-2`}><i className="h-12 w-[31%] border-[3px] border-black bg-[#fffaf0]" style={{ boxShadow:'4px 4px 0 #111' }} /><i className="h-12 w-[31%] border-[3px] border-black bg-pink-400" style={{ boxShadow:'4px 4px 0 #111' }} /><i className="h-12 flex-1 border-[3px] border-black bg-cyan-300" style={{ boxShadow:'4px 4px 0 #111' }} /></div>;
    case 'brutalism': return <div className={`${box} bg-[#efede4] px-3`}><div className="grid w-full grid-cols-3 gap-1"><i className="h-12 border border-black bg-[#fbf8ee]" /><i className="h-12 border border-black bg-[#e6312e]" /><i className="h-12 border border-black bg-[#f4ce27]" /><span className="col-span-3 mt-1 block h-px bg-black" /></div></div>;
    case 'cyberpunk': return <div className={`${box} bg-[#070b12]`} style={{ backgroundImage:'linear-gradient(rgba(34,211,238,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,.08) 1px,transparent 1px)',backgroundSize:'11px 11px' }}><div className="absolute inset-2 border" style={{ borderColor:'#22d3ee', boxShadow:'0 0 12px rgba(34,211,238,.3)' }} /><span className="absolute left-4 top-3 text-[7px] font-black tracking-[.12em] text-cyan-300">NEON / GLITCH</span><span className="absolute bottom-3 right-4 text-[7px] font-black tracking-[.12em] text-lime-300">ONLINE</span></div>;
    case 'neumorphism': return <div className={`${box} gap-3 bg-[#e1e5eb]`}><i className="h-11 w-16 rounded-[18px] bg-[#e5e9ee]" style={{ boxShadow:'6px 6px 11px rgba(104,113,123,.24),-6px -6px 11px rgba(255,255,255,.9)' }} /><i className="h-11 w-11 rounded-full bg-[#e5e9ee]" style={{ boxShadow:'inset 5px 5px 9px rgba(104,113,123,.18),inset -5px -5px 9px rgba(255,255,255,.9)' }} /></div>;
    case 'bento': return <div className={`${box} grid grid-cols-4 grid-rows-2 gap-1 bg-[#f4f2ed] p-2`}><i className="col-span-2 row-span-2 rounded-lg bg-blue-100" /><i className="rounded-lg bg-violet-200" /><i className="rounded-lg bg-emerald-100" /><i className="col-span-2 rounded-lg bg-orange-100" /></div>;
    case 'retro': return <div className={`${box} bg-[#ece9ff] p-2`}><div className="w-full border-2 border-black bg-white" style={{ boxShadow:'3px 3px 0 #171219' }}><div className="flex justify-between border-b-2 border-black bg-gradient-to-r from-pink-400 to-cyan-300 px-2 py-1 text-[6px] font-black"><span>WINDOW.EXE</span><span>□ X</span></div><div className="h-7 bg-[linear-gradient(45deg,transparent_25%,#f0f0ff_25%,#f0f0ff_50%,transparent_50%,transparent_75%,#f0f0ff_75%)] bg-[length:8px_8px]" /></div></div>;
    case 'luxury': return <div className={`${box} flex-col bg-[#20201d]`}><span className="text-[15px] tracking-[.28em] text-amber-300" style={{ fontFamily:'Georgia,serif' }}>ATELIER</span><i className="mt-2 h-px w-12 bg-amber-300/70" /><span className="mt-2 text-[6px] tracking-[.20em] text-white/45">CRAFTED FOR THE FEW.</span></div>;
    case 'corporate': return <div className={`${box} bg-[#f4f6f8] p-2`}><div className="grid w-full grid-cols-3 gap-1"><i className="h-8 rounded bg-white" style={frame} /><i className="h-8 rounded bg-blue-50" style={frame} /><i className="h-8 rounded bg-white" style={frame} /><i className="h-8 rounded bg-slate-100" style={frame} /><i className="h-8 rounded bg-white" style={frame} /><i className="h-8 rounded bg-blue-50" style={frame} /></div></div>;
    case 'organic': return <div className={`${box} bg-[#f6efe2]`}><i className="absolute -left-4 top-2 h-16 w-24 bg-[#879f75]/80" style={{ borderRadius:'60% 40% 55% 45%' }} /><i className="absolute right-0 top-5 h-12 w-20 bg-[#d5a98f]/75" style={{ borderRadius:'45% 55% 40% 60%' }} /><span className="relative z-10 rounded-full bg-[#fffaf0] px-2 py-1 text-[8px] font-bold text-[#334036]">GROW WITH INTENTION.</span></div>;
    case 'retrofuturist': return <div className={`${box}`} style={{ background:'radial-gradient(circle at 58% 58%,#2cb6b130,transparent 28%),#152b3b' }}><i className="h-10 w-10 rounded-full border border-cyan-200/70" /><i className="absolute left-[16%] top-[40%] h-7 w-20 rounded-[50%] border border-orange-300/60 rotate-[-18deg]" /><span className="absolute left-3 bottom-2 text-[7px] font-bold tracking-[.16em] text-cyan-200">FUTURE / 01</span></div>;
    case 'maximalist': return <div className={`${box} bg-[#eee3d2]`}><i className="absolute left-2 top-3 h-10 w-14 rotate-[-8deg] border-2 border-black bg-pink-400" /><i className="absolute right-2 top-1 h-9 w-12 rotate-[7deg] border-2 border-black bg-cyan-300" /><span className="absolute left-3 bottom-1 text-[18px] font-black uppercase leading-none">LOUD!</span><i className="absolute right-7 bottom-2 h-6 w-6 rotate-[10deg] border-2 border-black bg-yellow-300" /></div>;
    default: return <div className={`${box} bg-[#f1f0eb]`} />;
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
        <i className="mb-1 block h-1 w-3/5 rounded" style={{ background: c.line }} /><div className="flex items-end justify-between gap-2"><span className="text-[14px] font-black leading-none" style={{ color:c.fg }}>Aa</span><span className="text-[8px] font-medium" style={{ color:c.body }}>body</span><span className="text-[8px] font-semibold underline" style={{ color:c.link }}>link</span></div><i className="mt-1 block h-5 w-full rounded" style={{ background: dark ? 'rgba(255,255,255,.12)' : '#fde9c4' }} />
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
export default function DesignPreferencesStep({ design, onChange, onBack, onNext, topBar, websiteType = 'portfolio' }) {
  const [customColor, setCustomColor] = useState('#e0b25c');
  const previewRef = useRef(null);
  const [capturing, setCapturing] = useState(false);
  const [previewViewport, setPreviewViewport] = useState('desktop');
  const paletteId = design.paletteId || 'amber';
  const activePalette = DESIGN_PALETTES.find((p) => p.id === paletteId);
  const palette = paletteId === 'custom' ? [customColor, '#ffffff', '#222222'] : (activePalette || DESIGN_PALETTES[0]).colors;
  const paletteName = paletteId === 'custom' ? 'Custom Palette' : (activePalette || DESIGN_PALETTES[0]).name;
  const typo = DESIGN_TYPOGRAPHY.find((t) => t.id === (design.typography || 'grotesk')) || DESIGN_TYPOGRAPHY[0];
  const accent = design.primaryColor || palette[0];
  const onAcc = lum(accent) > 0.55 ? '#111' : '#fff';
  const set = (patch) => onChange({ ...design, ...patch });

  /*
   * Capture the entire page, not the currently visible viewport. html-to-image
   * can otherwise inherit the scroll container's clipped height. We clone the
   * actual page, give the clone the selected device width, let its full content
   * height resolve, and capture that off-screen clone from top to bottom.
   */
  const captureWholeWebsite = async (sourceNode, viewportMode) => {
    if (!sourceNode || sourceNode.offsetWidth <= 0) return null;

    const targetWidth = viewportMode === 'mobile' ? 390 : 1280;
    const mount = document.createElement('div');
    mount.setAttribute('data-ai-studio-capture', 'whole-website');
    Object.assign(mount.style, {
      position: 'fixed',
      left: '-100000px',
      top: '0',
      width: `${targetWidth}px`,
      minHeight: '0',
      height: 'auto',
      overflow: 'visible',
      pointerEvents: 'none',
      zIndex: '-1',
      background: '#fff',
    });

    const clone = sourceNode.cloneNode(true);
    Object.assign(clone.style, {
      width: `${targetWidth}px`,
      minWidth: '0',
      minHeight: '0',
      maxHeight: 'none',
      height: 'auto',
      overflow: 'visible',
      transform: 'none',
      position: 'relative',
    });

    mount.appendChild(clone);
    document.body.appendChild(mount);

    try {
      if (document.fonts?.ready) await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      // Framer Motion can leave below-the-fold sections in an initial hidden
      // state because they have not entered the preview viewport yet. Make the
      // cloned capture static so the AI receives every section top-to-bottom.
      clone.querySelectorAll('*').forEach((element) => {
        const computed = window.getComputedStyle(element);
        if (computed.opacity === '0') element.style.opacity = '1';
        const inlineTransform = element.getAttribute('style') || '';
        if (inlineTransform.includes('translate')) element.style.transform = 'none';
        element.style.animation = 'none';
        element.style.transition = 'none';
      });

      const fullHeight = Math.max(
        clone.scrollHeight,
        clone.offsetHeight,
        clone.getBoundingClientRect().height,
      );
      if (!fullHeight) return null;

      // Tall screenshots are intentionally compressed. The generator needs the
      // whole visual rhythm while keeping the request comfortably under the
      // reference-image upload ceiling.
      const attempts = [
        { width: targetWidth, quality: 0.76 },
        { width: viewportMode === 'mobile' ? 360 : 1120, quality: 0.68 },
        { width: viewportMode === 'mobile' ? 330 : 960, quality: 0.60 },
      ];

      for (const attempt of attempts) {
        const ratio = attempt.width / targetWidth;
        const height = Math.max(1, Math.round(fullHeight * ratio));
        const image = await toJpeg(clone, {
          quality: attempt.quality,
          pixelRatio: 1,
          cacheBust: true,
          skipFonts: false,
          width: attempt.width,
          height,
          canvasWidth: attempt.width,
          canvasHeight: height,
          backgroundColor: '#ffffff',
        });
        const base64Length = image.length * 0.75;
        if (base64Length <= 1.35 * 1024 * 1024 || attempt === attempts[attempts.length - 1]) return image;
      }
      return null;
    } finally {
      mount.remove();
    }
  };

  const handleContinue = async () => {
    if (capturing) return;
    setCapturing(true);
    let referenceImage = null;
    try {
      referenceImage = await captureWholeWebsite(previewRef.current, previewViewport);
    } catch (err) {
      console.warn('[AI Studio] could not capture whole website style reference image', err);
    }
    onChange({
      ...design,
      referenceImage,
      referenceImageScope: 'whole-website',
      referenceViewport: previewViewport,
    });
    setCapturing(false);
    onNext();
  };

  const pickStyle = (s) => {
    const styleDefaults = {
      minimal: { theme: 'light', paletteId: 'mono' },
      modern: { theme: 'light', paletteId: 'ocean' },
      bold: { theme: 'light', paletteId: 'crimson' },
      editorial: { theme: 'warm', paletteId: 'crimson' },
      creative: { theme: 'light', paletteId: 'sunset' },
      glass: { theme: 'dark', paletteId: 'ocean' },
      clay: { theme: 'light', paletteId: 'rose' },
      brutalist: { theme: 'light', paletteId: 'crimson' },
      brutalism: { theme: 'light', paletteId: 'amber' },
      cyberpunk: { theme: 'dark', paletteId: 'neon' },
      neumorphism: { theme: 'light', paletteId: 'cloud' },
      bento: { theme: 'light', paletteId: 'cloud' },
      retro: { theme: 'light', paletteId: 'sunset' },
      luxury: { theme: 'warm', paletteId: 'crimson' },
      corporate: { theme: 'light', paletteId: 'ocean' },
      organic: { theme: 'warm', paletteId: 'earth' },
      retrofuturist: { theme: 'midnight', paletteId: 'neon' },
      maximalist: { theme: 'light', paletteId: 'sunset' },
    };
    const defaults = styleDefaults[s.id] || {};
    const patch = { style: s.id, ...(design.typographyTouched ? {} : { typography: s.typo }) };
    if (!design.themeTouched && defaults.theme) patch.theme = defaults.theme;
    if (!design.paletteTouched && defaults.paletteId) {
      const p = DESIGN_PALETTES.find((item) => item.id === defaults.paletteId);
      if (p) { patch.paletteId = p.id; patch.palette = p.colors.join(', '); patch.primaryColor = p.colors[0]; }
    }
    set(patch);
  };
  const pickPalette = (p) => set({ paletteId: p.id, palette: p.colors.join(', '), primaryColor: p.colors[0], paletteTouched: true });
  const pickCustom = (color) => { setCustomColor(color); set({ paletteId: 'custom', palette: color, primaryColor: color, paletteTouched: true }); };

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
                    <button key={t.id} type="button" role="radio" aria-checked={sel} onClick={() => set({ theme: t.id, themeTouched: true })} className={`${optCls(sel)} text-left`} style={optStyle(sel)}>
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
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1" role="group" aria-label="Preview device">
                <button type="button" onClick={() => setPreviewViewport('desktop')} aria-pressed={previewViewport === 'desktop'} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition" style={previewViewport === 'desktop' ? { background: alpha(accent, .18), color: '#fff', boxShadow: `inset 0 0 0 1px ${alpha(accent, .35)}` } : { color: 'rgba(255,255,255,.48)' }}>
                  <Laptop size={13} /> Laptop
                </button>
                <button type="button" onClick={() => setPreviewViewport('mobile')} aria-pressed={previewViewport === 'mobile'} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition" style={previewViewport === 'mobile' ? { background: alpha(accent, .18), color: '#fff', boxShadow: `inset 0 0 0 1px ${alpha(accent, .35)}` } : { color: 'rgba(255,255,255,.48)' }}>
                  <Smartphone size={13} /> Mobile
                </button>
              </div>
              <span className="hidden items-center gap-2 text-xs text-white/50 xl:inline-flex"><Loader2 size={14} className="animate-spin" style={{ color: accent }} /> Rendering in Real-Time</span>
            </div>
          </div>
          <ReferenceDrivenLivePreview design={design} palette={palette} paletteName={paletteName} typo={typo} websiteType={websiteType} captureRef={previewRef} viewportMode={previewViewport} />
        </div>
      </div>

      {/* Bottom action bar */}
      <footer className="sticky bottom-0 z-20 flex shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-neutral-950/90 px-4 py-3 backdrop-blur">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-[14px] font-bold"><ArrowLeft size={15} /> Back</button>
        <div className="flex items-center gap-4">
          <span className="hidden items-center gap-2 text-xs text-white/40 sm:inline-flex"><Timer size={14} /> AI is ready to generate</span>
          <button type="button" onClick={handleContinue} disabled={capturing} className="inline-flex items-center gap-2 rounded-xl px-7 py-3 text-[14px] font-bold disabled:opacity-70" style={{ background: `linear-gradient(135deg,${shade(accent, 0.25)},${accent},${shade(accent, -0.25)})`, color: onAcc, boxShadow: `0 0 28px -6px ${alpha(accent, 0.75)}` }}>
            {capturing ? <><Loader2 size={16} className="animate-spin" /> Capturing full website…</> : <>Continue to Generate <ArrowRight size={16} /></>}
          </button>
        </div>
      </footer>
    </div>
  );
}
