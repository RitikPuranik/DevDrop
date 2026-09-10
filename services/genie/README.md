# ai-service (Genie engine, vendored into DevDrop)

This directory is a trimmed copy of the **backend** of
[fozagtx/genie](https://github.com/fozagtx/genie) — the multi-agent
website-generation system that replaces DevDrop's old, already-deleted
`ai-service`.

It is vendored (not a git submodule) so DevDrop can pin an exact,
DevDrop-compatible revision and ship one small, auditable patch on top of
it. The service keeps Genie-specific internals, but its DevDrop-facing identity is `ai-service`. The database/auth schema is patched for DevDrop's Mongo-backed string user IDs.

## What was excluded from upstream Genie

- `genie/frontend` — DevDrop already has its own UI (`frontend/src/pages/ai-studio`).
  Genie's Terminal/WebContainer UI is not used; DevDrop drives generation
  through Genie's HTTP API instead.
- `genie/adk-ts` and `genie/shared` at the repo root — build tooling that is not
  needed by the vendored backend service.
- Genie's original root `supabase/migrations` are not vendored verbatim because
  DevDrop users are Mongo-backed string IDs, not Supabase Auth UUIDs. A
  DevDrop-specific baseline is provided under `scripts/migrations/` instead.
- Root-level scratch scripts (`test-*.ts`, `check-gen.ts`) and the local
  `memory/` cache directory — developer scratch files, not part of the
  running service.

## DevDrop-specific integration patches

`src/api/middleware/supabaseAuth.ts` → `optionalAuth()` was extended (search
for "DevDrop integration" in that file) to accept a trusted service-to-service
call: if the request carries `X-Service-Key` matching `SERVICE_API_KEY` and an
`X-User-Id` header, Genie treats that user as authenticated without requiring
a Supabase-issued user JWT.

**Why this was necessary:** Genie's own generation/chat routes
(`/api/generate`, `/api/chat`) call `optionalAuth`, which — as shipped —
only accepts a Supabase Auth user access token. DevDrop authenticates its
own users with its own JWT (Mongo-backed), not Supabase Auth, so DevDrop's
backend cannot present a Supabase user token on the user's behalf. Rather
than bolt Supabase Auth onto DevDrop (a much bigger, riskier change) or make
Genie's generation endpoints unauthenticated, DevDrop reuses Genie's
*existing* `serviceRoleAuth` pattern (`SERVICE_API_KEY` / `X-Service-Key`,
already present in this codebase for a different route) and wires it into
`optionalAuth` too. DevDrop's backend is the only holder of the service key
and it only forwards a user id it has already authenticated itself — so this
is a same-strength trust boundary as the existing pattern, not a weaker one.

Additional DevDrop integration changes include the service-facing environment names (`AI_SERVICE_URL` / `AI_SERVICE_TOKEN`), the DevDrop Supabase baseline under `scripts/migrations/`, Node 20 pinning, and documentation for the separate ai-service deployment.

## Running locally

```bash
cd services/genie
npm install --legacy-peer-deps
cp .env.example .env   # fill in GOOGLE_API_KEY, SUPABASE_*, REDIS_URL, SERVICE_API_KEY
npm run dev
```

Health check: `GET http://localhost:3001/api/status`

## Running with Docker

```bash
cd services/genie
docker build -t devdrop-ai-service .
docker run --env-file .env -p 3001:3001 devdrop-genie
```

## Deploying independently (Render)

Deploy this directory as its own Render Web Service named `ai-service` (Docker or Node
runtime), separate from the DevDrop backend service. Set all variables from
`.env.example`. Point DevDrop's backend at it via `AI_SERVICE_URL` (see
`backend/.env.example`).


### Website preview

The DevDrop AI Studio **Preview Website** button uses Genie's existing Fly.io preview deployment service. Set `FLY_API_TOKEN` in the ai-service environment for preview deployment. Generation itself does not require this variable.
