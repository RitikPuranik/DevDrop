'use strict';
/**
 * Shared design system, built deterministically from the Design Agent's output so every page starts from the same tokens.
 * The agent chooses the look; this module guarantees valid values (hex colours, readable contrast, safe font stacks) and
 * writes them as CSS custom properties that every generated component is told to use.
 */
const { parseHex, contrast, FONT_ALLOWLIST } = require('../design/designSpec');

const FALLBACK = {
  light: { background: '#ffffff', surface: '#f6f7f9', primary: '#2563eb', secondary: '#7c3aed', text: '#0f172a', muted: '#475569' },
  dark: { background: '#0b0f19', surface: '#141a29', primary: '#60a5fa', secondary: '#a78bfa', text: '#f1f5f9', muted: '#94a3b8' },
};
const isDarkTheme = (theme) => /dark|night|black|midnight/i.test(String(theme || ''));
const hex = (v) => (typeof v === 'string' && parseHex(v.trim()) ? v.trim() : null);

function readableOn(bg, wanted, min = 4.5) {
  const c = hex(wanted) && contrast(wanted, bg);
  if (c && c >= min) return wanted;
  return (contrast('#ffffff', bg) || 0) >= (contrast('#0f172a', bg) || 0) ? '#ffffff' : '#0f172a';
}

const RADIUS = { sharp: ['0px', '2px', '4px', '6px'], soft: ['4px', '8px', '12px', '20px'], round: ['8px', '16px', '24px', '999px'] };
const radiusKind = (value) => {
  const t = String(typeof value === 'object' ? JSON.stringify(value) : value || '').toLowerCase();
  if (/sharp|square|none|0px|brutal/.test(t)) return 'sharp';
  if (/round|pill|full|rounded-full|circle/.test(t)) return 'round';
  return 'soft';
};

function fontFamily(name, fallbackStack) {
  const first = String(name || '').split(',')[0].replace(/["']/g, '').trim();
  const allowed = FONT_ALLOWLIST.find((f) => f.toLowerCase() === first.toLowerCase());
  return allowed ? { family: allowed, css: `'${allowed}', ${fallbackStack}`, remote: true } : { family: first || null, css: fallbackStack, remote: false };
}

const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

/** @returns {{tokens:object, tokensCss:string, baseCss:string, notes:string[]}} */
function buildDesignAssets(design = {}) {
  const ds = design.designSystem || {};
  const notes = [];
  const dark = isDarkTheme(ds.theme);
  const fb = dark ? FALLBACK.dark : FALLBACK.light;
  const c = ds.colors && typeof ds.colors === 'object' ? ds.colors : {};
  const colors = {};
  for (const key of Object.keys(fb)) {
    colors[key] = hex(c[key]) || fb[key];
    if (!hex(c[key])) notes.push(`colour "${key}" was missing or not a hex value; used a neutral default`);
  }
  const text = readableOn(colors.background, colors.text);
  if (text !== colors.text) notes.push('text colour had too little contrast on the background and was adjusted');
  colors.text = text;
  const muted = readableOn(colors.background, colors.muted, 3.2);
  if (muted !== colors.muted) notes.push('muted text colour was adjusted for contrast');
  colors.muted = muted;
  const onPrimary = readableOn(colors.primary, '#ffffff');
  const onSecondary = readableOn(colors.secondary, '#ffffff');
  const border = dark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)';
  const r = RADIUS[radiusKind(ds.borderRadius)];

  const typo = ds.typography && typeof ds.typography === 'object' ? ds.typography : {};
  const heading = fontFamily(typo.heading, /serif|playfair|fraunces|cormorant|dm serif/i.test(String(typo.heading)) ? SERIF : SANS);
  const body = fontFamily(typo.body, SANS);
  const remoteFamilies = [...new Set([heading, body].filter((f) => f.remote).map((f) => f.family))];
  const imports = remoteFamilies.length
    ? `@import url('https://fonts.googleapis.com/css2?${remoteFamilies.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;500;600;700`).join('&')}&display=swap');\n\n`
    : '';

  const tokens = { colors: { ...colors, onPrimary, onSecondary, border }, radius: r, fonts: { heading: heading.css, body: body.css }, theme: dark ? 'dark' : 'light' };
  const tokensCss = `${imports}/* DevDrop design tokens: generated from the website's design system. Use these variables everywhere. */
:root {
  --color-bg: ${colors.background};
  --color-surface: ${colors.surface};
  --color-primary: ${colors.primary};
  --color-on-primary: ${onPrimary};
  --color-secondary: ${colors.secondary};
  --color-on-secondary: ${onSecondary};
  --color-text: ${colors.text};
  --color-muted: ${colors.muted};
  --color-border: ${border};

  --font-heading: ${heading.css};
  --font-body: ${body.css};

  --radius-sm: ${r[0]};
  --radius-md: ${r[1]};
  --radius-lg: ${r[2]};
  --radius-xl: ${r[3]};

  --space-1: 0.25rem; --space-2: 0.5rem; --space-3: 0.75rem; --space-4: 1rem; --space-5: 1.5rem;
  --space-6: 2rem; --space-7: 3rem; --space-8: 4rem; --space-9: 6rem;

  --container-sm: 40rem; --container-md: 56rem; --container-lg: 72rem; --container-xl: 80rem;
  --gutter: clamp(1rem, 4vw, 2rem);

  --shadow-sm: 0 1px 2px rgba(0,0,0,${dark ? '0.5' : '0.08'});
  --shadow-md: 0 8px 24px rgba(0,0,0,${dark ? '0.45' : '0.12'});
  --shadow-lg: 0 20px 48px rgba(0,0,0,${dark ? '0.55' : '0.16'});

  --bp-sm: 640px; --bp-md: 768px; --bp-lg: 1024px; --bp-xl: 1280px;
  color-scheme: ${dark ? 'dark' : 'light'};
}
`;
  const baseCss = `/* Base layout rules shared by every page. */
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
body { margin: 0; background: var(--color-bg); color: var(--color-text); font-family: var(--font-body); line-height: 1.6; -webkit-font-smoothing: antialiased; }
h1, h2, h3, h4, h5, h6 { font-family: var(--font-heading); line-height: 1.15; margin: 0 0 var(--space-4); color: var(--color-text); }
h1 { font-size: clamp(2rem, 5vw + 1rem, 3.75rem); }
h2 { font-size: clamp(1.5rem, 3vw + 0.75rem, 2.5rem); }
h3 { font-size: clamp(1.2rem, 1.5vw + 0.8rem, 1.6rem); }
p { margin: 0 0 var(--space-4); }
a { color: var(--color-primary); text-underline-offset: 3px; }
img, video, svg { max-width: 100%; height: auto; }
button, input, select, textarea { font: inherit; color: inherit; }
:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 3px; }
.container { width: 100%; max-width: var(--container-lg); margin-inline: auto; padding-inline: var(--gutter); }
.section { padding-block: clamp(var(--space-7), 8vw, var(--space-9)); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } }
`;
  return { tokens, tokensCss, baseCss, notes };
}

/** A compact description of the tokens for agent prompts (never the CSS itself). */
function tokenBrief(tokens) {
  return {
    cssVariables: ['--color-bg', '--color-surface', '--color-primary', '--color-on-primary', '--color-secondary', '--color-on-secondary', '--color-text', '--color-muted', '--color-border', '--font-heading', '--font-body', '--radius-sm|md|lg|xl', '--space-1..9', '--container-sm|md|lg|xl', '--gutter', '--shadow-sm|md|lg'],
    utilityClasses: ['.container', '.section', '.sr-only'],
    values: { colors: tokens.colors, radius: tokens.radius, fonts: tokens.fonts, theme: tokens.theme },
    rule: 'Style with these CSS variables (inline style, CSS files or Tailwind arbitrary values). Never hard-code colours or fonts that are in this list.',
  };
}

module.exports = { buildDesignAssets, tokenBrief, readableOn };
