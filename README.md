# WhatsCRM v5.9.5

> **All-in-one WhatsApp, Instagram, and Telegram Marketing & Automation Platform**

A cloud-based SaaS platform for WhatsApp CRM with chatbot flow builder, API access, and multi-channel messaging support.

---

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [System Requirements](#-system-requirements)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Database Setup](#-database-setup)
- [Running the Application](#-running-the-application)
- [User Types](#-user-types)
- [Login Methods](#-login-methods)
- [Project Structure](#-project-structure)
- [API Endpoints](#-api-endpoints)
- [Payment Gateways](#-payment-gateways)
- [Integrations](#-integrations)
- [Fixes Applied](#-fixes-applied)
- [Troubleshooting](#-troubleshooting)
- [License](#-license)

---

## ✨ Features

### Core Features
- 📱 **WhatsApp Integration** - Full WhatsApp Business API integration
- 🤖 **Chatbot Flow Builder** - Visual drag-and-drop chatbot creator
- 📊 **Contact Management** - Organize contacts with tags and notes
- 📢 **Broadcast Messaging** - Send bulk messages to contacts
- 💬 **Multi-Channel Inbox** - WhatsApp, Instagram, Telegram in one place
- 🔗 **REST API Access** - Full API for developers
- 📱 **QR Code Management** - Multiple WhatsApp QR accounts
- 🎨 **Custom Themes** - Customizable interface themes
- 🌐 **Multi-Language Support** - RTL and multiple languages
- 📈 **Analytics & Reports** - Track conversations and performance

### Business Features
- 💳 **Subscription Plans** - Flexible pricing tiers
- 💰 **Multiple Payment Gateways** - Stripe, Razorpay, PayPal, Paystack, MercadoPago
- 🔐 **Social Login** - Google and Facebook OAuth
- 👥 **User Management** - Admin and user roles
- 🎯 **Lead Management** - Track and manage leads
- 📝 **WhatsApp Forms** - Collect data through WhatsApp
- 🚀 **WhatsApp Warmer** - Warm up new numbers
- 🔔 **Push Notifications** - Firebase Cloud Messaging

### AI Features
- 🤖 **Google Gemini AI** - AI-powered conversations
- 🗣️ **ElevenLabs Voice** - AI voice generation
- 💡 **Smart Replies** - AI-generated responses

---

## 🛠 Tech Stack

### Backend
- **Runtime:** Node.js (v14+)
- **Framework:** Express 4.x
- **Database:** MySQL 8.0
- **Authentication:** JWT (jsonwebtoken)
- **Password Hashing:** bcrypt
- **Real-time:** Socket.IO
- **WhatsApp:** Baileys library

### Frontend (Pre-compiled)
- **Framework:** React (pre-built static files)
- **Location:** `client/public/`
- **Build:** Production-optimized bundle

### Key Dependencies
```json
{
  "express": "^4.21.2",
  "mysql2": "^3.11.5",
  "socket.io": "^4.8.1",
  "@whiskeysockets/baileys": "^6.7.8",
  "jsonwebtoken": "^9.0.2",
  "bcrypt": "^5.1.1",
  "axios": "^1.7.9",
  "moment": "^2.30.1",
  "qrcode": "^1.5.4"
}
```

---

## 💻 System Requirements

### Minimum Requirements
- **OS:** Windows 10/11, Linux (Ubuntu 20.04+), macOS 10.15+
- **Node.js:** v14.0.0 or higher
- **MySQL:** v8.0 or higher
- **RAM:** 2GB minimum (4GB recommended)
- **Storage:** 2GB free space
- **Network:** Stable internet connection for WhatsApp API

### Recommended Setup
- **Node.js:** v18 LTS
- **MySQL:** v8.0.35+
- **RAM:** 8GB
- **CPU:** 2+ cores
- **Storage:** SSD with 10GB free space

---

## 🚀 Installation

### Step 1: Install Node.js
Download and install Node.js from [nodejs.org](https://nodejs.org/)

Verify installation:
```bash
node --version
npm --version
```

### Step 2: Install MySQL
Download and install MySQL 8.0 from [mysql.com](https://dev.mysql.com/downloads/mysql/)

Verify installation:
```bash
mysql --version
```

### Step 3: Clone/Extract Project
Extract the WhatsCRM package to your desired location:
```
WhatsCRM v5.9.5/
└── codecanyon-51122205-whatscrm-chatbot-flow-builder-api-access-whatsapp-crm-saas-system/
```

### Step 4: Install Dependencies
Navigate to the project directory and install packages:
```bash
cd "WhatsCRM v5.9.5/codecanyon-51122205-whatscrm-chatbot-flow-builder-api-access-whatsapp-crm-saas-system"
npm install
```

Expected output: ~455 packages installed

---

## ⚙️ Configuration

### 1. Environment Variables

Copy and configure the `.env` file:

```env
# ─── Server ──────────────────────────────────────────────────
PORT=3010

# ─── Database (MySQL) ────────────────────────────────────────
DBHOST=localhost
DBPORT=3306
DBUSER=root
DBPASS=your_mysql_password
DBNAME=whatscrm

# ─── JWT Secret ──────────────────────────────────────────────
JWTKEY=your-super-secret-jwt-key-change-this-in-production

# ─── App URLs ────────────────────────────────────────────────
FRONTENDURI=http://localhost:3010
BACKURI=http://localhost:3010

# ─── Stripe ──────────────────────────────────────────────────
STRIPE_LANG=en

# ─── Node Environment ────────────────────────────────────────
NODE_ENV=development
```

**⚠️ Important Security Notes:**
- Change `JWTKEY` to a long random string in production
- Never commit `.env` to version control
- Use strong MySQL passwords

### 2. Database Configuration

The database connection is configured in `database/config.js` and uses the `.env` values.

---

## 🗄️ Database Setup

### Step 1: Create Database

Open MySQL command line or MySQL Workbench:

```sql
CREATE DATABASE whatscrm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### Step 2: Import Schema

**Option A: Using MySQL Command Line (Windows)**
```bash
"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p whatscrm < whatscrm_schema.sql
```

**Option B: Using MySQL Workbench**
1. Open MySQL Workbench
2. Connect to your MySQL server
3. Select `whatscrm` database
4. File → Run SQL Script
5. Select `whatscrm_schema.sql`
6. Execute

### Step 3: Seed Configuration Data

The schema automatically seeds:
- Default configuration in `web_public` table
- Currency: INR (₹) with exchange_rate = 1.0
- Mobile app configuration

### Step 4: Create Admin Account

**Option A: Using SQL**
```sql
INSERT INTO admin (uid, name, email, password, role) 
VALUES (
  'admin-uid-12345',
  'Admin',
  'admin@whatscrm.com',
  '$2b$10$YourBcryptHashedPasswordHere',
  'admin'
);
```

**Option B: Pre-configured Admin**
The system comes with a default admin account:
- **Email:** admin@whatscrm.com
- **Password:** admin123
- **Role:** admin

⚠️ **Change this password immediately after first login!**

---

## ▶️ Running the Application

### Development Mode

```bash
node server.js
```

**Expected Output:**
```
WaCrm server is running on port 3010
🌐 [LangSync] All language files are in sync with English.json
Database has been connected
```

### Production Mode

For production, use a process manager like PM2:

```bash
# Install PM2 globally
npm install -g pm2

# Start application
pm2 start server.js --name "whatscrm"

# View logs
pm2 logs whatscrm

# Monitor
pm2 monit

# Auto-start on system boot
pm2 startup
pm2 save
```

### Access the Application

- **Admin Panel:** http://localhost:3010/admin/login
- **User Panel:** http://localhost:3010/user/login
- **API Base:** http://localhost:3010/api

---

## 👥 User Types

### 1. Admin 👨‍💼
- **Access:** Full system control
- **Login:** Email/Password only
- **Panel:** `/admin/*`
- **Capabilities:**
  - Manage all users and subscriptions
  - Configure payment gateways
  - System settings and themes
  - Social login configuration
  - View analytics and reports
  - Manage plans and pricing

**Default Admin:**
- Email: admin@whatscrm.com
- Password: admin123

### 2. User (Customer) 👤
- **Access:** Personal account features
- **Login:** Email/Password, Google, Facebook
- **Panel:** `/user/*`
- **Capabilities (Plan-based):**
  - WhatsApp CRM features
  - Contact management
  - Chatbot builder
  - Broadcast messaging
  - API access (if plan allows)
  - Multi-channel inbox

---

## 🔐 Login Methods

### For Users (Customers)

#### 1. Email/Password Login
- Standard authentication
- `/api/user/login`

#### 2. Google OAuth Login
- One-click Google sign-in
- Auto-creates account on first login
- Configure in Admin Panel → Social Login
- **Required:** Google Client ID
- `/api/user/login_with_google`

#### 3. Facebook OAuth Login
- One-click Facebook sign-in
- Auto-creates account on first login
- Configure in Admin Panel → Social Login
- **Required:** Facebook App ID and Secret
- `/api/user/login_with_facebook`

#### 4. User Registration
- Self-service signup
- Email verification
- Mobile with country code required
- Privacy policy acceptance
- `/api/user/signup`

### For Admins

#### 1. Email/Password Only
- Secure admin authentication
- `/api/admin/login`

---

## 📁 Project Structure

```
whatscrm/
├── automation/              # Automation and flow logic
│   ├── automation.js       # Main automation engine
│   ├── functions.js        # Automation helper functions
│   └── useAITransferHandler.js
├── client/
│   └── public/             # Pre-built React frontend (static)
│       ├── index.html      # Main HTML (with custom fixes)
│       ├── static/         # CSS, JS bundles
│       └── media/          # Images and files
├── database/
│   ├── config.js           # MySQL connection config
│   └── dbpromise.js        # Promise-based query wrapper
├── functions/
│   ├── function.js         # Utility functions
│   ├── ai.js               # AI integration functions
│   └── payment.js          # Payment processing
├── middlewares/
│   ├── admin.js            # Admin authentication
│   └── user.js             # User authentication
├── routes/
│   ├── admin.js            # Admin API routes
│   ├── user.js             # User API routes
│   ├── chatbot.js          # Chatbot routes
│   ├── chatFlow.js         # Flow builder routes
│   ├── webhook.js          # Webhook handlers
│   ├── insta.js            # Instagram integration
│   └── web.js              # Public web routes
├── .env                    # Environment configuration
├── server.js               # Main application entry
├── package.json            # Dependencies
├── whatscrm_schema.sql     # Database schema
└── README.md               # This file
```

---

## 🔌 API Endpoints

### Admin Endpoints
- `POST /api/admin/login` - Admin login
- `GET /api/admin/get_social_login` - Get social login settings
- `POST /api/admin/update_social_login` - Update social login config
- `GET /api/admin/users` - List all users
- `POST /api/admin/create_plan` - Create subscription plan
- `GET /api/admin/get_plans` - Get all plans
- ... (70+ admin endpoints)

### User Endpoints
- `POST /api/user/login` - User login
- `POST /api/user/signup` - User registration
- `POST /api/user/login_with_google` - Google OAuth
- `POST /api/user/login_with_facebook` - Facebook OAuth
- `GET /api/user/profile` - Get user profile
- `POST /api/user/contacts` - Manage contacts
- `POST /api/user/broadcast` - Send broadcasts
- ... (100+ user endpoints)

### Chatbot/Flow Endpoints
- `POST /api/chatbot/create` - Create chatbot
- `GET /api/chatbot/list` - List chatbots
- `POST /api/flow/create` - Create flow
- `GET /api/flow/list` - List flows
- ... (20+ flow endpoints)

### Webhook Endpoints
- `POST /api/webhook/whatsapp` - WhatsApp webhooks
- `POST /api/webhook/instagram` - Instagram webhooks
- `POST /api/webhook/telegram` - Telegram webhooks

**Full API documentation available in Postman collection (request from support)**

---

## 💳 Payment Gateways

Configure payment gateways from Admin Panel → Billing → Payment Gateway:

### Supported Gateways

1. **Stripe**
   - Global payment processing
   - Credit/Debit cards
   - Config: API Key, Secret Key

2. **Razorpay** (India)
   - Optimized for Indian market
   - UPI, Cards, Net Banking
   - Config: Key ID, Key Secret
   - **Fixed:** Removed 81× exchange rate bug

3. **PayPal**
   - International payments
   - Config: Client ID, Secret

4. **Paystack** (Africa)
   - African markets
   - Config: Public Key, Secret Key

5. **MercadoPago** (Latin America)
   - LATAM markets
   - Config: Public Key, Access Token

6. **Offline Payment**
   - Manual payment confirmation
   - Config: Custom key

### Payment Flow
1. User selects plan
2. Redirected to payment gateway
3. Payment processed
4. Webhook confirms payment
5. Plan activated automatically
6. Email confirmation sent

---

## 🔗 Integrations

### Messaging Platforms
- **WhatsApp** - Meta Cloud API & Baileys
- **Instagram** - Facebook Graph API
- **Telegram** - Telegram Bot API

### AI Services
- **Google Gemini AI** - Smart conversations
- **ElevenLabs** - Voice generation

### Cloud Services
- **Firebase** - Push notifications (FCM)
- **MongoDB** (Optional) - QR session storage

### Social Login
- **Google OAuth 2.0**
- **Facebook Login**

### Email
- **SMTP** - Custom email server configuration

**Configure all integrations from Admin Panel → Settings/Integrations**

---

## 🔧 Fixes Applied

This installation includes several fixes and improvements:

### 1. Payment Price Fix ✅
**Issue:** Razorpay showing ₹162 instead of ₹2 (81× multiplication)
**Fix:** Removed exchange rate multiplication in:
- `routes/user.js` (pay_with_rz route)
- `client/public/static/js/main.dca03fbf.js`
- Database: exchange_rate set to 1.0 for INR

**Documentation:** `PAYMENT_FIX_COMPLETE.md`

### 2. Auto-Logout on Refresh Fix ✅
**Issue:** Users automatically logged out on page refresh
**Fix:** Removed interceptor script from `client/public/index.html` that was clearing localStorage

**Documentation:** `LOGOUT_ISSUE_FIXED.md`

### 3. Database Schema Fixes ✅
**Multiple column fixes applied:**
- `user.plan` - Changed from INT to TEXT for JSON storage
- `user.plan_expire` - Fixed datetime format conversion
- `user.timezone` - Added missing column
- `beta_chats.updatedAt` - Added auto-update timestamp
- `beta_chats.kanban_order` - Added for kanban ordering
- `beta_flows.updatedAt` - Added auto-update timestamp
- `beta_chatbot.updatedAt` - Added auto-update timestamp

**Documentation:** Multiple fix docs in root directory

### 4. Cursor Visibility Fix (Light Mode) ✅
**Issue:** Cursor difficult to see in light mode
**Fix:** Custom CSS in `client/public/index.html` with:
- Enhanced cursor visibility with SVG cursors
- Black fill with white stroke
- Different cursor types for different elements
- High contrast support

**Documentation:** `CURSOR_VISIBILITY_FIX.md`

### 5. Social Login Sidebar Fix ✅
**Issue:** Clicking "Social Login" triggered search, disabled sidebar
**Fix:** Comprehensive JavaScript in `client/public/index.html`:
- Email auto-fill prevention
- Search results overlay removal
- Sidebar protection from being disabled
- Click handler interception

**Documentation:** `SOCIAL_LOGIN_FIX_FINAL.md`, `SIDEBAR_SEARCH_FIX.md`

### 6. Automation Flows Verification ✅
**Status:** All flow tables verified and working
**Documentation:** `AUTOMATION_FLOWS_CHECK.md`

---

## 🐛 Troubleshooting

### Server Won't Start

**Issue:** Port already in use
```
Error: listen EADDRINUSE: address already in use :::3010
```
**Solution:**
```bash
# Windows
netstat -ano | findstr :3010
taskkill /PID <PID> /F

# Linux/Mac
lsof -i :3010
kill -9 <PID>
```

**Issue:** Database connection failed
```
Error: ER_ACCESS_DENIED_ERROR
```
**Solution:** Check `.env` file credentials match MySQL setup

### Database Issues

**Issue:** MySQL command not found (Windows)
**Solution:** Use full path:
```bash
"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
```

**Issue:** Database tables missing
**Solution:** Re-import schema:
```bash
mysql -u root -p whatscrm < whatscrm_schema.sql
```

### Frontend Issues

**Issue:** Page shows white screen
**Solution:** 
1. Clear browser cache (Ctrl+Shift+Delete)
2. Hard refresh (Ctrl+Shift+R)
3. Check browser console (F12) for errors

**Issue:** "Session expired" on every page
**Solution:** Check `admin` table has `role` column:
```sql
ALTER TABLE admin ADD COLUMN role VARCHAR(50) DEFAULT 'admin';
```

### Payment Gateway Issues

**Issue:** Razorpay showing wrong amount
**Solution:** Already fixed in this version. Verify:
- Database: `exchange_rate = 1.0000`
- Backend: No multiplication in payment routes
- Frontend: Price calculation fixed in compiled JS

### WhatsApp Connection Issues

**Issue:** QR code not generating
**Solution:**
1. Check internet connection
2. Verify WhatsApp number is not already connected elsewhere
3. Check server logs for Baileys errors
4. Ensure port 3010 is accessible

### Permission Issues (Linux)

**Issue:** EACCES permission denied
**Solution:**
```bash
# Don't use sudo for npm install
# Instead fix npm permissions:
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.profile
source ~/.profile
```

---

## 📝 Development Notes

### Running Tests

The project includes Playwright tests:

```bash
# Install Playwright
npm install -D @playwright/test
npx playwright install chromium

# Run tests
node test-social-login.js
```

### Debugging

Enable detailed logging:

```env
NODE_ENV=development
DEBUG=*
```

View logs in console or use PM2:
```bash
pm2 logs whatscrm --lines 100
```

### Code Formatting

The project uses standard JavaScript. For consistency:

```bash
# Install prettier (optional)
npm install -D prettier

# Format code
npx prettier --write "**/*.js"
```

---

## 🔒 Security Best Practices

### Production Checklist

- [ ] Change default admin password
- [ ] Update `.env` with strong JWT secret
- [ ] Use strong MySQL password
- [ ] Enable HTTPS (use Let's Encrypt)
- [ ] Set `NODE_ENV=production`
- [ ] Configure firewall rules
- [ ] Regular database backups
- [ ] Keep dependencies updated
- [ ] Monitor logs for suspicious activity
- [ ] Implement rate limiting (if needed)
- [ ] Configure CORS properly

### Backup Strategy

**Daily backups recommended:**

```bash
# Backup database
mysqldump -u root -p whatscrm > backup_$(date +%Y%m%d).sql

# Backup media files
tar -czf media_backup_$(date +%Y%m%d).tar.gz client/public/media/

# Backup .env
cp .env .env.backup
```

---

## 📚 Additional Documentation

- `PAYMENT_FIX_COMPLETE.md` - Payment gateway fix details
- `SOCIAL_LOGIN_FIX_FINAL.md` - Social login navigation fix
- `SIDEBAR_SEARCH_FIX.md` - Sidebar and search comprehensive fix
- `AUTOMATION_FLOWS_CHECK.md` - Flow builder testing guide
- `CURSOR_VISIBILITY_FIX.md` - Light mode cursor fix
- `LOGOUT_ISSUE_FIXED.md` - Auto-logout fix
- `DATABASE_FIX_*.md` - Various database fixes
- `CLEAR_BROWSER_CACHE.md` - Browser cache clearing guide
- `CHANGE_TO_INR_CURRENCY.md` - Currency change guide

---

## 🆘 Support

### Common Resources
- Check documentation files in project root
- Review server logs for error messages
- Check browser console (F12) for frontend errors
- Verify database schema is up to date

### Reporting Issues
When reporting issues, include:
1. Error message (full stack trace)
2. Steps to reproduce
3. Node.js version (`node --version`)
4. MySQL version (`mysql --version`)
5. Operating system
6. Browser (if frontend issue)

---

## 📜 License

This is a commercial product purchased from CodeCanyon.

**Item ID:** 51122205
**Version:** 5.9.5
**Author:** [Original Author Name]

**Usage Rights:**
- Single application per license
- Modifications allowed for personal use
- Cannot redistribute or resell
- Support and updates included for 6 months

For extended license or multiple applications, purchase additional licenses from CodeCanyon.

---

## 🎉 Acknowledgments

**Built with:**
- Express.js - Fast Node.js web framework
- Baileys - WhatsApp Web API
- Socket.IO - Real-time communication
- React - Frontend UI library
- MySQL - Reliable database
- And 455 other amazing open-source packages

**Special Thanks:**
- Baileys WhatsApp library maintainers
- Node.js and npm community
- All open-source contributors

---

## 📞 Quick Reference

### Important URLs
- Admin Login: http://localhost:3010/admin/login
- User Login: http://localhost:3010/user/login
- API Base: http://localhost:3010/api

### Default Credentials
- **Admin:** admin@whatscrm.com / admin123
- **Database:** root / [your-password]

### Key Commands
```bash
# Install
npm install

# Run
node server.js

# Production
pm2 start server.js --name whatscrm

# Database
mysql -u root -p whatscrm < whatscrm_schema.sql

# Test
node test-social-login.js
```

### Important Ports
- **Application:** 3010
- **MySQL:** 3306
- **Socket.IO:** 3010 (same as app)

---

**Version:** 5.9.5 (Modified with fixes)  
**Last Updated:** June 18, 2026  
**Setup Time:** ~15 minutes  
**Difficulty:** Intermediate  

---

## 🚀 Quick Start (TL;DR)

```bash
# 1. Install dependencies
npm install

# 2. Configure .env
# Edit .env file with your MySQL credentials

# 3. Create database
mysql -u root -p -e "CREATE DATABASE whatscrm;"

# 4. Import schema
mysql -u root -p whatscrm < whatscrm_schema.sql

# 5. Start server
node server.js

# 6. Access application
# Open http://localhost:3010/admin/login
# Login: admin@whatscrm.com / admin123
```

**That's it! You're ready to use WhatsCRM.** 🎉

---

*For detailed guides, check the documentation files in the project root directory.*
