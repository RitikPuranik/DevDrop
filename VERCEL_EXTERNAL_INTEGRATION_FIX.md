# DevDrop Vercel External Integration Fix

This build uses Vercel's documented External Integration installation flow.

## Correct flow

1. A logged-in DevDrop user clicks **Connect Vercel**.
2. DevDrop creates a short-lived signed `state` containing the DevDrop user ID.
3. DevDrop opens `https://vercel.com/integrations/devdrop/new?state=...&next=...`.
4. The user chooses their Vercel personal account or a team and project access.
5. Vercel redirects to the configured backend Redirect URL:
   `/api/deployments/providers/vercel/callback`.
6. The backend verifies `state`.
7. The backend exchanges the one-time `code` at `/v2/oauth/access_token` using only:
   `client_id`, `client_secret`, `code`, and the exact configured `redirect_uri`.
8. The backend stores the encrypted Vercel access token together with `teamId` and `configurationId`.
9. The backend redirects to DevDrop's frontend completion page.
10. The frontend only refreshes the UI. It never sees the Vercel access token.

## Important configuration

For the deployed DevDrop backend, Vercel's Redirect URL must be exactly:

`https://devdrop-ah3e.onrender.com/api/deployments/providers/vercel/callback`

Backend environment variables:

- `VERCEL_CLIENT_ID` = the Integration ID from Vercel
- `VERCEL_CLIENT_SECRET` = the Integration Secret from Vercel
- `VERCEL_INTEGRATION_SLUG=devdrop`
- `VERCEL_OAUTH_REDIRECT_URI=https://devdrop-ah3e.onrender.com/api/deployments/providers/vercel/callback`
- `FRONTEND_URL=https://dev-drop-gamma.vercel.app`

Do not put the Vercel client secret in the frontend.

## Why configurationId is not sent to the token exchange

Vercel's documented token exchange requires `client_id`, `client_secret`, `code`, and `redirect_uri`. The `configurationId` returned during installation identifies the installation/configuration and is stored separately. It is not required in the `/v2/oauth/access_token` request body.

## If Vercel itself says Access denied before the callback

That failure occurs on Vercel's installation page, before DevDrop's callback is reached. It cannot be fixed by React UI code.

For the developer's test account, remove the old DevDrop installation from that exact Vercel personal account/team and start a fresh installation. If the account/team is already installed by another user, the Vercel team owner/installer may need to manage that installation instead. Each team installation has its own access token and configuration.

End users should not configure DevDrop's integration, client secret, redirect URL, or API scopes. They only authorize DevDrop from the Connect Vercel button.
