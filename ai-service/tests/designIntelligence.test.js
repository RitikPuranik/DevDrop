const { buildDesignSpec, enforceDesignSystemFloor, ARCHETYPES } = require('../src/design/designIntelligence');
const { validateDesignSpec, isGenericTemplate, contrast, COMPONENTS } = require('../src/design/designSpec');

const CASES = {
  portfolio: { websiteType: 'portfolio', requirements: { userData: { name: 'Ada Lovelace', projects: [{ title: 'Engine' }] }, features: ['contact'], sections: ['work', 'about'] }, preferences: { style: 'minimal', theme: 'light', typography: 'neo', animations: 'subtle' } },
  saas: { websiteType: 'saas', requirements: { userData: { productName: 'Flow' }, features: ['pricing'], sections: [] }, preferences: { style: 'modern', theme: 'dark', primaryColor: '#3b82f6', animations: 'scroll' } },
  restaurant: { websiteType: 'cafe', requirements: { userData: { venueName: 'Kiln' }, features: ['reservation'], sections: ['menu'] }, preferences: { style: 'luxury', theme: 'warm', palette: '#9c684a, #e8d9bf', primaryColor: '#9c684a', typography: 'serif' } },
  ecommerce: { websiteType: 'ecommerce', requirements: { userData: { storeName: 'Loom' }, features: ['cart', 'filter'], sections: [] }, preferences: { style: 'modern', theme: 'light' } },
  blog: { websiteType: 'blog', requirements: { userData: { publicationName: 'Ledger' }, features: ['newsletter'], sections: [] }, preferences: { style: 'editorial', theme: 'warm', typography: 'serif' } },
  hotel: { websiteType: 'hotel', requirements: { userData: { hotelName: 'Harbor' }, features: [], sections: [] }, preferences: {} },
};
const allTypes = ['portfolio', 'ecommerce', 'blog', 'landing', 'saas', 'cafe', 'hotel', 'studio', 'event', 'education', 'custom'];

describe('design spec generation', () => {
  it.each(Object.keys(CASES))('%s produces a valid, complete spec', (name) => {
    const spec = buildDesignSpec(CASES[name]);
    expect(validateDesignSpec(spec)).toEqual({ ok: true, errors: [], warnings: expect.any(Array) });
    expect(spec.layout.pageStructure[0].component).toBe('navigation');
    expect(spec.layout.pageStructure.at(-1).component).toBe('footer');
    expect(spec.qualityRequirements).toEqual({ semanticHtml: true, keyboardAccessible: true, responsive: true, reducedMotionSupport: true });
    expect(spec.layout.breakpoints).toEqual([320, 375, 430, 768, 1024, 1280]);
  });
  it('is valid for every website type with no preferences at all', () => {
    for (const websiteType of allTypes) expect(validateDesignSpec(buildDesignSpec({ websiteType })).ok).toBe(true);
  });
  it('falls back to the custom archetype for unknown types', () => expect(buildDesignSpec({ websiteType: 'unknown-x' }).projectType).toBe('custom'));
  it('is deterministic for equivalent input and varies with the brief', () => {
    expect(buildDesignSpec(CASES.restaurant)).toEqual(buildDesignSpec(JSON.parse(JSON.stringify(CASES.restaurant))));
    const variants = new Set();
    for (let i = 0; i < 40; i += 1) variants.add(buildDesignSpec({ websiteType: 'cafe', requirements: { userData: { venueName: `Place ${i}` } } }).meta.variant);
    expect(variants.size).toBe(ARCHETYPES.cafe.variants.length);
  });
  it('honours style, theme, palette, typography and animation preferences', () => {
    const spec = buildDesignSpec(CASES.restaurant);
    expect(spec.visualDirection).toMatchObject({ style: 'luxury', theme: 'warm', motionIntensity: 'subtle' });
    expect(spec.palette.background).toBe('#f3ead9');
    expect(spec.palette.accent).toBe('#9c684a');
    expect(spec.palette.secondary).toBe('#e8d9bf');
    expect(spec.typography.heading.family).toBe('Playfair Display');
    expect(buildDesignSpec(CASES.saas).visualDirection.motionIntensity).toBe('moderate');
    expect(buildDesignSpec({ websiteType: 'blog', preferences: { animations: 'none' } }).interactions.join()).not.toMatch(/reduced-motion/);
  });
  it('emits the auto theme with a dark variant', () => {
    const spec = buildDesignSpec({ websiteType: 'saas', preferences: { theme: 'auto' } });
    expect(spec.palette.darkVariant.background).toBe('#0b0b0d');
    expect(validateDesignSpec(spec).ok).toBe(true);
  });
  it('fixes low-contrast accents without discarding the chosen colour', () => {
    const spec = buildDesignSpec({ websiteType: 'cafe', preferences: { theme: 'warm', primaryColor: '#e8d9bf' } });
    expect(spec.palette.accent).toBe('#e8d9bf');
    expect(contrast(spec.palette.accentStrong, spec.palette.background)).toBeGreaterThanOrEqual(3);
    expect(spec.meta.adjustments[0]).toMatch(/accentStrong/);
  });
  it('ignores malformed colours instead of failing', () => {
    expect(validateDesignSpec(buildDesignSpec({ websiteType: 'saas', preferences: { primaryColor: 'red', palette: 'nonsense' } })).ok).toBe(true);
  });
});

describe('layouts depend on purpose and avoid the generic skeleton', () => {
  it('no archetype variant collapses to hero/features/testimonials/footer', () => {
    for (const [type, arch] of Object.entries(ARCHETYPES)) for (const v of arch.variants) expect({ type, v: v.id, generic: isGenericTemplate(v.structure) }).toEqual({ type, v: v.id, generic: false });
  });
  it('purpose-specific components appear', () => {
    expect(buildDesignSpec(CASES.restaurant).components).toEqual(expect.arrayContaining(['menu', 'reservation-form', 'location-hours']));
    expect(buildDesignSpec(CASES.ecommerce).components).toEqual(expect.arrayContaining(['product-grid', 'cart', 'filters']));
    expect(buildDesignSpec(CASES.hotel).components).toEqual(expect.arrayContaining(['rooms', 'amenities']));
    expect(buildDesignSpec(CASES.portfolio).components.some((c) => ['project-index', 'project-detail'].includes(c))).toBe(true);
    expect(buildDesignSpec(CASES.blog).components.some((c) => ['article-feed', 'article-list'].includes(c))).toBe(true);
  });
  it('different purposes get different structures and heroes', () => {
    const shapes = new Set(Object.keys(CASES).map((k) => buildDesignSpec(CASES[k]).layout.pageStructure.map((s) => s.component).join('>')));
    expect(shapes.size).toBe(Object.keys(CASES).length);
    const heroVariants = new Set(allTypes.map((t) => buildDesignSpec({ websiteType: t }).layout.pageStructure.find((s) => s.component === 'hero').variant));
    expect(heroVariants.size).toBeGreaterThanOrEqual(5);
  });
  it('never adds testimonials, pricing or resume actions the user did not supply', () => {
    const spec = buildDesignSpec({ websiteType: 'saas', requirements: { userData: {}, features: ['testimonials', 'reviews', 'resume'] } });
    expect(spec.components).not.toContain('testimonials');
    expect(spec.components).not.toContain('resume-actions');
    const supplied = buildDesignSpec({ websiteType: 'saas', requirements: { userData: { testimonials: [{ quote: 'real' }] }, features: ['testimonials'] } });
    expect(supplied.components).toContain('testimonials');
    expect(supplied.contentRules.noInventedTestimonials).toBe(true);
  });
  it('adds a requested feature only once and keeps ids unique', () => {
    const spec = buildDesignSpec({ websiteType: 'cafe', requirements: { features: ['reservation', 'reservation form', 'booking'] } });
    const ids = spec.layout.pageStructure.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(spec.components.filter((c) => c === 'reservation-form')).toHaveLength(1);
  });
  it('uses image-led composition when media is planned for the hero and never stores URLs', () => {
    const spec = buildDesignSpec({ websiteType: 'saas', mediaPlan: [{ assetId: 'i1', role: 'hero' }, { assetId: 'i2', role: 'gallery' }] });
    expect(spec.visualDirection.composition).toBe('image-led');
    expect(spec.mediaUsage).toEqual([{ assetId: 'i1', role: 'hero' }, { assetId: 'i2', role: 'gallery' }]);
  });
});

describe('spec validation', () => {
  const good = () => JSON.parse(JSON.stringify(buildDesignSpec(CASES.restaurant)));
  const errorsFor = (mutate) => { const s = good(); mutate(s); return validateDesignSpec(s).errors.join(' | '); };
  it('rejects illegible palettes', () => expect(errorsFor((s) => { s.palette.text = s.palette.background; })).toMatch(/contrast/));
  it('rejects non-hex colours, unknown styles and bad enums', () => {
    expect(errorsFor((s) => { s.palette.accent = 'tomato'; })).toMatch(/palette.accent/);
    expect(errorsFor((s) => { s.visualDirection.style = 'vaporwave'; })).toMatch(/not a known style/);
    expect(errorsFor((s) => { s.visualDirection.density = 'huge'; })).toMatch(/density/);
  });
  it('rejects unapproved fonts and missing fallbacks', () => {
    expect(errorsFor((s) => { s.typography.heading.family = 'Comic Sans MS'; })).toMatch(/approved family/);
    expect(errorsFor((s) => { s.typography.body.stack = "'Inter'"; })).toMatch(/fallback/);
  });
  it('rejects the generic template, duplicate ids and unknown components', () => {
    expect(errorsFor((s) => { s.layout.pageStructure = [{ id: 'a', component: 'navigation', variant: 'x' }, { id: 'b', component: 'hero', variant: 'x' }, { id: 'c', component: 'features', variant: 'x' }, { id: 'd', component: 'testimonials', variant: 'x' }, { id: 'e', component: 'footer', variant: 'x' }]; s.components = ['navigation', 'hero', 'features', 'testimonials', 'footer']; })).toMatch(/generic/);
    expect(errorsFor((s) => { s.layout.pageStructure[1].id = s.layout.pageStructure[0].id; })).toMatch(/unique/);
    expect(errorsFor((s) => { s.layout.pageStructure[2].component = 'carousel-of-doom'; })).toMatch(/vocabulary/);
  });
  it('rejects specs that allow invented content or weaken quality floors', () => {
    expect(errorsFor((s) => { s.contentRules.noInventedTestimonials = false; })).toMatch(/invented/);
    expect(errorsFor((s) => { s.qualityRequirements.keyboardAccessible = false; })).toMatch(/keyboardAccessible/);
    expect(errorsFor((s) => { s.mediaUsage = [{ assetId: 'https://x/y.png' }]; })).toMatch(/asset ids only/);
  });
  it('rejects non-objects', () => expect(validateDesignSpec(null).ok).toBe(false));
  it('component vocabulary covers every archetype', () => {
    for (const arch of Object.values(ARCHETYPES)) for (const v of arch.variants) for (const s of v.structure) expect(COMPONENTS).toContain(s.component);
  });
});

describe('design system floor', () => {
  it('resets illegible model colours and leaves good ones alone', () => {
    const spec = buildDesignSpec(CASES.restaurant);
    const bad = { colors: { text: '#222222', background: '#252525' } };
    expect(enforceDesignSystemFloor(bad, spec)).toHaveLength(1);
    expect(bad.colors.text).toBe(spec.palette.text);
    const fine = { colors: { text: '#ffffff', background: '#000000' } };
    expect(enforceDesignSystemFloor(fine, spec)).toEqual([]);
    expect(fine.colors.background).toBe('#000000');
    expect(enforceDesignSystemFloor({ colors: { text: 'rgb(1,1,1)' } }, spec)).toEqual([]);
    expect(enforceDesignSystemFloor(null, spec)).toEqual([]);
  });
});

describe('motion plan and interactivity', () => {
  const spec = (animations, style) => buildDesignSpec({ websiteType: 'cafe', preferences: { animations, style } });
  it('maps intensity to concrete, buildable behaviour', () => {
    for (const [pref, level] of [['subtle', 'subtle'], ['scroll', 'moderate'], ['parallax', 'expressive']]) {
      const s = spec(pref);
      expect(s.motionPlan.level).toBe(level);
      expect(s.motionPlan.scroll).toContain('reveal-once');
      expect(s.motionPlan.durationMs).toBeGreaterThanOrEqual(150);
      expect(s.motionPlan.reducedMotion).toBe('remove-movement-keep-state-changes');
    }
    expect(spec('parallax').motionPlan.scroll).toContain('hero-media-parallax');
    expect(spec('none').motionPlan).toMatchObject({ level: 'none', scroll: [] });
  });
  it('defaults to visible motion when the user did not choose, and gives each style a signature', () => {
    expect(buildDesignSpec({ websiteType: 'saas' }).motionPlan.level).not.toBe('none');
    expect(spec(undefined, 'glass').motionPlan.signature).toBe('blur-and-glow-on-hover');
    expect(spec(undefined, 'brutalist').motionPlan.signature).toBe('hard-offset-shadow-press');
  });
  it('exposes section ids as anchor targets and requires functional controls', () => {
    const s = buildDesignSpec(CASES.restaurant);
    expect(s.interactivity.sectionIds).toEqual(s.layout.pageStructure.map((x) => x.id));
    expect(s.interactivity.everyControlFunctional).toBe(true);
  });
  it('validator rejects inconsistent motion or interactivity', () => {
    const base = () => JSON.parse(JSON.stringify(buildDesignSpec(CASES.restaurant)));
    let s = base(); s.motionPlan.level = 'expressive'; expect(validateDesignSpec(s).errors.join()).toMatch(/motionPlan.level/);
    s = base(); s.motionPlan.hover = []; expect(validateDesignSpec(s).errors.join()).toMatch(/motionPlan needs/);
    s = base(); s.interactivity.everyControlFunctional = false; expect(validateDesignSpec(s).errors.join()).toMatch(/everyControlFunctional/);
    s = base(); s.interactivity.sectionIds = ['x']; expect(validateDesignSpec(s).errors.join()).toMatch(/sectionIds/);
  });
});
