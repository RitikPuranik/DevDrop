# Website Marketplace Platform - Backend

A comprehensive Node.js + Express backend for a website marketplace platform with MongoDB, Supabase Storage, and Razorpay integration.

## 🚀 Features

- **User Authentication**: JWT-based auth with email verification
- **Role-Based Access Control**: User and Admin roles
- **Website Marketplace**: Free, Paid, and Exclusive listings
- **File Management**: Source code, docs, and video uploads via Supabase
- **Payment Processing**: Integrated Razorpay payment gateway
- **Seller Payouts**: Automated payout system with bank details
- **Wishlist System**: Users can save favorite websites
- **Admin Dashboard**: Review, approve, reject website submissions
- **Download Tracking**: Monitor file access and prevent abuse
- **Email Notifications**: Automated emails for all user actions

## 📋 Prerequisites

- Node.js (v16 or higher)
- MongoDB (local or Atlas)
- Supabase account
- Razorpay account
- Email service (Gmail, SendGrid, etc.)

## 🛠️ Installation

### 1. Clone and Install

```bash
# Clone the repository
git clone <your-repo-url>
cd backend

# Install dependencies
npm install
```

### 2. Environment Setup

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Update the `.env` file with your credentials:

```env
# Server
NODE_ENV=development
PORT=5000

# MongoDB
MONGODB_URI=mongodb://localhost:27017/website-marketplace

# JWT
JWT_SECRET=your-secret-key-here
JWT_EXPIRE=7d

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_BUCKET_NAME=marketplace-files

# Razorpay
RAZORPAY_KEY_ID=your-razorpay-key
RAZORPAY_KEY_SECRET=your-razorpay-secret

# Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=noreply@yourplatform.com

# Frontend
FRONTEND_URL=http://localhost:3000

# Platform Settings
PLATFORM_FEE_PERCENTAGE=10
TAX_PERCENTAGE=18
```

### 3. Supabase Setup

1. Create a Supabase project
2. Create a storage bucket named `marketplace-files`
3. Set bucket to private (we'll use signed URLs)
4. Create the following folder structure in your bucket:
   - `source-code/`
   - `docs/`
   - `videos/`
   - `preview-videos/`

5. Update Storage policies:

```sql
-- Allow authenticated users to read preview videos
create policy "Public preview videos"
on storage.objects for select
using (bucket_id = 'marketplace-files' and (storage.foldername(name))[1] = 'preview-videos');

-- Allow service role to manage all files
-- (This is handled via service role key in backend)
```

### 4. MongoDB Setup

If using local MongoDB:
```bash
# Start MongoDB
mongod

# Or use MongoDB Atlas connection string in .env
```

### 5. Email Setup (Gmail Example)

1. Enable 2-Factor Authentication on your Gmail account
2. Generate an App Password:
   - Go to Google Account → Security → 2-Step Verification → App passwords
   - Generate password for "Mail" on "Other (Custom name)"
3. Use this app password in `EMAIL_PASSWORD`

## 🏃 Running the Application

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

The server will start on `http://localhost:5000`

## 📚 API Documentation

### Base URL
```
http://localhost:5000/api
```

### Authentication Endpoints

#### Register User
```http
POST /auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

#### Verify Email
```http
POST /auth/verify-email
Content-Type: application/json

{
  "token": "verification-token-from-email"
}
```

### Complete API Flow

## 1. USER SIGNUP & LOGIN FLOW

```javascript
// Signup
POST /api/auth/signup
{
  "email": "user@example.com",
  "password": "securepassword"
}

// Response
{
  "success": true,
  "data": {
    "user": { "id": "...", "email": "...", "isVerified": false },
    "token": "jwt-token"
  }
}

// User can login immediately (no verification required for login)
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

## 2. EMAIL VERIFICATION (Action-Based)

Email verification is required when user tries to:
- Sell a website
- Buy a website

```javascript
// Example: User tries to sell website without verification
POST /api/seller/websites
Headers: { Authorization: "Bearer <token>" }
Body: { ...website data }

// Response if not verified
{
  "success": false,
  "message": "Please verify your email to perform this action. A verification email has been sent.",
  "requiresVerification": true
}

// User clicks link in email → verifies
POST /api/auth/verify-email
{ "token": "token-from-email" }

// Now user can sell/buy
```

## 3. SELL WEBSITE FLOW

```javascript
// Step 1: User submits website for review
POST /api/seller/websites
Headers: { Authorization: "Bearer <token>" }
Body: {
  "name": "E-commerce Website",
  "description": "Full-featured e-commerce platform...",
  "category": "paid", // "free" | "paid" | "exclusive"
  "price": 15000, // 0 for free
  "deployedUrl": "https://demo.example.com",
  "githubUrl": "https://github.com/user/repo" // optional
}

// Note: If category is "paid" or "exclusive", user must have bank details
// If bank details missing, they'll be prompted to add them first

// Step 2: Add bank details (if needed)
POST /api/user/bank-details
Headers: { Authorization: "Bearer <token>" }
Body: {
  "accountHolderName": "John Doe",
  "accountNumber": "1234567890",
  "ifscCode": "SBIN0001234",
  "bankName": "State Bank of India",
  "branch": "Main Branch",
  "upiId": "john@upi" // optional
}

// Step 3: Website status = "pending_review"
// Seller can view in dashboard
GET /api/seller/websites
```

## 4. ADMIN REVIEW FLOW

```javascript
// Admin gets pending websites
GET /api/admin/websites/pending
Headers: { Authorization: "Bearer <admin-token>" }

// Admin reviews and takes action:

// Option 1: Request Changes
PUT /api/admin/websites/:id/request-changes
{
  "comment": "Please add more details in description"
}

// Option 2: Reject
PUT /api/admin/websites/:id/reject
{
  "reason": "Does not meet quality standards"
}

// Option 3: Approve and Upload Files
POST /api/admin/websites/:id/approve
Content-Type: multipart/form-data
Files:
  - sourceCode: website.zip
  - docs: documentation.pdf
  - video: tutorial.mp4
  - previewVideo: preview.mp4 (optional, public)

// After approval, website becomes live with status "approved"
```

## 5. BUY WEBSITE FLOW

### Free Website
```javascript
POST /api/buyer/purchase/:websiteId
Headers: { Authorization: "Bearer <token>" }

// Instant access granted
// Purchase record created
```

### Paid/Exclusive Website
```javascript
// Step 1: Create Razorpay order
POST /api/payment/create-order
Headers: { Authorization: "Bearer <token>" }
Body: {
  "websiteId": "website-id-here"
}

// Response
{
  "orderId": "order_xxx",
  "amount": 17700, // sellerPrice + platformFee + tax
  "currency": "INR",
  "breakdown": {
    "sellerPrice": 15000,
    "platformFee": 1500,
    "tax": 1200,
    "total": 17700
  }
}

// Step 2: Frontend integrates Razorpay checkout
// User pays via Razorpay

// Step 3: Verify payment
POST /api/payment/verify
Body: {
  "razorpay_order_id": "order_xxx",
  "razorpay_payment_id": "pay_xxx",
  "razorpay_signature": "signature"
}

// Purchase completed, files accessible
```

## 6. ACCESS PURCHASED ASSETS

```javascript
// Get signed URLs for download
GET /api/assets/website/:websiteId
Headers: { Authorization: "Bearer <token>" }

// Response
{
  "sourceCode": {
    "url": "https://supabase.co/signed-url-for-zip",
    "expiresAt": "2024-01-01T12:00:00Z"
  },
  "docs": {
    "url": "https://supabase.co/signed-url-for-pdf",
    "expiresAt": "2024-01-01T12:00:00Z"
  },
  "video": {
    "url": "https://supabase.co/signed-url-for-video",
    "expiresAt": "2024-01-01T12:00:00Z"
  }
}

// URLs expire after 1 hour (configurable)
// Downloads are tracked in database
```

## 7. SELLER PAYOUT FLOW

```javascript
// Automatic payout creation after successful purchase
// Status: "pending"

// Admin triggers payout
POST /api/admin/payouts/:payoutId/process
Headers: { Authorization: "Bearer <admin-token>" }
Body: {
  "utr": "unique-transaction-reference",
  "transactionDate": "2024-01-01"
}

// Seller notified via email
// Status updated to "completed"
```

## 🔐 Security Features

- JWT authentication with token expiration
- Password hashing with bcrypt
- Rate limiting on all endpoints
- CORS protection
- Helmet.js for security headers
- Input validation and sanitization
- Signed URLs for file access
- Download tracking and abuse prevention

## 📁 Project Structure

```
src/
├── config/          # Configuration files (DB, Supabase, Razorpay, Email)
├── controllers/     # Route controllers
├── middleware/      # Custom middleware
├── models/          # Mongoose schemas
├── routes/          # API routes
├── services/        # Business logic services
├── utils/           # Utility functions
├── app.js           # Express app setup
└── server.js        # Server entry point
```

## 🧪 Testing

```bash
# Run tests (when implemented)
npm test
```

## 📝 Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `5000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/marketplace` |
| `JWT_SECRET` | JWT signing secret | `your-secret-key` |
| `SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `RAZORPAY_KEY_ID` | Razorpay API key | `rzp_test_xxx` |
| `EMAIL_USER` | Email service username | `your-email@gmail.com` |
| `PLATFORM_FEE_PERCENTAGE` | Platform commission | `10` |

## 🚨 Important Notes

1. **Email Verification**: Required only when users attempt to sell or buy
2. **Bank Details**: Required for sellers listing paid/exclusive websites
3. **Exclusive Websites**: Automatically locked after first purchase
4. **File Access**: All files use signed URLs with expiration
5. **Cascade Delete**: Deleting a website removes all associated files and records

## 📞 Support

For issues and questions:
- Check logs in `logs/` directory
- Review error messages in console
- Ensure all environment variables are set correctly

## 🔄 Next Steps (Frontend Integration)

1. Build React/Next.js frontend
2. Implement Razorpay checkout UI
3. Create dashboard for users and admin
4. Add file preview components
5. Implement wishlist UI

---

**Happy Coding! 🚀**