# Skills architecture

The skill system adds pinned, text-only guidance and a deterministic design-intelligence stage to the existing `ai-service` pipeline. It does not replace any agent, orchestrator, queue, validator or model integration, and every part of it degrades to the previous behaviour if it fails.

## 1. Components

```
src/skills/
  manifest.json          approved skills (+ recorded rejected/pending candidates)
  library/<cat>/<id>/SKILL.md   the only place skill text is read from
  config.js              AI_SKILLS_* settings (secure defaults)
  skillManifest.js       schema + validation of manifest entries
  registry.js            lookup, enable/disable, version pinning, filtering
  skillLoader.js         path-guarded, size-capped, hash-verified, text-only loading
  skillValidator.js      screening of skill text (override/tool-grant/fetch/secret patterns)
  skillResolver.js       deterministic selection + budget allocation
  skillContextBuilder.js framework filtering, section selection, prompt rendering
  skillProvenance.js     provenance report + license-notice checks
  index.js               createSkillSession(), startupCheck(), withSkillContext()
src/design/
  designSpec.js          designSpec schema + validator (contrast, vocabulary, anti-template)
  designIntelligence.js  deterministic spec builder + design-system floor
src/validators/quality.review.js   deterministic post-build review
licenses/                 third-party license texts and notices
scripts/verifySkills.js, scripts/benchmarkSkills.js
```

```mermaid
flowchart LR
  M[manifest.json] --> R[registry]
  L[library/*.md] --> LD[loader<br/>path + size + sha256 + text checks]
  R --> RS[resolver<br/>agent, framework, trigger, type,<br/>priority, conflicts, budgets]
  LD --> RS
  RS --> CB[context builder<br/>framework filter, relevance,<br/>trusted rules + advisory blocks]
  CB --> S[session.contextFor(agent)]
  S --> A[agent system prompt]
```

Pipeline placement (stage names and order are unchanged):

```
requirements ──► [designSpec built] ──► design ──► architecture ──► code:<file>… ──► integration
   skill ctx          (no model)        skill ctx     skill ctx        skill ctx        skill ctx
                                                                                           │
   build-validator ◄── debug:N (skill ctx, targeted by error text) ◄── failures ◄─────────┘
        │ success
        ├─► quality review (deterministic; reported, optionally enforced)
        └─► deployment-readiness (skill ctx) ──► result (+ generationMeta additions)
```

## 2. Registry, resolver, loader, context builder
- **Registry** only knows identifiers in `manifest.json`. There is no API to add, install or download a skill. `get('id@1.0.0')` pins a version. Essential skills cannot be disabled through the registry.
- **Loader** accepts only `^[a-z0-9_-]+(/[a-z0-9_-]+)*/SKILL.md$` paths inside `library/`, rejects symlinks and escapes, caps size at 32 KB, requires valid UTF-8, verifies the pinned sha256 and screens the text. It performs no network access, no environment access and executes nothing. Failures log skill id and error code only.
- **Resolver** filters by framework, agent, trigger, website type, enabled flags and `AI_SKILLS_*` config, sorts by priority then id, resolves `conflictsWith` (higher precedence wins), loads content and allocates tokens: `min(skill cap, skill size, remaining stage budget)`. Output records every selection with a reason and every exclusion with a reason. An unavailable optional skill is skipped; an unavailable essential skill makes the session disable skill context (the pipeline continues without it).
- **Context builder** splits skills into sections, drops sections that conflict with the platform (TypeScript, Next.js/server-only APIs, SSR-only hydration) unless the skill is a DevDrop platform skill, picks the most relevant sections within the allocation (terms come from website type, preferences, requirements features/sections, the file being generated, or the errors being fixed), and renders: trusted platform rules first, then each skill in `<<<DEVDROP-SKILL … trust="advisory">>>` markers.

## 3. Which agent gets which skill

| Agent | Skills (by priority) | Stage ceiling (tokens) |
|---|---|---|
| requirements | requirements-fidelity | 700 |
| design | frontend-design, devdrop-design-system, ui-ux-intelligence, ui-ux-pro-max (opt-in) | 5200 |
| architecture | framework-compatibility, devdrop-design-system, ui-ux-intelligence (react-best-practices is targeted but usually falls outside the 1800-token ceiling) | 1800 |
| code (UI source files only) | framework-compatibility, generated-code-safety, react-best-practices (or vercel-react-best-practices when opted in), web-design-guidelines | 2000 |
| integration | framework-compatibility, generated-code-safety, accessibility-review | 1200 |
| debug | framework-compatibility, generated-code-safety, react-best-practices (sections chosen by the error text) | 1200 |
| deployment readiness | framework-compatibility, generated-code-safety | 700 |
| edit (incremental) | framework-compatibility, generated-code-safety, react-best-practices, web-design-guidelines | 2400 |

The two opt-in skills add about 1.4k estimated tokens per site on average (benchmark with the flag on: about 24.5k vs 23.1k). The effective ceiling is `min(stage ceiling, AI_SKILLS_MAX_CONTEXT_TOKENS)`. The ~330-token platform rules block is added on top whenever any skill is included. Code files that are not UI source (`package.json`, `index.html`, `main.jsx`, config files) receive no skill text. Existing agent prompts, the debug agent's targeted-repair rules and the deployment agent's rules are unchanged; skill text is appended after them.

## 4. Framework compatibility
Every skill declares `supportedFrameworks` (currently only `react-vite`). The resolver excludes skills for other frameworks. Inside a skill, sections matching TypeScript, Next.js/server-component or SSR-hydration patterns are removed before prompting, and the trusted rules state that JavaScript/JSX, the architecture's dependencies, user content, media references and the designSpec win over any skill. This is prompt-level plus content-level enforcement; the existing validators (`validateGeneratedFiles`, `validateArchitecture`) remain the code-level enforcement for TypeScript and imports.

## 5. Design intelligence
`buildDesignSpec({ websiteType, requirements, preferences, mediaPlan })` runs after requirements (no model call):
1. Reads the existing preference fields: `style`, `theme`, `palette`/`primaryColor`, `typography`, `animations`.
2. Chooses a purpose-specific archetype (2 variants for most website types; one for `custom`) deterministically from a hash of the brief. Variants differ in section set, order and hero treatment (for example menu-forward vs story-led restaurant, shop-first vs collection-story store).
3. Adds requested features as components (reservation form, cart, filters, contact, newsletter, FAQ, gallery). Testimonials, pricing and resume actions are added only when the user supplied matching data or asked for the feature with data present; the spec's `contentRules` forbid invented facts and testimonials.
4. Builds palette from the theme base plus the user's accent, computes `accentStrong` if the accent has less than 3:1 contrast on the background, and picks heading/body families from a fixed allowlist with generic fallbacks.
5. Records media as asset ids and roles only (never URLs).
6. Validates with `validateDesignSpec`: enums, hex colours, 4.5:1 text contrast, vocabulary, unique ids, at most one hero, rejection of the generic hero/features/testimonials/footer skeleton, quality floors set to true.

The spec is passed to the Design Agent as binding input, attached as `design.designSpec` (so architecture, code, integration and debug receive it through the existing `design` argument), and summarized in `generationMeta.designSpec`. `enforceDesignSystemFloor` replaces the model's text/background colours with the spec palette only when the model's pair is below 4.5:1. If the engine cannot build a spec (for example unusable input) generation continues without it.

Limits: variants are a small hand-written set, not a design search; the engine does not look at reference images (the Design Agent still does, within the spec).

## 6. Quality review
`reviewGeneratedSite` (AST-based, no model) runs after a successful build and before deployment readiness. It reports: missing alt text, icon-only buttons without names, clickable non-interactive elements, unlabeled form controls, missing landmarks/h1, `target="_blank"` without `rel`, removed focus outlines, `transition: all`, animation without `prefers-reduced-motion`, viewport meta, fixed widths of 640px or more, unapproved external scripts/iframes/network calls, `eval`/`new Function`/`document.write`/string timers/dynamic script injection, dynamic `dangerouslySetInnerHTML`, and palette/token use against the designSpec. Findings go to `generationMeta.qualityReview`. By default nothing blocks. With `AI_SKILLS_QUALITY_ENFORCE=true`, severity-`error` findings are sent once through the existing debug/repair loop (consuming one of the existing repair attempts). This review complements, and does not replace, static validation, the build and the Playwright runtime check, and passing it does not prove the generated code is safe. It is not run on incremental edits.

## 7. Security boundaries
Implemented: allowlisted identifiers only; no arbitrary installs; local pinned library only; no fetches or process execution in the skill code (asserted by a test); path validation and symlink rejection; size and UTF-8 checks; sha256 verification (cannot be disabled when `NODE_ENV=production`); content screening; log lines contain ids/codes only; skills receive no job data beyond website type, preferences strings, feature/section names, the file path/responsibility being generated, or error text; trusted rules separate platform authority from advisory skill text; manifest rejects unverified licenses and placeholder SHAs.

Not implemented / limits: prompt-level instructions cannot guarantee a model ignores injected text, which is why content is screened, the library is first-party reviewed, and permissions are never granted through prompts (the pipeline has no tool access for models to expand). The content screen is pattern-based and can be evaded by novel phrasing; the primary control is that only reviewed, hash-pinned files load. Prompt caching and a model-based visual review were not implemented.

## 8. Operations
Environment variables (see `.env.example`): `AI_SKILLS_ENABLED`, `AI_SKILLS_ALLOW_THIRD_PARTY`, `AI_SKILLS_ALLOW_UNVERIFIED_LICENSES`, `AI_SKILLS_VERIFY_HASHES`, `AI_SKILLS_MAX_CONTEXT_TOKENS`, `AI_SKILLS_DISABLED_IDS`, `AI_SKILLS_QUALITY_REVIEW`, `AI_SKILLS_QUALITY_ENFORCE`. `AI_SKILLS_ALLOW_THIRD_PARTY` means "allow the bundled, verified, pinned third-party-derived skills"; there is no runtime download path to opt into.

Startup: `server.js` calls `startupCheck()` which validates the manifest and license notices and loads every enabled skill (hash check). Failure logs an error and disables skill guidance until fixed; the service still starts.

Disable: `AI_SKILLS_ENABLED=false` (everything), `AI_SKILLS_ALLOW_THIRD_PARTY=false` (third-party-derived only), `AI_SKILLS_DISABLED_IDS=ui-ux-intelligence,...` (specific ids).

Token control: skill selection happens before prompt construction with no extra model call; per-skill caps (`maxContextTokens` in the manifest), per-stage ceilings, a global cap, section-level relevance selection and no-skill-text for non-UI files. Estimated cost is in `docs/SKILLS_BENCHMARK.md` (about 23k estimated added input tokens per generated site with everything enabled; measured by character count, not by provider billing). Each skill use is logged: success is one short line (`[SKILL OK] design/frontend-design ~2341tok`); a skill that could not be loaded logs a multi-line `[SKILL FAILED]` block with the reason code, the effect and the action to take (ids and codes only, never skill text). Policy skips (disabled, license-gated, budget) are not failures and are not logged. Usage is also reported in `generationMeta.skills`.

**License statuses.** `verified` (license text present and checked), `declared` (upstream states a license but notice/provenance is incomplete; loads only with `AI_SKILLS_ALLOW_UNVERIFIED_LICENSES=true`, and requires a local NOTICE stating it is not verified), `internal` (DevDrop-authored). `pending-review` and `rejected` are not loadable. Entries may set `maxBytes` (up to 160 KB) for large rule collections; the prompt is still limited by section selection and token budgets. When both the original and the Vercel React skill are enabled, the higher-priority Vercel one wins.

## 9. Adding a DevDrop skill
1. Create `src/skills/library/<category>/<id>/SKILL.md` (plain Markdown with `##` sections, no `<<<`/`>>>`, no fetch/run instructions).
2. Add a manifest entry (`origin: "devdrop"`, `source: null`, `license: { identifier: "DevDrop-original", verificationStatus: "internal" }`, agents, triggers, priority, `maxContextTokens`).
3. `node scripts/verifySkills.js --print-hash <category>/<id>/SKILL.md` and put the digest in `contentHash`.
4. Add tests (selection and content screening) and run `npm run skills:verify`.

## 10. Approving a third-party skill
1. Pin an exact upstream commit; read the license file for the specific path (a repository README alone is not enough; if no license text or copyright holder exists, do not copy).
2. Review the content for relevance, overlap, URLs, scripts, assets and instructions that grant access or fetch content.
3. Copy only the text file; store the license under `licenses/third-party/<id>/` and add an entry to `licenses/THIRD_PARTY_NOTICES.md` and `docs/SKILL_LICENSES.md`, listing every modification.
4. Add a manifest entry with `source` (repository, path, 40-char commit, `upstreamHash` of the untouched upstream file, check date), `license` (`verified`, notice path, copyright line) and `contentHash` of the bundled file. An unmodified copy must have `contentHash === upstreamHash`; a modified one must list `modifications`.
5. Run `npm run skills:verify -- --upstream owner/repo=/path/to/clone` and the test suite.
Candidates that fail go into `rejectedCandidates` with the reason.

## 11. Tests
```
cd ai-service
npx jest tests/skills tests/designIntelligence.test.js tests/qualityReview.test.js   # new suites
npx jest                                                                             # everything
npm run skills:verify
npm run skills:benchmark
```
