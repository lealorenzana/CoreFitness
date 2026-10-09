# Gym workflows redesign — design

**Date:** 2026-10-10 · **Status:** awaiting review · **Apps:** member/trainer, admin, platform, site, database

Every decision below was made with the user on 2026-10-10 (question rounds and three mockups).
Where the user said "you decide", the choice is marked **(decided)** and argued in one line.

The work is too big for one build. It ships as **eight projects in order, A → H**, each with its
own implementation plan, migrations, tests and deploy. Nothing in a later project is needed to
ship an earlier one.

---

## Rules that apply to every project

- **One meaning per word, everywhere.** *Workout* = one session done today. *Routine* = a saved,
  repeatable list of exercises. *Program* = a multi-week plan that gets harder week by week
  (progressive overload). Every screen, notification and the AI coach use these three words this way.
- **Everything is labelled by where it came from**: *Yours*, *Coach ___*, *AI coach*, *Gym*.
- **A gym's choices change the app, never a fork of it.** Every workflow choice is a row in
  `gym_settings` / `gym_modules`, read by SQL (RLS, definer functions) and by `moduleRoutes.ts`.
  The screen and the database read the same switch.
- **Nothing is typed twice** (autofill): whatever someone has already typed carries forward.
- **Every history list is paginated** (see A2). **Every date picker obeys one rule** (see A1).
- Existing rules from CLAUDE.md stand: archive never delete, RLS is the boundary, no client-granted
  rewards, the free workout library is never gated, Renew is never gated.

---

## A — Fixes across all apps

### A1. Calendars: one rule and one picker
**Bug:** pickers accept any year (an event can be set in 2002; the gym-wide goal can start in the past).

One shared picker per app (admin `DatePicker`, member `Field` date, platform, site) with a required
`mode`; a raw `<input type="date">` anywhere fails a new audit script (`scripts/audit-dates.py`, in CI).

| mode | allowed | used for |
|---|---|---|
| `future` (default) | today … today + 2 years | bookings, classes, events, announcements' schedule, reminders, deadlines, goals/challenges/seasons start and end, renewals, expiry, plan end, coaching term, scheduled reports, delivery, invitations' expiry |
| `record` | a stated window back, never the future | past payment: from the 1st of this month and never before the member joined · missed workout/reading: 30 days back · attendance correction: 7 days |
| `history` | the gym's first day on the system … today | report ranges, history filters, exports |
| `birth` | 120 years back … today − the gym's minimum age | birth date only |

The same windows are enforced in SQL (CHECK or trigger on the columns that matter), so a crafted
request cannot set 2002 either. The picker UI gets a month/year header that only offers allowed
years, today marked, disabled days visibly greyed, and a short hint ("Dates from today").
Applies to all four apps; the site's apply form uses `future`/`birth` as relevant.

### A2. Pagination everywhere
Every history list becomes pages of **20**, numbered (`‹ 1 2 3 … 17 ›`) with "321 visits · page 1 of 17",
fetched with `range()` + an exact count — never "load everything then scroll". Covers (full list in
the plan, found by audit): member attendance, payments, points history, notifications/inbox,
workout history, coach notes/room stream older posts, achievements log; trainer session history;
admin members, payments, attendance history, activity log, retention, shop sales, invoices,
renewal requests; platform gyms, applications, tickets, activity, usage, receipts. Member
"See all" pages keep their own page (existing rule) and paginate inside it. `audit-lists.py` flags
an unpaginated `.select()` on a history table.

### A3. Trainers + Credentials become one page
`/admin/credentials` folds into `/admin/trainers`. Each trainer row shows a badge: *Needs review (2)* /
*Verified* / *Expired*. The trainer's detail sheet has a **Credentials** section: each file
viewable, with Verify / Reject (reason) — the existing 0160 functions. The old URL redirects.

### A4. Shop: photos and tooltips
Products get a photo (one per product, a counted `reserve_gym_photo()` slot, `media/gyms/<gym>/shop/`).
Member shop and desk sale screen show it. Every non-obvious control on admin Shop gets a tooltip
(`TooltipLayer`, `data-tip`): stock, "void", "same day only", "drawer", "out of stock shows as".

### A5. Feature switches that are missing
New switches (rows in `platform_features`, owner toggles in **Your app**, and members/trainers obey
through `moduleRoutes.ts` and RLS):
- `photos` (progress photos) — exists as a child of progress; make it visible and explained in Your app.
- `meal_notes` — **trainer-only** meal notes (the user's choice): a coach writes a portion-based
  note for their own trainee inside the 1-on-1 room; the AI coach never writes meals; 0146's
  `meal_text_ok` rules (no calories, macros, nutrient amounts) still apply. Off by default.
- `points` — see D4.
- `targets` (goals) — see B5.
- `equipment`, `day_passes`, `walk_ins`, `coach_picking`, `class_bookings`, `pt_bookings` — introduced in C.

### A6. Win-back in the activity log
Live data: 64 members got "Still with us?" **once each** between Oct 4–9 — not daily. It *looks*
daily because the owner's activity log shows one line per member. Fix: the log groups one sweep's
sends into one line ("Win-back sent to 12 members · Still with us?"), expandable; and a hard cap
of **one win-back of any kind per member per month**, none to anyone who checked in within 7 days.

---

## B — Training cleanup (member + trainer)

### B1. One Workouts page (replaces This week · Programs · Routines · Free workouts)
Chosen from mockups:
- **First visit:** the step-by-step view — 1) your program, 2) your routines, 3) today's workout —
  shown until the member starts a first workout or taps **Skip** (stored per member in the
  database, not `localStorage`).
- **After that:** four tabs — **Today · Routines · Programs · Browse** — with a small
  "How this works" link that reopens the steps.
- **Today:** the next workout (from the active program, else the plan builder's day) with one
  Start button, then "Or do something else today" (routines), then the week strip.
  **Empty state** (no program): "No program? No problem" → Browse the free library · Ask the AI
  coach to build one · Gym programs.
- **Routines:** yours, from your coach, from the AI coach — each tagged; Duplicate to make your own copy.
- **Programs:** your active program with week N of M; gym programs; coach programs; AI programs.
- **Browse:** the free library (never locked) and gym programs.
The Train tab's *My plan* hub becomes this page; old URLs redirect.

### B2. Programs become real programs
Today 0122 programs are a list of days. A program gains **weeks** and a **progression rule** per
exercise (add kg / add reps / add sets per week, with a deload week option). The player shows this
week's target ("3 × 8 @ 42.5 kg — last week 40 kg"). Gym, coach and AI programs share one table
with a `source` and `author_id`.

### B3. One place per coach (room = the one place)
- A **1-on-1 room** is the private thread between a member and their coach: chat messages, coach
  notes, assigned routines/programs and check-ins in one timeline. Coach notes become a post type
  ("Note") pinned to the top until read.
- **Class and group rooms** keep the stream with comments.
- The **Messages** and **Coach notes** tabs are removed; existing chat (0131) and notes migrate
  into the matching 1-on-1 room's timeline. `chat` stays a gym switch: off = the 1-on-1 room has
  notes and routines but no free chat.
- Privacy stays: only the two people see a 1-on-1 room; the desk/owner have no policy on it.

### B4. Trainer sees and edits AI-made routines and programs
- In the trainee's sheet and 1-on-1 room the coach sees routines/programs the AI coach made,
  **only if the member shares workouts** with their coach (`trainer_may_see`, unchanged).
- The coach edits in place: the member's copy updates, is labelled **"Edited by Coach ___"**, the
  member is notified, and an edit history keeps the AI's original (member can **Keep my version**
  to fork back).
- Anything a coach assigns is pinned in the room and appears in Workouts under that coach's label.

### B5. Goals → Targets
Goals move into Progress → Overview as **Targets** (one card per target with progress; "Add a
target" is a 2-field form: what + by when, `future` date). The database still settles them
(0087). Gym switch `targets`; off hides them. Points for reaching one follow D4.

### B6. One Inbox (Updates + Announcements)
One **Inbox** screen, two filters: **For you** (notifications) · **From the gym** (announcements,
events). The bell opens it. Announcement audiences gain a plan picker (see D1).

### B7. Squad → Team
"Squad" (friends competing on weekly training days) is renamed **Team** everywhere it is shown
and stays under Challenges **(decided: it is a game, not coaching; "coaching group" is the
coaching one)**.

### B8. AI coach can do more
All behind the existing Apply/Undo proposal pattern (0145) — nothing changes until the member taps:
- **Book and cancel** ("Book me Friday's 7am HIIT") → a booking proposal; booking rules (0017,
  0068, approvals in C3) apply unchanged.
- **Explain my progress** — reads logs, streak, readings, targets; says what improved and what stalled.
- **Build a full program** (weeks + progression, B2) — visible to their coach (B4).
- **Answer gym questions** — hours, closed days, prices, house rules, class times, equipment,
  day-pass price — read from the gym's own rows, never invented; "I don't know" when a row is empty.
- **(decided)** also: *swap an exercise for available equipment* (reads C7's list), *plan around
  my week* (moves today's workout when the member says they can't come), *log for me* ("I did
  3×10 bench at 40") as a proposal. Injury still yields a referral, never a changed exercise.

### B9. Trainer app — Discord layout (mockup A)
- **Left rail** of round room photos grouped *Classes · 1-on-1 · Groups*, a **Home** icon on top
  (today's sessions, booking requests, members needing attention), amber unread counts, **+** to
  create a group (if the gym runs groups).
- **Channel column** for the open room: Stream · Classwork · People (· Chat for 1-on-1), and
  Manage: Schedule · Attendance · Settings.
- Tapping a channel slides the content over the list; swipe right to go back (Discord on a phone).
- **Profile bottom-left**: tap for status (*Available / Away / On leave* — "On leave" feeds C2's
  stand-in flow), profile, settings, switch gym, sign out.
- Each room has a photo: class photo (owner sets per class), member's avatar, group picture.
- Replaces the current five-tab trainer bar. Member app keeps its three tabs.

---

## C — Gym setup chooses the workflow

All of C is set in the **setup wizard** (`/admin/setup`) and editable later in Settings.
The member and trainer apps change accordingly; switched-off parts are hidden (gym choice, not a lock).

### C1. Ways of getting coached (several can be on)
- **Timetable classes** — members book seats; each class has a room.
- **Pick your own coach (1-on-1)** — member browses coaches (photo, specialties, bio, rating,
  availability) and picks one → a 1-on-1 room.
- **Pick a coach as a group** — 2+ members pick the same coach together (one invites the others
  by code) → one group room. This *is* a coaching group, now started by members.
- **Desk assigns** — the desk/owner assigns a coach to a member (or to a group).
- **(decided)** also: *Coach invites* — a coach can invite their own trainee/group (owner can turn off).

### C2. Coaching term and stand-ins
- When a member picks a coach they choose a **length** from the gym's list (default 1 / 3 / 6
  months). It renews or ends like a membership, with reminders; the member can switch early.
- **Stand-in:** when the coach is *On leave* / unavailable / fully booked, the member sees other
  coaches with the same specialty who are free and picks one **for that session or that period**;
  the main coach stays theirs and gets the history when back.

### C3. Bookings — approval per type
For **classes** and **1-on-1** separately, the owner picks one:
**Instant · Coach approves · Desk approves · Coach then desk · Off** (that kind of booking is hidden).
Desk and owner can always reverse. Replaces 0071's fixed "coaches decide" with this setting
(the default for existing gyms is what they have today: coach decides).

### C4. Who pays for coaching (three setups)
1. **Included in membership plans** — the member's plan decides who may pick a coach.
2. **Gym-priced** — the owner sets a price per length and type (1-on-1 / group per person); the
   member pays the gym (desk, GCash proof, or PayMongo); the term starts when paid.
3. **Pay the trainer directly (G Fitness)** — the gym suggests coaches; the member pays the
   **trainer**, separately from the gym membership. Each trainer adds their own GCash/Maya/bank
   details and QR and, optionally, their own PayMongo account. The member pays and sends the
   reference (or pays through PayMongo); **the trainer taps Received** and the term starts. The
   gym sees that the member has a coach and until when — never the trainer's money.

### C5. Who can join (three rules) + approval
1. **Listed** — anyone can find the gym in the app and sign up.
2. **Link or code only** — hidden from the list; only a link/code holder can sign up, and only to that gym.
3. **Front desk only** — no self sign-up. The desk creates members. An **invited friend** opens
   the invite link, fills a **join request** (name, contact, birth date, plan they want, waiver)
   and the gym is notified; the desk approves (account created, free tier, 0078) or declines.
For 1 and 2 the owner also picks **auto-approve** or **desk approves**. Maps onto 0110's
`join_policy` (`open`/`code`/`closed`) plus a new `join_approval` (`auto`/`desk`).

### C6. Sign-up, sign-in and finding a gym (mockup decisions)
- **Sign up** lands on **"Find your gym"**: a searchable list sorted by distance; each row's button
  says what to do — *Join* (listed), *Have a code?* (code only), *Directions* (desk only),
  *Suggest* (not on Core Fitness). No legend in the list.
- A **Map** button opens a full-screen map (Leaflet + OpenStreetMap, free) with a bottom sheet;
  the **legend lives only on the map**: violet open · amber code · grey desk only · dashed not on
  Core Fitness. Other gyms come from OpenStreetMap (`leisure=fitness_centre`, fetched and cached
  server-side, not per user).
- **Location** is asked once, used on the device, **never stored**; declined → the search box.
- **Sign in** is the plain form with a small "Find a gym" link at the bottom.
- The owner pins the gym on a map in setup (autofilled from the application, E4).
- Sign-up enforces the gym's rule in SQL (a desk-only gym cannot be joined by a crafted request);
  minimum age (C8) and the waiver are part of sign-up.

### C7. Gym equipment
Owner manages an **Equipment** list in admin (name, category, photo, quantity, status:
*Available / Under repair / Coming soon*). Members see it in the app (More → Equipment, and on the
gym's page); the AI coach and the exercise library can say "this gym has it". Switch `equipment`.

### C8. Day passes and walk-ins
Owner chooses in setup:
- **Sell day passes?** price per day; optional 5- or 10-visit pack price.
- **Do walk-ins need the app?** *No* — the desk logs a **guest** (name, phone optional) and takes
  cash; guests appear in attendance and cash summaries, not in member lists. *Optional* — a guest
  can also install the app and buy/pay a day pass (GCash proof or PayMongo) and show a QR at the door.
- **Nudge to a plan** after N visits in a month (owner sets N; off by default).
- A day-pass holder in the app gets the free tier for that day plus check-in.
- **Minimum age** to sign up: owner sets, default **16**; under 18 needs guardian consent on the waiver.

---

## D — Plans and gating

### D1. Expired → the gym's free tier
When a paid plan expires the member keeps exactly what the gym's **free tier** allows (always: the
free library, their own history, Renew). Paid areas **lock and explain** (0049). Announcements get
an **audience** picker: *Everyone · Free tier · Paid plans · specific plans*; an expired member
receives only *Everyone* and *Free tier*.

### D2. Starter plans for a new gym
Setup creates **Free**, **Monthly**, **Premium** with sensible features (Free: library, check-in,
announcements; Monthly: + booking, progress, challenges; Premium: + AI coach, programs, coaching),
prices blank for the owner, every switch shown to move.

### D3. "What each plan unlocks" lists every switch
`/admin/membership-plans` lists **every** member-facing switch from `platform_features` (generated,
never hand-listed), grouped like Your app, with a one-line tooltip each.

### D4. Points are customizable
- Owner edits every point rule (exists, `point_rules`) and can turn **points off** entirely.
- **Points off:** badges, streaks and challenges still work and show progress; nothing earns
  points; the **rewards shop and seasons hide** (they run on points).

---

## E — Platform business

### E1. Applicants have an account
- The apply form (site) creates an **account** (email + password) with the application.
- Signing in on the **site** or the **admin app** shows the application's status and the
  conversation with the platform; the dashboard stays locked until the platform **activates** the gym.
- Declined or called off → the platform can **delete** that account (the only hard delete,
  allowed because no gym data exists yet). The old `#status/<token>` links keep working.
- **Email** on every platform reply/status change via the existing `send-email` (Resend; the user
  sets `RESEND_API_KEY`/`MAIL_FROM`). Without the key the app says so and the in-app status remains.

### E2. Verification documents (mandatory before approval)
Upload on the application: **Mayor's/Business permit** (current year), **DTI or SEC
registration**, **BIR Certificate of Registration (2303)**, **owner's valid government ID**, and
**(decided)** a **photo of the gym's front/signage** and **Barangay business clearance**. Private
storage bucket; the platform marks each *Verified / Rejected (reason)*; **Approve is disabled
until all required ones are verified.** Expiry dates stored; a permit renewal reminder each January.

### E3. Gym feedback to Core Fitness
In the admin app: **Rate Core Fitness** (1–5 + comment, any time), **Feature requests** (status set
by the platform: *Planned / Done / Not now*, visible to the owner), **Bug reports** (with a
screenshot → becomes a support ticket, 0137), and an opt-in **testimonial** shown on the website
after the platform approves it.

### E4. Autofill everywhere
- An approved application fills the gym's setup: name, address, phone, email, owner name, plan,
  map pin, documents.
- An invite prefills the invitee's sign-up; a join request prefills the account the desk approves.
- A renewal prefills from the last payment; a trainer's profile from their invitation.

### E5. Platform pricing (flat tiers by member count)
Launch prices, editable on `/plans` **(decided from cost: the AI coach is the main variable cost)**:

| | Starter | Growth | Pro |
|---|---|---|---|
| Members | up to 100 | up to 400 | unlimited |
| Staff accounts | 3 | 10 | unlimited |
| Monthly | ₱1,499 | ₱3,499 | ₱6,999 |
| Yearly (2 months free) | ₱14,990 | ₱34,990 | ₱69,990 |
| AI coach messages / month | 300 | 1,500 | 4,000 |
| Free trial | 30 days, everything | | |

Each tier's "What you get" lists its switches (generated from `platform_plan_features`).
Prices are revisited against real PH gym-software prices in the plan's first task.

### E6. AI coach billing
Each platform plan includes a monthly message quota (E5). A gym that needs more buys a
**prepaid top-up** in Your app (**500 messages for ₱699**, PayMongo), used after the quota and
never expiring. The owner keeps the **per-member daily limit** (0147). No surprise bills: at 0
the coach says so and the owner is told at 80% and 100%.

---

## F — PayMongo

- **Gym → Core Fitness:** subscription renewals, AI top-ups, paid themes — Core Fitness's own
  PayMongo account (keys set by the user as Supabase secrets).
- **Member → gym:** each gym connects **its own PayMongo account** in Your app (keys stored
  encrypted in Supabase Vault, never shown back). Money goes straight to the gym; Core Fitness
  never holds a gym's money.
- **Member → trainer** (C4 setup 3): a trainer may connect their own PayMongo account the same way.
- Flow: an Edge Function creates a **Checkout Session** (GCash, Maya, cards, online banking);
  a **webhook** function verifies the signature and records the payment through the same SQL as
  the desk (`record_payment` / `record_gym_payment`), idempotent on PayMongo's payment id
  (unique index). The existing manual GCash-proof path stays as the no-PayMongo option.
- **Paid themes:** presets stay free; **custom colour codes and premium themes** (gradients,
  special dark styles, app icon tint) are a one-time purchase; gyms using a custom code today keep it.

## G — covered by B9 (trainer Discord layout) and C6 (map) — listed separately for ordering only.

## H — Enterprise plan (draft document only)
`docs/ENTERPRISE_PLAN.md`: three cost tiers (lean / standard / enterprise) with Supabase Pro,
Vercel Pro, a domain (.ph / .com), transactional email, error monitoring, uptime checks, backups
and PITR; the repo split (one GitHub repo per app + a shared package for `types/db.ts`, `lib/api`,
`gymTheme`, `memberDataExport`), CI per repo, staging + production projects, the migration
steps from this repo, and what changes when G Fitness becomes the first paying gym. No code.

---

## Order and testing
**A → B → C → D → E → F → H** (G folded into B9/C6). Every project: migrations with
`migration_NNNN_applied()`, verify file, probe entry, `LAST`; pglite suites for every SQL rule
(non-superuser, Supabase grants); Playwright fixture checks for each changed screen in
`ui-checks.json`; the three audits plus the new `audit-dates.py` and `audit-lists.py` in CI;
build + lint all four apps; deploy; migrations handed over one at a time.

## Out of scope
Native (non-TWA) apps; payments other than PayMongo and the manual proof path; Google Maps;
changing the AI model or provider.
