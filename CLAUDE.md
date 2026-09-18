# CLAUDE.md
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is
A gym management capstone for a real gym in Mamburao, Occidental Mindoro. It began as a localStorage
prototype; **that migration is complete** — everything runs on Supabase, free tier. Two independent
Vite apps: **`g-fitness-admin/`** (`:5174`) is the desktop dashboard, run locally from a desktop icon
and never deployed; **`g-fitness-member/`** (`:5173`) is the installable phone app (PWA → Android TWA)
and hosts the **trainer** role as well as the member one. Not a monorepo — run `npm` from inside the
app directory. `supabase/` holds 80 migrations, RLS policies and four Edge Functions —
[supabase/README.md](supabase/README.md) covers setup and secrets.

## Commands
`npm install && npm run dev` **from inside each app directory** — admin on `:5174`, member on `:5173`.
- `npm run build` — `tsc -b && vite build`. Both build clean. Both tsconfigs set `noUnusedLocals`/
  `noUnusedParameters`, so **an unused import fails the build** though `npm run dev` is happy.
- `npm run lint` · `npm run check:achievements` (member). No test framework — see *Verifying work*. Both apps need `.env.local` (copy `.env.example`).

## Data honesty — read this before touching a page
**Full audit: [docs/MIGRATION_STATUS.md](docs/MIGRATION_STATUS.md).** Every page is Supabase-backed. **"No mock data
remains" was claimed twice and wrong twice**, both times hiding in *chrome* — **audit layouts, shared modals and
`data/`, not just `pages/`.**
- Members are **archived, never deleted**; analytics return **zero, never a plausible invention**; a missed lookup
  renders **nothing**, never a fallback identity. A withheld average is **NULL and says so**. **A failed section says
  so** — empty reads as "nothing here". Payments distinguish **`paid_on` from `created_at`**.
- **Calendar dates come from `utils/dates.ts`, never `toISOString()`** — Manila is UTC+8, so the UTC date is yesterday
  for the first eight hours of every local day. **`current_date` is UTC too** (0045). **A feature ships when a route
  leads to it** — two were built, correct, and linked from nowhere.
- **An identifier is unique because a constraint says so**, not because a formula looks unlikely to repeat; **clocks
  disagree too**. **`BarcodeDetector` does not exist in Chrome on Windows** and fails *silently* — `QRScanner` uses
  **jsQR** over the full frame, **never a crop**. **A control writing a flag nothing reads is a lie**; **a rule
  enforced only in SQL the user cannot read ambushes them** (0017 → 0041). **Per-user state never lives in
  `localStorage`** — *and a column is not the fix unless the row exists when the write runs* (0033 → 0036).
- **The legal pages are part of the system.** Terms/Privacy were boilerplate that *contradicted* it —
  "non-refundable" against 0073's pro-rata payout, a payment processor in a cash-only gym, deletion
  where members are archived. Rewritten 2026-09-14: **change them in the commit that changes the rule**,
  and contact details come from `gym_settings`, never typed in.
- **A zero-row `UPDATE`/`DELETE` reports success.** Five bugs so far. `assertWrote()` in `lib/api/mutate.ts`; `python
  scripts/audit-writes.py` counts them (109 writes, 86 guarded); also run **`audit-dead-code.py`** and
  **`audit-routes.py`** (why: MIGRATION_STATUS → *Audits*). **Guard `.update(`/`.delete(` only** —
  `.select()` on an `INSERT` breaks a write the caller may make but not read back.
- **Anything the client can grant or skip proves nothing** — badge rules, the audit log and invoice numbers live in
  SQL. Four rules that have each cost a session, in full in [DATA_ACCESS](docs/DATA_ACCESS.md): **RLS filters rows,
  never columns**; **a SECURITY DEFINER guard must not block its own writer** (`auth.uid() is not null and` not-
  admin); **a trigger needs an event to fire on**, so elapsed time means a re-runnable sweep; **a policy on a table
  whose RLS is off is not protection**.

## Architecture
### Auth and routing — real Supabase Auth
`profiles.role` (`admin`/`staff`/`trainer`/`member`) and `profiles.status` (`active`/
`pending_approval`/`suspended`/`archived`) are the source of truth, not localStorage flags.
**`staff`** is front desk (0011/0012): payments, check-ins, extensions — not pricing, trainers,
accounts, settings or the audit log. `<ProtectedRoute adminOnly>` is convenience; **RLS is the
boundary.** The member app also caches a legacy user object into `localStorage['user']` for the ~6 pages
still on `getCurrentUser()` — **never real auth state**; `syncUserCache()` rebuilds it on boot. **Sessions last until Logout.** **Only
members self-register** — the signup trigger hardcodes `'member'`, so Login hides Sign Up on Trainer.
**Approving a registration grants the free tier, `active`, via `startFreeMembership()`** — by *tier*,
never the plan tapped at signup: they have paid nothing, and the gym is cash-only. Idempotent, because
flipping `status` alone left them signed in with **no** membership (and `pending` is not usable).

### The data-access layer
`src/lib/api/*.ts`, one module per table, typed against `src/types/db.ts`; per-app **services** above them assemble
whole screens — put multi-table assembly in a service, not a component. Most modules exist twice, once per app: **diff
before you copy**, `notify.ts` differs on purpose. **[docs/DATA_ACCESS.md](docs/DATA_ACCESS.md) lists every trap that
has cost time here** — `OLD` is unassigned in an INSERT trigger; a comma inside `.or()` is filter syntax (400); a
NULL-unsafe `<>` skips a role guard, so use `IS DISTINCT FROM`. `activity_log` (0037) is written **only** by SECURITY
DEFINER triggers (**no INSERT policy**), read through `activity_feed`, which stays **`security_invoker`**.

### Booking rules live in SQL, not in the form
Classes (`bookings` → `classes`) and 1-on-1 (`pt_sessions`) are separate tables (0015); 0017 counts
quota, 0068 adds clashes — **half-open intervals with `overlaps`, never `starts_at = starts_at`**, no
override. Availability is **per trainer**; class generation **reports** conflicts rather than raising.
**Trainers decide their own bookings** (0071, final, admin can reverse) and **run their own classes** (0085: create one-offs; edit name/level/size/room; a timetable class keeps the gym's time). **Cancelling is
`cancel_booking()` (0081) and nothing else** — a trigger refuses a bare `status='cancelled'`, and a
trainer may cancel only through it. **A trainer sees only their own trainees** (0082). Detail, and
0083's attention queue: [DATA_ACCESS](docs/DATA_ACCESS.md), MIGRATION_STATUS → *Booking rules*.

### Notifications and web push
The `notifications` row is the **record**, always awaited; the push is the **alert**, fire-and-forget and
never allowed to throw. **Preferences gate delivery, never the record. Push needs HTTPS.** pg_cron is
**optional** (0030, 0051–0055, 0071), so sweeps also run on page load; every automated message goes
through `notify_once`, whose **dedupe key sits behind a partial unique index (0053)**.

### Subscriptions gate features; the engagement loop is 0049–0061
**Spec: [startup-features](docs/superpowers/specs/2026-09-04-startup-features-design.md). Plans,
refunds and gating detail: [MEMBERSHIP_POLICY](docs/MEMBERSHIP_POLICY.md) · [AI_INTEGRATION](docs/AI_INTEGRATION.md). 0017's four booking
columns are untouched and stay that way.** Gating *app areas* is `plan_features` (0049), resolved
by `plan_allows()` — **the same function RLS calls**, so screen and database cannot drift. **Gates
lock and explain, never hide**; **never gate the free workout library (0019)**, which exists *for*
members who cannot pay. **0050 extends `workout_logs`, never a second table** — 0086 routines run *as* `workout_logs` + `workout_sets` (`routine_id`), so points and badges just count them; the points ledger
and `challenge_participants` have **no INSERT policy for any role**; **goals with a number are marked reached only by `settle_my_goals()`** (0087 — a hand-ticked custom goal earns no points), and challenge progress is
**computed, never stored**. **The gym sells three** — Free Trial (30 days), Free Plan, Premium;
**deleting one is `retire_plan()`, never a `delete`**. Freeze and cancel need a **reason** (0057),
and **a refund is `max(pro-rata for the unused term, the gym's tier) − a documented fee`** (0073) —
RA 7394 expects pro-rata, so the tiers are a **floor**, and lowering one does not cut the payout.
**Frozen means no access at all, and Today says so**; frozen days are credited back to the expiry, so
0070's 60-day yearly ceiling is shown, never enforced (MIGRATION_STATUS → *Frozen*). **The assistant is
a paid feature (0059)**: its route locks, and Today's button carries a lock mark. Decisions in
[TEST_MATRIX](docs/TEST_MATRIX.md).

### Mobile shell — Nocturne (2026-09-17)
[PhoneChassis.tsx](g-fitness-member/src/components/layout/PhoneChassis.tsx) fills the viewport via
`100dvh` + safe-area insets; content scrolls inside `<main>`, never the page. **No decorative phone
frame** — it ships as a real Android **TWA**. Full reference: [DESIGN_SYSTEM → Nocturne](docs/DESIGN_SYSTEM.md#nocturne--the-member-app-from-2026-09-17).
- **Three tabs — Today · Train · You — plus More and a check-in block**, in
  [TabBar.tsx](g-fitness-member/src/components/layout/TabBar.tsx). The bar is **in flow, not floating**:
  `<main>` ends where the bar begins (`--bar-height`), so nothing scrolls under it and `--dock-clear` is
  breathing room only. `memberNav.ts` owns tabs, rails and the More sheet; `TAB_PATHS` needs **one row
  per tab** or the wrong tab lights. **The trainer shell mirrors it** (2026-09-18): `trainerNav.ts`,
  `TrainerTabHeader`, an in-flow five-tab bar; the `.dock*` CSS is deleted. Sheets use `GlassSheet`.
- **Pages portal into roots that are `pointer-events: none`**: the always-mounted wrapper owns
  `pointerEvents: open ? 'auto' : 'none'` — **never** on an `AnimatePresence` child, which keeps its last
  props while exiting and eats every tap (shipped 4×). Overlays portal, never `absolute` inside `<main>`.
- **Back undoes the last step**: `PageTitle back fallback=…` does `history.length > 1 ? navigate(-1) :
  navigate(fallback)`. `/member/bookings` and `/member/book` are aliases written into notification
  `action_url`s. **Per-member caches are memory-only and cleared in `logout()`**.

### Styling and design system
- **Admin is Tailwind v3; member is v4 with no config file** — **if a class looks like it does nothing, it
  probably does nothing**; verify against the built bundle.
- **Member colour roles** (Core Fitness colour on Nocturne's structure — the user asked for colour, not the
  prototype's greys): **violet = where you are / what you have** (selection, progress, state); **amber =
  what you can do next** (book, renew, save, send). Violet #7C3AED is 3.5:1, so **violet text is
  `--color-primary-300`**. No reds or greens — errors are amber. **Type floor 12px**, Inter only (Anton is gone).
- **Build screens from `components/ui/noc.tsx`** (`PageTitle`, `LineRow`, `NocButton`, `Panel`,
  `StatusPill`, `TextTabs`, `Chip`, `ProgressBar`, `InlineStat`) and `Field`/`TextInput`/`Select`. A list is
  rows on the page, **not a card per row**; `ProgressBar` renders **nothing without a real fraction**.
- **Admin** (unchanged): tokens never `brand-*`/`dark-*`; primitives `FormField`, `DatePicker`,
  `TimePicker`, `Popover`, `kit.tsx`, `usePaged`, `DetailSheet`, `TooltipLayer`, `SectionTabs`.
- **Layout traps:** `cn()` drops a bare `flex` beside `flex-col`; **`minmax(0, 1fr)`, never bare `1fr`**;
  Tailwind emits CSS **only for literal class names**; **a `<button>` centres its content**; **never a
  `<button>` inside a `<button>`**. **Never declare a component inside a render body.** For
  `set-state-in-effect`: lazy initialiser, compare-during-render, or wrap the async call in an IIFE.
- **Motion is CSS in `index.css` (`noc-*`), never framer's rAF-driven `initial`** — rAF stops on a non-compositing page.
- **Copy is a claim**: screens read `point_rules`, `cancellation_reasons`, `gym_settings`,
  `membership_plans` — the prototype's 20-point visit and two-hour cancel rule do not exist. **Gym names
  and addresses are never typed in.** Fixtures need **real column names and a real `Content-Range`**.

### Levels, achievements and what a trainer may see
**Two different levels exist and must be named apart on screen.** `experience_level` is self-declared and drives class recommendations; the *earned* level comes from
`member_progression()` — calling both "level" made two screens contradict each other. **Everything a client could fake lives in SQL:** a SECURITY DEFINER writer, no
INSERT policy, and a table the admin edits for the *rules* — `achievement_unlocks`, `trainer_ratings` (needs a *completed* session; **the member-facing average is
withheld below three ratings, the admin's is not**), `invoice_counters`, `plan_features`, `point_ledger`, `membership_events`. **A plan change must precede
`recordPayment`**, and **`npm run check:achievements` must stay green**. **Members choose what trainers see** (0032): `trainer_may_see()` gates measurements, goals,
workout logs/sets and `workout_plans` in RLS, not the UI — audit it by resolving each function to its **last** definition (0039 missed this; 0048 fixed it). **The "AI"
features are deterministic and rule-based, not model calls** and **member-only** (admin and trainer lost theirs 2026-09-11) — keep that honest in the UI; `planBuilder.ts` returns **data, never prose** and `planRender.ts` words it. No
calorie or macro targets; a stated injury yields a **referral, never a changed exercise**. **Test regexes by running them** — all four shipped broken (`\bplan\b` never
matched "plans").

### Admin shell
`Sidebar.tsx` is **grouped**: nine rows, Attendance first; a one-child group **flattens**, and the open
drawer is set in the **state initialiser, never an effect**. Attendance is **today only** (History has
the rest); paired sections are `SectionTabs` of `NavLink`s, so old bookmarks resolve. **Modal labels
are statement-style**, never questions.

## Conventions and docs
React 19 + Router v7 + TS; function components, default-exported pages/layouts; Framer Motion,
Lucide, Recharts (admin only). Import alias `@/*` → `./src/*` in **admin only**. Philippine
context: ₱, Mamburao/Occidental Mindoro, `+63`, cash-only by design. Legacy camelCase types survive
in `g-fitness-admin/src/types/`; new code uses `types/db.ts`. Root-level `*.md` are
presentation-facing — **not specs**. Docs: [VERIFYING](docs/VERIFYING.md) ·
[MIGRATION_STATUS](docs/MIGRATION_STATUS.md) · [DATA_ACCESS](docs/DATA_ACCESS.md) ·
[DESIGN_SYSTEM](docs/DESIGN_SYSTEM.md) · [DEPLOYMENT](docs/DEPLOYMENT.md) ·
[BUSINESS_MODEL](docs/BUSINESS_MODEL.md) · [OBJECTIVES_TRACE](docs/OBJECTIVES_TRACE.md) ·
[MEMBERSHIP_POLICY](docs/MEMBERSHIP_POLICY.md).

## Roadmap
**0001–0087 are live; 0088 (coach notes seen/done) and 0089 (a routine per plan day) await pasting.** Verify with `python scripts/probe-migrations.py` (REST, no DB credentials)
**rather than trusting a report that a migration was pasted** — 0070 was believed done for a day and
never ran. Migrations are pasted by hand, **one at a time**, so **`db push` is wrong here**. Detail,
0074's privilege bug and Objective 2's amendment: MIGRATION_STATUS → *Migrations and the probe*.
[OBJECTIVES_TRACE](docs/OBJECTIVES_TRACE.md) maps objectives → code → demo; the panel's list is in
[the hardening plan](docs/superpowers/plans/2026-09-07-panel-hardening.md). Outstanding:
- **Demo data may be live**: `scripts/demo-data/` seeds 150 members, payments, classes, coaches, events and rewards (ids `5eed____-0000-4000-8000-`); part 2 goes in as `part2/` one file at a time and one paste removes both — **dashboard figures include it until removed**. 0080 hid it from members via `sees_demo_data()`; **0084 shows it to everyone** (that one function body), gives the 12 demo coaches hours and un-retires the demo timetable.
- **Staff approve registrations through 0078's `set_account_status()`**, one transition only.
  **`fitness-assistant` is undeployed**, secrets unset — the rules answer 98%; the AI question is
  answered in [AI_INTEGRATION](docs/AI_INTEGRATION.md).
- **Shipping works from an agent session** — `git push`, then `npx vercel deploy` and
  `promote`; **a push does not deploy**, and env vars must exist in Vercel *before* deploying
  because Vite inlines them ([DEPLOYMENT](docs/DEPLOYMENT.md); check with `scripts/verify-deploy.py`). **The APK never needs rebuilding
  for a code change**; admin serves `dist/`, so **admin changes need `npm run build`**. `lib/appUpdate.ts` reloads an open app onto a new deploy.

### Verifying work
**A green build proves nothing** — every visual bug here compiled perfectly. **Every recipe, the SQL
harness, and the traps that cost time: [docs/VERIFYING.md](docs/VERIFYING.md)** — read it before
claiming anything is verified. The three that decide *how* you verify:
- **To look at a screen**, drive Playwright against `localhost`; reach a login-gated one by
  **routing the network and planting a session** — `page.route()` survives reloads, a
  `window.fetch` patch does not.
- **Run SQL as a non-superuser** and **reproduce Supabase's grants first** — an owner bypasses RLS,
  so an unprotected table looks safe when the test role simply could not reach it.
- **When an assertion fails, suspect the test first** — most such failures were my arithmetic or a
  wrong column guess, but two were real bugs. **Heredocs keep breaking here** — bash eats backticks
  and mangles backslashes, so **write scripts with the Write tool**. To exercise a module with no
  login, `await import('/src/….ts')` through the dev server, which transforms TS on the fly.
- **The whole test matrix runs with no password**: `scripts/plan-gates.js` + `trainer-scenarios.js`
  (38 checks, the app) in the Playwright runner, and `scripts/sql/*.mjs` (66 checks, the rules, in
  pglite as a real `authenticated` role — **Docker has never started here**). **RLS filters rows and
  does not raise**: a forbidden write is *zero rows and no error*. How: MIGRATION_STATUS → *harnesses*.
