# DevDrop 🚀

DevDrop is a full-stack developer marketplace for discovering, publishing, buying, managing, exporting, and deploying developer projects and digital assets.

The current application is split into a React/Vite frontend and a modular Node.js/Express backend. The backend exposes domain-focused REST APIs for authentication, users, websites/assets, auctions, buyers and sellers, payments, payouts, analytics, GitHub export, deployment, backups, and administration.

## ✨ What DevDrop Does

- Publish and manage developer websites, projects, and downloadable assets
- User authentication with protected and role-aware workflows
- Buyer and seller flows, wishlists, orders, and purchase access
- Asset upload/download workflows backed by Supabase storage
- Auctions and bidding
- Razorpay payment processing and payment webhooks
- Manual seller payouts managed from the admin side
- GitHub OAuth and export of purchased projects into the buyer's GitHub account
- Personal and purchased-project deployment to the buyer's Vercel/Render accounts
- Provider-aware repository analysis for supported deployment frameworks
- Admin management, analytics, coupons, backups, and operational controls
- Email notifications through Brevo
- Optional Google OAuth, PostHog analytics, and Sentry monitoring

## 🏗️ Repository Structure

```text
DevDrop/
├── backend/
│   ├── src/
│   │   ├── modules/           # Domain modules and route entry points
│   │   ├── services/          # Cross-module integrations and orchestration
│   │   ├── shared/            # Middleware, utilities, auth, validation, etc.
│   │   └── app.js             # Express application and API mounting
│   ├── scripts/                # Demo-data, hashing, storage cleanup utilities
│   ├── tests/
│   │   ├── unit/              # Unit tests
│   │   ├── api/               # API/controller/route tests
│   │   ├── integration/       # Cross-module integration flows
│   │   ├── mocks/             # Shared test doubles
│   │   └── setup/             # Jest environment/setup
│   ├── .env.example
│   ├── jest.config.js
│   ├── package.json
│   └── server.js
│
├── frontend/
│   ├── src/                    # React application
│   ├── public/                 # Static assets
│   ├── .env.example
│   └── package.json
│
├── docs/
│   ├── ARCHITECTURE.md
│   └── TESTING.md
│
└── README.md
```

The backend is intentionally organized by domain. `src/app.js` is responsible for wiring the domain modules into the public `/api/*` surface rather than holding business logic itself.

## 🛠️ Tech Stack

### Frontend

- React 19
- React Router
- Vite 8
- Tailwind CSS through the Vite plugin
- Axios
- Framer Motion and GSAP
- Lucide React
- Sonner
- Vitest + Testing Library
- Optional PostHog and Sentry telemetry

### Backend

- Node.js
- Express 4
- MongoDB / Mongoose
- JWT authentication
- Express Validator
- Helmet, CORS, compression, Morgan
- Express rate limiting
- Jest + Supertest
- Supabase Storage
- Razorpay
- Brevo email API
- GitHub OAuth/API integration
- Vercel and Render deployment integrations
- Sentry monitoring

## 📡 API Surface

All business APIs are mounted under `/api`.

| Prefix | Responsibility |
|---|---|
| `/api/auth` | Authentication and account access |
| `/api/user` | User profile/account operations |
| `/api/websites` | Website/project marketplace resources |
| `/api/seller` | Seller workflows |
| `/api/buyer` | Buyer workflows and purchase-side operations |
| `/api/admin` | Administrative management and analytics controls |
| `/api/payment` | Razorpay payments and webhook handling |
| `/api/payout` | Seller payout administration |
| `/api/wishlist` | Wishlist operations |
| `/api/assets` | Asset access and download tracking |
| `/api/auctions` | Auction and bidding workflows |
| `/api/analytics` | Analytics endpoints |
| `/api/contact` | Contact/support endpoints |
| `/api/github` | GitHub connection, repository discovery, and project export |
| `/api/deployments` | Project analysis, Vercel/Render connections, deployment, redeployment, and cancellation |

The unversioned `GET /health` endpoint is the application health check.

For route-level details, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 🚀 Getting Started

### Prerequisites

Install:

- Node.js 18+
- npm
- MongoDB or a MongoDB Atlas cluster

### 1. Clone

```bash
git clone https://github.com/RitikPuranik/DevDrop.git
cd DevDrop
```

### 2. Configure the backend

```bash
cd backend
npm install
```

Create the environment file:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Populate the required values in `backend/.env`. The example file contains configuration for MongoDB, JWT, Razorpay, Brevo, Supabase, Google OAuth, GitHub, Vercel, Render, backups, rate limits, and Sentry.

### 3. Start the backend

```bash
npm start
```

Development mode:

```bash
npm run dev
```

The default local backend URL is `http://localhost:5000`.

### 4. Configure and start the frontend

From the repository root:

```bash
cd frontend
npm install
```

Create the frontend environment file:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Start Vite:

```bash
npm run dev
```

The frontend uses `VITE_API_URL` to reach the backend.

## 🔐 Environment Configuration

Never commit real credentials. Keep secrets in `.env` files and document placeholders in `.env.example`.

### Backend configuration groups

The current backend environment example covers:

- Server: `NODE_ENV`, `PORT`, frontend/backend URLs
- Database: `MONGODB_URI`
- Auth: JWT access and refresh secrets/expiry
- Payments: Razorpay keys and webhook secret
- Email: Brevo API key and sender/admin addresses
- Storage: Supabase project, service-role key, bucket, cleanup schedule
- Marketplace rules: platform fee and tax percentage
- Upload/download limits and signed URL expiry
- Auction timing and endpoint-specific rate limits
- Google OAuth
- GitHub OAuth and encrypted token storage
- Vercel integration and Render connection defaults
- Deployment polling/rate limits
- MongoDB + Supabase backup/restore configuration
- Sentry DSN

See [`backend/.env.example`](backend/.env.example) for the canonical variable list.

### Frontend configuration groups

The current frontend environment example covers:

- `VITE_API_URL`
- `VITE_RAZORPAY_KEY_ID`
- `VITE_GOOGLE_CLIENT_ID`
- PostHog project token/host
- Sentry DSN

See [`frontend/.env.example`](frontend/.env.example) for the canonical variable list.

## 🔗 GitHub Project Export

The `/api/github` module lets an authenticated buyer connect GitHub, inspect repositories, and export a purchased website/project into a repository in the buyer's own GitHub account.

Required backend configuration:

1. Register a GitHub OAuth App.
2. Set its callback URL to `<BACKEND_URL>/api/github/callback`.
3. Configure `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `GITHUB_OAUTH_REDIRECT_URI`.
4. Configure `TOKEN_ENCRYPTION_KEY` for encrypted credential storage. The project retains `GITHUB_TOKEN_ENCRYPTION_KEY` as a backwards-compatible fallback.

Relevant routes include:

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

Export creation is authenticated, email-verified, and rate-limited. Purchase ownership is revalidated server-side before a repository is written.

## ☁️ DevDrop Deploy

The `/api/deployments` module deploys repositories into the buyer's own infrastructure. DevDrop does not host the deployed application itself.

Supported provider flows:

- **Vercel**: integration/OAuth connection and deployment management
- **Render**: buyer-supplied personal API key and deployment management

The deployment analyzer currently supports:

- React + Vite → Vercel
- Next.js → Vercel
- Express → Render
- NestJS → Render
- Plain static HTML → deployment fallback

The analyzer is data-driven. Framework detection rules live under `backend/src/services/deployment/analyzer/` so new framework support can be added without changing the orchestration layer.

Important deployment routes currently include:

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

Both provider credentials and deployments are protected by authentication and deployment-specific rate limits. Email verification is required for deployment creation/redeployment flows.

## 💳 Payments, Storage, and Payouts

Razorpay is used for payment processing. The webhook endpoint receives the raw request body before JSON parsing so the Razorpay signature can be verified.

Supabase provides file storage and signed URLs for marketplace assets. A scheduled cleanup job removes stale template assets when configured.

Seller payouts are manual. The admin dashboard is responsible for processing payouts using seller banking information; no payout gateway is required by the current backend configuration.

## 🧪 Testing

### Backend

```bash
cd backend
npm test
npm run test:unit
npm run test:api
npm run test:integration
npm run test:coverage
```

Jest is configured around centralized test locations under `backend/tests/`. Shared mocks live under `backend/tests/mocks/`, while environment setup lives under `backend/tests/setup/`.

Coverage is generated locally by `test:coverage` and is ignored by Git. The repository no longer stores the generated `coverage/` directory.

### Frontend

```bash
cd frontend
npm test
npm run test:watch
npm run lint
npm run build
```

See [docs/TESTING.md](docs/TESTING.md) for the current test layout, commands, and known documentation/reorganization caveat.

## 🔒 Security Notes

- Do not commit `.env` files, API keys, or OAuth secrets.
- Use strong production JWT and token-encryption secrets.
- Keep administrative endpoints behind role-based authorization.
- Validate user input and uploaded files on the server.
- Use HTTPS in production.
- Rate-limit authentication, downloads, exports, payments, and deployments.
- Keep GitHub/Vercel/Render credentials encrypted at rest.
- Never expose provider access tokens to the frontend.
- Re-check authorization and purchase ownership on sensitive server-side operations.

The Express application also enables Helmet, CORS, gzip compression, structured request logging, rate limiting, and optional Sentry error/profiling instrumentation.

## 📚 Documentation

- [Architecture and API map](docs/ARCHITECTURE.md)
- [Testing and test organization](docs/TESTING.md)

These docs are intended to describe the repository as it exists today. When route mounts, integrations, or test conventions change, update the relevant documentation in the same change.

## 🤝 Contributing

1. Fork the repository.
2. Create a feature branch:

```bash
git checkout -b feature/your-feature
```

3. Make the change.
4. Run the relevant tests, lint, and build commands.
5. Commit with a clear message:

```bash
git commit -m "feat: add your feature"
```

6. Push your branch and open a pull request.

## 👤 Author

**Ritik Puranik**

GitHub: https://github.com/RitikPuranik
