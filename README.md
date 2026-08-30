# DevDrop 🚀

DevDrop is a full-stack developer platform for discovering, sharing, managing, and distributing developer assets and projects through a modern web application.

## ✨ Highlights

- Developer-focused asset/project marketplace
- Authentication and role-based access
- Asset upload and download workflows
- Download activity tracking
- Auctions and bidding
- Export purchased projects straight to the buyer's own GitHub account
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
│   │       ├── admin/
│   │       ├── analytics/
│   │       ├── asset/
│   │       ├── auction/
│   │       ├── auth/
│   │       ├── buyer/
│   │       ├── contact/
│   │       └── ...
│   ├── package.json
│   └── server.js
│
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
- Modern component-based UI
- Responsive web interface

## 🚀 Getting Started

### Prerequisites

Make sure you have installed:

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

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Add your database connection string, JWT secrets, storage credentials, and any other required service keys to `.env`.

### 3. Start the backend

```bash
npm start
```

For development, use the development script available in `backend/package.json`.

### 4. Install and start the frontend

From the repository root:

```bash
cd frontend
npm install
npm run dev
```

The development server will display the local URL in the terminal.

## 🔐 Environment Variables

Never commit real secrets to Git. Keep credentials inside `.env` files and use `.env.example` to document required configuration.

Typical configuration includes:

```env
PORT=5000
MONGODB_URI=your-mongodb-connection-string
JWT_SECRET=your-secret
```

Additional variables may be required for uploads, email, payments, or third-party integrations depending on the enabled modules. See `backend/.env.example` for the complete list.

### GitHub Export

Buyers can push a purchased project into a repository in their own GitHub account (`/api/github/*`). This requires:

1. A GitHub OAuth App (github.com/settings/developers) with its **Authorization callback URL** set to `<BACKEND_URL>/api/github/callback`.
2. `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_OAUTH_REDIRECT_URI` set from that app.
3. `GITHUB_TOKEN_ENCRYPTION_KEY` — a 32-byte hex key used to encrypt each user's GitHub access token at rest. Generate one with:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

If these aren't configured, `/api/github/connect` responds with 503 rather than failing the whole server.

## 📡 API Architecture

The backend is organized by domain rather than putting all endpoints into a single large route file. Major areas include authentication, assets, auctions, buyers, analytics, and administration.

This structure makes it easier to:

- add new features without growing a monolithic controller
- keep validation, controllers, and models close to their domain
- test individual business modules independently
- maintain clear API ownership boundaries

## 🧪 Testing & Quality

Before opening a pull request, install dependencies and run the project's available test/lint/build commands from the relevant `package.json` files.

For production deployments, verify:

1. Environment variables are configured.
2. MongoDB is reachable.
3. Backend starts successfully.
4. Frontend builds successfully.
5. Authentication and protected routes work as expected.
6. Upload/download flows work with production storage configuration.

## 🔒 Security Notes

- Do not commit `.env` files or API keys.
- Use strong production secrets.
- Restrict administrative endpoints with role-based authorization.
- Validate uploaded files and user input on the server.
- Use HTTPS for production deployments.
- GitHub access tokens are encrypted at rest (AES-256-GCM) and never sent to the frontend; every export re-verifies purchase ownership server-side before touching a buyer's GitHub account.

## 🤝 Contributing

1. Fork the repository.
2. Create a feature branch:

```bash
git checkout -b feature/your-feature
```

3. Make your changes.
4. Test the affected modules.
5. Commit with a clear message:

```bash
git commit -m "feat: add your feature"
```

6. Push the branch and open a pull request.

## 👤 Author

**Ritik Puranik**

GitHub: https://github.com/RitikPuranik
