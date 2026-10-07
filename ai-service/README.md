# DevDrop ai-service

Dedicated server for AI Studio's Gemini generation, split out of the main
DevDrop backend so a slow (30–180s) Gemini call never ties up the main
API's connections.

This is the **existing** `backend/src/modules/ai-generate/gemini.service.js`
implementation (models, fallback chain, timeout/retry/503 handling, JSON
repair, import/export validation) moved here unchanged and wrapped in a
small async job API.

## API

- `GET /health` — unauthenticated liveness check.
- `POST /jobs` — body `{ messages, fileData }`, requires `X-Service-Key`.
  Returns `202` with `{ jobId, status: "queued" }` immediately.
- `GET /jobs/:id` — requires `X-Service-Key`. Returns `queued` /
  `processing` / `completed` (with `result`) / `failed` (with `error`).
- `GET /gemini-pool/status` — requires `X-Service-Key`. Live pool snapshot
  (used by the backend admin API — see below).
- `POST /gemini-pool/reload` — requires `X-Service-Key`. Drops the pool's
  short-TTL config cache so an admin change (add/enable/disable/reorder/
  delete a key) takes effect immediately.
- `POST /gemini-pool/keys/:id/test` — requires `X-Service-Key`. Uses the
  encrypted credential already stored in the dedicated Gemini database and
  runs one minimal `generateContent` call against that key only (never
  accepts a plaintext key and never touches the job queue).

Jobs live in an in-memory `Map` with a simple concurrency-limited
in-process queue (`AI_CONCURRENCY`, default 2) — no Redis/BullMQ. The
queue/store sits behind `createJob`/`getJob` in `src/jobs.service.js` so a
Redis-backed version can replace it later without changing callers.

## Gemini API Key Pool

Generation no longer reads a single `GEMINI_API_KEY` directly — every
Gemini call goes through `src/geminiPool.service.js`, which:

- Holds a pool of credentials (from MongoDB, admin-managed via the main
  backend's `/api/admin/gemini-keys` routes) with per-key health,
  priority, and cooldown state.
- Selects the best available key per request (lowest priority number
  first, least-recently-used among ties), skipping disabled/invalid/
  cooling-down keys.
- Automatically fails over to another key on quota/429, 503/overloaded,
  timeouts, and other transient errors (`src/geminiFailureClassifier.js`),
  applying exponential backoff with jitter to the failed key.
- Marks a key `invalid` (and stops selecting it) on auth/permission
  errors, without touching other keys.
- Is capped independently by `AI_CONCURRENCY` (global) and the optional
  `GEMINI_PER_KEY_CONCURRENCY` (per credential) — key count and process
  concurrency are separate knobs.
- Falls back to `GEMINI_API_KEY` / `GEMINI_API_KEYS` (comma-separated) from
  the environment when no key exists yet in Mongo, or when `MONGODB_URI`
  isn't set at all — existing single-key installs need no changes.

Website generation now uses **credential-first fallback**: one credential
tries every configured Gemini model in order before the pool moves to the next
credential. For example: `Key A -> 3.8 -> 3.7 -> 3.6 -> 3.5-lite -> Key B -> ...`.
This keeps model fallback on the same project/key before spending another
project, while separate single-model calls (such as repair/recovery) can still
use the normal `execute()` path.

**Multi-instance note:** the job queue in `jobs.service.js` is
process-local — `AI_CONCURRENCY` limits *one* ai-service process, and
running N instances multiplies available concurrency rather than sharing
a single limit. A distributed queue (e.g. Redis/BullMQ) would be needed
for a strict global cap across instances. The Gemini pool's *config* is
already shared safely via Mongo; its *live* in-memory health/cooldown
state is per-process (each instance reads/writes the same Mongo
document, so state converges but isn't instantly consistent across
instances — acceptable for cooldown/health tracking, not something to
rely on for hard concurrency limits).

## Local setup

```bash
cd ai-service
cp .env.example .env   # fill in SERVICE_API_KEY, GEMINI_MONGODB_URI, and AI_GEMINI_TOKEN_ENCRYPTION_KEY
npm install
npm run dev
```

`SERVICE_API_KEY` here must match `AI_SERVICE_TOKEN` in
`backend/.env`. Defaults to port **3001**.

`AI_GEMINI_TOKEN_ENCRYPTION_KEY` here must exactly match the same
`AI_GEMINI_TOKEN_ENCRYPTION_KEY` in `backend/.env`. The backend encrypts
Gemini API keys before storing ciphertext in the dedicated Gemini MongoDB;
ai-service uses this secret only to decrypt them when making Gemini calls.
The existing backend `TOKEN_ENCRYPTION_KEY` is unrelated and must not be reused.

## Tests

```bash
npm test
```

`tests/geminiPool.test.js` covers key selection, priority/LRU ordering,
cooldown and its expiry, failover on 429/503/timeout, invalid-key
handling, per-key concurrency, and that raw keys never leak into thrown
error messages — all against the env-var bootstrap path, so no database
is required to run them.
