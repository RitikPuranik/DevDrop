# AI Studio Reference-Driven Preview v3

The preview was rebuilt from the supplied master style-reference archive. The archive contains one reference ZIP for each Vibe & Style. The visual system was interpreted style-by-style, starting with Simple/Minimal and then applied independently to the remaining styles.

Covered styles:
Simple/Minimal, Modern, Bold, Editorial, Creative, Glassmorphism, Claymorphism, Neo-Brutalist, Brutalism, Cyberpunk, Neumorphism, Bento Grid, Retro/Y2K, Luxury, Corporate, Organic/Soft, Retrofuturism, Maximalist Collage.

Website type remains a first-class input. The page changes content language and card roles for Portfolio, E-commerce, Blog, Landing Page, Cafe, Hotel, and Studio.

Key reconstruction rules:
- Use the style reference's actual composition language, not only its colors.
- Hero uses a full-size layout with a dedicated art system per style, never tiny generic placeholder blocks.
- Each style has distinct navigation, hero, stats, content modules, CTA, and footer treatment.
- Glassmorphism is a dedicated layered translucent scene with blurred ambient orbs and frosted surfaces.
- Soft/Clay/Neumorphism styles use separate surface/lighting systems. They are not merged.
- Brutalism and Neo-Brutalism are separate systems: raw structural editorial vs thick outlined hard-shadow UI.
- Cyberpunk and Retrofuturism are separate systems: HUD/terminal dark interface vs optimistic future-retro orbital composition.
- Bento and Maximalist are separate systems: modular tile hierarchy vs dense art-directed collage.

Bug fix:
The previous `WebsiteModules` implementation referenced an undefined `borderRadius` variable. The new implementation has no such free variable and does not reference `cfg.base`.
## Theme wiring fix

The live preview now consumes `design.theme` as an independent visual layer. Dark, Light, Neutral, Midnight, Warm Cream, and Auto themes update the preview canvas, readable surfaces, borders, navigation, sections, and final CTA while preserving the selected style identity. `Auto` follows `prefers-color-scheme`.

The old preview crash paths were also removed: `WebsiteModules` no longer references a free `borderRadius` variable, and `Page` uses `themedBase.font` instead of the stale `base.font` reference.
