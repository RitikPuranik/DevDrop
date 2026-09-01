# DevDrop Vercel Integration Setup

This document covers the Vercel Integration Console settings required by DevDrop's real deployment API integration.

## Integration Console

Open the DevDrop integration in the Vercel Integrations Console and verify these API scopes are enabled:

| Scope | Permission | Why DevDrop needs it |
|---|---|---|
| `project` | Read/Write | List existing projects and create/update projects |
| `deployment` | Read/Write | Create deployments and read deployment status |
| `project-env-vars` | Write | Create/update integration-owned project environment variables |
| `team` | Read | Load team/account information |
| `user` | Read | Identify the connected Vercel account |
| `integration-configuration` | Read/Write | Read/manage the installed integration configuration |

Do not grant unrelated scopes such as billing, domains, log drains, or global project environment variables unless a future DevDrop feature explicitly requires them.

Vercel documents these scopes separately from project access. The `project` scope controls what the integration may do through the API, while the installation's Access setting controls which projects the installation can reach.

## Installation Access

After installing DevDrop for a Vercel account/team:

1. Open the Vercel Dashboard.
2. Open **Integrations**.
3. Find the DevDrop integration and select **Manage**.
4. Under **Access**, select **Manage Access**.
5. Select **All Projects** when DevDrop should deploy and manage any project in that account/team.
6. Save the change.

Vercel's current documentation states that project access is managed from the installed integration's Access section.

## Important: Existing installations

Changing the integration's API scopes does not silently rewrite every existing installation. Vercel may mark an installation as having pending permission changes and require the account/team owner to confirm them.

For a clean test after changing scopes:

1. Disconnect/uninstall the old DevDrop integration from the Vercel account/team.
2. Reconnect DevDrop from the current DevDrop app.
3. Choose the intended Vercel account/team.
4. Choose **All Projects**.
5. Approve the requested permissions.

## DevDrop callback

The Vercel Integration Console Redirect URL must exactly match:

```text
<BACKEND_URL>/api/deployments/providers/vercel/callback
```

DevDrop starts the external installation at:

```text
https://vercel.com/integrations/<VERCEL_INTEGRATION_SLUG>/new
```

The current DevDrop server also supplies the Vercel external installation `next` parameter so the browser has an explicit post-install destination.

## Environment variables

```env
VERCEL_CLIENT_ID=
VERCEL_CLIENT_SECRET=
VERCEL_INTEGRATION_SLUG=
VERCEL_OAUTH_REDIRECT_URI=<BACKEND_URL>/api/deployments/providers/vercel/callback
TOKEN_ENCRYPTION_KEY=
```

Never commit real values.

## Why Selected Projects can work while All Projects does not

Selected-project access can succeed when the installation has access to those specific projects. All-project access is a broader installation-level permission and is managed separately in Vercel's Access settings. If the integration's API scopes or the current installation permissions are incomplete, the All Projects path can fail before DevDrop receives a usable callback.

DevDrop itself does not use the Vercel dashboard project list as the repository source of truth. GitHub repositories remain the deployment source; Vercel projects are deployment targets created or linked by DevDrop through the API.
