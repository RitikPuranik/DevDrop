# Kashi — DevDrop assistant

Kashi does two jobs, both powered by a **Groq pool** (never the Gemini pool):

1. **Assistant / navigator** (fast model) — answers basic questions and takes the user to any page ("open AI Studio", "my deployments"). Floating button on every page (`frontend/src/components/kashi/KashiAssistant.jsx`). Navigation targets are validated against `ai-service/src/kashi/appMap.js`; if you add a route in `App.jsx`, add it there too.
2. **Vercel build doctor** (edit model) — on a deployment page, **"Let Kashi fix it"** (or tell Kashi "fix this deployment"):
   read Vercel build log → pick the files the error names → minimal fix → commit to the repo → wait for / trigger the new Vercel deployment → repeat until `READY` (max `KASHI_FIX_MAX_ROUNDS`, default 6).

## READY is not "works": runtime verification
When Vercel reports `READY`, Kashi opens the live site in headless Chromium (`ai-service` → `POST /kashi/runtime-check`, same engine as the generator's smoke test) and fails on uncaught exceptions, console errors, a missing/empty `#root`, or a script/CSS file that 404s. A broken page goes through the same minimal-fix loop in **runtime mode** (the browser report replaces the build log; entry files + components named in the error are supplied). A **missing environment variable** (e.g. `supabaseUrl is required`) is reported as `cannot_fix` with the variable names, never "fixed" by editing code. A checker outage is reported as a failed Kashi run rather than a false success. If the site is behind Vercel Deployment Protection, the run succeeds but says the page could not be verified. Disable with `KASHI_RUNTIME_CHECK=off`. Requires Chromium on the ai-service host: use `ai-service/Dockerfile`, or `npx playwright install --with-deps chromium`.

## "Fix the error and nothing else"
Enforced in code, not only in the prompt (`ai-service/src/kashi/kashi.fix.js`): exact find/replace edits only, on files the log pointed to; each `find` must match exactly once; max 8 edits / 60 changed lines (`KASHI_MAX_EDITS`, `KASHI_MAX_CHANGED_LINES`); lockfiles, `.env*`, `.github/` can't be edited; no new/deleted files; `package.json` must stay valid JSON. Environment problems (missing env var, plan limits) return `cannot_fix` instead of guessing. Previous failed attempts are passed back so the model doesn't repeat them.

## Groq pool
Same MongoDB database as the Gemini pool (`GEMINI_MONGODB_URI`), own collection `groqapikeys`, encrypted with the same `AI_GEMINI_TOKEN_ENCRYPTION_KEY`. Manage keys in **Admin Panel → Groq Pool**. `GROQ_API_KEY(S)` in `ai-service/.env` is only a fallback when the collection is empty.

Two models (`ai-service/.env`):
- `GROQ_FAST_MODEL` (default `llama-3.1-8b-instant`) — chat + navigation
- `GROQ_EDIT_MODEL` (default `llama-3.3-70b-versatile`) — code fixes

## Setup
1. `ai-service/.env`: add `GROQ_*` (see `.env.example`). 2. `backend/.env`: optional `KASHI_*` (see `.env.example`). 3. Add a Groq key in the admin panel.
4. The user needs GitHub **and** Vercel connected in DevDrop (already required for deploying); the fix pushes to the repo's default branch with their GitHub token.

## API
- `POST /api/kashi/chat` · `POST /api/kashi/deployments/:id/fix` · `GET /api/kashi/fix-runs/:runId` · `GET /api/kashi/deployments/:id/fix-runs/latest` · `POST /api/kashi/fix-runs/:runId/cancel`
- Admin: `/api/admin/groq-keys[...]`, `/api/admin/groq-pool/status`
- ai-service: `/kashi/chat`, `/kashi/fix`, `/groq-pool/{status,reload,keys/:id/test}`
