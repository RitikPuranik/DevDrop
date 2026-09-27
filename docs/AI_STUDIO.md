# AI Studio

AI Studio (`/ai-studio`) is a Lovable/Bolt-style "describe it, watch it
build, see it live" experience, built natively into DevDrop.

- User types a prompt in the chat panel.
- The frontend calls DevDrop's own backend: `POST /api/ai-generate`
  (`backend/src/modules/ai-generate/`), which creates a job on the
  dedicated `ai-service/` (so a slow 30–180s Gemini call never ties up
  the main API) and returns a `jobId` immediately.
- The frontend polls `GET /api/ai-generate/jobs/:id` until the job
  completes, then gets back a strict JSON contract:
  `{ assistantMessage, title, files, dependencies }`.
- Gemini credentials are managed by the admin-only Gemini Pool. Keys are
  encrypted by the backend with `AI_GEMINI_TOKEN_ENCRYPTION_KEY` and stored
  in a dedicated MongoDB database (`GEMINI_MONGODB_URI`); ai-service uses
  the matching key only for decryption and Gemini requests.
- The frontend renders `files` live with
  [Sandpack](https://sandpack.codesandbox.io/) (`@codesandbox/sandpack-react`)
  in `components/ai-studio/AppPreview.jsx` — a Code tab and a Preview tab,
  plus a "Download" button that zips the generated project.
- Follow-up prompts ("make the header blue") send the existing files back
  as context so Gemini edits in place instead of starting over.
- If the live preview throws a runtime/compile error, a "Fix with AI" button
  sends that error back to Gemini as a new prompt.

Approach and JSON contract adapted from
[piyush-eon/ai-app-builder](https://github.com/piyush-eon/ai-app-builder),
stripped of its Clerk auth, Supabase, Prisma, credits system, and Cline
"Improve with Agent" step — DevDrop's own login (`auth` middleware) and
backend stand in for all of that instead.

## Why not WebContainer (bolt.diy) anymore

AI Studio previously embedded [bolt.diy](https://github.com/stackblitz-labs/bolt.diy)
in an iframe. Its live preview uses WebContainer, which requires the page
running it to be cross-origin-isolated as the **top-level** document —
nesting it inside DevDrop's own iframe broke that, so the preview silently
failed to boot (visible only as CORS-adjacent errors in DevTools, no
user-facing error). Sandpack has no such restriction — it's designed to run
embedded — which is why this rewrite uses it instead.

## Project persistence & lifecycle

AI Studio projects are **temporary but not time-boxed**: a project stays
alive for as long as the user is actively using that AI Studio tab, however
long that takes, and is only cleaned up once it's actually abandoned.

- **Separate Supabase project.** Generated projects (and their assets) are
  stored in a Supabase project dedicated solely to AI Studio
  (`AI_STUDIO_SUPABASE_URL` / `AI_STUDIO_SUPABASE_SERVICE_ROLE_KEY` /
  `AI_STUDIO_SUPABASE_BUCKET`, `backend/src/shared/config/aiStudioSupabase.js`).
  This is intentionally never the same project/bucket as the marketplace's
  `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, so deleting an abandoned AI
  Studio project can never touch marketplace assets. The bucket is private;
  all access goes through the backend's service-role key, never the
  frontend.
- **Storage isolation.** Every project gets a unique `projectId` (its Mongo
  `_id`) and all of its files live under `ai-studio/{projectId}/` —
  `project.zip` plus `assets/*`. See
  `backend/src/services/ai-studio/aiStudioStorage.service.js`.
- **The ZIP is the source of truth for download/export.** Every time a
  generation or edit completes, the frontend calls
  `POST /api/ai-studio/:projectId/sync` with the latest `files`/
  `dependencies`; the backend rebuilds `project.zip` from that current file
  map (`aiStudioZip.service.js`, via `adm-zip`) and replaces the object in
  Supabase (upsert). Because it always rebuilds from the *current* map, a
  file removed in a later edit is simply absent from the next zip.
- **Activity, not age, drives cleanup.** `AIStudioProject.lastActivityAt` is
  bumped on meaningful actions (generate, edit, asset upload/delete,
  download, resuming a session) and by a lightweight heartbeat
  (`POST /api/ai-studio/:projectId/heartbeat`) sent roughly once a minute
  while the tab is visible (`document.visibilityState`) — see
  `frontend/src/hooks/ai-studio/useAiStudioSession.js`. The heartbeat stops
  entirely once the tab is hidden or gone. There is **no maximum lifetime**
  for a project that keeps generating activity/heartbeats; a multi-hour
  editing session is expected and fine.
- **Refresh / close / crash are all just "heartbeats stopped".** The
  frontend deliberately keeps `projectId`/`sessionId` in React state only
  (never `localStorage`/`sessionStorage`), so a refresh starts a brand-new
  project rather than trying to resume the old one, and the old project's
  heartbeat simply stops. A `pagehide` handler best-effort pings
  `POST /api/ai-studio/:projectId/close` via `navigator.sendBeacon`, but
  this is **never** the only cleanup mechanism — `beforeunload`/`unload`
  aren't relied on at all, since browsers don't guarantee async cleanup
  requests complete. The real safety net is the backend's inactivity
  cleanup worker.
- **Inactivity cleanup worker.** A cron job
  (`backend/src/services/ai-studio/aiStudio.cleanup.cron.service.js`, every
  5 minutes by default via `AI_STUDIO_CLEANUP_CRON`) finds projects with no
  live session and no activity/heartbeat within
  `AI_STUDIO_INACTIVITY_THRESHOLD_MS` (default 20 minutes), re-checks
  activity one more time immediately before deleting anything (to avoid a
  race with the user coming back), then deletes every Supabase object under
  `ai-studio/{projectId}/`, the project's `AIStudioAsset` records, and
  finally the `AIStudioProject` record itself. The project moves through
  `ACTIVE → INACTIVE → CLEANING → DELETED`; if the Supabase deletion step
  fails, the record stays in `CLEANING` (storage prefix intact) so the next
  sweep retries instead of orphaning files or losing track of the project.
- **Multiple tabs.** A project can have more than one open session
  (`AIStudioProject.sessions[]`); it's only considered abandoned once every
  session's heartbeat is stale *and* the project-level activity is stale —
  closing one tab never deletes a project still open in another.
- **Completely separate from `AI_JOB_TTL_MS`.** `AI_JOB_TTL_MS` (in
  `ai-service/.env`) only bounds how long an individual Gemini generation
  *job result* is cached — it has nothing to do with how long an AI Studio
  *project* is allowed to live. A user can spend hours editing a project
  well after any individual generation job's TTL has expired.

API surface (`backend/src/modules/ai-studio/`, mounted at `/api/ai-studio`,
all routes behind the existing `auth` middleware and ownership-checked
against `req.userId`):

```
POST   /api/ai-studio/session                 open/resume a project for this tab
POST   /api/ai-studio/:projectId/heartbeat     lightweight keep-alive
POST   /api/ai-studio/:projectId/activity      explicit meaningful-action ping
POST   /api/ai-studio/:projectId/sync          persist latest files + rebuild project.zip
GET    /api/ai-studio/:projectId/download      short-lived signed URL to project.zip
POST   /api/ai-studio/:projectId/assets        upload an asset
DELETE /api/ai-studio/:projectId/assets/:id    delete an asset
POST   /api/ai-studio/:projectId/close         best-effort "this tab is gone" signal
```

## Setup

Backend `.env`:

```
GEMINI_API_KEY=your_gemini_api_key_here
# Optional, defaults to gemini-2.0-flash:
# GEMINI_MODEL=gemini-2.0-flash

# AI Studio's own, separate Supabase project — see "Project persistence &
# lifecycle" above. Never reuse the marketplace SUPABASE_URL/KEY here.
AI_STUDIO_SUPABASE_URL=
AI_STUDIO_SUPABASE_SERVICE_ROLE_KEY=
AI_STUDIO_SUPABASE_BUCKET=ai-studio-projects
AI_STUDIO_INACTIVITY_THRESHOLD_MS=1200000
AI_STUDIO_CLEANUP_CRON=*/5 * * * *
```

Frontend: install the two new dependencies (`@codesandbox/sandpack-react`,
`jszip`) — `npm install` in `frontend/` after pulling this change. No new
frontend env vars are needed; `VITE_AI_STUDIO_ENABLED=false` still disables
the whole feature and redirects `/ai-studio` to `/workspace`, same as before.

## What's still not here

- No dedicated asset-upload UI in the AI Studio chat itself yet — the
  backend endpoints (`POST/DELETE /api/ai-studio/:projectId/assets`) exist
  and are isolated per `projectId`, but nothing in the current chat/preview
  UI calls them yet.
- No portfolio-specific asset wizard beyond the existing free-form chat.
- No streaming — the generation call is a single request/response, not
  token-by-token like bolt.diy's chat felt. Straightforward to add later
  (Gemini supports streaming; the upstream `ai-app-builder` repo's
  `app/api/gen-ai-code/route.ts` shows an SSE approach) but left out here to
  keep the first working version simple.
- Everything from the earlier Genie/bolt.diy pipeline (wizard steps,
  `PreviewWorkspace`, `useGenerationPolling`/`useWebContainerPreview`,
  `api/ai.js`, `backend/src/modules/ai`, `backend/src/services/genie`,
  `services/genie`, `services/bolt-diy`, `@webcontainer/api`) has been
  deleted outright.
