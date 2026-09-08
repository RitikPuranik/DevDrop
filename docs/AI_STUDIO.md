# AI Studio (Phase 6)

AI Studio is DevDrop's guided website-generation product. This phase covers the
user-facing wizard, job tracking, and the DevDrop backend ↔ AI service
integration boundary. It does **not** cover live preview, AI editing, version
history, or any change to GitHub/Vercel/Render deployment — those are future
phases.

## 1. Architecture

```text
DevDrop Frontend (React)
      │  authenticated fetch (existing JWT + axios interceptor)
      ▼
DevDrop Backend  (backend/src/modules/ai)
      │  X-Service-Auth / X-Owner-Id / Idempotency-Key
      ▼
AI Service (FastAPI, ai-service/)
      │
      ▼
AI Pipeline (Requirements → Design → Architecture → Code Gen →
             Static Validation → Build → Debug/Repair → Persist)
```

The AI service remains a fully separate process (`ai-service/`, Phases 1–5)
and was **not** merged into the Node backend. The DevDrop backend is the only
thing that talks to it — the frontend never calls the AI service directly, and
the AI service's own auth secret never reaches the browser.

## 2. AI Studio flow

```text
Website Type → Details → Assets → Design → Review → Generate → Progress → Ready
```

Route: `frontend/src/pages/ai-studio/AiStudio.jsx`, mounted at `/ai-studio` in
`App.jsx` and linked from the navbar (logged-in users only). Step components
live in `frontend/src/components/ai-studio/`. All step state is held in
`AiStudio.jsx` so moving backward between steps never loses input.

Only `websiteType: "portfolio"` is supported this phase. Website types are
config-driven (`frontend/src/config/aiStudio.config.js`) — adding a new type
later means adding a config entry + a `*DetailsStep` component, not rewriting
the wizard.

## 3. API contract

### Create a generation job
`POST /api/ai/generation/portfolio` (authenticated)

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

Only the fields above are forwarded to the AI service — they mirror
`ai-service/routes/planning.py::PortfolioPlanningRequest` exactly.
`targetAudience`, `primaryGoal`, and `contactEmail` are collected on the
frontend for the review screen but are **not** part of the current AI-service
schema, so they are intentionally not sent.

Response: `{ success, jobId, projectId, status, currentStage, repairAttempts, failureCode, failureMessage }`.

### Poll job status
`GET /api/ai/generation/jobs/:jobId` (authenticated, ownership-checked against
the requesting user before the AI service is ever called)

### Retry a failed job
`POST /api/ai/generation/jobs/:jobId/retry` — starts a **new** AI-service job
(new idempotency key) from the original stored request payload rather than
mutating the failed job in place.

### Upload an asset
`POST /api/ai/assets` (`multipart/form-data`, fields: `file`, `type` ∈
`profile-image` | `project-image` | `resume`) — uploaded via the existing
Supabase storage service into the `ai-studio-assets` folder. Returns
`{ type, url, name, path, size }`; only this metadata is ever sent to the AI
service, never raw binaries.

### Errors
Normalized to `{ success: false, message, code, stage }`. The frontend never
sees raw FastAPI/axios internals (stack traces, service URLs, etc.).

## 4. Job status model

`status` ∈ `queued | running | completed | failed | cancelled`.
`currentStage` mirrors `ai-service/orchestrator/state.py::PipelineStage`
(`QUEUED`, `ANALYZING_REQUIREMENTS`, `CREATING_DESIGN`,
`CREATING_ARCHITECTURE`, `GENERATING_CODE`, `VALIDATING_PROJECT`, `BUILDING`,
`DEBUGGING`, `PATCHING`, `COMPLETED`, `FAILED`).

**Note:** as of Phase 5, `POST /v1/generation/jobs` on the AI service runs the
pipeline synchronously and returns its final state in one call — there is no
background worker yet. `GET /api/ai/generation/jobs/:jobId` polling
(`frontend/src/hooks/useGenerationPolling.js`, 3s interval, exponential
backoff on transient failures, cleans up on unmount) is implemented so the UI
is ready for the AI service to move to async execution later without a
frontend change.

## 5. Asset flow

Reuses the existing Supabase Storage service (`backend/src/services/
supabase.service.js`) and `multer` memory-storage pattern — no new storage
platform. Validation: extension **and** MIME type must both match an allow
list (jpg/png/webp/pdf), 8MB max (`MAX_FILE_SIZE_AI_ASSET`).

## 6. Authentication & ownership

AI Studio requires the existing DevDrop JWT session — there is no separate
AI Studio login. `AiGenerationJob` (`backend/src/modules/ai/
aiGenerationJob.model.js`) is a DevDrop-side record mapping `userId` →
AI-service `jobId`/`projectId`, used purely to enforce that a user can only
poll/retry their own jobs. It is intentionally **not** the AI service's own
job store, and it is intentionally **not** merged into the marketplace
`Website` model — an AI-generated project is treated as a generation
artifact, distinct from an application-owned marketplace listing.

## 7. Environment variables

Backend (`backend/.env`, never exposed to the frontend):
```
AI_SERVICE_URL=http://localhost:8000
AI_SERVICE_AUTH_TOKEN=<shared secret, must match the AI service>
MAX_FILE_SIZE_AI_ASSET=8388608
AI_GENERATION_RATE_LIMIT_WINDOW_MS=3600000
AI_GENERATION_RATE_LIMIT_MAX_REQUESTS=10
```

Frontend (`frontend/.env`):
```
VITE_AI_STUDIO_ENABLED=true   # feature gate only — no secrets here
```

## 8. Known limitations / deferred (Phase 7+)

- Live browser preview of the generated project (placeholder button only)
- AI chat / element-level editing
- Version history
- Syncing an AI-generated project into a first-class DevDrop `Website`
  record, and any GitHub export / Vercel / Render deployment integration for
  generated projects
- The AI service currently runs generation synchronously in one HTTP call;
  polling is implemented defensively for when that becomes async
