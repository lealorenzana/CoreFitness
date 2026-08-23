# CLAUDE.md
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is
A gym management capstone for a real gym in Mamburao, Occidental Mindoro. It began as a
localStorage prototype; **that migration is complete** — everything runs on Supabase, free tier.
Two independent Vite apps: **`g-fitness-admin/`** (`:5174`) is the desktop dashboard, run locally
from a desktop icon and never deployed; **`g-fitness-member/`** (`:5173`) is the installable phone
app (PWA → Android TWA) and hosts the **trainer** role as well as the member one.

Not a monorepo — no workspaces, no shared package. Each has its own `package.json`, tsconfig, ESLint
and Tailwind setup; run `npm` from inside the app directory. `supabase/` holds 41 SQL migrations, RLS
policies and four Edge Functions (`create-trainer`, `create-member`, `create-staff`, `send-push`) —
[supabase/README.md](supabase/README.md) covers setup and secrets.

## Commands
```bash
(cd g-fitness-admin  && npm install && npm run dev)   # → localhost:5174
(cd g-fitness-member && npm install && npm run dev)   # → localhost:5173
```

- `npm run build` — `tsc -b && vite build`. Both build clean. Both tsconfigs set `noUnusedLocals`/
  `noUnusedParameters`, so **an unused import fails the build** though `npm run dev` is happy.
- `npm run lint` · `npm run preview` · `npm run check:achievements` (member — verifies stored icon
  and metric names resolve). No test framework — see *Verifying work*.
- Both apps need `.env.local` (copy `.env.example`). Deploy member by promoting a verified preview,
  never straight to prod; env vars must exist in Vercel *before* deploying — Vite inlines them.
  Commands, verification and the post-deploy checklist: [DEPLOYMENT](docs/DEPLOYMENT.md).

## Data honesty — read this before touching a page
**Full audit: [docs/MIGRATION_STATUS.md](docs/MIGRATION_STATUS.md).** Every page is Supabase-backed.
**"No mock data remains" was claimed twice and wrong twice** — invented events, then a chatbot citing
gyms, coaches and prices that do not exist. Grep found neither; opening the page did, and both hid in
*chrome*: the bell, a shared modal, a boot re-seed in `main.tsx`. Audit layouts, shared modals and
`data/`, not just `pages/`. The rules that keep getting violated:
- Members are **archived, never deleted**; analytics return **zero, never a plausible invention**.
- A missed lookup renders **nothing, never a hardcoded fallback identity** — member Profile once
  shipped `<img src="/eya.png">`, so every member saw a real person's face on their own profile.
- Payments distinguish **`paid_on` from `created_at`**; members store a **birth date, not an age** (a
  derived number cannot go stale, a stored one silently does).
- **Calendar dates come from `utils/dates.ts`, never `toISOString()`.** Manila is UTC+8, so the UTC
  date is yesterday for the first eight hours of every local day — it hid every pre-8am check-in from
  admin Attendance and from its own duplicate guard.
- **A control that writes a flag nothing reads is a lie** — admin's "Remember me" was a `useState` no
  one read, on a login form, where that is a security claim. Wire it, or cut it. **The mirror image
  is just as bad: a rule enforced only in SQL that the user cannot read ambushes them.** Plan
  entitlements bound bookings from 0017, surfaced nowhere until 0041 — so the Free card's one
  statement was "does not expire": true, and the most misleading half.
- **Per-user state never lives in `localStorage`** — *and a column is not the fix unless the row
  exists when the write runs* (0033 → 0036, onboarding replayed anyway).
- **Anything the client can grant or skip proves nothing** — badge rules and the audit log live in
  SQL. But **probe a SECURITY DEFINER guard as anon before believing it** (0038 → 0039).
- **A failed section says so.** Degrading to empty makes "couldn't load" read as "nothing here".

## Architecture
### Auth and routing — real Supabase Auth
`profiles.role` (`admin`/`staff`/`trainer`/`member`) and `profiles.status` (`active`/
`pending_approval`/`suspended`/`archived`) are the source of truth, not localStorage flags. **`staff`**
is front desk (0011/0012): payments, check-ins and extensions, but not pricing, trainers, accounts,
settings or the audit log — everything staff do is recorded and reversible.
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
**[docs/DATA_ACCESS.md](docs/DATA_ACCESS.md) lists every trap that has cost time here**: a **zero-row
`UPDATE`/`DELETE` is not an error** (reports success, writes nothing); **`OLD` is unassigned in an
INSERT trigger**, so `coalesce(new.x, old.x)` aborts every insert; **a comma in a `.or()` term is
filter syntax**, returning 400; and **`get_my_role() <> 'admin'` is NULL for a caller with no profile
row, so the guard is skipped** — use `IS DISTINCT FROM`. That shipped live in 0038 (0039 fixed it).

**The audit trail and global search are admin-only.** `activity_log` (0037) is written **only** by
SECURITY DEFINER triggers — admin SELECT, **no INSERT policy** — so it cannot be forged from a
browser; read it via the `activity_feed` view, which must stay **`security_invoker`** or the policy
is bypassed. Rows predating 0037 are **not** backfilled. Global search is `searchService.ts` (Ctrl+K)
and **names** a section that fails. Both in full: [DATA_ACCESS](docs/DATA_ACCESS.md).

### Notifications and web push
Two channels, deliberately unequal. The `notifications` row is the **record**, always awaited; the
push is the **alert** — fire-and-forget, never allowed to throw, because a booking must not fail to
approve over an uninstalled app (`lib/api/notify.ts`). **Preferences gate delivery, never the record.**
**Push needs HTTPS — never testable on `http://localhost`.** The bell is a worktray (0029): swipe
clears, swipe archives, delete behind a multi-select; **the desk can delete anyone's rows only since
0034**, which admin "Recall" needs — state table in
[MIGRATION_STATUS](docs/MIGRATION_STATUS.md#notifications-as-an-inbox-0029). **Training plans (0030)**
are the one server-scheduled thing: pg_cron calls `send_due_gym_reminders()`, which writes a row only
if the planned time has passed, within three hours, and the member has not checked in — pg_cron is
**optional**, check `cron.job` first.

### Mobile shell — always full-screen
[PhoneChassis.tsx](g-fitness-member/src/components/layout/PhoneChassis.tsx) fills the viewport via
`100dvh` + safe-area insets; all three shells delegate to it, content scrolls inside `<main>`, not the
page. **There is no decorative phone frame** — it ships as a real Android **TWA** loading the live
Vercel URL, so a redeploy updates installed phones ([DEPLOYMENT](docs/DEPLOYMENT.md)). Use `dvh`, not
`vh`. Pages portal by id into `#phone-screen`, `#phone-toast-root`, `#phone-overlay-root`,
`#modal-root` — all four must exist and **all four are `pointer-events: none`**, so anything portalled
in **must** set `pointer-events-auto` or it paints perfectly and cannot be tapped (shipped three times,
including an undismissable modal). **Overlays portal to a root, never inline**: `<main>` is `relative`
and scrolls, so `absolute inset-0` resolves to the top of the *content* — −2000px on a scrolled list.
`overscroll-behavior` stops Chrome's pull-to-refresh reloading the TWA; `hooks/useLiveData.ts` keeps
screens fresh instead.
**Tab switches must not flash or lose your place** — `lib/pageCache.ts` and `hooks/useScrollMemory.ts`,
both memory-only and **cleared in `logout()`** (keyed by *screen*, they would otherwise hand the next
person the last member's Home). Rules and the traps: [DESIGN_SYSTEM](docs/DESIGN_SYSTEM.md).

### Styling and design system
**Full reference including the traps: [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).** The parts you
cannot afford to rediscover:
- **Admin is Tailwind v3** (no cascade layers). **Member is v4** with **no config file**: one was
  silently ignored, and classes defined only there emitted *no CSS* for months. **Unlayered author CSS
  beats every layer**, whatever the specificity.
- **If a class looks like it does nothing, it probably does nothing.** Verify against the built
  bundle, never the source — `npm run build`, then grep `dist/assets/*.css`.
- Tokens are CSS custom properties in each `src/index.css`; never `brand-*`/`dark-*`. **Amber =
  primary action, violet = selection/structure. Type floor is 12px.** No greens or reds. Headings opt
  into `.display` (Anton, uppercase) — never globally. Primitives first: member `Card`, `StepFlow`;
  admin `FormField`, `DatePicker`, `TimePicker`, `Popover`.
- **On a page that isn't compositing (background tab, locked phone, this harness), neither `rAF` nor
  **CSS transitions** run** — `transition: opacity 200ms` read `0` after 900ms (`playState:
  "running"`, `currentTime: 0`). Only `setTimeout` + a direct state write is safe: **never gate
  visibility or correctness on an animation having run**; Framer is decoration. Both measured:
  **`AnimatePresence` never unmounts an exiting child** (invisible backdrop ate clicks forever —
  always-mounted wrapper *outside* it); **a transitioned SVG presentation attribute sticks** at its
  old computed value while the attribute reads the new one.
- Wrong twice each: **native pickers** (`color-scheme: dark`, never `filter: invert(1)`), **focus
  rings**, **popovers inside scrolling modals**.

### Levels, achievements and what a trainer may see

**Two different levels exist and must be named apart on screen.** `experience_level` is self-declared
and drives class recommendations; the *earned* level comes from `member_progression()` — calling both
"level" made Home and Book a Session contradict each other. **Grading lives in SQL**:
`sync_my_achievements()` is SECURITY DEFINER and the only writer of `achievement_unlocks` (no INSERT
policy, same shape as `activity_log`); 0038 made the *catalogue* a table. **Membership tiers** work
the same way: access is **columns, not the tier name**, enforced by triggers and surfaced to members
through `utils/planAccess.ts`; **`freemium_trials` is one row per member, ever**; and **a plan change
must precede `recordPayment`**, which reads the membership to compute the new term. Both in full:
[MIGRATION_STATUS](docs/MIGRATION_STATUS.md) · [BUSINESS_MODEL](docs/BUSINESS_MODEL.md).
**`npm run check:achievements` must stay green.** **Members choose what trainers see** (0032):
`trainer_may_see()` gates measurements, goals and workout logs in RLS, not the UI. Admin/staff
ungated; default shared.

**The "AI" features are deterministic and rule-based, not model calls** — keep the vocabulary honest.
Admin [chatbot.ts](g-fitness-admin/src/data/chatbot.ts) plus `trainerChatbot.ts`/`memberAssistant.ts`;
the admin one answers from live data (`chatbotService`), and a missing value names the page that sets
it rather than guessing. **Test these regexes by running them** — all three shipped: `\bamenit\b`
cannot match "amenities", `/hi/` matched "this"/"which"/"hindi", `/location/` never matched "Where
are you located?".

## Conventions and docs
React 19 + Router v7 + TS; function components, default-exported pages/layouts; Framer Motion,
Lucide, Recharts (admin only). Pages in `src/pages/`, member nesting `pages/trainer|progress/`. Import
alias `@/*` → `./src/*` in **admin only** — member uses relative imports. Philippine context: ₱,
Mamburao/Occidental Mindoro, `+63`, cash-only by design. Legacy camelCase types survive in
`g-fitness-admin/src/types/`; new code uses `types/db.ts`.

[VERIFYING](docs/VERIFYING.md) (probing recipes, SQL harness) · [MIGRATION_STATUS](docs/MIGRATION_STATUS.md)
(real vs mock, payment/QR semantics, progression) · [DATA_ACCESS](docs/DATA_ACCESS.md) (API layer, RLS
testing, PostgREST traps) · [DESIGN_SYSTEM](docs/DESIGN_SYSTEM.md) · [DEPLOYMENT](docs/DEPLOYMENT.md)
(Vercel, PWA, TWA) · [BUSINESS_MODEL](docs/BUSINESS_MODEL.md) (tiers, freeze/cancel, startup case) ·
[supabase/README](supabase/README.md) (schema, functions, VAPID) · `WHAT SHOULD BE IMPLEMENTED…txt`
(panel feedback). Root-level `*.md`, `README.md` included, are presentation-facing — **not specs**.

## Roadmap
**Backend/logic**, **the six panel features** and **design/frontend** are done — registration →
approval → payment → activation and the booking round trip verified by hand, admin dashboard
rebuilt page by page on real data. Outstanding:
- **0041 is written and unrun** — trainer background columns + `freemium_trials`. Verified in a
  `postgres:16-alpine` container (11 assertions, forging refused as `app_user`), **not** against the
  live project: run it in the SQL Editor. 0034–0040 are applied. Audited 2026-08-19 as anon: 27
  tables/views and 9 RPCs answer, no secret in either bundle, and every hostile write — activate a
  membership, self-promote to admin, forge an audit row, erase check-ins — changed **0 rows**. Two
  probe results that look like holes and are not (a blocked write returns **204**; a wrong-signature
  RPC returns **404**): [DATA_ACCESS](docs/DATA_ACCESS.md).
- **QR scan** — built, never tested on real hardware; the six-character code (`utils/checkInCode.ts`,
  first 6 hex of the member UUID, derived) is the fallback. **Staff approving registrations** needs an
  Edge Function (RLS won't let `staff` set `profiles.status`). Push is done — real phone, 2026-08-17.
- **Deployed 2026-08-22** by promoting a verified preview. **The APK never needs rebuilding for a code
  change** — the TWA loads the live URL, and `autoUpdate` + `must-revalidate` make phones self-update.
  Admin opens from a desktop icon (`g-fitness-admin/desktop/`) serving `dist/`, so **admin changes need
  `npm run build`**. **Two deploy-verification false alarms:** [DEPLOYMENT](docs/DEPLOYMENT.md).
- **Pushing is the user's to run, always.** Git's credential helper needs a UI no agent session can
  show, so `git push origin main` from a real terminal is the last step of a hand-off. Synced 08-22.

### Verifying work
**A green build proves nothing** — every visual bug here compiled perfectly. **Full playbook:
[docs/VERIFYING.md](docs/VERIFYING.md).** Run `preview_start` and measure with `getComputedStyle`;
the pane is often not compositing, so **screenshots time out — read the DOM instead**. Pure functions
and **components** both run in the dev server: `createRoot` a scratch div in a `MemoryRouter`, and
reach login-gated screens by **stubbing `window.fetch` per REST path and planting a session**, which
runs the real services end-to-end. **SQL:** a throwaway `postgres:16-alpine` container as a
**non-superuser** — a table owner bypasses RLS, and `SET LOCAL ROLE` outside a transaction silently
does nothing, so both make a broken policy pass. Without Docker, `npx pgsql-parser` checks top-level
syntax but **plpgsql bodies are opaque to it**. Say plainly what ran and what did not.
