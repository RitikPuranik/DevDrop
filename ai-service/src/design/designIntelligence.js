'use strict';
// DevDrop Design Intelligence: deterministic translation of (website type, user requirements, design preferences,
// media plan) into a validated designSpec. No model calls. The Design Agent then fills in the visual detail
// *inside* this specification, and every downstream agent receives it as part of `design`.
const spec = require('./designSpec');

const THEMES = {
  dark: { background: '#0b0b0d', surface: '#15151a', text: '#f2f4f7' },
  light: { background: '#f8f8f6', surface: '#ffffff', text: '#242424' },
  neutral: { background: '#d9d9d6', surface: '#e8e8e5', text: '#1d1d1d' },
  midnight: { background: '#0a1228', surface: '#111b38', text: '#e6edff' },
  warm: { background: '#f3ead9', surface: '#fbf5e9', text: '#3a2b20' },
};
const DEFAULT_THEME_BY_STYLE = { luxury: 'dark', cyberpunk: 'dark', retrofuturist: 'midnight', glass: 'midnight', editorial: 'warm', organic: 'warm', clay: 'warm', corporate: 'light', minimal: 'light' };

const TYPE_STACKS = {
  grotesk: { heading: 'Space Grotesk', body: 'Inter', fallback: 'sans-serif' },
  serif: { heading: 'Playfair Display', body: 'Inter', fallback: 'serif', bodyFallback: 'sans-serif' },
  contemporary: { heading: 'Inter', body: 'Inter', fallback: 'sans-serif' },
  neo: { heading: 'Inter', body: 'Inter', fallback: 'sans-serif' },
  geometric: { heading: 'Poppins', body: 'Montserrat', fallback: 'sans-serif' },
  humanist: { heading: 'Source Sans 3', body: 'Open Sans', fallback: 'sans-serif' },
  mono: { heading: 'JetBrains Mono', body: 'Inter', fallback: 'monospace', bodyFallback: 'sans-serif' },
  rounded: { heading: 'Nunito', body: 'Quicksand', fallback: 'sans-serif' },
  condensed: { heading: 'Oswald', body: 'Inter', fallback: 'sans-serif', bodyFallback: 'sans-serif' },
};
const STYLE_TRAITS = {
  minimal: { density: 'spacious', radius: 'sharp', motion: 'subtle' }, modern: { density: 'balanced', radius: 'soft', motion: 'moderate' },
  bold: { density: 'balanced', radius: 'sharp', motion: 'moderate' }, editorial: { density: 'spacious', radius: 'sharp', motion: 'subtle' },
  creative: { density: 'balanced', radius: 'round', motion: 'moderate' }, glass: { density: 'balanced', radius: 'round', motion: 'moderate' },
  clay: { density: 'balanced', radius: 'round', motion: 'moderate' }, brutalist: { density: 'balanced', radius: 'sharp', motion: 'subtle' },
  brutalism: { density: 'balanced', radius: 'sharp', motion: 'subtle' }, cyberpunk: { density: 'compact', radius: 'sharp', motion: 'moderate' },
  neumorphism: { density: 'balanced', radius: 'round', motion: 'subtle' }, bento: { density: 'balanced', radius: 'soft', motion: 'subtle' },
  retro: { density: 'balanced', radius: 'soft', motion: 'moderate' }, luxury: { density: 'spacious', radius: 'sharp', motion: 'subtle' },
  corporate: { density: 'balanced', radius: 'soft', motion: 'subtle' }, organic: { density: 'spacious', radius: 'round', motion: 'moderate' },
  retrofuturist: { density: 'balanced', radius: 'soft', motion: 'moderate' }, maximalist: { density: 'compact', radius: 'soft', motion: 'expressive' },
};
const MOTION_BY_PREF = { none: 'none', subtle: 'subtle', scroll: 'moderate', interactive: 'moderate', parallax: 'expressive', kinetic: 'expressive', dynamic: 'expressive' };
const DEFAULT_STYLE = { portfolio: 'minimal', ecommerce: 'modern', blog: 'editorial', landing: 'modern', saas: 'modern', cafe: 'organic', hotel: 'luxury', studio: 'bold', event: 'bold', education: 'corporate', custom: 'modern' };

const S = (id, component, variant, purpose) => ({ id, component, variant, purpose });
const NAV = S('nav', 'navigation', 'inline-with-cta', 'Wayfinding and one primary action');
const FOOT = S('footer', 'footer', 'minimal-links', 'Contact details and secondary links');

// Several structurally different compositions per site purpose; one is chosen deterministically per project.
const ARCHETYPES = {
  portfolio: { category: 'personal-brand', variants: [
    { id: 'project-index', composition: 'project-led', structure: [NAV, S('hero', 'hero', 'statement-type', 'Who this is and what they do, in one line'), S('work', 'project-index', 'asymmetric-grid', 'Selected projects with role and outcome'), S('about', 'about', 'portrait-and-story', 'Background and approach'), S('contact', 'contact-form', 'inline-minimal', 'Primary contact route'), FOOT], interactions: ['project hover reveals role and year', 'keyboard-focusable project cards'] },
    { id: 'case-study-stack', composition: 'image-led', structure: [NAV, S('hero', 'hero', 'full-bleed-media', 'Lead with the strongest work'), S('work', 'project-detail', 'stacked-case-studies', 'Each project as a short narrative'), S('about', 'about', 'two-column-text', 'Background'), S('contact', 'cta', 'large-type-email', 'Direct contact'), FOOT], interactions: ['scroll-linked project progress', 'smooth anchor navigation'] },
  ] },
  ecommerce: { category: 'retail', variants: [
    { id: 'shop-first', composition: 'product-led', structure: [NAV, S('hero', 'hero', 'product-grid-first', 'Featured products above the fold'), S('filters', 'filters', 'sidebar-or-chips', 'Category, price and sort that really filter'), S('products', 'product-grid', 'uniform-cards', 'Browse products'), S('detail', 'product-detail', 'panel-or-page', 'Product detail with add to cart'), S('cart', 'cart', 'drawer', 'Quantities and totals'), FOOT], interactions: ['filter and sort update the grid', 'cart drawer with live totals', 'empty cart state'] },
    { id: 'collection-story', composition: 'image-led', structure: [NAV, S('hero', 'hero', 'collection-banner', 'Current collection'), S('products', 'product-grid', 'editorial-mixed-size', 'Products with lifestyle imagery'), S('filters', 'filters', 'top-bar', 'Category and sort'), S('cart', 'cart', 'slide-over', 'Review and totals'), FOOT], interactions: ['quick-add from cards', 'live cart totals'] },
  ] },
  blog: { category: 'publishing', variants: [
    { id: 'magazine-front', composition: 'content-led', structure: [NAV, S('hero', 'hero', 'editorial-masthead', 'Lead story and publication identity'), S('feed', 'article-feed', 'lead-plus-columns', 'Latest articles'), S('cats', 'categories', 'inline-tabs', 'Topic discovery'), S('news', 'newsletter', 'quiet-inline', 'Optional subscription'), FOOT], interactions: ['category filter on in-file articles', 'reading-time labels'] },
    { id: 'reading-list', composition: 'type-led', structure: [NAV, S('hero', 'hero', 'statement-type', 'What the publication covers'), S('list', 'article-list', 'ruled-list', 'Chronological articles'), S('cats', 'categories', 'sidebar', 'Topics'), FOOT], interactions: ['article preview on focus and hover'] },
  ] },
  landing: { category: 'software-or-product', variants: [
    { id: 'product-demo', composition: 'content-led', structure: [NAV, S('hero', 'hero', 'split-media', 'What it does with a concrete example'), S('showcase', 'product-showcase', 'interface-mock', 'Show the product'), S('cases', 'use-cases', 'tabbed', 'Use cases mapped to visitor goals'), S('faq', 'faq', 'accordion', 'Answer objections'), S('cta', 'cta', 'closing-band', 'Primary action'), FOOT], interactions: ['tabbed use cases', 'accordion with aria-expanded'] },
    { id: 'story-scroll', composition: 'type-led', structure: [NAV, S('hero', 'hero', 'statement-type', 'One clear promise'), S('process', 'process', 'numbered-steps', 'How it works'), S('stats', 'stats', 'supplied-figures-only', 'Only figures that were supplied'), S('cta', 'cta', 'inline-form', 'Primary action'), FOOT], interactions: ['scroll-linked step highlighting'] },
  ] },
  cafe: { category: 'hospitality', variants: [
    { id: 'menu-forward', composition: 'menu-led', structure: [NAV, S('hero', 'hero', 'menu-forward', 'Atmosphere with today\'s essentials'), S('menu', 'menu', 'tabbed-categories', 'Menu by category'), S('gallery', 'gallery', 'mosaic', 'Space and food'), S('visit', 'location-hours', 'map-less-card', 'Address, hours, phone'), S('reserve', 'reservation-form', 'inline', 'Reserve or enquire'), FOOT], interactions: ['menu category tabs', 'tap-to-call and directions links'] },
    { id: 'story-led', composition: 'image-led', structure: [NAV, S('hero', 'hero', 'full-bleed-media', 'The place'), S('about', 'about', 'story-columns', 'Story and approach'), S('menu', 'menu', 'two-column-list', 'Menu'), S('visit', 'location-hours', 'split-with-form', 'Visit'), S('reserve', 'reservation-form', 'stepper', 'Reserve'), FOOT], interactions: ['sticky reserve button on small screens'] },
  ] },
  hotel: { category: 'hospitality', variants: [
    { id: 'rooms-first', composition: 'booking-led', structure: [NAV, S('hero', 'hero', 'full-bleed-media', 'The place'), S('search', 'availability-search', 'floating-bar', 'Dates and guests'), S('rooms', 'rooms', 'card-comparison', 'Room discovery'), S('amenities', 'amenities', 'icon-list', 'What is included'), S('book', 'booking-form', 'enquiry-form', 'Request a stay'), FOOT], interactions: ['date and guest inputs validate', 'room cards expand details'] },
    { id: 'place-story', composition: 'image-led', structure: [NAV, S('hero', 'hero', 'editorial-masthead', 'Sense of place'), S('rooms', 'rooms', 'alternating-rows', 'Rooms'), S('gallery', 'gallery', 'carousel', 'Spaces'), S('amenities', 'amenities', 'two-column', 'Amenities'), S('book', 'booking-form', 'sticky-panel', 'Request a stay'), FOOT], interactions: ['accessible gallery carousel with keyboard controls'] },
  ] },
  studio: { category: 'creative-services', variants: [
    { id: 'work-and-process', composition: 'project-led', structure: [NAV, S('hero', 'hero', 'statement-type', 'What the studio does'), S('work', 'project-index', 'masonry', 'Selected work'), S('services', 'services', 'numbered-list', 'Services'), S('process', 'process', 'timeline', 'How projects run'), S('contact', 'contact-form', 'project-brief', 'Start a project'), FOOT], interactions: ['work filter by discipline', 'brief form validation'] },
    { id: 'capabilities-first', composition: 'type-led', structure: [NAV, S('hero', 'hero', 'split-media', 'Positioning'), S('services', 'services', 'cards-with-detail', 'Services'), S('work', 'project-detail', 'featured-case', 'Featured case'), S('contact', 'cta', 'large-type-email', 'Contact'), FOOT], interactions: ['service detail expands in place'] },
  ] },
  event: { category: 'events', variants: [
    { id: 'schedule-first', composition: 'content-led', structure: [NAV, S('hero', 'hero', 'date-location-forward', 'What, when, where'), S('schedule', 'schedule', 'day-tabs', 'Programme'), S('speakers', 'speakers', 'portrait-grid', 'Supplied speakers only'), S('register', 'registration-form', 'inline', 'Register'), FOOT], interactions: ['schedule day tabs', 'registration validation'] },
    { id: 'registration-led', composition: 'type-led', structure: [NAV, S('hero', 'hero', 'statement-type', 'The event in one line'), S('register', 'registration-form', 'sticky-panel', 'Register'), S('schedule', 'schedule', 'timeline', 'Programme'), S('faq', 'faq', 'accordion', 'Logistics'), FOOT], interactions: ['countdown only when a date was supplied'] },
  ] },
  education: { category: 'learning', variants: [
    { id: 'curriculum-first', composition: 'content-led', structure: [NAV, S('hero', 'hero', 'split-media', 'What you will learn'), S('curriculum', 'curriculum', 'expandable-modules', 'Syllabus'), S('instructors', 'instructors', 'supplied-only', 'Supplied instructors only'), S('enrol', 'enrol-cta', 'sticky-panel', 'Enrol'), FOOT], interactions: ['modules expand with aria-expanded'] },
    { id: 'outcomes-led', composition: 'type-led', structure: [NAV, S('hero', 'hero', 'statement-type', 'Outcome promise'), S('outcomes', 'features', 'numbered-outcomes', 'Learning outcomes'), S('curriculum', 'curriculum', 'timeline', 'Path through the course'), S('faq', 'faq', 'accordion', 'Questions'), S('enrol', 'enrol-cta', 'closing-band', 'Enrol'), FOOT], interactions: ['progress-style curriculum timeline'] },
  ] },
  custom: { category: 'general', variants: [
    { id: 'sections-from-brief', composition: 'content-led', structure: [NAV, S('hero', 'hero', 'split-media', 'Purpose of the site'), S('body', 'sections-custom', 'brief-driven', 'Sections named in the brief'), S('contact', 'contact-form', 'inline-minimal', 'Contact'), FOOT], interactions: ['smooth anchor navigation'] },
  ] },
};
ARCHETYPES.saas = ARCHETYPES.landing;

const FEATURE_COMPONENTS = [
  [/reserv|booking|book a table/i, 'reservation-form'], [/cart|checkout|basket/i, 'cart'], [/filter|search/i, 'filters'],
  [/contact|enquir|inquir/i, 'contact-form'], [/newsletter|subscribe/i, 'newsletter'], [/faq/i, 'faq'], [/gallery/i, 'gallery'],
  [/pricing|plans?\b/i, 'pricing'], [/testimonial|review/i, 'testimonials'], [/resume|cv\b/i, 'resume-actions'],
];

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
const asText = (v) => (typeof v === 'string' ? v : Array.isArray(v) ? v.map(asText).join(' ') : v && typeof v === 'object' ? Object.values(v).map(asText).join(' ') : '');
const hasUserKey = (userData, re) => Object.entries(userData || {}).some(([k, v]) => re.test(k) && (Array.isArray(v) ? v.length : Boolean(v)));

// Concrete, buildable motion vocabulary per intensity (CSS/IntersectionObserver only; no extra dependencies).
const MOTION_LEVELS = {
  subtle: { entrance: 'fade-up-12px', durationMs: 400, staggerMs: 60, scroll: ['reveal-once'], hover: ['lift-2px', 'link-underline'], extras: [] },
  moderate: { entrance: 'fade-up-20px', durationMs: 500, staggerMs: 80, scroll: ['reveal-once', 'sticky-header-transition', 'active-section-highlight'], hover: ['lift-4px-shadow', 'link-underline', 'image-zoom', 'button-press'], extras: ['tab-accordion-transitions', 'animated-counters-supplied-figures-only'] },
  expressive: { entrance: 'staggered-sequence', durationMs: 650, staggerMs: 100, scroll: ['reveal-once', 'hero-media-parallax', 'sticky-header-transition', 'active-section-highlight', 'marquee-strip'], hover: ['magnetic-button', 'lift-4px-shadow', 'image-zoom', 'button-press', 'link-underline'], extras: ['headline-word-reveal', 'page-load-sequence', 'tab-accordion-transitions', 'animated-counters-supplied-figures-only'] },
};
const STYLE_SIGNATURE = { glass: 'blur-and-glow-on-hover', cyberpunk: 'neon-flicker-hover', luxury: 'slow-700ms-fades', brutalist: 'hard-offset-shadow-press', brutalism: 'hard-offset-shadow-press', clay: 'squish-press-scale-96', bento: 'tile-lift-and-scale', retro: 'playful-wiggle-hover', neumorphism: 'soft-inset-press', maximalist: 'layered-parallax-motion', editorial: 'image-reveal-wipe', organic: 'gentle-float', retrofuturist: 'scanline-glow-hover', bold: 'big-scale-hover', creative: 'tilt-on-hover', minimal: 'precise-underline-sweep', modern: 'smooth-lift', corporate: 'restrained-fade' };
function buildMotionPlan(level, style) {
  if (level === 'none') return { level: 'none', entrance: 'none', durationMs: 0, staggerMs: 0, scroll: [], hover: ['focus-visible-ring'], extras: [], signature: 'none', reducedMotion: 'n/a' };
  return { level, ...MOTION_LEVELS[level], signature: STYLE_SIGNATURE[style] || 'smooth-lift', reducedMotion: 'remove-movement-keep-state-changes' };
}

function buildPalette(prefs, themeId, style, adjustments) {
  const base = THEMES[themeId === 'auto' ? 'light' : themeId] || THEMES.light;
  const colors = (typeof prefs.palette === 'string' ? prefs.palette.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi) : null) || [];
  const fallbackAccent = { luxury: '#b8935a', cyberpunk: '#22d3ee', organic: '#c2693e', editorial: '#8a4f25', bold: '#dc2626' }[style] || '#3b82f6';
  const accent = spec.parseHex(prefs.primaryColor) ? prefs.primaryColor : (colors[0] || fallbackAccent);
  const palette = { ...base, muted: spec.mix(base.text, base.background, 0.4), accent, accentContrast: '#ffffff' };
  if (colors[1] && colors[1] !== accent) palette.secondary = colors[1];
  palette.accentContrast = spec.contrast('#ffffff', accent) >= spec.contrast('#0b0b0d', accent) ? '#ffffff' : '#0b0b0d';
  // The accent must be usable for UI boundaries and links against the background (3:1); darken or lighten toward the text colour.
  if (spec.contrast(accent, base.background) < 3) {
    let strong = accent;
    for (let t = 0.1; t <= 1.001 && spec.contrast(strong, base.background) < 3; t += 0.1) strong = spec.mix(accent, base.text, t);
    palette.accentStrong = strong;
    adjustments.push(`accent ${accent} has ${spec.contrast(accent, base.background).toFixed(2)}:1 contrast on the background; use accentStrong ${strong} for text, links and borders`);
  }
  if (themeId === 'auto') palette.darkVariant = { ...THEMES.dark, muted: spec.mix(THEMES.dark.text, THEMES.dark.background, 0.4) };
  return palette;
}

function buildDesignSpec({ websiteType = 'custom', requirements = {}, preferences = {}, mediaPlan = [] } = {}) {
  const type = ARCHETYPES[websiteType] ? websiteType : 'custom';
  const arch = ARCHETYPES[type];
  const adjustments = [];
  const userData = requirements.userData || {};

  const style = spec.STYLE_IDS.includes(preferences.style) ? preferences.style : DEFAULT_STYLE[type];
  const traits = STYLE_TRAITS[style];
  const themeId = THEMES[preferences.theme] || preferences.theme === 'auto' ? preferences.theme : (DEFAULT_THEME_BY_STYLE[style] || 'light');
  const typeKey = TYPE_STACKS[preferences.typography] ? preferences.typography : (style === 'editorial' || style === 'luxury' ? 'serif' : style === 'brutalist' || style === 'cyberpunk' ? 'mono' : 'contemporary');
  const stack = TYPE_STACKS[typeKey];

  // Variant choice is a pure function of the brief, so equivalent inputs always produce the same structure.
  const seed = fnv1a([type, style, Object.keys(userData).sort().join(','), asText(userData).slice(0, 400)].join('|'));
  const variant = arch.variants[seed % arch.variants.length];
  let structure = variant.structure.map((s) => ({ ...s }));

  // Only add content-bearing blocks when the user supplied the matching facts or asked for the feature.
  const featureText = `${asText(requirements.features)} ${asText(requirements.sections)}`;
  const present = new Set(structure.map((s) => s.component));
  const insertBeforeFooter = (section) => { structure.splice(structure.length - 1, 0, section); present.add(section.component); };
  for (const [re, component] of FEATURE_COMPONENTS) {
    if (!re.test(featureText) || present.has(component)) continue;
    if (component === 'testimonials' && !hasUserKey(userData, /testimonial|review|quote/i)) continue; // never invent social proof
    if (component === 'pricing' && !hasUserKey(userData, /pric|plan|tier/i) && !/pricing|plans?/i.test(asText(requirements.features))) continue;
    if (component === 'resume-actions' && !(requirements.assets || []).some((a) => a?.isResume || /resume/i.test(a?.role || ''))) continue;
    insertBeforeFooter(S(component === 'contact-form' ? 'contact' : component, component, 'requested', 'Requested by the brief'));
  }
  const ids = new Set();
  structure = structure.filter((s) => (ids.has(s.id) ? false : (ids.add(s.id), true)));

  const media = (Array.isArray(mediaPlan) ? mediaPlan : []).filter((m) => m && typeof m.assetId === 'string');
  const heroMedia = media.some((m) => /hero|background/i.test(m.role || m.placement || ''));
  const composition = heroMedia && type !== 'ecommerce' ? 'image-led' : variant.composition;

  const motion = MOTION_BY_PREF[preferences.animations] || traits.motion;
  const density = traits.density;
  const palette = buildPalette(preferences, themeId, style, adjustments);
  const fam = (family, fallback) => ({ family, stack: `'${family}', ${fallback === 'serif' ? "Georgia, 'Times New Roman', serif" : fallback === 'monospace' ? "ui-monospace, 'SFMono-Regular', Consolas, monospace" : "system-ui, -apple-system, 'Segoe UI', sans-serif"}` });

  const result = {
    version: spec.SPEC_VERSION,
    projectType: type,
    businessCategory: arch.category,
    visualDirection: { style, theme: themeId, density, composition, motionIntensity: motion, radius: traits.radius },
    palette,
    typography: { heading: fam(stack.heading, stack.fallback), body: fam(stack.body, stack.bodyFallback || stack.fallback), scale: 'fluid-clamp', measure: '65ch' },
    layout: {
      maxWidth: type === 'blog' ? '1080px' : '1200px', responsive: true, spacingSystem: '4px-base-scale',
      sectionSpacing: { compact: '64px', balanced: '88px', spacious: '120px' }[density],
      breakpoints: [320, 375, 430, 768, 1024, 1280], pageStructure: structure,
    },
    components: [...new Set(structure.map((s) => s.component))],
    motionPlan: buildMotionPlan(motion, style),
    interactions: [...variant.interactions, ...(motion === 'none' ? [] : ['all animation has a prefers-reduced-motion fallback'])],
    // Every control must do something real; section ids are the anchor targets for navigation links.
    interactivity: { everyControlFunctional: true, sectionIds: structure.map((s) => s.id), rules: ['nav links use href="#<sectionId>" and each section element carries that id', 'no href="#" and no button without a handler', 'forms validate, show success and error states', 'filters, tabs, carts and accordions change real state'] },
    mediaUsage: media.map((m) => ({ assetId: m.assetId, role: String(m.role || m.placement || 'section-visual').slice(0, 40) })),
    contentRules: { preserveUserContent: true, noInventedFacts: true, noInventedTestimonials: true, placeholderPolicy: 'omit-or-neutral-generic' },
    qualityRequirements: { semanticHtml: true, keyboardAccessible: true, responsive: true, reducedMotionSupport: true },
    meta: { engine: 'devdrop-design-intelligence', variant: variant.id, adjustments, styleSource: spec.STYLE_IDS.includes(preferences.style) ? 'preference' : 'default' },
  };
  return spec.assertDesignSpec(result);
}

// Last line of defence for model output: keep text/background legible without discarding the agent's art direction.
function enforceDesignSystemFloor(designSystem, designSpec) {
  const notes = [];
  const colors = designSystem && typeof designSystem === 'object' ? designSystem.colors : null;
  if (!colors || typeof colors !== 'object') return notes;
  const { text, background } = colors;
  const ratio = spec.contrast(text, background);
  if (ratio !== null && ratio < 4.5) {
    colors.text = designSpec.palette.text;
    colors.background = designSpec.palette.background;
    notes.push(`designSystem text/background contrast was ${ratio.toFixed(2)}:1; reset to the designSpec palette`);
  }
  return notes;
}

module.exports = { buildDesignSpec, enforceDesignSystemFloor, ARCHETYPES, THEMES, TYPE_STACKS, fnv1a };
