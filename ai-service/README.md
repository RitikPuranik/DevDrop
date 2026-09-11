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

Jobs live in an in-memory `Map` with a simple concurrency-limited
in-process queue (`AI_CONCURRENCY`, default 2) — no Redis/BullMQ. The
queue/store sits behind `createJob`/`getJob` in `src/jobs.service.js` so a
Redis-backed version can replace it later without changing callers.

## Local setup

```bash
cd ai-service
cp .env.example .env   # fill in GEMINI_API_KEY and SERVICE_API_KEY
npm install
npm run dev
```

`SERVICE_API_KEY` here must match `AI_SERVICE_TOKEN` in
`backend/.env`. Defaults to port **3001**.
