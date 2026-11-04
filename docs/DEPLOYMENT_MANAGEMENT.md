# Vercel deployment history and logs

The deployment page of a Vercel-hosted site shows the status of the site, the
logs of the selected deployment (the latest one by default) and the full
deployment history. DevDrop only reads from Vercel here; it never changes
which deployment is live.

## Architecture
- **Models** (`backend/src/modules/deployment/`): `DeploymentVersion` (persistent DevDrop version number <-> Vercel deployment id; partial unique index: one current production per site) and `VercelWebhookEvent` (dedupe, TTL). A "site" is the existing `Deployment` document.
- **Services** (`backend/src/services/deployment/`): `versionSync`, `deploymentLogs`, `vercelWebhook`, `logRedaction`, `vercelErrors`, `vercelContext`.
- **Version sync**: first sync backfills a bounded history, later syncs read the newest page. Versions are numbered chronologically (v1, v2, ...). Deployments created directly on Vercel are imported too. The "live" marker comes from Vercel's project state.
- **Logs**: bounded snapshot (event/byte/time caps), secrets redacted on ingestion, short-lived in-memory cache, opaque cursor pagination (409 `CURSOR_EXPIRED` once the snapshot is gone). Nothing is persisted.
- **Webhooks**: `POST /api/webhooks/vercel`, raw-body HMAC-SHA1 verification (`x-vercel-signature`), idempotent. The payload is only a hint; state is always re-read from Vercel.

## UI (`frontend/src/components/deployment/management/`)
`DeploymentConsole` is used for settled (success / failed / cancelled) Vercel sites: status hero, logs panel, and the history timeline. Selecting a version in the timeline switches the logs; on first load the newest deployment is selected. While a deployment is still building, the list is re-checked slowly (every 8 s, for at most 10 minutes).

## API (all under `/api/deployments/:deploymentId`, owner-scoped)
| Method | Path | Notes |
|---|---|---|
| GET | `/versions` | cursor pagination, `environment` filter; lazy sync |
| POST | `/versions/sync` | rate limited |
| GET | `/versions/:versionId` | details + log availability |
| GET | `/versions/:versionId/logs`, `/logs/build` | search, severity, time range, cursor |

## Setup
1. Run `node backend/scripts/ensure-deployment-management-indexes.js` once (Mongoose; there are no Prisma migrations).
2. Webhooks (optional, they only make new deployments appear automatically): point your Vercel integration's webhook at `https://<api-host>/api/webhooks/vercel` and select the `deployment.*` events. Integration webhooks are signed with the integration Client Secret, so `VERCEL_CLIENT_SECRET` is enough. Set `VERCEL_WEBHOOK_SECRET` only for an account-level webhook that shows its own secret. With no secret configured the endpoint answers 503.
3. Optional tuning variables are listed in `backend/.env.example`.

## Tests
- Backend: `cd backend && npx jest tests/unit/services/deployment/management tests/api/deployments`
- Frontend: `cd frontend && npx vitest run src/components/deployment`
- Vercel is mocked everywhere; the database layer uses an in-memory fake (`backend/tests/helpers/fakeManagementDb.js`).

## Limitations
- Not exercised against a live Vercel project; some response fields are handled defensively from the docs.
- Runtime logs cover a bounded recent window without server-side filtering; snapshots are per process.
