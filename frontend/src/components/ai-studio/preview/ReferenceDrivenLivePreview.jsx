import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { DESIGN_STYLES } from '../../../config/aiStudio.config';

const TYPE_LABEL = {
  portfolio: 'PORTFOLIO',
  ecommerce: 'SHOP',
  blog: 'JOURNAL',
  landing: 'PRODUCT',
  cafe: 'CAFE',
  hotel: 'STAY',
  studio: 'STUDIO',
  saas: 'SAAS',
  event: 'EVENT',
  education: 'LEARN',
  custom: 'CUSTOM',
};

const TYPE_COPY = {
  portfolio: {
    eyebrow: 'Selected work / 2026',
    hero: 'Build a portfolio people remember.',
    copy: 'Case studies, experiments, and a clear point of view, arranged like a finished design system rather than a template.',
    stats: ['12 projects', '06 disciplines', '04 years'],
    cards: [
      ['01', 'North / Identity', 'Brand system + digital direction', 'VIEW CASE'],
      ['02', 'Field Notes', 'Editorial portfolio / 18 artifacts', 'READ NOTE'],
      ['03', 'Signal House', 'Interactive product story', 'OPEN PROJECT'],
    ],
  },
  ecommerce: {
    eyebrow: 'Collection / new season',
    hero: 'Objects worth keeping around.',
    copy: 'A product-first storefront with discovery, product detail, social proof, and a clean path to checkout.',
    stats: ['48 products', '4.9 rating', '24h dispatch'],
    cards: [
      ['01', 'Form / 01', 'Everyday object · ₹7,400', 'IN STOCK'],
      ['02', 'Soft / 02', 'Desk lamp · ₹11,200', 'LOW STOCK'],
      ['03', 'Core / 03', 'Carry tote · ₹5,600', 'NEW'],
    ],
  },
  blog: {
    eyebrow: 'The latest issue / 28',
    hero: 'A publication with a point of view.',
    copy: 'Long-form stories, visual essays, useful notes, and an archive that feels like a place worth returning to.',
    stats: ['01 issue', '36 stories', '08 min avg.'],
    cards: [
      ['01', 'The New Quiet', 'Designing for attention without noise', '08 MIN'],
      ['02', 'Fieldwork 07', 'How digital spaces become places', '11 MIN'],
      ['03', 'After the Feed', 'A visual essay on slower interfaces', '06 MIN'],
    ],
  },
  landing: {
    eyebrow: 'Product / launch story',
    hero: 'One message. Sharpened all the way down.',
    copy: 'A conversion sequence from problem to proof, product detail, outcomes, and one decisive action.',
    stats: ['03 steps', '+42% signal', '01 clear CTA'],
    cards: [
      ['01', 'Frame the problem', 'Turn a complicated workflow into one clear path', 'STEP'],
      ['02', 'Show the proof', 'Make outcomes visible before asking for commitment', 'PROOF'],
      ['03', 'Remove friction', 'One action, one reason, one decisive finish', 'CTA'],
    ],
  },
  cafe: {
    eyebrow: 'Cafe / today',
    hero: 'A warm digital front door to the table.',
    copy: 'Menu, signature dishes, atmosphere, hours, and reservation actions in one inviting rhythm.',
    stats: ['18 dishes', '4.8 rating', '11am—11pm'],
    cards: [
      ['01', 'Citrus Morning', 'Espresso · orange · tonic', '₹280'],
      ['02', 'House Pasta', 'Tomato · basil · aged cheese', '₹520'],
      ['03', 'After Dark', 'Chocolate · salt · olive oil', '₹390'],
    ],
  },
  hotel: {
    eyebrow: 'Stay / rooms + experience',
    hero: 'A stay imagined before the suitcase is packed.',
    copy: 'Room discovery, amenities, local details, social proof, and a quiet booking path designed to feel considered.',
    stats: ['28 rooms', '4.9 guest score', '24 / 7 desk'],
    cards: [
      ['01', 'Garden Suite', 'King bed · terrace · breakfast', 'FROM ₹12,800'],
      ['02', 'Courtyard Room', 'Queen bed · garden view', 'FROM ₹8,600'],
      ['03', 'Skyline Loft', 'Studio · bath · late checkout', 'FROM ₹16,400'],
    ],
  },
  studio: {
    eyebrow: 'Studio / strategy + build',
    hero: 'Show the work first. Then explain it.',
    copy: 'Strategy, design systems, build, launch, proof, and a frictionless project enquiry for a modern studio.',
    stats: ['18 launches', '07 disciplines', '48h reply'],
    cards: [
      ['01', 'Strategy', 'Positioning, narrative, digital direction', '01'],
      ['02', 'Design Systems', 'Websites, products, identities', '02'],
      ['03', 'Launch', 'Build, ship, measure, refine', '03'],
    ],
  },
  saas: {
    eyebrow: 'Product / software',
    hero: 'Make the product easy to understand.',
    copy: 'A product-led story for software and web apps, with feature clarity, proof, pricing, and a focused signup path.',
    stats: ['01 product', '04 pillars', '01 CTA'],
    cards: [
      ['01', 'Core workflow', 'Show the product flow from problem to outcome', 'FLOW'],
      ['02', 'Feature story', 'Turn capabilities into clear user value', 'VALUE'],
      ['03', 'Conversion', 'Move visitors toward signup or demo', 'CTA'],
    ],
  },
  event: {
    eyebrow: 'Event / experience',
    hero: 'Turn an event into a destination.',
    copy: 'Schedule, speakers, venue, tickets, and attendee details organized around one clear registration journey.',
    stats: ['01 event', '03 tracks', '01 RSVP'],
    cards: [
      ['01', 'The lineup', 'Speakers, sessions, and the moments people care about', 'SPEAKERS'],
      ['02', 'The schedule', 'A readable agenda that survives mobile screens', 'AGENDA'],
      ['03', 'The room', 'Venue, tickets, and the final registration step', 'JOIN'],
    ],
  },
  education: {
    eyebrow: 'Learning / program',
    hero: 'Give learning a clear path forward.',
    copy: 'Curriculum, instructors, outcomes, and enrollment arranged so students know exactly what comes next.',
    stats: ['01 program', '04 modules', '01 outcome'],
    cards: [
      ['01', 'Curriculum', 'Show what students will learn and in what order', 'MODULES'],
      ['02', 'Instructors', 'Make the people behind the learning visible', 'TEACH'],
      ['03', 'Enrollment', 'Make the next step obvious and reassuring', 'ENROLL'],
    ],
  },
  custom: {
    eyebrow: 'Custom / from scratch',
    hero: 'Start with the idea. Shape everything around it.',
    copy: 'A flexible starting point for websites that do not belong in a preset. The structure follows the brief, not the template.',
    stats: ['01 idea', '∞ directions', '01 build'],
    cards: [
      ['01', 'Your structure', 'Choose the pages, sections, and hierarchy you actually need', 'BUILD'],
      ['02', 'Your behavior', 'Describe the interactions and product logic that matter', 'DEFINE'],
      ['03', 'Your identity', 'Translate your visual references into a consistent system', 'STYLE'],
    ],
  },
};

const STYLE = {
  minimal: {
    page: '#f7f7f5', ink: '#171717', muted: 'rgba(23,23,23,.58)', accent: '#3f6fdc', second: '#dfe4ec',
    radius: 2, mode: 'minimal', surface: '#ffffff', line: 'rgba(23,23,23,.13)', font: 'Inter, system-ui, sans-serif',
  },
  modern: {
    page: '#f6f8fb', ink: '#172033', muted: 'rgba(23,32,51,.56)', accent: '#3167ef', second: '#55b89a',
    radius: 12, mode: 'modern', surface: '#ffffff', line: 'rgba(23,32,51,.10)', font: 'Inter, system-ui, sans-serif',
  },
  bold: {
    page: '#eee9dd', ink: '#0b0b0b', muted: 'rgba(11,11,11,.64)', accent: '#ffd52e', second: '#ef3d3b',
    radius: 0, mode: 'bold', surface: '#fffaf0', line: '#111111', font: 'Arial Black, Arial, sans-serif',
  },
  editorial: {
    page: '#f2efe7', ink: '#171717', muted: 'rgba(23,23,23,.61)', accent: '#a3322b', second: '#111111',
    radius: 0, mode: 'editorial', surface: '#f6f3eb', line: 'rgba(23,23,23,.22)', font: 'Georgia, Times New Roman, serif',
  },
  creative: {
    page: '#f3edf8', ink: '#1a1820', muted: 'rgba(26,24,32,.60)', accent: '#7c3aed', second: '#ec4899',
    radius: 28, mode: 'creative', surface: '#ffffff', line: 'rgba(26,24,32,.10)', font: 'Arial, sans-serif',
  },
  glass: {
    page: '#101842', ink: '#f6fbff', muted: 'rgba(246,251,255,.68)', accent: '#61dfff', second: '#c768ff',
    radius: 24, mode: 'glass', surface: 'rgba(255,255,255,.10)', line: 'rgba(255,255,255,.22)', font: 'Inter, system-ui, sans-serif',
  },
  clay: {
    page: '#e9e1dc', ink: '#403b40', muted: 'rgba(64,59,64,.60)', accent: '#ecaa8e', second: '#b8a9df',
    radius: 34, mode: 'clay', surface: '#eee7e1', line: 'transparent', font: 'Nunito, Inter, sans-serif',
  },
  brutalist: {
    page: '#f2eee3', ink: '#101010', muted: 'rgba(16,16,16,.63)', accent: '#ed3f3b', second: '#f5ce2c',
    radius: 0, mode: 'neo', surface: '#fff8df', line: '#111111', font: 'Arial, sans-serif',
  },
  brutalism: {
    page: '#ece9df', ink: '#111111', muted: 'rgba(17,17,17,.63)', accent: '#d8332d', second: '#f0c92a',
    radius: 0, mode: 'brutalism', surface: '#f7f3e8', line: '#111111', font: 'Arial Narrow, Arial, sans-serif',
  },
  cyberpunk: {
    page: '#070b11', ink: '#e8fbff', muted: 'rgba(232,251,255,.58)', accent: '#25e7f0', second: '#ff2ca3',
    radius: 3, mode: 'cyberpunk', surface: '#0d131c', line: 'rgba(37,231,240,.42)', font: 'Courier New, monospace',
  },
  neumorphism: {
    page: '#dfe4ea', ink: '#4b5865', muted: 'rgba(75,88,101,.64)', accent: '#648fc3', second: '#7fa89a',
    radius: 28, mode: 'neumorphism', surface: '#e5e9ef', line: 'transparent', font: 'Nunito, Inter, sans-serif',
  },
  bento: {
    page: '#f1f0eb', ink: '#181818', muted: 'rgba(24,24,24,.57)', accent: '#7d75f0', second: '#9de2cf',
    radius: 22, mode: 'bento', surface: '#ffffff', line: 'rgba(24,24,24,.05)', font: 'Inter, system-ui, sans-serif',
  },
  retro: {
    page: '#eeeafd', ink: '#1b1727', muted: 'rgba(27,23,39,.62)', accent: '#ff3fa9', second: '#23dbea',
    radius: 8, mode: 'retro', surface: '#fff', line: '#1b1727', font: 'Courier New, monospace',
  },
  luxury: {
    page: '#ebe5d6', ink: '#25231f', muted: 'rgba(37,35,31,.60)', accent: '#b39151', second: '#1f1e1a',
    radius: 0, mode: 'luxury', surface: '#f7f3e9', line: 'rgba(179,145,81,.62)', font: 'Georgia, Times New Roman, serif',
  },
  corporate: {
    page: '#f4f6f8', ink: '#1d3046', muted: 'rgba(29,48,70,.58)', accent: '#2f6bc2', second: '#dbe8f7',
    radius: 7, mode: 'corporate', surface: '#ffffff', line: 'rgba(29,48,70,.12)', font: 'Inter, system-ui, sans-serif',
  },
  organic: {
    page: '#f2ebdf', ink: '#39443b', muted: 'rgba(57,68,59,.61)', accent: '#8aa27a', second: '#d3a28d',
    radius: 32, mode: 'organic', surface: '#fbf5e9', line: 'rgba(57,68,59,.10)', font: 'Nunito, Inter, sans-serif',
  },
  retrofuturist: {
    page: '#dfe6e6', ink: '#213e50', muted: 'rgba(33,62,80,.66)', accent: '#2cb3b3', second: '#f07840',
    radius: 22, mode: 'retrofuturist', surface: '#f5f1df', line: 'rgba(33,62,80,.24)', font: 'Arial, sans-serif',
  },
  maximalist: {
    page: '#efe2ce', ink: '#17131c', muted: 'rgba(23,19,28,.62)', accent: '#ef2d83', second: '#27c5cf',
    radius: 4, mode: 'maximalist', surface: '#f7eddd', line: '#17131c', font: 'Arial Black, Arial, sans-serif',
  },
};

const alpha = (hex, opacity) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return `rgba(128,128,128,${opacity})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${opacity})`;
};

const lum = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
};

const textOn = (hex) => (lum(hex) > 0.58 ? '#171717' : '#ffffff');

const THEME_PRESETS = {
  dark: {
    page: '#0b0b0d', ink: '#f7f8fb', muted: 'rgba(247,248,251,.62)',
    heading: '#ffffff', body: '#f2f4f7', link: '#8de9ff', inverse: '#111216',
    surface: 'rgba(255,255,255,.075)', soft: '#15171c', line: 'rgba(255,255,255,.15)',
    accentBoost: '#ffffff', themeText: '#f7f8fb',
  },
  light: {
    page: '#f8f8f6', ink: '#141414', muted: 'rgba(20,20,20,.58)',
    heading: '#0a0a0a', body: '#242424', link: '#2458c6', inverse: '#ffffff',
    surface: '#ffffff', soft: '#f1f2f4', line: 'rgba(20,20,20,.12)',
    accentBoost: '#111111', themeText: '#141414',
  },
  neutral: {
    page: '#d9d9d6', ink: '#1b1b1b', muted: 'rgba(27,27,27,.58)',
    heading: '#121212', body: '#2a2a2a', link: '#365a88', inverse: '#f8f8f6',
    surface: 'rgba(255,255,255,.66)', soft: '#d2d2cf', line: 'rgba(27,27,27,.14)',
    accentBoost: '#111111', themeText: '#1b1b1b',
  },
  midnight: {
    page: '#0a1228', ink: '#eaf0ff', muted: 'rgba(220,230,255,.60)',
    heading: '#ffffff', body: '#e6edff', link: '#73ddff', inverse: '#09111f',
    surface: 'rgba(120,150,255,.10)', soft: '#101b37', line: 'rgba(150,175,255,.22)',
    accentBoost: '#b6c9ff', themeText: '#eaf0ff',
  },
  warm: {
    page: '#f3ead9', ink: '#2b2118', muted: 'rgba(43,33,24,.60)',
    heading: '#21150e', body: '#3a2b20', link: '#8a4f25', inverse: '#fffaf0',
    surface: 'rgba(255,255,255,.60)', soft: '#e9ddc9', line: 'rgba(43,33,24,.15)',
    accentBoost: '#251c15', themeText: '#2b2118',
  },
};

const getThemePreset = (theme) => THEME_PRESETS[theme] || THEME_PRESETS.dark;

function themedStyle(base, theme) {
  if (!theme || theme === 'auto') {
    return {
      ...base,
      theme: theme || 'dark',
      themeBg: base.page,
      themeInk: base.ink,
      themeHeading: base.ink,
      themeBody: base.ink,
      themeMuted: base.muted,
      themeLink: base.accent,
      themeInverse: textOn(base.page),
      themeSurface: base.surface,
      themeSoft: base.page,
      themeLine: base.line,
    };
  }
  const preset = getThemePreset(theme);
  return {
    ...base,
    page: preset.page,
    ink: preset.ink,
    muted: preset.muted,
    surface: preset.surface,
    line: preset.line,
    theme,
    themeBg: preset.page,
    themeInk: preset.ink,
    themeHeading: preset.heading,
    themeBody: preset.body,
    themeMuted: preset.muted,
    themeLink: preset.link,
    themeInverse: preset.inverse,
    themeSurface: preset.surface,
    themeSoft: preset.soft,
    themeLine: preset.line,
  };
};

function PreviewButton({ children, cfg, primary = true, compact = false }) {
  const { mode } = cfg;
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: compact ? 30 : 38,
    padding: compact ? '7px 11px' : '10px 16px',
    borderRadius: cfg.radius,
    border: `1px solid ${cfg.line === 'transparent' ? 'transparent' : cfg.line}`,
    background: primary ? cfg.accent : 'transparent',
    color: primary ? textOn(cfg.accent) : cfg.ink,
    fontSize: compact ? 8 : 9,
    fontWeight: 850,
    letterSpacing: ['editorial', 'luxury', 'cyberpunk', 'retro'].includes(mode) ? '.13em' : '.025em',
    textTransform: ['bold', 'neo', 'brutalism', 'cyberpunk', 'luxury', 'retro', 'maximalist'].includes(mode) ? 'uppercase' : 'none',
    cursor: 'pointer',
  };
  if (mode === 'minimal') Object.assign(base, { border: 0, borderBottom: `1px solid ${cfg.accent}`, borderRadius: 0, background: 'transparent', color: cfg.ink, paddingLeft: 0, paddingRight: 0 });
  if (mode === 'modern' || mode === 'corporate') base.boxShadow = primary ? '0 14px 28px -20px rgba(31,57,87,.50)' : 'none';
  if (mode === 'bold') Object.assign(base, { border: '3px solid #111', background: primary ? cfg.accent : '#fffaf0', color: '#111', borderRadius: 0 });
  if (mode === 'editorial') Object.assign(base, { borderColor: cfg.ink, background: primary ? cfg.ink : 'transparent', color: primary ? '#fff' : cfg.ink, borderRadius: 0 });
  if (mode === 'creative') Object.assign(base, { border: 0, borderRadius: 999, boxShadow: '0 18px 35px -22px rgba(86,55,117,.55)' });
  if (mode === 'glass') Object.assign(base, { borderColor: 'rgba(255,255,255,.24)', background: primary ? `linear-gradient(135deg,${alpha(cfg.accent,.92)},${alpha(cfg.second,.9)})` : 'rgba(255,255,255,.09)', color: '#fff', borderRadius: 999, backdropFilter: 'blur(18px)', boxShadow: '0 14px 34px -24px rgba(0,0,0,.8)' });
  if (mode === 'clay') Object.assign(base, { border: 0, borderRadius: 999, background: primary ? '#eca486' : '#eee8e2', color: primary ? '#3a302f' : cfg.ink, boxShadow: '8px 10px 18px rgba(92,71,79,.17), -8px -8px 18px rgba(255,255,255,.85)' });
  if (mode === 'neo') Object.assign(base, { border: '3px solid #111', borderRadius: 0, background: primary ? cfg.accent : '#fff8df', color: '#111', boxShadow: '5px 5px 0 #111' });
  if (mode === 'brutalism') Object.assign(base, { border: 0, borderBottom: `2px solid #111`, borderRadius: 0, background: 'transparent', color: '#111', paddingLeft: 0, paddingRight: 0 });
  if (mode === 'cyberpunk') Object.assign(base, { border: `1px solid ${cfg.accent}`, borderRadius: 2, background: primary ? alpha(cfg.accent,.14) : 'transparent', color: '#e8fbff', boxShadow: `0 0 18px -10px ${cfg.accent}` });
  if (mode === 'neumorphism') Object.assign(base, { border: 0, borderRadius: 999, background: '#e5e9ef', color: primary ? cfg.accent : cfg.ink, boxShadow: '8px 8px 16px rgba(107,118,130,.22), -8px -8px 16px rgba(255,255,255,.95)' });
  if (mode === 'bento') Object.assign(base, { border: 0, borderRadius: 999, background: primary ? cfg.ink : '#fff', color: primary ? '#fff' : cfg.ink });
  if (mode === 'retro') Object.assign(base, { border: '2px solid #1b1727', borderRadius: 7, background: primary ? `linear-gradient(180deg,${cfg.second},${cfg.accent})` : '#fff', color: '#1b1727', boxShadow: '4px 4px 0 #1b1727' });
  if (mode === 'luxury') Object.assign(base, { border: `1px solid ${cfg.accent}`, borderRadius: 0, background: primary ? '#23211e' : 'transparent', color: primary ? '#f7f1e5' : cfg.ink, letterSpacing: '.16em' });
  if (mode === 'organic') Object.assign(base, { border: 0, borderRadius: 999, background: primary ? cfg.accent : alpha(cfg.accent,.10), color: primary ? '#fff' : cfg.ink });
  if (mode === 'retrofuturist') Object.assign(base, { border: `1px solid ${cfg.accent}`, borderRadius: 999, background: primary ? alpha(cfg.accent,.16) : 'rgba(33,62,80,.08)', color: cfg.ink });
  if (mode === 'maximalist') Object.assign(base, { border: '2px solid #17131c', borderRadius: 3, background: primary ? cfg.accent : '#f7eddd', color: '#17131c', boxShadow: '4px 4px 0 #17131c' });
  return <button type="button" style={base}>{children}</button>;
}

function AmbientOrbs({ cfg }) {
  return (
    <>
      <div aria-hidden="true" style={{ position:'absolute', width:240, height:240, borderRadius:'50%', background:alpha(cfg.accent,.28), filter:'blur(28px)', top:-90, right:-70 }} />
      <div aria-hidden="true" style={{ position:'absolute', width:190, height:190, borderRadius:'50%', background:alpha(cfg.second,.30), filter:'blur(32px)', bottom:-80, left:-55 }} />
      <div aria-hidden="true" style={{ position:'absolute', width:130, height:130, borderRadius:'50%', background:'rgba(85,210,255,.20)', filter:'blur(22px)', top:'42%', left:'46%' }} />
    </>
  );
}

function HeroArtwork({ cfg, typeId }) {
  const { mode } = cfg;
  if (mode === 'minimal') {
    return (
      <div className="rdp-minimal-art">
        <div className="rdp-wire-box"><span>LIVE SYSTEM</span><i/><i/><i/></div>
        <div className="rdp-wire-list">
          {['Structure','Clarity','Signal'].map((x, i) => <div key={x}><span>0{i+1}</span><strong>{x}</strong><em>{typeId === 'ecommerce' ? 'PRODUCT' : 'SYSTEM'}</em></div>)}
        </div>
      </div>
    );
  }
  if (mode === 'modern') {
    return (
      <div className="rdp-modern-art">
        <div className="rdp-modern-window">
          <div className="rdp-window-top"><span/><span/><span/><b>PRODUCT / LIVE</b></div>
          <div className="rdp-chart"><i style={{height:'34%'}}/><i style={{height:'54%'}}/><i style={{height:'42%'}}/><i style={{height:'78%'}}/><i style={{height:'64%'}}/></div>
          <div className="rdp-modern-lines"><span/><span/><span/></div>
        </div>
        <div className="rdp-modern-chip">01 / FLOW</div>
      </div>
    );
  }
  if (mode === 'bold') {
    return (
      <div className="rdp-bold-art">
        <div className="rdp-bold-slab yellow"><span>IMAGE</span></div>
        <div className="rdp-bold-slab red"><span>03</span></div>
        <div className="rdp-bold-flag">MAKE<br/>NOISE.</div>
      </div>
    );
  }
  if (mode === 'editorial') {
    return (
      <div className="rdp-editorial-art">
        <div className="rdp-editorial-cover"><span>FEATURE</span><strong>THE<br/>NEW<br/><b>DIGITAL</b><br/>DESIGN.</strong></div>
        <div className="rdp-caption">FIG. 01 / COVER STUDY</div>
      </div>
    );
  }
  if (mode === 'creative') {
    return (
      <div className="rdp-creative-art">
        <div className="rdp-blob a"/>
        <div className="rdp-blob b"/>
        <div className="rdp-creative-card c1">PLAY / 01<strong>MAKE IT<br/>REAL.</strong></div>
        <div className="rdp-creative-card c2">IDEA / 02<strong>CHANGE<br/>THE SHAPE.</strong></div>
        <div className="rdp-creative-card c3">PROOF / 03<strong>STAY<br/>CURIOUS.</strong></div>
      </div>
    );
  }
  if (mode === 'glass') {
    return (
      <div className="rdp-glass-art">
        <div className="rdp-glass-orb orb1"/>
        <div className="rdp-glass-orb orb2"/>
        <div className="rdp-glass-panel back"/>
        <div className="rdp-glass-panel front">
          <span>LIQUID / 01</span>
          <strong>GLASS<br/>LIGHT.</strong>
          <div className="rdp-glass-bars"><i/><i/><i/></div>
        </div>
      </div>
    );
  }
  if (mode === 'clay') {
    return (
      <div className="rdp-clay-art">
        <div className="rdp-clay-puff p1">3D</div>
        <div className="rdp-clay-puff p2"/>
        <div className="rdp-clay-puff p3"/>
        <div className="rdp-clay-base">TACTILE / OBJECT</div>
      </div>
    );
  }
  if (mode === 'neo') {
    return (
      <div className="rdp-neo-art">
        <div className="rdp-neo-card pink">IMAGE</div>
        <div className="rdp-neo-card cyan">01</div>
        <div className="rdp-neo-card mint">LOUD.</div>
        <div className="rdp-neo-sticker">NEW!</div>
      </div>
    );
  }
  if (mode === 'brutalism') {
    return (
      <div className="rdp-brutal-art">
        <div className="rdp-brutal-black">CONTENT / 01</div>
        <div className="rdp-brutal-yellow"/>
        <div className="rdp-brutal-red"/>
        <div className="rdp-brutal-note">NO IMAGE. JUST STRUCTURE.</div>
      </div>
    );
  }
  if (mode === 'cyberpunk') {
    return (
      <div className="rdp-cyber-art">
        <div className="rdp-cyber-frame">
          <div className="rdp-cyber-top"><span>NODE / 07</span><b>ONLINE</b></div>
          <div className="rdp-cyber-core"><i/><i/><i/><i/></div>
          <div className="rdp-cyber-data">CORE STATUS // 99.4%</div>
        </div>
        <div className="rdp-cyber-line"/>
      </div>
    );
  }
  if (mode === 'neumorphism') {
    return (
      <div className="rdp-neu-art">
        <div className="rdp-neu-disc outer"><div className="rdp-neu-disc mid"><div className="rdp-neu-disc inner"><span/></div></div></div>
        <div className="rdp-neu-control"><span>SOFT CONTROL</span><i/><i/><i/></div>
      </div>
    );
  }
  if (mode === 'bento') {
    return (
      <div className="rdp-bento-art">
        <div className="tile big"><span>01 / FEATURE</span><strong>ONE SCREEN.<br/>MANY STORIES.</strong></div>
        <div className="tile purple"><span>02 / FOCUS</span><strong>92%</strong></div>
        <div className="tile green"><span>03 / STATUS</span><strong>LIVE</strong></div>
        <div className="tile orange"><span>04 / CTA</span><strong>GO →</strong></div>
      </div>
    );
  }
  if (mode === 'retro') {
    return (
      <div className="rdp-retro-art">
        <div className="rdp-retro-window">
          <div className="rdp-retro-title">WELCOME.EXE <span>_ □ X</span></div>
          <div className="rdp-retro-grid"><div className="rdp-retro-monitor">2000<br/><small>ONLINE</small></div></div>
        </div>
      </div>
    );
  }
  if (mode === 'luxury') {
    return (
      <div className="rdp-luxury-art">
        <div className="rdp-luxury-frame"><div>IMAGE / 01</div></div>
        <span className="rdp-luxury-rule"/>
        <small>CRAFTED FOR THE FEW.</small>
      </div>
    );
  }
  if (mode === 'corporate') {
    return (
      <div className="rdp-corporate-art">
        <div className="rdp-corp-aside"><span>BUSINESS</span><strong>01</strong><small>Enterprise<br/>Operations</small></div>
        <div className="rdp-corp-main">
          <div className="rdp-corp-stat"><b>24.5K</b><small>ACTIVE</small></div>
          <div className="rdp-corp-stat"><b>99.2%</b><small>UPTIME</small></div>
          <div className="rdp-corp-chart"><i/><i/><i/><i/><i/><i/></div>
        </div>
      </div>
    );
  }
  if (mode === 'organic') {
    return (
      <div className="rdp-organic-art">
        <div className="rdp-organic-window"><span>ORGANIC / 01</span><strong>GROW WITH<br/><b>INTENTION.</b></strong><small>Thoughtful systems with space to breathe.</small></div>
        <div className="rdp-organic-ring"><i/><i/></div>
      </div>
    );
  }
  if (mode === 'retrofuturist') {
    return (
      <div className="rdp-retrofuture-art">
        <div className="rdp-rf-orbit o1"/><div className="rdp-rf-orbit o2"/><div className="rdp-rf-orbit o3"/>
        <div className="rdp-rf-core"><span>AERODYNE</span><strong>TOMORROW<br/>STARTS HERE.</strong><small>TELEMETRY / 01</small></div>
      </div>
    );
  }
  if (mode === 'maximalist') {
    return (
      <div className="rdp-max-art">
        <div className="rdp-max-block b1">THE<br/>BIG<br/><b>PICTURE.</b></div>
        <div className="rdp-max-block b2"/>
        <div className="rdp-max-block b3">WOW!</div>
        <div className="rdp-max-block b4">MORE IS<br/>THE MEDIUM.</div>
        <div className="rdp-max-sticker">NEW<br/>DROP</div>
      </div>
    );
  }
  return <div className="rdp-fallback-art"><span>VISUAL / 01</span><div/><div/><div/></div>;
}

function StyleNav({ cfg, type }) {
  const label = TYPE_LABEL[type] || 'SITE';
  const { mode } = cfg;
  const links = ['WORK','ABOUT','INDEX','CONTACT'];
  if (mode === 'minimal') return <header className="rdp-nav minimal"><div><strong>NORTH / {label}</strong><nav>{links.map((x)=><span key={x}>{x}</span>)}</nav><span className="rdp-nav-action">VIEW INDEX</span></div></header>;
  if (mode === 'modern') return <header className="rdp-nav modern"><div><strong>vertex.</strong><nav><span>Product</span><span>Solutions</span><span>Resources</span><span>Company</span></nav><PreviewButton cfg={cfg} compact>Start</PreviewButton></div></header>;
  if (mode === 'bold') return <header className="rdp-nav bold"><div><strong>BIGCO.</strong><nav><span>WORK</span><span>SERVICES</span><span>ABOUT</span><span>CONTACT</span></nav><PreviewButton cfg={cfg} compact>START</PreviewButton></div></header>;
  if (mode === 'editorial') return <header className="rdp-nav editorial"><div className="rdp-ed-top"><strong>THE DAILY</strong><span>VOL. 28 / 2026</span></div><nav>{['LATEST','DESIGN','CULTURE','TECHNOLOGY','ARCHIVE'].map(x=><span key={x}>{x}</span>)}</nav></header>;
  if (mode === 'creative') return <header className="rdp-nav creative"><div><strong>PLAY / {label}</strong><nav><span>WORK</span><span>PLAY</span><span>STORIES</span><span>HELLO</span></nav><PreviewButton cfg={cfg} compact>LET'S GO</PreviewButton></div></header>;
  if (mode === 'glass') return <header className="rdp-nav glass"><div><strong>AURA / {label}</strong><nav><span>DISCOVER</span><span>FEATURES</span><span>STORIES</span><span>ABOUT</span></nav><span className="glass-chip">JOIN</span></div></header>;
  if (mode === 'clay') return <header className="rdp-nav clay"><div><strong>CLAYLAB / {label}</strong><nav><span>HOME</span><span>WORK</span><span>ABOUT</span><span>JOURNAL</span></nav><span className="clay-chip">START</span></div></header>;
  if (mode === 'neo') return <header className="rdp-nav neo"><div><strong>LOUD.</strong><nav><span>WORK</span><span>SERVICES</span><span>ABOUT</span><span>BLOG</span></nav><span>JOIN</span></div></header>;
  if (mode === 'brutalism') return <header className="rdp-nav brutalism"><div><strong>RAW / {label}</strong><nav><span>INDEX</span><span>PROJECTS</span><span>INFORMATION</span><span>CONTACT</span></nav></div></header>;
  if (mode === 'cyberpunk') return <header className="rdp-nav cyberpunk"><div><strong>NEXUS://07</strong><nav><span>HOME</span><span>MISSION</span><span>ARCHIVE</span><span>ACCESS</span></nav><b>ONLINE</b></div></header>;
  if (mode === 'neumorphism') return <header className="rdp-nav neumorphism"><div><strong>SOFTSPACE / {label}</strong><nav><span>HOME</span><span>WORK</span><span>ABOUT</span><span>CONTACT</span></nav><span className="neu-chip">GO</span></div></header>;
  if (mode === 'bento') return <header className="rdp-nav bento"><div><strong>NORTH / {label}</strong><nav><span>PRODUCT</span><span>FEATURES</span><span>RESOURCES</span><span>COMPANY</span></nav><PreviewButton cfg={cfg} compact>START</PreviewButton></div></header>;
  if (mode === 'retro') return <header className="rdp-nav retro"><div className="retro-title">MYSPACE.EXE <span>_ □ X</span></div><nav><span>HOME</span><span>COLLECTIONS</span><span>COMMUNITY</span><span>ABOUT</span></nav></header>;
  if (mode === 'luxury') return <header className="rdp-nav luxury"><div><strong>MAISON / {label}</strong><nav><span>COLLECTION</span><span>STORIES</span><span>ABOUT</span><span>CONTACT</span></nav><span>MENU</span></div></header>;
  if (mode === 'corporate') return <header className="rdp-nav corporate"><div><strong>VERTEX / {label}</strong><nav><span>SOLUTIONS</span><span>INDUSTRIES</span><span>INSIGHTS</span><span>COMPANY</span></nav><PreviewButton cfg={cfg} compact>TALK TO US</PreviewButton></div></header>;
  if (mode === 'organic') return <header className="rdp-nav organic"><div><strong>NATURA / {label}</strong><nav><span>STORY</span><span>SERVICES</span><span>JOURNAL</span><span>CONTACT</span></nav><span>HELLO</span></div></header>;
  if (mode === 'retrofuturist') return <header className="rdp-nav retrofuturist"><div><strong>AERODYNE / {label}</strong><nav><span>MISSION</span><span>WORK</span><span>FUTURE</span><span>ARCHIVE</span></nav><span>ENTER</span></div></header>;
  if (mode === 'maximalist') return <header className="rdp-nav maximalist"><div><strong>LOUD! / {label}</strong><nav><span>COLLECTIONS</span><span>FEATURES</span><span>COMMUNITY</span><span>CONTACT</span></nav><span>GO!</span></div></header>;
  return <header className="rdp-nav"><div><strong>STUDIO / {label}</strong><nav>{links.map(x=><span key={x}>{x}</span>)}</nav></div></header>;
}

function Hero({ cfg, typeId, headFont }) {
  const data = TYPE_COPY[typeId] || TYPE_COPY.portfolio;
  const { mode } = cfg;
  const gridClass = `rdp-hero rdp-hero-${mode}`;
  return (
    <section className={gridClass}>
      {mode === 'glass' && <AmbientOrbs cfg={cfg}/>}
      <div className="rdp-hero-inner">
        <div className="rdp-hero-copy">
          <span className="rdp-eyebrow">{data.eyebrow}</span>
          <h1 style={{ fontFamily: headFont }}>{data.hero}</h1>
          <p>{data.copy}</p>
          <div className="rdp-hero-actions">
            <PreviewButton cfg={cfg}>{typeId === 'ecommerce' ? 'SHOP THE COLLECTION' : typeId === 'blog' ? 'READ THE ISSUE' : typeId === 'hotel' ? 'EXPLORE THE STAY' : typeId === 'cafe' ? 'VIEW MENU' : 'EXPLORE THE WORK'}</PreviewButton>
            <PreviewButton cfg={cfg} primary={false}>SEE THE SYSTEM</PreviewButton>
          </div>
        </div>
        <div className="rdp-hero-art">
          <HeroArtwork cfg={cfg} typeId={typeId}/>
        </div>
      </div>
      {mode === 'bold' && <div className="rdp-marquee">MAKE NOISE ✦ SHOW THE WORK ✦ MAKE NOISE ✦ SHOW THE WORK ✦</div>}
      {mode === 'brutalism' && <div className="rdp-rule-label">01 / HERO / {data.eyebrow.toUpperCase()}</div>}
      {mode === 'cyberpunk' && <div className="rdp-scan-line">SYSTEM ACCESS // TRACE 0.04MS // SIGNAL STABLE</div>}
    </section>
  );
}

function Stats({ cfg, typeId }) {
  const stats = (TYPE_COPY[typeId] || TYPE_COPY.portfolio).stats;
  const { mode } = cfg;
  return (
    <section className={`rdp-stats rdp-stats-${mode}`}>
      <div>
        {stats.map((s, i) => <div key={s}><span>0{i+1}</span><strong>{s}</strong><small>{mode === 'corporate' ? 'VERIFIED' : mode === 'cyberpunk' ? 'ONLINE' : mode === 'editorial' ? 'INDEX' : 'SIGNAL'}</small></div>)}
      </div>
    </section>
  );
}

function ModuleContent({ cfg, typeId, index, headFont }) {
  const data = TYPE_COPY[typeId] || TYPE_COPY.portfolio;
  const title = ['Selected work','Featured collection','Lead story','The problem','Signature menu','Rooms / suites','Services'][index] || ['Capabilities','Latest stories','How it works','The space','Amenities','Process'][index] || 'Explore';
  const cards = data.cards;

  const cardRows = (variant = 'default') => cards.map(([n, t, c, m], i) => (
    <div key={`${n}-${t}`} className={`rdp-card rdp-card-${variant}-${i}`}>
      <span>{n} / {m}</span>
      <strong>{t}</strong>
      <p>{c}</p>
      <small>{i === 0 ? 'OPEN →' : i === 1 ? 'DETAILS →' : 'EXPLORE →'}</small>
    </div>
  ));

  const { mode } = cfg;
  if (mode === 'minimal') return <section className="rdp-sec minimal"><div className="rdp-section-head"><span>0{index+1} / {title.toUpperCase()}</span><h2 style={{fontFamily:headFont}}>{title}</h2><p>{data.copy}</p></div><div className="rdp-minimal-list">{cardRows('minimal')}</div></section>;
  if (mode === 'modern') return <section className="rdp-sec modern"><div className="rdp-modern-sec-head"><div><span>CAPABILITY / 0{index+1}</span><h2>{title}</h2></div><small>PRODUCT / SYSTEM READY</small></div><div className="rdp-modern-grid">{cardRows('modern')}<div className="rdp-modern-proof"><div className="rdp-proof-num">{index===0?'98%':index===1?'4.9':index===2?'3.8×':'24h'}</div><div className="rdp-proof-bar"><i/><i/><i/><i/><i/></div><small>PERFORMANCE / {index+1}</small></div></div></section>;
  if (mode === 'bold') return <section className={`rdp-sec bold band-${index%3}`}><div className="rdp-bold-head"><span>SECTION / 0{index+1}</span><h2>{title}</h2><b>KEEP SCROLLING →</b></div><div className="rdp-bold-grid"><div className="rdp-bold-feature">{cards[index%3][1]}<small>{cards[index%3][2]}</small></div>{cardRows('bold')}</div></section>;
  if (mode === 'editorial') return <section className="rdp-sec editorial"><div className="rdp-editorial-label">SECTION {String(index+1).padStart(2,'0')} / {title.toUpperCase()}</div><div className="rdp-editorial-grid"><div><h2 style={{fontFamily:headFont}}>{title}</h2><p className="dropcap" style={{fontFamily:headFont}}>{data.copy}</p><div className="rdp-editorial-rule"/><div className="rdp-editorial-quote">“Design gives the reader somewhere to look.”</div></div><div className="rdp-editorial-rows">{cards.map(([n,t,c,m])=><div key={n}><span>{n}</span><strong>{t}</strong><small>{m}</small><p>{c}</p></div>)}</div></div></section>;
  if (mode === 'creative') return <section className="rdp-sec creative"><div className="rdp-creative-head"><div><span>NEW / MODULE 0{index+1}</span><h2>{title}</h2></div><small>drag ↓ explore</small></div><div className="rdp-creative-collage">{cardRows('creative')}</div></section>;
  if (mode === 'glass') return <section className="rdp-sec glass"><div className="rdp-glass-sec-head"><span>MODULE / 0{index+1}</span><h2>{title}</h2><small>GLASS / LAYER {index+1}</small></div><div className="rdp-glass-grid">{cardRows('glass')}</div></section>;
  if (mode === 'clay') return <section className="rdp-sec clay"><div className="rdp-clay-heading"><span>0{index+1} / {title.toUpperCase()}</span><h2>{title}</h2><p>{data.copy}</p></div><div className="rdp-clay-grid">{cardRows('clay')}</div></section>;
  if (mode === 'neo') return <section className="rdp-sec neo"><div className="rdp-neo-head"><span>MODULE / 0{index+1}</span><h2>{title}</h2></div><div className="rdp-neo-grid">{cardRows('neo')}</div></section>;
  if (mode === 'brutalism') return <section className="rdp-sec brutalism"><div className="rdp-brutal-label">0{index+1}<br/>{title.toUpperCase()}</div><div className="rdp-brutal-list">{cards.map(([n,t,c,m])=><div key={n}><span>{n}</span><div><strong>{t}</strong><p>{c}</p></div><b>{m}</b></div>)}</div></section>;
  if (mode === 'cyberpunk') return <section className="rdp-sec cyberpunk"><div className="rdp-cyber-sec-top"><span>SEC_{String(index+3).padStart(2,'0')}</span><b>{title.toUpperCase()}</b></div><div className="rdp-cyber-grid">{cards.map(([n,t,c,m],i)=><div key={n} className={`cyber-cell c${i}`}><span>NODE / {n}</span><strong>{t}</strong><p>{c}</p><small>{m}</small></div>)}<div className="cyber-cell wide"><span>LIVE TELEMETRY</span><div className="rdp-cyber-bars">{[42,76,58,90,68,84,52].map((h,i)=><i style={{height:`${h}%`}} key={i}/>)}</div></div></div></section>;
  if (mode === 'neumorphism') return <section className="rdp-sec neumorphism"><div className="rdp-neu-heading"><span>0{index+1} / {title.toUpperCase()}</span><h2>{title}</h2><p>{data.copy}</p></div><div className="rdp-neu-grid">{cardRows('neu')}</div></section>;
  if (mode === 'bento') return <section className="rdp-sec bento"><div className="rdp-bento-grid-sec"><div className="bento-large"><span>01 / FEATURE</span><h2>{title}</h2><p>{data.copy}</p><PreviewButton cfg={cfg}>OPEN TILE</PreviewButton></div><div className="bento-small lilac"><span>02 / SIGNAL</span><strong>{index===0?'4.9×':index===1?'92%':index===2?'36':'24h'}</strong></div><div className="bento-small mint"><span>03 / STATUS</span><strong>LIVE</strong></div><div className="bento-wide orange"><span>04 / CONTENT</span><div>{cards.slice(0,2).map(x=><div key={x[0]}><b>{x[1]}</b><small>{x[2].slice(0,32)}…</small></div>)}</div></div><div className="bento-small pink"><span>05 / CTA</span><strong>GO →</strong></div></div></section>;
  if (mode === 'retro') return <section className="rdp-sec retro"><div className="retro-window"><div className="retro-title">APP / {title.toUpperCase()} <span>_ □ X</span></div><div className="retro-body"><h2>{title}</h2><div className="rdp-retro-grid-cards">{cards.map(([n,t,c,m])=><div key={n}><span>{n} / {m}</span><strong>{t}</strong><small>{c}</small></div>)}</div></div></div></section>;
  if (mode === 'luxury') return <section className={`rdp-sec luxury ${index%2?'lux-dark':''}`}><div className="rdp-lux-grid"><div><span>NO. 0{index+1}</span><h2 style={{fontFamily:headFont}}>{title}</h2><p style={{fontFamily:headFont}}>{data.copy}</p><PreviewButton cfg={cfg}>EXPLORE</PreviewButton></div><div className="rdp-lux-list">{cards.map(([n,t,c,m])=><div key={n}><b>{n}</b><strong>{t}</strong><small>{c}</small><span>{m}</span></div>)}</div></div></section>;
  if (mode === 'corporate') return <section className="rdp-sec corporate"><div className="rdp-corp-head"><span>CAPABILITY / 0{index+1}</span><h2>{title}</h2><small>VERIFIED / BUSINESS READY</small></div><div className="rdp-corp-tiles">{cards.map(([n,t,c,m],i)=><div key={n}><span>{n}</span><strong>{t}</strong><small>{m}</small><p>{c}</p></div>)}</div></section>;
  if (mode === 'organic') return <section className="rdp-sec organic"><div className="rdp-org-head"><span>0{index+1} / {title}</span><h2>{title}</h2><p>{data.copy}</p></div><div className="rdp-org-grid">{cards.map(([n,t,c,m],i)=><div key={n} className={`org-card o${i}`}><span>{n}</span><strong>{t}</strong><small>{c}</small><b>{m}</b></div>)}</div></section>;
  if (mode === 'retrofuturist') return <section className="rdp-sec retrofuturist"><div className="rdp-rf-head"><span>ORBIT / 0{index+1}</span><h2>{title}</h2><small>TELEMETRY / ACTIVE</small></div><div className="rdp-rf-grid">{cards.map(([n,t,c,m],i)=><div key={n} className={`rf-card rf${i}`}><span>{n} / {m}</span><strong>{t}</strong><small>{c}</small></div>)}<div className="rf-horizon"/></div></section>;
  if (mode === 'maximalist') return <section className={`rdp-sec maximalist mx-${index%3}`}><div className="rdp-max-head"><span>SECTION / 0{index+1}</span><h2>{title}</h2><b>MORE IS MORE</b></div><div className="rdp-max-grid">{cards.map(([n,t,c,m],i)=><div key={n} className={`max-card m${i}`}><span>{n}</span><strong>{t}</strong><small>{c}</small><b>{m}</b></div>)}<div className="max-ribbon">MAKE IT BIG ✦ MAKE IT BOLD ✦</div></div></section>;

  return <section className="rdp-sec"><div className="rdp-section-head"><span>0{index+1}</span><h2>{title}</h2><p>{data.copy}</p></div><div className="rdp-default-grid">{cardRows()}</div></section>;
}

function FinalCTA({ cfg, typeId, headFont }) {
  const data = TYPE_COPY[typeId] || TYPE_COPY.portfolio;
  const { mode } = cfg;
  if (mode === 'editorial' || mode === 'luxury') return <section className={`rdp-final ${mode}`}><div><span>FINAL / {TYPE_LABEL[typeId]}</span><h2 style={{fontFamily:headFont}}>Make the next page worth opening.</h2><PreviewButton cfg={cfg}>START A CONVERSATION</PreviewButton></div></section>;
  if (mode === 'cyberpunk' || mode === 'retrofuturist') return <section className={`rdp-final ${mode}`}><div><span>ACCESS / FINAL NODE</span><h2>READY FOR THE NEXT NODE?</h2><p>{data.copy}</p><PreviewButton cfg={cfg}>CONNECT ↗</PreviewButton></div></section>;
  if (mode === 'glass') return <section className="rdp-final glass"><div><span>FINAL LAYER</span><h2>Stay for the last screen.</h2><p>{data.copy}</p><PreviewButton cfg={cfg}>ENTER EXPERIENCE</PreviewButton></div></section>;
  return <section className={`rdp-final ${mode}`}><div><span>FINAL / {TYPE_LABEL[typeId]}</span><h2>{mode==='bold' || mode==='neo' ? 'MAKE THE NEXT CLICK COUNT.' : 'One clear next move.'}</h2><p>{data.copy}</p><PreviewButton cfg={cfg}>{typeId==='hotel'?'ENQUIRE':typeId==='ecommerce'?'VIEW CART':'GET STARTED'}</PreviewButton></div></section>;
}

function Footer({ cfg, typeId }) {
  const { mode } = cfg;
  const label = TYPE_LABEL[typeId] || 'SITE';
  const links = ['ABOUT','WORK','JOURNAL','CONTACT'];
  if (mode === 'editorial' || mode === 'luxury') return <footer className={`rdp-footer ${mode}`}><div><strong>{mode==='luxury'?'MAISON':'THE DAILY'}</strong><p>A composed closing note, not a loud exit.</p></div><nav>{links.map(x=><span key={x}>{x}</span>)}</nav></footer>;
  if (mode === 'glass') return <footer className="rdp-footer glass"><div><strong>AURA / END</strong><p>Transparent finish. Clear memory.</p></div><nav>{links.map(x=><span key={x}>{x}</span>)}</nav></footer>;
  if (mode === 'cyberpunk') return <footer className="rdp-footer cyberpunk"><div><strong>// NEXUS</strong><p>STATUS: COMPLETE</p></div><nav>{links.map(x=><span key={x}>{x}</span>)}</nav></footer>;
  if (mode === 'neumorphism') return <footer className="rdp-footer neumorphism"><div><strong>SOFTSPACE</strong><p>Calm interface. Clear hierarchy.</p></div><nav>{links.map(x=><span key={x}>{x}</span>)}</nav></footer>;
  if (mode === 'neo' || mode === 'brutalism') return <footer className={`rdp-footer ${mode}`}><div><strong>{mode==='neo'?'LOUD.':'RAW.'} / {label}</strong><p>Keep the structure. Keep it clear.</p></div><nav>{links.map(x=><span key={x}>{x}</span>)}</nav></footer>;
  return <footer className={`rdp-footer ${mode}`}><div><strong>{label}</strong><p>Built from a style reference, not a generic template.</p></div><nav>{links.map(x=><span key={x}>{x}</span>)}</nav></footer>;
}

function Page({ design, palette, typo, websiteType }) {
  const reduce = useReducedMotion();
  const baseStyle = STYLE[design?.style] || STYLE.modern;
  const paletteColors = Array.isArray(palette) ? palette.filter(Boolean) : [];
  const themeId = design?.theme || 'dark';
  const themedBase = themedStyle(baseStyle, themeId);
  const cfg = {
    ...themedBase,
    accent: design?.primaryColor || paletteColors[0] || themedBase.accent,
    second: paletteColors[1] || themedBase.second,
    third: paletteColors[2] || paletteColors[3] || themedBase.accent,
    fourth: paletteColors[3] || paletteColors[1] || themedBase.second,
    fg: themedBase.ink,
    muted: themedBase.muted,
    themeBg: themedBase.themeBg,
    themeInk: themedBase.themeInk,
    themeHeading: themedBase.themeHeading,
    themeBody: themedBase.themeBody,
    themeMuted: themedBase.themeMuted,
    themeLink: themedBase.themeLink,
    themeInverse: themedBase.themeInverse,
    themeSurface: themedBase.themeSurface,
    themeSoft: themedBase.themeSoft,
    themeLine: themedBase.themeLine,
  };
  const typeId = TYPE_COPY[websiteType] ? websiteType : 'portfolio';
  const styleLabel = DESIGN_STYLES.find((x) => x.id === design?.style)?.label || 'Modern';
  const headFont = typo?.font || themedBase.font;
  const anim = design?.animations || 'subtle';
  const reveal = reduce || anim === 'none'
    ? {}
    : anim === 'scroll'
      ? { initial:{opacity:0,y:14}, whileInView:{opacity:1,y:0}, viewport:{once:true,amount:.12}, transition:{duration:.4} }
      : { initial:{opacity:0,y:7}, animate:{opacity:1,y:0}, transition:{duration:.35} };
  return (
    <div className={`rdp-page rdp-style-${themedBase.mode} rdp-theme-${themeId}`} style={{'--rdp-bg':cfg.themeBg,'--rdp-ink':cfg.fg,'--rdp-muted':cfg.muted,'--rdp-accent':cfg.accent,'--rdp-second':cfg.second,'--rdp-third':cfg.third,'--rdp-fourth':cfg.fourth,'--rdp-line':cfg.themeLine,'--rdp-radius':`${cfg.radius}px`,'--rdp-theme-surface':cfg.themeSurface,'--rdp-theme-soft':cfg.themeSoft,'--rdp-theme-bg':cfg.themeBg,'--rdp-theme-ink':cfg.themeInk,'--rdp-theme-heading':cfg.themeHeading,'--rdp-theme-body':cfg.themeBody,'--rdp-theme-muted':cfg.themeMuted,'--rdp-theme-link':cfg.themeLink,'--rdp-theme-inverse':cfg.themeInverse,'--rdp-theme-line':cfg.themeLine}}>
      <div className="rdp-stack">
        <StyleNav cfg={cfg} type={typeId}/>
        <motion.div {...reveal}><Hero cfg={cfg} typeId={typeId} headFont={headFont}/></motion.div>
        <Stats cfg={cfg} typeId={typeId}/>
        {Array.from({length:4}).map((_, i) => (
          <motion.div key={`${typeId}-${i}`} {...reveal}><ModuleContent cfg={cfg} typeId={typeId} index={i} headFont={headFont}/></motion.div>
        ))}
        <FinalCTA cfg={cfg} typeId={typeId} headFont={headFont}/>
        <Footer cfg={cfg} typeId={typeId}/>
      </div>
      <span className="rdp-style-badge">{styleLabel} · {TYPE_LABEL[typeId]}</span>
    </div>
  );
}

function BrowserChrome({ styleLabel, websiteLabel, accent, viewportMode = 'desktop' }) {
  if (viewportMode === 'mobile') {
    return <div className="rdp-mobile-chrome"><span className="rdp-mobile-notch"/><div className="rdp-mobile-status"><b>9:41</b><span>● ◔ ▰</span></div><div className="rdp-mobile-url" style={{ borderColor: `${accent}55` }}>{websiteLabel.toLowerCase()}.yourwebsite.com</div><small>{styleLabel}</small></div>;
  }
  return <div className="rdp-browser"><i/><i/><i/><div>{`yourwebsite.com/${websiteLabel.toLowerCase()}`}</div><span>{styleLabel}</span></div>;
}

const css = `
.rdp-page{width:100%;max-width:100%;min-width:0;container-type:inline-size;background:var(--rdp-bg);color:var(--rdp-ink);overflow:hidden;position:relative;overflow-wrap:anywhere}.rdp-page *{min-width:0;max-width:100%}
.rdp-page,.rdp-page *{box-sizing:border-box}
.rdp-stack{display:block}
.rdp-page h1,.rdp-page h2,.rdp-page h3,.rdp-page p{margin-top:0}
.rdp-page button{font:inherit}.rdp-page img,.rdp-page video{max-width:100%;height:auto;display:block}.rdp-page a,.rdp-page button{max-width:100%}
.rdp-style-badge{position:absolute;right:10px;top:8px;font-size:6.5px;letter-spacing:.08em;text-transform:uppercase;opacity:.32;pointer-events:none}
.rdp-content{width:100%;max-width:1120px;margin:0 auto;padding-inline:24px}
.rdp-nav{position:relative;z-index:4}
.rdp-nav>div,.rdp-nav>nav{width:min(1120px,100%);margin:auto}
.rdp-nav nav{display:flex;gap:18px;align-items:center}
.rdp-nav span,.rdp-nav b,.rdp-nav small{font-size:7.5px}
.rdp-nav.minimal{padding:18px 24px;border-bottom:1px solid var(--rdp-line);background:var(--rdp-bg)}
.rdp-nav.minimal>div{display:flex;align-items:center;gap:28px}
.rdp-nav.minimal strong{font-size:10px}.rdp-nav.minimal nav{margin-left:auto}.rdp-nav-action{font-size:7px!important;border-bottom:1px solid var(--rdp-accent);padding:4px 0}
.rdp-nav.modern{padding:13px 22px;background:#fff}.rdp-nav.modern>div,.rdp-nav.bold>div,.rdp-nav.corporate>div{display:flex;align-items:center;gap:22px}
.rdp-nav.modern strong{font-size:12px}.rdp-nav.modern nav,.rdp-nav.corporate nav{margin:auto}
.rdp-nav.bold{padding:10px 18px;background:#fff;border-bottom:3px solid #111}.rdp-nav.bold strong{font-size:12px;letter-spacing:.08em}.rdp-nav.bold nav{margin:auto}
.rdp-nav.editorial{padding:20px 28px 12px;background:var(--rdp-bg);border-bottom:3px double rgba(23,23,23,.35)}.rdp-ed-top{display:flex;justify-content:space-between;align-items:end}.rdp-ed-top strong{font:17px Georgia,serif}.rdp-ed-top span{font-size:7px;letter-spacing:.12em}.rdp-nav.editorial nav{padding-top:11px}
.rdp-nav.creative{padding:16px 24px;background:var(--rdp-bg)}.rdp-nav.creative>div{display:flex;align-items:center;gap:20px}.rdp-nav.creative nav{margin:auto}
.rdp-nav.glass{padding:14px 20px;background:transparent}.rdp-nav.glass>div{display:flex;align-items:center;gap:20px;max-width:980px;padding:11px 15px;border:1px solid rgba(255,255,255,.22);border-radius:999px;background:rgba(255,255,255,.10);backdrop-filter:blur(18px);box-shadow:0 18px 40px -30px rgba(0,0,0,.8);color:#fff}.rdp-nav.glass nav{margin:auto}.glass-chip{padding:5px 9px;border:1px solid rgba(255,255,255,.18);border-radius:999px}
.rdp-nav.clay{padding:16px 24px 8px;background:var(--rdp-bg)}.rdp-nav.clay>div{display:flex;align-items:center;gap:20px;padding:10px 14px;border-radius:999px;background:#eee7e1;box-shadow:8px 9px 17px rgba(92,71,79,.16),-8px -8px 17px rgba(255,255,255,.88)}.rdp-nav.clay nav{margin:auto}.clay-chip{padding:6px 10px;border-radius:999px;background:#eca486;box-shadow:5px 6px 11px rgba(92,71,79,.16)}
.rdp-nav.neo{margin:14px 20px 0;padding:9px 11px;border:3px solid #111;box-shadow:5px 5px 0 #111;background:#fff8df}.rdp-nav.neo>div{display:flex;align-items:center;gap:18px}.rdp-nav.neo nav{margin:auto}.rdp-nav.neo>div>span{background:var(--rdp-accent);border:2px solid #111;padding:4px 7px;font-weight:900}
.rdp-nav.brutalism{padding:18px 26px 9px;background:var(--rdp-bg);border-bottom:1px solid #111}.rdp-nav.brutalism>div{display:flex;justify-content:space-between;align-items:center}.rdp-nav.brutalism strong{font-size:9px;letter-spacing:.08em}.rdp-nav.brutalism nav{gap:16px}
.rdp-nav.cyberpunk{padding:10px 18px;background:#060a11;border-bottom:1px solid rgba(37,231,240,.42);color:#e8fbff}.rdp-nav.cyberpunk>div{display:flex;align-items:center;gap:20px}.rdp-nav.cyberpunk strong{color:var(--rdp-accent);font-size:9px;letter-spacing:.14em}.rdp-nav.cyberpunk nav{margin:auto}.rdp-nav.cyberpunk b{color:#a6f542}
.rdp-nav.neumorphism{padding:18px 24px 10px;background:var(--rdp-bg)}.rdp-nav.neumorphism>div{display:flex;align-items:center;gap:20px;padding:11px 14px;border-radius:999px;background:#e5e9ef;box-shadow:8px 9px 17px rgba(107,118,130,.22),-8px -8px 17px rgba(255,255,255,.95)}.rdp-nav.neumorphism nav{margin:auto}.neu-chip{border-radius:999px;padding:6px 10px;background:#e5e9ef;box-shadow:inset 4px 4px 8px rgba(107,118,130,.18),inset -4px -4px 8px rgba(255,255,255,.95)}
.rdp-nav.bento{padding:15px 22px;background:var(--rdp-bg)}.rdp-nav.bento>div{display:flex;align-items:center;gap:20px}.rdp-nav.bento nav{margin:auto}
.rdp-nav.retro{margin:15px 20px 0;border:2px solid #1b1727;box-shadow:5px 5px 0 #1b1727;background:#fff}.retro-title{padding:6px 9px;border-bottom:2px solid #1b1727;background:linear-gradient(90deg,var(--rdp-accent),var(--rdp-second));font:900 8px 'Courier New',monospace;display:flex;justify-content:space-between}.rdp-nav.retro nav{padding:8px 10px;justify-content:space-between}
.rdp-nav.luxury{padding:24px 32px 12px;background:var(--rdp-bg);border-bottom:1px solid var(--rdp-line)}.rdp-nav.luxury>div{display:flex;align-items:center;gap:20px}.rdp-nav.luxury strong{font:16px Georgia,serif;letter-spacing:.16em}.rdp-nav.luxury nav{margin:auto}.rdp-nav.luxury>div>span{border:1px solid var(--rdp-accent);padding:6px 9px;font-size:7px;letter-spacing:.14em}
.rdp-nav.corporate{padding:14px 24px;background:#fff;border-bottom:1px solid var(--rdp-line)}.rdp-nav.corporate strong{font-size:10px}.rdp-nav.corporate nav{margin:auto}
.rdp-nav.organic{padding:18px 26px;background:var(--rdp-bg)}.rdp-nav.organic>div{display:flex;align-items:center;gap:20px}.rdp-nav.organic nav{margin:auto}.rdp-nav.organic>div>span{padding:6px 10px;border-radius:999px;background:var(--rdp-accent);color:#fff}
.rdp-nav.retrofuturist{padding:12px 22px;background:#213e50;color:#eef9ff}.rdp-nav.retrofuturist>div{display:flex;align-items:center;gap:20px;padding:9px 12px;border:1px solid rgba(255,255,255,.20);border-radius:999px}.rdp-nav.retrofuturist nav{margin:auto}.rdp-nav.retrofuturist>div>span{border:1px solid var(--rdp-second);padding:6px 10px;border-radius:999px;color:#fff}
.rdp-nav.maximalist{margin:12px 20px 0;background:#24162d;color:#fff;border:2px solid #17131c;box-shadow:6px 6px 0 #17131c}.rdp-nav.maximalist>div{display:flex;align-items:center;gap:20px;padding:8px 10px}.rdp-nav.maximalist strong{background:var(--rdp-accent);color:#17131c;padding:5px 7px}.rdp-nav.maximalist nav{margin:auto}.rdp-nav.maximalist>div>span{background:var(--rdp-second);color:#17131c;padding:5px 8px;font-weight:900}

.rdp-hero{position:relative;overflow:hidden}
.rdp-hero-inner{width:min(1120px,100%);margin:auto;display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,.9fr);gap:28px;align-items:center;padding:52px 24px 62px}
.rdp-eyebrow{display:block;font-size:7.5px;font-weight:900;letter-spacing:.13em;margin-bottom:12px}
.rdp-hero-copy h1{font-size:clamp(40px,7.3cqw,78px);line-height:.93;letter-spacing:-.055em;margin:0 0 18px;font-weight:800}
.rdp-hero-copy p{max-width:560px;font-size:13px;line-height:1.7;color:var(--rdp-muted);margin-bottom:20px}
.rdp-hero-actions{display:flex;gap:10px;flex-wrap:wrap}
.rdp-hero-art{min-width:0;min-height:290px}
.rdp-hero-minimal{border-bottom:1px solid var(--rdp-line);background:#fafaf8}
.rdp-hero-minimal .rdp-hero-inner{padding-top:66px;padding-bottom:76px}
.rdp-minimal-art{display:grid;grid-template-columns:1fr;gap:12px}
.rdp-wire-box{min-height:220px;border:1px solid #121212;background:#f1f2f0;padding:18px;position:relative}.rdp-wire-box span{font-size:7px}.rdp-wire-box i{position:absolute;left:18px;height:8px;background:#dfe2ea;width:58%}.rdp-wire-box i:nth-child(2){top:64px}.rdp-wire-box i:nth-child(3){top:84px;width:42%}.rdp-wire-box i:nth-child(4){bottom:20px;width:25%;background:var(--rdp-accent)}
.rdp-wire-list{border-top:1px solid #111}.rdp-wire-list>div{display:grid;grid-template-columns:36px 1fr auto;padding:9px 0;border-bottom:1px solid #111;align-items:center}.rdp-wire-list span,.rdp-wire-list em{font-size:7px;font-style:normal;color:var(--rdp-muted)}.rdp-wire-list strong{font-size:10px}

.rdp-hero-modern{background:#f6f8fb}.rdp-modern-art{position:relative;min-height:310px}.rdp-modern-window{position:absolute;inset:16px 20px 24px 10px;background:#fff;border:1px solid rgba(23,32,51,.08);border-radius:14px;box-shadow:0 30px 55px -36px rgba(18,37,68,.35);padding:13px}.rdp-window-top{display:flex;gap:4px;align-items:center;font-size:7px;color:#6d7788}.rdp-window-top span{width:6px;height:6px;border-radius:50%;background:#ced6e2}.rdp-window-top b{margin-left:auto;font-size:6px}.rdp-chart{height:120px;display:flex;align-items:end;gap:9px;padding:18px 12px;background:linear-gradient(180deg,#f7f9fb,#eef3f9);margin-top:15px;border-radius:10px}.rdp-chart i{display:block;flex:1;background:linear-gradient(180deg,var(--rdp-accent),#a7c5ff);border-radius:4px 4px 0 0}.rdp-modern-lines{display:grid;gap:7px;margin-top:13px}.rdp-modern-lines span{height:7px;border-radius:999px;background:#e9eef5}.rdp-modern-lines span:nth-child(1){width:74%}.rdp-modern-lines span:nth-child(2){width:48%}.rdp-modern-lines span:nth-child(3){width:62%}.rdp-modern-chip{position:absolute;right:0;bottom:0;padding:8px 10px;border-radius:9px;background:#fff;border:1px solid rgba(23,32,51,.08);box-shadow:0 16px 28px -20px rgba(18,37,68,.4);font-size:6.5px;font-weight:800;color:var(--rdp-accent)}

.rdp-hero-bold{background:#eee9dd}.rdp-hero-bold .rdp-hero-inner{padding-top:36px}.rdp-hero-bold .rdp-hero-copy h1{font-size:clamp(48px,10.5cqw,96px);text-transform:uppercase;font-weight:950;line-height:.82}.rdp-bold-art{min-height:300px;position:relative}.rdp-bold-slab{position:absolute;border:3px solid #111}.rdp-bold-slab.yellow{width:62%;height:70%;right:8%;top:12%;background:#ffd52e;display:grid;place-items:center;font-size:14px;font-weight:900}.rdp-bold-slab.red{width:32%;height:36%;left:5%;bottom:7%;background:#ef3d3b;color:#fff;display:grid;place-items:center;font-size:20px;font-weight:900}.rdp-bold-flag{position:absolute;left:0;top:0;background:#111;color:#fff;padding:7px 9px;font-size:7px;font-weight:900;line-height:.95}
.rdp-marquee{border-top:3px solid #111;border-bottom:3px solid #111;background:#111;color:#fff;padding:8px 0;font-size:8px;font-weight:900;letter-spacing:.12em;white-space:nowrap;overflow:hidden}

.rdp-hero-editorial{background:#f2efe7;border-bottom:1px solid rgba(23,23,23,.22)}.rdp-hero-editorial .rdp-hero-inner{grid-template-columns:minmax(0,1fr) minmax(280px,.75fr);padding-top:50px}.rdp-hero-editorial .rdp-hero-copy h1{font:500 clamp(46px,7.5cqw,86px)/.9 Georgia,serif}.rdp-editorial-art{min-height:310px;display:flex;flex-direction:column;gap:8px}.rdp-editorial-cover{height:290px;background:#121212;color:#fff;padding:16px;display:flex;flex-direction:column;justify-content:space-between}.rdp-editorial-cover span{font-size:7px;letter-spacing:.15em;color:var(--rdp-accent)}.rdp-editorial-cover strong{font:500 33px/.9 Georgia,serif}.rdp-editorial-cover b{color:#d34a41}.rdp-caption{font-size:7px;color:var(--rdp-muted);border-top:1px solid var(--rdp-line);padding-top:7px}
.rdp-hero-creative{background:#f3edf8}.rdp-hero-creative .rdp-hero-inner{padding-top:48px}.rdp-hero-creative .rdp-hero-copy h1{font-weight:900}.rdp-creative-art{min-height:340px;position:relative}.rdp-blob{position:absolute;border-radius:50%;filter:blur(2px);opacity:.55}.rdp-blob.a{width:160px;height:160px;background:#ffb0cf;left:5%;top:0}.rdp-blob.b{width:210px;height:210px;background:#b9a5ff;right:-4%;bottom:-20px}.rdp-creative-card{position:absolute;padding:15px;border-radius:28px;color:#15131a;box-shadow:0 20px 38px -28px rgba(57,34,78,.6);font-size:7px;font-weight:900}.rdp-creative-card strong{display:block;font-size:20px;line-height:.9;margin-top:36px}.rdp-creative-card.c1{left:5%;top:16%;width:62%;height:130px;background:#f4b15f;transform:rotate(-4deg)}.rdp-creative-card.c2{right:0;top:34%;width:60%;height:128px;background:#a4dce3;transform:rotate(4deg)}.rdp-creative-card.c3{left:22%;bottom:0;width:56%;height:105px;background:#9ed59d;transform:rotate(-2deg)}

.rdp-hero-glass{background:#101842;position:relative}.rdp-hero-glass .rdp-hero-inner{position:relative;z-index:1;padding-top:52px;padding-bottom:66px}.rdp-hero-glass .rdp-hero-copy h1{color:#fff}.rdp-hero-glass .rdp-hero-copy p{color:rgba(246,251,255,.68)}.rdp-glass-art{position:relative;min-height:330px}.rdp-glass-orb{position:absolute;border-radius:50%;filter:blur(8px)}.rdp-glass-orb.orb1{width:170px;height:170px;background:rgba(91,119,255,.55);left:5%;top:3%}.rdp-glass-orb.orb2{width:160px;height:160px;background:rgba(201,88,255,.55);right:6%;bottom:1%}.rdp-glass-panel{position:absolute;border:1px solid rgba(255,255,255,.21);background:rgba(255,255,255,.09);backdrop-filter:blur(22px);border-radius:24px;box-shadow:0 35px 60px -38px rgba(0,0,0,.8)}.rdp-glass-panel.back{inset:24px 4% 8px 20%;transform:rotate(5deg);opacity:.62}.rdp-glass-panel.front{inset:10px 11% 30px 5%;padding:16px;color:#fff}.rdp-glass-panel.front>span{font-size:7px;opacity:.74}.rdp-glass-panel.front strong{display:block;font-size:34px;line-height:.9;margin-top:52px}.rdp-glass-bars{display:grid;gap:6px;margin-top:22px}.rdp-glass-bars i{height:6px;background:linear-gradient(90deg,rgba(255,255,255,.30),rgba(255,255,255,.08));border-radius:999px}.rdp-glass-bars i:nth-child(1){width:72%}.rdp-glass-bars i:nth-child(2){width:54%}.rdp-glass-bars i:nth-child(3){width:38%}

.rdp-hero-clay{background:#e9e1dc}.rdp-hero-clay .rdp-hero-inner{padding-top:48px}.rdp-hero-clay .rdp-hero-inner>div:first-child{z-index:1}.rdp-hero-clay .rdp-hero-copy h1{font-weight:900}.rdp-clay-art{position:relative;min-height:320px}.rdp-clay-base{position:absolute;inset:18px 0 10px;background:#eee7e1;border-radius:34px;box-shadow:14px 15px 28px rgba(92,71,79,.18),-14px -14px 28px rgba(255,255,255,.88);padding:18px;font-size:7px;color:#655d5f;display:flex;align-items:end}.rdp-clay-puff{position:absolute;border-radius:34px;display:grid;place-items:center;font-weight:900;box-shadow:10px 12px 22px rgba(92,71,79,.16),-8px -8px 17px rgba(255,255,255,.9),inset 7px 7px 13px rgba(255,255,255,.35),inset -7px -7px 13px rgba(92,71,79,.08)}.rdp-clay-puff.p1{width:150px;height:150px;background:#eca486;left:10%;top:0;font-size:24px}.rdp-clay-puff.p2{width:100px;height:100px;background:#b8a9df;right:8%;top:20px}.rdp-clay-puff.p3{width:80px;height:80px;background:#9bcdb9;right:18%;bottom:22px}

.rdp-hero-neo{background:#f2eee3}.rdp-hero-neo .rdp-hero-inner{padding-top:34px}.rdp-hero-neo .rdp-hero-copy h1{text-transform:uppercase;font-weight:950}.rdp-neo-art{min-height:300px;position:relative}.rdp-neo-card{position:absolute;border:3px solid #111;box-shadow:6px 6px 0 #111;padding:14px;font-weight:900}.rdp-neo-card.pink{background:#ef4ba4;right:10%;top:3%;width:64%;height:55%;font-size:12px}.rdp-neo-card.cyan{background:#58c4da;left:6%;bottom:4%;width:42%;height:45%;font-size:22px}.rdp-neo-card.mint{background:#9ddab6;right:0;bottom:10%;width:44%;height:32%;font-size:20px}.rdp-neo-sticker{position:absolute;right:36%;top:36%;background:#f5d832;border:3px solid #111;box-shadow:4px 4px 0 #111;padding:7px 9px;transform:rotate(-10deg);font-weight:950}

.rdp-hero-brutalism{background:#ece9df}.rdp-hero-brutalism .rdp-hero-inner{grid-template-columns:minmax(0,1.1fr) minmax(270px,.7fr);padding-top:48px;padding-bottom:42px}.rdp-hero-brutalism .rdp-hero-copy h1{font-weight:900;text-transform:uppercase}.rdp-brutal-art{height:310px;border:1px solid #111;background:#f7f3e8;padding:14px;display:grid;grid-template-columns:1.3fr .7fr;grid-template-rows:1fr 1fr;gap:8px;position:relative}.rdp-brutal-black{grid-row:span 2;background:#111;color:#fff;padding:10px;font-size:18px;font-weight:900}.rdp-brutal-yellow{background:#f0c92a;border:1px solid #111}.rdp-brutal-red{background:#d8332d;border:1px solid #111}.rdp-brutal-note{position:absolute;left:14px;bottom:11px;font-size:6.5px;background:#f7f3e8;padding:3px}
.rdp-rule-label{border-top:1px solid #111;padding:7px 24px;font-size:7px;font-weight:900;max-width:1120px;margin:auto}

.rdp-hero-cyberpunk{background:#070b11;color:#e8fbff;background-image:linear-gradient(rgba(37,231,240,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(37,231,240,.035) 1px,transparent 1px);background-size:18px 18px}.rdp-hero-cyberpunk .rdp-hero-inner{padding-top:38px;padding-bottom:48px}.rdp-hero-cyberpunk .rdp-hero-copy h1{color:#fff;text-transform:uppercase}.rdp-hero-cyberpunk .rdp-hero-copy p{color:var(--rdp-muted)}.rdp-cyber-art{height:320px;position:relative}.rdp-cyber-frame{position:absolute;inset:12px 6px 10px;border:1px solid rgba(37,231,240,.45);background:rgba(8,14,22,.74);box-shadow:0 0 34px -25px var(--rdp-accent);padding:14px}.rdp-cyber-top{display:flex;justify-content:space-between;font-size:7px;color:var(--rdp-accent)}.rdp-cyber-top b{color:#a6f542}.rdp-cyber-core{position:absolute;left:50%;top:53%;transform:translate(-50%,-50%);width:130px;height:130px;border:1px solid rgba(37,231,240,.32);border-radius:50%;display:grid;place-items:center}.rdp-cyber-core:before,.rdp-cyber-core:after{content:'';position:absolute;border:1px solid rgba(255,44,163,.45);border-radius:50%}.rdp-cyber-core:before{inset:18px}.rdp-cyber-core:after{inset:36px}.rdp-cyber-core i{position:absolute;width:6px;height:6px;background:var(--rdp-accent)}.rdp-cyber-core i:nth-child(1){top:12px}.rdp-cyber-core i:nth-child(2){right:11px}.rdp-cyber-core i:nth-child(3){bottom:12px;background:#a6f542}.rdp-cyber-core i:nth-child(4){left:11px;background:var(--rdp-second)}.rdp-cyber-data{position:absolute;bottom:12px;left:14px;font-size:6.5px;color:rgba(232,251,255,.55)}.rdp-scan-line{border-top:1px solid rgba(37,231,240,.25);font-size:6.5px;padding:6px 18px;color:var(--rdp-accent)}

.rdp-hero-neumorphism{background:#dfe4ea}.rdp-hero-neumorphism .rdp-hero-inner{padding-top:46px}.rdp-hero-neumorphism .rdp-hero-copy h1{font-weight:900;color:#4b5865}.rdp-neu-art{min-height:320px;display:grid;place-items:center;position:relative}.rdp-neu-disc{border-radius:50%;background:#e5e9ef;box-shadow:12px 13px 25px rgba(107,118,130,.22),-12px -12px 25px rgba(255,255,255,.95);display:grid;place-items:center}.rdp-neu-disc.outer{width:240px;height:240px}.rdp-neu-disc.mid{width:165px;height:165px;box-shadow:inset 8px 9px 14px rgba(107,118,130,.16),inset -8px -8px 14px rgba(255,255,255,.95)}.rdp-neu-disc.inner{width:94px;height:94px}.rdp-neu-disc.inner span{width:18px;height:18px;border-radius:50%;background:var(--rdp-accent);box-shadow:4px 4px 8px rgba(107,118,130,.24),-4px -4px 8px rgba(255,255,255,.92)}.rdp-neu-control{position:absolute;right:0;bottom:10px;padding:9px 11px;border-radius:14px;background:#e5e9ef;box-shadow:8px 8px 16px rgba(107,118,130,.18),-8px -8px 16px rgba(255,255,255,.92);font-size:7}.rdp-neu-control span{display:block;margin-bottom:7px}.rdp-neu-control i{display:inline-block;width:26px;height:5px;border-radius:999px;background:#e5e9ef;box-shadow:inset 3px 3px 5px rgba(107,118,130,.16),inset -3px -3px 5px rgba(255,255,255,.95);margin-right:5px}

.rdp-hero-bento{background:#f1f0eb}.rdp-hero-bento .rdp-hero-inner{display:block;padding-top:34px}.rdp-hero-bento .rdp-hero-copy{display:none}.rdp-bento-art{display:grid;grid-template-columns:2fr 1fr 1fr;grid-template-rows:1fr 1fr;gap:10px;min-height:330px}.rdp-bento-art .tile{border-radius:22px;padding:16px;display:flex;flex-direction:column;justify-content:space-between;min-width:0}.rdp-bento-art .big{grid-row:span 2;background:#cfe1ff}.rdp-bento-art .purple{background:#d7cdfa}.rdp-bento-art .green{background:#c6ead9}.rdp-bento-art .orange{grid-column:2 / span 2;background:#f6d6b2}.rdp-bento-art span{font-size:7px}.rdp-bento-art strong{font-size:22px;line-height:.95}

.rdp-hero-retro{background:#eeeafd}.rdp-hero-retro .rdp-hero-inner{display:block;padding-top:28px}.rdp-hero-retro .rdp-hero-copy{display:none}.rdp-retro-art{min-height:340px;display:grid;place-items:center;background-image:radial-gradient(#8d87a7 1px,transparent 1px);background-size:9px 9px}.rdp-retro-window{width:min(760px,100%);border:2px solid #1b1727;box-shadow:7px 7px 0 #1b1727;background:#fff}.rdp-retro-title{padding:7px 9px;border-bottom:2px solid #1b1727;background:linear-gradient(90deg,var(--rdp-accent),var(--rdp-second));font-size:8px;font-weight:900;display:flex;justify-content:space-between}.rdp-retro-grid{height:260px;display:grid;place-items:center}.rdp-retro-monitor{width:180px;height:160px;border:5px solid #1b1727;border-radius:14px;background:#2ad9ea;box-shadow:9px 9px 0 #1b1727;display:grid;place-items:center;text-align:center;font-size:22px;font-weight:950}.rdp-retro-monitor small{font-size:7px}

.rdp-hero-luxury{background:#ebe5d6}.rdp-hero-luxury .rdp-hero-copy h1{font:500 clamp(48px,7.4cqw,86px)/.92 Georgia,serif}.rdp-luxury-art{min-height:320px;display:flex;flex-direction:column;align-items:center;justify-content:center}.rdp-luxury-frame{width:72%;height:260px;border:1px solid var(--rdp-accent);background:#23211e;display:grid;place-items:center;color:var(--rdp-accent);letter-spacing:.12em;font:12px Georgia,serif}.rdp-luxury-art small{font:7px Georgia,serif;letter-spacing:.18em;color:var(--rdp-muted)}.rdp-luxury-rule{height:1px;width:40%;background:var(--rdp-accent);margin:11px 0}

.rdp-hero-corporate{background:#f4f6f8}.rdp-hero-corporate .rdp-hero-inner{padding-top:48px}.rdp-corporate-art{display:grid;grid-template-columns:.7fr 1.3fr;gap:10px;background:#fff;border:1px solid var(--rdp-line);padding:10px;min-height:310px}.rdp-corp-aside{background:#dce8f6;padding:14px;display:flex;flex-direction:column;justify-content:space-between}.rdp-corp-aside span{font-size:7px}.rdp-corp-aside strong{font-size:48px;color:#17385d}.rdp-corp-aside small{font-size:7px;line-height:1.45}.rdp-corp-main{display:grid;grid-template-columns:1fr 1fr;gap:10px}.rdp-corp-stat{border:1px solid var(--rdp-line);padding:14px;display:flex;flex-direction:column;justify-content:space-between}.rdp-corp-stat b{font-size:30px;color:#17385d}.rdp-corp-stat small{font-size:6px}.rdp-corp-chart{grid-column:1 / -1;border:1px solid var(--rdp-line);padding:15px;display:flex;align-items:end;gap:8px}.rdp-corp-chart i{flex:1;background:#2f6bc2;height:40%}.rdp-corp-chart i:nth-child(2){height:52%}.rdp-corp-chart i:nth-child(3){height:34%}.rdp-corp-chart i:nth-child(4){height:68%}.rdp-corp-chart i:nth-child(5){height:82%}.rdp-corp-chart i:nth-child(6){height:58%}

.rdp-hero-organic{background:#f2ebdf}.rdp-organic-art{position:relative;min-height:320px}.rdp-organic-window{position:absolute;left:0;right:15%;top:15px;bottom:20px;border-radius:34px;background:#fbf5e9;border:1px solid rgba(57,68,59,.10);padding:18px;display:flex;flex-direction:column;justify-content:space-between}.rdp-organic-window span{font-size:7px;color:var(--rdp-accent)}.rdp-organic-window strong{font-size:32px;line-height:.95}.rdp-organic-window b{color:#ba8f7b}.rdp-organic-window small{font-size:8px;color:var(--rdp-muted)}.rdp-organic-ring{position:absolute;right:0;top:32px;width:150px;height:150px;border-radius:42%;border:17px solid #a6c4c2;transform:rotate(7deg);display:grid;place-items:center}.rdp-organic-ring i{width:62px;height:62px;border-radius:48%;background:#8aa27a;display:block}.rdp-organic-ring i:nth-child(2){width:42px;height:42px;background:#d5aa95;position:absolute}

.rdp-hero-retrofuturist{background:#dfe6e6}.rdp-hero-retrofuturist .rdp-hero-inner{background:#213e50;color:#eef9ff;border-radius:22px;margin-top:16px;margin-bottom:36px;padding:48px 26px}.rdp-hero-retrofuturist .rdp-hero-copy h1{color:#fff;font-weight:900}.rdp-hero-retrofuturist .rdp-hero-copy p{color:rgba(238,249,255,.68)}.rdp-retrofuture-art{min-height:310px;position:relative;display:grid;place-items:center}.rdp-rf-orbit{position:absolute;border:1px solid rgba(255,255,255,.25);border-radius:50%}.rdp-rf-orbit.o1{width:220px;height:110px;transform:rotate(-20deg);border-color:var(--rdp-accent)}.rdp-rf-orbit.o2{width:160px;height:160px;border-color:var(--rdp-second)}.rdp-rf-orbit.o3{width:120px;height:70px;transform:rotate(23deg)}.rdp-rf-core{width:112px;height:112px;border-radius:50%;background:#f2eddc;color:#213e50;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;box-shadow:0 18px 30px -22px rgba(0,0,0,.4)}.rdp-rf-core span{font-size:5.5px;letter-spacing:.12em}.rdp-rf-core strong{font-size:18px;line-height:.9;margin-top:8px}.rdp-rf-core small{font-size:5px;margin-top:8px}

.rdp-hero-maximalist{background:#efe2ce}.rdp-hero-maximalist .rdp-hero-inner{grid-template-columns:minmax(0,1.05fr) minmax(290px,.95fr);padding-top:28px}.rdp-hero-maximalist .rdp-hero-copy h1{font-weight:950;text-transform:uppercase;font-size:clamp(46px,8.4cqw,92px)}.rdp-max-art{position:relative;min-height:340px;background:#7144bd;border:2px solid #17131c;overflow:hidden}.rdp-max-block{position:absolute;border:2px solid #17131c;font-weight:950}.rdp-max-block.b1{left:4%;top:8%;font-size:34px;line-height:.82;color:#fff;background:#7144bd;border:0;transform:rotate(-3deg)}.rdp-max-block.b2{width:68%;height:44px;background:#ff5a24;left:14%;top:37%;transform:rotate(-8deg)}.rdp-max-block.b3{width:90px;height:90px;background:#26c5cf;right:10%;top:16%;display:grid;place-items:center;transform:rotate(8deg)}.rdp-max-block.b4{left:6%;bottom:9%;background:#ef2d83;padding:8px 10px;color:#fff;transform:rotate(3deg)}.rdp-max-sticker{position:absolute;right:7%;bottom:7%;background:#ffd438;border:2px solid #17131c;padding:8px 10px;font-size:7px;transform:rotate(5deg);font-weight:950}

.rdp-stats>div{width:min(1120px,100%);margin:auto;display:grid;grid-template-columns:repeat(3,1fr)}
.rdp-stats>div>div{padding:16px 20px;min-width:0}
.rdp-stats span{display:block;font-size:7px;font-weight:900;letter-spacing:.12em;color:var(--rdp-accent)}
.rdp-stats strong{display:block;margin-top:7px;font-size:16px}
.rdp-stats small{display:block;margin-top:6px;font-size:6px;color:var(--rdp-muted)}
.rdp-stats-minimal{border-top:1px solid var(--rdp-line);border-bottom:1px solid var(--rdp-line)}
.rdp-stats-minimal>div>div+div{border-left:1px solid var(--rdp-line)}
.rdp-stats-modern>div>div{background:#fff;border:1px solid var(--rdp-line);margin:0 5px;border-radius:12px;box-shadow:0 18px 35px -30px rgba(31,57,87,.45)}
.rdp-stats-bold{background:#111;color:#111;border-block:3px solid #111}.rdp-stats-bold>div>div{border-right:3px solid #111;background:var(--rdp-accent)}.rdp-stats-bold>div>div:nth-child(2){background:var(--rdp-second)}.rdp-stats-bold>div>div:nth-child(3){background:#2868ea}
.rdp-stats-editorial{border-block:1px solid var(--rdp-line)}.rdp-stats-editorial>div>div{border-right:1px solid var(--rdp-line)}
.rdp-stats-creative>div{gap:10px;padding-block:15px}.rdp-stats-creative>div>div{background:#fff3f8;border-radius:22px}
.rdp-stats-glass{background:#101842}.rdp-stats-glass>div{gap:10px}.rdp-stats-glass>div>div{border:1px solid rgba(255,255,255,.18);border-radius:20px;background:rgba(255,255,255,.08);backdrop-filter:blur(14px);color:#fff}
.rdp-stats-clay,.rdp-stats-neumorphism{background:var(--rdp-bg)}.rdp-stats-clay>div,.rdp-stats-neumorphism>div{gap:14px}.rdp-stats-clay>div>div,.rdp-stats-neumorphism>div>div{border-radius:24px;background:#e5e9ef;box-shadow:9px 9px 18px rgba(107,118,130,.20),-9px -9px 18px rgba(255,255,255,.95)}
.rdp-stats-clay>div>div{background:#eee7e1;box-shadow:10px 10px 20px rgba(92,71,79,.18),-10px -10px 20px rgba(255,255,255,.88)}
.rdp-stats-neo{background:#f2eee3}.rdp-stats-neo>div{gap:9px}.rdp-stats-neo>div>div{border:3px solid #111;box-shadow:5px 5px 0 #111;background:var(--rdp-accent)}.rdp-stats-neo>div>div:nth-child(2){background:var(--rdp-second)}.rdp-stats-neo>div>div:nth-child(3){background:#9ddab6}
.rdp-stats-brutalism{border-bottom:1px solid #111}.rdp-stats-brutalism>div>div{border-top:1px solid #111;border-right:1px solid #111}
.rdp-stats-cyberpunk{background:#070b11}.rdp-stats-cyberpunk>div{gap:8px}.rdp-stats-cyberpunk>div>div{border:1px solid rgba(37,231,240,.38);background:#0d131c;color:#e8fbff}
.rdp-stats-neumorphism>div>div{background:#e5e9ef}.rdp-stats-bento>div{gap:10px}.rdp-stats-bento>div>div{border-radius:20px;background:#fff}
.rdp-stats-retro{background:#eeeafd}.rdp-stats-retro>div{gap:10px}.rdp-stats-retro>div>div{border:2px solid #1b1727;box-shadow:4px 4px 0 #1b1727;background:#fff}
.rdp-stats-luxury{background:#ebe5d6}.rdp-stats-luxury>div>div{border-top:1px solid var(--rdp-line);border-bottom:1px solid rgba(179,145,81,.2)}
.rdp-stats-corporate{background:#f4f6f8}.rdp-stats-corporate>div{gap:10px}.rdp-stats-corporate>div>div{background:#fff;border:1px solid var(--rdp-line)}
.rdp-stats-organic{background:#f2ebdf}.rdp-stats-organic>div{gap:10px}.rdp-stats-organic>div>div{border-radius:26px;background:#eef2e8}
.rdp-stats-retrofuturist{background:#dfe6e6}.rdp-stats-retrofuturist>div{gap:10px}.rdp-stats-retrofuturist>div>div{background:#213e50;color:#eef9ff;border-radius:18px}
.rdp-stats-maximalist{background:#efe2ce}.rdp-stats-maximalist>div{gap:9px}.rdp-stats-maximalist>div>div{border:2px solid #17131c;box-shadow:4px 4px 0 #17131c;background:#ef2d83}.rdp-stats-maximalist>div>div:nth-child(2){background:#27c5cf}.rdp-stats-maximalist>div>div:nth-child(3){background:#ffd438}

.rdp-sec{width:100%;padding:52px 24px;background:var(--rdp-bg)}
.rdp-sec>div{max-width:1120px;margin:auto}
.rdp-sec h2{margin:8px 0 14px;font-size:clamp(31px,5.2cqw,48px);line-height:.95;letter-spacing:-.045em}
.rdp-sec p{font-size:12.5px;line-height:1.65;color:var(--rdp-muted)}
.rdp-section-head span{font-size:7px;letter-spacing:.14em;color:var(--rdp-accent);font-weight:900}.rdp-section-head{max-width:720px;margin-bottom:22px}
.rdp-default-grid,.rdp-minimal-list{display:grid;gap:10px}
.rdp-default-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
.rdp-card{min-width:0;padding:15px;background:#fff;border:1px solid var(--rdp-line);border-radius:var(--rdp-radius)}
.rdp-card>span{font-size:7px;color:var(--rdp-accent);display:block}.rdp-card strong{display:block;margin-top:28px;font-size:15px}.rdp-card p{margin-top:7px;font-size:8.5px}.rdp-card small{display:block;margin-top:16px;font-size:7px}
.rdp-sec.minimal{background:#fafaf8;border-top:1px solid var(--rdp-line);padding-top:66px;padding-bottom:74px}.rdp-minimal-list>div{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:12px;padding:14px 0;border-bottom:1px solid #111;background:transparent;border-radius:0}.rdp-minimal-list strong{font-size:17px}.rdp-minimal-list span,.rdp-minimal-list small{font-size:7px}.rdp-minimal-list p{margin:5px 0 0}.rdp-minimal-list small{align-self:center}
.rdp-sec.modern{background:#f6f8fb}.rdp-modern-sec-head{display:flex;justify-content:space-between;align-items:end;gap:15px;border-bottom:1px solid var(--rdp-line);padding-bottom:12px;margin-bottom:14px}.rdp-modern-sec-head span,.rdp-modern-sec-head small{font-size:7px;color:var(--rdp-muted);letter-spacing:.12em}.rdp-modern-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.rdp-card-modern{background:#fff;box-shadow:0 18px 38px -30px rgba(17,32,57,.45)}.rdp-modern-proof{grid-column:1/-1;border:1px solid var(--rdp-line);border-radius:14px;background:#fff;padding:16px;display:grid;grid-template-columns:auto 1fr auto;gap:16px;align-items:center}.rdp-proof-num{font-size:42px;font-weight:800;letter-spacing:-.06em}.rdp-proof-bar{display:flex;align-items:end;gap:6px;height:58px}.rdp-proof-bar i{flex:1;background:#dfe6f0;height:40%;border-radius:4px 4px 0 0}.rdp-proof-bar i:nth-child(2){height:62%;background:var(--rdp-accent)}.rdp-proof-bar i:nth-child(3){height:48%}.rdp-proof-bar i:nth-child(4){height:82%}.rdp-proof-bar i:nth-child(5){height:70%}.rdp-modern-proof small{font-size:6.5px;color:var(--rdp-muted)}
.rdp-sec.bold{background:#eee9dd;border-top:3px solid #111}.rdp-sec.bold.band-1{background:#e7e0d5}.rdp-sec.bold.band-2{background:#f0eadf}.rdp-bold-head{display:flex;justify-content:space-between;align-items:end;gap:12px;margin-bottom:18px}.rdp-bold-head span,.rdp-bold-head>b{font-size:7px;font-weight:900}.rdp-bold-head h2{text-transform:uppercase;font-weight:950;font-size:clamp(42px,7.2cqw,68px);line-height:.8;margin:7px 0 0}.rdp-bold-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:12px}.rdp-bold-feature{min-height:260px;background:#111;color:#fff;border:3px solid #111;padding:18px;font-size:30px;line-height:.9;font-weight:950;text-transform:uppercase;display:flex;flex-direction:column;justify-content:end}.rdp-bold-feature small{font-size:8px;line-height:1.5;margin-top:12px;color:#ddd}.rdp-card-bold-0{background:var(--rdp-accent);border:3px solid #111;border-radius:0}.rdp-card-bold-1{background:#2868ea;color:#fff;border:3px solid #111;border-radius:0}.rdp-card-bold-2{background:var(--rdp-second);border:3px solid #111;border-radius:0}
.rdp-sec.editorial{background:#f2efe7;border-top:1px solid var(--rdp-line);padding-top:58px}.rdp-editorial-label{font-size:7px;color:var(--rdp-accent);letter-spacing:.15em;border-bottom:1px solid var(--rdp-line);padding-bottom:8px}.rdp-editorial-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:30px;padding-top:22px}.rdp-editorial-grid h2{font:500 clamp(36px,5.3cqw,56px)/.98 Georgia,serif}.dropcap:first-letter{font-size:46px;float:left;line-height:.8;padding-right:5px;color:var(--rdp-accent)}.rdp-editorial-rule{height:1px;background:var(--rdp-line);margin:22px 0}.rdp-editorial-quote{font:italic 16px/1.3 Georgia,serif;color:var(--rdp-muted)}.rdp-editorial-rows{border-top:1px solid var(--rdp-line)}.rdp-editorial-rows>div{display:grid;grid-template-columns:28px 1fr auto;gap:8px;padding:11px 0;border-bottom:1px solid var(--rdp-line)}.rdp-editorial-rows strong{font:17px Georgia,serif}.rdp-editorial-rows p{grid-column:2/-1;margin:0}
.rdp-sec.creative{background:#f3edf8;position:relative}.rdp-creative-head{display:flex;justify-content:space-between;align-items:end;margin-bottom:18px}.rdp-creative-head span{display:inline-block;background:var(--rdp-accent);color:#fff;padding:5px 8px;border-radius:9px;font-size:7px;font-weight:900;transform:rotate(-2deg)}.rdp-creative-head small{font-size:7px;color:var(--rdp-muted)}.rdp-creative-collage{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.rdp-card-creative-0{background:#f4b15f;transform:rotate(-2deg)}.rdp-card-creative-1{background:#a4dce3;transform:rotate(2deg)}.rdp-card-creative-2{background:#9ed59d;transform:rotate(-1deg)}
.rdp-sec.glass{background:#111b43;position:relative}.rdp-glass-sec-head{display:flex;align-items:end;gap:12px;color:#fff;margin-bottom:15px}.rdp-glass-sec-head span,.rdp-glass-sec-head small{font-size:7px;color:rgba(255,255,255,.5)}.rdp-glass-sec-head h2{margin:0}.rdp-glass-sec-head small{margin-left:auto}.rdp-glass-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.rdp-card-glass-0,.rdp-card-glass-1,.rdp-card-glass-2{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);backdrop-filter:blur(17px);color:#fff;border-radius:22px;box-shadow:0 25px 55px -42px rgba(0,0,0,.8)}
.rdp-card-glass-0 strong,.rdp-card-glass-1 strong,.rdp-card-glass-2 strong{color:#fff}
.rdp-sec.clay{background:#e9e1dc}.rdp-clay-heading{padding:20px 22px;border-radius:34px;background:#eee7e1;box-shadow:12px 13px 24px rgba(92,71,79,.18),-12px -12px 24px rgba(255,255,255,.9);margin-bottom:16px}.rdp-clay-heading span{font-size:7px;color:var(--rdp-accent);font-weight:900}.rdp-clay-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.rdp-card-clay-0,.rdp-card-clay-1,.rdp-card-clay-2{border:0;border-radius:34px;background:#eee7e1;box-shadow:10px 11px 20px rgba(92,71,79,.16),-10px -10px 20px rgba(255,255,255,.9)}.rdp-card-clay-0{background:#eca486}.rdp-card-clay-1{background:#b8a9df}.rdp-card-clay-2{background:#9bcdb9}
.rdp-sec.neo{background:#f2eee3}.rdp-neo-head{border:3px solid #111;box-shadow:6px 6px 0 #111;background:#fff8df;padding:16px;margin-bottom:18px}.rdp-neo-head span{font-size:7px;font-weight:900}.rdp-neo-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.rdp-card-neo-0,.rdp-card-neo-1,.rdp-card-neo-2{border:3px solid #111;border-radius:0;box-shadow:6px 6px 0 #111}.rdp-card-neo-0{background:#f0d638}.rdp-card-neo-1{background:#ef4ba4}.rdp-card-neo-2{background:#9ddab6}
.rdp-sec.brutalism{background:#ece9df;border-top:1px solid #111}.rdp-sec.brutalism>div{display:grid;grid-template-columns:150px 1fr;gap:22px}.rdp-brutal-label{font-size:8px;font-weight:900;letter-spacing:.12em}.rdp-brutal-list{border-top:1px solid #111}.rdp-brutal-list>div{display:grid;grid-template-columns:34px 1fr auto;gap:12px;padding:15px 0;border-bottom:1px solid #111}.rdp-brutal-list strong{font-size:18px;text-transform:uppercase}.rdp-brutal-list p{margin:5px 0 0}.rdp-brutal-list b{font-size:6.5px}
.rdp-sec.cyberpunk{background:#070b11;color:#e8fbff;background-image:linear-gradient(rgba(37,231,240,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(37,231,240,.035) 1px,transparent 1px);background-size:18px 18px}.rdp-cyber-sec-top{display:flex;justify-content:space-between;padding-bottom:10px;border-bottom:1px solid rgba(37,231,240,.25)}.rdp-cyber-sec-top span{color:var(--rdp-accent);font-size:7px}.rdp-cyber-sec-top b{font-size:7px;color:rgba(232,251,255,.55)}.rdp-cyber-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:12px}.cyber-cell{min-height:135px;border:1px solid rgba(37,231,240,.35);background:#0d131c;padding:13px}.cyber-cell span{font-size:6.5px;color:var(--rdp-accent)}.cyber-cell strong{display:block;font-size:14px;margin-top:24px}.cyber-cell p{color:rgba(232,251,255,.56)}.cyber-cell small{font-size:6.5px;color:var(--rdp-second)}.cyber-cell.wide{grid-column:1/-1;min-height:150px}.rdp-cyber-bars{height:86px;display:flex;align-items:end;gap:8px;margin-top:8px}.rdp-cyber-bars i{flex:1;background:linear-gradient(180deg,var(--rdp-second),var(--rdp-accent));height:50%}
.rdp-sec.neumorphism{background:#dfe4ea}.rdp-neu-heading{padding:20px;border-radius:28px;background:#e5e9ef;box-shadow:10px 11px 22px rgba(107,118,130,.22),-10px -10px 22px rgba(255,255,255,.95);margin-bottom:15px}.rdp-neu-heading span{font-size:7px;color:var(--rdp-accent)}.rdp-neu-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.rdp-card-neu-0,.rdp-card-neu-1,.rdp-card-neu-2{border:0;border-radius:28px;background:#e5e9ef;box-shadow:9px 10px 19px rgba(107,118,130,.20),-9px -9px 19px rgba(255,255,255,.95)}.rdp-card-neu-0:before,.rdp-card-neu-1:before,.rdp-card-neu-2:before{content:'';display:block;width:38px;height:38px;border-radius:50%;background:#e5e9ef;box-shadow:inset 6px 6px 11px rgba(107,118,130,.16),inset -6px -6px 11px rgba(255,255,255,.95);margin-bottom:12px}
.rdp-sec.bento{background:#f1f0eb}.rdp-bento-grid-sec{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:minmax(110px,auto);gap:10px}.rdp-bento-grid-sec>div{border-radius:22px;padding:15px;min-width:0}.bento-large{grid-column:span 2;grid-row:span 2;background:#cfe1ff}.bento-small.lilac{background:#d7cdfa}.bento-small.mint{background:#c6ead9}.bento-wide{grid-column:span 2;background:#f6d6b2}.bento-small.pink{background:#f4c1ce}.rdp-bento-grid-sec span{font-size:6.5px}.rdp-bento-grid-sec strong{display:block;font-size:24px;margin-top:20px}.bento-wide>div{display:grid;gap:7px;margin-top:12px}.bento-wide>div>div{display:flex;justify-content:space-between;gap:10px;font-size:8px}.bento-wide small{color:#6d6d6d}
.rdp-sec.retro{background:#eeeafd}.retro-window{border:2px solid #1b1727;box-shadow:6px 6px 0 #1b1727;background:#fff}.retro-title{padding:7px 9px;border-bottom:2px solid #1b1727;background:linear-gradient(90deg,var(--rdp-accent),var(--rdp-second));font-size:8px;font-weight:900;display:flex;justify-content:space-between}.retro-body{padding:15px}.retro-body h2{margin-bottom:15px}.rdp-retro-grid-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.rdp-retro-grid-cards>div{border:2px solid #1b1727;box-shadow:4px 4px 0 #1b1727;padding:12px;background:#fff}.rdp-retro-grid-cards>div:nth-child(2){background:#f4d9ef}.rdp-retro-grid-cards>div:nth-child(3){background:#c9f7fb}.rdp-retro-grid-cards span,.rdp-retro-grid-cards small{font-size:6.5px}.rdp-retro-grid-cards strong{display:block;margin-top:22px;font-size:14px}
.rdp-sec.luxury{background:#ebe5d6;padding-top:58px;padding-bottom:60px}.rdp-sec.luxury.lux-dark{background:#23211e;color:#f7f1e5}.rdp-lux-grid{display:grid;grid-template-columns:1fr 1fr;gap:30px;align-items:start}.rdp-lux-grid>div:first-child>span{font-size:7px;color:var(--rdp-accent);letter-spacing:.18em}.rdp-lux-grid>div:first-child h2{font:500 44px/.97 Georgia,serif}.rdp-lux-grid>div:first-child p{font:13px/1.82 Georgia,serif}.rdp-lux-list{border-top:1px solid rgba(179,145,81,.55)}.rdp-lux-list>div{display:grid;grid-template-columns:28px 1fr auto;gap:10px;padding:13px 0;border-bottom:1px solid rgba(179,145,81,.34)}.rdp-lux-list strong{font:18px Georgia,serif}.rdp-lux-list small{grid-column:2/-1}.rdp-lux-list span{font-size:6.5px;color:var(--rdp-accent)}
.rdp-sec.corporate{background:#f4f6f8}.rdp-corp-head{display:grid;grid-template-columns:1fr auto;gap:7px;align-items:end;border-bottom:1px solid var(--rdp-line);padding-bottom:10px}.rdp-corp-head span,.rdp-corp-head small{font-size:6.5px;color:var(--rdp-muted);letter-spacing:.12em}.rdp-corp-head h2{margin:0;grid-column:1/-1}.rdp-corp-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}.rdp-corp-tiles>div{background:#fff;border:1px solid var(--rdp-line);padding:14px;min-height:145px}.rdp-corp-tiles>div:nth-child(2),.rdp-corp-tiles>div:nth-child(5){background:#dfeaf8}.rdp-corp-tiles span{font-size:6.5px;color:var(--rdp-accent)}.rdp-corp-tiles strong{display:block;margin-top:23px;font-size:14px}.rdp-corp-tiles p{font-size:8px}
.rdp-sec.organic{background:#f2ebdf}.rdp-org-head{max-width:700px}.rdp-org-head span{font-size:7px;color:var(--rdp-accent)}.rdp-org-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:20px}.org-card{min-height:175px;border-radius:30px;padding:15px;background:#eef2e8;display:flex;flex-direction:column;justify-content:space-between}.org-card.o1{background:#e4d4ca}.org-card.o2{background:#aacbc9}.org-card span,.org-card b{font-size:6.5px}.org-card strong{font-size:17px}.org-card small{font-size:8px;line-height:1.5;color:var(--rdp-muted)}
.rdp-sec.retrofuturist{background:#dfe6e6}.rdp-rf-head{display:flex;align-items:end;gap:12px}.rdp-rf-head span,.rdp-rf-head small{font-size:6.5px}.rdp-rf-head h2{margin:0}.rdp-rf-head small{margin-left:auto}.rdp-rf-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px;position:relative}.rf-card{padding:14px;border:1px solid rgba(33,62,80,.25);border-radius:18px;background:#f5f1df;min-height:135px;display:flex;flex-direction:column;justify-content:space-between}.rf-card.rf1{background:#2cb3b3;color:#fff}.rf-card.rf2{background:#f07840;color:#fff}.rf-card.rf3{background:#213e50;color:#fff}.rf-card strong{font-size:16px}.rf-card span{font-size:6.5px}.rf-card small{font-size:7px}.rf-horizon{position:absolute;left:0;right:0;height:1px;bottom:15px;background:linear-gradient(90deg,transparent,var(--rdp-accent),transparent)}
.rdp-sec.maximalist{background:#efe2ce}.rdp-max-head{display:flex;justify-content:space-between;align-items:end;gap:12px}.rdp-max-head span,.rdp-max-head>b{font-size:7px;font-weight:900}.rdp-max-head h2{text-transform:uppercase;font-size:46px;line-height:.82;margin:8px 0}.rdp-max-grid{position:relative;display:grid;grid-template-columns:1.2fr .8fr .9fr;grid-template-rows:150px 160px;gap:9px;margin-top:16px}.max-card{border:2px solid #17131c;box-shadow:4px 4px 0 #17131c;padding:13px;display:flex;flex-direction:column;justify-content:space-between;min-width:0}.max-card.m0{background:#ef2d83;color:#fff;transform:rotate(-1deg)}.max-card.m1{background:#27c5cf;transform:rotate(2deg)}.max-card.m2{background:#ffd438;transform:rotate(-2deg)}.max-card span,.max-card small,.max-card b{font-size:6.5px}.max-card strong{font-size:22px;line-height:.9;text-transform:uppercase}.max-card.m0{grid-row:span 2}.max-ribbon{grid-column:2/-1;align-self:center;background:#17131c;color:#fff;padding:8px;font-size:7px;font-weight:900;transform:rotate(-2deg)}

.rdp-final{padding:48px 24px 58px;background:var(--rdp-bg)}.rdp-final>div{max-width:1120px;margin:auto;padding:22px}.rdp-final span{font-size:7px;color:var(--rdp-accent);font-weight:900;letter-spacing:.13em}.rdp-final h2{font-size:clamp(34px,5.6cqw,60px);line-height:.92;margin:10px 0 13px}.rdp-final p{font-size:12px;line-height:1.6;color:var(--rdp-muted);max-width:640px}.rdp-final.minimal,.rdp-final.modern{background:#fafaf8}.rdp-final.minimal>div{border-top:1px solid #111;border-bottom:1px solid #111}.rdp-final.modern>div{background:#172033;color:#fff;border-radius:14px}.rdp-final.modern p{color:rgba(255,255,255,.64)}.rdp-final.bold,.rdp-final.neo{background:#111;color:#fff}.rdp-final.bold>div,.rdp-final.neo>div{border:3px solid #111;background:#111}.rdp-final.editorial,.rdp-final.luxury{background:#f2efe7}.rdp-final.editorial>div,.rdp-final.luxury>div{border-top:1px solid var(--rdp-line);border-bottom:1px solid var(--rdp-line)}.rdp-final.glass{background:#101842;position:relative}.rdp-final.glass>div{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);backdrop-filter:blur(17px);border-radius:24px;color:#fff}.rdp-final.glass p{color:rgba(255,255,255,.64)}.rdp-final.cyberpunk{background:#070b11;color:#fff}.rdp-final.cyberpunk>div{border:1px solid rgba(37,231,240,.40);background:#0d131c}.rdp-final.retrofuturist{background:#dfe6e6}.rdp-final.retrofuturist>div{background:#213e50;color:#fff;border-radius:20px}.rdp-final.retrofuturist p{color:rgba(238,249,255,.65)}.rdp-final.clay,.rdp-final.neumorphism{background:var(--rdp-bg)}.rdp-final.clay>div,.rdp-final.neumorphism>div{background:#eee7e1;border-radius:34px;box-shadow:12px 13px 24px rgba(92,71,79,.18),-12px -12px 24px rgba(255,255,255,.9)}.rdp-final.neumorphism>div{background:#e5e9ef;box-shadow:10px 11px 22px rgba(107,118,130,.22),-10px -10px 22px rgba(255,255,255,.95)}.rdp-final.neo>div{box-shadow:7px 7px 0 #111}.rdp-final.brutalism{background:#ece9df}.rdp-final.brutalism>div{border-top:1px solid #111;border-bottom:1px solid #111}.rdp-final.bento{background:#f1f0eb}.rdp-final.bento>div{background:#cfe1ff;border-radius:22px}.rdp-final.retro{background:#eeeafd}.rdp-final.retro>div{border:2px solid #1b1727;box-shadow:5px 5px 0 #1b1727;background:#fff}.rdp-final.corporate>div{background:#17385d;color:#fff;border-radius:7px}.rdp-final.corporate p{color:rgba(255,255,255,.67)}.rdp-final.organic>div{background:#eef2e8;border-radius:34px}.rdp-final.maximalist{background:#efe2ce}.rdp-final.maximalist>div{background:#ffd438;border:2px solid #17131c;box-shadow:6px 6px 0 #17131c}

.rdp-footer{padding:42px 24px 66px;background:#171717;color:#fff}.rdp-footer>div{max-width:1120px;margin:auto;display:flex;justify-content:space-between;gap:20px;align-items:end}.rdp-footer strong{font-size:11px}.rdp-footer p{margin:6px 0 0;font-size:7px;color:rgba(255,255,255,.55)}.rdp-footer nav{display:flex;gap:14px}.rdp-footer nav span{font-size:7px;color:rgba(255,255,255,.5)}.rdp-footer.minimal{background:#fafaf8;color:#171717;border-top:1px solid var(--rdp-line)}.rdp-footer.minimal p,.rdp-footer.minimal nav span{color:var(--rdp-muted)}.rdp-footer.modern{background:#171c28}.rdp-footer.bold{background:#111}.rdp-footer.editorial{background:#121212}.rdp-footer.creative{background:#272033}.rdp-footer.glass{background:#0d1738}.rdp-footer.clay{background:#36312e}.rdp-footer.neo{background:#111;color:#fff}.rdp-footer.brutalism{background:#efede4;color:#111;border-top:1px solid #111}.rdp-footer.brutalism p,.rdp-footer.brutalism nav span{color:var(--rdp-muted)}.rdp-footer.cyberpunk{background:#05080d;border-top:1px solid rgba(37,231,240,.25)}.rdp-footer.neumorphism{background:#dfe4ea;color:#4b5865}.rdp-footer.neumorphism p,.rdp-footer.neumorphism nav span{color:var(--rdp-muted)}.rdp-footer.bento{background:#1d1c24}.rdp-footer.retro{background:#1b1727}.rdp-footer.luxury{background:#23211e}.rdp-footer.corporate{background:#17385d}.rdp-footer.organic{background:#657d57}.rdp-footer.retrofuturist{background:#213e50}.rdp-footer.maximalist{background:#24162d}

.rdp-browser{display:flex;align-items:center;gap:7px;padding:8px 10px;background:#121318;color:#fff;border-bottom:1px solid rgba(255,255,255,.08)}
.rdp-browser i{width:7px;height:7px;border-radius:50%;display:block}.rdp-browser i:nth-child(1){background:#ff605c}.rdp-browser i:nth-child(2){background:#ffbd44}.rdp-browser i:nth-child(3){background:#00ca4e}.rdp-browser div{flex:1;min-width:0;margin-left:4px;background:#090a0c;color:rgba(255,255,255,.48);border-radius:5px;padding:5px 8px;font-size:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rdp-browser span{font-size:7px;color:rgba(255,255,255,.38)}


/* Theme selection is an independent layer: style keeps its personality while the chosen theme changes the canvas, navigation, readable surfaces and section rhythm. */
.rdp-page[class*="rdp-theme-"] .rdp-nav,
.rdp-page[class*="rdp-theme-"] .rdp-hero,
.rdp-page[class*="rdp-theme-"] .rdp-stats,
.rdp-page[class*="rdp-theme-"] .rdp-sec,
.rdp-page[class*="rdp-theme-"] .rdp-final,
.rdp-page[class*="rdp-theme-"] .rdp-footer{
  background-color:var(--rdp-theme-bg);
  color:var(--rdp-theme-ink);
}
.rdp-page[class*="rdp-theme-"] .rdp-nav,
.rdp-page[class*="rdp-theme-"] .rdp-hero-copy,
.rdp-page[class*="rdp-theme-"] .rdp-section-head,
.rdp-page[class*="rdp-theme-"] .rdp-sec,
.rdp-page[class*="rdp-theme-"] .rdp-final,
.rdp-page[class*="rdp-theme-"] .rdp-footer{color:var(--rdp-theme-ink)}
.rdp-page[class*="rdp-theme-"] h1,
.rdp-page[class*="rdp-theme-"] h2,
.rdp-page[class*="rdp-theme-"] h3,
.rdp-page[class*="rdp-theme-"] h4,
.rdp-page[class*="rdp-theme-"] h5,
.rdp-page[class*="rdp-theme-"] h6,
.rdp-page[class*="rdp-theme-"] strong,
.rdp-page[class*="rdp-theme-"] b{color:var(--rdp-theme-heading)}
.rdp-page[class*="rdp-theme-"] p,
.rdp-page[class*="rdp-theme-"] li,
.rdp-page[class*="rdp-theme-"] dd,
.rdp-page[class*="rdp-theme-"] dt{color:var(--rdp-theme-body)}
.rdp-page[class*="rdp-theme-"] .rdp-nav span,
.rdp-page[class*="rdp-theme-"] .rdp-nav small,
.rdp-page[class*="rdp-theme-"] .rdp-nav p,
.rdp-page[class*="rdp-theme-"] .rdp-sec p,
.rdp-page[class*="rdp-theme-"] .rdp-final p,
.rdp-page[class*="rdp-theme-"] .rdp-footer p,
.rdp-page[class*="rdp-theme-"] .rdp-footer nav span{color:var(--rdp-theme-muted)}
.rdp-page[class*="rdp-theme-"] a{color:var(--rdp-theme-link)}
.rdp-page[class*="rdp-theme-"] .rdp-nav,
.rdp-page[class*="rdp-theme-"] .rdp-stats>div>div,
.rdp-page[class*="rdp-theme-"] .rdp-card,
.rdp-page[class*="rdp-theme-"] .rdp-final>div{border-color:var(--rdp-theme-line)}
.rdp-page[class*="rdp-theme-"] .rdp-card{background:var(--rdp-theme-surface);color:var(--rdp-theme-ink)}
.rdp-page[class*="rdp-theme-"] .rdp-stats>div>div{background:var(--rdp-theme-surface);color:var(--rdp-theme-ink)}
.rdp-page[class*="rdp-theme-"] .rdp-modern-window,
.rdp-page[class*="rdp-theme-"] .rdp-modern-chip{background:var(--rdp-theme-surface);color:var(--rdp-theme-ink)}
.rdp-page[class*="rdp-theme-"] .rdp-page-placeholder{background:var(--rdp-theme-surface)}
.rdp-page[class*="rdp-theme-dark"] .rdp-page,
.rdp-page[class*="rdp-theme-midnight"] .rdp-page{color-scheme:dark}
.rdp-page[class*="rdp-theme-light"],
.rdp-page[class*="rdp-theme-neutral"],
.rdp-page[class*="rdp-theme-warm"]{color-scheme:light}

.rdp-page{background:var(--rdp-theme-bg);color:var(--rdp-theme-ink)}
.rdp-page .rdp-content,.rdp-page .rdp-hero,.rdp-page .rdp-sec,.rdp-page .rdp-stats,.rdp-page .rdp-final{color:var(--rdp-theme-ink)}
.rdp-theme-light .rdp-card,.rdp-theme-neutral .rdp-card,.rdp-theme-warm .rdp-card{background:var(--rdp-theme-surface);color:var(--rdp-theme-ink)}
.rdp-theme-dark .rdp-card,.rdp-theme-midnight .rdp-card{background:var(--rdp-theme-surface);color:var(--rdp-theme-ink);border-color:var(--rdp-theme-line)}
.rdp-theme-light .rdp-nav.minimal,.rdp-theme-neutral .rdp-nav.minimal,.rdp-theme-warm .rdp-nav.minimal,
.rdp-theme-dark .rdp-nav.minimal,.rdp-theme-midnight .rdp-nav.minimal{background:var(--rdp-theme-bg);color:var(--rdp-theme-ink)}
.rdp-theme-light .rdp-hero-minimal,.rdp-theme-neutral .rdp-hero-minimal,.rdp-theme-warm .rdp-hero-minimal,
.rdp-theme-dark .rdp-hero-minimal,.rdp-theme-midnight .rdp-hero-minimal{background:var(--rdp-theme-bg)}
.rdp-theme-light .rdp-sec.minimal,.rdp-theme-neutral .rdp-sec.minimal,.rdp-theme-warm .rdp-sec.minimal,
.rdp-theme-dark .rdp-sec.minimal,.rdp-theme-midnight .rdp-sec.minimal{background:var(--rdp-theme-bg)}
.rdp-theme-light .rdp-final.minimal,.rdp-theme-neutral .rdp-final.minimal,.rdp-theme-warm .rdp-final.minimal,
.rdp-theme-dark .rdp-final.minimal,.rdp-theme-midnight .rdp-final.minimal{background:var(--rdp-theme-bg)}
.rdp-theme-light .rdp-hero-modern,.rdp-theme-neutral .rdp-hero-modern,.rdp-theme-warm .rdp-hero-modern,
.rdp-theme-dark .rdp-hero-modern,.rdp-theme-midnight .rdp-hero-modern{background:var(--rdp-theme-bg)}
.rdp-theme-light .rdp-modern-window,.rdp-theme-light .rdp-modern-chip,.rdp-theme-dark .rdp-modern-window,.rdp-theme-dark .rdp-modern-chip,
.rdp-theme-midnight .rdp-modern-window,.rdp-theme-midnight .rdp-modern-chip,.rdp-theme-neutral .rdp-modern-window,.rdp-theme-neutral .rdp-modern-chip,
.rdp-theme-warm .rdp-modern-window,.rdp-theme-warm .rdp-modern-chip{background:var(--rdp-theme-surface);color:var(--rdp-theme-ink);border-color:var(--rdp-theme-line)}
.rdp-theme-light .rdp-sec.modern,.rdp-theme-neutral .rdp-sec.modern,.rdp-theme-warm .rdp-sec.modern,.rdp-theme-dark .rdp-sec.modern,.rdp-theme-midnight .rdp-sec.modern{background:var(--rdp-theme-bg)}
.rdp-theme-light .rdp-modern-proof,.rdp-theme-neutral .rdp-modern-proof,.rdp-theme-warm .rdp-modern-proof,.rdp-theme-dark .rdp-modern-proof,.rdp-theme-midnight .rdp-modern-proof{background:var(--rdp-theme-surface);color:var(--rdp-theme-ink);border-color:var(--rdp-theme-line)}
.rdp-theme-light .rdp-hero-editorial,.rdp-theme-neutral .rdp-hero-editorial,.rdp-theme-warm .rdp-hero-editorial,.rdp-theme-dark .rdp-hero-editorial,.rdp-theme-midnight .rdp-hero-editorial{background:var(--rdp-theme-bg)}
.rdp-theme-light .rdp-sec.editorial,.rdp-theme-neutral .rdp-sec.editorial,.rdp-theme-warm .rdp-sec.editorial,.rdp-theme-dark .rdp-sec.editorial,.rdp-theme-midnight .rdp-sec.editorial{background:var(--rdp-theme-bg)}
.rdp-theme-light .rdp-hero-creative,.rdp-theme-neutral .rdp-hero-creative,.rdp-theme-warm .rdp-hero-creative,.rdp-theme-dark .rdp-hero-creative,.rdp-theme-midnight .rdp-hero-creative{background:var(--rdp-theme-bg)}
.rdp-theme-light .rdp-sec.creative,.rdp-theme-neutral .rdp-sec.creative,.rdp-theme-warm .rdp-sec.creative,.rdp-theme-dark .rdp-sec.creative,.rdp-theme-midnight .rdp-sec.creative{background:var(--rdp-theme-bg)}
.rdp-theme-light .rdp-hero-bold,.rdp-theme-neutral .rdp-hero-bold,.rdp-theme-warm .rdp-hero-bold{background:var(--rdp-theme-bg)}
.rdp-theme-light .rdp-sec.bold,.rdp-theme-neutral .rdp-sec.bold,.rdp-theme-warm .rdp-sec.bold{background:var(--rdp-theme-bg)}
.rdp-theme-light .rdp-hero-brutalism,.rdp-theme-neutral .rdp-hero-brutalism,.rdp-theme-warm .rdp-hero-brutalism,
.rdp-theme-light .rdp-sec.brutalism,.rdp-theme-neutral .rdp-sec.brutalism,.rdp-theme-warm .rdp-sec.brutalism{background:var(--rdp-theme-bg)}
.rdp-theme-light .rdp-hero-neo,.rdp-theme-neutral .rdp-hero-neo,.rdp-theme-warm .rdp-hero-neo,
.rdp-theme-light .rdp-sec.neo,.rdp-theme-neutral .rdp-sec.neo,.rdp-theme-warm .rdp-sec.neo{background:var(--rdp-theme-bg)}
.rdp-theme-light .rdp-hero-glass,.rdp-theme-light .rdp-sec.glass{background:var(--rdp-theme-bg)}
.rdp-theme-light .rdp-hero-glass,.rdp-theme-neutral .rdp-hero-glass,.rdp-theme-warm .rdp-hero-glass{background:linear-gradient(145deg,var(--rdp-theme-bg),#cfd8ff)}
.rdp-theme-dark .rdp-hero-glass,.rdp-theme-midnight .rdp-hero-glass{background:linear-gradient(145deg,var(--rdp-theme-bg),#111a53)}
.rdp-theme-light .rdp-sec.glass,.rdp-theme-neutral .rdp-sec.glass,.rdp-theme-warm .rdp-sec.glass{background:linear-gradient(145deg,var(--rdp-theme-bg),#d7ddff)}
.rdp-theme-dark .rdp-sec.glass,.rdp-theme-midnight .rdp-sec.glass{background:linear-gradient(145deg,var(--rdp-theme-bg),#141d50)}
.rdp-theme-light .rdp-page .rdp-glass-panel,.rdp-theme-neutral .rdp-page .rdp-glass-panel,.rdp-theme-warm .rdp-page .rdp-glass-panel{background:rgba(255,255,255,.22);color:#162038}
.rdp-theme-dark .rdp-page .rdp-glass-panel,.rdp-theme-midnight .rdp-page .rdp-glass-panel{background:rgba(255,255,255,.10);color:#fff}
.rdp-theme-light .rdp-sec.clay,.rdp-theme-neutral .rdp-sec.clay,.rdp-theme-warm .rdp-sec.clay,.rdp-theme-light .rdp-hero-clay,.rdp-theme-neutral .rdp-hero-clay,.rdp-theme-warm .rdp-hero-clay{background:var(--rdp-theme-bg)}
.rdp-theme-dark .rdp-sec.clay,.rdp-theme-midnight .rdp-sec.clay,.rdp-theme-dark .rdp-hero-clay,.rdp-theme-midnight .rdp-hero-clay{background:var(--rdp-theme-bg)}
.rdp-theme-light .rdp-hero-neumorphism,.rdp-theme-neutral .rdp-hero-neumorphism,.rdp-theme-warm .rdp-hero-neumorphism,.rdp-theme-light .rdp-sec.neumorphism,.rdp-theme-neutral .rdp-sec.neumorphism,.rdp-theme-warm .rdp-sec.neumorphism{background:var(--rdp-theme-bg)}
.rdp-theme-dark .rdp-hero-neumorphism,.rdp-theme-midnight .rdp-hero-neumorphism,.rdp-theme-dark .rdp-sec.neumorphism,.rdp-theme-midnight .rdp-sec.neumorphism{background:var(--rdp-theme-bg)}
.rdp-theme-light .rdp-hero-bento,.rdp-theme-neutral .rdp-hero-bento,.rdp-theme-warm .rdp-hero-bento,.rdp-theme-light .rdp-sec.bento,.rdp-theme-neutral .rdp-sec.bento,.rdp-theme-warm .rdp-sec.bento{background:var(--rdp-theme-bg)}
.rdp-theme-light .rdp-hero-retro,.rdp-theme-neutral .rdp-hero-retro,.rdp-theme-warm .rdp-hero-retro,.rdp-theme-light .rdp-sec.retro,.rdp-theme-neutral .rdp-sec.retro,.rdp-theme-warm .rdp-sec.retro{background:var(--rdp-theme-bg)}
.rdp-theme-light .rdp-hero-luxury,.rdp-theme-neutral .rdp-hero-luxury,.rdp-theme-warm .rdp-hero-luxury,.rdp-theme-light .rdp-sec.luxury,.rdp-theme-neutral .rdp-sec.luxury,.rdp-theme-warm .rdp-sec.luxury{background:var(--rdp-theme-bg)}
.rdp-theme-light .rdp-hero-corporate,.rdp-theme-neutral .rdp-hero-corporate,.rdp-theme-warm .rdp-hero-corporate,.rdp-theme-light .rdp-sec.corporate,.rdp-theme-neutral .rdp-sec.corporate,.rdp-theme-warm .rdp-sec.corporate{background:var(--rdp-theme-bg)}
.rdp-theme-light .rdp-hero-organic,.rdp-theme-neutral .rdp-hero-organic,.rdp-theme-warm .rdp-hero-organic,.rdp-theme-light .rdp-sec.organic,.rdp-theme-neutral .rdp-sec.organic,.rdp-theme-warm .rdp-sec.organic{background:var(--rdp-theme-bg)}
.rdp-theme-light .rdp-hero-retrofuturist,.rdp-theme-neutral .rdp-hero-retrofuturist,.rdp-theme-warm .rdp-hero-retrofuturist,.rdp-theme-light .rdp-sec.retrofuturist,.rdp-theme-neutral .rdp-sec.retrofuturist,.rdp-theme-warm .rdp-sec.retrofuturist{background:var(--rdp-theme-bg)}
.rdp-theme-light .rdp-hero-maximalist,.rdp-theme-neutral .rdp-hero-maximalist,.rdp-theme-warm .rdp-hero-maximalist,.rdp-theme-light .rdp-sec.maximalist,.rdp-theme-neutral .rdp-sec.maximalist,.rdp-theme-warm .rdp-sec.maximalist{background:var(--rdp-theme-bg)}
.rdp-theme-auto{color-scheme:dark light}
@media (prefers-color-scheme:light){.rdp-theme-auto{--rdp-theme-bg:#f8f8f6!important;--rdp-theme-ink:#141414!important;--rdp-theme-heading:#0a0a0a!important;--rdp-theme-body:#242424!important;--rdp-theme-muted:rgba(20,20,20,.58)!important;--rdp-theme-link:#2458c6!important;--rdp-theme-surface:#fff!important;--rdp-theme-line:rgba(20,20,20,.12)!important}}
@media (prefers-color-scheme:dark){.rdp-theme-auto{--rdp-theme-bg:#0b0b0d!important;--rdp-theme-ink:#f7f8fb!important;--rdp-theme-heading:#fff!important;--rdp-theme-body:#f2f4f7!important;--rdp-theme-muted:rgba(247,248,251,.62)!important;--rdp-theme-link:#8de9ff!important;--rdp-theme-surface:rgba(255,255,255,.075)!important;--rdp-theme-line:rgba(255,255,255,.15)!important}}

.rdp-device-stage{min-height:0;flex:1;display:flex;flex-direction:column;overflow:hidden}.rdp-device-stage.rdp-device-mobile{align-items:center;justify-content:center;padding:0;background:radial-gradient(circle at 50% 8%,rgba(255,255,255,.09),transparent 52%)}.rdp-mobile-device-shell{position:relative;flex:0 0 auto;width:auto;height:calc(100% - 2px);max-height:calc(100% - 2px);max-width:calc(100% - 18px);aspect-ratio:9 / 18.7;min-height:0;padding:6px;border-radius:34px;background:linear-gradient(145deg,#3b3f48 0%,#1d2027 26%,#101217 68%,#090b0e 100%);border:1px solid rgba(255,255,255,.22);box-shadow:0 28px 62px -30px rgba(0,0,0,.96),inset 0 1px 0 rgba(255,255,255,.13),inset -1px -1px 0 rgba(0,0,0,.74);display:flex;flex-direction:column;overflow:visible}.rdp-mobile-device-shell::before{content:"";position:absolute;left:-3px;top:82px;width:3px;height:36px;border-radius:3px 0 0 3px;background:linear-gradient(#51555f,#1a1c22);box-shadow:0 48px 0 #1a1c22,0 63px 0 #1a1c22}.rdp-mobile-device-shell::after{content:"";position:absolute;right:-3px;top:112px;width:3px;height:60px;border-radius:0 3px 3px 0;background:linear-gradient(#51555f,#1a1c22)}.rdp-mobile-screen{min-height:0;flex:1;display:flex;flex-direction:column;overflow:hidden;border-radius:28px;background:#0d0e11;border:1px solid rgba(255,255,255,.10);box-shadow:inset 0 0 0 1px rgba(255,255,255,.03)}.rdp-device-stage.rdp-device-mobile .rdp-device-scroll{width:100%;min-width:0;flex:1;min-height:0;height:auto;max-height:none;overflow-y:auto;overflow-x:hidden;border:0;border-radius:0;background:#111;box-shadow:none;scrollbar-width:none;-ms-overflow-style:none}.rdp-device-stage.rdp-device-mobile .rdp-device-scroll::-webkit-scrollbar{width:0;height:0;display:none}.rdp-device-stage.rdp-device-mobile .rdp-page{width:100%;max-width:none;transform-origin:top center}.rdp-mobile-chrome{position:relative;flex:0 0 auto;background:#16181d;color:#fff;padding:16px 11px 8px;border:0;box-shadow:none}.rdp-mobile-notch{position:absolute;left:50%;top:5px;transform:translateX(-50%);width:58px;height:10px;border-radius:999px;background:#050506;box-shadow:inset 0 -1px 0 rgba(255,255,255,.06)}.rdp-mobile-status{display:flex;justify-content:space-between;align-items:center;font-size:6px;padding-bottom:6px;opacity:.78}.rdp-mobile-url{border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.055);border-radius:999px;padding:5px 8px;font-size:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rdp-mobile-chrome small{display:block;margin-top:5px;font-size:5px;letter-spacing:.12em;text-transform:uppercase;opacity:.35}.rdp-mobile-home{flex:0 0 auto;height:18px;display:grid;place-items:center;background:#111;color:rgba(255,255,255,.42)}.rdp-mobile-home span{display:block;width:58px;height:3px;border-radius:999px;background:currentColor}.rdp-device-stage.rdp-device-desktop .rdp-device-scroll{min-width:0;scrollbar-width:none;-ms-overflow-style:none}.rdp-device-stage.rdp-device-desktop .rdp-device-scroll::-webkit-scrollbar{width:0;height:0;display:none}.rdp-device-stage.rdp-device-desktop .rdp-page{width:100%;min-width:0}.rdp-device-stage.rdp-device-desktop .rdp-browser{flex:0 0 auto}.

@container (max-width:760px){
  .rdp-hero-inner{grid-template-columns:1fr;gap:22px;padding-inline:18px}
  .rdp-hero-copy h1{font-size:clamp(38px,10.6cqw,64px)}
  .rdp-hero-art{min-height:260px}
  .rdp-nav>div,.rdp-nav.minimal>div,.rdp-nav.neo>div,.rdp-nav.brutalism>div,.rdp-nav.cyberpunk>div,.rdp-nav.neumorphism>div,.rdp-nav.bento>div,.rdp-nav.luxury>div,.rdp-nav.corporate>div,.rdp-nav.organic>div,.rdp-nav.retrofuturist>div,.rdp-nav.maximalist>div{flex-wrap:wrap}
  .rdp-nav nav{order:3;width:100%;min-width:0;justify-content:flex-start;overflow:auto;overflow-y:hidden;padding-top:3px;scrollbar-width:none;-ms-overflow-style:none}.rdp-nav nav::-webkit-scrollbar{width:0;height:0;display:none}
  .rdp-nav.modern,.rdp-nav.corporate{padding-inline:14px}
  .rdp-nav.modern nav,.rdp-nav.corporate nav{margin:0}
  .rdp-stats>div{grid-template-columns:1fr}
  .rdp-stats>div>div{border:0!important;border-top:1px solid var(--rdp-line);margin:0!important}
  .rdp-modern-grid,.rdp-default-grid,.rdp-creative-collage,.rdp-glass-grid,.rdp-clay-grid,.rdp-neo-grid,.rdp-corp-tiles,.rdp-org-grid,.rdp-retro-grid-cards,.rdp-bento-grid-sec,.rdp-rf-grid,.rdp-neu-grid{grid-template-columns:1fr}
  .rdp-bold-grid,.rdp-editorial-grid,.rdp-lux-grid{grid-template-columns:1fr}
  .rdp-sec{padding-inline:18px}
  .rdp-sec.brutalism>div{grid-template-columns:1fr}
  .rdp-modern-proof{grid-template-columns:1fr}
  .rdp-bento-grid-sec>div{grid-column:auto!important;grid-row:auto!important}
  .rdp-hero-retro .rdp-hero-copy,.rdp-hero-bento .rdp-hero-copy{display:block}
  .rdp-hero-retro .rdp-hero-inner,.rdp-hero-bento .rdp-hero-inner{display:grid}
  .rdp-hero-retro .rdp-hero-art{min-height:300px}
}
@container (max-width:460px){
  .rdp-content{padding-inline:16px}
  .rdp-hero-inner{padding:34px 16px 42px;gap:16px}
  .rdp-hero-copy h1{font-size:clamp(26px,12cqw,42px);line-height:.96;letter-spacing:-.045em;margin-bottom:12px}
  .rdp-hero-copy p{font-size:9px;line-height:1.55;margin-bottom:14px}
  .rdp-eyebrow{font-size:5.5px;letter-spacing:.11em;margin-bottom:8px}
  .rdp-hero-actions{gap:6px}
  .rdp-sec{padding:34px 16px 42px}
  .rdp-sec h2{font-size:clamp(20px,8cqw,30px)!important;line-height:1.02}
  .rdp-sec p{font-size:8px;line-height:1.5}
  .rdp-section-head span,.rdp-modern-sec-head span,.rdp-modern-sec-head small,.rdp-sec small,.rdp-sec b{font-size:5.5px}
  .rdp-stats>div{padding:0 16px}
  .rdp-stats>div>div{padding:14px 0}
  .rdp-stats strong{font-size:10px}
  .rdp-stats span,.rdp-stats small{font-size:5px}
  .rdp-card{padding:12px!important;border-radius:calc(var(--rdp-radius) * .7)}
  .rdp-card strong{font-size:10px}
  .rdp-card p{font-size:7px}
  .rdp-nav{padding-left:12px!important;padding-right:12px!important}
  .rdp-nav strong,.rdp-nav .retro-title{font-size:8px}
  .rdp-nav nav{gap:10px;padding-top:2px}
  .rdp-nav span,.rdp-nav b,.rdp-nav small{font-size:5.5px}
  .rdp-nav .rdp-nav-action,.rdp-nav .glass-chip,.rdp-nav .clay-chip,.rdp-nav .neu-chip{font-size:5.5px!important;padding:4px 6px}
  .rdp-hero-art{min-height:180px}
  .rdp-hero-art > *{max-width:100%}
  .rdp-final{padding-inline:16px}
  .rdp-final>div{padding:16px}
  .rdp-final h2{font-size:clamp(22px,9cqw,32px)!important}
  .rdp-footer>div{padding:18px 16px;flex-direction:column;align-items:flex-start}
  .rdp-footer p,.rdp-footer nav span{font-size:7px}
}
@container (max-width:240px){
  .rdp-hero-inner{padding:24px 10px 30px;gap:12px}
  .rdp-hero-copy h1{font-size:clamp(21px,12cqw,28px);line-height:1.0}
  .rdp-hero-copy p{font-size:7px;line-height:1.45}
  .rdp-eyebrow{font-size:4.5px}
  .rdp-hero-actions{gap:4px}
  .rdp-sec{padding:24px 10px 30px}
  .rdp-sec h2{font-size:clamp(18px,9cqw,24px)!important}
  .rdp-sec p{font-size:6.5px}
  .rdp-card{padding:9px!important}
  .rdp-card strong{font-size:8px}
  .rdp-card p{font-size:6px}
  .rdp-stats>div{padding:0 10px}
  .rdp-stats strong{font-size:8px}
  .rdp-nav{padding:8px 8px!important}
  .rdp-nav>div{gap:8px!important}
  .rdp-nav nav{gap:7px}
  .rdp-nav span,.rdp-nav b,.rdp-nav small{font-size:4.5px}
  .rdp-hero-art{min-height:140px}
  .rdp-final{padding-inline:10px}
  .rdp-final h2{font-size:clamp(20px,10cqw,26px)!important}
}
/* Phone preview: render a true narrow responsive layout instead of a scaled desktop poster. */
@container (max-width:240px){
  .rdp-page{font-size:7px}
  .rdp-content{padding-inline:10px!important}
  .rdp-hero-inner{grid-template-columns:1fr!important;padding:24px 10px 30px!important;gap:12px!important}
  .rdp-hero-copy{min-width:0}
  .rdp-hero-copy h1{font-size:clamp(21px,12cqw,28px)!important;max-width:100%;overflow-wrap:anywhere}
  .rdp-hero-copy p{font-size:7px!important;max-width:none}
  .rdp-hero-actions>*{min-height:24px!important;padding:6px 8px!important;font-size:5.5px!important}
  .rdp-hero-art{min-height:140px!important;width:100%;min-width:0}
  .rdp-hero-art>*{width:100%!important;min-width:0!important;max-width:100%!important;min-height:0!important}
  .rdp-stats>div{grid-template-columns:1fr!important;padding:0 10px!important}
  .rdp-stats>div>div{min-width:0!important;padding:12px 0!important}
  .rdp-stats strong{font-size:8px!important}
  .rdp-nav>div{width:100%!important;min-width:0!important;gap:7px!important}
  .rdp-nav nav{min-width:0!important;overflow-x:auto!important;scrollbar-width:none!important;gap:7px!important}
  .rdp-nav nav::-webkit-scrollbar{display:none}
  .rdp-nav span,.rdp-nav b,.rdp-nav small{font-size:4.5px!important;white-space:nowrap}
  .rdp-sec{padding:24px 10px 30px!important}
  .rdp-sec>div{min-width:0!important}
  .rdp-card{min-width:0!important;width:100%!important;padding:9px!important;overflow-wrap:anywhere}
  .rdp-card strong{font-size:8px!important}
  .rdp-card p{font-size:6px!important}
  .rdp-modern-grid,.rdp-default-grid,.rdp-creative-collage,.rdp-glass-grid,.rdp-clay-grid,.rdp-neo-grid,.rdp-corp-tiles,.rdp-org-grid,.rdp-retro-grid-cards,.rdp-bento-grid-sec,.rdp-rf-grid,.rdp-neu-grid,.rdp-bold-grid,.rdp-editorial-grid,.rdp-lux-grid{grid-template-columns:1fr!important}
  .rdp-final{padding-inline:10px!important}
  .rdp-final>div{padding:14px!important;min-width:0!important}
  .rdp-final h2{font-size:clamp(20px,10cqw,26px)!important}
  .rdp-footer>div{padding:18px 10px!important;gap:10px!important}
}
`;

export default function ReferenceDrivenLivePreview({
  design,
  palette,
  paletteName,
  typo,
  websiteType = 'portfolio',
  captureRef,
  viewportMode = 'desktop',
}) {
  const styleLabel = DESIGN_STYLES.find((s) => s.id === design?.style)?.label || 'Modern';
  const websiteLabel = TYPE_LABEL[websiteType] || 'SITE';
  const accent = design?.primaryColor || palette?.[0] || '#3167ef';
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--s-line)]"
      style={{ background:'#0a0a0c' }}
    >
      <style>{css}</style>
      <div className={`rdp-device-stage rdp-device-${viewportMode}`}>
        {viewportMode === 'mobile' ? (
          <div className="rdp-mobile-device-shell">
            <div className="rdp-mobile-screen">
              <BrowserChrome styleLabel={styleLabel} websiteLabel={websiteLabel} accent={accent} viewportMode={viewportMode}/>
              <div
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain rdp-device-scroll"
                style={{ scrollbarWidth:'none', scrollbarColor:'transparent transparent' }}
              >
                <div
                  ref={captureRef}
                  style={{ minHeight:2600 }}
                  data-preview-style={design?.style}
                  data-preview-theme={design?.theme}
                  data-preview-motion={design?.animations}
                  data-preview-palette={paletteName}
                  data-preview-website={websiteType}
                >
                  <Page design={design || {}} palette={palette} typo={typo} websiteType={websiteType}/>
                </div>
              </div>
              <div className="rdp-mobile-home" aria-hidden="true"><span /></div>
            </div>
          </div>
        ) : (
          <>
            <BrowserChrome styleLabel={styleLabel} websiteLabel={websiteLabel} accent={accent} viewportMode={viewportMode}/>
            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain rdp-device-scroll"
              style={{ scrollbarWidth:'thin', scrollbarColor:`${alpha(accent,.78)} transparent` }}
            >
              <div
                ref={captureRef}
                style={{ minHeight:2600 }}
                data-preview-style={design?.style}
                data-preview-theme={design?.theme}
                data-preview-motion={design?.animations}
                data-preview-palette={paletteName}
                data-preview-website={websiteType}
              >
                <Page design={design || {}} palette={palette} typo={typo} websiteType={websiteType}/>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
