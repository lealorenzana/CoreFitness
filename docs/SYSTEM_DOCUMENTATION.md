# Core Fitness — System Documentation

## Overview

**Core Fitness** is an AI-assisted gym management system built as a capstone project. It consists of two web applications sharing a common data layer via localStorage (simulating a backend database for prototype purposes).

- **Admin App** — Desktop web application for gym administrators (`localhost:5174`)
- **Member App** — Mobile-first application for gym members and trainers (`localhost:5173`)

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend Framework | React 18 + TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS + CSS Variables |
| Animations | Framer Motion |
| Charts | Recharts |
| Icons | Lucide React |
| Routing | React Router v6 |
| State | React useState + localStorage |
| Data Sharing | SharedStorage utility (localStorage-based) |

---

## Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Violet (Primary) | `#7C3AED` | Buttons, accents, active states |
| Yellow (Secondary) | `#F59E0B` | Highlights, badges, CTAs |
| Black (Background) | `#0F0F1A` | Page backgrounds |
| Surface | `#1A1A2E` | Cards, panels |
| Border | `#2D2D44` | Dividers, outlines |

---

## Admin Application (localhost:5174)

### Pages

| Page | Route | Description |
|------|-------|-------------|
| Login | `/admin/login` | Glassmorphism card, 3D tilt, traveling light beams, parallax features section, cinematic footer |
| Dashboard | `/dashboard` | KPI cards with tooltips, revenue/attendance charts, activity heatmap, top trainers, expiring memberships sidebar |
| Members | `/members` | Member table with search/filter/pagination, add/edit/delete, pending registrations panel (approve/reject) |
| Trainers | `/trainers` | 2-column trainer cards with photos, ratings, availability days, add trainer with login credentials |
| Schedule | `/schedule` | Operating hours, date-based/recurring classes, trainer availability chips, conflict detection |
| Bookings | `/bookings` | Compact table with approve/reject, search/filter by status/date, add booking |
| Events | `/events` | 2-column event cards, create/edit events, view attendees modal |
| Attendance | `/attendance` | 3-column: QR scan, manual check-in, attendance log |
| Retention | `/retention` | Rule-based analytics, trend chart with year filter, at-risk members table (fits in one screen) |
| Revenue | `/revenue` | Revenue reports, pie chart, service/plan management |
| Payments | `/payments` | Payment history and records |
| Settings | `/settings` | 8-tab left-sidebar layout: Profile, Gym Info, Membership Plans, Notifications, Security, Appearance, Admin Accounts, Backup & Data |

### Key Admin Features

- **Pending Registration Flow** — Member registers → Pending → Admin approves → Active
- **QR Attendance** — Time-limited secure QR codes, 3-column check-in interface
- **Rule-Based Retention** — Auto-detects at-risk members by inactivity/low attendance
- **Trainer Credential Management** — Admin creates trainer accounts with email + password for mobile app access
- **Dashboard Tooltips** — All KPI and chart cards have hover tooltips explaining what they show
- **Settings** — Gym info, operating hours, membership plan editor, backup/export, admin account management

---

## Member Application (localhost:5173)

### Splash & Browse

| Page | Route | Description |
|------|-------|-------------|
| Splash | `/` | Full-screen splash (no scroll): gym photo hero, "SMART FITNESS. SMARTER MANAGEMENT." heading, animated feature strip, Get Started button |
| Browse Gyms | `/` (after splash) | Gym cards with cover photos, ratings, member counts, features, View Info button |
| Gym Detail | `/gym/:gymId` | Gym info, services, trainers, location |

### Auth

| Page | Route | Description |
|------|-------|-------------|
| Login | `/login` | **RBAC role selector first** (Member / Trainer cards), then login form styled per role, login button routes directly to correct dashboard |
| Register | `/register` | **Step 0: Role selection** — Member proceeds to 3-step form; Trainer sees "contact admin" info box with Go to Login button |

### Member Routes

| Page | Route | Description |
|------|-------|-------------|
| Onboarding | `/onboarding` | First-time user setup |
| Home | `/member/home` | QR code display, quick stats, upcoming class, notifications |
| Book Class | `/member/book-class` | Browse and book trainer sessions |
| Progress Hub | `/member/progress` | 8-tab hub: Body, Workouts, Charts, Goals, Attendance, Membership, Badges, Trainer Feedback |
| Trainers | `/member/trainers` | View available trainers and profiles |
| Profile | `/member/profile` | Member profile with photo (eya.png), edit, membership info |
| Events | `/member/events` | View and join gym events |
| Chatbot | `/member/chatbot` | AI-powered fitness assistant |

### Trainer Routes (same app, different layout)

| Page | Route | Description |
|------|-------|-------------|
| Home | `/trainer/home` | Today's classes, quick stats (members/classes/pending), recent activity, weekly summary |
| Members | `/trainer/members` | Assigned members (read-only), tap for detail sheet, add workout recommendations |
| Schedule | `/trainer/schedule` | Toggle own availability days (Mon–Sun), filter and view assigned classes |
| Bookings | `/trainer/bookings` | Filter by status, Accept/Decline pending bookings, view booking history |
| Profile | `/trainer/profile` | Trainer info, stats, Switch to Member Mode button, logout |

---

## RBAC — Role-Based Access Control

### Three Roles

| Role | How Account is Created | App Access |
|------|----------------------|------------|
| **Admin** | Pre-configured / Settings → Admin Accounts | Admin web app only |
| **Member** | Self-registration (3-step form) → Pending → Admin approves | Member app (`/member/*`) |
| **Trainer** | Admin creates account in Trainers page with email + password | Trainer app (`/trainer/*`) |

### Permissions

| Action | Admin | Trainer | Member |
|--------|-------|---------|--------|
| Manage all members | ✅ | ❌ | ❌ |
| Approve/reject registrations | ✅ | ❌ | ❌ |
| Create/delete classes | ✅ | ❌ | ❌ |
| Set trainer availability | ✅ (all) | ✅ (own only) | ❌ |
| Accept/decline bookings | ✅ (all) | ✅ (own only) | ❌ |
| Add member recommendations | ❌ | ✅ | ❌ |
| Book a class | ❌ | ❌ | ✅ |
| View own progress | ❌ | ❌ | ✅ |
| QR check-in | ❌ | ❌ | ✅ |
| View assigned members | ❌ | ✅ | ❌ |

---

## Registration & Login Flows

### Member Registration Flow
1. Open app → Get Started → Browse Gyms → Select gym → Sign Up
2. **Step 0**: Select role → choose **Member**
3. **Step 1**: Personal info (name, email, phone)
4. **Step 2**: Account setup (address, birthdate, password)
5. **Step 3**: Choose membership plan (Basic ₱800 / Standard ₱1500 / Premium ₱2500) + accept terms
6. Submit → status set to **Pending** → success screen
7. Admin sees pending badge → opens panel → Approve/Reject
8. Approved → member can log in as Member

### Trainer Account Flow
1. Admin opens Trainers page → Add Trainer
2. Fills: name, specialization, email, phone, bio, available days
3. Sets **Login Email** + **Login Password** (credentials section)
4. Saves → credentials stored in `trainer_accounts` localStorage
5. Admin shares credentials with trainer
6. Trainer opens app → Login → selects **Trainer** role → enters credentials → `/trainer/home`

### Login Flow (RBAC)
1. User opens `/login`
2. **Selects role first**: Member card (yellow) or Trainer card (violet)
3. Form border/button color adapts to selected role
4. Enters credentials → clicks "Login as Member" or "Login as Trainer"
5. Routes directly to correct dashboard — no post-login overlay

---

## Progress Hub (8 Tabs)

| Tab | Features |
|-----|---------|
| **Body** | Weight, height, BMI (auto-calculated), arms/waist/chest/legs measurements, muscle Δ, fat Δ, history |
| **Workouts** | Workout logs with exercises, sets, reps, calories |
| **Charts** | Weight trend, workouts/week bar chart, visit days by weekday, calories burned area chart, weight journey |
| **Goals** | Create goals (weight loss, muscle gain, attendance, calories), progress bars, milestone alerts (50%/100%), achieved section |
| **Attendance** | All-time visits, this month/week, active/inactive status, weekly grid, QR/manual check-in log |
| **Membership** | Remaining days, renewal reminders, subscription history |
| **Badges** | Achievement badges (7-Day Streak, Cardio King, Heavy Lifter, Consistent Member), gamification |
| **Trainer Feedback** | Trainer recommendations, performance comments, improvement suggestions, assigned workout plans |

---

## Data Architecture

All data stored in `localStorage` (prototype). The `SharedStorage` utility provides a unified API:

```
gfitness_members           — All member records
gfitness_bookings          — All booking requests
gfitness_payments          — Payment history
gfitness_attendance        — Check-in records
pending_registrations      — Pending member registrations
admin_events               — Gym events
trainer_accounts           — Trainer login credentials (created by admin)
trainer_availability       — Trainer day toggles (set by trainer)
members_{gymId}            — Per-gym member cache
attendance_{gymId}_{date}  — Per-day attendance log
admin_profile              — Admin profile settings
admin_gym_info             — Gym information settings
admin_membership_plans     — Membership plan configurations
admin_notifications        — Notification preferences
admin_appearance           — Theme/language settings
admin_accounts             — Admin user accounts
admin_auto_backup          — Backup schedule settings
```

---

## Trainers

| Name | Specialization | Login Email | Photo |
|------|---------------|-------------|-------|
| Cyrelle Joy Duhac | Strength & Conditioning | cyrelle@corefitness.com | `/trainer-duhac.png` |
| Ana Par Iturralde | HIIT & Cardio | ana@corefitness.com | `/trainer-ituralde.png` |
| Nathanniel Ucol | Boxing & Functional Training | nathanniel@corefitness.com | `/trainer-ucol.png` |

---

## How to Run

```bash
# Admin App (port 5174)
cd g-fitness-admin
npm install
npm run dev

# Member App (port 5173)
cd g-fitness-member
npm install
npm run dev
```

---

## Design Principles

1. **Dark theme only** — flat solid colors, no gradients
2. **Violet + Yellow + Black** palette strictly enforced
3. **Pill-shaped buttons** (rounded-full, 40px height)
4. **Compact layouts** — no dead space, fit content in one screen where possible
5. **Internal scrolling** — panels scroll within themselves, page stays fixed
6. **Mobile frame** — Member app uses 375×812px phone frame (MobileFrame component)
7. **CSS Variables** — all colors use `var(--color-*)` for consistency
8. **RBAC** — role selection happens before login, not after
