<p align="center">
  <img src="assets/LOGO CORE FITNESS.png" alt="Core Fitness Logo" width="120" />
</p>

<h1 align="center">Core Fitness</h1>

<p align="center">
  <strong>Gym Management System</strong><br/>
  Supabase Backend • Role-Based Access Control • Installable Phone App
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/Supabase-Postgres_+_Auth-3ECF8E?logo=supabase&logoColor=white" />
  <img src="https://img.shields.io/badge/PWA-Android_APK-5A0FC8?logo=pwa&logoColor=white" />
</p>

---

## About

**Core Fitness** is a gym management system built for a local fitness centre in Mamburao,
Occidental Mindoro. It replaces a paper logbook and a spreadsheet with a real database: member
records, cash payments, QR check-in, class and personal-training bookings, and threshold-based
retention reporting.

Two applications share one Postgres database — a desktop dashboard for the gym, and a phone app
members and trainers install on their own devices.

Built as a capstone project at the **University of Occidental Mindoro**.

> **On the word "AI".** This system contains **no machine learning and no NLP**. The two chatbots
> are deterministic keyword matchers, and the retention "analytics" are threshold rules over real
> check-in dates (21 / 14 / 7 days inactive). They are useful, and they are not AI. Earlier
> versions of this README claimed otherwise; the claim was wrong and has been removed.

---

## Applications

| Application | Port | Platform | Description |
|-------------|------|----------|-------------|
| **Admin Dashboard** | `5174` | Desktop web | Members, trainers, schedule, bookings, payments, revenue, retention, settings |
| **Member & Trainer App** | `5173` | Installable phone app (PWA → Android APK) | One app, two role-gated interfaces |

Not a monorepo — each app has its own dependencies. Run `npm` from inside an app directory.

---

## Quick Start

Both apps need a Supabase project. Copy `.env.example` to `.env.local` in each app and fill in
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — see [supabase/README.md](supabase/README.md)
for schema setup and the first-admin bootstrap.

```bash
git clone https://github.com/lealorenzana/CoreFitness.git
cd CoreFitness
```
```bash
cd g-fitness-admin && npm install && npm run dev     # → http://localhost:5174
```
```bash
cd g-fitness-member && npm install && npm run dev    # → http://localhost:5173
```

---

## User Roles

Access is enforced by **Postgres Row Level Security**, not by the UI. Route guards are a
convenience; the database is the boundary.

| Role | Access |
|------|--------|
| **Admin** | Everything — pricing, trainers, accounts, settings |
| **Staff** | Front desk: take payments, check members in, extend memberships. Every action is a recorded, reversible transaction. Cannot change pricing or accounts. |
| **Trainer** | Own classes, assigned members, availability, booking requests |
| **Member** | Bookings, QR check-in, progress, payment history |

```
MEMBER   self-register → pending_approval → admin approves + records payment → active
TRAINER  admin creates the account (Edge Function) → trainer signs in
ADMIN    bootstrapped once from the Supabase dashboard
```

---

## Features

### Admin dashboard
- KPI dashboard, revenue reports and an attendance heatmap — all from real rows
- Member management with the pending-registration approval flow
- Trainer accounts created server-side, so the admin's own session is never swapped
- Class timetable and trainer working hours; PT slots are generated from those hours
- Attendance: QR scan, manual check-in, and a per-visit activity tag
- Retention worklist — threshold rules over real check-ins, **not** ML
- Membership plans with per-plan entitlements, freeze (limited frequency) and cancel
- Events, gym settings, and a broadcast composer

### Member app
- Time-limited QR code for gym entry
- Book group classes and 1-on-1 personal training; classes are matched to experience level
- 7-tab Progress Hub — measurements, workouts, charts, goals, attendance, membership, trainer notes
- Free workout resources — curated links out to external sites, never copied content
- Payment history and self-service renewal

### Trainer app
- Today's classes, assigned members, and booking requests to accept or decline
- Own availability, which drives the PT slots members can book

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | React 19 + TypeScript 5 |
| Build | Vite 8 |
| Routing | React Router 7 |
| Styling | Tailwind **3** (admin) / Tailwind **4** (member) + CSS custom properties |
| Animation | Framer Motion |
| Charts | Recharts (admin only) |
| Icons | Lucide React |
| **Database / Auth** | **Supabase — Postgres, Auth, RLS, Edge Functions (free tier)** |
| Hosting | Vercel free tier; Android APK via PWABuilder TWA |

Infrastructure cost is **₱0** — see [docs/BUSINESS_MODEL.md](docs/BUSINESS_MODEL.md).

---

## Project Structure

```
CoreFitness/
├── g-fitness-admin/          # Desktop dashboard
│   └── src/
│       ├── pages/            # 18 routed pages
│       ├── lib/api/          # Typed Supabase wrappers
│       └── services/         # Multi-table screen assembly
│
├── g-fitness-member/         # Member + trainer phone app
│   └── src/
│       ├── pages/            # Member pages
│       ├── pages/trainer/    # 6 trainer pages
│       ├── pages/progress/   # 7-tab Progress Hub
│       ├── lib/api/          # Same API layer, byte-identical
│       └── services/         # bookingService, memberHomeService, …
│
├── supabase/                 # 20 SQL migrations, RLS policies, Edge Functions
├── assets/                   # Shared source images
└── docs/                     # See below
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [supabase/README.md](supabase/README.md) | Schema setup, migrations, Edge Function deployment |
| [docs/MIGRATION_STATUS.md](docs/MIGRATION_STATUS.md) | What's real, and the data-honesty rules |
| [docs/BUSINESS_MODEL.md](docs/BUSINESS_MODEL.md) | Tiers, ₱0 infrastructure, maintenance flow |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Shipping the phone app (PWA → APK) |
| [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md) | Installation and troubleshooting |
| [docs/DEFENSE_GUIDE.md](docs/DEFENSE_GUIDE.md) | Demo flow, talking points, panel Q&A |
| [CLAUDE.md](CLAUDE.md) | Architecture and conventions, for contributors |

---

## Design System

| Element | Specification |
|---------|--------------|
| Primary | `#7C3AED` violet — selection and structure |
| Secondary | `#F59E0B` amber — primary actions |
| Background | `#0F0F1A` |
| Theme | Dark only, flat colour, no gradients |
| Buttons | Pill (`--radius-btn: 99px`) |
| Type floor | 12px minimum — this ships on a phone |
| Mobile shell | Full-screen `100dvh` + safe-area insets. **No decorative phone frame** — it ships as a real installed app. |

---

## Design Principles

Three rules the codebase actually enforces:

1. **A number with no source does not appear.** Where nothing is measured, screens show an empty
   state, not a plausible-looking figure.
2. **A missed lookup renders nothing** — never a fallback identity. Showing the wrong member's
   name is worse than showing none.
3. **Members are archived, never deleted.** Deleting cascades through payments and attendance and
   destroys the gym's records.

---

## License

Developed for academic purposes as a capstone requirement.

---

<p align="center">
  <strong>Core Fitness</strong> — Capstone Project<br/>
  University of Occidental Mindoro • 2024–2026
</p>
