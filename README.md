# DevDrop 🚀

DevDrop is a full-stack developer platform for discovering, sharing, managing, and distributing developer assets and projects through a modern web application.

## ✨ Highlights

- Developer-focused asset/project marketplace
- Authentication and role-based access
- Asset upload and download workflows
- Download activity tracking
- Auctions and bidding
- Export purchased projects straight to the buyer's own GitHub account
- Deploy published projects to the buyer's own Vercel/Render accounts
- Admin management and analytics
- Backend APIs organized by feature modules
- MongoDB-backed data models
- Modern frontend with reusable UI components

## 🏗️ Project Structure

```text
DevDrop/
├── backend/
│   ├── src/
│   │   └── modules/
│   ├── package.json
│   └── server.js
└── frontend/
    ├── src/
    ├── public/
    └── package.json
```

## 🛠️ Tech Stack

### Backend

- Node.js
- Express.js
- MongoDB / Mongoose
- JWT authentication
- Modular REST API architecture

### Frontend

- React
- JavaScript / TypeScript where applicable
- Component-based UI
- Responsive web interface

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm
- MongoDB (local instance or MongoDB Atlas)

### 1. Clone the repository

```bash
git clone https://github.com/RitikPuranik/DevDrop.git
cd DevDrop
```

### 2. Install backend dependencies

```bash
cd backend
npm install
```

Create your environment file from the example:

```powershell
Copy-Item .env.example .env
```

Add your database connection string, JWT secrets, storage credentials, and enabled integration keys.

### 3. Start the backend

```bash
npm start
```

### 4. Install and start the frontend

```bash
cd ../frontend
npm install
npm run dev
```

## 🔐 Environment Variables

Never commit real secrets to Git. Use `backend/.env.example` as the canonical configuration reference.

## GitHub Export

Buyers can push a purchased project into a repository in their own GitHub account. The GitHub OAuth connection is server-side and access tokens are encrypted at rest. If the stored authorization is expired or revoked, the Push to GitHub dialog now switches to a **Reconnect GitHub** action instead of leaving the user stuck on a connected state.

## DevDrop Deploy

Once a project is published to GitHub, buyers can deploy it into their own Vercel and/or Render accounts. The GitHub repository is the source of truth; Vercel/Render projects and services are deployment targets.

### Vercel

Configure a Vercel Integration with the API scopes required for:

- Integration Configuration: Read & Write
- Integration Resource: Read & Write
- Deployments: Read & Write
- Projects: Read & Write
- Project Environment Variables: Read & Write
- Teams: Read
- Current User: Read

Vercel project access is controlled separately by the integration installation. For development, install the integration on your Vercel account and grant the appropriate project access. `VERCEL_OAUTH_REDIRECT_URI` must point to `/api/deployments/providers/vercel/callback`.

### Render

Each buyer connects Render by supplying a personal Render API key. The key is stored encrypted server-side and is never exposed to the browser.

## 🧪 Testing & Quality

Backend tests run with:

```bash
cd backend
npm test
```

Frontend production build:

```bash
cd frontend
npm run build
```

## 🔒 Security Notes

- Do not commit `.env` files or API keys.
- Use strong production secrets.
- Restrict administrative endpoints with role-based authorization.
- Validate uploaded files and user input on the server.
- Use HTTPS for production deployments.
- GitHub, Vercel, and Render credentials remain server-side and are encrypted at rest.

## 🤝 Contributing

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Test the affected modules.
5. Open a pull request.

## 👤 Author

**Ritik Puranik**

GitHub: https://github.com/RitikPuranik
