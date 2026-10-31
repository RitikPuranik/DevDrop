'use strict';
// Derives searchable metadata from the actual source text + upstream description. Heuristic and replaceable; it never
// decides eligibility (license/lifecycle do).
const has = (code, re) => re.test(code);
function classify({ name, description = '', code, deps = {} }) {
  const text = `${name} ${description}`.toLowerCase();
  const caps = new Set();
  if (has(code, /\bmotion\.|useSpring|useTransform|animate\(|animate-|animation|keyframes|@keyframes|gsap|transition|setInterval|requestAnimationFrame|useAnimation|AnimatePresence/i)) caps.add('animation');
  if (has(code, /onMouse|onPointer|onClick|onHover|whileHover|mousemove|pointermove/i)) caps.add('interaction');
  if (has(code, /mousemove|pointermove|useMotionValue|clientX/i)) caps.add('pointer-tracking');
  if (has(code, /useScroll|IntersectionObserver|useInView|scrollTop|ScrollTrigger/i)) caps.add('scroll-linked');
  if (has(code, /canvas|WebGL|three|ogl/i) || deps.three || deps.ogl) caps.add('webgl');
  if (has(code, /\b(sm|md|lg):|clamp\(|min\(|max-w-|grid-cols|flex-wrap/)) caps.add('responsive');
  if (has(code, /aria-|role=|<button|tabIndex|onKeyDown/)) caps.add('accessible-markup');
  if (has(code, /prefers-reduced-motion|useReducedMotion|reducedMotion|motion-reduce/)) caps.add('reduced-motion-aware');
  if (has(code, /children/) ) caps.add('composable');
  const chars = new Set();
  if (/glow|shimmer|shine|spotlight|beam|gradient|aurora|neon/.test(text) || has(code, /blur-|drop-shadow|radial-gradient/)) chars.add('expressive');
  if (/minimal|simple|subtle|clean|text-?(?:effect|loop)|fade/.test(text)) chars.add('subtle');
  if (/glass|blur/.test(text) || has(code, /backdrop-blur/)) chars.add('glassy');
  if (/grid|retro|pixel|scramble|terminal|cyber/.test(text)) chars.add('technical');
  if (/3d|tilt|depth|parallax|orbit/.test(text)) chars.add('dimensional');
  if (/marquee|slider|carousel|ticker|loop/.test(text)) chars.add('kinetic');
  if (/accordion|dialog|disclosure|tabs|card/.test(text)) chars.add('structural');
  if (!chars.size) chars.add('neutral');
  const rules = [[/marquee|slider|carousel|ticker|logo ?loop/, 'marquee-carousel'], [/text|type|word|scramble|reveal|split|typing|counter|count|number/, 'text-animation'], [/background|pattern|grid|aurora|meteor|ripple|beam|noise|particles/, 'background-effect'], [/card|tilt|spotlight|glare|magic/, 'interactive-card'], [/button|cta|magnet/, 'interactive-control'], [/accordion|disclosure|faq|collapsible/, 'disclosure'], [/dock|nav|menu|toolbar/, 'navigation'], [/scroll|progress/, 'scroll-feedback'], [/dialog|modal|popover|drawer/, 'overlay'], [/in-?view|group|blur-?fade|fade|animated-content|reveal/, 'entrance-animation'], [/cursor|trail|click|sparkle/, 'cursor-effect']];
  const category = (rules.find(([re]) => re.test(text)) || [null, 'misc'])[1];
  const tags = [...new Set(text.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3))].slice(0, 14);
  return { category, capabilities: [...caps], designCharacteristics: [...chars], tags, usesMotion: caps.has('animation'), weightBytes: Buffer.byteLength(code) };
}
module.exports = { classify };
