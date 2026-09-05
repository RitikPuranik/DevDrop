# DevDrop Frontend ⚡

The DevDrop frontend is a React 19 single-page application built with Vite. It provides the public marketplace, authentication flows, buyer workspace, checkout, administration, GitHub export/deployment experiences, and supporting account pages.

## Stack

- React 19
- React Router DOM 7
- Vite 8
- Tailwind CSS 4 via `@tailwindcss/vite`
- Framer Motion for UI animation
- GSAP for animation effects
- Lucide React for icons
- Sonner for toast notifications
- Axios for API communication
- Vitest + Testing Library for frontend tests
- Sentry for browser error/performance monitoring
- PostHog for product analytics

## Application Structure

```text
frontend/
├── public/                 # Static assets served as-is
├── src/
│   ├── components/         # Reusable UI, layout, loaders, and feature components
│   ├── pages/              # Route-level screens grouped by product area
│   │   ├── account/
│   │   ├── admin/
│   │   ├── auth/
│   │   ├── deployment/
│   │   ├── marketplace/
│   │   └── marketing/
│   ├── services/            # API/integration helpers
│   ├── assets/              # Bundled application assets
│   ├── App.jsx              # Router and application shell
│   ├── main.jsx             # React bootstrap, analytics, and Sentry setup
│   └── index.css            # Global styles
├── .env.example             # Frontend environment template
├── vite.config.js           # Vite, Tailwind, build splitting, and dev-server config
├── package.json
└── README.md
```

Keep new route-level screens under the appropriate `src/pages/*` domain and reusable UI under `src/components/*`. Avoid putting business-specific page code into `App.jsx`.

## Application Shell

`src/main.jsx` bootstraps React in `StrictMode` and conditionally initializes Sentry from `VITE_SENTRY_DSN`. PostHog is mounted through `PostHogProvider`, using `VITE_POSTHOG_PROJECT_TOKEN` and `VITE_POSTHOG_HOST`.

`src/App.jsx` owns the top-level browser router and common shell behavior. It handles the intro experience, shared loading state, navbar/footer visibility, route definitions, and the global Sonner toaster.

The current application includes routes for:

| Area | Routes |
| --- | --- |
| Marketing | `/`, `/about`, `/contact`, `/docs`, `/terms`, `/privacy`, `/review` |
| Marketplace | `/template`, `/website/:id`, `/checkout/:id`, `/purchases/:purchaseId` |
| Account | `/profile`, `/workspace`, `/dashboard` |
| Deployment | `/deploy-own`, `/deploy/:purchaseId`, `/deployments/:deploymentId`, `/deploy/vercel-callback` |
| Authentication | `/verify-email`, `/reset-password` |
| Administration | `/admin` |

`/dashboard` redirects to `/workspace`.

## Local Development

### Prerequisites

Use a current Node.js release compatible with the project's Vite/React toolchain and npm.

### Install

From the repository root:

```bash
cd frontend
npm install
```

Create the local environment file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

### Start the development server

```bash
npm run dev
```

Vite is configured to use port `5173` by default and will fall back to another port when `5173` is already occupied.

### Production build

```bash
npm run build
npm run preview
```

## Environment Variables

The frontend uses Vite-exposed variables only for values that are safe to make available to the browser. Never place private backend credentials or API secrets in a `VITE_*` variable.

Current variables are documented in `frontend/.env.example`:

```env
VITE_API_URL=http://localhost:5000
VITE_RAZORPAY_KEY_ID=your_razorpay_key_id
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
VITE_POSTHOG_PROJECT_TOKEN=your_posthog_project_token
VITE_POSTHOG_HOST=https://us.i.posthog.com
VITE_SENTRY_DSN=your_sentry_dsn
```

The API base URL points the browser at the backend service. Payments and OAuth/analytics integrations use their respective public client-side configuration; secrets remain on the backend.

## Build Configuration

`vite.config.js` currently:

- enables the React and Tailwind Vite plugins
- targets ES2015 browser output
- minifies production bundles with Terser
- removes `console` and `debugger` statements from production builds
- creates manual chunks for the main vendor, animation, UI, and GSAP dependencies
- keeps the chunk warning threshold at 600 KB
- sends `Cross-Origin-Opener-Policy: same-origin-allow-popups` in development and preview

The COOP configuration is relevant to popup-based integrations such as Vercel/GitHub authorization flows.

## Frontend Testing

Run the full frontend test suite with:

```bash
npm test
```

Run Vitest in watch mode:

```bash
npm run test:watch
```

Static quality/build checks:

```bash
npm run lint
npm run build
```

Detailed testing conventions are documented in [`docs/TESTING.md`](docs/TESTING.md).

## Observability

The browser application can initialize Sentry with browser tracing and session replay. PostHog is used for product analytics with identified-only person profiles.

Keep telemetry configuration environment-driven and do not hard-code DSNs, project tokens, or private credentials in source files.

## API Integration

Frontend API requests should target the backend through the configured `VITE_API_URL`. The backend owns authentication, authorization, data persistence, payments, file storage, third-party credentials, GitHub exports, and Vercel/Render deployment operations.

For backend architecture and API ownership, see the repository-level [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

## Development Guidelines

- Keep components focused and reusable.
- Keep route composition in `App.jsx` and feature behavior in page/component modules.
- Prefer existing shared UI and layout primitives before introducing duplicates.
- Treat the backend as the authority for permissions and sensitive operations.
- Keep browser environment variables limited to public configuration.
- Add tests beside the appropriate frontend test suite structure rather than creating ad-hoc production `__tests__` directories.
- Run `npm run lint` and `npm run build` before submitting substantial frontend changes.

## Related Documentation

- [`../README.md`](../README.md) — overall DevDrop project
- [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) — system and backend architecture
- [`../docs/TESTING.md`](../docs/TESTING.md) — repository-level testing organization
- [`docs/TESTING.md`](docs/TESTING.md) — frontend-specific testing guidance
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — frontend architecture and route responsibilities
