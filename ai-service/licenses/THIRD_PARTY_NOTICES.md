# Third-party notices for the DevDrop skill library

The files below are bundled in `src/skills/library/`. Full license texts are stored next to this file under `licenses/third-party/<skill-id>/`. Each bundled file is pinned by sha256 in `src/skills/manifest.json`. See `docs/SKILL_LICENSES.md` for the checks that were performed and their limits.

## frontend-design
- Source: https://github.com/anthropics/skills, path `skills/frontend-design/SKILL.md`, commit `dbd4588f9e1033efb41dad4bef2f7947c8993d44`
- License: Apache License 2.0. Text: `licenses/third-party/frontend-design/LICENSE.txt` (copied unmodified from the skill's own `LICENSE.txt`).
- Modifications: none. `src/skills/library/design/frontend-design/SKILL.md` is byte-identical to the upstream file (sha256 `d91970639e9f5c37682ac7ab60094d35f1c7c1f38d731bd56396563aee10c1d3`).
- The upstream skill directory contains no separate NOTICE file and the license text names no copyright holder.

## web-design-guidelines (Web Interface Guidelines)
- Source: https://github.com/vercel-labs/web-interface-guidelines, file `command.md`, commit `434b7f91364665f2f733b310ec54809bf8f37937`
- License: MIT. Copyright (c) 2025 Vercel Labs. Text: `licenses/third-party/web-design-guidelines/LICENSE`.
- Modifications (this is a modified copy): removed review-command frontmatter and preamble; removed the "Output Format" section; removed the SSR-only "Hydration Safety" section; removed two library-specific phrases; added a DevDrop header and a short build-time usage paragraph. Upstream sha256 `d246b026f4f29b5823a9cc857f9edf3d2507002e055e32040cadeaf3b38e0234`; adapted file sha256 recorded in the manifest.

## vercel-react-best-practices (license declared, not verified; gated)
- Source: https://github.com/vercel-labs/agent-skills, `skills/react-best-practices/rules/` (48 files listed in the manifest), commit `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62`.
- Upstream declares MIT but ships no LICENSE file or copyright holder. See `licenses/third-party/vercel-react-best-practices/NOTICE.md`. Loaded only with `AI_SKILLS_ALLOW_UNVERIFIED_LICENSES=true`.
- Modifications: frontmatter removed, 12 rules omitted, rules concatenated under a DevDrop header.

## ui-ux-pro-max (category reasoning; gated)
- Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill, `src/ui-ux-pro-max/data/ui-reasoning.csv`, commit `28b3b8dee8c976df4fa3e94aed4e092ad43fcb03`.
- License: MIT, Copyright (c) 2024 Next Level Builder. Text: `licenses/third-party/ui-ux-pro-max/LICENSE`. Dataset-level provenance upstream is partial (see `docs/SKILL_LICENSES.md`), so it is gated behind `AI_SKILLS_ALLOW_UNVERIFIED_LICENSES=true`.
- Modifications: CSV converted to Markdown; Decision_Rules, Reasoning and Confidence columns omitted. Upstream file sha256 recorded in the manifest.

All other skills in the library are original DevDrop-authored text (see `docs/SKILL_LICENSES.md`).


# Vendored UI components (Component Intelligence catalog)

Source files in `src/components/catalog/sources/` are derived from the repositories below at the pinned commits. Full license texts: `src/components/catalog/licenses/<library>.txt`. Every record in `src/components/catalog/index.json` lists the exact upstream file, commit, sha256 of upstream and stored files, and each mechanical modification. Generated websites that include any of these components receive their own `/THIRD_PARTY_NOTICES.md` with the full license text.

## cult-ui
- Repository: https://github.com/nolly-studio/cult-ui @ `d71b1428b811c2779d46ea41b7ef8c9f9c9991c2`
- License: MIT (Copyright (c) 2023 Jordan-Gilliam)
- Components: bg-animate-button [verified], bg-animated-gradient [verified], code-block [verified], copy-button [pending-verification], cosmic-button [pending-verification], cutout-card [pending-verification], direction-aware-tabs [verified], distorted-glass [verified], dock [verified], edge-blur [verified], expandable [verified], family-button [verified], floating-panel [verified], fluted-glass [pending-verification], folded-card [pending-verification], gradient-heading [verified], halo-badge [pending-verification], lightboard [verified], minimal-card [pending-verification], shift-card [verified], text-gif [pending-verification]
- Modifications: TypeScript->JavaScript (esbuild), path-alias rewrites, framer-motion->motion/react, provenance header added; recorded per component.

## magicui
- Repository: https://github.com/magicuidesign/magicui @ `efe76fc5755eca1142dd4f74c1d6f0ace2887e3c`
- License: MIT (Copyright (c) Magic UI)
- Components: animated-gradient-text [verified], animated-shiny-text [verified], blur-fade [verified], border-beam [verified], dot-pattern [verified], magic-card [pending-verification], marquee [verified], meteors [verified], number-ticker [verified], orbiting-circles [verified], retro-grid [verified], ripple [verified], scroll-progress [verified], shimmer-button [verified], text-reveal [verified], typing-animation [verified], word-rotate [verified]
- Modifications: TypeScript->JavaScript (esbuild), path-alias rewrites, framer-motion->motion/react, provenance header added; recorded per component.

## motion-primitives
- Repository: https://github.com/ibelick/motion-primitives @ `120f64f6ca60348e251f929e9c81f11ccbe45eda`
- License: MIT (Copyright (c) 2024 ibelick). Note: trailing non-license text ignored: "app/page.tsx"
- Components: animated-group [verified], border-trail [verified], glow-effect [verified], infinite-slider [verified], magnetic [verified], scroll-progress [verified], spotlight [verified], text-effect [verified], text-loop [verified], text-scramble [verified], text-shimmer [verified], tilt [verified]
- Modifications: TypeScript->JavaScript (esbuild), path-alias rewrites, framer-motion->motion/react, provenance header added; recorded per component.

## origin-ui
- Repository: https://github.com/origin-space/originui @ `890a79a5368b3cdebbdd860aa1908f2843fd7ddc`
- License: MIT (Copyright (c) 2025 coss.com; Originally Copyright (c) 2025 Origin UI)
- Components: accordion [verified], avatar [verified], badge [verified], button [verified], checkbox [verified], input [verified], progress [verified], switch [verified], tabs [verified], textarea [verified], tooltip [verified]
- Modifications: TypeScript->JavaScript (esbuild), path-alias rewrites, framer-motion->motion/react, provenance header added; recorded per component.

## react-bits
- Repository: https://github.com/DavidHDev/react-bits @ `e12c22192ac7b4b452c5e2feb9b586d74765d696`
- License: LicenseRef-MIT-Commons-Clause (Copyright (c) 2026 David Haz). **Restriction:** Commons Clause: the components themselves may not be sold, sublicensed or redistributed (alone, in a bundle or as a ported version). Use inside an application, website or product is permitted.
- Components: glare-hover [restricted]
- Modifications: TypeScript->JavaScript (esbuild), path-alias rewrites, framer-motion->motion/react, provenance header added; recorded per component.

## shadcn
- Repository: https://github.com/shadcn-ui/ui @ `b8d7baa15b1dca5716f13153e63795fc3d741f6b`
- License: MIT (Copyright (c) 2023 shadcn)
- Components: accordion [verified], card [verified]
- Modifications: TypeScript->JavaScript (esbuild), path-alias rewrites, framer-motion->motion/react, provenance header added; recorded per component.
