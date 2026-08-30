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

Create your environment file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

### 3. Start the backend

```bash
npm start
```

### 4. Install and start the frontend

```bash
cd frontend
npm install
npm run dev
```

## 🔐 Environment Variables

Never commit real secrets to Git. Keep credentials inside `.env` files and use `.env.example` to document required configuration.

Typical configuration:

```env
PORT=5000
MONGODB_URI=your-mongodb-connection-string
JWT_SECRET=your-secret
```

Additional variables may be required for uploads, email, payments, GitHub integration, or other enabled services. See `backend/.env.example`.

### GitHub Export

Buyers can export purchased projects directly into a repository in their own GitHub account.

This requires:

1. A GitHub OAuth App with callback URL set to `<BACKEND_URL>/api/github/callback`.
2. `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `GITHUB_OAUTH_REDIRECT_URI`.
3. `GITHUB_TOKEN_ENCRYPTION_KEY`, used to encrypt GitHub access tokens at rest.

Generate an encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 📡 API Architecture

The backend is organized by domain rather than placing everything inside a single monolithic route layer. Major areas include authentication, assets, auctions, buyers, analytics, GitHub integration, and administration.

## 🔒 Security Notes

- Never commit `.env` files or API keys.
- Use strong production secrets.
- Restrict administrative endpoints with role-based authorization.
- Validate uploaded files and user input server-side.
- Use HTTPS in production.
- GitHub access tokens are encrypted at rest.
- Export operations verify purchase ownership server-side.

## 🤝 Contributing

1. Fork the repository.
2. Create a feature branch:

```bash
git checkout -b feature/your-feature
```

3. Make and test your changes.
4. Commit with a clear message:

```bash
git commit -m "feat: add your feature"
```

5. Push your branch and open a pull request.

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

The MIT License allows users to use, copy, modify, merge, publish, distribute, sublicense, and sell copies of the software, subject to the license terms and preservation of the copyright notice.

## 👥 Contributors

DevDrop is a collaborative project developed by its contributors.

## 👤 Repository

Maintained at: https://github.com/RitikPuranik/DevDrop
