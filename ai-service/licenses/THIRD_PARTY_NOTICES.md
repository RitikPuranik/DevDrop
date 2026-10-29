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
