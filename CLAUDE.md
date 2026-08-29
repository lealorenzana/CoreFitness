# CLAUDE.md
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is
A gym management capstone for a real gym in Mamburao, Occidental Mindoro. It began as a
localStorage prototype; **that migration is complete** — everything runs on Supabase, free tier.
Two independent Vite apps: **`g-fitness-admin/`** (`:5174`) is the desktop dashboard, run locally
from a desktop icon and never deployed; **`g-fitness-member/`** (`:5173`) is the installable phone
app (PWA → Android TWA) and hosts the **trainer** role as well as the member one.

Not a monorepo — no workspaces, no shared package. Each has its own `package.json`, tsconfig, ESLint
and Tailwind setup; run `npm` from inside the app directory. `supabase/` holds 48 SQL migrations, RLS
policies and four Edge Functions (`create-trainer`, `create-member`, `create-staff`, `send-push`) —
[supabase/README.md](supabase/README.md) covers setup and secrets.

## Commands
```bash
(cd g-fitness-admin  && npm install && npm run dev)   # → localhost:5174
(cd g-fitness-member && npm install && npm run dev)   # → localhost:5173
```
- `npm run build` — `tsc -b && vite build`. Both build clean. Both tsconfigs set `noUnusedLocals`/
  `noUnusedParameters`, so **an unused import fails the build** though `npm run dev` is happy.
- `npm run lint` · `npm run preview` · `npm run check:achievements` (member). No test framework —
  see *Verifying work*.
- Both apps need `.env.local` (copy `.env.example`). Deploy member by **promoting a verified
  preview**, never straight to prod; env vars must exist in Vercel *before* deploying — Vite inlines
  them. Checklist: [DEPLOYMENT](docs/DEPLOYMENT.md).

## Data honesty — read this before touching a page
**Full audit: [docs/MIGRATION_STATUS.md](docs/MIGRATION_STATUS.md).** Every page is Supabase-backed.
**"No mock data remains" was claimed twice and wrong twice** — invented events, then a chatbot citing
gyms, coaches and prices that do not exist. Grep found neither; opening the page did, and both hid in
*chrome*: the bell, a shared modal, a boot re-seed. Audit layouts, shared modals and `data/`, not just
`pages/`. The rules that keep getting violated:
- Members are **archived, never deleted**; analytics return **zero, never a plausible invention**.
- A missed lookup renders **nothing, never a hardcoded fallback identity** — member Profile once
  shipped `<img src="/eya.png">`, so every member saw a real person's face on their own profile. A
  withheld average is **NULL and says so**, never 0 stars.
- Payments distinguish **`paid_on` from `created_at`**; members store a **birth date, not an age**.
- **Calendar dates come from `utils/dates.ts`, never `toISOString()`** — Manila is UTC+8, so the UTC
  date is yesterday for the first eight hours of every local day, which hid every pre-8am check-in.
  **`current_date` is UTC too**: it mis-dated a third of every day's payments until 0045.
- **An identifier is unique because a constraint says so, not because a formula looks unlikely to
  repeat.** `invoice_number` was `Date.now()` mod 1e6 — **cycling every 16m40s** — with no UNIQUE, so
  two receipts could share one number silently. **Two devices' clocks also disagree**: a 60s QR window
  with no tolerance let a desk PC a minute fast expire every code on arrival.
- **A control that writes a flag nothing reads is a lie** — admin's "Remember me" was a `useState`
  nobody read, on a login form, where that is a security claim. **The mirror image is as bad: a rule
  enforced only in SQL that the user cannot read ambushes them** (plan entitlements bound bookings
  from 0017 and surfaced nowhere until 0041).
- **Per-user state never lives in `localStorage`** — *and a column is not the fix unless the row
  exists when the write runs* (0033 → 0036, onboarding replayed anyway).
- **Anything the client can grant or skip proves nothing** — badge rules, the audit log and invoice
  numbers live in SQL. But **probe a SECURITY DEFINER guard before believing it** (0038 → 0039).
- **A failed section says so.** Degrading to empty makes "couldn't load" read as "nothing here".
- **A feature ships when a route leads to it, not when the query works.** Trainer recommendations
  (0025) and the free-workout library (0019) were both built, seeded, correct — and linked from
  nowhere. Grep the path, not just the component.

## Architecture
### Auth and routing — real Supabase Auth
`profiles.role` (`admin`/`staff`/`trainer`/`member`) and `profiles.status` (`active`/
`pending_approval`/`suspended`/`archived`) are the source of truth, not localStorage flags.
**`staff`** is front desk (0011/0012): payments, check-ins, extensions — not pricing, trainers,
accounts, settings or the audit log; everything staff do is recorded and reversible.
`<ProtectedRoute adminOnly>` is convenience; **RLS is the boundary.** The member app also caches a
legacy user object into `localStorage['user']`/`isLoggedIn`/`trainerMode` for the ~6 pages still on
`getCurrentUser()` — never real auth state; `syncUserCache()` rebuilds it on boot, since a persisted
session means `login()` never reruns. **Sessions last until Logout** (`persistSession`/`autoRefresh`
explicit in both clients). Admin's **"Remember me" is real** (`lib/authStorage.ts`: on → localStorage,
off → sessionStorage, default on); the phone app has none. **Only members self-register** — the signup
trigger hardcodes `'member'`, so Login hides Sign Up on the Trainer tab.

### The data-access layer
`src/lib/api/*.ts`, one module per table, typed against `src/types/db.ts`; per-app **services** above
them assemble whole screens — put multi-table assembly in a service, not a component. Most modules
exist twice, once per app: **diff before you copy**, `notify.ts` differs on purpose.
**[docs/DATA_ACCESS.md](docs/DATA_ACCESS.md) lists every trap that has cost time here**: a zero-row
`UPDATE`/`DELETE` **is not an error**; `OLD` is unassigned in an INSERT trigger; a comma inside a
`.or()` term is filter syntax (400); and a NULL-unsafe `<>` skips a role guard — use
`IS DISTINCT FROM` (shipped live twice: 0038→0039, and 0032→0048).
**The audit trail and global search are admin-only.** `activity_log` (0037) is written **only** by
SECURITY DEFINER triggers — admin SELECT, **no INSERT policy** — so a browser cannot forge a row;
read it through the `activity_feed` view, which must stay **`security_invoker`** or the policy is
bypassed. Rows predating 0037 are not backfilled. Global search (`searchService.ts`, Ctrl+K) **names**
a section that fails.

### Notifications and web push
Two channels, deliberately unequal. The `notifications` row is the **record**, always awaited; the
push is the **alert** — fire-and-forget, never allowed to throw, so a booking cannot fail to approve
over an uninstalled app (`lib/api/notify.ts`). **Preferences gate delivery, never the record.**
**Push needs HTTPS — never testable on `http://localhost`.** The bell is a worktray (0029); the desk
can delete anyone's rows only since 0034, which admin "Recall" needs. **Training plan reminders
(0030)** are the one server-scheduled thing — pg_cron is **optional**, check `cron.job` first. State
tables and the rest: [MIGRATION_STATUS](docs/MIGRATION_STATUS.md).

### Mobile shell — always full-screen
[PhoneChassis.tsx](g-fitness-member/src/components/layout/PhoneChassis.tsx) fills the viewport via
`100dvh` + safe-area insets; all three shells delegate to it and content scrolls inside `<main>`, not
the page. Use `dvh`, not `vh`. **There is no decorative phone frame** — it ships as a real Android
**TWA** loading the live URL, so a redeploy updates installed phones. Pages portal by id into
`#phone-screen`, `#phone-toast-root`, `#phone-overlay-root`, `#modal-root` — all four exist and **all
four are `pointer-events: none`**, so anything portalled in **must** set `pointer-events-auto` or it
paints perfectly and cannot be tapped (shipped three times, once an undismissable modal). **Overlays
portal to a root, never inline**: `<main>` is `relative` and scrolls, so `absolute inset-0` resolves
to the top of the *content* — −2000px on a scrolled list. `overscroll-behavior` stops pull-to-refresh
reloading the TWA; `hooks/useLiveData.ts` keeps screens fresh.
**Home is *today* only** — greeting, membership, coach note, today, next session. Counters and the
level card live on Progress, events on Book, the rest in Profile → Your account; the dock's
`tabSubPaths` must match or the bar highlights a tab you are not on. **Tab switches must not flash or
lose your place** — `lib/pageCache.ts` and `hooks/useScrollMemory.ts`, memory-only and **cleared in
`logout()`** (keyed by *screen*, they would otherwise hand the next person the last member's Home).

### Styling and design system
**Full reference including the traps: [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).** The parts you
cannot afford to rediscover:
- **Admin is Tailwind v3** (no cascade layers). **Member is v4** with **no config file**: one was
  silently ignored and classes defined only there emitted *no CSS* for months. **Unlayered author CSS
  beats every layer**, whatever the specificity. **If a class looks like it does nothing, it probably
  does nothing** — verify against the built bundle, not the source (`npm run build`, grep `dist/`).
- Tokens are CSS custom properties in each `src/index.css`; never `brand-*`/`dark-*`. **Amber =
  primary action, violet = selection/structure. Type floor is 12px.** No greens or reds. Headings opt
  into `.display` (Anton, uppercase) — never globally. Primitives first: member `Card`, `StepFlow`;
  admin `FormField`, `DatePicker`, `TimePicker`, `Popover`.
- **On a non-compositing page (background tab, locked phone, this harness) neither `rAF` nor CSS
  transitions run** — only `setTimeout` + a direct state write is safe, so **never gate visibility or
  correctness on an animation having run**. **`AnimatePresence` never unmounts an exiting child**,
  which left `Modal` with 14 invisible descendants at `pointer-events: auto` over the whole screen;
  `open ? … : …` on the child does not fix it, because an exiting child keeps its *last* props. The
  fix is an always-mounted wrapper **outside** `AnimatePresence` owning the only pointer-events
  declaration. **Other overlays still carry the old shape.**
- Wrong twice each: **native pickers** (`color-scheme: dark`, not `filter: invert(1)`), **focus
  rings**, **popovers inside scrolling modals**. **Never declare a component inside a render body** —
  it creates a new type each render and remounts the subtree (caught by lint in `PlanBuilder`).

### Levels, achievements and what a trainer may see
**Two different levels exist and must be named apart on screen.** `experience_level` is self-declared
and drives class recommendations; the *earned* level comes from `member_progression()` — calling both
"level" made Home and Book a Session contradict each other.
**Everything a client could fake lives in SQL, and the pattern repeats:** a SECURITY DEFINER writer,
no INSERT policy, a table the admin edits for the *rules* — `achievement_unlocks`, `freemium_trials`
(one per member ever), `trainer_ratings` (needs a *completed* session; withholds the average below
three, for admin too), `invoice_counters`. Plan access is **columns, not the tier name**
(`utils/planAccess.ts`); **a plan change must precede `recordPayment`**, which reads the membership to
compute the term. **`npm run check:achievements` must stay green.**
**Members choose what trainers see** (0032): `trainer_may_see()` gates measurements, goals, workout
logs and `workout_plans` (0047) in RLS, not the UI; admin/staff ungated, default shared. **0039 fixed
twelve NULL-unsafe role guards and missed this one** — `<>` yields NULL for a caller with no
`profiles` row, so both branches fell through to a default of *shared* (0048 fixed it). Auditing this
class means resolving each function to its **last** definition; counting per file re-finds superseded
code. Detail: [MIGRATION_STATUS](docs/MIGRATION_STATUS.md) · [BUSINESS_MODEL](docs/BUSINESS_MODEL.md).

**The "AI" features are deterministic and rule-based, not model calls** — keep that honest in the UI
too. `planBuilder.ts` (0047) returns a **PlanSpec: data, never prose**; `planRender.ts` words it, and
that seam is where a model would go — facts stay rule-generated and only phrasing is reworded. The
**exercise table renders straight from the spec**, because a model that can reword "4 x 5-6" can
change it. No calorie or macro targets; a stated injury yields a **referral, never a changed
exercise**. Assistant threads persist per profile (0046), **owner-only — no admin or staff read**.
Admin [chatbot.ts](g-fitness-admin/src/data/chatbot.ts) plus `trainerChatbot.ts`/`memberAssistant.ts`
answer from live data, and a missing value names the page that sets it rather than guessing. **Test
these regexes by running them** — all three shipped: `amenit` cannot match "amenities", `/hi/`
matched "this"/"which"/"hindi", `/location/` never matched "Where are you located?".

## Conventions and docs
React 19 + Router v7 + TS; function components, default-exported pages/layouts; Framer Motion, Lucide,
Recharts (admin only). Pages in `src/pages/`, member nesting `pages/trainer|progress/`. Import alias
`@/*` → `./src/*` in **admin only** — member uses relative imports. Philippine context: ₱,
Mamburao/Occidental Mindoro, `+63`, cash-only by design. Legacy camelCase types survive in
`g-fitness-admin/src/types/`; new code uses `types/db.ts`.
[VERIFYING](docs/VERIFYING.md) · [MIGRATION_STATUS](docs/MIGRATION_STATUS.md) ·
[DATA_ACCESS](docs/DATA_ACCESS.md) · [DESIGN_SYSTEM](docs/DESIGN_SYSTEM.md) ·
[DEPLOYMENT](docs/DEPLOYMENT.md) · [BUSINESS_MODEL](docs/BUSINESS_MODEL.md) ·
[supabase/README](supabase/README.md) · `WHAT SHOULD BE IMPLEMENTED…txt` (panel feedback).
Root-level `*.md`, `README.md` included, are presentation-facing — **not specs**.

## Roadmap
**Everything is built and applied.** Migrations **0001–0048 are live**; the ledger is empty because
they were run by hand, so **`db push` is wrong here** — it would replay all 48. An agent session
cannot run them (the credential store is unreadable): hand the user **one migration at a time** to
paste, since a 444-line multi-file buffer broke the SQL Editor's statement splitter mid-`$$`.
Registration → approval → payment → activation and the booking round trip are verified by hand, and
an anon audit left every hostile write at **0 rows**. Outstanding:
- **QR scan is still untested on real hardware.** Its fixes went in blind: ±180s clock tolerance with
  a message naming a clock problem instead of "expired", a self-regenerating code, ECC L→M, a spec
  quiet zone. The six-character fallback is derived from the member UUID, not stored.
- **Staff approving registrations** needs an Edge Function (RLS won't let `staff` set
  `profiles.status`). Push is done — real phone, 2026-08-17.
- **Nothing behind a login has been seen rendering** — the plan builder and saved chats were verified
  by logic, routing, bundle and SQL only. Say so rather than implying otherwise.
- **Deployed 2026-08-29**; production confirmed **byte-identical** to a fresh local build. **The APK
  never needs rebuilding for a code change** — the TWA loads the live URL and
  `skipWaiting`/`clientsClaim` update phones. Admin serves `dist/` from a desktop icon, so **admin
  changes need `npm run build`**; rebuild and compare hashes to prove it is current.
- **Pushing is the user's to run, always** — the credential helper needs a UI no agent session has.

### Verifying work
**A green build proves nothing** — every visual bug here compiled perfectly. **Recipes, traps and the
SQL harness: [docs/VERIFYING.md](docs/VERIFYING.md).** In short: `preview_start` and measure with
`getComputedStyle` (screenshots time out — the pane rarely composites); render real components in a
`MemoryRouter`, reaching login-gated screens by **stubbing `window.fetch` and planting a session**;
run SQL **as a non-superuser**, since an owner bypasses RLS and makes a broken policy pass — and
**reproduce Supabase's grants first** (`alter default privileges … to anon, authenticated`), or an
unprotected table looks safe purely because the test role could not reach it. **Docker Desktop did
not start here**; `@electric-sql/pglite` is real Postgres in Node with no daemon and is the harness
that works. Load the function under test **out of its migration file** rather than retyping it, and
prove a fix by showing the failure first. Say plainly what ran and what did not.
