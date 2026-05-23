# Core Fitness — Project Structure

```
CoreFitness/
├── README.md                       # Quick start + links to docs
├── docs/
│   ├── SYSTEM_DOCUMENTATION.md     # Complete system overview (start here)
│   ├── SETUP_GUIDE.md              # Installation, credentials, troubleshooting
│   ├── DEFENSE_GUIDE.md            # Capstone defense demo flow + Q&A
│   └── PROJECT_STRUCTURE.md        # This file
│
├── assets/                         # Shared image assets
│   ├── eya.png                     # Member profile photo
│   ├── duhac.png                   # Trainer photo source
│   ├── ituralde.png                # Trainer photo source
│   ├── ucol.png                    # Trainer photo source
│   ├── LOGO CORE FITNESS.png       # Main logo
│   └── ...                         # Gym covers and logos
│
├── g-fitness-admin/                # ── ADMIN DASHBOARD APP ──
│   ├── public/
│   │   ├── core-fitness-logo.png   # Sidebar logo
│   │   ├── trainer-duhac.png       # Trainer photo
│   │   ├── trainer-ituralde.png    # Trainer photo
│   │   └── trainer-ucol.png        # Trainer photo
│   └── src/
│       ├── components/
│       │   ├── layout/
│       │   │   ├── Layout.tsx          # Main layout (sidebar + header + content)
│       │   │   ├── Sidebar.tsx         # Collapsible sidebar (56px/208px)
│       │   │   └── Header.tsx          # Top header with gym selector
│       │   └── ui/                     # Reusable UI components
│       │       ├── Card.tsx            # Surface card (supports title tooltip)
│       │       ├── Button.tsx
│       │       ├── Badge.tsx
│       │       ├── Input.tsx
│       │       ├── Modal.tsx
│       │       ├── Pagination.tsx
│       │       ├── AddMemberModal.tsx
│       │       ├── EditMemberModal.tsx
│       │       ├── MemberDetailModal.tsx
│       │       ├── QRScanner.tsx
│       │       └── LandingFooter.tsx   # Cinematic footer on login page
│       ├── data/
│       │   ├── members.ts              # 10 mock members (Aaron Diwa, Eya, etc.)
│       │   ├── trainers.ts             # 3 trainers (Duhac, Iturralde, Ucol)
│       │   ├── mockRetention.ts        # At-risk members mock data
│       │   └── mockTrainerFeedback.ts  # Trainer feedback records
│       ├── hooks/
│       │   └── useGymContext.ts        # Gym selection context hook
│       ├── pages/
│       │   ├── AdminLogin.tsx          # Parallax login + features + footer
│       │   ├── Dashboard.tsx           # KPIs, charts, heatmap, sidebar stats
│       │   ├── Members.tsx             # Member table + pending panel
│       │   ├── Trainers.tsx            # 2-col cards + add/edit with credentials
│       │   ├── Schedule.tsx            # Operating hours + class scheduling
│       │   ├── Bookings.tsx            # Booking requests table
│       │   ├── Events.tsx              # 2-col event cards + attendees
│       │   ├── Attendance.tsx          # 3-col: QR | Manual | Log
│       │   ├── Retention.tsx           # Rule-based analytics (fits in screen)
│       │   ├── Revenue.tsx             # Revenue reports + service management
│       │   ├── Payments.tsx            # Payment history
│       │   └── Settings.tsx            # 8-tab left-sidebar settings
│       ├── services/
│       │   └── dashboardService.ts     # Dashboard data provider
│       ├── utils/
│       │   ├── sharedStorage.ts        # Shared localStorage API
│       │   ├── formatters.ts           # Date/currency formatters
│       │   ├── exportUtils.ts          # CSV export utility
│       │   └── toast.ts                # Toast notifications
│       ├── App.tsx                     # Router + protected routes
│       └── main.tsx                    # Entry point
│
└── g-fitness-member/               # ── MEMBER & TRAINER APP ──
    ├── public/
    │   ├── assets/
    │   │   └── micajoy-fitness.jpg.png # Splash screen hero image
    │   ├── trainer-duhac.png           # Trainer photo (copied from admin)
    │   ├── trainer-ituralde.png        # Trainer photo (copied from admin)
    │   ├── trainer-ucol.png            # Trainer photo (copied from admin)
    │   ├── eya.png                     # Member profile photo
    │   ├── g-fitness-logo.jpg          # G-Fitness logo
    │   ├── fitness-regency-logo.jpg    # Fitness Regency logo
    │   └── ferrer-fitness-logo.png     # Ferrer Fitness logo
    └── src/
        ├── components/
        │   ├── layout/
        │   │   ├── Layout.tsx              # Member layout + bottom nav + chathead
        │   │   ├── TrainerLayout.tsx       # Trainer layout + trainer bottom nav
        │   │   ├── MobileFrame.tsx         # 375×812px phone frame wrapper
        │   │   ├── BottomNav.tsx           # Member bottom nav (wraps MobileMenuDock)
        │   │   ├── TrainerBottomNav.tsx    # Trainer bottom nav (Home/Members/Schedule/Bookings/Profile)
        │   │   └── MobileMenuDock.tsx      # Animated dock (Home/Book/Progress/Trainers/Profile)
        │   └── ui/
        │       ├── FloatingChathead.tsx    # Draggable AI chatbot bubble
        │       ├── AuthChoiceSheet.tsx     # Login/signup bottom sheet
        │       ├── LoadingOverlay.tsx      # Full-screen loading
        │       ├── MiniCharts.tsx          # Line/Bar/Area mini charts for Progress Hub
        │       └── ...
        ├── data/
        │   ├── gyms.ts                     # 3 gym locations with covers/logos
        │   └── mockHomeDashboard.ts        # Home page mock stats
        ├── pages/
        │   ├── GymList.tsx                 # Splash (no-scroll) + gym browser
        │   ├── GymDetail.tsx               # Gym info, services, trainers
        │   ├── Login.tsx                   # RBAC: role selector → login form → route
        │   ├── Register.tsx                # Step 0: role select → Member 3-step form
        │   ├── Onboarding.tsx              # First-time setup
        │   ├── Home.tsx                    # QR code, stats, upcoming class
        │   ├── BookClass.tsx               # Book trainer session
        │   ├── BookingHistory.tsx          # Past bookings
        │   ├── AttendanceHistory.tsx       # Check-in history
        │   ├── Profile.tsx                 # Member profile with eya.png photo
        │   ├── EditProfile.tsx             # Edit profile form
        │   ├── Membership.tsx              # Membership details
        │   ├── RenewMembership.tsx         # Renewal flow
        │   ├── PaymentHistory.tsx          # Payment records
        │   ├── Events.tsx                  # View/join gym events
        │   ├── Trainers.tsx                # Browse trainers
        │   ├── TrainerProfile.tsx          # Individual trainer profile
        │   ├── ChatbotPage.tsx             # AI fitness assistant
        │   ├── Workouts.tsx                # Workout library
        │   ├── progress/
        │   │   ├── ProgressHub.tsx         # 9-tab progress hub
        │   │   ├── hooks/
        │   │   │   └── useMemberId.ts      # Member ID hook
        │   │   └── tabs/
        │   │       ├── BodyProgressTab.tsx     # Weight, BMI, measurements
        │   │       ├── WorkoutProgressTab.tsx  # Workout logs
        │   │       ├── VisualDashboardTab.tsx  # 4 charts
        │   │       ├── ProgressPhotosTab.tsx   # Before/after photos
        │   │       ├── GoalsTab.tsx            # Goal tracking + milestones
        │   │       ├── AttendanceTab.tsx       # Visit stats + weekly grid
        │   │       ├── MembershipTab.tsx       # Membership status
        │   │       ├── BadgesTab.tsx           # Achievement badges
        │   │       └── TrainerFeedbackTab.tsx  # Trainer notes + workout plan
        │   └── trainer/
        │       ├── TrainerHome.tsx         # Dashboard: classes, stats, activity
        │       ├── TrainerMembers.tsx      # Assigned members + recommendations
        │       ├── TrainerSchedule.tsx     # Availability toggle + class list
        │       ├── TrainerBookings.tsx     # Accept/decline bookings
        │       └── TrainerProfile.tsx      # Profile + switch to member mode
        ├── services/
        │   └── progressService.ts          # Progress Hub data service
        ├── utils/
        │   ├── auth.ts                     # Authentication helpers
        │   ├── prototype.ts                # Prototype login constants
        │   ├── qrCode.ts                   # QR code generation + validation
        │   ├── sharedStorage.ts            # Shared localStorage API
        │   └── errorHandler.ts             # Error/success toast helpers
        ├── App.tsx                         # Router: member routes + trainer routes
        └── main.tsx                        # Entry point
```

---

## Key Architectural Decisions

| Decision | Reason |
|----------|--------|
| localStorage as database | Prototype — no backend needed, simulates real-time sync |
| SharedStorage utility | Single API for all data operations, easy to swap with REST API |
| Same app for Member + Trainer | Unified codebase, different layouts/routes per role |
| Role selection before login | Proper RBAC UX — user knows their role before authenticating |
| Admin creates trainer accounts | Trainers are staff — admin controls who gets trainer access |
| MobileFrame component | Consistent phone frame across all unauthenticated pages |
| TrainerLayout separate from Layout | Different bottom nav, different page structure |
