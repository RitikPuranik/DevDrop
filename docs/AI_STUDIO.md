# AI Studio

AI Studio (`/ai-studio`) is a Lovable/Bolt-style "describe it, watch it
build, see it live" experience, built natively into DevDrop — no iframe,
no separate service to run.

- User types a prompt in the chat panel.
- The frontend calls DevDrop's own backend: `POST /api/ai-generate`
  (`backend/src/modules/ai-generate/`), which sends the conversation to
  Gemini and gets back a strict JSON contract:
  `{ assistantMessage, title, files, dependencies }`.
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

## Setup

Backend `.env`:

```
GEMINI_API_KEY=your_gemini_api_key_here
# Optional, defaults to gemini-2.0-flash:
# GEMINI_MODEL=gemini-2.0-flash
```

Frontend: install the two new dependencies (`@codesandbox/sandpack-react`,
`jszip`) — `npm install` in `frontend/` after pulling this change. No new
frontend env vars are needed; `VITE_AI_STUDIO_ENABLED=false` still disables
the whole feature and redirects `/ai-studio` to `/workspace`, same as before.

## What's still not here

- No per-user generation history saved to DevDrop's database — state lives
  only in the browser tab's React state (refresh and it's gone; use
  "Download" to keep a copy).
- No portfolio-specific wizard or asset uploads — it's a free-form chat.
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
