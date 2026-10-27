# CLAUDE.md
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is
A gym management capstone for a real gym in Mamburao — **now a multi-tenant SaaS**, many gyms on one
system ([TENANCY](docs/TENANCY.md)). Everything runs on Supabase, free tier. Four Vite apps, not a
monorepo (run `npm` from inside each): **`g-fitness-admin/`** (`:5174`, Vercel) is the gym owner's and
front desk's dashboard; **`g-fitness-member/`** (`:5173`, PWA → Android TWA) is the phone app and hosts
the **trainer** role too; **`corefitness-platform/`** (`:5175`, **localhost only**) is the platform
owner's; **`corefitness-site/`** (`:5176`) is the public website. The folder names are pre-rename
legacy — deliberately left alone. `supabase/` holds 150 migrations, RLS policies and nine Edge
Functions — [supabase/README.md](supabase/README.md) covers setup and secrets.

## Commands
`npm install && npm run dev` **from inside each app directory**; all four build clean. Every tsconfig sets
`noUnusedLocals`/`noUnusedParameters`, so **an unused import fails the build** though `npm run dev` is happy. `npm run lint` · `check:achievements` (member). **The site has no lint script** — `npm run build` is its only check. No test framework — see *Verifying work*. Each app needs `.env.local`.

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
  disagree too**. **`BarcodeDetector` does not exist in Chrome on Windows** and fails *silently* — `QRScanner` and the kiosk use
  `lib/qrDecode.ts`: **zxing (WebAssembly, self-hosted) first, then jsQR whole and half-size**, over the full frame, **never a crop** (jsQR alone read 11 of 48 blurry/glary webcam frames, zxing 31). **A control writing a flag nothing reads is a lie**; **a rule
  enforced only in SQL the user cannot read ambushes them** (0017 → 0041). **Every per-member cache is cleared in ONE list, `lib/memberCaches.ts`**, called by `logout()` and `switchGym()` — two hand-kept lists had drifted and the achievement catalogue (a per-gym table) had no clearer at all, so it survived one person signing out and the next signing in. **Admin had the same bug** (2026-09-26: Ana signed in after G Fitness's owner and her sidebar wore G Fitness's name and logo) — `lib/adminCaches.ts`, and in both apps **a listener on `onAuthStateChange` clears them whenever the account changes**, so no sign-out path can forget (`admin-account-swap-check.js`). **Offline (2026-10-27)**: reads go through `lib/offlineReads.ts` (saved per account, said so by the banner, cleared with the member caches), writes of your own records and chat through `lib/outbox.ts` — never a booking or request; ROADMAP has the traps (the session copy, `READ_RPCS`). **Per-user state never lives in
  `localStorage`** — *and a column is not the fix unless the row exists when the write runs* (0033 → 0036).
- **The legal pages are part of the system.** Terms/Privacy were boilerplate that *contradicted* it —
  "non-refundable" against 0073's pro-rata payout, a payment processor in a cash-only gym, deletion
  where members are archived. Rewritten 2026-09-14: **change them in the commit that changes the rule**,
  and contact details come from `gym_settings`, never typed in. Both render through `components/legal/LegalPage.tsx` (contents that follow the scroll, `/terms#refunds` deep links, print); **the clause text lives only in `Terms.tsx`/`Privacy.tsx`**, and a glance card or table there restates a clause, never adds one. **What a gym sets is read, never typed**: Terms' refund tiers come from the signed-in member's gym's `refund_rules`, the fee and its reason and the yearly freeze guideline from `gym_settings` (`lib/api/refundTerms.ts`); a reader with no session is told each gym sets its own, never shown another gym's numbers. **Each document's version is its date, in one place (`lib/legalVersions.ts`) — change a word, change the date**; the page prints it, Register sends it, and the agreement block at the end of each page (and Today's "Updated for you to read") records it through `accept_member_terms()`; the admin drawer shows which version.
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
### Auth and routing — real Supabase Auth, many gyms
**A role is per gym**: `gym_roles` (`admin`/`staff`/`trainer`/`member`; `active`/`pending_approval`/`suspended`/
`archived`) in the current gym (`profiles.active_gym_id`), **not** legacy `profiles.role` — **[TENANCY](docs/TENANCY.md) before any policy or definer function**.
**Both apps read `my_gym_context()`/`gym_people` (0104), never the legacy columns.** **`staff`** is front desk (0011/0012): payments, check-ins, not pricing, trainers,
accounts, settings or the audit log. `<ProtectedRoute adminOnly>` is convenience; **RLS is the
boundary.** The member app also caches a legacy user object into `localStorage['user']` for the ~6 pages
still on `getCurrentUser()` — **never real auth state**; `syncUserCache()` rebuilds it on boot. **Sessions last until Logout.** **Only
members self-register** — the signup trigger hardcodes `'member'`, so Login hides Sign Up on Trainer. **Everyone else is invited, and an invitation is a login (0202)**: `invite-account` emails a one-time password and the right app (front desk → admin); the account has no gym until its first-sign-in form calls `complete_invitation()` — both apps gate on `invite_pending` in the user metadata.
**Approving a registration grants the free tier, `active`, via `startFreeMembership()`** — by *tier*,
never the plan tapped at signup: they have paid nothing, and the gym is cash-only. Idempotent, because
flipping `status` alone left them signed in with **no** membership (and `pending` is not usable).

### The data-access layer
`src/lib/api/*.ts`, one module per table, typed against `src/types/db.ts`; per-app **services** above them assemble
whole screens — put multi-table assembly in a service, not a component. Most modules exist twice, once per app: **diff
before you copy**, `notify.ts` differs on purpose; `lib/coachGoals.ts` must stay identical. **A member feature is not done until admin and trainer can see, manage or be warned by it** (the drawer, the trainer's member sheet, the page that owns the data). **[docs/DATA_ACCESS.md](docs/DATA_ACCESS.md) lists every trap that
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
  breathing room only. `memberNav.ts` owns tabs, hubs and the More sheet (every destination has an `icon` + `blurb`; **no rail of chips under a title since the 2026-10-26 redesign** — spec `docs/superpowers/specs/2026-10-26-member-redesign-design.md`: one header, at most one row of tabs per page, rows with an icon tile by kind, Train = Workout · Classes · Coach); `TAB_PATHS` needs **one row
  per tab** or the wrong tab lights. **The trainer app is Discord style** (2026-10-11, redesigned 2026-10-27, `TrainerHub` + `pages/trainer/hub/`): no tab bar — a rail (**Today** first: requests, the day's timeline, Needs you; then Messages = one row per person, 1-on-1 tagged; then rooms with icon channels), the coach at the bottom; **their name opens the You sheet** (status + every coach screen, gated by the gym's switches) — no toolbar or profile chip row; Schedule/Bookings/Profile keep `TrainerTabHeader` with Back (`trainer-hub-check.js`). Sheets use `GlassSheet`. **A routine run (`/member/track/session/*`) is full screen**: Layout's `IMMERSIVE` drops the bar and chat head.
- **Pages portal into roots that are `pointer-events: none`**: the always-mounted wrapper owns
  `pointerEvents: open ? 'auto' : 'none'` — **never** on an `AnimatePresence` child, which keeps its last
  props while exiting and eats every tap (shipped 4×). Overlays portal, never `absolute` inside `<main>`.
- **Back undoes the last step**: `PageTitle back fallback=…` does `history.length > 1 ? navigate(-1) :
  navigate(fallback)`. `/member/bookings` and `/member/book` are aliases written into notification
  `action_url`s. **Per-member caches are memory-only and cleared in `logout()`** — the one exception is `lib/offlineSets.ts`, an outbox of sets logged with no signal.

### Styling and design system
- **Admin is Tailwind v3; member is v4 with no config file** — **if a class looks like it does nothing, it
  probably does nothing**; verify against the built bundle.
- **Member colour roles** (Core Fitness colour on Nocturne's structure — the user asked for colour, not the
  prototype's greys): **violet = where you are / what you have** (selection, progress, state); **amber =
  what you can do next** (book, renew, save, send). Violet #7C3AED is 3.5:1, so **violet text is
  `--color-primary-300`**. No reds or greens — errors are amber. **Inside a gym, never a fixed violet** — not `#7C3AED`, not a violet-black ground: use `var(--color-primary*)` / `color-mix(…)` so the gym's theme reaches it (only Login, Register and the gym map, before any gym, wear Core Fitness violet); `member-theme-check` judges every colour by hue in four themes. **Type floor 12px**, Inter only (Anton is gone).
- **Build screens from `components/ui/noc.tsx`** (`PageTitle`, `LineRow`, `NocButton`, `Panel`,
  `StatusPill`, `TextTabs`, `Chip`, `ProgressBar`, `InlineStat`) and `Field`/`TextInput`/`Select`. A list is
  rows on the page, **not a card per row**; a long list is a preview plus `SeeAll` to **its own page — never an in-place "show more"**; `ProgressBar` renders **nothing without a real fraction**.
- **Admin** (unchanged): tokens never `brand-*`/`dark-*`; primitives `FormField`, `DatePicker`, `TimePicker`, `Popover`, `kit.tsx`, `usePaged`, `DetailSheet`, `TooltipLayer`, `SectionTabs`. **Fit pages (2026-10-11, owner's rule): no page scroll, no dead space** — `rd-fit` + `FitBody`, tables page by what fits (`hooks/useFitRows.ts`), every box scrolls itself (Members, Attendance, Invitations, Notifications' three boxes). **Lots of data never pushes the page** (2026-10-20): the windowed `Pager` (`attendance/parts.tsx`), and a long side list is a preview + *See all* into a `FloatingWindow` (`admin-volume-check.js`). **Never concentric rings** — the kit's single `Ring`.
- **Admin redesign (2026-10-11, from the owner's mock-ups)**: `components/ui/rd.tsx` (+ `rdTokens.ts`) — `RdHeader` with pill tabs, `RdCard glow` hero + `IconTile` + `Ring`, `StatTile`, `FilterChips` with counts, `SearchField`/`RdSelect`/`RdButton`, `RdTable`/`Tr`/`Td` + `TableFooter` (pill pages), `Pill`, `DotMenu`, `WithRail` + `RailCard`/`RailRow`/`RailAction`/`TipCard`. Attendance (Today · Walk-ins · History — **rebuilt to the owner's v2 mock-up in its own scoped stylesheet, `pages/attendance/att.css` (`.att`, classes `a-*`)**; match an approved mock-up's own sizes, never the kit's), Members, Invitations, Trainers (+ Credentials), Notifications, and (2026-10-12) Coaching, Schedule, Bookings, Payments (End of day in the rail), Shop (photo tiles, ticket pinned), Plans, Activity and Rewards are built on it; (2026-10-25) Your app, Settings, Your plan and **Help** (Support + Feedback, one page; old routes redirect) follow the mock-ups in `att.css` — `PageTabs`, `RdField`, `PhotoPicker`; every page fits the screen (`admin-ops-redesign-check.js` asserts no page scroll and no sideways table scroll); the shared `Modal` is `role="dialog"` named by its title — **a redesign never drops a feature**; a passive `RailRow` is a div, not a disabled button (`admin-redesign-check.js`). **The dashboard is the owner's morning (A1, 2026-10-18, `services/todayService.ts`)**: Needs you (each count from the page its button opens), Checked in today (never "in the gym now" — there are no check-outs), Cash today, Today's classes, this month vs the same days of last month, busy hours in one colour, members to watch; the old charts open in the side panel (`admin-dashboard-check.js`).
- **Layout traps:** `cn()` drops a bare `flex` beside `flex-col`; **`minmax(0, 1fr)`, never bare `1fr`**;
  Tailwind emits CSS **only for literal class names**; **a `<button>` centres its content**; **never a
  `<button>` inside a `<button>`**. **Never declare a component inside a render body.** For
  `set-state-in-effect`: lazy initialiser, compare-during-render, or wrap the async call in an IIFE.
- **Motion is CSS in `index.css` (`noc-*`), never framer's rAF-driven `initial`** — rAF stops on a non-compositing page.
- **The big moments (wave 1, 2026-10-27)**: `lib/moments.ts` (one queue, sounds, switches, markers) + `lib/momentWatch.ts` + `components/moments/` (`mo-*` CSS). A moment shows only read numbers (the ledger row that paid for it) and is marked played on the account (0216), never the phone. Levels are named (Beginner/Intermediate/Advanced), the streak is in weeks — never invent a numbered level or a day streak. **Wave 2 (the everyday screens, 2026-10-27)**: `components/ui/lively.tsx` (`FlameMark`, `Medal`, `ProgressRing`, `CountNumber`, `PointsChip`), the You trophy room, the Season ladder and podium — `lv-*` CSS. Wave 3 (friends, wins, cheers) follows the same spec.
- **Copy is a claim**: screens read `point_rules`, `cancellation_reasons`, `gym_settings`,
  `membership_plans` — the prototype's 20-point visit and two-hour cancel rule do not exist. **Gym names
  and addresses are never typed in.** Fixtures need **real column names and a real `Content-Range`**.
  Translate with `lib/i18n.ts` — `t('English text')`, falling back to English; pages load via `lib/lazyPage.ts`.

### Levels, achievements and what a trainer may see
**Two different levels exist and must be named apart on screen.** `experience_level` is self-declared and drives class recommendations; the *earned* level comes from
`member_progression()` — calling both "level" made two screens contradict each other. **Everything a client could fake lives in SQL:** a SECURITY DEFINER writer, no
INSERT policy, and a table the admin edits for the *rules* — `achievement_unlocks`, `trainer_ratings` (needs a *completed* session; **the member-facing average is
withheld below three ratings, the admin's is not**), `invoice_counters`, `plan_features`, `point_ledger`, `membership_events`. **A plan change must precede
`recordPayment`**, and **`npm run check:achievements` must stay green**. **Members choose what trainers see** (0032): `trainer_may_see()` gates measurements, goals,
workout logs/sets and `workout_plans` in RLS, not the UI — audit it by resolving each function to its **last** definition (0039 missed this; 0048 fixed it). **The plan builder and the assistant's rules are rule-based; the AI coach is a real Claude model** behind `ai-coach`, gated in SQL, **member-only** — keep that honest in the UI; `planBuilder.ts` returns **data, never prose** and `planRender.ts` words it. No
calorie or macro targets; a stated injury yields a **referral, never a changed exercise**. **Test regexes by running them** — all four shipped broken (`\bplan\b` never
matched "plans").
### Public site — `corefitness-site/` (Vercel: corefitness-site.vercel.app)
One page, no router, no Tailwind: React + plain CSS (`src/index.css`, Nocturne tokens on `:root` — violet/amber roles as in the member app). `App.tsx` is the whole marketing page plus the gym-owner **apply form**; the price list comes from `platform_price_list()` and the gym list from `list_gyms()` — **never typed in**; a price of `null` reads "Talk to us" (`pricing.ts`). `#status/<token>` (hash, so any static host works) renders `Status.tsx` via the anon-callable `application_status()`/`application_reply()` (0148). Without `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, `supabase` is null and every section must still render honestly. Links out to the member app (`corefitness-gym.vercel.app`) and admin (`corefitness-admin.vercel.app`). **Scroll-told (2026-10-03):** `src/motion.ts` is one scroll loop writing CSS vars (`--p`, `--pin`, `--page`) — never React state per frame; content is visible by default and hidden-until-revealed only under `html.anim`, which reduced motion never sets (the pinned story then renders as a list, `StillStory`). `Story.tsx`'s scenes are **illustrations with sample data and say so**, but each shows a behaviour the system has. **Showcase (2026-10-11, `Showcase.tsx`)**: one section per scroll technique — `Manifesto` (word-by-word reveal), `Phone3D` (CSS 3D, layers apart with `--pin`), `Scrub` (a canvas frame sequence tied to the scrollbar), `Catalogue` (every feature, from `catalogue.ts` — **add a line there when a feature ships**; group titles pinned) — plus parallax and a marquee that follows `--page`/`--vel`; all fall back to the finished state without motion (`site-showcase-check.js`). **Photos never claim a venue they are not** — Fitness Regency and Ferrer Fitness are invented gyms (MIGRATION_STATUS). Since 2026-10-21 the hero fade and the coaches band use the owner's chosen images (`hero-floor.webp`, `band-lifter.webp`, stored mirrored), with no "Photo: G Fitness" credit. **Light/dark mode** (2026-10-21): `:root[data-theme]` tokens in `index.css`, set before paint by `index.html` (saved choice, else the device's) and flipped by the header's `ThemeToggle` (`src/theme.ts`); amber *text* is `--amber-text`; the coaches band stays dark in both. **The gym documents live here, not in the member app** (`#legal/terms|dpa|privacy`, `src/legalText.ts` + `Legal.tsx` — never two names that differ only in case: Windows sees one file): Terms for gyms, the Data Processing Agreement (the gym is the RA 10173 controller, Core Fitness the processor) and the platform's own Privacy Policy. Grace days, reminder days and the business's contact come from `platform_public_terms()` (0154), never typed. **`VERSION` is the date an applicant agrees to** (stored by `accept_gym_terms()` against their status token, shown on the platform's Applications) — change a word, change the date. **They are in effect only when the platform has published this `VERSION`** (0156, Settings → Gym documents; there is no constant to flip): drafts say so, and the apply form asks nobody to agree to one; owners are asked in the admin app. The footer splits *For gyms* from *For members* — it used to send gym owners to the member Terms.

### Admin shell
`Sidebar.tsx` is **grouped**: nine rows, Attendance first; a one-child group **flattens**, and the open
drawer is set in the **state initialiser, never an effect**. Attendance is **today only** (History has
the rest); paired sections are `SectionTabs` of `NavLink`s, so old bookmarks resolve. **Modal labels
are statement-style**, never questions. Check-in rules live in `services/checkInService.ts`, shared by the desk and `/kiosk` — it resolves member **and coach** codes (`CFC1.`, 0200); **a coach is never a member visit** (`coach_checkins`, not attendance), and the activity tag's owner (`activity_by`) is set by a trigger, never the client.

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

## Current state (2026-10-18)
- **Migrations 0001–0203 are all live** (probe, 2026-10-20; 0202 = an invitation is a login, 0203 = who approves means who approves). **0204–0211 are live** (probe, 2026-10-25): 0209 = Lobby TV is a plan feature with the gym's own design, 0210 = every points payout asks the member's plan, 0211 = check-ins saved offline at the kiosk/desk are recorded when the connection is back. **0212 is live** (2026-10-26: What's new per app, saved colour themes, a coach's first steps). **0213 is live** (2026-10-27: the assistant in the header or floating, the member's choice; reward reminders say the gym's points word). **0214 is live** (2026-10-27: the ready-made colour pairs' codes are free; any other code needs the ₱499 unlock). **0215 is live** (2026-10-27: the gym's own messages marked `from_gym` and pinned in the member Inbox; the members' redesign note). **0216 is live** (2026-10-27: the big moments — owner's two switches, the member's moment sound, the "already celebrated" markers). After a deploy that changes what people see, write a note on the platform's *What's new* — each person sees it once. **`plan_allows()` says yes to any admin/staff caller — never use it to decide a payout; use `member_plan_allows()` (0206).** What every migration shipped, its harness and its trap: **[docs/ROADMAP.md](docs/ROADMAP.md)** — read a feature's entry before changing it. Add new entries there, newest first.
- **Fresh start ran 2026-10-18**: every gym and non-platform-admin account was deleted (`scripts/fresh-start/`, README). **Gym #1 is Core Fitness Lab**, the platform owner's private test gym — never listed, never billed, and still the rules template every new gym copies. Logins `mf.jgabrielle+owner|desk|coach|member@gmail.com` (ids `cf1ab000…`; made-up rows `5eed…`, removable by Remove demo data). The one platform admin is `corefitnessadmin@gmail.com`. **G Fitness re-applies through the site as an ordinary gym** — the owner's last step, after the system is polished.
- **A free trial is 7 days and stops** (0198): the day after `paid_until`, a never-paid trial gym is `trial_ended` (no grace; grace is for paid gyms) — admin shows only `TrialEnded`, member/trainer only `GymPaused`. The platform moves a trial's end from Billing → Change the date.
- **Security (0199)**: `scripts/sql/security-red-team.mjs` attacks as visitor/member/coach/other gym and must stay green. **Postgres grants EXECUTE to PUBLIC by default — revoke every new helper function from public/anon/ authenticated unless a screen calls it**, and remember a policy cannot limit columns (use a trigger).
- **The Supabase connector (MCP) is available**, project `ifwxtekyjgeljerslnzr`: verify with `execute_sql` / `query_logs` (pooler sign-in failures are in `supavisor_logs`). It never pastes migrations (the owner does, one at a time), wipes, empties Storage or writes secrets.
- **The weekly backup works** (first green run 2026-10-18; `docs/BACKUPS.md`), pinned to `ubuntu-24.04`.
- **Push keys rotated 2026-10-18** (the old VAPID private key had leaked into a session): new pair in Supabase secrets and Vercel `VITE_VAPID_PUBLIC_KEY` (Config, Production + Preview); the member app was redeployed with it.
- **Queued last, in this order**: premium themes, then Project H (`docs/ENTERPRISE_PLAN.md`).

**Verify with `python scripts/probe-migrations.py` (REST, no DB credentials), or the connector, rather than trusting a report that a migration was pasted** — 0070 was believed done for a day and never ran. Migrations are pasted by hand, **one at a time**, so **`db push` is wrong here**. Detail, 0074's privilege bug and Objective 2's amendment: MIGRATION_STATUS → *Migrations and the probe*.
[OBJECTIVES_TRACE](docs/OBJECTIVES_TRACE.md) maps objectives → code → demo; the panel's list is in [the hardening plan](docs/superpowers/plans/2026-09-07-panel-hardening.md). Outstanding:
- **Demo data**: `scripts/demo-data/` keeps only `remove-demo-data.sql` and `part3/` (its README says why); the old part-1 seeds are **test fixtures** in `scripts/sql/fixtures/` (the harness replays them at 0097) — never paste them. `remove_demo_data()` (0117/0168) is on the platform app's Platform screen, typed confirmation, irreversible.
- **Staff approve registrations through 0078's `set_account_status()`**, one transition only. **A member asks to freeze or cancel; the desk still does it** (0118, the same shape as 0091's renewal request) — **granting is a trigger on `membership_events`, never a button**, and the member sees `refund_quote()` (0070/0073) *before* asking, which no member-facing screen had ever called. **A waiver's published words are immutable** (0119, a trigger that refuses even the table owner) — editing makes the next version, and every signature points at the words it was shown. The PAR-Q is **fixed in SQL** (a gym shortening it is a liability); a yes **refers, never blocks or changes training**; health answers are **desk-only, never trainers** (Privacy says so, the harness asserts it). `waiver_required` gates **booking only** — never check-in, the free library, or a desk booking. **`fitness-assistant` is undeployed**, secrets unset — the rules answer 98%; the AI question is answered in [AI_INTEGRATION](docs/AI_INTEGRATION.md).
- **Shipping works from an agent session** — `git push`, then `npx vercel deploy` and `promote`; **a push does not deploy**, and env vars must exist in Vercel *before* deploying because Vite inlines them ([DEPLOYMENT](docs/DEPLOYMENT.md); check with `scripts/verify-deploy.py`). **The APK never needs rebuilding for a code change**; admin serves `dist/`, so **admin changes need `npm run build`**. `lib/appUpdate.ts` reloads an open app onto a new deploy. Weekly encrypted DB backup: [BACKUPS](docs/BACKUPS.md).

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
  does not raise**: a forbidden write is *zero rows and no error*. How: MIGRATION_STATUS → *harnesses*. **CI runs all of it on every push** ([CI](docs/CI.md)); `scripts/ci/ui-checks.json` lists the fixture checks.
