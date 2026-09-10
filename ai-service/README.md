# DevDrop AI Service

Internal microservice for the AI Studio website generator described in the
build spec. Called only by the DevDrop **Node** backend — never directly by
the frontend (see Security, below).

This README covers what's actually built (Phase 1) plus the repo-analysis
findings that shaped it, so the reasoning survives even if this
conversation doesn't.

## Phase 1 — foundation (done)

- FastAPI app (`main.py`) with structured JSON logging and a global error
  handler shaped to match the Node backend's own error responses.
- Centralized config (`config.py`) — every env var the service reads lives
  in one place.
- Provider abstraction (`providers/`) with a working **Gemini** provider
  and a working **Ollama** provider (local, no API key — useful for
  developing without burning Gemini quota).
- `GET /health`, which reports whether the configured provider actually has
  what it needs to run.

## Phase 2 — Requirements → Design → Architecture pipeline (done)

Phase 1 (foundation) is unchanged and still passes its own tests. Phase 2
adds a working, tested planning pipeline behind `POST /v1/planning/portfolio`:

- `schemas/` — Pydantic models for each agent's output. The Architecture
  schema enforces the Section 6 rules as real validators, not just prompt
  instructions: no `../`, no absolute paths, no duplicate files, every
  `entryPoints` path must exist in `files`, and `framework`/`language`/
  `styling` are locked to `Literal` types so the model literally cannot
  output Next.js or Vue and have it pass.
- `prompts/` — one `build_prompt()` per agent, plain functions, no
  orchestration logic mixed in.
- `agents/` — `BaseAgent` owns provider retrieval (always through
  `providers.factory.get_provider()`, never a direct client), timing,
  structured logging (`agent_started`/`agent_completed`/`agent_failed`),
  and the validate-then-retry-with-a-repair-prompt flow, bounded by
  `MAX_SCHEMA_RETRIES`. `RequirementsAgent`, `DesignAgent`, and
  `ArchitectureAgent` are each a schema, a prompt, and nothing else.
- `orchestrator/` — `GenerationPipeline` chains the three agents and
  threads each stage's real output into the next one's context.
  `PipelineState` tracks `completedStages`/`failedStages`/`outputs` per
  Section 11, so a mid-pipeline failure doesn't discard the stages that
  actually succeeded.
- `routes/planning.py` — `POST /v1/planning/portfolio`, guarded by
  `dependencies.require_service_auth` (open for local dev when
  `SERVICE_AUTH_TOKEN` isn't set, required once it is).
- `main.py` gained two more exception handlers (`HTTPException`,
  `RequestValidationError`) so *every* error response — not just
  uncaught ones — comes back in the same `{success, message, code}` shape,
  including the 401 from the new auth check and 422s from bad request
  bodies.

### A finding that shapes every agent: Gemini's `$ref`/`$defs` support

Before wiring `response_schema`, I checked whether Gemini's structured
output handles the `$ref`/`$defs` pattern Pydantic emits for any nested
model — it's a well-documented cross-framework pain point (litellm,
pydantic-ai, and MCP tool schemas have all hit it). Google announced
proper JSON Schema support, including `$ref`, in January 2026 for Gemini
2.5-class models, and the `google-genai` SDK does its own schema
transformation regardless. But recursive/self-referential schemas are
still explicitly unsupported, and depending on exactly which
`GEMINI_MODEL` a deployment configures felt like the wrong thing to bet
correctness on. So every agent flattens its schema first —
`schemas/utils.flatten_schema()` inlines every `$ref` into a fully
self-contained schema before it ever reaches a provider. None of our
schemas are recursive, so this costs nothing and removes the dependency
on Gemini-version-specific behavior entirely.

### What "tested" means here, honestly

This sandbox has no network route to Gemini's API (or anywhere outside a
short allowlist of package registries), so nothing in this test suite
makes a real LLM call — that's not a shortcut, it's a hard constraint
worth being explicit about. `tests/fakes.py` implements a `FakeProvider`
against the exact same `AIProvider` interface a real provider does, so
`test_pipeline.py::test_full_chain_end_to_end` runs the actual
`RequirementsAgent → DesignAgent → ArchitectureAgent → GenerationPipeline`
code, completely unmodified, and proves the orchestration, retries,
context-threading, and error handling are all correct. It does **not**
prove Gemini's actual generation quality for a given prompt — that needs
a real `GEMINI_API_KEY` and a normal internet connection, which is a
five-minute check on your own machine: `cp .env.example .env`, fill in the
key, `python -m uvicorn main:app --reload`, then POST
`tests/fixtures/portfolio.json` to `/v1/planning/portfolio`.

## Phase 3 — Code Generation + deterministic project validation (done)

Adds a fourth agent and a new, separate endpoint —
`POST /v1/generation/portfolio` — that runs the complete
Requirements → Design → Architecture → Code Generation → Project
Validation chain. `POST /v1/planning/portfolio` (Phase 2) is completely
unchanged, both in behavior and in code: `GenerationPipeline.run()` still
does exactly what it did before; the new work lives in `run_full()`,
sharing the first three stages via one internal helper rather than
duplicating them.

- **`schemas/code_generation.py`** — `GeneratedProject`/`GeneratedFile`,
  the Code Generation Agent's output shape. Reuses the same path-safety
  and duplicate-path helpers `ArchitectureSpec` uses (now factored into
  `schemas/utils.py` so there's one implementation, not two copies).
  Adds one more rule enforced as a real validator rather than a prompt
  instruction alone: `content` is rejected if it matches a placeholder
  marker (`// TODO`, `TODO:`, "implement this", "same as above",
  "omitted for brevity", "placeholder") — precisely enough that a
  portfolio entry for an actual "Todo List" app isn't a false positive
  (there's a test for exactly that).
- **`agents/code_generation_agent.py`** — same `BaseAgent` shape as every
  other agent: a schema, a prompt, nothing else. Runs at `temperature=0.25`
  since this output becomes source code.
- **`prompts/code_generation.py`** — states the tech constraints (React +
  Vite + JS + CSS only; no Next.js/TypeScript/Tailwind/backend code),
  requires every architecture-listed file and nothing else, and spells out
  how the Design system's tokens should become CSS custom properties and
  how the Requirements' sections should become the actual rendered
  sections — not a generic portfolio that ignores both.
- **`project/`** — new package, three small modules:
  - `manifest.py` — `ProjectManifest`, the normalized internal
    representation, kept distinct from `GeneratedProject` (which is "what
    the LLM returned, schema-checked in isolation").
  - `generator.py` — `build_manifest()`, a thin adapter from a validated
    `GeneratedProject` + the Architecture dict to a `ProjectManifest`.
  - `validator.py` — `validate_project()`, the deterministic, no-LLM
    checks: required files (`package.json`, `index.html`, `src/main.jsx`,
    `src/App.jsx`) exist; every generated file matches something the
    Architecture contract actually planned (and vice versa); `package.json`
    parses and has real `dev`/`build` scripts; a lightweight regex-based
    check that relative imports resolve to a real generated file. Import
    resolution and "extra file not in the architecture" are **warnings**,
    not errors — a plain regex isn't a real module resolver and shouldn't
    get the power to hard-fail a generation on a false positive.
  - Framework/language/styling are checked in *two* places on purpose:
    `GeneratedProjectInfo`'s `Literal` types make them structurally
    impossible to get wrong by the time a `ProjectManifest` exists, and
    `validate_project()` checks them again anyway — Section 11 names this
    explicitly, and it's cheap insurance for any future caller that builds
    a manifest some other way. The test for that second check uses
    `model_construct()` (Pydantic's validation-bypass constructor) since
    that's the only way to even construct the "invalid" input it's
    guarding against.
- **`orchestrator/generation_pipeline.py`** — `_run_planning_stages()` now
  holds the Requirements → Design → Architecture logic once; `run()` calls
  it and stops (Phase 2, unchanged); `run_full()` calls it and continues
  into Code Generation and Project Validation. Two new `PipelineStage`
  values (`GENERATING_CODE`, `VALIDATING_PROJECT`) and a new failure code
  (`PROJECT_VALIDATION_FAILURE`) for the one failure mode that's genuinely
  new in this phase — a deterministic check failing *after* the agent
  already succeeded, which the existing `PROVIDER_FAILURE`/
  `SCHEMA_VALIDATION_FAILED` taxonomy doesn't cover. Code Generation's own
  failures reuse those two existing codes rather than adding a redundant
  third one, since `{"code": ..., "stage": "CODE_GENERATION"}` already says
  exactly which kind of failure happened at which stage.
- **`agents/base_agent.py`** gained one change that benefits every agent,
  not just this phase's: repair prompts now truncate a large previous
  output (>4000 chars) instead of embedding it verbatim. Phase 2's agents
  never produced enough output to hit that, so their retry behavior is
  identical; Code Generation's output — many files' worth of content — is
  exactly the case this exists for.
- **`routes/generation.py`** — `POST /v1/generation/portfolio`, same
  `require_service_auth` guard as planning, same `{success, message,
  code}`-shaped errors. Returns `{jobId, success, status, stage, project,
  files, validation}`, matching Section 19's contract plus this service's
  own established `success` field (Section 19 explicitly says to keep
  existing conventions where already established).

Repair prompts double as Section 17's "tell the model what was invalid"
requirement for free: no code-generation-specific repair logic exists —
the existing generic mechanism already includes the validation error
message, and because the schema's own errors are specific ("Content looks
like a placeholder..."), that specificity carries through automatically.
Reusing the existing retry system rather than building a second one, as
asked.

### What "tested" means here — same honest framing as Phase 2, more so

Code Generation's output is the largest and most consequential thing any
agent has produced yet, and it's exactly as untested against a live model
as everything before it, for the same reason: no network route to
Gemini's API in this sandbox. `test_full_generation_chain_end_to_end` runs
the real `RequirementsAgent → DesignAgent → ArchitectureAgent →
CodeGenerationAgent → build_manifest → validate_project` code, unmodified,
against a hand-written fixture project (13 files — full Navbar/Hero/
About/Skills/Projects/Contact/Footer set, real data module, real CSS with
design-token custom properties) that itself passes every check with zero
errors *and* zero warnings. That proves the pipeline mechanics are
correct. It does not prove Gemini will reliably produce 13 files of
working React code from a single prompt — that needs a real
`GEMINI_API_KEY`, same five-minute check as Phase 2, now against
`/v1/generation/portfolio` instead of `/v1/planning/portfolio`.

### Known limitations (explicitly out of scope for this phase, not overlooked)

- **No real build execution.** Nothing here runs `npm install` or
  `vite build` — `project/validator.py` is static analysis only (parses
  `package.json` as JSON, regex-matches import strings). A file set that
  passes every check here can still fail a real Vite build in ways only an
  actual build catches (a subtle syntax error, a version-incompatible
  import). That's the Build Validator's job in a later phase.
- **The import check is a regex, not a parser.** It can miss dynamic
  imports or computed paths, and it's deliberately a warning rather than
  an error because of that.
- **Live Gemini generation quality is unverified**, as above.

## Phase 4 — Build Validator + Debug Agent (done)

The first phase that actually executes generated code. New endpoint —
`POST /v1/build/portfolio` — runs the complete chain through a real
sandboxed `npm install` + `npm run build`, and when that fails, a bounded
debug → patch → rebuild loop. `/v1/planning/portfolio` and
`/v1/generation/portfolio` are byte-for-byte unchanged, both in behavior
and — thanks to a `_run_generation_stage()` helper extracted this phase —
in the code that implements them.

- **`sandbox/`** — `BuildSandbox` interface + `LocalSandbox`, the
  dev-only implementation. Materializes a `ProjectManifest` into a
  `tempfile.TemporaryDirectory()`, validates every `package.json` script
  before touching anything, then runs `npm install` and `npm run build`
  via `asyncio.create_subprocess_exec` — never `shell=True`, never a
  string a shell could reinterpret. A timeout wraps the whole sequence;
  hitting it kills and reaps the process rather than leaving it running.
  **Real `npm`/`vite` verified working in this environment** — a hand-written
  13-file portfolio (the same one Phase 3 shipped as a test fixture)
  builds successfully end to end in ~14 seconds through this exact code
  path, not a mock.
- **`build/command_validator.py`** — three layers, all required: reject
  any shell metacharacter (`&&`, `;`, `|`, `` ` ``, `$(`, `>`, `<`)
  anywhere in a script string; tokenize with `shlex.split()` and require
  the first token to be `vite` (the only binary a locked react-vite
  project's scripts should ever need); a substring scan for explicitly
  named dangerous commands as defense-in-depth on top of the first two.
  Critically, it validates **every** script in `package.json`, not just
  the one about to run — npm executes `pre<name>`/`post<name>` hooks
  automatically, so a forbidden command smuggled into `postinstall` would
  run even if `build` itself looked clean. There's a test proving exactly
  that (`test_unsafe_lifecycle_hook_is_blocked_even_though_we_never_call_it_by_name`).
- **`build/error_parser.py`** — turns raw Vite/esbuild/npm output into
  `NormalizedBuildError`s (file/line/column/category). Tuned against real
  captured output, not guessed formats — which is what caught two actual
  bugs during development: Vite reports file paths prefixed with the
  sandbox's absolute temp path (now relativized against the project root
  before comparison), and esbuild's own internal function name
  `failureErrorWithLog` contains the substring `"Error"`, which
  false-triggered a naive keyword check on its own stack-trace frames
  (now excluded — lines starting with `"at "` are stack frames, not
  primary error messages). `tests/test_error_parser.py`'s fixtures are
  excerpts of that real captured output.
- **`schemas/debug.py`** — `DebugResult` has no `project` field at all.
  Section 14's "never change framework/language/styling" is enforced by
  giving the model nowhere to put such a change, not by checking
  afterward that it didn't make one. `action` is locked to `"replace"` —
  this phase's patcher doesn't support the Debug Agent creating new
  files.
- **`agents/debug_agent.py`** — same `BaseAgent` shape as every other
  agent. Its prompt receives *focused* context (Section 36) via
  `build.error_parser.select_affected_files()`: only the files the
  normalized errors actually name, not the whole project, falling back to
  the architecture's entry points when no error could be tied to a
  specific file.
- **`project/patcher.py`** — the only thing that applies a Debug Agent's
  proposed changes. Path safety and placeholder-content rejection are
  already enforced by `FileChange`'s own schema (so `apply_patch` never
  even sees an unsafe proposal to reject) — what's genuinely this
  module's own job: the target path must already exist in the project
  (no new files), a small basename denylist (`.env`, `credentials.json`,
  `secrets.json` — basename-only, not a substring match, so a component
  legitimately named `TokenGate.jsx` isn't caught by accident), and a
  patched `package.json` is re-run through the command validator before
  being accepted.
- **`build/validator.py`** — bundles pre-build static re-validation with
  the actual sandbox call into one operation (`validate_and_build()`),
  matching Section 10's own diagram. This is also why the repair loop
  doesn't need its own separate re-validation step after every patch: a
  patch that corrupts `package.json`'s JSON validity gets caught on the
  very next build attempt, the same way the original generation would
  have been.
- **`orchestrator/generation_pipeline.py`** — `_run_generation_stage()` is
  new: Code Generation + static validation, extracted out of Phase 3's
  `run_full()` body so `run_with_build()` gets it for free instead of
  duplicating it. The repair loop itself
  (`_run_build_and_repair_loop`/`_debug_and_patch`) is bounded by
  `MAX_BUILD_REPAIR_ATTEMPTS` (default 3 — meaning up to 4 total build
  attempts: the first, plus 3 repairs) and treats a `blocked` build as an
  immediate hard failure that never consumes a repair attempt or even
  invokes the Debug Agent — an unsafe script isn't something a code patch
  fixes. Two new failure codes: `BUILD_BLOCKED` and
  `BUILD_REPAIR_EXHAUSTED`; a corrupted-patch failure reuses
  `PROJECT_VALIDATION_FAILURE` (same underlying situation as Phase 3's
  version of that code) rather than adding a redundant synonym, and an
  unapplicable patch gets its own `DEBUG_PATCH_INVALID` — treated as a
  hard failure rather than a repair attempt, since a patch we can't even
  apply is a different problem than a rebuild that still fails.
- **Two new `PipelineStage` values** (`BUILDING`, `DEBUGGING`, `PATCHING`
  — three, not two) — deliberately **not** four more matching Section
  18's example list verbatim: a rebuild reuses `BUILDING` rather than a
  separate `REBUILDING` (the `repairAttempt` counter already
  distinguishes which attempt it is, more precisely than a same-meaning
  label would), and success/failure reuse the existing `COMPLETED`/
  `FAILED` rather than adding build-specific synonyms for the same two
  terminal states.

### What "tested" means here

Genuinely more verified than any prior phase, because this is the first
phase where "does it actually work" is answerable without a Gemini key at
all — `npm`/`node` are real, local tools. **168/168 tests pass**, and one
of them (`test_real_build_of_valid_project_succeeds`) is a real,
un-mocked `npm install` + `vite build`, not a simulation. The full
debug → patch → rebuild cycle was also verified for real during
development (break an import, run the real build, watch it fail, apply a
hand-written fix through the actual `apply_patch()`, rebuild for real,
watch it succeed) before any of it was wired into the pipeline or
formalized as a test.

What's *not* verified for real, for the same reason as every prior
phase: the Debug Agent's actual diagnostic quality against a genuine
Gemini call. The mechanism is proven; whether Gemini reliably produces a
correct fix from a real compiler error is a question only a real API key
answers.

### Known limitations — read before this touches anything beyond local dev

- **`LocalSandbox` is explicitly not production isolation.** It's OS-level
  subprocess isolation in a temp directory, sharing this process's kernel,
  CPU, memory, and network access. No cgroup limits, no network
  namespace, no seccomp profile. `BuildSandbox` (the interface) exists
  specifically so a container/VM-backed implementation can replace this
  without the orchestrator changing at all — but until one exists, treat
  this as a development tool, not a boundary against a genuinely
  adversarial generated project.
- **`BUILD_NETWORK_MODE=restricted` is documented, not enforced**, for
  exactly that reason — a real network boundary needs a container or VM;
  a local subprocess can't honestly promise one. Anyone reading this
  config value should not assume it does anything yet.
- **Third-party dependencies' own install-time scripts aren't blocked.**
  `build/command_validator.py` validates the *generated project's own*
  `package.json` scripts — it says nothing about whether `react`,
  `vite`, or any future dependency's `postinstall` script does something
  unwanted during `npm install`. This wasn't in Phase 4's stated scope,
  and `npm install --ignore-scripts` was deliberately not adopted as a
  blanket fix without verifying it doesn't break Vite's own toolchain
  (esbuild's install step downloads a platform binary via a postinstall
  script) — a production-grade sandbox should account for this
  (`--ignore-scripts` plus an explicit allowlist for packages that
  genuinely need one, or a vetted registry mirror) before trusting
  arbitrary future dependency additions.
- **The import checker is a regex, not a module resolver** (unchanged
  from Phase 3) — it can miss dynamic imports or computed paths, which is
  exactly why it only ever produces warnings.

<<<<<<< HEAD
## Status: Phase 5 — Project Storage + Generation Persistence
=======
## Phase 5 — Project Storage + Generation Persistence (done)
>>>>>>> ad5b584213608b50dfd0fcd8acf211a5eeefc4a3

Generated projects and their generation jobs are now retrievable after
the fact — the first phase where "what did this service generate
yesterday" has an answer. New endpoints:
`POST /v1/generation/jobs`, `GET /v1/generation/jobs/{jobId}`,
`GET /v1/projects/{projectId}`, `GET /v1/projects`. Every earlier
endpoint (`/v1/planning`, `/v1/generation`, `/v1/build`) is byte-for-byte
unchanged.

- **Database technology, decided by inspection, not habit.** The spec
  asked for "structured documents" and explicitly modeled this service's
  data as its own logical database alongside DevDrop's existing one — the
  original Phase 1 spec even named the concept (`devdrop_ai`, sitting next
  to `devdrop_core`). MongoDB is the natural fit for both reasons. What's
  worth flagging: the obvious Python driver choice, **Motor, was
  deprecated in May 2025** in favor of async support built directly into
  PyMongo 4.14+. Checked against MongoDB's current docs rather than
  assumed — building this on a library already past its own end-of-life
  would have been a bad foundation for something meant to last. `storage/mongo.py`
  uses `pymongo.AsyncMongoClient` throughout; confirmed importable and
  constructible in this sandbox (`AsyncMongoClient` connects lazily), but
  **no actual database operation in that file has been run for real** —
  there's no MongoDB server reachable here (no server package in the OS
  repos, MongoDB's own package repo is outside the network allowlist).
  Every test in this phase exercises `storage/memory.py` instead, which
  implements the identical `Repository` interface.
- **`storage/models.py`** — `GenerationJob` and `Project`, deliberately
  separate from `schemas/` (those describe LLM-output shapes; these
  describe database records). `currentStage` is a plain string, not
  `orchestrator.state.PipelineStage` — the storage layer doesn't import
  pipeline internals, so the service layer is the one place translating
  between them.
- **`storage/factory.py`** — no `AI_DATABASE_URL` means the in-memory
  repository, loudly: a warning logs every time this fallback is used, so
  it can't go unnoticed in what looks like a production deployment
  (Section 27's explicit concern), the same pattern as an unset
  `SERVICE_AUTH_TOKEN`.
- **`services/generation_service.py`** — the actual "Route → Service →
  Repository → Database" layering Section 22 asks for. One deliberate,
  stated scope decision: job state is persisted at three points (created,
  running, final outcome) rather than streamed at every internal pipeline
  stage transition. The full reasoning is in that file's own docstring;
  the short version is that Section 9 keeps this endpoint synchronous, so
  granular mid-flight updates would only ever be observed by a *second,
  concurrent* request, and achieving that meant threading a persistence
  callback through roughly fifteen call sites inside already-tested
  `GenerationPipeline` internals — a real regression risk for a benefit
  that only matters once the async job system (explicitly deferred here)
  actually exists.
- **Section 24's hard rule — never mark a failed project ready — is
  enforced structurally, not just by convention.** `ProjectStatus.READY`
  is only ever passed to `_build_project_record` on the success path;
  every failure path passes `ProjectStatus.FAILED`. There's a test
  (`test_early_failure_persists_job_without_fabricating_a_project`)
  proving the *other* half of Section 24 too: if generation never
  produced any code at all (e.g. the Requirements Agent itself failed),
  no project record is created at all — `job.projectId` stays `None`
  rather than a fabricated placeholder.
- **Idempotency** — an optional `Idempotency-Key` header. A repeat with
  the same key returns the original job untouched, without re-running the
  pipeline (verified via a test asserting the sandbox is called exactly
  once across two identical requests). The repository enforces uniqueness
  independently of the service-layer's upfront check, for the race where
  two requests with the same key arrive close together.
- **Pagination** — negative page, zero/negative limit, and non-integer
  values are rejected (422, via FastAPI's own `Query` validation, which
  already comes back in this service's `{success, message, code}` shape).
  An oversized limit is clamped to `MAX_PAGE_SIZE` rather than rejected —
  it isn't malformed, it just needs a decided cap. The list endpoint's
  MongoDB query projects out `files` entirely (Section 34) rather than
  fetching full documents and discarding the content in Python.

### What "tested" means here

**213/213 tests pass.** For the first time in this project, the
*persistence* half of a phase is thoroughly, genuinely tested — every
repository operation, every idempotency path, every pagination edge case,
and a full `POST job → GET job → GET project → GET project list` cycle
all run against real, in-process code with no mocking of the storage
layer itself. What's unverified, honestly, same shape as every phase
before it: `storage/mongo.py` has never touched a real MongoDB, and (as
always) no live Gemini call has been made. Both are five-minute checks on
a machine with what this sandbox doesn't have — the former just a local
`mongod` and `AI_DATABASE_URL`, the latter a real `GEMINI_API_KEY`.

### Known limitations

- **No live-updating `currentStage` during an in-flight request** — see
  the scope decision above. `GET /v1/generation/jobs/{jobId}` while that
  same job is still running will show `"running"`, not which exact
  pipeline stage it's currently on.
- **`storage/mongo.py` is unverified against a real database.** Written
  carefully against current, verified PyMongo docs, but "carefully
  written" isn't "tested" — smoke-test this against a real MongoDB before
  it goes anywhere near production traffic.
- **No cross-service ownership yet.** `ownerId` is accepted (via an
  `X-Owner-Id` header) and stored, but nothing validates it against a
  real DevDrop user — Section 16 explicitly scoped this phase to prepare
  the field, not implement real authorization.
- **File content still lives in the database row**, per Section 25's own
  instruction for this phase (MVP projects are small) — the storage
  abstraction is shaped so a future phase can move `files` to object
  storage without changing the `Repository` interface or the API
  contract, but that move hasn't happened.

<<<<<<< HEAD
=======
## Status: Phase 6 — Gemini Project Pool

`AI_PROVIDER=gemini` no longer has to mean exactly one Gemini credential.
Set `GEMINI_POOL_ENABLED=true` and every Gemini call routes through a
load-aware scheduler across an arbitrary number of projects/credentials —
1, 3, 10, 60, however many are registered — instead of the single
`GEMINI_API_KEY`. Full design writeup, the admin API
(`GET/POST/PATCH/DELETE /v1/admin/gemini-projects`, `.../test`,
`.../health/summary`), and every known limitation are in
[`docs/GEMINI_PROJECT_POOL.md`](docs/GEMINI_PROJECT_POOL.md) — this section
is the short version.

- **Opt-in, not a rewrite.** `GEMINI_POOL_ENABLED` defaults to `false`.
  `providers/factory.py` only branches to `GeminiPooledProvider` when it's
  explicitly turned on; every existing deployment, and the pre-existing
  `test_provider_factory_gemini` test asserting `get_provider()` returns a
  plain `GeminiProvider`, keep their exact current behavior with the flag
  unset. Nothing above the factory (agents, the orchestrator) changed at
  all — both providers implement the same `AIProvider` interface, which is
  the whole point of Section 32's "agents never know which project is
  being used."
- **The scheduling primitive is one atomic operation, not a read-then-write.**
  `GeminiPoolRepository.reserve()` re-checks eligibility and claims a
  project in a single atomic step per repository (an `asyncio.Lock` for
  the in-memory repository every test in this phase runs against; an
  optimistic-concurrency compare-and-swap on each record's own `updatedAt`
  for the MongoDB one) — this is what makes concurrent workers safe
  without introducing new infrastructure (no Redis added; Section 14 of
  the spec this was built against is explicit not to add infrastructure
  that isn't already needed).
- **One error classifier, one mapping table.** `gemini_pool/errors.py`
  turns a real `google.genai.errors.APIError` (verified against the
  installed `google-genai==2.21.0` source, not guessed) into one of ten
  classes, each with a fixed failover/penalize decision
  (`gemini_pool/errors.py:ERROR_CLASS_META`) — an application-level error
  (a blocked/malformed prompt) is the one class that neither fails over
  nor penalizes the project, so a single bad prompt can't burn through the
  whole pool.
- **Legacy credential migration, not a breaking flag flip.** Turning the
  pool on with `GEMINI_API_KEY`/`GEMINI_MODEL` already set migrates that
  key into a single pool entry automatically the first time the service
  starts (`gemini_pool/lifecycle.py:ensure_legacy_credential_migrated`) —
  enabling the pool never means losing a credential that already worked.

### What "tested" means here

**All 321 tests pass** (212 pre-existing + 109 new for this phase), all
against the in-memory repository and an injected fake `GeminiCaller` — no
test in this phase touches the network or needs a real Mongo/Gemini
credential. Covered: arbitrary pool sizes (0/1/3/10/60+ projects),
add/remove/enable/disable, every eligibility condition (cooldown, daily
exhaustion, budget exhaustion, model mismatch, disabled/removed/invalid),
concurrent reservation, lease expiry, RPM/TPM/RPD tracking and recovery,
error classification against real SDK exception types, failover
(including the application-error non-failover case and the
max-failover-count bound), and the full admin API over real HTTP
(including that a masked credential — and only a masked credential — ever
appears in a response body).

### Known limitations

Carried over verbatim from `docs/GEMINI_PROJECT_POOL.md`, same honest
shape every phase in this README uses:

- `storage/gemini_pool_mongo.py` has never touched a real MongoDB in this
  sandbox — same disclaimer `storage/mongo.py` already carries.
- `GEMINI_DAILY_RESET_HOUR_UTC`'s default (UTC midnight) is a placeholder,
  not a verified claim about Gemini's actual daily-quota reset instant.
- RPM vs. TPM vs. RPD classification is message-pattern-based, since
  Gemini's 429s don't separate these at the HTTP-status level — worth
  confirming the exact quota-metric strings against a real rate-limited
  response before relying on the split operationally.
- No automatic cross-provider fallback (Gemini pool exhausted → Ollama) —
  this codebase's provider abstraction has no fallback-chain concept for
  any provider today; an operator switches `AI_PROVIDER` manually.
- A pool entry serves exactly one model; multiple models from one
  underlying credential means multiple pool entries pointing at it.

>>>>>>> ad5b584213608b50dfd0fcd8acf211a5eeefc4a3
## Setup

```bash
cd ai-service
python3 -m venv .venv
source .venv/bin/activate          # .venv\Scripts\activate on Windows
pip install -r requirements-dev.txt   # add -r requirements.txt only if you don't need to run tests
cp .env.example .env
# edit .env — at minimum set GEMINI_API_KEY and GEMINI_MODEL if you want
# the gemini provider to report as configured. Ollama works with the
# defaults as-is if you have Ollama running locally. Leave AI_DATABASE_URL
# unset to use the in-memory repository (fine for trying this out; every
# generated project is gone on restart — see the Phase 5 status section).
python -m uvicorn main:app --reload
```

Then `curl http://127.0.0.1:8000/health` or open `http://127.0.0.1:8000/docs`
— `/docs` now also lists `POST /v1/planning/portfolio`,
`POST /v1/generation/portfolio`, `POST /v1/build/portfolio`, and the new
`POST /v1/generation/jobs` / `GET /v1/generation/jobs/{jobId}` /
`GET /v1/projects/{projectId}` / `GET /v1/projects`.

Run the tests with `pytest` (from inside `ai-service/`). One test —
`test_real_build_of_valid_project_succeeds` — runs a genuine
`npm install` + `vite build` and needs Node/npm on PATH and network
access to the npm registry; it's marked `slow` (adds ~15s) but runs by
default. `pytest -m "not slow"` skips it for a fast local loop.

Note on `requirements.txt`: it uses `httpx2`, not `httpx`. Plain `httpx`
has gone unmaintained; `httpx2` is Pydantic's maintained continuation with
the same API. If you're used to `httpx`, `providers/ollama.py` is a
1:1 read. Same story with MongoDB as of this phase: `pymongo`'s native
async support (`AsyncMongoClient`), not the now-deprecated `motor` package
— see the Phase 5 status section.

## Architecture findings this design is based on (Phase 0)

From reading `backend/src/`, not assumed:

**The `Website` model is a marketplace listing, not a generic project.**
It carries `price`, a `free/paid/exclusive` category enum, `sellerId`,
admin-review status, `soldTo`/auction fields
(`backend/src/modules/website/website.model.js`). An AI-generated draft
doesn't fit this — it needs its own collection. The spec's own Section 20
already names it correctly: `AIProject`, owned by the Node backend, not by
this service.

**The GitHub publish pipeline has exactly one contract: a single ZIP file
in Supabase storage, referenced by a `sourceCodeUrl` field.**
`projectExport.service.js`'s `runExport()` downloads that ZIP, extracts it
in-memory, and pushes each file as a GitHub blob. `github.service.js`
(OAuth exchange, create repo, blob/tree/commit, update ref) is a clean,
fully generic GitHub API wrapper with zero knowledge of *why* a file
exists — it's 100% reusable as-is.

The part that **isn't** reusable as-is is ownership: `runExport()`
requires a completed `Purchase` document tying a `websiteId` to the
requesting user. An AI-generated project was never purchased — there's
nothing to check a `Purchase` against. So Phase 6 needs one small,
additive sibling function (e.g. `runAIProjectExport()`) that does the same
blob/tree/commit/ref work but checks ownership via `AIProject.userId`
instead. That's the one deliberate new code path this plan calls for —
everything else reuses what's already there. It is **not** a second
GitHub publishing pipeline; it's the same low-level primitives with a
different, and simpler, ownership check in front of them.

Practically, this means: once this service generates and validates a
project, the Node backend zips it, uploads that zip to Supabase (reusing
`services/supabase.service.js`, unchanged), and stores the resulting
storage key as `AIProject.sourceCodeUrl` — the exact shape `runExport`
already expects, just sourced from a new model instead of `Website`.

**The deployment analyzer only ever looks at the *published* GitHub repo,
after the fact** (`services/deployment/analyzer/`). It detects
`react-vite` purely from `package.json` dependencies (`vite` + `react`) or
a `vite.config.js` file — it has no idea how the repo was generated. This
is good news for this service: nothing it does needs to talk to the
analyzer at all. The generated `package.json` just needs to look like an
honest, hand-written Vite + React app, and the analyzer will route it to
Vercel exactly like any human-published one.

**The deployment module already has the exact provider-abstraction pattern
this spec wants for AI providers** — `provider.interface.js` +
`provider.factory.js` behind `vercel.provider.js` / `render.provider.js`.
`providers/` in this service mirrors that shape deliberately, so the
pattern is consistent across both services, not just internally
consistent within this one.

**Conventions carried over on purpose**, so the two services feel like one
system to whoever's reading them:
- Error responses: `{"success": false, "message": "...", "code": "..."}`,
  matching `backend/src/shared/middleware/errorHandler.js`.
- Structured JSON logs with a constant `service` field, matching
  `backend/src/shared/utils/logger.js`'s Winston setup.
- A cheap, non-throwing `is_configured` check on every provider, matching
  `githubService.isGithubConfigured()`.

**MetaGPT (Section 8): evaluated and rejected.** The latest release
(0.8.2) declares `Requires-Python >=3.9,<3.12` — a hard install failure
against the Python 3.12 this service already runs, confirmed directly by
trying it, not just reading the docs. Past that, its ~106 dependencies
(playwright, four separate vector-DB clients, a full Jupyter stack, a
pinned `pydantic==2.6.4` that conflicts with the `2.13.5` this service
runs) and its "simulate a software company's roles" framing are a poor
fit for six tightly-scoped generation stages. `GenerationPipeline` above
is the custom orchestrator that decision led to. The one idea worth
keeping — define an agent's expected output as a schema and validate/retry
against it — is exactly what `BaseAgent.run()` already does, no dependency
required.

## Security notes (Section 23)

- No CORS middleware, on purpose — this service should never be reachable
  from a browser, only from the Node backend.
- `GEMINI_API_KEY` never leaves this service's process.
- `SERVICE_AUTH_TOKEN`, once set, is required (via an `X-Service-Auth`
  header) on `/v1/planning/*`, `/v1/generation/*`, `/v1/build/*`, and now
  `/v1/generation/jobs/*` and `/v1/projects/*` — see
  `dependencies.require_service_auth`, reused unchanged for every route
  added since Phase 2, this phase's included. Left unset, those endpoints
  stay open, which is fine for now since nothing but local development
  calls them. The Node side of this same check is Phase 6.
- Through Phase 3, generated content was never executed — only parsed as
  text/JSON. Phase 4 added real code-execution boundaries: every
  `package.json` script is validated (allowlist + metacharacter rejection
  + substring scan, checked for *every* script name because of npm's
  automatic lifecycle hooks, not just the one about to run) before
  `npm install` ever runs; the build itself uses
  `asyncio.create_subprocess_exec` with an explicit argument array
  (never `shell=True`, nothing string-interpolated into a command); a
  build that isn't cleared by validation is never executed at all
  (`status: "blocked"`). See the Phase 4 status section above for what
  this does *not* yet guarantee.
- Phase 5's own boundary: nothing in `storage/`/`services/` ever persists
  a secret, a raw prompt, a raw provider response, or chain-of-thought —
  `GenerationJob` and `Project` (storage/models.py) only have fields for
  normalized, already-validated data (status, stage, the final file
  manifest). Database-layer exceptions are never returned to a client
  as-is — every storage error maps to `StorageError.code` before it
  reaches a route.

## What's next

Phase 6 (per the spec): the actual Node backend <-> AI service
integration this whole project has been building toward — wiring
`SERVICE_AUTH_TOKEN` on the Node side, and adapting a persisted, `ready`
`Project` into the exact ZIP-in-Supabase contract
`projectExport.service.js` already expects (see this file's Phase 0
section) so it can flow into DevDrop's existing GitHub-publish and
Vercel/Render deployment pipeline unchanged. Not started; per Phase 5's
spec, this waits for explicit go-ahead after review.
