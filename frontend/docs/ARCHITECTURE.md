# Frontend Architecture

This guide describes the current DevDrop frontend as implemented under `frontend/src`.

## 1. Runtime Layers

```text
main.jsx
   │
   ├── Sentry browser monitoring
   ├── PostHog provider
   └── App.jsx
         │
         ├── BrowserRouter
         ├── global loaders / intro flow
         ├── Navbar / Footer
         ├── route-level pages
         └── global toast notifications
```

## 2. Routing

`src/App.jsx` is the route composition layer. Route-level pages are grouped by product area:

- `pages/marketing/` for public informational pages
- `pages/marketplace/` for discovery, detail, checkout, and purchase access
- `pages/account/` for profile and workspace experiences
- `pages/deployment/` for personal/purchased project deployment and provider callbacks
- `pages/auth/` for email verification and password reset
- `pages/admin/` for the administration interface

`/dashboard` intentionally redirects to `/workspace` so older links remain usable without maintaining a second dashboard implementation.

## 3. Component Organization

Reusable components belong under `src/components/` and are grouped by responsibility rather than by a single global component list. Current categories include layout and loader components plus reusable product/UI pieces.

A useful ownership rule is:

```text
Page component      -> owns route-level orchestration
Feature component   -> owns reusable feature UI/behavior
Service module      -> owns API/integration communication
App.jsx              -> owns routing and global shell decisions
main.jsx             -> owns application bootstrap and global providers
```

Avoid moving feature-specific API calls or large page implementations into `App.jsx`.

## 4. Startup and Global State

On startup the app:

1. Checks session storage for the `devdrop_intro_seen` marker.
2. Displays the intro loader only when the marker has not been set.
3. Preloads the shared home-page hero video.
4. Initializes the global router and shell.
5. Configures the global Sonner toast container.

Standalone authentication and OAuth callback routes suppress the normal shared navigation/loading chrome where required by the flow.

## 5. API Boundary

The frontend communicates with DevDrop's backend API through the configured `VITE_API_URL` environment variable.

Sensitive operations remain backend-owned, including:

- authentication and authorization decisions
- database operations
- payment verification
- file storage credentials
- GitHub access tokens and repository writes
- Vercel and Render credentials
- backup/restore operations

The browser should never contain private service credentials merely to call an API.

## 6. Integrations

### Sentry

Configured from `VITE_SENTRY_DSN` in `main.jsx`. Browser tracing and replay are enabled when the DSN is present.

### PostHog

Mounted through `PostHogProvider` using `VITE_POSTHOG_PROJECT_TOKEN` and `VITE_POSTHOG_HOST`. Person profiles are configured for identified users only.

### Razorpay

The browser receives the public Razorpay key through `VITE_RAZORPAY_KEY_ID`. Signature and payment verification remain backend responsibilities.

### Google OAuth

The frontend exposes the Google OAuth client ID through `VITE_GOOGLE_CLIENT_ID`; the backend handles the protected OAuth/token-processing side of the flow.

## 7. Deployment UI

The deployment area supports two high-level workflows:

```text
Purchased project
    -> deployment analysis
    -> provider connection
    -> deployment creation
    -> deployment details / redeploy / cancel

Own GitHub project
    -> repository analysis
    -> provider connection
    -> personal deployment
```

Vercel's callback page has its own frontend route at `/deploy/vercel-callback`. The backend handles the provider exchange and credential persistence.

## 8. Build and Performance

Vite is configured with React and Tailwind plugins. Production builds use Terser and remove `console`/`debugger` statements. Vendor dependencies are manually chunked into stable groups for React/router, animation, UI, and GSAP packages.

This gives the application a predictable bundle layout and keeps large animation/UI dependencies from being bundled into the primary vendor chunk.

## 9. Styling and UI

Tailwind CSS is integrated through the Vite plugin. Framer Motion and GSAP handle animation where appropriate, while Lucide React supplies iconography and Sonner supplies user-facing toast notifications.

Prefer existing design primitives and shared styles before introducing one-off visual systems inside individual pages.

## 10. Navigation and Shell Exceptions

The shared shell is intentionally not rendered for some routes:

- `/website` builder context
- `/workspace` and `/dashboard` workspace context for the footer
- `/verify-email`
- `/reset-password`
- `/deploy/vercel-callback`

These exceptions are part of the current UX contract and should be preserved when changing global layout behavior.

## 11. Change Guidelines

When adding a frontend feature:

1. Add the route-level screen under the correct `pages/` domain.
2. Extract reusable visual/behavioral pieces into `components/`.
3. Put API communication in the appropriate service/helper layer.
4. Add or update tests using the frontend Vitest setup.
5. Verify linting and the production build.

For repository-wide architecture, refer to [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md).
