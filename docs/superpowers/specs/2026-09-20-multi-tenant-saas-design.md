# Core Fitness as a multi-gym service (SaaS) — design

Date: 2026-09-20 · Status: approved in three parts in chat, awaiting review of this write-up
Deadline: two weeks (to 2026-10-04)

## Why

Core Fitness was built for one gym in Mamburao. It is a startup: one platform, many gyms. The
platform owner (the **super admin**) runs the service; each **gym owner** runs their own gym with
their own staff and trainers; members and trainers use one phone app and pick the gym they are
signing in to. Nothing the system does today is removed — every feature becomes *per gym*.

## Roles

| Level | Who | Where they work | Sees |
|---|---|---|---|
| Super admin | the platform owner | **Platform app** (new, localhost) | every gym's status, plan and counts; applications; crash reports; migrations |
| Gym admin | the gym owner | **Admin app** (moved to Vercel) | everything in *their* gym |
| Staff | front desk | Admin app | their gym, with today's staff limits |
| Trainer | coach | Phone app | their gym, their trainees (0082 unchanged) |
| Member | customer | Phone app | their own data in the gym they picked |

One person can hold roles in several gyms (a member at Gym A who coaches at Gym B). A role is
per gym; identity (name, email, photo, phone) is global.

The super admin reads gyms **through summary functions, not tables**: gym counts, plan, paid-until,
last activity. Under the Data Privacy Act (RA 10173) each gym is the **data controller** for its
members and Core Fitness is the **processor**, so the platform owner does not browse members.

## Data model

### New tables (migration 0097)

- **`gyms`** — `id uuid`, `slug text unique` (for `/join/<slug>`), `name`, `logo_url`, `accent`
  (one of eight pre-checked accent keys), `address`, `phone`, `email`, `opening_time`,
  `closing_time`, `status` (`active` / `suspended`), `plan` (`trial` / `standard` / `premium`),
  `paid_until date`, `created_at`. `gym_settings` folds into this table (its singleton row becomes
  Gym #1's columns; a view named `gym_settings` keeps old reads working until the apps move).
- **`gym_roles`** — `(gym_id, user_id)` primary key, `role user_role`, `status` (today's
  `profiles.status` values), `created_at`. Replaces `profiles.role`/`profiles.status` as the source
  of truth. The old columns stay, unused, until a clean-up migration at the end.
- **`platform_admins`** — `user_id` primary key. No policy lets anyone insert into it; the first row
  is pasted by hand.
- **`gym_applications`** — the website form: gym name, owner name, email, phone, address, member
  count estimate, `status` (`pending` / `approved` / `rejected`), `reason`, `gym_id` once approved.
  Anonymous visitors may insert (with length checks and a honeypot field); only platform admins read.
- **`profiles.active_gym_id`** — the gym this person is signed in to.

### The current gym

`current_gym_id()` returns `profiles.active_gym_id` for `auth.uid()`. It is set only by
`set_active_gym(gym)`, a SECURITY DEFINER function that refuses a gym where the caller has no
active role. **`get_my_role()` keeps its name and meaning but reads `gym_roles` for the current
gym**, so the 179 places that call it keep working and become gym-aware in one change.

Chosen over a per-request header because it needs no client rebuild on switch and works in
Edge Functions and triggers. Trade-off, stated: one person using two gyms on two devices at the
same moment — the last switch wins; each app re-checks the current gym when it regains focus.

### Tagging the data (migration 0098)

Every gym-specific table gets `gym_id uuid not null references gyms`, backfilled to Gym #1. A
trigger fills `gym_id` from `current_gym_id()` when an insert leaves it out, so the old apps keep
working after the paste and before the new apps deploy. Keys that were per-person become
per-person-per-gym: `member_profiles` is keyed `(gym_id, profile_id)`, and `qr_code` is unique per
gym. The prototype's `gym_id text` columns (0001) are dropped.

- **Gym-specific:** every table except those below — memberships, plans, payments, attendance,
  classes, bookings, waitlist, pt sessions, trainers, events, challenges, rewards, points,
  achievements and unlocks, goals, measurements, workout logs and routines, notifications,
  activity log, audit trail, cash closeouts, invoice counters, refund and point rules, cancellation
  reasons, share preferences, assistant conversations.
- **Global:** `profiles`, `push_subscriptions`, `notification_prefs`, `features` and
  `achievement_metrics` (catalogues), `client_errors` (carries a nullable `gym_id`).
- **Shared library:** `exercises` and `workout_resources` get a *nullable* `gym_id`. NULL rows are
  the Core Fitness library every gym reads; a gym admin adds and edits only their own rows. The free
  library stays free (0019).

### Rules (migrations 0099–0102, grouped by area)

Every policy gains `gym_id = current_gym_id()`. Every SECURITY DEFINER function that reads, counts,
awards or notifies is rewritten to stay inside one gym: points, badges, challenges, goals,
bookings, cancel_booking, waitlist, quota, clashes, cash, refunds, invoice numbers, reminders,
sweeps, `notify_once` (its dedupe key gains the gym). Sweeps run per gym. Groups:
(1) accounts, memberships, payments, cash, refunds; (2) classes, bookings, waitlist, pt sessions,
trainers; (3) engagement — points, badges, challenges, goals, rewards; (4) notifications, activity,
audit, errors.

**Suspended or overdue gym** (`status = 'suspended'`, or `paid_until` more than 7 days past):
`gym_writable()` is false and every write policy requires it, so the gym turns read-only. Both apps
show a notice naming the reason. Reading, export and check-out of data keep working.

## The four apps

1. **Phone app** (`g-fitness-member/`, Vercel, same URL and APK). Sign in once. One gym → straight
   in; several → a gym picker (logo, name, your role there); the last gym is remembered; **Switch
   gym** in More. Sign-up picks a gym from a searchable list, or arrives pre-picked through
   `/join/<slug>`. A signed-in person can ask to join another gym; that gym's staff approve as
   today (0078). The gym's name, logo and accent colour replace Core Fitness violet on screen
   (amber stays the "what you can do next" colour; each accent is checked for 4.5:1 text contrast
   in advance). The launcher icon and splash stay Core Fitness.
2. **Admin app** (`g-fitness-admin/`, moved to Vercel). The gym owner and staff sign in; a person
   with several gyms picks one. Everything is scoped to that gym. New **Settings → Branding**
   (name, logo upload, accent, contacts, hours). The kiosk stays. Migration status and crash reports
   move to the platform app; the gym keeps its own crash list.
3. **Platform app** (`corefitness-platform/`, new, localhost `:5175`, run like the admin app was).
   - *Applications* — approve (creates the gym, seeds its starter plans, point rules,
     cancellation reasons and refund rules from Gym #1's defaults, and emails the owner an
     invitation) or reject with a reason.
   - *Gyms* — status, plan, paid-until, member count, last activity; Suspend / Reactivate /
     Set plan / Mark paid (all logged).
   - *Platform* — migrations (the probe), crash reports across gyms, backup status.
   Owner invitation runs in a new Edge Function **`approve-gym`** that checks the caller is in
   `platform_admins` and uses the service key server-side only. The existing `create-member`,
   `create-staff` and `create-trainer` functions create the role in the caller's current gym.
4. **Website** (`corefitness-site/`, new, Vercel). One page: what Core Fitness does, features,
   pricing, partner gyms, and **Register your gym** — the form that writes `gym_applications`.
   Pricing figures live in one file for the platform owner to set.

## Moving the existing data

- 0096 (class waitlist) is pasted first, so the tenancy rewrite covers it.
- Before the first paste, the weekly backup workflow runs once by hand.
- Migrations 0097–0102 are pasted one at a time and probed (`scripts/probe-migrations.py`).
- Existing data becomes **Gym #1, "Core Fitness"**, with today's name and contacts; every existing
  account gets its current role and status there; everyone's `active_gym_id` is Gym #1.
- The old apps keep working between the paste and the deploy (the gym_id trigger, the
  `gym_settings` view, `get_my_role()` unchanged in meaning for Gym #1).
- The demo data stays in Gym #1. A small second demo gym ("Gym B") is seeded for the defense to show
  switching and separation.

## Proving separation

- **`scripts/sql/tenancy-isolation.mjs`** in pglite, as the real `authenticated` role: two gyms, each
  with an admin, staff, a trainer and members, plus one person who is a member of both. For every
  gym-specific table, Gym A's roles try to read, insert, update and delete Gym B's rows — each must
  come back empty or refused. Every counting or awarding function is called from Gym A and must not
  touch Gym B. Suspended-gym writes must fail. It joins the existing SQL checks in **CI on every
  push**.
- The fixture checks gain a second gym: picker, switch, branding colour, `/join/<slug>`, and admin
  screens scoped to one gym. The existing 11 checks keep passing.

## Order of work

| Days | Part | Done when |
|---|---|---|
| 1–4 | **A. Tenancy foundation** — 0097–0102, isolation tests | Every isolation test passes locally and in CI; pasted; Gym #1 works as before |
| 5–8 | **B. Gym-aware apps** — picker, sign-up gym list, join links, branding, admin on Vercel | Two gyms side by side on the phone and online admin, each seeing only its own |
| 9–11 | **C. Platform app** — applications, `approve-gym`, gyms list, suspend, plan and paid-until | A test application is approved and its owner signs in to a seeded, empty gym |
| 12–13 | **D. Website** — one page plus the form | A submitted form shows up in the platform app |
| 14 | Docs, CLAUDE.md, Privacy/Terms (controller/processor), defense demo data | — |

If part A runs over, C keeps approve / suspend / mark paid only and D stays one page.

## Also changes

- **Privacy and Terms** in the same work: each gym is the controller, Core Fitness the processor;
  contact details come from the gym's row.
- Docs: DATA_ACCESS (current gym, `gym_writable`), DEPLOYMENT (admin on Vercel, site, platform app),
  MIGRATION_STATUS, VERIFYING (the isolation harness), CLAUDE.md.
- Out of scope: online payments (plans are tracked by hand), custom domains per gym, per-gym app
  icons, SMS.
