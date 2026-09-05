# DevDrop Architecture & API Map

This document describes the architecture visible in the current `main` branch. It is deliberately implementation-oriented: route mounts, integrations, security boundaries, and deployment/export flows are documented from the current source rather than from an older project plan.

## 1. System Shape

```text
Browser
  │
  ▼
Frontend (React + Vite)
  │  HTTP / JSON / OAuth callbacks
  ▼
Express application (`backend/src/app.js`)
  │
  ├── Security middleware: Helmet, CORS, compression
  ├── Logging: Morgan
  ├── Global API rate limiting
  ├── Auth / validation / email-verification middleware
  │
  └── Domain modules (`backend/src/modules/*`)
       │
       ├── MongoDB / Mongoose
       ├── Supabase Storage
       ├── Razorpay
       ├── Brevo
       ├── Google OAuth
       ├── GitHub OAuth/API
       ├── Vercel Integration/API
       ├── Render API
       └── Sentry
```

The application is a modular monolith. HTTP entry points are grouped by domain, while shared integrations and orchestration live in `backend/src/services/` and common infrastructure lives in `backend/src/shared/`.

## 2. Backend Entry Points

`backend/server.js` is the process entry point. The Express application itself is assembled in `backend/src/app.js`.

The Express app currently mounts these domain routers:

| Prefix | Module | Role |
|---|---|---|
| `/api/auth` | `auth` | Registration, login, session/authentication flows |
| `/api/user` | `user` | User/account operations |
| `/api/websites` | `website` | Marketplace website/project resources |
| `/api/seller` | `seller` | Seller-side workflows |
| `/api/buyer` | `buyer` | Buyer-side workflows and purchases |
| `/api/admin` | `admin` | Administrative operations |
| `/api/payment` | `payment` | Payment and webhook flows |
| `/api/payout` | `payout` | Seller payout management |
| `/api/wishlist` | `wishlist` | Wishlist operations |
| `/api/assets` | `asset` | Asset access and downloads |
| `/api/auctions` | `auction` | Auctions and bidding |
| `/api/analytics` | `analytics` | Analytics data |
| `/api/contact` | `contact` | Contact/support operations |
| `/api/github` | `github` | GitHub connection and export |
| `/api/deployments` | `deployment` | Repository analysis and deployment lifecycle |

There is also an unversioned `GET /health` endpoint for service health checks.

## 3. Request Pipeline & Security

Requests pass through the following main layers:

1. **Helmet** for HTTP security headers.
2. **CORS** restricted to configured frontend origins plus local development ports.
3. **Compression** for response payload reduction.
4. **Raw-body handling for `/api/payment/webhook`** before the general JSON parser so Razorpay webhook signatures can be verified.
5. **JSON / URL-encoded body parsers** with a 10 MB limit.
6. **Morgan** request logging, with the health endpoint skipped.
7. **Global `/api/` rate limiting**.
8. **Domain router middleware**, including JWT authentication, email verification, role authorization, route validation, and endpoint-specific rate limits where needed.
9. **404 and centralized error handling**.

When `SENTRY_DSN` is configured, Sentry initializes with Node profiling and Express error instrumentation.

## 4. Marketplace Domains

The marketplace is split into user-facing domains instead of one large route/controller file. The major business areas are authentication, website/project publishing, buyer and seller operations, assets, auctions, payments, payouts, wishlists, analytics, administration, and contact/support.

This lets individual domains own their controllers, routes, and models while shared infrastructure remains in common services and middleware.

## 5. GitHub Export Flow

GitHub integration is exposed at `/api/github`.

```text
Buyer
  │
  ├── Connect GitHub
  │      └── GET /api/github/callback
  │
  ├── Inspect repositories
  │      └── GET /api/github/repositories
  │
  └── Export purchased project
         └── POST /api/github/export/:websiteId
                    │
                    ▼
             Server re-validates access
                    │
                    ▼
             GitHub repository creation/upload
```

Current routes:

```text
GET    /api/github/callback
POST   /api/github/connect
GET    /api/github/status
GET    /api/github/repositories
DELETE /api/github/disconnect
POST   /api/github/export/:websiteId
GET    /api/github/exports
GET    /api/github/exports/website/:websiteId
GET    /api/github/exports/:exportId
```

The OAuth callback is intentionally outside the router-level authentication middleware because GitHub redirects the browser directly to that endpoint. Export creation itself is protected by authentication, email verification, and an export-specific limiter.

Stored GitHub access tokens are encrypted at rest. `TOKEN_ENCRYPTION_KEY` is the current variable; the backend keeps the legacy `GITHUB_TOKEN_ENCRYPTION_KEY` fallback for compatibility with existing deployments.

## 6. Deployment Architecture

Deployment is exposed at `/api/deployments` and is intentionally provider-agnostic at the orchestration layer.

```text
Project / GitHub repository
          │
          ▼
 Repository analyzer
          │
          ├── React + Vite ──► Vercel
          ├── Next.js      ──► Vercel
          ├── Express      ──► Render
          ├── NestJS       ──► Render
          └── Static HTML  ──► fallback deployment path
```

The analyzer is data-driven under `backend/src/services/deployment/analyzer/`. Framework rules can therefore be expanded without rewriting the deployment orchestrator.

### Vercel connection

Vercel uses an integration/OAuth flow. The browser callback is handled without the normal `Authorization` header, then the authenticated `finish-connect` route completes the identified exchange and credential storage.

### Render connection

Render uses a buyer-supplied personal API key. There is no server-side application registration for this flow in the current configuration.

### Deployment routes

```text
GET    /api/deployments/providers
GET    /api/deployments/providers/vercel/callback
POST   /api/deployments/providers/vercel/connect
POST   /api/deployments/providers/vercel/finish-connect
DELETE /api/deployments/providers/vercel/disconnect
POST   /api/deployments/providers/render/connect
PATCH  /api/deployments/providers/render/owner
DELETE /api/deployments/providers/render/disconnect
POST   /api/deployments/personal/analyze
POST   /api/deployments/personal
POST   /api/deployments/analyze/:websiteId
GET    /api/deployments/website/:websiteId
POST   /api/deployments/:websiteId
GET    /api/deployments
GET    /api/deployments/:deploymentId
POST   /api/deployments/:deploymentId/redeploy
POST   /api/deployments/:deploymentId/cancel
```

Route order matters for this module. Literal paths such as `/providers`, `/personal`, and `/website/:websiteId` must be registered before generic single-segment patterns so Express does not misinterpret literal words as IDs.

## 7. Payments, Storage, and Backups

### Payments

Razorpay powers payment creation and verification. `/api/payment/webhook` is registered before the normal JSON parser so the original payload is available for signature verification.

### File storage

Supabase is the configured storage layer. Asset access uses signed URLs, and a scheduled cleanup process is available for stale template assets.

### Backups

The `backup` module provides MongoDB + Supabase backup/restore infrastructure. Backup destinations are configured independently from the primary database/storage credentials, and scheduled backups can be enabled with `BACKUP_INTERVAL_HOURS` or the advanced cron setting described in `backend/.env.example`.

## 8. Test-Aware Architecture

The backend test configuration targets these centralized locations:

```text
backend/tests/unit/**/*.test.js
backend/tests/api/**/*.test.js
backend/tests/integration/**/*.test.js
```

Shared test doubles are stored in `backend/tests/mocks/`, and environment setup is in `backend/tests/setup/`.

The current tree also contains legacy in-source `__tests__` directories such as `backend/src/modules/auth/__tests__` and `backend/src/services/deployment/__tests__`. They are outside the active Jest `testMatch` patterns and should be considered legacy/uncollected until migrated or deliberately removed. See [TESTING.md](TESTING.md).

## 9. Environment Strategy

The backend keeps one canonical environment template at `backend/.env.example`, while the frontend has its own `frontend/.env.example`.

The backend template currently covers:

- server/database/auth configuration
- Razorpay payments
- manual payout operation
- Brevo email
- Supabase storage and cleanup
- marketplace fees/tax
- upload limits and signed URL expiry
- auction timing
- endpoint-specific rate limits
- Google OAuth
- GitHub OAuth/export
- Vercel/Render deployment
- backup/restore
- Sentry

The frontend template currently covers the API URL, Razorpay public key, Google OAuth client ID, PostHog, and Sentry.

## 10. Frontend Architecture

The frontend is a private React 19 application built with Vite 8. Routing is handled by React Router, API requests use Axios, and the UI uses component-oriented React patterns with animation and notification libraries.

Frontend quality tooling currently includes ESLint, Vitest, Testing Library, and a Vite production build.

## 11. Design Principles

- Keep domain logic close to its domain module.
- Keep external provider access behind services rather than leaking provider details into controllers.
- Re-validate authorization for sensitive operations instead of trusting client state.
- Apply endpoint-specific rate limiting to expensive or abuse-sensitive actions.
- Keep credentials server-side and encrypted at rest where persistence is required.
- Prefer data-driven rules for framework/provider expansion.
- Keep documentation synchronized with route mounts, environment variables, and test conventions.
