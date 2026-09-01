# DevDrop Auth / GitHub Repository Fix

## What was happening

The deployment page calls `/api/github/repositories`. That endpoint can return HTTP 401 when the **GitHub OAuth token** stored for the DevDrop user has expired/revoked access. The frontend had a global Axios interceptor that treated **every** HTTP 401 as proof that the DevDrop JWT was invalid, removed `localStorage.token`, and dispatched `auth-changed`.

That created this cascade:

1. GitHub repository request returns 401 from the GitHub provider.
2. DevDrop frontend incorrectly deletes the user's DevDrop JWT.
3. The next `/api/github/exports/website/...` request is now genuinely unauthorized.
4. The deployment page appears to log the user out and shows no repositories.

## Fix

- DevDrop auth middleware now marks its own JWT failures with `AUTH_TOKEN_*` response codes.
- The frontend Axios interceptor logs the user out only for those explicit DevDrop-auth codes.
- GitHub provider-token failures use `GITHUB_CONNECTION_EXPIRED` and no longer log the user out of DevDrop.
- The deployment page shows a clear **Reconnect GitHub** action when GitHub repository authorization has expired/revoked.
- The deployment page does not make the previous-export request after a repository-provider authorization failure.
- Repository search input has `autocomplete="off"` to remove the browser warning on that field.

## Important

If the GitHub token itself is actually revoked/expired, the user must click **Reconnect GitHub** once. This is expected provider behavior; it is not a DevDrop account logout.

The repository endpoint remains server-authenticated and continues to read repositories directly from GitHub, including repositories that do not already exist on Vercel.

## Validation

Node syntax checks passed for the modified backend JavaScript files. Live GitHub/Vercel/Render OAuth and deployment cannot be verified in this environment because the user's real provider credentials are not available.
