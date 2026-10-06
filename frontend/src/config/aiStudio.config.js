import { BriefcaseBusiness, ShoppingBag, Newspaper, LayoutTemplate, Coffee, Hotel, Clapperboard } from 'lucide-react';

export const WEBSITE_TYPES = [
  {
    id: 'portfolio',
    title: 'Portfolio',
    description: 'Personal portfolio for developers, designers, creators, students and professionals.',
    icon: BriefcaseBusiness,
    enabled: true,
  },
  {
    id: 'ecommerce',
    title: 'E-commerce',
    description: 'Product catalog, shopping experience, cart and conversion-focused storefront.',
    icon: ShoppingBag,
    enabled: true,
  },
  {
    id: 'blog',
    title: 'Blog / Magazine',
    description: 'Editorial website for articles, stories, news and long-form content.',
    icon: Newspaper,
    enabled: true,
  },
  {
    id: 'landing',
    title: 'Landing Page',
    description: 'Focused marketing page for a product, service, startup or campaign.',
    icon: LayoutTemplate,
    enabled: true,
  },
  {
    id: 'cafe',
    title: 'Cafe / Restaurant',
    description: 'Menu, ambience, reservations, location and ordering for cafes, restaurants and food brands.',
    icon: Coffee,
    enabled: true,
  },
  {
    id: 'hotel',
    title: 'Hotel / Stay',
    description: 'Rooms, amenities, gallery, booking enquiries and local highlights for hotels, resorts and homestays.',
    icon: Hotel,
    enabled: true,
  },
  {
    id: 'studio',
    title: 'Freelancing Studio',
    description: 'Services, packages, case studies and client inquiry flow for freelancers, agencies and creative studios.',
    icon: Clapperboard,
    enabled: true,
  },
];

export const DESIGN_STYLES = [
  { id: 'minimal', label: 'Minimal', typo: 'neo', direction: 'Restrained, lots of whitespace, hairline dividers, small calm type, one accent, no decoration. Content-first with a centered, quiet hero.' },
  { id: 'modern', label: 'Modern', typo: 'grotesk', direction: 'Clean split hero, rounded cards with soft shadows, subtle gradients and glows, confident sans-serif type, polished SaaS feel.' },
  { id: 'bold', label: 'Bold', typo: 'condensed', direction: 'Poster-like. Oversized uppercase headlines, heavy weights, flat color blocks and slabs, high contrast, a marquee strip, zero decoration.' },
  { id: 'editorial', label: 'Editorial', typo: 'serif', direction: 'Magazine layout: masthead with rules, large serif headlines, multi-column text, captions, thin dividers and generous reading rhythm.' },
  { id: 'creative', label: 'Creative', typo: 'geometric', direction: 'Playful and expressive: organic color blobs, tilted cards, gradient text, asymmetric composition, vivid multi-color accents.' },
  { id: 'glass', label: 'Glassmorphism', typo: 'contemporary', direction: 'Frosted translucent panels with backdrop blur layered over soft vibrant gradients; use blur to show depth hierarchy and keep text contrast accessible (Apple "liquid glass" inspired).' },
  { id: 'brutalist', label: 'Neo-Brutalist', typo: 'mono', direction: 'Thick solid borders, zero-blur hard offset shadows, flat saturated fills, raw grid, uppercase mono type, pressed-button hover states (collapse the shadow on hover).' },
  { id: 'bento', label: 'Bento Grid', typo: 'contemporary', direction: 'Modular grid of differently sized self-contained tiles (feature, stat, visual, CTA), consistent gaps and radius, each tile communicating one idea.' },
  { id: 'retro', label: 'Retro / Y2K', typo: 'mono', direction: 'Dial-up/Y2K nostalgia: OS-window chrome with title bars, chunky chrome-gradient buttons, pastel gradients, pixel-grid backgrounds, stickers and monospace type.' },
  { id: 'luxury', label: 'Luxury', typo: 'serif', direction: 'Elegant and understated: wide letter-spaced serif caps, thin gold hairlines, ornamental dividers, dark rich surfaces, slow refined motion, generous space.' },
  { id: 'corporate', label: 'Corporate', typo: 'humanist', direction: 'Trust-driven and professional: structured grid, restrained radius, data/dashboard visuals, trust badges, clear information hierarchy and strong CTAs.' },
  { id: 'organic', label: 'Organic / Soft', typo: 'rounded', direction: 'Warm, human and calm: soft blob shapes, very large radius, earthy tones, pill buttons, gentle gradients, friendly rounded type.' },
];

export const DESIGN_THEMES = [
  { id: 'dark', label: 'Dark', direction: 'Near-black background (#0b0b0d), light text, subtle translucent surfaces; maintain WCAG AA contrast.' },
  { id: 'light', label: 'Light', direction: 'Off-white background (#f8f8f6), near-black text, white surfaces with soft borders.' },
  { id: 'neutral', label: 'Neutral', direction: 'Mid-grey/stone background, calm low-saturation surfaces, dark text.' },
  { id: 'midnight', label: 'Midnight', direction: 'Deep navy background (#0a1228) with cool blue-tinted surfaces and pale blue-white text.' },
  { id: 'warm', label: 'Warm Cream', direction: 'Warm cream/sand background (#f3ead9, "Cloud Dancer"-like comfort), dark brown text, earthy surfaces.' },
  { id: 'auto', label: 'Auto (Light + Dark)', direction: 'Implement both light and dark themes using CSS variables and prefers-color-scheme, with a visible theme toggle; default to dark.' },
];

export const ANIMATION_OPTIONS = [
  { id: 'none', label: 'None', hint: 'Static', direction: 'No animation at all.' },
  { id: 'subtle', label: 'Subtle', hint: 'Soft fades', direction: 'Gentle fades and small hover transitions only.' },
  { id: 'scroll', label: 'Scroll Reveal', hint: 'On-scroll entrances', direction: 'Sections and cards reveal with staggered fade/slide-up as they enter the viewport (IntersectionObserver or framer-motion whileInView).' },
  { id: 'interactive', label: 'Interactive', hint: 'Hover & click', direction: 'Rich hover, press and focus micro-interactions on cards, buttons and links; magnetic or tilt effects where tasteful.' },
  { id: 'parallax', label: 'Parallax', hint: 'Depth layers', direction: 'Layered parallax depth on hero and background elements while scrolling; keep it lightweight (transform only).' },
  { id: 'kinetic', label: 'Kinetic Type', hint: 'Moving headlines', direction: 'Animated typography: staggered word/letter reveals and expressive headline motion on key headings only.' },
  { id: 'dynamic', label: 'Dynamic', hint: 'Always alive', direction: 'Rich continuous motion: floating elements, animated gradients, marquee and looping accents, with performance in mind.' },
];

export const DESIGN_PALETTES = [
  { id: 'amber', name: 'Default Amber & Sand', colors: ['#b8935a', '#e8d9bf', '#b4583a', '#2f3436', '#f1f1f1'] },
  { id: 'ocean', name: 'Deep Ocean', colors: ['#3b82f6', '#14507a', '#4b4fb8', '#8b8ee8'] },
  { id: 'violet', name: 'Cyberpunk Violet', colors: ['#c026d3', '#a21caf', '#5b3fb5', '#e9d5ff'] },
  { id: 'emerald', name: 'Emerald Forest', colors: ['#22c55e', '#15803d', '#3f7d20', '#bbf7d0'] },
  { id: 'earth', name: 'Earth & Terracotta', colors: ['#c2693e', '#7d8a4b', '#e9dcc3', '#4a3b2f'] },
  { id: 'plum', name: 'Deep Plum & Khaki', colors: ['#8e3b6e', '#c4b48a', '#3d1f3a', '#efe6d2'] },
  { id: 'mono', name: 'Monochrome', colors: ['#8a8a8a', '#d4d4d4', '#525252', '#171717'] },
  { id: 'sunset', name: 'Sunset Glow', colors: ['#f97316', '#ec4899', '#facc15', '#7c3aed'] },
  { id: 'rose', name: 'Rose & Blush', colors: ['#e11d74', '#f9a8c9', '#fde4ec', '#5b1a33'] },
  { id: 'cloud', name: 'Cloud Dancer & Slate', colors: ['#64748b', '#f0eee9', '#94a3b8', '#0f172a'] },
  { id: 'neon', name: 'Neon Cyber', colors: ['#22d3ee', '#a3e635', '#f0abfc', '#0f172a'] },
  { id: 'crimson', name: 'Crimson & Gold', colors: ['#dc2626', '#f59e0b', '#7f1d1d', '#fde68a'] },
];

export const DESIGN_TYPOGRAPHY = [
  { id: 'grotesk', label: 'Grotesk Sans', font: "'Space Grotesk','Inter',system-ui,sans-serif", direction: 'Characterful grotesk sans (Space Grotesk / Familjen Grotesk style) for headings and body.' },
  { id: 'serif', label: 'Editorial Serif', font: "Georgia,'Times New Roman',serif", direction: 'Expressive display serif headings (Playfair Display / DM Serif Display style) paired with a neutral sans body (Inter / Lato).' },
  { id: 'contemporary', label: 'Contemporary', font: "'Inter','Segoe UI',system-ui,sans-serif", direction: 'Clean variable sans (Inter style) across the site with strong weight contrast.' },
  { id: 'neo', label: 'Neo-Grotesk', font: "'Helvetica Neue',Helvetica,Arial,sans-serif", direction: 'Refined neo-grotesque (Helvetica / Inter Tight / Geist style): neutral, confident, tight tracking on headings.' },
  { id: 'geometric', label: 'Geometric Sans', font: "'Poppins','Montserrat','Century Gothic',sans-serif", direction: 'Geometric sans (Poppins / Montserrat style) with round letterforms and bold headings.' },
  { id: 'humanist', label: 'Humanist Sans', font: "'Segoe UI','Gill Sans',Optima,sans-serif", direction: 'Warm humanist sans (Source Sans / Open Sans style) optimized for trust and readability.' },
  { id: 'mono', label: 'Mono Tech', font: "ui-monospace,'JetBrains Mono','SF Mono',Consolas,monospace", direction: 'Monospace display type (JetBrains Mono / Space Mono style) for headings and labels, readable sans for long text.' },
  { id: 'rounded', label: 'Rounded Friendly', font: "'Nunito','Quicksand',ui-rounded,'Trebuchet MS',sans-serif", direction: 'Soft rounded sans (Nunito / Quicksand style) for a friendly, approachable tone.' },
  { id: 'condensed', label: 'Condensed Impact', font: "Impact,'Oswald','Arial Narrow',sans-serif", direction: 'Heavy condensed display headings (Oswald / Anton / Bebas Neue style) with a plain sans body.' },
];

export function describeDesign(design = {}) {
  const pick = (list, id, fallback) => list.find((item) => item.id === id) || fallback;
  const style = pick(DESIGN_STYLES, design.style, DESIGN_STYLES[1]);
  const theme = pick(DESIGN_THEMES, design.theme, DESIGN_THEMES[0]);
  const motion = pick(ANIMATION_OPTIONS, design.animations, ANIMATION_OPTIONS[1]);
  const palette = pick(DESIGN_PALETTES, design.paletteId, null);
  const typo = pick(DESIGN_TYPOGRAPHY, design.typography, DESIGN_TYPOGRAPHY[0]);
  return [
    `Style: ${style.label} — ${style.direction}`,
    `Theme: ${theme.label} — ${theme.direction}`,
    `Animation: ${motion.label} — ${motion.direction}`,
    `Primary color: ${design.primaryColor || 'Choose a tasteful accent that fits the theme.'}`,
    `Color palette${palette ? ` (${palette.name})` : ''}: ${design.palette || (palette ? palette.colors.join(', ') : 'AI-selected palette')}`,
    `Typography: ${typo.label} — ${typo.direction}`,
    'Apply this direction consistently to layout composition, spacing, borders, shadows, imagery and component styling — not only colors. Always honor prefers-reduced-motion.',
  ].join('\n');
}
