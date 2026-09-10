# DevDrop ai-service Supabase setup

The DevDrop integration does **not** use Supabase Auth for DevDrop users. DevDrop
sends the already-authenticated user ID in `X-User-Id`. Those IDs are strings
(Mongo/ObjectId-style values), so the integration schema deliberately uses
`TEXT` for `user_id` instead of Genie's upstream `UUID REFERENCES auth.users`.

The current service errors that looked like:

- `Could not find the table 'public.generations' in the schema cache`
- `Could not find the function public.claim_pending_job`

are fixed in code by adding the baseline migration:

```text
scripts/migrations/00000000000000_devdrop_ai_service_baseline.sql
```

It creates the service-owned tables and the atomic `claim_pending_job()` function.
The existing `009_codebase_snapshots.sql` and `010_add_snapshot_to_generations.sql`
remain after the baseline and are compatible with the DevDrop string user IDs.

## Apply it to the ai-service Supabase project

Run the SQL in the migration files against the **Supabase project used only by
ai-service**. Do not run these against DevDrop's MongoDB-backed application data.

Recommended order:

1. `00000000000000_devdrop_ai_service_baseline.sql`
2. `009_codebase_snapshots.sql`
3. `010_add_snapshot_to_generations.sql`

If you use the Supabase CLI, place these files under the CLI's
`supabase/migrations/` directory or copy them into the migration workflow you
already use. If you use the Supabase Dashboard SQL Editor, execute the files in
the same order.

After applying them, the following must exist:

- `public.generations`
- `public.chat_messages`
- `public.chat_jobs`
- `public.background_jobs`
- `public.generation_history`
- `public.user_settings`
- `public.agents`
- `public.projects`
- `public.codebase_snapshots`
- `public.claim_pending_job()`

## Required service variables

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
REDIS_URL=
GOOGLE_API_KEY=

SERVICE_API_KEY=
```

`SERVICE_API_KEY` must equal the DevDrop backend's `AI_SERVICE_TOKEN`.

DevDrop uses:

```env
AI_SERVICE_URL=http://localhost:3001
AI_SERVICE_TOKEN=<same value as SERVICE_API_KEY>
```

The browser never receives either service secret.

## Verification

Start ai-service:

```bash
cd services/genie
npm install --legacy-peer-deps
npm run dev
```

Then check:

```text
GET http://localhost:3001/api/status
```

A generation request should then be able to create a row in
`public.generations` instead of failing with `PGRST205`.

The background worker should also stop emitting `PGRST202` for
`claim_pending_job`.

## Node version

The service declares Node 20.x and includes `.nvmrc` with `20`. Its Dockerfile
already uses `node:20-slim`.
