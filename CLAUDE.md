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
  scripts/audit-writes.py` counts them (109 writes, 86 guarded) and DATA_ACCESS says which 23 are deliberate.
  Two more audits, both finding real things: **`audit-dead-code.py`** (a module copied per app and then fixed in
  only one is the trap — the member app carried eight admin-only functions nothing called) and
  **`audit-routes.py`** (a route nothing links to; three have shipped). **Guard
  `.update(`/`.delete(` only** — adding `.select()` to an `INSERT` breaks a write the caller may make but not read
  back.
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
Classes (`bookings` → `classes`) and 1-on-1 (`pt_sessions`) are separate tables (0015); 0017
counts quota per plan and **quota has no opinion about clashes**. 0068 adds them, comparing
**half-open intervals with `overlaps`, never `starts_at = starts_at`** — a 60-minute 10:00 class
collides with a 10:30 session. No override: a freeze limit is policy, being in two rooms at once is
a contradiction. Availability is **per trainer** and always was. Class generation **reports**
(`trainer_schedule_conflicts()`) rather than raising, because `generate_class_instances()` is one
`INSERT … SELECT` and a raising trigger would lose a whole timetable over one template.
**Trainers decide their own bookings** (0071) — final and immediate, `decided_by_role` stamped,
admin able to reverse; a two-stage approval tells a member "approved" and then takes it back.
**Cancelling is `cancel_booking()` (0081) and nothing else** — a bare `status='cancelled'` update is
refused by a trigger, and the enum did **not** grow ("cancelled by X" is `cancelled_by_role`). It
**deliberately reverses 0071**: a trainer may now cancel, through that function only. **A trainer sees
only their own trainees** (0082) — four tables read `using (get_my_role() = 'trainer')` and handed
over the whole gym. Detail for all three, and 0083's attention queue, in
[DATA_ACCESS](docs/DATA_ACCESS.md).

### Notifications and web push
The `notifications` row is the **record**, always awaited; the push is the **alert** —
fire-and-forget, never allowed to throw, so a booking cannot fail to approve over an uninstalled app.
**Preferences gate delivery, never the record. Push needs HTTPS — never testable on localhost.**
**Server-scheduled work is 0030, 0051–0055 and 0071**; pg_cron is **optional everywhere** (check
`cron.job` first), so sweeps also run on page load — members are told late, never not at all. Every
automated message goes through `notify_once`, whose **dedupe key sits behind a partial unique index
(0053)**; `not exists` races itself.

### Subscriptions gate features; the engagement loop is 0049–0061
**Spec: [startup-features](docs/superpowers/specs/2026-09-04-startup-features-design.md). Plans,
refunds and gating detail: [MEMBERSHIP_POLICY](docs/MEMBERSHIP_POLICY.md) · [AI_INTEGRATION](docs/AI_INTEGRATION.md). 0017's four booking
columns are untouched and stay that way.** Gating *app areas* is `plan_features` (0049), resolved
by `plan_allows()` — **the same function RLS calls**, so screen and database cannot drift. **Gates
lock and explain, never hide**; **never gate the free workout library (0019)**, which exists *for*
members who cannot pay. **0050 extends `workout_logs`, never a second table**; the points ledger
and `challenge_participants` have **no INSERT policy for any role**, and challenge progress is
**computed, never stored**. **The gym sells three** — Free Trial (30 days), Free Plan, Premium;
**deleting one is `retire_plan()`, never a `delete`**. Freeze and cancel need a **reason** (0057),
and **a refund is `max(pro-rata for the unused term, the gym's tier) − a documented fee`** (0073) —
RA 7394 expects pro-rata, so the tiers are a **floor**, and lowering one does not cut the payout.
**Frozen means no access at all** — and **Home says so** (2026-09-15): it had no
concept of the state, so a frozen member read a healthy card counting down days
and found out only by tapping Book, or at the desk. Frozen replaces the
countdown, because those days are not running down. Cancelled stays usable to
the expiry and the card labels it. Frozen days are **credited back to the expiry** — so the
60-day yearly ceiling (0070) is *shown* in the freeze dialog and **never enforced**: members were
told about the monthly limit and never about a yearly one. Decisions in
[TEST_MATRIX](docs/TEST_MATRIX.md).

### Mobile shell — always full-screen
[PhoneChassis.tsx](g-fitness-member/src/components/layout/PhoneChassis.tsx) fills the viewport via
`100dvh` + safe-area insets; content scrolls inside `<main>`, not the page. Use `dvh`, not `vh`.
**No decorative phone frame** — it ships as a real Android **TWA** loading the live URL. Pages
portal by id into four roots that are **all `pointer-events: none`**, so a portalled child **must**
set `pointer-events-auto` or it paints perfectly and cannot be tapped (shipped 3×). **Overlays
portal to a root, never inline**: `<main>` is `relative` and scrolls, so `absolute inset-0` lands
−2000px up a scrolled list. **The dock is Home · Training · Membership · Profile** plus the QR bump, and
`tabSubPaths` needs **one row per tab, in navRoutes order** — a mismatch lights
the wrong tab rather than failing. **The Training tab opens Book a Session
itself** — a hub in front of it was one tap of furniture and half a screen of
white space — with the other six training destinations as a 3-across `NavTile`
grid under the header (a scrolling rail sliced two of them off the right edge,
which reads as unfinished; a fixed set of six is a number you can just show). Progress is reached from there and from Home's "Your progress ->
See activity".
Home stays *today* only; Profile is the account and owns Settings, listed there
and nowhere else. **A back arrow undoes the last step, never navigates**:
`window.history.length > 1 ? navigate(-1) : navigate('/member/home')` is the
pattern, and five screens hardcoded Home instead — so opening Progress from the
Training grid and pressing back landed you on a screen you had never been on.
**A screen with its own inner scroller still owes `--dock-clear`** (Progress,
Challenges): `<Page>` applies it, a hand-rolled `overflow-y-auto` does not, and
the dock floats over whatever the scroll ends on. **`/member/bookings` and `/member/book` are aliases**, not
routes anyone links to by hand: 0030/0051-0055 write them as notification
`action_url`s, and before the aliases those taps landed on Home. **Per-member
caches are memory-only and cleared in `logout()`**.

### Styling and design system
**Full reference including the traps: [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).**
- **Admin is Tailwind v3; member is v4 with no config file** — one was silently ignored and
  emitted *no CSS* for months. **If a class looks like it does nothing, it probably does nothing**
  — verify against the built bundle, not the source.
- Tokens are CSS custom properties in each `src/index.css`, never `brand-*`/`dark-*`. **Amber = primary action, violet = selection/structure. Type floor is 12px.** No greens or reds; `.display` (Anton) is opt-in. Primitives first — member `Card`/`StepFlow`/`Bento`, admin `FormField`, `DatePicker`, `TimePicker`, `Popover`, `kit.tsx`, `usePaged`, `DetailSheet`, `TooltipLayer`, `SectionTabs`; the z-index ladder and the rest of the traps are in DESIGN_SYSTEM.
- **Layout traps that each cost a session:** `cn()`/tailwind-merge **silently drops a bare `flex`** beside `flex-col`, leaving `display: block`; **`minmax(0, 1fr)`, never bare `1fr`**; Tailwind emits CSS **only for literal class names** — which is why `Bento`'s `wide` is an inline `gridColumn`, since a span that does nothing is ugly rather than broken and would ship; **a `<button>` centres its content**.
- **A tile that only labels a destination is a tap that teaches nothing.** The Membership tab was four `NavTile`s and stated nothing about the membership; every cell now carries a real number *and* is the route to the screen that number belongs to. It does not repeat Home's card — Home is identity (name, QR, today), this is the account.
- **A card that looks like a control must be one.** Challenges rendered a full card and made a 60px pill the only target, so tapping the title did nothing — which reads as a broken screen. The card is the button now, with the pill kept as the visible affordance. **Only in the safe direction**: joining is the whole-card tap, leaving stays the small deliberate one. **Never a `<button>` inside a `<button>`** — invalid, and the inner one eats the outer's clicks.
- **A bento is two columns, and its hierarchy must be real.** Book a Session leads each day with its *first* class full width (not the recommended one — a filter can empty that, and a day always has a first) and widens an odd tail, because a half-width hole reads as a missing class.
- **On a non-compositing page (background tab, locked phone, this harness) neither `rAF` nor CSS transitions run** — **never gate visibility or correctness on an animation having run**, and count a DOM node rather than asking whether it is visible. **`AnimatePresence` never unmounts an exiting child**, which left `Modal` with invisible descendants at `pointer-events: auto` over the whole screen. Wrong twice each: **native pickers**, **focus rings**, **popovers in scrolling modals**.
- **Never declare a component inside a render body.** For `set-state-in-effect`: a lazy initialiser, **compare against the previous prop during render** to reset on a change, or separate fetch from state application — and the rule follows a *directly called* async function into its setState, so wrap it in an IIFE. Shipped 3×, caught by lint each time.

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
`Sidebar.tsx` is **grouped, not a flat list**: nine rows, related pages in a remembered drawer,
Attendance first because it is the daily screen. A group left with one child for `staff` **flattens
into that child**, and the drawer holding the current page opens in the **state initialiser, never an
effect**. Attendance is the *desk* — **today only; any other day belongs to Attendance History**.
Those two, and Announcements + Events, are each **one section with two tabs** (`SectionTabs`) —
`NavLink`s to the existing routes, not a shell rendering panels, so every old bookmark still
resolves; the *records* stay in separate tables. **Modal labels are statement-style**, never
questions.

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
**0001–0080 are live** (0079/0080 pasted 2026-09-15). **0081** (a cancellation records its reason,
actor and time), **0082** (a trainer sees only their own members) and **0083** (the desk's attention
queue, trainer suggestions and reassignment) are written and replay-tested at 83/83, **not yet
pasted** — and the app already calls them, so the cancel dialogs, the attention panel and the
visibility fix do nothing until they are. Verify with `python scripts/probe-migrations.py`, which
reads the schema over REST and needs no DB credentials. **Run it rather than trusting a report that a
migration was pasted**: 0070 was believed done for a day and had never executed. It probes **three objects per migration**, so a file that never ran is distinguishable
from one failed statement, and a protected object (42501) is a pass, not a miss.
**0074 closed a live privilege bug** — 0071's stamp triggers returned early when `status` was
unchanged, *above* the checks that stop a trainer rewriting `member_id` or `starts_at`, so a trainer
could reassign a seat or move somebody's session. Found by running the SQL, not by reading it.
Migrations are pasted by hand, so **`db push` is wrong here**; hand over **one at a time** (a
444-line buffer broke the SQL Editor's splitter mid-`$$`), all re-runnable.
The panel's list is tracked in [the hardening plan](docs/superpowers/plans/2026-09-07-panel-hardening.md).
[OBJECTIVES_TRACE](docs/OBJECTIVES_TRACE.md) maps objectives → code → demo. **Manuscript
Objective 2 named React Native / Express / MySQL / Firebase and the build uses none of them — the
objective is being amended**, not the account of the system; replacement text is in that file.
Outstanding:
- **Demo data may be live**: `scripts/demo-data/` seeds 150 members, payments, classes, coaches, events and rewards (ids `5eed____-0000-4000-8000-`); part 2 goes in as `part2/` one file at a time and one paste removes both — **dashboard figures include it until removed**. 0080 hides it from *members* via `is_demo_row()`/`sees_demo_data()`; admin and the desk still see it, so no figure moves.
- **Staff approving registrations is 0078, not an Edge Function** — staff already had the queue, the
  intake write and the membership insert; only `profiles.status` refused them, so
  `set_account_status()` allows **one** staff transition, `pending_approval → active`. Approval and
  rejection both go through it, so approval has a history and a rejection states a reason.
  **`fitness-assistant` is undeployed**, secrets unset — the rules answer 98%.
  **The AI question is answered in [AI_INTEGRATION](docs/AI_INTEGRATION.md)**: the
  integration is already written and provider-agnostic, Groq's free tier (30/min,
  14,400/day, no card) covers this gym, and Ollama cannot be the deployed answer
  because an Edge Function cannot reach a PC in Mamburao. The model is sent the
  question and nothing else — no name, no id, no membership.
- **Shipping works from an agent session** — `git push`, then `npx vercel deploy` and
  `promote`; **a push does not deploy**, and env vars must exist in Vercel *before* deploying
  because Vite inlines them ([DEPLOYMENT](docs/DEPLOYMENT.md); check with `scripts/verify-deploy.py`). **The APK never needs rebuilding
  for a code change**; admin serves `dist/`, so **admin changes need `npm run build`**.

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
- **The whole test matrix now runs with no password.** `scripts/plan-gates.js` and
  `scripts/trainer-scenarios.js` go into the Playwright runner's `filename` argument and drive the
  real app over a routed network (38 checks) — they prove the **app** agrees with the rules and
  reach no Postgres. `scripts/sql/*.mjs` then run **the rules themselves** (66 checks; `replay-migrations.mjs` first replays every migration — the only faithful schema, and what cleared part 2): they apply a
  migration verbatim onto a minimal fixture in `@electric-sql/pglite` — real Postgres in Node,
  because **Docker has never started here** — and act as a real `authenticated` role, because **a
  table owner bypasses RLS** and would pass every assertion regardless. **RLS filters rows and does
  not raise**, so the right result for a forbidden write is *zero rows and no error*.
