# SafBundle — Safaricom Data Bundles & Airtime Platform

**SafBundle** is a full-stack web application for selling Safaricom data bundles (Daily, Weekly, Monthly, Special Offers) and Safaricom airtime in Kenya with M-Pesa Daraja API integration, automated supplier fulfilment architecture, privacy-preserving order tracking, and a role-protected Admin Console.

> **Independent Platform Notice:** SafBundle is an independent digital bundle and airtime platform and is not affiliated with or endorsed by Safaricom PLC. Sample catalog packages and prices are clearly labelled for development and testing until your live supplier SKUs and Daraja credentials are configured.

---

## Core Features

- **Customer Storefront & Checkout**
  - Category filtering across Daily, Weekly, Monthly, Special Offers, and Airtime (presets + custom KES 10–10,000 top-ups).
  - Kenyan Safaricom phone number validation (`070x`, `071x`, `072x`, `0740–0743`, `0745–0746`, `0748`, `0757–0759`, `0768–0769`, `079x`, `0110–0115`) with double-entry confirmation and MSISDN normalization (`254XXXXXXXXX`).
  - **M-Pesa STK Push** initiation & server-side callback verification via Safaricom Daraja.
  - **Till Number / Paybill** instructions with optional transaction reference submission (orders are **never** marked paid from customer input alone; payment confirmation requires Daraja C2B callback verification).
  - **Private Order Tracking** requiring both Order Reference (`SB-XXXXXX`) and recipient Safaricom phone number (or cryptographic tracking token).

- **Automated Supplier Fulfilment Adapter**
  - Triggered automatically after verified M-Pesa payment callbacks.
  - Duplicate-delivery prevention via order-level active/delivered transaction guards and `Idempotency-Key` headers.
  - Clear status tracking (`pending_configuration`, `processing`, `delivered`, `failed`) with admin retry and investigation tools.

- **Protected Admin Dashboard (`/admin`)**
  - Google Sign-In protected with Firebase ID token verification on every `/api/admin/*` route.
  - Overview KPIs (total verified sales, orders, successful/pending payments, failed orders, integration readiness).
  - Product & SKU management (add, edit, toggle active/sample, delete) without frontend code changes.
  - Order investigation, failed delivery retry, payment ledger, Daraja webhook callback audit log, supplier transaction logs, and Till/Paybill/support settings.

- **Security Architecture**
  - Zero M-Pesa PIN collection or storage.
  - Server-side payment & callback amount verification.
  - Sliding-window rate limiting on `/api/orders`, `/api/payments/*`, and `/api/orders/track`.
  - Payment callback idempotency (`paymentCallbackRecords`).
  - Hardened Firestore Security Rules (`firestore.rules`) and PostgreSQL RLS policies (`supabase/schema.sql`).

---

## Project Structure

- `server.ts` — Express API server (orders, Daraja STK Push & C2B webhooks, tracking, admin endpoints) + Vite dev/production frontend serving on port `3000`.
- `src/server/daraja.ts` — Safaricom Daraja OAuth, STK Push, and STK/C2B callback parser & verifier.
- `src/server/supplier.ts` — Bundle supplier API adapter with duplicate-fulfilment prevention.
- `src/server/firebaseAdmin.ts` — Firebase Admin SDK & server-side admin authorization middleware.
- `src/server/rateLimit.ts` — Sliding-window IP rate limiter.
- `src/lib/phone.ts` — Kenyan Safaricom phone validator and normalizer.
- `src/components/` — Storefront (`HomeView`), `CheckoutView`, `TrackOrderView`, `AdminDashboard`, `Navbar`, `Footer`.
- `supabase/schema.sql` — Complete PostgreSQL / Supabase schema (tables, indexes, constraints, RLS policies).
- `firestore.rules` & `firebase-blueprint.json` — Hardened Firestore schema and security rules.

---

## Local Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   Copy `.env.example` to `.env` and fill in your credentials (never commit `.env`):
   ```bash
   cp .env.example .env
   ```

3. **Run development server:**
   ```bash
   npm run dev
   ```
   The app and API run together on `http://localhost:3000`.

4. **Type-check, lint rules, and production build:**
   ```bash
   npm run lint
   npm run build
   npm start
   ```

---

## Configuring Safaricom Daraja & Supplier APIs

Until live credentials are set, SafBundle honestly reports that Daraja STK Push and automated supplier delivery require configuration and will not fake successful live payments or deliveries.

1. **Safaricom Daraja API:**
   - Obtain `Consumer Key`, `Consumer Secret`, `Business Shortcode`, and `Lipa na M-Pesa Passkey` from the Safaricom Developer Portal.
   - Set `DARAJA_ENV=sandbox` (for testing) or `DARAJA_ENV=production`.
   - Set `DARAJA_CALLBACK_URL=https://your-domain.com/api/webhooks/daraja/stk-callback`.
   - Register C2B Validation (`POST /api/webhooks/daraja/c2b-validation`) and Confirmation (`POST /api/webhooks/daraja/c2b-confirmation`) URLs for Till/Paybill payments.
   - Optionally set `DARAJA_WEBHOOK_SECRET` so incoming callbacks verify `?token=...` or `X-Daraja-Webhook-Secret`.

2. **Authorized Bundle Supplier API:**
   - Set `SUPPLIER_API_URL`, `SUPPLIER_API_KEY`, and `SUPPLIER_PARTNER_ID`.
   - Ensure your supplier SKUs in the Admin Dashboard (`Products & SKUs`) match your supplier's live SKU identifiers.

---

## Database Options

- **Runtime Database (AI Studio / Firebase):** Provisioned via `firebase-applet-config.json` with rules in `firestore.rules`.
- **Supabase PostgreSQL:** Run `supabase/schema.sql` in the Supabase SQL Editor to create all 8 relational tables (`administrators`, `customers`, `products`, `orders`, `payments`, `supplier_transactions`, `payment_callback_records`, `business_settings`), constraints, indexes, and Row Level Security policies.

---

## GitHub & Vercel Deployment Instructions

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial SafBundle platform"
   git branch -M main
   git remote add origin https://github.com/<your-org>/safbundle.git
   git push -u origin main
   ```

2. **Deploy to Vercel:**
   - Import your GitHub repository in the Vercel dashboard.
   - Configure all environment variables from `.env.example` in **Project Settings → Environment Variables** (`DARAJA_*`, `SUPPLIER_*`, `ADMIN_EMAILS`, `APP_URL`, and Supabase keys if deploying with PostgreSQL).
   - For Node/Express full-stack hosting (Cloud Run, Railway, Render, or Fly.io), use `Build Command: npm run build` and `Start Command: npm start`.
   - For Vercel serverless deployment with Supabase PostgreSQL, map the Express handlers in `server.ts` (`POST /api/orders`, `/api/payments/*`, `/api/webhooks/daraja/*`, `/api/orders/track`, `/api/admin/*`) to serverless API functions (`api/` or Next.js `app/api/.../route.ts`) using `SUPABASE_SERVICE_ROLE_KEY` server-side only.
