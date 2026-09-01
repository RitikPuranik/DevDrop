# DevDrop GitHub → Vercel/Render Integration Fix Report

## What was changed

- Added `GET /api/github/repositories` to load repositories from the authenticated user's GitHub account instead of treating existing Vercel projects as the repository source.
- Added GitHub repository listing in `github.service.js` using `/user/repos`, including owner, repo name, default branch, visibility, URL, description, and update time.
- Added a GitHub repository selector directly to the DevDrop deployment page.
- Added GitHub connection support from the deployment page when GitHub is not connected.
- Changed deployment analysis so it can analyze the repository selected from GitHub, even when that repository was never previously exported/deployed through DevDrop.
- Changed deployment creation so the chosen GitHub repository is used as the source for Vercel/Render.
- Made `projectExportId` optional for deployments created from an independently selected GitHub repository.
- Kept server-side ownership verification for the DevDrop purchase/website before deployment.
- Added repository-access verification server-side so clients cannot submit arbitrary inaccessible GitHub repositories.
- Added an initialization guard in `DeployProject.jsx` to prevent React development double-mount behavior from firing duplicate deployment-analysis requests.
- Updated the frontend deployment API to send the selected repository to analyze/create endpoints.

## Important architecture change

GitHub repositories and Vercel projects are now treated as separate things:

GitHub OAuth → GitHub repositories → select repo → analyze → Vercel/Render → create provider project/service → deploy.

The Vercel integration installation page's “All Projects / Specific Projects” controls refer to **existing Vercel projects**, not GitHub repositories. DevDrop no longer depends on that selector to decide which GitHub repositories the user can deploy.

## About the reported 401

The supplied browser log showed `POST /api/deployments/analyze/:websiteId` returning 401. The backend route is intentionally protected by the normal DevDrop JWT middleware. Authentication was not removed. The deployment page now has an initialization guard so React StrictMode/development re-mounting does not repeatedly launch the same analysis flow.

If 401 persists after this change, verify the currently stored `localStorage.token` was issued by the same backend/JWT_SECRET currently running. Log out and log back in after changing `JWT_SECRET` or switching backend environments.

## Vercel installation screen

The frozen “All Projects / Specific Projects” controls are rendered by Vercel, not DevDrop. This code cannot modify that Vercel-owned page. If the Vercel page shows the DevDrop integration as `Installed` while DevDrop does not have a valid connection record, remove the stale DevDrop integration from Vercel once and reconnect it so DevDrop receives a fresh authorization code/token.

Also verify these production values exactly match the Vercel Integration settings:

- `VERCEL_CLIENT_ID`
- `VERCEL_CLIENT_SECRET`
- `VERCEL_INTEGRATION_SLUG`
- `VERCEL_OAUTH_REDIRECT_URI`
- `FRONTEND_URL`

## Changed files

- `backend/src/services/github.service.js`
- `backend/src/modules/github/github.controller.js`
- `backend/src/modules/github/github.routes.js`
- `backend/src/modules/deployment/deployment.controller.js`
- `backend/src/modules/deployment/deployment.model.js`
- `frontend/src/api/github.js`
- `frontend/src/api/deployment.js`
- `frontend/src/pages/deployment/DeployProject.jsx`

## New API

`GET /api/github/repositories`

Query parameters:

- `page`
- `perPage`
- `search`

The endpoint requires DevDrop authentication and an existing GitHub connection. GitHub access tokens remain encrypted/server-side and are never returned to the browser.

## Validation performed

Node syntax checks passed for all changed backend JavaScript files and the deployment model/routes/provider files.

A full Vite production build could not be completed in the execution environment because npm dependency installation timed out before Vite was installed. No successful live GitHub/Vercel/Render OAuth/deployment is claimed because this environment does not have your production credentials.

## Setup checklist

1. Start backend with the same `JWT_SECRET` that issued the current frontend login token, or log out/log in again.
2. Verify `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `GITHUB_OAUTH_REDIRECT_URI`.
3. Ensure GitHub OAuth callback points to `/api/github/callback` on the backend.
4. Verify Vercel integration redirect points to `/api/deployments/providers/vercel/callback` on the backend.
5. If Vercel already says `Installed` but DevDrop says disconnected, uninstall the stale DevDrop Vercel integration and install again once.
6. Open the DevDrop deployment page, connect GitHub, and confirm repositories now appear in the DevDrop repository selector.
7. Select a GitHub repo that has never been deployed to Vercel and start deployment.
