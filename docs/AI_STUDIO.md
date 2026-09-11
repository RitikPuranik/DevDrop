# AI Studio

AI Studio (`/ai-studio`) is a full-screen embed of
[bolt.diy](https://github.com/stackblitz-labs/bolt.diy), vendored at
`services/bolt-diy/`. Users type a prompt, bolt.diy generates a project with
an LLM, and runs + live-previews it in-browser via WebContainer — chat, file
tree, terminal, and preview all live inside that embed.

DevDrop's own role is small: gate the route behind login and host the embed
full-bleed (`frontend/src/pages/ai-studio/AiStudio.jsx`), pointed at
`VITE_BOLT_DIY_URL`.

**Removed:** the earlier guided wizard (Website Type → Details → Assets →
Design → Review → Generate), DevDrop's own generation-job model
(`AiGenerationJob`), the WebContainer-based `PreviewWorkspace`, and the
Genie microservice bridge (`backend/src/modules/ai`,
`backend/src/services/genie`, `services/genie`) have all been deleted —
they're superseded by bolt.diy and were no longer called by anything.

See `services/bolt-diy/DEVDROP_INTEGRATION.md` for setup, required env vars,
and what functionality was traded away by this move (no per-user job
history, no asset-upload flow, no DevDrop-specific onboarding — bolt.diy is
a general-purpose prompt-to-app tool, not a portfolio wizard).
