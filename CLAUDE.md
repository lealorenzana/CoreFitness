# CLAUDE.md
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is
A gym management capstone for a real gym in Mamburao, Occidental Mindoro. It began as a localStorage
prototype; **that migration is complete** — everything runs on Supabase, free tier. Two independent
Vite apps: **`g-fitness-admin/`** (`:5174`) is the desktop dashboard, run locally from a desktop icon
and never deployed; **`g-fitness-member/`** (`:5173`) is the installable phone app (PWA → Android TWA)
and hosts the **trainer** role as well as the member one. Not a monorepo — run `npm` from inside the
app directory. `supabase/` holds 64 migrations, RLS policies and four Edge Functions —
[supabase/README.md](supabase/README.md) covers setup and secrets.

## Commands
`npm install && npm run dev` **from inside each app directory** — admin on `:5174`, member on `:5173`.
- `npm run build` — `tsc -b && vite build`. Both build clean. Both tsconfigs set `noUnusedLocals`/
  `noUnusedParameters`, so **an unused import fails the build** though `npm run dev` is happy.
- `npm run lint` · `npm run check:achievements` (member). No test framework — see *Verifying work*. Both apps need `.env.local` (copy `.env.example`).

## Data honesty — read this before touching a page
**Full audit: [docs/MIGRATION_STATUS.md](docs/MIGRATION_STATUS.md).** Every page is Supabase-backed.
**"No mock data remains" was claimed twice and wrong twice** — both hid in *chrome* (the bell, a
shared modal, a boot re-seed) where grep missed them. **Audit layouts, shared modals and `data/`, not
just `pages/`.** Rules that keep getting violated:
- Members are **archived, never deleted**; analytics return **zero, never a plausible invention**. A
  missed lookup renders **nothing, never a hardcoded fallback identity** — Profile once showed a
  stranger's face. A withheld average is **NULL and says so**, never 0 stars. **A failed section says
  so** — empty reads as "nothing here". Payments distinguish **`paid_on` from `created_at`**; members
  store a **birth date, not an age**.
- **Calendar dates come from `utils/dates.ts`, never `toISOString()`** — Manila is UTC+8, so the UTC
  date is yesterday for the first eight hours of every local day, which hid every pre-8am check-in.
  **`current_date` is UTC too** (mis-dated a third of every day's payments until 0045). **A feature
  ships when a route leads to it** — 0025 and 0019 were built, correct, and linked from nowhere.
- **An identifier is unique because a constraint says so**, not because a formula looks unlikely to
  repeat. **Clocks disagree too**: a 60s QR window with no tolerance expired codes on arrival.
  **`BarcodeDetector` does not exist in Chrome on Windows** (Android/macOS/ChromeOS only) and fails
  *silently*, so the scanner "worked" for a year and never scanned; `QRScanner` decodes with **jsQR**
  over the full frame, and **never a crop** — a `qrbox` clips the quiet zone. **A control writing a
  flag nothing reads is a lie** (admin's fake "Remember me"); **a rule enforced only in SQL the user
  cannot read ambushes them** (0017 → 0041). **Per-user state never lives in `localStorage`** — *and a
  column is not the fix unless the row exists when the write runs* (0033 → 0036).
- **Anything the client can grant or skip proves nothing** — badge rules, the audit log and invoice
  numbers live in SQL. **Probe a SECURITY DEFINER guard before believing it** (0038 → 0039) — *and
  check it does not block its own writer*, shipped wrong **twice** (0055's `settle_goals()` from cron,
  0062's `retire_plan()` from the SQL Editor): `auth.uid()` is NULL outside a browser session, so `is
  distinct from 'admin'` is true for the one caller entitled to run it. Guard on **`auth.uid() is not
  null and` not-admin** (0063).
- **A trigger needs an event to fire on.** "Attended" is an approved booking whose time has *passed*
  and nothing writes a row then, so class/PT points are a re-runnable sweep (0051); as triggers they
  would have compiled and never fired. **A policy on a table whose RLS is off reads exactly like
  protection and is none** — assert `enable row level security` in the file adding it; an `EXISTS`
  subquery inside a policy is **itself RLS-filtered** (0050).

## Architecture
### Auth and routing — real Supabase Auth
`profiles.role` (`admin`/`staff`/`trainer`/`member`) and `profiles.status` (`active`/
`pending_approval`/`suspended`/`archived`) are the source of truth, not localStorage flags.
**`staff`** is front desk (0011/0012): payments, check-ins, extensions — not pricing, trainers,
accounts, settings or the audit log. `<ProtectedRoute adminOnly>` is convenience; **RLS is the
boundary.** The member app also caches a legacy user object into `localStorage['user']` for the ~6
pages still on `getCurrentUser()` — never real auth state; `syncUserCache()` rebuilds it on boot,
since a persisted session means `login()` never reruns. **Sessions last until Logout.** **Only
members self-register** — the signup trigger hardcodes `'member'`, so Login hides Sign Up on Trainer.
**Approving a registration grants the free tier, `active`, via `startFreeMembership()`** — by *tier*,
never the plan tapped at signup: they have paid nothing, and the gym is cash-only. Idempotent, because
flipping `status` alone left them signed in with **no** membership (and `pending` is not usable).

### The data-access layer
`src/lib/api/*.ts`, one module per table, typed against `src/types/db.ts`; per-app **services** above
them assemble whole screens — put multi-table assembly in a service, not a component. Most modules
exist twice, once per app: **diff before you copy**, `notify.ts` differs on purpose.
**[docs/DATA_ACCESS.md](docs/DATA_ACCESS.md) lists every trap that has cost time here**: a zero-row
`UPDATE`/`DELETE` **is not an error**; `OLD` is unassigned in an INSERT trigger; a comma inside a
`.or()` term is filter syntax (400); a NULL-unsafe `<>` skips a role guard — use `IS DISTINCT FROM`.
`activity_log` (0037) is written **only** by SECURITY DEFINER triggers (**no INSERT policy**), read
through `activity_feed`, which must stay **`security_invoker`**.

### Notifications and web push
The `notifications` row is the **record**, always awaited; the push is the **alert** —
fire-and-forget, never allowed to throw, so a booking cannot fail to approve over an uninstalled app.
**Preferences gate delivery, never the record. Push needs HTTPS — never testable on localhost.**
**Server-scheduled work is 0030 and 0051–0055**; pg_cron is **optional everywhere** (check `cron.job`
first), so members are told late, never not at all. Reminders carry a **dedupe key behind a partial
unique index (0053)** — `not exists` races itself.

### Subscriptions gate features; the engagement loop is 0049–0061
**Design + audit: [the startup-features spec](docs/superpowers/specs/2026-09-04-startup-features-design.md).
0017's four booking columns are untouched and stay that way.** Gating *app areas* is `plan_features`
(0049), a plan × feature matrix the admin edits, resolved by `plan_allows()` — the same function RLS
calls, so screen and database cannot drift. **A plan may never have a missing cell**: an insert
trigger seeds every one, and **that seeding CASE needs an `else`** — three branches returned NULL
into a NOT NULL column, so adding the Pro tier failed on its own trigger (0057). Gates **lock and
explain, never hide**, worded from the `features` row that denied it. **Never gate the free workout
library (0019)** — it exists *for* members who cannot pay; only the AI **model escalation** is gated,
never the rule table. Then: sets/reps (**0050 extends `workout_logs`, never a
second table**), CORE Points (0051, ledger has **no INSERT policy for any role**), challenges (0052,
progress **computed, never stored**), reminders (0053), trainer credentials (0054), goal presets
(0055), the `pro` tier (0056 — **enum alone, its own paste**), plans and `membership_events` (0057:
freeze/cancel need a **reason**), resources (0058), the assistant as the entitlement (0059).
**The gym sells three**: Free Trial (freemium, 30 days), Free Plan, Premium. 0060 retired Pro as a
**row change, never an enum one** — Postgres cannot drop an enum value, so both apps keep `'pro'` in
`PlanTier` and the tier `<option>` shows **only while editing a plan already on it**, or that
`<select>` rewrites the plan to Free on save. Retiring is `is_active = false` while a membership
points at it (`memberships.plan_id` has no cascade); **deleting is `retire_plan()` (0062, fixed in
0063), never a `delete`** — it moves every membership, *whatever its status*, to the free tier in one
transaction, where a bare delete raised a foreign key. Count members with `plan_member_counts()`: the
client-side tally counted only `status = 'active'`, read **"Active Members 0"** for a plan somebody
was on, and the delete guard believed it. 0061's `image_url` is a **path into each app's
`public/resource-previews/`**; **NULL is normal**, drawing the host tile, never a stand-in picture.

### Mobile shell — always full-screen
[PhoneChassis.tsx](g-fitness-member/src/components/layout/PhoneChassis.tsx) fills the viewport via
`100dvh` + safe-area insets; content scrolls inside `<main>`, not the page. Use `dvh`, not `vh`.
**No decorative phone frame** — it ships as a real Android **TWA** loading the live URL. Pages portal
by id into `#phone-screen`, `#phone-toast-root`, `#phone-overlay-root`, `#modal-root`, **all four
`pointer-events: none`**, so a portalled child **must** set `pointer-events-auto` or it paints
perfectly and cannot be tapped (shipped three times). **Overlays portal to a root, never inline**:
`<main>` is `relative` and scrolls, so `absolute inset-0` lands −2000px up a scrolled list. **Home is
*today* only**; counters, the level card and **MY CORE** live on Progress, events and challenges on
Book — the dock's `tabSubPaths` must match or the bar highlights a tab you are not on. **Per-member caches are memory-only and cleared in `logout()`** (`pageCache.ts`,
`useScrollMemory.ts`, `useFeatures.ts`).

### Styling and design system
**Full reference including the traps: [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).**
- **Admin is Tailwind v3** (no cascade layers). **Member is v4** with **no config file**: one was
  silently ignored and classes defined only there emitted *no CSS* for months. **Unlayered author CSS
  beats every layer.** **If a class looks like it does nothing, it probably does nothing** — verify
  against the built bundle, not the source.
- Tokens are CSS custom properties in each `src/index.css`; never `brand-*`/`dark-*`. **Amber =
  primary action, violet = selection/structure. Type floor is 12px.** No greens or reds. Headings opt
  into `.display` (Anton, uppercase), never globally. Primitives first: member `Card`, `StepFlow`;
  admin `FormField`, `DatePicker`, `TimePicker`, `Popover`.
- **On a non-compositing page (background tab, locked phone, this harness) neither `rAF` nor CSS
  transitions run** — **never gate visibility or correctness on an animation having run**.
  **`AnimatePresence` never unmounts an exiting child**, which left `Modal` with 14 invisible
  descendants at `pointer-events: auto` over the whole screen; the fix is an always-mounted wrapper
  **outside** it owning the only pointer-events declaration. Wrong twice each: **native pickers**
  (`color-scheme: dark`), **focus rings**, **popovers inside scrolling modals**. **Never declare a
  component inside a render body**; for `set-state-in-effect`, do it in a lazy state initialiser or
  separate fetch from state application.

### Levels, achievements and what a trainer may see
**Two different levels exist and must be named apart on screen.** `experience_level` is self-declared
and drives class recommendations; the *earned* level comes from `member_progression()` — calling both
"level" made Home and Book a Session contradict each other. **Everything a client could fake lives
in SQL:** a SECURITY DEFINER writer, no INSERT policy, a table the admin edits for the *rules* —
`achievement_unlocks`, `freemium_trials`, `trainer_ratings` (needs a *completed* session; withholds
the average below three), `invoice_counters`, `plan_features`, `point_ledger`,
`challenge_participants`, `membership_events`. **A plan change must precede `recordPayment`**.
**`npm run check:achievements` must stay green.** **Members choose what trainers see** (0032):
`trainer_may_see()` gates measurements, goals, workout logs/sets and `workout_plans` in RLS, not the
UI — audit it by resolving each function to its **last** definition (0039 missed this; 0048 fixed
it). **The "AI" features are deterministic and rule-based, not model calls** — keep that honest in
the UI. `planBuilder.ts` (0047) returns a **PlanSpec: data, never prose**; `planRender.ts` words it,
and that seam is where a model would go. No calorie or macro targets; a stated injury yields a
**referral, never a changed exercise**. Threads persist per profile (0046), **owner-only**. **Test
regexes by running them** — all four shipped broken (`\bplan\b` never matched "plans").

### Admin shell
`Sidebar.tsx` is **grouped, not a flat list**: nine rows, related pages in a remembered drawer,
Attendance first because it is the daily screen. A group left with one child for `staff` **flattens
into that child**, and the drawer holding the current page opens in the **state initialiser, never an
effect**. Attendance is the *desk* — **today only; any other day belongs to Attendance History**,
which it once duplicated with its own day-stepper, month grid, search and hourly chart.

## Conventions and docs
React 19 + Router v7 + TS; function components, default-exported pages/layouts; Framer Motion, Lucide,
Recharts (admin only). Pages in `src/pages/`, member nesting `pages/trainer|progress/`. Import alias
`@/*` → `./src/*` in **admin only** — member uses relative imports. Philippine context: ₱,
Mamburao/Occidental Mindoro, `+63`, cash-only by design. Legacy camelCase types survive in
`g-fitness-admin/src/types/`; new code uses `types/db.ts`. Root-level `*.md` are presentation-facing
— **not specs**. Docs: [VERIFYING](docs/VERIFYING.md) · [MIGRATION_STATUS](docs/MIGRATION_STATUS.md)
· [DATA_ACCESS](docs/DATA_ACCESS.md) · [DESIGN_SYSTEM](docs/DESIGN_SYSTEM.md) · [DEPLOYMENT](docs/DEPLOYMENT.md) · [BUSINESS_MODEL](docs/BUSINESS_MODEL.md).

## Roadmap
**0001–0064 are live** (through 2026-09-05); 0058/0061 cannot be probed anonymously since
`workout_resources` is `select_authenticated`. Migrations are pasted by hand, so **`db push` is wrong
here** — it would replay all 64; hand over **one at a time** (a 444-line buffer broke the SQL Editor's
splitter mid-`$$`), all re-runnable so a double-paste is harmless. Outstanding:
- **Staff approving registrations** needs an Edge Function (RLS won't let `staff` set
  `profiles.status`). **`fitness-assistant` is undeployed**, secrets unset — the rules answer 98%.
- **Shipping works from an agent session**: `git push origin main` succeeds (cached GCM credentials);
  `npx vercel deploy` then `npx vercel promote <url> --yes` ships member —
  `zatanaels-projects/core-fitness`, alias `corefitness-gym.vercel.app`; env vars must exist in Vercel
  *before* deploying, since Vite inlines them ([DEPLOYMENT](docs/DEPLOYMENT.md)). **A push does not
  deploy**: verify a preview, then promote. **The APK never needs rebuilding for a code change** — the
  TWA (`app.vercel.corefitness_gym.twa`) loads the live URL and `sw.js` updates installed phones.
  Admin serves `dist/`, so **admin changes need `npm run build`**.

### Verifying work
**A green build proves nothing** — every visual bug here compiled perfectly. **Every recipe, the SQL
harness, and the traps that cost time: [docs/VERIFYING.md](docs/VERIFYING.md)** — read it before
claiming anything is verified. The three that decide *how* you verify:
- **To look at a screen**, drive Playwright against `localhost` (the Browser pane scales screenshots
  down); reach a login-gated one by **routing the network and planting a session** — `page.route()`
  survives reloads, a `window.fetch` patch does not.
- **Run SQL as a non-superuser** and **reproduce Supabase's grants first** — an owner bypasses RLS,
  so an unprotected table looks safe when the test role simply could not reach it. **Probing which
  migrations are live needs no DB credentials**: over REST the anon key reports the *schema*.
- **When an assertion fails, suspect the test first** — most such failures were my arithmetic or a
  wrong column guess, but two were real bugs. **Heredocs keep breaking here**: use the Write tool.
