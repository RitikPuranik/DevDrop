const { callGemini } = require('../services/llm.service');
const SYSTEM = `You are the Component Curation Agent. The design is already decided (designSystem + designSpec). For every page section you receive a short list of CANDIDATE components from a verified catalog. Candidates are possibilities, never obligations: the design decides, components never dictate the design. For each section choose exactly one decision:
- "custom": build it from scratch. This is correct whenever no candidate truly fits the section's purpose and the design's personality. Prefer it over a poor match. A site with few or zero library components is fine.
- "use": use the candidate with minimal changes (only when it already matches the design).
- "restyle": keep the logic, restyle it (colors, type, radius, spacing, shadows, timing, easing, proportions) to the design system.
- "restructure": change its markup/layout/animation logic substantially.
- "combine": merge 2-3 candidates (componentIds) into one new component.
- "inspire": do not copy code; use the technique as inspiration for a custom implementation.
Rules: componentIds MUST come from that section's candidates (or the global list). Never pick a component only to add a library. Respect motion intensity and reduced motion; do not stack several attention-grabbing effects; the whole site must read as one product. Never choose by website category habit; justify every choice from the design. "adaptation" lists concrete changes to make (e.g. "drop the blue glow; use palette.accent at 12% opacity", "reduce padding to 12px 16px", "ease: cubic-bezier(.2,.8,.2,1) 420ms"). Return JSON only: {decisions:[{sectionId,decision,componentIds:[],rationale,adaptation:[]}]}. Use sectionId "global" only for an accent from the global candidate list. Omit sections that need no decision.`;
async function run({ design, designSpec, discovery, limits }) {
  const sections = discovery.sections.filter((s) => s.candidates.length).map((s) => ({ sectionId: s.sectionId, component: s.component, variant: s.variant, purpose: s.purpose, candidates: s.candidates }));
  return callGemini({ system: SYSTEM, input: { designSystem: design?.designSystem, visualDirection: designSpec?.visualDirection, palette: designSpec?.palette, typography: designSpec?.typography, interactions: designSpec?.interactions, allSections: discovery.sections.map((s) => ({ sectionId: s.sectionId, component: s.component, variant: s.variant, purpose: s.purpose })), sections, global: discovery.global, limits } });
}
module.exports = { run };
