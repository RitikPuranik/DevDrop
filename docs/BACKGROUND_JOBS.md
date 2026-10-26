# Background jobs (BullMQ + Upstash)

## Overview

All background work runs on **BullMQ**. There is exactly one queue architecture and two Upstash Redis databases:

| Database | Env var | Used for |
|---|---|---|
| Queue DB | `QUEUE_REDIS_URL` | BullMQ only: `ai-queue`, `deployment-queue`, `events-queue` |
| Cache DB | `CACHE_REDIS_URL` | Disposable cache only (public marketplace listings). Optional: without it requests are served from MongoDB |

Neither connection ever falls back to the other. Use Upstash's TCP/TLS URL (`rediss://...`); BullMQ cannot run over the REST API.

| Queue | Producer | Worker process | Work |
|---|---|---|---|
| `ai-queue` | backend | `ai-service` | AI Studio generate / edit / debug |
| `deployment-queue` | backend | `worker` | deployments, GitHub exports, Kashi fix runs |
| `events-queue` | backend | `worker` | transactional email (verification, password reset, welcome, purchase, seller sale, status, payout, admin alerts, outbid), outbox republisher, auction processing, cleanups, backups |

- MongoDB (`QueueJob` collection) holds the durable job record: status, progress, attempts, sanitized error, provider acceptance for emails. Redis holds only queue state. Large inputs/results (AI payloads, generated sites) stay in MongoDB, never Redis.
- Business-event emails are **outboxed**: the intent is written to MongoDB first, then published to BullMQ; a sweeper (`OUTBOX_SWEEP`, every minute) republishes anything not yet accepted by Redis. Verification/reset emails carry a secret token, so they are *not* stored for later: if the queue is down the request returns `503`.
- Email jobs track *queue acceptance* and *provider acceptance* (Brevo `messageId`) separately. Delivery confirmation is not tracked (no provider webhook is integrated).
- Schedules (auctions, cleanups, backups, outbox sweep) are BullMQ job schedulers on `events-queue`, registered idempotently at worker start.
- Backend progress for AI jobs still arrives over Socket.IO (`ai-job:<jobId>`; only the job owner can subscribe) and `GET /api/ai-generate/jobs/:id` recovers status after a refresh.

Processes to run: `backend` (HTTP + Socket.IO + producers), `worker` (`node server.js`, deployment + events workers + schedules, exposes `/health`), `ai-service` (`node server.js`, ai-queue worker).

## AI generation flow

1. The frontend calls `POST /api/ai-generate`; the Backend stores the job input in MongoDB, enqueues it on `ai-queue` and returns a `jobId` (`202`).
2. The `ai-service` worker fetches the input from the Backend, runs its agents (requirements, architecture, design, code generation, integration, validation, debug) and reports progress by webhook; the Backend updates MongoDB and emits Socket.IO events. Status can be recovered with `GET /api/ai-generate/jobs/:id`; `DELETE` cancels.
3. The result is `{ assistantMessage, title, files, dependencies }`, rendered live in Sandpack.

Quota exhaustion delays the job (bounded, `AI_QUOTA_*`) instead of retrying immediately; transient errors retry with exponential backoff; permanent errors never retry. Results are kept in MongoDB for 30 minutes, so "Retry Debug Only" still needs a recent failed job.

