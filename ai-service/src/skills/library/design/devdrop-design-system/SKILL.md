# DevDrop Design System

DevDrop-authored guidance. The structured `designSpec` supplied with the task is binding; this skill explains how to apply it.

## Spec first
The designSpec fixes style, theme, palette, typography, page structure, components and quality requirements. Use its values verbatim. Creative freedom lives inside those limits: composition, proportion, imagery treatment and micro-detail.

## Design tokens
Declare palette, type scale, spacing, radius and shadow as CSS custom properties once (for example in an index.css imported by main.jsx) and reference them everywhere. Never scatter raw hex values through components.

## Spacing and layout
Use one spacing scale on a 4px base. Keep section padding consistent per breakpoint. Cap reading width near 65ch and page width at the spec's maxWidth. Use CSS grid or flex; never fixed page widths.

## Page structure follows purpose
Build sections in the order the spec's pageStructure gives. Do not fall back to a centered hero, three feature cards, testimonials and footer unless the spec lists exactly that. Each section earns its place by serving the site's main job.

## Component reuse
Create a component once when the same pattern appears twice (button, card, section header, form field). Components take props rather than copying markup. Keep data (menu items, projects, products) in data files so layout and content stay separate.

## Honest content
Use only facts present in requirements.userData. Where content is missing, write neutral, clearly generic copy or omit the block. Never invent testimonials, awards, statistics, prices, addresses, client names or biographies.

## Responsive behavior
Design mobile first. Verify the composition at 320, 375, 430, 768 and desktop widths: stacking order, type scale with clamp(), tappable targets of about 44px, navigation collapse, no horizontal overflow.

## Motion
Match the spec's motionIntensity. Animate transform and opacity only. Provide a prefers-reduced-motion path for every animation. Motion supports hierarchy; it never blocks content or focus.

## States
Interactive features need visible hover, focus-visible, active and disabled states. Lists and forms need empty, loading, error and success states where data can be absent or an action can fail.
