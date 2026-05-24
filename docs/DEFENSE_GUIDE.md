# Core Fitness — Capstone Defense Guide

## System Title
**Core Fitness: AI-Assisted Gym Management System with Rule-Based Analytics and NLP-Based Administrative Support for Local Fitness Centers in Mamburao, Occidental Mindoro**

---

## Demo Flow (Recommended Order)

### 1. Admin Login — `http://localhost:5174/admin/login`
- Show the parallax landing page — scroll down slowly
- Point out: animated feature strip, features grid, cinematic footer
- Scroll back up → login form re-animates
- Click "Login"

### 2. Admin Dashboard
- Hover over each KPI card → show tooltips explaining what each metric means
- Show revenue bar chart (change year filter)
- Show attendance chart (toggle weekly/monthly)
- Show activity heatmap — explain peak hours
- Right sidebar: Statistics rings, Top Trainers, Expiring Soon list

### 3. Member Management — `/members`
- Show the compact table with pagination
- Click "Pending" button → pending registrations panel opens
- Show mock pending members (Mark Villanueva, Jasmine Cruz, Rafael Santos)
- Click Approve on one → member added as Active, toast notification
- Click a member row → detail modal with tabs

### 4. Trainer Management — `/trainers`
- Show 2-column trainer cards with real photos
- Click "Add Trainer" → show the full form including **Login Credentials section**
- Explain: "Admin creates trainer account here and gives the email/password to the trainer"
- Click Edit on a trainer → show availability day toggles
- Click View Profile → tabs: Profile, Assigned Members, Schedule, Feedback

### 5. Schedule & Bookings
- `/schedule` — show operating hours card, class creation, trainer availability chips
- `/bookings` — show compact table, approve/reject buttons, filter by status

### 6. Events — `/events`
- Show 2-column event cards
- Click "X/Y registered" → attendees modal

### 7. Attendance — `/attendance`
- Show 3-column layout: QR Scan | Manual Check-in | Attendance Log
- Demonstrate manual check-in: search a member → Check In
- Show attendance log with date filter

### 8. Retention — `/retention`
- Show rule-based detection (fits in one screen, no scrolling)
- Explain: "System automatically flags members who haven't visited in X days"
- Show at-risk table with risk levels and Execute action buttons

### 9. Settings — `/settings`
- Show left sidebar navigation (like a real settings panel)
- **Gym Information** — operating hours, address, capacity
- **Membership Plans** — add/edit/delete plans with pricing
- **Appearance** — theme cards with mini previews
- **Backup & Data** — export buttons, auto-backup toggle, danger zone

---

### 10. Member App — Splash `http://localhost:5173`
- Show full-screen splash (no scrolling)
- Feature strip scrolling infinitely
- Click "Get Started" → browse gyms page appears

### 11. Register — `/register`
- Show **Step 0: Role Selection** — Member vs Trainer cards
- Select **Trainer** → info box appears: "Contact admin for credentials"
- Select **Member** → Continue → 3-step form
- Show Step 1 (personal), Step 2 (account), Step 3 (plan selection with pricing)
- Submit → success screen with "Pending Approval" status

### 12. Login — `/login`
- Show **role selector at the top** (RBAC)
- Select **Member** → yellow-themed form → "Login as Member"
- Select **Trainer** → violet-themed form → "Login as Trainer"
- Login as Member → member home

### 13. Member Mode
- **Home**: QR code display, stats, upcoming class
- **Progress Hub**: show all 8 tabs — body measurements, charts, goals, badges, trainer feedback
- **Book a Class**: select trainer, date, time
- **AI Chatbot**: demonstrate conversational fitness assistant
- **Profile**: show Eya's profile photo, membership info

### 14. Trainer Mode
- Go back to login → select Trainer → login
- **Home**: today's classes, quick stats, recent activity, weekly summary
- **Members**: assigned members list → tap a member → detail sheet with recommendations
- **Schedule**: toggle availability days, filter classes by day
- **Bookings**: Accept/Decline pending requests
- **Profile**: Switch to Member Mode button

---

## Key Talking Points

### RBAC (Role-Based Access Control)
- Three distinct roles: Admin, Member, Trainer
- Role selection happens **before** login — not after
- Trainer accounts are **admin-created** (not self-registered) — admin sets credentials
- Members self-register but require admin approval before activation
- Same mobile app serves both Member and Trainer with completely different interfaces

### Why "AI-Assisted"?
- **NLP Chatbot** — understands natural language fitness queries, gives personalized recommendations
- **Rule-Based Retention** — automatically detects at-risk members using predefined rules
- **Intelligent Scheduling** — conflict detection when creating classes
- **Smart Alerts** — automated notifications for expiring memberships, low attendance

### Security Features
- Time-limited QR codes (expire after set duration, validated on scan)
- Role-based access — trainers can only see their own members/bookings
- Pending registration approval — no member activates without admin confirmation
- Admin-controlled trainer credentials — trainers cannot self-register

### Cross-Platform
- Admin: desktop web app (full-width, multi-column layouts)
- Member/Trainer: mobile app (375×812px phone frame, touch-optimized)
- Shared data layer via SharedStorage (simulates real-time sync)

---

## Common Panel Questions & Answers

**Q: Is this connected to a real database?**
A: This is a prototype using localStorage to simulate a backend. The architecture is API-ready — all data operations go through a SharedStorage utility that can be replaced with REST API calls without changing the UI code.

**Q: How does the QR code work?**
A: QR codes are generated with a timestamp and expiration time. When scanned at the attendance desk, the system validates the code hasn't expired and the member has an active membership before logging the check-in.

**Q: How does the trainer role work?**
A: The admin creates trainer accounts in the Trainers page, setting a login email and password. The trainer uses those credentials on the mobile app and selects "Trainer" role at login. They get a completely different interface focused on class management, member coaching, and booking management.

**Q: Why can't trainers self-register?**
A: Trainers are gym staff — their accounts should be controlled by the gym admin, not self-created. This is standard RBAC practice. The admin verifies the trainer, creates the account, and provides credentials.

**Q: Can multiple gyms use this?**
A: Yes. The system supports 3 gym locations (G-Fitness, Fitness Regency, Ferrer Fitness). Each gym has its own members, trainers, and schedules. Members select their gym when browsing.

**Q: How is retention tracked?**
A: Rule-based detection — if a member hasn't visited in X days or their attendance rate drops below a threshold, they're automatically flagged as at-risk with a risk level (High/Medium/Low) and suggested re-engagement actions.

**Q: What's in the Progress Hub?**
A: 8 tabs covering: body measurements (weight, BMI, arms/waist/chest/legs), workout logs, visual charts (4 charts), goal tracking with milestones, attendance analytics, membership status, achievement badges, and trainer feedback with assigned workout plans.

---

## Objectives Alignment Summary

| Objective | Implementation |
|-----------|---------------|
| Cross-platform ecosystem | Admin web app + Member/Trainer mobile app |
| Centralized membership management | `/members` with full CRUD + pending approval |
| QR-based attendance | `/attendance` 3-column with time-limited QR codes |
| Payment reporting | `/payments` + `/revenue` with charts |
| Rule-based monitoring | `/retention` with auto-detection rules |
| Business intelligence dashboard | `/dashboard` with KPIs, charts, heatmap |
| Staff & schedule management | `/trainers` + `/schedule` |
| NLP chatbot | `/member/chatbot` AI fitness assistant |
| Digital QR identification | `/member/home` QR code display |
| Personal attendance monitoring | Progress Hub → Attendance tab |
| Event management | Admin `/events` + Member `/member/events` |
| Account management | `/member/profile` + Progress Hub |
| RBAC | Role selection at login, admin-created trainer accounts |
