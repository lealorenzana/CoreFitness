# Core Fitness — Subscription Gating and the Startup Feature Set

**Date:** 2026-09-04
**Status:** Approved design, not yet implemented
**Supersedes:** nothing. Everything here extends the live system (migrations 0001–0048).

---

## 1. Why this exists

Panel feedback asked whether Core Fitness answers one question:

> "Why would a member keep opening this app when they are not checking in?"

Today the honest answer is *mostly they would not*. The app is excellent at the gym's
job — attendance, payments, memberships, bookings — and thin at the member's. This
design adds the member-facing loop, and the commercial mechanism that makes the tiers
mean something.

A second, separate request: **subscription tiers must be able to withhold parts of the
app**, and that must be editable by the admin so a new tier can be created without a
code change.

A third, added mid-discussion: **trainers must be able to attach their credentials as
files, and the admin must be able to view them.**

---

## 2. Development audit — what already exists

Measured against the schema and the code, not assumed. This is also a deliverable in
its own right: the panel asked for a status mark per feature.

| # | Feature | Status | Evidence |
|---|---------|--------|----------|
| 1 | Personal fitness goals | 🟡 Partial | `fitness_goals` (0020) exists with a Progress tab, but holds **numeric metric** goals only (`weight_kg`, `body_fat_pct`, `waist_cm`, `workouts_per_week`, `custom`). Qualitative goals such as "build consistency" can only be stored as `custom`, with no computed progress. |
| 2 | Workout tracker | 🟡 Partial | `workout_logs` (0020) records activity, duration and notes. **No exercise, set, rep or weight column exists anywhere.** `workout_plans` (0047) holds prescribed exercises but is a plan, never a log. |
| 3 | Booking & appointments | ✅ Developed | `classes`, `bookings`, `pt_sessions`, `trainer_availability`, `class_templates`. Entitlements enforced by trigger since 0017. |
| 4 | CORE Points & rewards | ❌ Not developed | No points table, no currency, no redemption. `achievement_unlocks` (0028/0038) awards **badges that cannot be spent**. |
| 5 | Smart notifications | 🟡 Partial | `notifications`, web push, per-member prefs, inbox (0029) all live. **Exactly one automated reminder exists** — `send_due_gym_reminders()` (0030). No expiry, renewal, session, goal or points reminder. |
| 6 | CORE AI assistant | 🟡 Partial | Rule table answers ~98%; `planBuilder.ts` (0047) ships; model fallback coded but undeployed. **The assistant cannot read the member's own workout plan** — no data path exists. |
| 7 | Personal dashboard | 🟡 Conflict | Home was deliberately decluttered earlier at the user's request. See §4.7. |
| 8 | Challenges / community | ❌ Not developed | `events` + `event_registrations` exist for gym events. No challenge, no target, no cohort. |
| 9 | Marketplace | 💡 Future — **explicitly not being built** | The schema is single-gym throughout. Multi-tenancy would touch every RLS policy written so far. |

### Existing core features checklist

| Area | Status | Note |
|------|--------|------|
| Member registration, profile, status, history | ✅ | |
| QR check-in, attendance history, reports, configurable format | ✅ | QR still untested on real scanning hardware |
| Membership plans, benefits, payments, status, freemium, premium, free tier | ✅ | `freemium_trials` (0041) enforces one trial per member ever |
| Class schedules, booking, coach assignment | ✅ | |
| Preference-based class matching | 🟡 | `experience_level` and `training_focus` (0044) drive recommendations, but classes are not filtered by them |
| Cancellation, freeze, freeze limits, reactivation | ✅ | 0017 + 0018 |
| Free workout resources, exercise references, guides | ✅ | 0019 |
| Freemium / premium / SaaS model, scalability | ✅ documented | `docs/BUSINESS_MODEL.md` |

---

## 3. Decisions taken

Recorded because each closes off an alternative that would otherwise be re-litigated
during implementation.

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Build everything above **except feature 9 (Marketplace)** | User instruction, explicit. |
| D2 | A blocked feature shows a **locked card with an upgrade prompt** — never a hidden route | Hiding it recreates the "hidden rulebook" failure 0041 was written to fix, and it stops the paid tier advertising itself. |
| D3 | Home stays clean. **MY CORE goes to the top of Progress** | Honours the earlier declutter instruction and the panel's dashboard request without duplicating counters. |
| D4 | Points are **real**, with an admin approval queue | The gym honours them, so they are a liability and need an audit trail. |
| D5 | Gating uses a **`plan_features` table**, not more columns | The user's stated reason is "if we want to add another new type of subscription". A table makes that one INSERT plus a checkbox matrix. |
| D6 | The four existing entitlement columns from 0017 stay exactly as they are | They are enforced by live triggers and carry week/month quota semantics. Migrating them for elegance risks the working booking system. |
| D7 | Exercises come from an **admin-managed catalogue** | Free text turns "Bench Press", "bench" and "Benchpress" into three exercises and silently breaks every history chart. |
| D8 | Workout logging works **both** standalone and against today's plan | Otherwise the plan builder stays a document nobody acts on. |
| D9 | Gate the AI **model escalation**, not the assistant | The rule table costs nothing and answers 98%; the model costs money per call. This ties the only running cost to the only paying tier, and no member is ever locked out of asking a question. |
| D10 | **Never gate the free workout resources** | 0019 exists because the panel asked for something for members who cannot pay. Gating it would contradict the business model. |
| D11 | Free tier keeps goals and body progress | Gating them makes the free tier attendance-only, members stop opening the app, and the engagement data the startup case rests on disappears. |
| D12 | Challenge progress is **computed at read time**, never stored | It cannot drift, and it cannot be self-reported. |
| D13 | **No challenge leaderboard** | It would publish one member's attendance to another. 0032 exists because members choose what is shared. |
| D14 | Credential files live in a **private** bucket, signed URLs only | A certificate carries a legal name and licence number. The public-read pattern used for avatars (0021) would be wrong. |
| D15 | Credentials are visible to **that trainer and admin only — not staff** | Staff take payments and check people in. Hiring paperwork is not a front-desk transaction. |
| D16 | **No member file attachments** in this scope | Keeps an already large build contained. The bucket and policies are shaped so members can be added later without redesign. |

---

## 4. Design

### 4.0 Principles carried in from the existing system

Not new. These are the rules this codebase has already paid to learn, and every
section below obeys them.

1. **Anything a client can grant or skip proves nothing.** Points, challenge
   completion and entitlement checks live in SQL, written by SECURITY DEFINER
   functions with no INSERT policy for the browser.
2. **A rule enforced only in SQL that the user cannot read ambushes them.** Every gate
   has a visible, worded explanation drawn from the same source as the enforcement.
3. **A failed section says so.** Nothing degrades to an empty state that reads as
   "nothing here".
4. **Dates come from `utils/dates.ts` and `now() at time zone 'Asia/Manila'`.** Never
   `toISOString()`, never bare `current_date`.
5. **An identifier is unique because a constraint says so.**

### 4.1 Subscription gating — `plan_features`

**Two tables.**

`features` — the catalogue of what is gateable.

```
key               text primary key      -- 'plan_builder', 'ai_model', …
label             text not null         -- shown in the admin matrix
description       text                  -- why a member would want it
default_free      boolean not null      -- seed value for tier 'free'
default_freemium  boolean not null
default_premium   boolean not null
sort_order        int not null default 0
```

Admin gets **SELECT only. There is deliberately no INSERT policy**: a feature key
exists because code implements it, and inventing a row would produce a switch that
gates nothing — the exact "control that writes a flag nothing reads" failure this
project has already shipped.

`plan_features` — the matrix the admin edits.

```
plan_id      uuid references membership_plans(id) on delete cascade
feature_key  text references features(key) on delete cascade
enabled      boolean not null
quota        int                        -- NULL = unlimited, only where meaningful
primary key (plan_id, feature_key)
```

**The missing-row problem, and the fix.** If an admin creates a plan and
`plan_features` has no rows for it, `plan_allows()` has to decide. Fail-closed locks
members out of a working app the moment a plan is added; fail-open makes gating
meaningless. Neither is acceptable, so **no plan is ever allowed to have a missing
cell**: an AFTER INSERT trigger on `membership_plans` seeds one row per feature from
the `default_*` column matching the new plan's tier. A backfill in the same migration
does the same for the three existing plans. `plan_allows()` still treats a missing row
as **enabled**, documented as a belt-and-braces default rather than a policy.

**The resolver.**

```
plan_allows(p_member uuid, p_feature text) returns boolean
  language sql stable security definer set search_path = public
```

Resolves newest membership → plan → `plan_features.enabled`. Reuses
`current_membership_of()` and `membership_is_usable()` from 0017 so the phone app, the
admin and the database can never disagree about what "active" means. NULL-safe
throughout — `is distinct from`, never `<>`, per the 0039/0048 lesson.

**Seeded feature keys and defaults:**

| key | Free | Freemium | Premium |
|---|---|---|---|
| `workout_tracker` | ✗ | ✓ | ✓ |
| `plan_builder` | ✗ | ✗ | ✓ |
| `ai_model` | ✗ | ✗ | ✓ |
| `points_earn` | ✗ | ✓ | ✓ |
| `points_redeem` | ✗ | ✗ | ✓ |
| `challenges` | ✗ | ✓ | ✓ |

Not gateable, and therefore absent from the table by design: check-in, attendance
history, membership, renewal, payments, notifications, settings, profile, workout
resources, events, trainer profiles, achievements, goals, body progress, and the
rule-based assistant.

**Where it is enforced.** In RLS and triggers — `workout_plans` INSERT requires
`plan_allows(member,'plan_builder')`; the points trigger checks `points_earn`; joining
a challenge checks `challenges`; the `fitness-assistant` Edge Function checks
`ai_model` before spending a model call. The UI calls the same function to word the
lock, so the two can never diverge.

**Member UI.** One `<FeatureLock>` primitive in the member app: the screen renders,
the interactive part is replaced by a card naming the feature, what it does, and
"Included in Premium — upgrade at the front desk". It reads the feature's `label` and
`description` straight from the table, so a new gate never ships an unworded lock.

**Admin UI.** `MembershipPlans.tsx` gains a feature matrix under the existing
entitlement fields — one row per feature, one checkbox per plan.

### 4.2 Workout tracker — extend `workout_logs`

**`workout_logs` is not replaced.** It becomes the session header:

```sql
alter table workout_logs
  add column plan_id      uuid references workout_plans(id) on delete set null,
  add column completed_at timestamptz;
```

Two new tables:

```
exercises
  id, name (unique, case-folded), muscle_group, equipment,
  is_active boolean default true, sort_order int

workout_sets
  id, log_id references workout_logs(id) on delete cascade,
  exercise_id references exercises(id),      -- NULL when custom_name is used
  custom_name text,
  set_number int not null,
  reps int, weight_kg numeric(6,2), duration_seconds int, distance_m int,
  check (exercise_id is not null or custom_name is not null)
```

**Why extend rather than add a parallel table.** `achievement_metrics` counts
`logged_days` from `workout_logs`, and `trainer_may_see(member,'workouts')` gates it.
A second table would need both re-plumbed, would leave existing rows stranded, and
would give members two different ways to log the same session. Extending keeps every
existing consumer correct with no change.

**Plan integration (D8).** If the member has a `workout_plans` row whose spec covers
today, the tracker pre-fills its exercises and the member fills in actual numbers;
`workout_logs.plan_id` records the link. With no plan, they add exercises from the
catalogue. This is what makes "Today's Workout ✓ 5 exercises · 45 minutes" renderable
— `completed_at` plus a count over `workout_sets`.

**RLS.** Identical shape to `workout_logs`: the member owns every verb; the gym reads
through `trainer_may_see`. `workout_sets` resolves ownership through its parent log.

### 4.3 CORE Points

```
point_rules
  key text primary key, label text, points int not null,
  is_active boolean default true             -- admin-editable, seeded

point_ledger
  id, member_id, rule_key, points int not null,
  source_table text not null, source_id uuid not null,
  created_at timestamptz
  unique (member_id, rule_key, source_table, source_id)

rewards
  id, name, description, cost_points int, is_active, stock int   -- NULL = unlimited

reward_redemptions
  id, member_id, reward_id, cost_points int,        -- frozen at request time
  status text check in ('pending','approved','rejected','fulfilled'),
  requested_at, decided_by, decided_at, decision_note
```

**The UNIQUE constraint is the load-bearing part.** Points are money the gym owes.
Without `(member, rule, source_table, source_id)` a re-run, a retry or a double-fired
trigger awards twice, and the gym pays for it. This is the `invoice_number` lesson
applied to a second identifier: it is unique because a constraint says so.

**`point_ledger` has no INSERT policy.** Rows are written only by SECURITY DEFINER
code, never by the browser. Each award checks `plan_allows(member,'points_earn')`
first.

**Two award mechanisms, because two kinds of thing are being rewarded.**

| Source | Mechanism | Why |
|---|---|---|
| Check-in | AFTER INSERT trigger on `attendance` | A row appearing *is* the event |
| Workout logged | AFTER UPDATE trigger on `workout_logs`, on the `completed_at` NULL → not-NULL transition | Same — a real transition exists |
| Goal achieved | AFTER UPDATE trigger on `fitness_goals.achieved_on` | Same |
| **Class attended** | **Sweep function**, not a trigger | 0028:159-163 defines attended as `bookings.status = 'approved'` **and** `classes.scheduled_at < now()`. Nothing writes a row when that becomes true — time simply passes. There is no event to hook. |
| **PT session done** | **Sweep function**, not a trigger | Same shape, and worse: `pt_sessions` has no `completed` status at all — the enum is the shared `booking_status` (0028:171-174). |

`award_due_session_points()` runs on the same guarded pg_cron schedule as the
reminders in §4.5, and is safe to run any number of times because the ledger's UNIQUE
constraint rejects the second award. If pg_cron is unavailable the function is still
callable, and the balance is simply awarded late rather than never — the same
degradation shape as 0030.

This is a correction to an earlier reading of the schema, recorded rather than quietly
fixed: assuming a completion event existed would have produced two triggers that never
fire, and points that never arrive for the two most valuable actions in the gym.

**`cost_points` is copied onto the redemption** rather than joined at read time, so
changing a reward's price later cannot retroactively alter a pending request.

**Balance** = `sum(ledger) − sum(points for approved/fulfilled redemptions)`, computed
by a stable function. At this gym's scale a materialised balance would be a cache with
no reader worth the invalidation risk.

**Admin queue.** A new admin page lists pending redemptions with member, reward, cost
and balance; approve or reject writes `decided_by`/`decided_at`/`decision_note` and
notifies the member. `activity_log` (0037) picks it up through the existing trigger
pattern, so a redemption is as auditable as a payment.

**Seeded rules** (admin tunes them; an empty rules table would award nothing, which is
a control that does nothing):
check-in 10 · workout logged 15 · class attended 25 · PT session 40 ·
goal achieved 100 · challenge completed 250.

### 4.4 Challenges

```
challenges
  id, title, description,
  metric_key text references achievement_metrics(key),
  target int not null, starts_on date, ends_on date,
  reward_points int not null default 0, is_active boolean

challenge_participants
  challenge_id, member_id, joined_at, completed_on, awarded boolean
  primary key (challenge_id, member_id)
```

Reusing `achievement_metrics` as the metric vocabulary means the admin picks from a
dropdown of metrics the system can actually compute, rather than typing a key that
silently never matches.

**But only a subset of those keys is valid for a challenge**, and the dropdown must
say so rather than offering all 22. A challenge counts an activity **inside a date
window**; an achievement counts a lifetime total. Three groups are therefore excluded:

- `audience = 'trainer'` (7 keys) — challenges are member-only.
- **Not windowable:** `days_as_member`, `current_week_streak`, `best_week_streak`.
  A streak or a tenure is a property of a whole history, not a count within a range;
  "best weekly streak ≥ 3 during November" is not a question the data can answer
  honestly.
- `profile_complete` — boolean, so a target is meaningless.

That leaves the eleven that are genuinely countable over a window: `training_days`,
`verified_days`, `logged_days`, `consistent_weeks`, `weekend_days`, `early_checkins`,
`late_checkins`, `distinct_activities`, `goals_achieved`, `measurements`,
`classes_attended`, `pt_sessions_done`.

A `challengeable boolean` column is added to `achievement_metrics` and set for exactly
those keys, so the restriction is data the admin can see rather than a rule hidden in
the dropdown's code. The challenge progress function computes its own windowed count
from source tables — it does **not** call the lifetime metrics function, which would
return a total that ignores `starts_on` entirely and mark everyone complete on day
one.

**Progress is a query, not a column** (D12): counted over the challenge's own window
from `attendance` / `workout_logs`. It cannot drift and cannot be faked. A SECURITY
DEFINER function marks completion and writes the points ledger row; the ledger's
UNIQUE constraint makes a second award impossible even if the function runs twice.

No leaderboard (D13).

### 4.5 Reminders

Four new functions, all idempotent, all following the 0030 shape — the in-app surface
is the guarantee, the notification is the nudge, and pg_cron is optional behind a
guarded block:

| Function | Fires |
|---|---|
| `send_membership_expiry_reminders()` | 7, 3 and 1 days before `expiry_date` |
| `send_upcoming_session_reminders()` | Evening before a booked class or PT session |
| Goal / achievement notification | Trigger on `fitness_goals.achieved_on` and `achievement_unlocks` |
| Points notification | Trigger on `point_ledger`, and when balance first crosses a reward's cost |

**Idempotency is the whole risk.** A reminder function that runs twice must not notify
twice, so each writes a deterministic dedupe key into `notifications.metadata` and
skips a row that already exists for that member, kind and window.

Preferences gate delivery, never the record (existing `notify.ts` rule, unchanged).

### 4.6 Trainer credentials

```
trainer_credentials
  id, trainer_id references trainer_profiles(profile_id) on delete cascade,
  title text not null,               -- "NASM-CPT", "First Aid"
  file_path text not null,           -- credentials/<uid>/<random>.<ext>
  mime_type text, size_bytes int,
  status text check in ('pending','verified','rejected') default 'pending',
  uploaded_at, reviewed_by references profiles(id), reviewed_at, review_note text
```

**Private bucket** `credentials` (D14): `public = false`, size limit 5 MB, mime
allow-list `application/pdf`, `image/jpeg`, `image/png`. Path keyed by `auth.uid()`
exactly as 0021 does, so the write policies key off the folder.

Storage policies: insert/update/delete inside your own uid folder; SELECT for the
owner **or** `get_my_role() = 'admin'`. **Staff excluded** (D15). Admin opens files
through `createSignedUrl()` with a short TTL — never a public URL.

Row policies: the trainer reads and writes their own rows but **cannot set `status`**
(a column guard, the way `profiles` restricts `role`); the admin reads all and sets
status, reviewer and note.

**Trainer app:** a Credentials section in `TrainerEditProfile.tsx` — upload, see
status, see the admin's note on rejection.
**Admin app:** a Credentials panel on the trainer record — open the file, set verified
or rejected with a note.

This changes what the certifications field means. Today the member-facing text says
the gym does not verify them, which is honest but weak. Once a document is on file and
reviewed, the gym has actually checked. Members still never see the file (D15), and
the member-facing wording stays unchanged in this scope — surfacing a "Verified" badge
to members is a separate decision the user has not taken.

### 4.7 MY CORE dashboard

Home is unchanged (D3). `ProgressHub.tsx` gains a summary block at the top:
membership status, workouts logged, gym visits, goal progress, CORE Points balance,
next session. Every value comes from a service assembling real rows; **a value with no
data renders as absent or "not yet", never as 0 dressed as a fact** — the withheld-
average rule from `trainer_ratings`, applied again.

### 4.8 Goal presets and the assistant

**Goal presets (feature 1).** A seeded, admin-editable `goal_templates` table carrying
the five qualitative goals, each with a computable definition — "build consistency" is
weeks with at least N check-ins; "increase strength" becomes computable for the first
time now that `workout_sets` records weight. `fitness_goals` gains `template_key`.
Numeric goals are untouched.

**Assistant reads the plan (feature 6).** `memberAssistant.ts` gains rules for "what is
my workout today" and "what exercises are in my plan", answered from the member's own
`workout_plans` row. No migration needed — the row is already readable by its owner.

Two constraints carry over unchanged: facts stay rule-generated, and **the exercise
table renders straight from the spec**, because a model that can reword "4 x 5-6" can
change it.

---

## 5. What could go wrong, and the answer

| Risk | Mitigation |
|---|---|
| A new plan has no `plan_features` rows and locks members out | INSERT trigger seeds every cell; resolver also defaults to enabled |
| Points awarded twice | UNIQUE `(member, rule, source_table, source_id)` |
| A member grants themselves points | No INSERT policy on `point_ledger`; SECURITY DEFINER triggers only |
| Reward price changes under a pending request | `cost_points` frozen onto the redemption row |
| Reminder function runs twice, notifies twice | Deterministic dedupe key checked before insert |
| Credential file leaks a trainer's licence number | Private bucket, signed URLs, owner-or-admin SELECT, staff excluded |
| Gating breaks the working booking system | 0017's four columns and both triggers are not touched |
| Exercise names fragment and break history | Admin catalogue with a unique name; custom entries flagged and excluded from aggregates |
| A gate is enforced but never explained | `<FeatureLock>` renders `features.label` / `.description` from the same table the check reads |
| A SECURITY DEFINER guard is trusted without proof | Every new function probed as a non-superuser in the PGlite harness before it is called done (0038 → 0039) |
| Points for classes/PT never arrive, because the trigger has no event to fire on | Awarded by a re-runnable sweep, not a trigger (§4.3). Proved by advancing a session's `scheduled_at` into the past and showing the ledger row appear |
| A challenge uses a metric that cannot be windowed, and completes on day one | `achievement_metrics.challengeable` restricts the dropdown; progress computed from source tables over the window, never from the lifetime metrics function |

---

## 6. Verification

`docs/VERIFYING.md` governs. Specifically, and non-negotiably:

- **A green build proves nothing.** Every visual bug in this project compiled cleanly.
- Every new SQL function and policy is tested in **PGlite as a non-superuser**, with
  Supabase's default grants reproduced first (`alter default privileges … to anon,
  authenticated`) — otherwise an unprotected table looks safe purely because the test
  role could not reach it.
- Each fix is proved by **showing the failure first**, then the closure.
- Functions are loaded **out of their migration file**, never retyped.
- `npm run check:achievements` must stay green.
- Every new route is grepped for an inbound link. A feature ships when a route leads
  to it, not when the query works (0019 and 0025 were both built, correct, and
  reachable from nowhere).
- What was not verified is stated plainly. **Nothing behind a login has ever been seen
  rendering in this project** — that remains true unless and until it changes.

---

## 7. Phasing

Each phase leaves a working system and is independently runnable. Migrations are
handed over **one at a time** — a 444-line multi-file buffer broke the SQL Editor's
statement splitter mid-`$$` once already.

| Phase | Migration | Contents |
|---|---|---|
| **A** | 0049 | `features` + `plan_features` + `plan_allows()` + seed trigger · admin matrix · `<FeatureLock>` |
| **B** | 0050 | `exercises` + `workout_sets` + `workout_logs` columns · tracker UI · MY CORE on Progress |
| **C** | 0051 | `point_rules` + `point_ledger` + `rewards` + `reward_redemptions` · award triggers + `award_due_session_points()` sweep · member wallet · admin approval queue |
| **D** | 0052 | `challenges` + `challenge_participants` + `achievement_metrics.challengeable` + windowed progress function · admin CRUD · member UI |
| **E** | 0053 | Four reminder functions + guarded pg_cron |
| **F** | 0054 | `trainer_credentials` + private bucket + policies · trainer upload · admin viewer |
| **G** | 0055 | `goal_templates` + `fitness_goals.template_key` · assistant reads `workout_plans` |

Out of scope, recorded so it is not rediscovered as an omission: **feature 9,
Marketplace.** It requires `gym_id` tenancy across every table and a rewrite of every
RLS policy written so far, and would destabilise a working single-gym system. It stays
a documented 💡 future feature.
