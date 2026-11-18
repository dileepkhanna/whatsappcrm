# WhatsCRM — WhatsApp Chatbot, Flow Builder & CRM SaaS

WhatsCRM is a full-stack, multi-tenant WhatsApp CRM and marketing automation platform. It lets businesses connect WhatsApp (via the official Meta Cloud API or an unofficial QR/Baileys session), run a shared team inbox, build no-code chatbots and automation flows, send bulk campaigns, capture leads with WhatsApp Forms, and expose a REST API for developers — all wrapped in an admin-managed, plan-based SaaS.

- **Backend:** Node.js + Express + Sequelize (MySQL), Socket.IO for real-time
- **Frontend:** React 19 + TypeScript + Vite + Material-UI (in `frontend/`)
- **Version:** 5.9.5

> This README describes the whole project. The React app has its own notes in [`frontend/README.md`](./frontend/README.md).

---

## Table of Contents

- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Feature Overview](#feature-overview)
  - [User Panel](#user-panel-features)
  - [Admin Panel](#admin-panel-features)
  - [Agent Panel](#agent-panel-features)
  - [Developer / API Access](#developer--api-access)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Configuration](#environment-configuration)
- [Available Scripts](#available-scripts)
- [Backend API Modules](#backend-api-modules)
- [Real-Time & Background Workers](#real-time--background-workers)
- [Testing](#testing)
- [Production Deployment](#production-deployment)
- [License](#license)

---

## Architecture

WhatsCRM is a single deployable Node.js application. The Express server (`server.js` → `app.js`) serves the JSON API under `/api/*`, streams uploaded media, and — in production — serves the compiled React app as static files from `client/public`. During development the React app runs separately on Vite and proxies API calls to the backend.

```
┌──────────────────────────────────────────────────────────────┐
│                        Browser (SPA)                           │
│  React 19 + TS + MUI  ·  User / Admin / Agent panels           │
└───────────────┬───────────────────────────┬───────────────────┘
                │ REST /api/*                │ Socket.IO (real-time)
┌───────────────▼───────────────────────────▼───────────────────┐
│                    Express server (app.js)                     │
│  Auth · Inbox · Chatbot · Flows · Broadcast · Webhooks · API   │
├────────────────────────────────────────────────────────────────┤
│  WhatsApp channels        Background loops        Integrations  │
│  • Meta Cloud API         • Campaign sender       • Stripe/etc. │
│  • QR / Baileys session   • Number "warmer"       • FCM push    │
│                           • Telegram (optional)   • Gemini/AI   │
├────────────────────────────────────────────────────────────────┤
│                   MySQL (Sequelize ORM)                         │
└────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Backend
- **Runtime:** Node.js, Express 4
- **Database:** MySQL via Sequelize 6 (migrations through `sequelize-cli`)
- **Real-time:** Socket.IO 4
- **WhatsApp:** `baileys` / `mysql-baileys` (QR session channel) + Meta WhatsApp Cloud API (HTTP)
- **Auth:** JWT (`jsonwebtoken`), `bcrypt` password hashing
- **Media:** `sharp`, `fluent-ffmpeg` / `ffmpeg-static`, range-based streaming
- **Payments:** Stripe, Mercado Pago (plus gateways configured from the admin UI)
- **Push / notifications:** `firebase-admin` (FCM), `web-push`, `nodemailer` (SMTP)
- **AI:** Google Generative AI (Gemini), ElevenLabs (voice for WhatsApp calling)
- **Other channels:** Telegram (`telegram`), Instagram DM/comment automation
- **Automation runtime:** `vm2` sandbox, `playwright` for headless tasks

### Frontend (`frontend/`)
- **React 19** + **TypeScript**, built with **Vite**
- **Material-UI (MUI 9)** for components and theming (light/dark)
- **@tanstack/react-query** for server state, **Zustand** for client state
- **React Router 7** for routing
- **@xyflow/react** / **reactflow** for the visual flow builder
- **Recharts** / **@mui/x-charts** for dashboards
- **Socket.IO client**, **Axios**, **react-hook-form + zod**, **react-hot-toast**

---

## Feature Overview

The app has three role-based experiences — **User**, **Admin**, and **Agent** — plus a **developer REST API**. All panels are fully responsive (mobile, tablet, laptop).

### User Panel Features

The main tenant workspace. Grouped as they appear in the sidebar:

**Core**
- **Dashboard** — usage stats, campaign/message metrics, charts
- **Inbox** — real-time, multi-channel team inbox with conversation list, chat window, contact info, media, and quick replies
- **Kanban** — drag-and-drop board to organize conversations/leads by stage

**WhatsApp Forms**
- **WhatsApp Forms** — no-code form builder (drag-and-drop fields) with a live WhatsApp preview and submission tracking

**Instagram**
- **Link Instagram** — connect an Instagram account
- **Insta DM Bot** — automated Instagram direct-message replies
- **Insta Comment → DM** — auto-DM users who comment on posts

**WhatsApp QR Plugin (unofficial / Baileys)**
- **Add WhatsApp by QR** — connect a personal/business number by scanning a QR code
- **WhatsApp Warmer** — gradually "warms up" QR-connected numbers to reduce ban risk
- **REST API** — per-user REST endpoints for the QR channel

**WA Meta Connect (official Cloud API)**
- **Link Meta WhatsApp** — connect a WhatsApp Business (Meta Cloud API) number

**Automation & Bots**
- **Automation Flows** — visual flow builder for multi-step automations
- **WA Chatbot** — keyword/trigger-based chatbot with a node-based flow editor

**Broadcasting**
- **Campaign Dashboard** — overview of broadcast campaigns and their status
- **Create Meta Template** — build and submit WhatsApp message templates
- **Send Campaign** — bulk-send templated campaigns to contact lists
- **Phonebook** — contact lists, import (CSV), grouping, and contact management

**AI WhatsApp Calling**
- **Create Call Flow** — design AI-driven voice call flows
- **WA Call Logs** — history of AI WhatsApp calls
- **Setup WA Calls** — configure calling (uses ElevenLabs voice + WebRTC)

**Meta REST API**
- **Conversational API** — programmatic conversational messaging
- **Template API** — programmatic template messaging
- **API Dashboard** — API keys, usage, and access management

**Webhook Automation**
- **Manage Webhooks** — register inbound/outbound webhooks
- **Webhook Automation** — trigger flows/actions from webhook events
- **Webhook Logs** — delivery and event logs

**More options**
- **Web Notification** — browser push notifications (FCM)
- **Agent Login / Agent Task** — create sub-agents and assign them chats/tasks
- **Chat Widget** — embeddable website chat widget that routes into the inbox
- **Profile & Subscription** — account settings and plan/billing management

### Admin Panel Features

Platform administration and SaaS management:

**Users & Plans**
- **Dashboard** — platform-wide metrics
- **Manage Plans** — create/edit subscription plans and limits
- **Manage Users** — view, edit, change plans, and log in as any user
- **Orders** — subscription orders and payment records

**Front-end Content (CMS)**
- **Front Partners**, **FAQ**, **Manage Pages** (incl. Privacy Policy / Terms), **Testimonials**, **Contact Form** — manage public landing-site content

**Data & Integrations**
- **WA Links data**, **Payment Gateways** (Stripe, Razorpay, PayPal, Mercado Pago, etc.), **Flowbuilder Templates** (starter flows for users)

**Settings**
- **Theme Settings**, **Social Login**, **Site Settings** (branding/logo), **SMTP**, **Web Translation** (i18n language files), **Update Web**

**Pro Add-ons**
- **QR Plugin Settings**, **Instagram Config**, **Web Notification**, **Manual Web Push**, **WA Embed Login**

### Agent Panel Features

A dedicated, standalone portal for support agents (separate login at `/agent`):
- **Assigned Chats** — only conversations assigned to the agent
- **Tasks** — assigned tasks with completion + comments
- **Quick send** — reply to assigned contacts directly
- Lightweight, mobile-friendly UI independent of the main app shell

### Developer / API Access

- **REST API (`/api/v1`, `apiv2.js`)** — token-authenticated endpoints for sending messages, templates, and conversational messaging from external systems
- **Webhooks** — subscribe to inbound message and delivery events
- **Chat Widget loader** — public `/widget.js` + `/api/widget/config/:id`

---

## Project Structure

```
.
├── app.js                  # Express app: middleware, route mounting, media streaming
├── server.js               # Server bootstrap (entry point)
├── socket.js               # Socket.IO initialization
├── config/                 # DB and app configuration (Sequelize)
├── routes/                 # API route modules (see table below)
├── middlewares/            # Auth guards (user.js, admin.js, agent, etc.)
├── functions/              # Shared helper functions
├── helper/                 # Add-ons: qr/baileys, telegram, warmer, etc.
├── loops/                  # Background workers (campaign sender, etc.)
├── models/                 # Sequelize models
├── migrations/ seeders/    # DB migrations & seed data
├── utils/                  # Utilities (i18n language sync, etc.)
├── client/public/          # Compiled frontend + uploaded media (served in prod)
├── whatscrm_schema.sql     # Reference DB schema
├── .env.example            # Environment template
└── frontend/               # React + TypeScript SPA (Vite)
    └── src/
        ├── features/       # One folder per feature (inbox, chatbot, broadcast, ...)
        ├── components/     # Shared UI (layout, common components, theme)
        ├── api/            # Axios service modules
        ├── hooks/          # React hooks (useAuth, useSocket, ...)
        └── router.tsx      # Route definitions (user / admin / agent)
```

---

## Getting Started

### Prerequisites
- **Node.js** 18+ and npm
- **MySQL** 5.7+ / 8.x
- (Optional) MongoDB, if you enable Mongo-based session storage
- (Optional) FFmpeg is bundled via `ffmpeg-static`

### 1. Clone & install backend dependencies

```bash
git clone <your-repo-url>
cd whatscrm   # project root
npm install
```

### 2. Create the database

Create a MySQL database (default name `whatscrm`) and import the reference schema, or run migrations:

```bash
# Option A: import the provided schema
mysql -u root -p whatscrm < whatscrm_schema.sql

# Option B: use Sequelize migrations (and seed data)
npm run db:migrate
npm run db:seed
```

### 3. Configure environment

```bash
cp .env.example .env
# then edit .env with your DB credentials, JWT secret, and URLs
```

### 4. Install & build the frontend

```bash
cd frontend
npm install
npm run build       # outputs into the app's served public dir
cd ..
```

### 5. Run

**Production-style (server serves the built SPA):**
```bash
npm start           # builds frontend then runs the server
# or, if already built:
npm run dev         # runs server.js only
```
App is served on `http://localhost:3010` (or your `PORT`).

**Development with hot-reload frontend:**
```bash
# terminal 1 — backend API
npm run dev

# terminal 2 — frontend dev server (Vite on :5173, proxies /api to :3010)
npm run dev:frontend
```
Visit `http://localhost:5173`.

> After first setup, log in to the **Admin Panel** to configure payment gateways, WhatsApp Meta credentials, SMTP, push notifications, and AI keys — these are stored in the database, not in `.env`.

---

## Environment Configuration

Core values live in `.env` (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `PORT` | Backend port (default `3010`) |
| `DBHOST` / `DBPORT` / `DBUSER` / `DBPASS` / `DBNAME` | MySQL connection |
| `JWTKEY` | JWT signing secret — **use a long random string in production** |
| `FRONTENDURI` | Public URL of the app |
| `BACKURI` | Backend URL (used for payment callbacks) |
| `NODE_ENV` | `development` or `production` |
| `STRIPE_LANG` | Stripe checkout language |

The frontend uses its own `frontend/.env`:

```env
VITE_API_URL=http://localhost:3010
VITE_SOCKET_URL=http://localhost:3010
```

**Configured from the Admin UI (stored in DB, not `.env`):** payment gateway keys, WhatsApp Meta Cloud API credentials, Firebase/FCM keys, AI keys (Gemini, ElevenLabs), Telegram/Instagram integration, and SMTP settings.

---

## Available Scripts

Run from the project root (backend) unless noted.

| Script | Description |
| --- | --- |
| `npm start` | Build frontend, then start the server |
| `npm run dev` | Start the backend server only (`server.js`) |
| `npm run dev:frontend` | Start the Vite dev server for the React app |
| `npm run build` | Build the React frontend |
| `npm run build:prod` | Build frontend and start the server |
| `npm run db:migrate` | Run Sequelize migrations |
| `npm run db:migrate:undo` | Revert the last migration |
| `npm run db:seed` | Run all seeders |
| `npm run migration:create -- <name>` | Generate a new migration |
| `npm test` | Run the Jest test suite |
| `npm run test:coverage` | Tests with coverage report |

Frontend-only scripts (run inside `frontend/`): `npm run dev`, `npm run build`, `npm run preview`, `npm run lint`.

---

## Backend API Modules

All routes are mounted in `app.js`. Highlights:

| Base path | Module | Responsibility |
| --- | --- | --- |
| `/api/user` | `routes/user.js` | User auth, profile, account |
| `/api/admin` | `routes/admin.js` | Admin management, plans, users, settings |
| `/api/web` | `routes/web.js` | Public site content / landing data |
| `/api/inbox` | `routes/inbox.js` | Conversations & messaging |
| `/api/chatbot` | `routes/chatbot.js` | Keyword chatbot |
| `/api/chat_flow` | `routes/chatFlow.js` | Chatbot flow definitions |
| `/api/automation` * | `routes/automation.js` | Automation flows |
| `/api/broadcast` | `routes/broadcast.js` | Campaigns / bulk sending |
| `/api/templet` | `routes/templet.js` | Message templates |
| `/api/phonebook` | `routes/phonebook.js` | Contacts & lists |
| `/api/waform` | `routes/waform.js` | WhatsApp Forms |
| `/api/qr` | `routes/qr.js` | QR / Baileys WhatsApp channel |
| `/api/wa_call` | `routes/waCall.js` | AI WhatsApp calling |
| `/api/agent` | `routes/agent.js` | Agent portal (chats/tasks) |
| `/api/kaban` | `routes/kaban.js` | Kanban board |
| `/api/insta` | `routes/insta.js` | Instagram automation |
| `/api/telegram` | `routes/telegram.js` | Telegram integration |
| `/api/webhook` | `routes/webhook.js` | Webhook management |
| `/api/webpush` | `routes/webPush.js` | Web push notifications |
| `/api/ai`, `/api/ai_settings` | `routes/ai.js`, `routes/aiSettings.js` | AI features & config |
| `/api/theme` | `routes/theme.js` | Theme/branding |
| `/api/v1` | `routes/apiv2.js` | Public developer REST API |
| `/` | `routes/widget.js` | Public chat-widget loader (`/widget.js`) |

\* Mount path may vary; see `app.js` for the authoritative list.

---

## Real-Time & Background Workers

On startup (`app.js`), the server:
1. Initializes **Socket.IO** for live inbox/notification events.
2. Connects the **QR (Baileys) module** to Socket.IO and restores sessions.
3. Starts background loops after a short delay:
   - **Campaign sender** (`loops/campaignBeta.js`) — processes queued broadcast campaigns.
   - **WhatsApp Warmer** — keeps QR-connected numbers active/warm.
   - **Telegram** worker — optional, disabled by default (uncomment `initTele()`).
4. Registers cleanup handlers (`node-cleanup`) to gracefully close WhatsApp/Telegram sessions on exit.

---

## Testing

The backend uses **Jest** + **Supertest** for endpoint tests, plus `fast-check` for property-based tests.

```bash
npm test                 # full suite
npm run test:endpoints   # endpoint tests only
npm run test:user        # a single module (e.g. user)
npm run test:coverage    # with coverage
```

---

## Production Deployment

Checklist (from `.env.example`):

- [ ] Set a strong random `JWTKEY`
- [ ] Set `FRONTENDURI` / `BACKURI` to your HTTPS domain
- [ ] Set `NODE_ENV=production`
- [ ] Use a dedicated MySQL user (not `root`)
- [ ] Change the default admin password after first login
- [ ] Enable HTTPS (SSL) and configure firewall rules
- [ ] Configure automated database backups
- [ ] Build the frontend (`npm run build`) so the server can serve `client/public`
- [ ] Configure payment, WhatsApp, SMTP, push, and AI credentials in the Admin Panel

A typical deploy runs the app behind a reverse proxy (e.g. Nginx) and keeps the Node process alive with a manager such as **PM2**.

---

## License

Proprietary. Refer to your purchased license for usage terms.
