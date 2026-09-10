# AI Studio (Phase 6 — now backed by Genie)

AI Studio is DevDrop's guided website-generation product. This doc covers the
user-facing wizard, job tracking, and the DevDrop backend ↔ Genie
microservice integration boundary. It does **not** cover live preview,
version history, or any change to GitHub/Vercel/Render deployment for
AI-generated projects — those remain future work (see §8).

> **History:** DevDrop originally called a bespoke FastAPI `ai-service`
> (Phases 1–5). That service has been deleted. AI Studio's generation
> backend is now [Genie](https://github.com/fozagtx/genie), a multi-agent
> code-generation system, vendored into this repo at `services/genie/` and
> run as its own independently deployable process. See
> `services/genie/README.md` for exactly what was vendored and why.

## 1. Architecture

```text
DevDrop Frontend (React)
      │  authenticated fetch (existing DevDrop JWT + axios interceptor)
      ▼
DevDrop Backend  (backend/src/modules/ai, backend/src/services/genie)
      │  X-Service-Key / X-User-Id
      ▼
Genie microservice (services/genie — Node/Express, vendored)
      │
      ├── Gemini API   (GOOGLE_API_KEY)   — coding agents
      ├── OpenAI API   (OPENAI_API_KEY)   — review/chat agents
      ├── Redis        (REDIS_URL)        — Bull job queues
      └── Supabase     (SUPABASE_*)       — Genie's own generation/chat storage
      ▼
Generated React + TypeScript project (files returned to DevDrop)
```

Genie is a fully separate process from the DevDrop Node backend — DevDrop's
backend is the only thing that talks to it. The frontend never calls Genie
directly, and Genie's LLM provider keys never reach the browser.

Genie has its own Supabase project for storing generations/chat history —
this is intentionally **not** shared with DevDrop's MongoDB, so the two
services stay independently deployable and Genie's schema changes can't
break DevDrop's data model (see §7 for required env vars on each side).

## 2. AI Studio flow

```text
Website Type → Details → Assets → Design → Review → Generate → Progress → Ready
```

Route: `frontend/src/pages/ai-studio/AiStudio.jsx`, mounted at `/ai-studio` in
`App.jsx` and linked from the navbar (logged-in users only). Step components
live in `frontend/src/components/ai-studio/`. All step state is held in
`AiStudio.jsx` so moving backward between steps never loses input. **None of
this wizard UI changed** as part of the Genie migration — only what DevDrop's
backend does with the submitted data changed.

Only `websiteType: "portfolio"` is supported today. Website types are
config-driven (`frontend/src/config/aiStudio.config.js`) — adding a new type
later means adding a config entry + a `*DetailsStep` component, not rewriting
the wizard.

## 3. API contract

### Create a generation job
`POST /api/ai/generation/portfolio` (authenticated)

Request body is **unchanged from before the migration** — the frontend still
submits DevDrop's structured portfolio brief:

```json
{
  "websiteType": "portfolio",
  "userData": {
    "name": "...", "role": "...", "bio": "...",
    "skills": ["..."],
    "projects": [{ "title": "...", "description": "...", "link": "..." }],
    "socialLinks": { "github": "...", "linkedin": "..." }
  },
  "preferences": { "style": "modern", "theme": "dark", "animations": true },
  "assets": [{ "type": "profile-image", "url": "...", "name": "..." }]
}
```

What's new is what DevDrop's backend does with it: `backend/src/services/
genie/service.js` (`buildPortfolioPrompt`) deterministically turns this brief
into the single natural-language `prompt` string Genie's `POST /api/generate`
actually accepts, plus `targetLanguage: "typescript"` and any uploaded
image URLs. `targetAudience`, `primaryGoal`, and `contactEmail` are collected
on the frontend for the review screen but are not part of the prompt.

Response: `{ success, jobId, projectId, status, repairAttempts, failureMessage, previewUrl, deploymentStatus }`.
`jobId` and `projectId` are both Genie's generation id — Genie has no
separate "project" concept, so both fields carry the same value for
frontend backward-compatibility.

### Poll job status
`GET /api/ai/generation/jobs/:jobId` (authenticated, ownership-checked
against the requesting DevDrop user *before* Genie is ever called). Only
requests Genie's full file contents (`?full=true`) once the job is about to
finish or has already finished — never on every poll tick.

### Retry a failed job
`POST /api/ai/generation/jobs/:jobId/retry` — starts a **new** Genie
generation from the original stored request payload rather than mutating
the failed job in place.

### Modify a completed project (new — Section 5, iterative editing)
`POST /api/ai/generation/jobs/:jobId/modify` with `{ "message": "change the
navbar to dark blue and add a login button" }`. Requires the job to have
completed at least once. DevDrop sends the message to Genie's `POST
/api/chat` together with the project's last known files (cached on the
`AiGenerationJob` record from the most recent `full=true` fetch), so Genie
edits the existing project instead of generating something unrelated. The
job's status flips back to `processing`; the existing polling endpoint picks
up the result once Genie finishes applying the edit.

> **Frontend note:** this endpoint is implemented and tested on the backend,
> but no "chat with your project" UI has been wired up in AI Studio yet —
> see §8.

### Upload an asset
`POST /api/ai/assets` (`multipart/form-data`, fields: `file`, `type` ∈
`profile-image` | `project-image` | `resume`) — uploaded via the existing
Supabase storage service into the `ai-studio-assets` folder. Returns
`{ type, url, name, path, size }`; only image URLs are ever sent to Genie,
never raw binaries.

### Errors
Normalized to `{ success: false, message, code }`. The frontend never sees
raw HTTP/Genie internals (stack traces, service URLs, etc.) — see
`backend/src/services/genie/client.js::normalizeError` for the full mapping
(unconfigured service → 503, timeout → 504, unreachable → 502, 401/403 from
Genie → `AI_SERVICE_AUTH_ERROR`).

## 4. Job status model

`status` ∈ `pending | processing | completed | failed` — this is Genie's own
`generations.status` vocabulary, used as-is by DevDrop (`AiGenerationJob.
status`) rather than maintaining a second, parallel vocabulary.

**Note:** Genie does not expose granular per-stage progress
(planning/designing/writing code/etc.) over its polled REST API — only a
flat status. It does emit richer `generation:progress` Socket.io events
internally, but DevDrop's backend does not proxy those yet (see §8), so
`GenerationProgress.jsx` shows an honest generic "Genie is generating your
website…" state rather than a fabricated step checklist. `useGenerationPolling.js`
(3s interval, exponential backoff on transient failures, cleans up on
unmount) is unchanged.

## 5. Asset flow

Unchanged: reuses the existing Supabase Storage service
(`backend/src/services/supabase.service.js`) and `multer` memory-storage
pattern — no new storage platform. Validation: extension **and** MIME type
must both match an allow list (jpg/png/webp/pdf), 8MB max
(`MAX_FILE_SIZE_AI_ASSET`).

## 6. Authentication & ownership

AI Studio requires the existing DevDrop JWT session — there is no separate
AI Studio login, and DevDrop does **not** implement Supabase Auth for its
own users. `AiGenerationJob` (`backend/src/modules/ai/
aiGenerationJob.model.js`) is a DevDrop-side record mapping `userId` →
Genie `genieGenerationId`, used to enforce that a user can only
poll/retry/modify their own jobs, and to cache the last known file set for
modification requests. It is intentionally **not** Genie's own generation
record, and it is intentionally **not** merged into the marketplace
`Website` model.

**Service-to-service auth:** because Genie's own auth middleware expects a
Supabase-issued user access token (which DevDrop's backend does not have —
DevDrop users aren't Supabase Auth users), DevDrop authenticates to Genie as
a trusted service instead: every request carries `X-Service-Key:
AI_SERVICE_TOKEN` plus `X-User-Id: <already-authenticated DevDrop user
id>`. This required one small patch to Genie's `optionalAuth` middleware,
documented in `services/genie/README.md`. `AI_SERVICE_TOKEN` /
`SERVICE_API_KEY` never reaches the DevDrop frontend or the browser.

## 7. Environment variables

Backend (`backend/.env`, never exposed to the frontend):
```
AI_SERVICE_URL=http://localhost:3001
AI_SERVICE_TOKEN=<shared secret, must match services/genie SERVICE_API_KEY>
MAX_FILE_SIZE_AI_ASSET=8388608
AI_GENERATION_RATE_LIMIT_WINDOW_MS=3600000
AI_GENERATION_RATE_LIMIT_MAX_REQUESTS=10
```

Genie service (`services/genie/.env`, its own process — see
`services/genie/.env.example` for the full, commented list):
```
GOOGLE_API_KEY=
OPENAI_API_KEY=
RUNWARE_API_KEY=            # optional — AI image generation
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
REDIS_URL=redis://localhost:6379
SERVICE_API_KEY=            # must match AI_SERVICE_TOKEN above
PORT=3001
```

Frontend (`frontend/.env`):
```
VITE_AI_STUDIO_ENABLED=true   # feature gate only — no secrets here
```

## 8. Known limitations / deferred

- Live browser preview of the generated project (placeholder button only) —
  unchanged from before the migration.
- No "chat with your project" UI yet, even though the backend `/modify`
  endpoint (§3) is implemented and unit-tested — wiring a follow-up-message
  UI into `AiStudio.jsx`'s "Ready" screen is deferred.
- Real-time granular progress (Genie's `generation:progress` Socket.io
  events) is not proxied to the frontend; only flat status polling is wired
  up (§4). A future change could have DevDrop's backend join Genie's
  Socket.io room server-side and forward simplified progress events over
  its own WebSocket/SSE channel to the frontend without exposing Genie's
  connection details to the browser.
- Syncing an AI-generated project into a first-class DevDrop `Website`
  record, and any GitHub export / Vercel / Render deployment integration for
  Genie-generated projects specifically, is not implemented. DevDrop's
  existing GitHub/deployment pipeline (§ architecture doc) is unchanged and
  can be pointed at a generated project's files manually today; automatic
  "deploy what Genie just built" wiring is future work.
- Genie's own GitHub agent/MCP tools and Fly.io deployment path are not
  used by DevDrop and were not vendored — DevDrop's existing GitHub/Vercel/
  Render integration is the intended path for shipping a generated project.
