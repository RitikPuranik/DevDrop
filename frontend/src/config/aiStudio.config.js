import { BriefcaseBusiness, ShoppingBag, Newspaper, LayoutTemplate, Coffee, Hotel, Clapperboard, AppWindow, CalendarDays, GraduationCap, WandSparkles } from 'lucide-react';

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
  {
    id: 'saas',
    title: 'SaaS / Web App',
    description: 'Product-led website for software, AI tools, dashboards and web applications.',
    icon: AppWindow,
    enabled: true,
  },
  {
    id: 'event',
    title: 'Event / Conference',
    description: 'Event site for conferences, meetups, launches, workshops and live experiences.',
    icon: CalendarDays,
    enabled: true,
  },
  {
    id: 'education',
    title: 'Education / Course',
    description: 'Course, academy, coaching or learning platform website with clear enrollment paths.',
    icon: GraduationCap,
    enabled: true,
  },
  {
    id: 'custom',
    title: 'Custom Website',
    description: 'Start from scratch. Describe exactly what you need and shape the brief around your idea.',
    icon: WandSparkles,
    enabled: true,
  },
];

export const DESIGN_STYLES = [
  { id: 'minimal', label: 'Minimal', typo: 'neo', direction: 'Restrained, lots of whitespace, hairline (1px) dividers, small calm type, one accent, no decoration, no shadows. Content-first with a centered, quiet hero, generous 96px+ section spacing and text-link buttons or thin outlined buttons.' },
  { id: 'modern', label: 'Modern', typo: 'grotesk', direction: 'Clean split hero, 12-16px radius cards with soft layered shadows (0 10px 30px -14px rgba(0,0,0,.5)), subtle gradients and radial glows behind the hero, confident sans-serif type with tight tracking, polished SaaS feel, soft-fill buttons.' },
  { id: 'bold', label: 'Bold', typo: 'condensed', direction: 'Poster-like. Oversized uppercase headlines (clamp up to 9vw), heavy 800-900 weights, flat color blocks and slabs, high contrast, a scrolling marquee strip, square corners, zero shadows, zero gradients.' },
  { id: 'editorial', label: 'Editorial', typo: 'serif', direction: 'Magazine layout: masthead with double rules, large serif headlines, multi-column body text with drop caps, italic captions and bylines, thin dividers, generous reading rhythm, restrained single accent color, square corners.' },
  { id: 'creative', label: 'Creative', typo: 'geometric', direction: 'Playful and expressive: organic color blobs, slightly rotated cards (-3deg to 3deg), gradient text, asymmetric composition, overlapping shapes, vivid multi-color accents, pill buttons, sticker-like details.' },
  { id: 'glass', label: 'Glassmorphism', typo: 'contemporary', direction: 'Frosted translucent panels: background rgba(255,255,255,.12-.25), backdrop-filter blur(16-24px) saturate(150%), 1px border rgba(255,255,255,.25-.35), soft inner top highlight and a large soft shadow, 20-28px radius, layered over vivid blurred gradient orbs so the blur is visible. Floating pill navbar. Keep text contrast accessible (Apple "liquid glass" inspired).' },
  { id: 'clay', label: 'Claymorphism', typo: 'rounded', direction: 'Soft 3D "inflated clay" UI. Every card, button, input, icon tile and badge looks like a puffy rounded object made of clay: very large radius (24-40px, buttons fully pill), NO hard borders, pastel low-saturation fills (derived from the chosen palette) on a pale tinted background, and a three-layer shadow on each surface: an outer soft drop shadow (e.g. 12px 12px 28px rgba(accent-dark,.28)), an inner light highlight at the top-left (inset 8px 8px 16px rgba(255,255,255,.75)) and an inner dark shade at the bottom-right (inset -8px -8px 16px rgba(0,0,0,.10)). Chunky pill buttons that visibly press in on :active (shadow shrinks, translateY 2px) and bounce on hover (spring, slight scale). Rounded friendly type (Nunito/Fredoka/Quicksand) with heavy headings. Round puffy icon tiles, floating blob shapes behind the hero and soft 3D-style illustrations. Playful, friendly, bouncy motion. Dark themes: use deep tinted surfaces with lighter inset highlights, never pure black.' },
  { id: 'brutalist', label: 'Neo-Brutalist', typo: 'mono', direction: 'Thick solid 3px black borders, zero-blur hard offset shadows (6px 6px 0 #000), flat saturated fills, raw visible grid, uppercase mono type, stickers/badges at angles, pressed-button hover states (translate(4px,4px) and collapse the shadow on hover).' },
  { id: 'brutalism', label: 'Brutalism', typo: 'mono', direction: 'Raw structural brutalism: paper-like off-white surfaces, black rules, utilitarian controls, oversized typography, exposed grid mechanics, stark hierarchy and occasional red/yellow accents. Avoid playful stickers, glossy polish, gradients and decorative shadows; prioritize structure and direct communication.' },
  { id: 'cyberpunk', label: 'Cyberpunk', typo: 'mono', direction: 'Dark futuristic interface with electric cyan, magenta and acid-lime accents, HUD panels, terminal-like labels, technical grids, scanline/glitch details, sharp controls and high contrast. Effects support hierarchy rather than obscuring content; keep text, focus states and responsive behavior accessible.' },
  { id: 'neumorphism', label: 'Neumorphism', typo: 'rounded', direction: 'Soft tactile interface built from monochrome surfaces, raised and inset shadows, rounded geometry, restrained accent color and one consistent light direction. Prefer calm low-contrast depth without hard borders; preserve accessible text contrast, visible focus states and responsive controls.' },
  { id: 'bento', label: 'Bento Grid', typo: 'contemporary', direction: 'Modular grid of differently sized self-contained tiles (feature, stat, visual, CTA, testimonial), consistent 12-16px gaps and 20-24px radius, each tile communicating one idea with its own mini-visual (chart, avatar stack, palette, toggle). Hero is itself a bento grid. Apple-keynote style.' },
  { id: 'retro', label: 'Retro / Y2K', typo: 'mono', direction: 'Dial-up/Y2K nostalgia: OS-window chrome with gradient title bars and window buttons, chunky chrome-gradient glossy buttons, pastel gradients, pixel-grid backgrounds, stickers, sparkle glyphs and monospace type, thick dark outlines with hard shadows.' },
  { id: 'luxury', label: 'Luxury', typo: 'serif', direction: 'Elegant and understated: wide letter-spaced serif caps, thin gold hairlines, ornamental dividers, dark rich surfaces, square corners, outlined gold buttons with wide tracking, slow refined motion, generous space.' },
  { id: 'corporate', label: 'Corporate', typo: 'humanist', direction: 'Trust-driven and professional: structured 12-column grid, restrained 4-8px radius, data/dashboard visuals, trust badges and logo strips, clear information hierarchy, strong solid CTAs, subtle shadows.' },
  { id: 'organic', label: 'Organic / Soft', typo: 'rounded', direction: 'Warm, human and calm: soft blob shapes, very large radius, earthy tones, flat (not puffy 3D) pill buttons, gentle gradients, friendly rounded type, no hard shadows.' },
  { id: 'retrofuturist', label: 'Retrofuturism', typo: 'geometric', direction: 'Optimistic sci-fi nostalgia: deep space backgrounds, electric cyan/magenta/violet accents, chrome-like gradients, orbital rings, technical labels, futuristic geometric type, asymmetric split layouts, glowing horizon lines and restrained scanline/grid texture. It should feel like a polished future imagined from the 1980s/1990s, not a generic cyberpunk dashboard.' },
  { id: 'maximalist', label: 'Maximalist Collage', typo: 'geometric', direction: 'High-energy art-directed collage: oversized expressive typography, layered photography, torn-paper frames, stickers, colored blocks, overlapping cards, mixed scales, rotated elements and dense but intentional compositions. Use a controlled palette, clear reading order and deliberate focal points so abundance never becomes visual noise.' },
];

export const DESIGN_THEMES = [
  { id: 'dark', label: 'Dark', direction: 'Near-black background (#0b0b0d) with a deliberate text palette: white headings (#fff), soft white body text (#f2f4f7), muted white-secondary text, cool cyan links (#8de9ff), and light-on-accent text where needed. Preserve WCAG AA contrast.' },
  { id: 'light', label: 'Light', direction: 'Off-white background (#f8f8f6) with near-black headings (#0a0a0a), charcoal body text (#242424), softer muted copy, blue links (#2458c6), and white inverse text on dark/accent surfaces.' },
  { id: 'neutral', label: 'Neutral', direction: 'Mid-grey/stone background (#d9d9d6) with charcoal headings (#121212), softer charcoal body text (#2a2a2a), muted secondary copy, slate-blue links (#365a88), and high-contrast inverse text.' },
  { id: 'midnight', label: 'Midnight', direction: 'Deep navy background (#0a1228) with white headings, pale blue body text (#e6edff), cool muted copy, electric sky links (#73ddff), and dark inverse text on pale surfaces.' },
  { id: 'warm', label: 'Warm Cream', direction: 'Warm cream/sand background (#f3ead9) with espresso headings (#21150e), warm brown body text (#3a2b20), earthy muted copy, terracotta-brown links (#8a4f25), and warm ivory inverse text.' },
  { id: 'auto', label: 'Auto (Light + Dark)', direction: 'Implement both the Light and Dark text palettes with CSS variables and prefers-color-scheme. Switch heading, body, muted, link, inverse, surface and border colors together; default to dark when no system preference is available.' },
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

// Reference pack contract: each Vibe & Style is represented by a code-built preview recipe.
// The preview deliberately does not render the supplied reference screenshots. It reconstructs
// their recurring composition, typography, surfaces, spacing, navigation and section grammar.
export const DESIGN_RESEARCH = {
  minimal: { composition: 'Single-column editorial hierarchy with centered or left-aligned hero, wide margins, deliberate negative space, and a quiet content rail.', navigation: 'Simple text navigation with thin divider and one understated CTA; avoid floating chrome.', hero: 'Short eyebrow, restrained headline, one supporting paragraph, text-link or hairline CTA, optional monochrome visual.', sections: 'Alternating text and media blocks, thin rules, small labels, generous vertical rhythm, no decorative clutter.', cards: 'Use cards sparingly; prefer open rows and bordered list items over elevated boxes.', imagery: 'Large crops with natural proportions, low treatment, generous breathing room and captions when useful.', type: 'Neutral neo-grotesk, medium weight, tight but not compressed tracking, clear 4-6 step hierarchy.', spacing: 'Large outer margins and 80-120px-equivalent section rhythm; compact internal controls.', motion: 'Subtle opacity/translate only, never distract from content.' },
  modern: { composition: 'Asymmetric split hero with a strong content column and a product-like visual column, followed by modular feature sections.', navigation: 'Compact top bar, logo left, links center/right, solid rounded CTA.', hero: 'Eyebrow, large two-line headline, concise proof copy, primary/secondary CTAs, product/dashboard visual.', sections: 'Feature grid, proof strip, project cards, CTA band, and structured footer.', cards: 'Soft elevated cards with 12-16px radius, layered shadows and restrained gradients.', imagery: 'Product screenshots, abstract 3D/gradient visuals, device frames and cropped photography.', type: 'Confident grotesk with strong weight contrast and compact heading tracking.', spacing: '24-32px internal gaps, 64-96px section rhythm, 12-column responsive grid.', motion: 'Soft reveal, hover lift, gradient drift and restrained micro-interactions.' },
  bold: { composition: 'Poster composition with oversized type, flat slabs, deliberate cropping and a visible marquee or ticker.', navigation: 'Minimal utility nav with strong baseline and no ornamental floating cards.', hero: 'Massive uppercase headline, one accent slab, short statement and block CTA.', sections: 'Stacked manifesto, large project index, hard-edged media blocks and ticker bands.', cards: 'Flat rectangular blocks, no radius, no blur, high contrast.', imagery: 'High-contrast editorial crops, oversized images and duotone treatments.', type: 'Condensed display face with 800-900 weight and extreme scale contrast.', spacing: 'Tight local spacing inside slabs, large visual breaks between major blocks.', motion: 'Kinetic headline or marquee when selected; keep loops linear and legible.' },
  editorial: { composition: 'Magazine grid with masthead, rules, feature column, secondary stories and reading-width text.', navigation: 'Masthead plus small category links, issue metadata and subscribe action.', hero: 'Feature story framing with kicker, large serif headline, byline/read-time and a dominant image.', sections: 'Multi-column stories, pull quotes, captions, archive/index and newsletter.', cards: 'Flat article rows or framed story blocks with thin rules, never generic SaaS cards.', imagery: 'Full-bleed editorial crops, figure captions, black-and-white or restrained color grading.', type: 'Expressive serif display paired with neutral sans body; italic captions and metadata.', spacing: 'Tight grid gutters with generous vertical reading rhythm.', motion: 'Slow fades, image scale and elegant page transitions only.' },
  creative: { composition: 'Asymmetric collage with overlapping objects, offset cards, organic blobs and multiple focal points.', navigation: 'Compact floating nav or playful wordmark with pill CTA.', hero: 'Large expressive headline, gradient word treatment, short copy, pill CTA and layered visual collage.', sections: 'Capabilities cards, project collage, playful metrics, process path and contact sticker.', cards: 'Rounded cards can rotate 1-3 degrees, overlap, or use colorful flat/gradient fills.', imagery: 'Art-directed portraits, abstract crops, stickers, cutouts and mixed media.', type: 'Geometric sans with expressive weight contrast and occasional italic/display treatment.', spacing: 'Asymmetric gaps and overlaps, but preserve clear tap targets and reading order.', motion: 'Spring hover, gentle floating blobs, magnetic buttons and staggered reveals.' },
  glass: { composition: 'Layered depth: vivid ambient background, floating translucent panels, hero content over a luminous field.', navigation: 'Floating pill navigation with translucent material, edge highlight and blur.', hero: 'Large headline over blurred color field with translucent content panels and a primary pill CTA.', sections: 'Stacked frosted cards, floating metrics, media gallery and translucent CTA/footer.', cards: '12-28px radius, translucent fill, 1px light border, backdrop blur, soft shadow and top highlight.', imagery: 'Colorful blurred gradients, luminous photography and depth-rich visuals behind glass.', type: 'Contemporary sans with high contrast; ensure text remains readable over glass.', spacing: 'Layered composition with 16-24px gaps and generous hero padding.', motion: 'Slow floating, parallax depth and gradient drift; respect reduced motion.' },
  clay: { composition: 'Friendly tactile dashboard-like composition with inflated controls, soft blobs and chunky surfaces.', navigation: 'Puffy pill nav with rounded logo and tactile CTA.', hero: 'Warm badge, friendly heavy headline, short copy and chunky pressed CTA beside puffy visual tiles.', sections: 'Feature tiles, stats, process steps, testimonial bubble and rounded contact panel.', cards: '24-40px radius, no hard borders, pastel fills, multi-layer inner/outer shadows.', imagery: 'Soft 3D-style forms, rounded illustrations, puffy avatars and gentle gradients.', type: 'Rounded friendly type with heavy headings and comfortable body size.', spacing: 'Generous rounded containers with 12-24px internal gaps.', motion: 'Springy hover, press-in states and gentle floating elements.' },
  brutalist: { composition: 'Raw visible grid, asymmetry, exposed rules, oversized type, hard offsets and intentionally disruptive hierarchy.', navigation: 'Text-first utility nav, often exposed bylines/categories and no glossy chrome.', hero: 'Huge headline, flat color block, direct CTA, sticker/badge and hard-edged media.', sections: 'Index lists, capability tables, project archive, manifesto and blunt contact block.', cards: 'Square blocks with thick borders and zero-blur offset shadows.', imagery: 'Monochrome or clashing-color crops, occasional grain/static and unexpected overlaps.', type: 'Mono or system grotesk, extreme size contrast, uppercase labels and visible hierarchy breaks.', spacing: 'Can be crowded locally, but preserve an underlying grid and keyboard order.', motion: 'Abrupt hover/press shifts, cursor reveals or marquee, never smooth luxury easing.' },
  brutalism: { composition: 'Raw editorial structure built on an exposed column/grid system, paper-like canvas, stark black rules and oversized type.', navigation: 'Simple text-first masthead with visible divider, compact utility links and one direct action.', hero: 'Large blunt headline, small project/category label, short supporting line, rectangular CTA and one bold color slab.', sections: 'Index lists, manifesto, project archive, capability rows and a direct contact block rather than rounded card grids.', cards: 'Flat paper-like blocks with 1-2px rules, square corners and no decorative elevation.', imagery: 'Documentary/editorial crops, monochrome images, deliberate framing and occasional primary-color interruption.', type: 'Mono or grotesk with strong scale contrast, uppercase utility labels and tight alignment to the grid.', spacing: 'Tight local spacing with clear large breaks between structural bands; show the grid instead of hiding it.', motion: 'Minimal and abrupt: instant hover color swaps, short press shifts or linear marquee only when useful.' },
  cyberpunk: { composition: 'Dark technical grid with modular HUD panels, asymmetrical columns, neon edge accents and dense micro-labels.', navigation: 'Compact terminal-like header with status indicator, utility links and luminous active state.', hero: 'Large geometric/mono headline with one neon emphasis, system metadata, compact CTA and a data/HUD visual.', sections: 'Capabilities, telemetry metrics, system status, case studies, archive, FAQ and a terminal-style contact panel.', cards: 'Sharp 2-6px radii, translucent dark surfaces, 1px cyan/magenta borders and restrained inner glow.', imagery: 'Dark architectural/cinematic crops, wireframes, scanlines, grids and neon highlights; avoid random stock hacker imagery.', type: 'Monospace or geometric display paired with compact readable body copy; use uppercase labels sparingly.', spacing: 'Dense utility spacing inside panels with generous outer bands and clear responsive stacking.', motion: 'Short glitch accents, scanline movement, glow pulses and restrained parallax; never sacrifice readability.' },
  neumorphism: { composition: 'Soft monochrome canvas with raised/inset control clusters, large rounded hero surface and centered tactile focal elements.', navigation: 'Rounded compact navigation surface with subtle elevation and clear focus treatment.', hero: 'Friendly eyebrow, bold rounded headline, short copy, soft pill CTA and one large raised visual/control.', sections: 'Feature controls, tactile stats, process steps, pricing surfaces and a rounded contact panel.', cards: '20-36px radius, no hard borders, one consistent light direction and layered outer/inset shadows.', imagery: 'Soft abstract forms, low-contrast photography, circular controls and quiet monochrome illustrations with restrained accent color.', type: 'Rounded sans with confident headings, readable body copy and enough contrast against the surface.', spacing: 'Comfortable 16-28px control spacing and broad outer padding so shadows have room to breathe.', motion: 'Gentle lift/press transitions and slow state changes; avoid excessive bounce.' },
  bento: { composition: 'Modular 12-column tile system with varied 1x1, 2x1 and 2x2 tiles, each communicating one idea.', navigation: 'Compact clean header; the hero itself can be the first large tile.', hero: 'Large feature tile containing headline/CTA paired with stat, visual, and utility tiles.', sections: 'Proof tiles, capabilities, project tiles, testimonial tile, metrics and CTA tile.', cards: '20-24px radius, consistent gap, strong internal padding, varied tile geometry.', imagery: 'Each visual tile gets one focused image/diagram rather than generic galleries.', type: 'Contemporary sans with clear tile-level hierarchy.', spacing: '12-16px grid gaps and consistent tile padding.', motion: 'Staggered tile reveal, hover image zoom and expand-in-place where useful.' },
  retro: { composition: 'Layered desktop-era interface with window chrome, pixel grid, stickers, chrome gradients and visible borders.', navigation: 'OS-like title bar, chunky buttons and playful utility links.', hero: 'Windowed hero with title bar, monospace headline, glossy CTA and pixel-grid backdrop.', sections: 'Overlapping windows for about/projects/guestbook, sticker badges and archive panels.', cards: '8-12px radius, thick borders, hard shadows and glossy title bars.', imagery: 'Pixelated textures, framed screenshots, neon gradients and Y2K chrome treatments.', type: 'Monospace or techno display with compact labels and nostalgic UI copy.', spacing: 'Dense 8-16px UI spacing inside windows, with deliberate desktop canvas margins.', motion: 'Blinking cursor, marquee, hover chrome and small pixel shifts; avoid seizure-inducing effects.' },
  luxury: { composition: 'Quiet high-fashion composition with centered masthead, generous negative space, thin rules and editorial imagery.', navigation: 'Wide-tracked serif/sans wordmark, small uppercase links and minimal outlined CTA.', hero: 'Small prestige eyebrow, large refined serif title, short manifesto, gold hairline and cinematic image.', sections: 'Manifesto, selected work, services, press/awards, appointment/contact and restrained footer.', cards: 'Avoid card-heavy UI; use open rows, framed imagery and thin separators.', imagery: 'Large cinematic photography, deep shadows, warm highlights and carefully cropped portraits.', type: 'Elegant serif display with wide uppercase tracking and understated sans metadata.', spacing: 'Very generous section spacing, 32-64px internal image margins and precise alignment.', motion: 'Slow fades, subtle image drift and long easing curves.' },
  corporate: { composition: 'Structured 12-column system with proof-first hierarchy, clear information density and strong alignment.', navigation: 'Professional header with logo, product/section links, utility action and solid CTA.', hero: 'Trust eyebrow, clear outcome-led headline, supporting proof, CTA and dashboard/data visual.', sections: 'Logo strip, metrics, feature grid, process, case study, testimonial, FAQ and contact.', cards: '4-8px radius, subtle borders/shadows, compact data presentation.', imagery: 'Product UI, charts, team imagery, trust marks and restrained photography.', type: 'Humanist sans optimized for scanning with strong labels and readable body text.', spacing: 'Consistent grid gutters, 48-80px section rhythm and predictable alignment.', motion: 'Functional fades, count-ups and small hover feedback only.' },
  organic: { composition: 'Warm asymmetrical composition with soft blobs, flowing sections, rounded containers and natural visual rhythm.', navigation: 'Friendly rounded nav with pill CTA and compact links.', hero: 'Warm eyebrow, approachable headline, short story, pill CTA and organic illustration/photo.', sections: 'Story, services, values, case studies, testimonial and warm contact invitation.', cards: 'Large radii, flat tinted fills, soft gradients and no hard/puffy 3D shadows.', imagery: 'Natural photography, paper textures, botanical/handmade shapes and soft masks.', type: 'Rounded friendly sans with relaxed line height and approachable weight.', spacing: 'Comfortable 20-32px internal gaps and broad section breathing room.', motion: 'Gentle blob drift, fade/slide and soft hover scale.' },
  retrofuturist: { composition: 'Cinematic future-retro composition with a strong horizon, orbital geometry, asymmetrical columns and luminous technical annotations.', navigation: 'Compact futuristic utility nav with monospaced metadata, glowing active state and a geometric primary CTA.', hero: 'Huge geometric headline, short mission statement, horizon glow, orbital visual and technical status labels.', sections: 'Mission statement, capabilities, featured projects, telemetry-style metrics, timeline and launch CTA.', cards: 'Dark translucent surfaces, 1px luminous borders, subtle inner glow and angular or clipped corners.', imagery: 'Chrome, iridescent gradients, star fields, architectural sci-fi imagery and abstract orbital forms.', type: 'Geometric display face paired with monospace metadata; use tight tracking and uppercase labels sparingly.', spacing: 'Wide cinematic gutters with dense technical microcopy near major visuals.', motion: 'Slow orbital drift, glow pulses, marquee telemetry and restrained parallax; respect reduced motion.' },
  maximalist: { composition: 'Layered editorial collage with overlapping visual planes, broken grids, oversized type, colored slabs and deliberate depth.', navigation: 'Bold utility nav integrated into the composition, with oversized wordmark and offset links rather than a floating generic navbar.', hero: 'Oversized headline crossing image and color blocks, stacked labels, sticker-like CTA and one dominant visual focal point.', sections: 'Manifesto, image collage, services, selected work, quote wall, social proof and a highly graphic CTA/footer.', cards: 'Mixed card sizes and orientations, thin frames, paper-like blocks, occasional hard shadows and rotated accents.', imagery: 'Layered photography, cutouts, scanned textures, paper edges, stickers and abstract graphic fragments.', type: 'Expressive geometric or grotesk display type with extreme scale contrast and short supporting copy.', spacing: 'Dense local clusters balanced by deliberate large negative-space breaks between compositions.', motion: 'Layered reveal, image drift, sticker pop-ins and marquee accents; keep the primary reading order stable.' },
};

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
    'Theme text-color contract: use semantic text tokens for heading, body, muted/secondary, link/accent, inverse-on-accent, and text-on-surface colors. Never hardcode a conflicting text color when a theme token applies. Keep text colors paired with the chosen background/surface for accessible contrast.',
    `Animation: ${motion.label} — ${motion.direction}`,
    `Primary color: ${design.primaryColor || 'Choose a tasteful accent that fits the theme.'}`,
    `Color palette${palette ? ` (${palette.name})` : ''}: ${design.palette || (palette ? palette.colors.join(', ') : 'AI-selected palette')}`,
    `Typography: ${typo.label} — ${typo.direction}`,
    `Deep design recipe: ${JSON.stringify(DESIGN_RESEARCH[style.id] || {})}`,
    'Apply this direction consistently to composition, information architecture, hero structure, navigation, sections, cards, imagery, typography, spacing, controls, motion and footer treatment — not only colors. Always honor prefers-reduced-motion and preserve accessible reading order.',
    'Responsive contract: treat 320px, 375px, 430px, 768px and desktop as first-class compositions. Avoid fixed-width content and horizontal overflow; use fluid typography, max-width media, flexible grids, responsive navigation, stacked mobile layouts and touch-friendly controls while preserving the selected visual language.',
  ].join('\n');
}
