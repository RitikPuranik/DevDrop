# Vercel deployment management

Version history, one-click rollback and logs for sites deployed to Vercel.
A "site" is the existing `Deployment` document; each Vercel deployment becomes a `DeploymentVersion`.

## Architecture
- **Models** (`backend/src/modules/deployment/`): `DeploymentVersion` (persistent DevDrop version number ↔ Vercel deployment id; partial unique index: one current production per site), `RollbackOperation` (audit trail per attempt; partial unique indexes: one active operation per Vercel project, idempotency key per site), `VercelWebhookEvent` (dedupe, TTL).
- **Services** (`backend/src/services/deployment/`): `versionSync`, `rollback`, `deploymentLogs`, `vercelWebhook`, `rollbackEligibility`, `logRedaction`, `vercelErrors`.
- **Rollback** uses Vercel's instant rollback (previously promoted production deployments) or promote (staged production deployments). No rebuild. The request is sent once; ambiguous outcomes (timeout/5xx) are reconciled against Vercel's current production deployment, never blindly re-sent.
- **State machine**: pending → requesting → verifying → succeeded | failed | verification_timeout | unverified. DevDrop's "current production" pointer only moves after Vercel reports the target as live. Verification runs lazily while the UI polls, with a `VERIFY_ROLLBACK` BullMQ job as a backstop.
- **Logs**: bounded snapshot (events/bytes/time caps), secrets redacted on ingestion, short-lived in-memory cache, opaque cursor pagination (409 `CURSOR_EXPIRED` once the snapshot is gone). Nothing is persisted.
- **Webhooks**: `POST /api/webhooks/vercel`, raw-body HMAC-SHA1 verification, idempotent. The payload is only a hint; state is always re-read from Vercel.

## API (all under `/api/deployments/:deploymentId`, owner-scoped)
| Method | Path | Notes |
|---|---|---|
| GET | `/versions` | cursor pagination, `environment` filter; lazy sync |
| POST | `/versions/sync` | rate limited |
| GET | `/versions/:versionId` | details + log availability |
| GET | `/rollback-check?versionId=` | read-only preflight |
| POST | `/rollback` | body `{versionId, confirm:true, idempotencyKey}`; 202, or 200 for an idempotent replay |
| GET | `/rollbacks`, `/rollback/:operationId` | history / status |
| POST | `/rollback/:operationId/retry` | |
| GET | `/versions/:versionId/logs`, `/logs/build` | search, level, time range, cursor |

## Setup
1. Run `node backend/scripts/ensure-deployment-management-indexes.js` once (Mongoose; no Prisma migrations exist).
2. Set `VERCEL_WEBHOOK_SECRET` (see `backend/.env.example` for all optional tuning variables).
3. In the Vercel integration, add a webhook to `https://<api-host>/api/webhooks/vercel` for deployment created/ready/error/promoted events, using the same secret.
4. The connected Vercel token needs access to read deployments/events/logs and to promote deployments on the project.

## Tests
- Backend: `cd backend && npx jest tests/unit/services/deployment/management tests/api/deployments/deploymentVersions.api.test.js`
- Worker: `cd worker && npx jest tests/unit/deploymentProcessor.test.js`
- Frontend: `cd frontend && npx vitest run src/components/deployment`
- Vercel is mocked everywhere; the database layer uses an in-memory fake (`backend/tests/helpers/fakeManagementDb.js`).

### Integration test against a real Vercel project
1. Create a throwaway Vercel project and deploy it from DevDrop twice (two production deployments).
2. Open the site's deployment page → "Deployment history"; confirm v1/v2, v2 marked Live.
3. Roll back to v1; confirm the progress dialog ends in success, v1 becomes Live and the Vercel dashboard agrees.
4. Confirm the "automatic production deployments paused" banner, then use "Undo Rollback" in Vercel and click Refresh.
5. Push a commit directly to the repo; confirm the new version appears after Refresh or webhook delivery.

## Limitations
- Not exercised against live Vercel; some response fields (`targets.production.id`, alias job status) are handled defensively from docs.
- No in-app "undo rollback"; the UI explains how to do it in Vercel.
- Runtime logs cover a bounded recent window without server-side filtering; snapshots are per process.
- Rollback verification jobs share the deployment queue (concurrency 1); the request itself is sent inline.
