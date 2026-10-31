# Component Intelligence

Extends the existing ai-service pipeline (no second pipeline). The design decides; the catalog offers possibilities; the code agent adapts; validation checks.

```
requirements -> designSpec (no model) -> design agent
      -> [A/B done by existing stages]
      -> discovery (queries built from the design)  -> curation agent (use | restyle | restructure | combine | inspire | custom)
      -> architecture (receives a compact plan; system adds component file contracts + imports)
      -> code:<file> (vendored components generated FIRST; the agent gets the real source + full latitude)
      -> integration -> finalize (re-inject license headers, notices, cn util) -> static validation -> build -> quality + component review
```
Planning is not a separate reported stage (stage names are a frontend contract). It is reported in `generationMeta.components`. Any failure means "no library components" and the old behaviour.

## Modules (`src/components/`)
| file | role |
|---|---|
| `catalog/sources.json` | declarative source definitions (repo, **pinned commit**, license path, files). Add a library by adding an entry. |
| `ingest.js`, `scripts/ingestComponents.js` | separate ingestion job: reads a pinned checkout, detects the license from the license file, transforms TSX to JSX, classifies, verifies, writes records. Never installs packages or runs upstream scripts. `--fetch` shallow-clones the pinned commit with git only. |
| `catalog/index.json`, `catalog/sources/**` | one record per **component** + vendored source (sha256 recorded and re-verified on every read). |
| `licenseDetector.js`, `licensePolicy.js` | license fingerprinting + per-distribution-mode permissions; eligibility = lifecycle `verified`/`restricted` AND every required mode `allowed`. |
| `dependencyPolicy.json`, `dependencyResolver.js` | vetted-package allowlist, alias normalisation (`framer-motion` -> `motion`), one engine per family, reuse of installed deps, heavy/new-dependency budgets. |
| `search.js` | structured filters + BM25 (weighted fields) + character-trigram cosine + concept expansion, fused with RRF. Embedder pluggable (`options.embedder`), not required. |
| `discovery.js`, `curation.js`, `agents/componentCuration.agent.js` | design-driven queries; model picks per section; validator rejects invented ids, enforces budgets, turns unsatisfiable picks into `custom`. |
| `composition.js`, `provenance.js`, `review.js` | architecture wiring + agent briefs; header re-injection, similarity, `/THIRD_PARTY_NOTICES.md`; deterministic review. |

## Lifecycle and permissions
Lifecycle: discovered, pending-verification, verified, restricted, rejected, deprecated. Verification is per component: license text fingerprint at the pinned commit, per-file license header check, dependency policy, external asset scan, sibling-import check. A repository-level MIT never verifies anything by itself. `verified` requires all five modes `allowed`; a verified license with any non-allowed mode is `restricted`.
Modes: `devdropInternal`, `deployedWebsites`, `sourceCodeExport`, `templateResale`, `componentRedistribution`. Jobs require `AI_COMPONENTS_DISTRIBUTION_MODES` (default `deployedWebsites,sourceCodeExport`) or `input.distribution`. Add `templateResale` for marketplace listings.

## Seed catalog (real, pinned)
64 components from Magic UI, Motion Primitives, React Bits, shadcn/ui, Cult UI and Origin UI: 54 verified, 1 restricted, 9 pending with recorded reasons. All 55 components eligible for deployed sites build in a real Vite production build (`npm run components:verify`).
React Bits is **MIT + Commons Clause** (components may not be resold or redistributed): `deployedWebsites` allowed, `sourceCodeExport` conditional, `templateResale`/`componentRedistribution` denied. That mapping is DevDrop's reading of the license text, not legal advice; have counsel confirm before enabling `AI_COMPONENTS_ALLOW_CONDITIONAL`.
Pending (fix = vet the package or catalogue the sibling, then re-ingest): `next` imports (Cult UI minimal-card, folded-card, cutout-card, text-gif), `next-themes` (magic-card), external asset URLs needing separate review (cosmic-button, fluted-glass, text-gif), uncatalogued siblings (copy-button, halo-badge).

## Library review outcomes
| library | license (read from the repo) | outcome |
|---|---|---|
| Cult UI | MIT | 21 ingested, 13 verified |
| Origin UI (coss) | MIT (two copyright lines, both kept) | 11 primitives ingested and verified. Its ~600 `comp-*` demo blocks are not ingested: they depend on sibling components through URL registry references |
| Mantine | MIT | **not vendored**: a package ecosystem (styles API, hooks, theme provider). One file cannot be lifted out; installing it for one component breaks the dependency budget |
| Material UI | MIT | **not vendored**, same reason (emotion + `@mui/*` internals) |
| HeroUI | Apache-2.0 | **not vendored**: package monorepo (`@heroui/*`, tailwind-variants). The Apache text also needs NOTICE/state-changes handling that the detector does not yet implement |
| Aceternity UI | no public source repository found | **not ingested**. Its components are distributed through its own site/CLI, with free and paid tiers; the terms need a manual review before any ingestion |
Vetted npm packages (MIT on npm, ranges in `dependencyPolicy.json`): `radix-ui`, `react-use-measure`, `border-beam` were added in this pass.

## Adaptation
The code agent receives `componentBrief`: original source, the curation agent's directives, designSpec tokens and an explicit statement that colors, size, proportions, spacing, radius, shadows, typography, markup, props, animation logic/timing/easing, hover and responsive behavior may all change, parts may be removed or merged, or the whole thing rewritten. Fixed rules: keep the provenance comment, JavaScript/JSX only, declared dependencies only, reduced motion, existing a11y behavior. The system, not the model, restores a stripped header (after generation, integration and every repair round), computes how far each file diverged from upstream, and flags `restyle`/`restructure` results that are still nearly identical to the demo. `inspire` gets no header unless the output is mostly upstream code.

## Operations
`npm run components:ingest -- --repo-dir magicui=/path ...` (or `--fetch`), `npm run components:verify` (integrity + real `npm install` and `vite build` of every eligible component), `npm test`. Startup logs catalog integrity; a failure disables library components only. Env: see `.env.example`.

## Limits (be aware)
- No browser was available where this was built, so rendering was verified by server-rendering adapted components to HTML and by real Vite production builds, not by screenshots. The existing Playwright runtime check still runs in the production image. A model-based visual review is not implemented.
- Search is lexical plus n-gram similarity, not neural embeddings; with 32 components that is adequate, at thousands you should plug in an embedder.
- Continuous discovery is the ingestion job plus declarative sources; there is no crawler that finds new repositories by itself, so new sources are added by a person who then reviews the license.
- `debugWebsite` and the incremental edit pipeline do not carry the plan; edits that strip a header are not auto-repaired there yet.
- See "Library review outcomes" for what was and was not ingested. Radix/Motion/GSAP/Lucide/Recharts/Embla/R3F are npm dependencies on the allowlist, not vendored sources.
