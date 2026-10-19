# StitchX Global Technology — Enterprise Backend REST API

Production-ready Node.js & Express REST API, MongoDB Mongoose data layer, enterprise security middleware, and automated PDF/DOCX document generation engine for StitchX Global Technology.

---

## 🌟 Overview & Capabilities

- **Secure REST Architecture**: Modular routing built with Express 5, strict parameter validation, and JSON response contracts.
- **Enterprise Security Suite**:
  - Helmet-grade HTTP security headers (CSP, HSTS, X-Content-Type-Options, Frameguard, Referrer-Policy).
  - Configurable CORS origin allowlist with credentials support.
  - MongoDB NoSQL injection sanitization (`mongoSanitizeMiddleware`).
  - Dual-tier in-memory rate limiting (General API limit + strict Brute-force protection for authentication endpoints).
  - Timing-safe password hashing and constant-time verification using Node's native `crypto.scrypt`.
  - Secure session token generation (`crypto.randomBytes(32)`).
- **Automated Document Generation Engine**:
  - Pixel-perfect standard **A4 portrait (210 × 297 mm)** PDF generation with multi-page table pagination, header branding, and signature footers.
  - Formatted Microsoft Word (`.docx`) file exports using `docx`.
  - Generates Quotations, Invoices, Proposals, and NDAs / Master Service Agreements.
- **Career & Enquiries System**:
  - Multipart resume upload handling via Multer with file-type whitelisting and size limits.
  - Contact enquiry persistence with private notes, assignment tracking, and automated response hooks.

---

## 🛠️ Tech Stack

- **Runtime**: Node.js (v18.x or v20.x recommended)
- **Framework**: Express.js (`v5.x`)
- **Database**: MongoDB with Mongoose ODM (`v9.x`)
- **File & Document Services**: Multer, Docx (`v9.x`)
- **Email Service**: Resend API integration
- **Configuration**: Dotenv (`v18.x`)

---

## 📁 Repository Structure

```text
backend/
├── server.js                      # Main application entry point & HTTP listener
├── package.json                   # Dependencies, scripts, and package metadata
├── .env.example                   # Environment variable template
├── .gitignore                     # Git ignore rules for node_modules, logs, and uploads
├── server/
│   ├── apiApp.js                  # Express application configuration & route mounting
│   ├── auth.js                    # JWT/Session authentication & admin verification middleware
│   ├── db.js                      # MongoDB connection manager & retry logic
│   ├── seedData.js                # Initial database seed (admin credentials, default settings)
│   ├── models/                    # Mongoose database models
│   │   ├── index.js               # Model registry & export index
│   │   ├── AdminUser.js           # Admin user credentials & role schema
│   │   ├── AdminSession.js        # Active admin sessions
│   │   ├── Application.js         # Career job applications & uploaded resumes
│   │   ├── BlogPost.js            # Editorial blog posts & publishing status
│   │   ├── CompanySettings.js     # Enterprise branding, banking, and contact details
│   │   ├── DocAgreement.js        # NDAs & Client Service Agreements
│   │   ├── DocInvoice.js          # Invoices with line items & tax calculations
│   │   ├── DocProposal.js         # Business proposals & scope of work
│   │   ├── DocQuotation.js        # Commercial quotations & estimates
│   │   ├── Enquiry.js             # Client contact submissions & status tracking
│   │   └── Review.js              # Client testimonials & moderation status
│   ├── routes/                    # API Route Handlers
│   │   ├── adminAuthRoutes.js     # Admin login, session check, logout, profile
│   │   ├── adminRoutes.js         # Admin CRUD, metrics, career & enquiry moderation
│   │   ├── blogRoutes.js          # Public blog articles & search
│   │   ├── contactRoutes.js       # Public contact forms & company settings
│   │   ├── docRoutes.js           # Document generation, PDF & DOCX export routes
│   │   ├── jobRoutes.js           # Public job listings & candidate applications
│   │   └── reviewRoutes.js        # Public reviews & testimonials submission
│   ├── security/                  # Production Security Subsystem
│   │   ├── index.js               # Security suite entry point
│   │   ├── corsConfig.js          # Dynamic CORS origin validator
│   │   ├── headersConfig.js       # Security headers (CSP, HSTS, Permissions-Policy)
│   │   ├── mongoSanitizer.js      # NoSQL injection input sanitizer
│   │   ├── rateLimiter.js         # IP-based rate limiting with sliding window
│   │   ├── csrfProtection.js      # Double-submit CSRF token generator
│   │   └── sanitize.js            # Input sanitization & HTML entity encoding
│   ├── services/
│   │   ├── pdfExportService.js    # A4 PDF generator (Quotations, Invoices, Proposals, NDAs)
│   │   └── docxExportService.js   # DOCX generator
│   ├── data/                      # Local file storage (Git-tracked with .gitkeep)
│   │   ├── documents/             # Temporary document storage
│   │   ├── resumes/               # Candidate resume uploads
│   │   └── uploads/               # Company logos & public media
│   └── test_*.js                  # Automated verification & security test suites
```

---

## 🚀 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (version 18 or higher)
- [MongoDB](https://www.mongodb.com/) (Local Community Server running on `mongodb://127.0.0.1:27017` or a MongoDB Atlas connection string)

### 2. Installation
Clone the repository and install all dependencies:
```bash
git clone https://github.com/<your-username>/stitchx-backend.git
cd stitchx-backend
npm install
```

### 3. Environment Configuration
Create a `.env` file from the provided `.env.example`:
```bash
cp .env.example .env
```

Configure your environment variables in `.env`:
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/techfusion
FRONTEND_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
JWT_SECRET=replace-with-a-random-64-character-string-in-production
SESSION_SECRET=replace-with-a-random-64-character-string-in-production
ADMIN_DEFAULT_PASSWORD=AdminPassword2026!
TRUST_PROXY=false
```

### 4. Running the Server

- **Development Mode (with auto-reload)**:
  ```bash
  npm run dev
  ```
- **Production Mode**:
  ```bash
  npm start
  ```

Once started, the API is available at:
```text
http://localhost:5000
```
Health Check: `http://localhost:5000/api/health`

---

## 🧪 Testing & Verification

Run the built-in automated test suites:

```bash
# Run full system verification suite against the running API
npm test

# Run security middleware & cryptography tests
npm run test:security

# Run A4 PDF layout & media box dimensions verification
npm run test:pdf
```

---

## 📡 API Reference Overview

### Public Endpoints
| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/` | API status and service metadata |
| `GET` | `/api/health` | Health check endpoint |
| `GET` | `/api/blog` | List published blog posts |
| `GET` | `/api/blog/:slug` | Retrieve single published post by slug |
| `GET` | `/api/jobs` | List active job openings |
| `POST` | `/api/jobs/apply` | Submit job application (supports multipart resume upload) |
| `GET` | `/api/reviews` | List published client reviews |
| `POST` | `/api/reviews` | Submit new client review (queued for admin approval) |
| `POST` | `/api/contact` | Submit client contact enquiry |
| `GET` | `/api/contact/info` | Get public enterprise contact details |

### Admin Endpoints (Require Bearer Token)
| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/api/admin/login` | Authenticate admin user & receive session token |
| `GET` | `/api/admin/me` | Verify active session & retrieve admin profile |
| `POST` | `/api/admin/logout` | Invalidate active session token |
| `GET` | `/api/admin/dashboard-stats` | Aggregated analytics & enquiry counts |
| `GET` | `/api/admin/enquiries` | View all customer enquiries |
| `PATCH` | `/api/admin/enquiries/:id` | Update enquiry status, assign agent, private notes |
| `GET` | `/api/admin/applications` | Review candidate job applications |
| `GET` | `/api/admin/applications/:id/resume` | Securely download candidate resume |
| `GET` | `/api/admin/documents` | List generated business documents |
| `POST` | `/api/admin/documents/:type` | Create Quotation, Invoice, Proposal, or Agreement |
| `GET` | `/api/admin/documents/:type/:id/pdf` | Download or preview formatted A4 PDF |
| `GET` | `/api/admin/documents/:type/:id/docx` | Download editable Microsoft Word DOCX |

---

## 🌐 Production Deployment

### Deploying to Render
1. Create a new **Web Service** and connect this repository.
2. Build Command: `npm install`
3. Start Command: `npm start`
4. Set Environment Variables:
   - `NODE_ENV=production`
   - `PORT=5000` (or leave default for Render to assign)
   - `MONGODB_URI=<your-mongodb-atlas-uri>`
   - `FRONTEND_URL=https://your-frontend-domain.vercel.app`
   - `ALLOWED_ORIGINS=https://your-frontend-domain.vercel.app`
   - `TRUST_PROXY=true`
   - `JWT_SECRET=<strong-random-secret>`

### Deploying to Railway
1. Click **New Project** -> **Deploy from GitHub repo**.
2. Select the `stitchx-backend` repository.
3. Add MongoDB either via Railway plugin or external MongoDB Atlas.
4. Set the environment variables in Railway's Variables tab.

### Deploying to Linux VPS (Ubuntu / Debian with PM2 & Nginx)
1. Install PM2: `npm install -g pm2`
2. Start server under PM2:
   ```bash
   pm2 start server.js --name "stitchx-api"
   pm2 save
   pm2 startup
   ```
3. Configure Nginx reverse proxy to forward requests from `https://api.yourdomain.com` to `http://localhost:5000`.

---

## 🔒 Security Best Practices
- Never commit `.env` or production secrets to Git.
- Regularly rotate `JWT_SECRET` and `SESSION_SECRET` in production.
- Use TLS/HTTPS in production so cookies and bearer tokens are transmitted over encrypted channels.
- Keep `ALLOWED_ORIGINS` strictly limited to your approved frontend production and staging URLs.

---

## 📄 License
Private & Proprietary — StitchX Global Technology. All rights reserved.
