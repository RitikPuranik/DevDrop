# Motion and Interaction (DevDrop original)

Makes generated sites feel alive without extra dependencies. Follow designSpec.motionPlan for intensity; this skill shows how to build it with plain React, CSS and the browser.

## Every control must work
Each button, link and form does something real with the data on the page. Never output a control with no behaviour.
- Navigation link: href="#section-id" where an element with that exact id exists (use designSpec.layout.pageStructure ids as section ids), or router link.
- "Learn more" / "Explore" / "View work": scroll to the matching section with scrollIntoView({ behavior: "smooth" }) or expand a detail panel.
- "Book", "Reserve", "Contact", "Get started": open an inline form or modal built in the page; validate, show success and error states. Without a backend, state clearly what happens (opens an email draft with mailto:, or shows a confirmation).
- "Add to cart", "Filter", "Sort", "Search": update real state (cart count and totals, filtered list, empty state).
- Tabs, accordions, carousels, menus, theme toggles: real state with aria-selected, aria-expanded and keyboard support.
- If a control cannot be made real from the supplied content, remove it. Never leave href="#" or an empty onClick.

## Entrance and scroll reveal
Use one small shared hook for reveal-on-scroll and apply it to sections and cards, with a stagger index.
```
import { useEffect, useRef, useState } from "react";
export default function useReveal(options = { threshold: 0.15 }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") { setShown(true); return undefined; }
    const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setShown(true); io.disconnect(); } }, options);
    io.observe(node);
    return () => io.disconnect();
  }, []);
  return [ref, shown];
}
```
Pair it with CSS: hidden state opacity 0 and translateY(16px); shown state opacity 1 and translateY(0); transition 500ms cubic-bezier(0.22, 1, 0.36, 1); delay = index * 80ms.

## Micro-interactions
- Buttons and cards: hover lift (translateY -2px) with a deeper shadow, active press (scale 0.97), visible focus-visible ring, 150-250ms transitions.
- Links: animated underline using a pseudo-element and transform scaleX.
- Images: slow zoom on hover inside an overflow-hidden frame.
- Navigation: shrinks or gains a background after scrolling; mobile menu slides and fades; current section highlighted from scroll position.
- Counters, progress bars and number tickers animate once when revealed, only for figures that were supplied.
- Inputs: floating labels or animated borders; inline validation messages fade in.

## Higher intensity
Moderate: staggered grid reveals, sticky header transitions, tab and accordion height transitions, hover-driven image swaps.
Expressive: hero media parallax using transform from a scroll listener throttled with requestAnimationFrame, marquee strips, headline word-by-word reveal, magnetic buttons, page-load sequence. Keep content readable and never block interaction while animating.

## Performance and accessibility
Animate only transform and opacity. Avoid layout-thrashing scroll handlers and transition: all. Wrap non-essential animation in a prefers-reduced-motion media query that removes movement but keeps state changes visible. Never hide content permanently if JavaScript or IntersectionObserver is unavailable.

## Structure
Put the hook in /hooks/useReveal.js and a small Reveal wrapper in /components/Reveal.js when motion is on, then reuse them. Declare animation keyframes and motion tokens once in the main stylesheet using CSS custom properties for duration and easing.
