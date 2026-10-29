# Skill licenses and provenance

Date of checks: 2026-10-28. This document records the checks that were actually performed. It is not legal advice and makes no legal guarantee; have counsel review before relying on it commercially.

## Status summary

| Skill id | Origin | Decision | License | Pinned commit | Modified |
|---|---|---|---|---|---|
| `frontend-design` | anthropics/skills | **Verified third-party, bundled** | Apache-2.0 | `dbd4588f9e1033efb41dad4bef2f7947c8993d44` | No (byte-identical) |
| `web-design-guidelines` | vercel-labs/web-interface-guidelines | **Verified third-party, bundled (adapted)** | MIT, Copyright (c) 2025 Vercel Labs | `434b7f91364665f2f733b310ec54809bf8f37937` | Yes (listed below) |
| `vercel-react-best-practices` | vercel-labs/agent-skills | **Bundled, gated (license declared, not verified)** | MIT declared; no LICENSE file or copyright holder upstream | `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62` | Yes: 48 of 60 client-side rules selected |
| `ui-ux-pro-max` | nextlevelbuilder/ui-ux-pro-max-skill | **Bundled, gated (license declared, dataset provenance partial)** | MIT, Copyright (c) 2024 Next Level Builder | `28b3b8dee8c976df4fa3e94aed4e092ad43fcb03` | Yes: one CSV converted to Markdown |
| `react-best-practices` | DevDrop original | Internal; used when the Vercel selection is off | DevDrop project license | n/a | n/a |
| `ui-ux-intelligence` | DevDrop original | Internal; complements UI UX Pro Max | DevDrop project license | n/a | n/a |
| `devdrop-design-system`, `requirements-fidelity`, `framework-compatibility`, `accessibility-review`, `generated-code-safety` | DevDrop original | Internal | DevDrop project license | n/a | n/a |
| vercel-labs/agent-skills `web-design-guidelines` wrapper | external | **Rejected** (runtime fetch) | Declared MIT | `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62` | n/a |

"DevDrop original" content was written for this project; no text was copied from the candidates. Its license is the repository license (MIT, see root `LICENSE`).

## Candidate details

### A. Anthropic frontend-design - approved
- Path: `skills/frontend-design/` (files: `SKILL.md`, `LICENSE.txt`). Repo HEAD checked: `dbd4588f...` (committed 2026-10-09).
- License evidence: `LICENSE.txt` inside the skill directory is the Apache License 2.0 text; the SKILL.md frontmatter says "Complete terms in LICENSE.txt". The repository README does not state a repository-wide license, so the approval rests on the skill-level file. The repository's `THIRD_PARTY_NOTICES.md` concerns other components (for example GPL-licensed items for other skills) and does not mention frontend-design; none of that material is used.
- Content review: single Markdown file, no scripts, no URLs, no fonts or assets. Screened by DevDrop's content validator (no override, tool-grant, fetch or secret patterns).
- Notices: Apache-2.0 text kept at `licenses/third-party/frontend-design/LICENSE.txt`; attribution in `licenses/THIRD_PARTY_NOTICES.md`. No NOTICE file exists upstream. Not modified, so no change statement is needed.
- Concern: written for interactive design sessions (asks the client to confirm, suggests screenshots and memory). DevDrop's trusted platform rules make it non-interactive and the designSpec overrides it.
- Maintenance (from the git history of the clone): 60 commits, 17 distinct author emails, last commit 2026-10-09.

### B. UI UX Pro Max - bundled but gated off by default (license declared, provenance partial)
- Repository code is MIT, `Copyright (c) 2024 Next Level Builder`.
- What is bundled: only `ui-reasoning.csv` (192 category rows), converted to Markdown without the Decision_Rules, Reasoning and Confidence columns. The other ~34 datasets, Python scripts, font data and templates were not copied. It loads only with `AI_SKILLS_ALLOW_UNVERIFIED_LICENSES=true`, and then competes for the design stage's budget with the other design skills.
- Why it is gated: the value is in ~35 CSV datasets (styles, palettes, products, typography, reasoning). The repository's own `data-provenance.json` covers a subset of rows (51 reasoning records), many typed "derived" or marked `needs-review`, and its Google Fonts license file lists 8 unresolved families. There is no per-dataset statement that the underlying rows are free of third-party restrictions. The original brief says unclear licensing should not be copied; this was bundled at the project owner's explicit instruction, with the risk recorded and the skill off by default.
- The original `ui-ux-intelligence` skill and the design-intelligence engine (`src/design/`) remain, written independently from general UX principles. Font families in the engine's allowlist were cross-checked against the OFL entries in that repository's snapshot of the `google/fonts` metadata (revision `038b637da7b3fd956a4ed93ffc607c3d5e4ce172`). That is a secondhand check; DevDrop does not redistribute font files.
- Maintenance (git history): 285 commits, 110 distinct author emails, last commit 2026-10-26. Popularity was not used as a criterion.

### C. Vercel react-best-practices - bundled but gated off by default (pending legal review)
- The repository README ends with "## License / MIT" and the skill's frontmatter says `license: MIT`, but there is no LICENSE file and no copyright-holder line anywhere in the repository (the only LICENSE files in git history belong to vendored `node_modules`). The MIT notice that must accompany copies therefore cannot be preserved accurately.
- About 10 of its 72 rules mention Next.js or server-only APIs, which DevDrop's React + Vite pipeline would filter anyway.
- What is bundled: 48 rules from `skills/react-best-practices/rules/` (async, bundle, client, js, rendering, rerender, advanced), concatenated with frontmatter removed. Twelve rules that are server, Next.js, SSR/hydration or SWR specific were omitted; the 60 server-only rules were never considered. Sections that still use TypeScript examples are filtered out at prompt time. Because there is no upstream license text, `licenses/third-party/vercel-react-best-practices/NOTICE.md` records the gap instead of an MIT notice.
- Gating: loads only with `AI_SKILLS_ALLOW_UNVERIFIED_LICENSES=true`; when enabled it replaces the original `react-best-practices` for code, edit and debug. Re-evaluate if upstream adds a LICENSE file (update the status to `verified`).

### D. Vercel web-design-guidelines - rules adopted from the source repository, wrapper rejected
- The skill in `vercel-labs/agent-skills` instructs the agent to fetch rules from a URL at review time. DevDrop forbids runtime fetches, so the wrapper was not used.
- The rules live in `vercel-labs/web-interface-guidelines` (`command.md`), which has a LICENSE file: MIT, `Copyright (c) 2025 Vercel Labs`. That file is bundled at the pinned commit with the changes listed in `licenses/THIRD_PARTY_NOTICES.md`.
- Maintenance (git history): 60 commits, 13 distinct author emails, last commit 2026-10-05.

## What was not verified
- **Stars, forks and security advisories:** the GitHub API returned rate-limit errors for unauthenticated requests, so no star/fork counts or advisory lists were retrieved and none are claimed. `ui-ux-pro-max-skill` has a `SECURITY.md` describing private reporting; the other repositories had none. Absence of a published advisory has not been established.
- **No security audit** of any upstream repository was performed. DevDrop's controls (pinned hashes, text-only loading, content screening, trusted platform rules) are described in `SKILLS_ARCHITECTURE.md`.
- **Legal conclusions** about Apache-2.0/MIT compatibility with a commercial product were not made; only the presence and text of license files was checked.
- Third-party fonts, images and templates are not bundled anywhere in the skill library. Generated sites may reference Google Fonts families by name (OFL); that is not redistribution by DevDrop.

## Modifications to bundled third-party material
- `frontend-design`: none.
- `web-design-guidelines`: removed frontmatter/preamble and the "Output Format" section; removed "Hydration Safety"; removed the Next.js `priority` image-prop wording and the `nuqs` mention; added DevDrop header comment and one usage paragraph.

## Re-verifying
```
npm run skills:verify -- --upstream anthropics/skills=/path/to/clone \
                         --upstream vercel-labs/web-interface-guidelines=/path/to/clone
```
Checks the manifest, notice files, every content hash, and (with clones) the recorded upstream hashes. See `SKILLS_ARCHITECTURE.md` for the approval procedure.
