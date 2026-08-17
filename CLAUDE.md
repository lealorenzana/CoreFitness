# CLAUDE.md
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is
A gym management capstone for a real gym in Mamburao, Occidental Mindoro. It began as a
localStorage prototype; **that migration is complete** — everything runs on Supabase, free tier.
Two independent Vite apps:

| App | Directory | Port | Target |
|-----|-----------|------|--------|
| Admin dashboard | `g-fitness-admin/` | 5174 | Desktop web, runs locally |
| Member + Trainer app | `g-fitness-member/` | 5173 | Installable phone app (PWA → Android APK) |

Not a monorepo — no workspaces, no shared package. Each has its own `package.json`, tsconfig,
ESLint and Tailwind setup; run `npm` from inside the app directory. `supabase/` holds 39 SQL
migrations, RLS policies and four Edge Functions (`create-trainer`, `create-member`, `create-staff`,
`send-push`) — [supabase/README.md](supabase/README.md) covers setup and secrets.

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
  Commands and the post-deploy checklist: [DEPLOYMENT](docs/DEPLOYMENT.md).

## Data honesty — read this before touching a page
**Full audit: [docs/MIGRATION_STATUS.md](docs/MIGRATION_STATUS.md).** Every page is Supabase-backed.
**"No mock data remains" was claimed twice and wrong twice** — invented events, then a chatbot
answering from gyms, coaches, numbers and prices that do not exist. Grep found neither; opening the
page did, and both hid in *chrome* — the bell, a shared modal, a boot-time re-seed in `main.tsx`.
Audit layouts, shared modals and `data/`, not just `pages/`. The rules that keep getting violated:
- Members are **archived, never deleted**; analytics return **zero, never a plausible invention**.
- A missed lookup renders **nothing, never a hardcoded fallback identity** — member Profile once
  shipped `<img src="/eya.png">`, so every member saw a real person's face on their own profile.
- Payments distinguish **`paid_on` from `created_at`**; members store a **birth date, not an age** —
  a derived number cannot go stale, a stored one silently does.
- **Calendar dates come from `utils/dates.ts`, never `toISOString()`.** Manila is UTC+8, so the UTC
  date is yesterday for the first eight hours of every local day — which hid every pre-8am check-in
  from the admin Attendance page and from its own duplicate guard.
- **A control that writes a flag nothing reads is a lie** — admin's "Remember me" was a `useState`
  nothing read, on a login form, where that is a security claim. Wire it, or cut it.
- **Per-user state never lives in `localStorage`** — *and a column is not the fix unless the row
  exists when the write runs* (0033 → 0036, onboarding replayed anyway).
- **Anything the client can grant or skip proves nothing** — badge rules and the audit log live in
  SQL. But **probe a SECURITY DEFINER guard as anon before believing it** (0038 → 0039).
- **A failed section says so.** Degrading to empty makes "couldn't load" read as "nothing here".

## Architecture
### Auth and routing — real Supabase Auth
`profiles.role` (`admin`/`staff`/`trainer`/`member`) and `profiles.status`
(`active`/`pending_approval`/`suspended`/`archived`) are the source of truth — not localStorage
flags. **`staff`** is front desk (0011/0012): payments, check-ins and extensions, but not pricing,
trainers, accounts, settings or the audit log — everything staff do is recorded and reversible.
`<ProtectedRoute adminOnly>` is convenience; **RLS is the boundary.** The member app also caches a
legacy user object into `localStorage['user']`/`isLoggedIn`/`trainerMode` for the ~6 pages still on
`getCurrentUser()` — never real auth state; `syncUserCache()` rebuilds it on boot, since a
persisted session means `login()` never reruns.
**Sessions last until Logout** — `persistSession`/`autoRefreshToken` set explicitly in both clients,
not inherited. Admin's **"Remember me" is real** (`lib/authStorage.ts`: on → localStorage, off →
sessionStorage, default on); the phone app has no such box on purpose.

### The data-access layer
`src/lib/api/*.ts`, one module per table, typed against `src/types/db.ts`; per-app **services**
above them assemble whole screens — put multi-table assembly in a service, not a component. Most
modules exist twice, once per app: **diff before you copy**, `notify.ts` differs on purpose.
**[docs/DATA_ACCESS.md](docs/DATA_ACCESS.md) lists every trap that has cost time here**: a
**zero-row `UPDATE`/`DELETE` is not an error** (reports success, writes nothing); **`OLD` is
unassigned in an INSERT trigger**, so `coalesce(new.x, old.x)` aborts every insert; **a comma in a
`.or()` term is filter syntax**, returning 400; and **`get_my_role() <> 'admin'` is NULL for a
caller with no profile row, so the guard is skipped** — use `IS DISTINCT FROM`. That one shipped
live in 0038 and let anon DELETE badges (0039).

**The audit trail and global search are admin-only.** `activity_log` (0037) answers what the schema
could not: `bookings` records a cancellation by flipping `status`, keeping **no timestamp and no
actor**, so a self-cancel and a desk cancel were indistinguishable. Written **only** by SECURITY
DEFINER triggers — admin SELECT, **no INSERT policy** — so it catches the member app and Edge
Functions too and cannot be forged from a browser. Read via the `activity_feed` view
(**`security_invoker`**, or the policy is bypassed). Cancellations predating 0037 are **not**
backfilled — no honest timestamp exists. Global search (`services/searchService.ts`, Ctrl+K) fires
11 parallel queries over nine entity types from **one** character up; a failed section is **named**.

### Notifications and web push
Two channels, deliberately unequal. The `notifications` row is the **record**, always awaited; the
push is the **alert** — fire-and-forget, never allowed to throw, because a booking must not fail to
approve over an uninstalled app (`lib/api/notify.ts`). **Preferences gate delivery, never the
record.** **Push needs HTTPS — never testable on `http://localhost`.**
The bell is a worktray (0029) — swipe clears, swipe archives, delete only behind a multi-select on
`/{member,trainer}/notifications`; **the desk can delete anyone's rows only since 0034**, which the
admin "Recall" button needs. State table:
[MIGRATION_STATUS](docs/MIGRATION_STATUS.md#notifications-as-an-inbox-0029).
**Training plans (0030)** are the one server-scheduled thing here: pg_cron calls
`send_due_gym_reminders()`, which writes a row only if the planned time has passed, within three
hours, and the member has not checked in. pg_cron is **optional** — check `cron.job` first.

### Mobile shell — always full-screen
[PhoneChassis.tsx](g-fitness-member/src/components/layout/PhoneChassis.tsx) fills the viewport via
`100dvh` + safe-area insets; all three shells delegate to it, content scrolls inside `<main>`, not
the page. **There is no decorative phone frame** — it ships as a real Android **TWA** loading the
live Vercel URL, so a redeploy updates installed phones ([DEPLOYMENT](docs/DEPLOYMENT.md)). Use
`dvh`, not `vh`. Pages portal by id into `#phone-screen`, `#phone-toast-root`,
`#phone-overlay-root`, `#modal-root` — all four must exist and **all four are `pointer-events:
none`**, so anything portalled in **must** set `pointer-events-auto` or it paints perfectly and
cannot be tapped (shipped three times, including an undismissable modal). **Overlays portal to a
root, never render inline**: `<main>` is `relative` and scrolls, so `absolute inset-0` resolves to
the top of the *content* — measured at −2000px on a scrolled list. `overscroll-behavior` stops
Chrome's pull-to-refresh reloading the TWA; `hooks/useLiveData.ts` keeps screens fresh instead.

### Styling and design system

**Full reference including the traps: [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).** The parts
you cannot afford to rediscover:
- **Admin is Tailwind v3** (no cascade layers). **Member is v4** with **no config file**: one was
  silently ignored, and classes defined only there emitted *no CSS* for months. **Unlayered author
  CSS beats every layer**, whatever the specificity.
- **If a class looks like it does nothing, it probably does nothing.** Verify against the built
  bundle, never the source — `npm run build`, then grep `dist/assets/*.css`.
- Tokens are CSS custom properties in each `src/index.css`. Never `brand-*`/`dark-*`.
  **Amber = primary action, violet = selection/structure. Type floor is 12px.** No greens or reds.
  Headings opt into `.display` (Anton, uppercase) — never globally. Primitives: member `Card`,
  `StepFlow`; admin `FormField`, `DatePicker`, `TimePicker`, `Popover` — reach for one first.
- **`requestAnimationFrame` does not fire on a page that isn't compositing** (background tab, locked
  phone, this harness), so anything that must be *correct* uses a CSS transition or `setTimeout`.
  Framer is decoration only. Corollary: **`AnimatePresence` never unmounts an exiting child there** —
  measured, an Escape-dismissed dialog animated to `opacity: 0` and stayed in the DOM forever, its
  invisible backdrop still eating every click. Put an always-mounted wrapper *outside*
  `AnimatePresence` and drive `pointer-events` off state, so a stuck node is inert, not a trap.
- Wrong twice each: **native pickers** (`color-scheme: dark` only — never `filter: invert(1)`),
  **focus rings**, **popovers inside scrolling modals**.

### Levels, achievements and what a trainer may see

**Two different levels exist and must be named apart on screen.** `experience_level` is
self-declared and drives class recommendations; the *earned* level comes from `member_progression()`
— labelling both "level" made Home and Book a Session look self-contradictory. **Grading lives in
SQL**: `sync_my_achievements()` is SECURITY DEFINER and the only writer of `achievement_unlocks`,
which has no INSERT policy — same shape as `activity_log` in 0037. **0038 moved the *catalogue*
into the `achievements` table** so the admin can add, edit and retire them; the evaluator loops over
it (`row_to_json(stats)->>metric`) instead of a 33-branch `if` ladder. Rules are `metric`, `manual`
(hand-awarded via admin-only `award_achievement()`) or `builtin` — only the two level badges, whose
thresholds must keep matching `level_thresholds()`. `src/data/achievements.ts` is now just the icon
registry; **`npm run check:achievements` must stay green** — it verifies stored icon and metric
names resolve. **Members choose what trainers see** (0032): `trainer_may_see()` gates measurements,
goals and workout logs in RLS, not the UI. Admin/staff ungated; default shared.

**The "AI" features are deterministic and rule-based, not model calls** — keep the vocabulary
honest. Admin [chatbot.ts](g-fitness-admin/src/data/chatbot.ts) plus `trainerChatbot.ts`/`memberAssistant.ts`;
the admin one answers from live data (`chatbotService`) and a missing value names the page that
sets it rather than guessing. **Test these regexes by running them:** `\bamenit\b` can never match
"amenities", `/hi/` matched "this"/"which"/"hindi", `/location/` never matched "Where are you
located?" — all three shipped.

## Conventions and docs

React 19 + React Router v7 + TypeScript, function components, default exports for pages/layouts.
Framer Motion for transitions; Recharts (admin only); Lucide for icons. Pages in `src/pages/`;
member app nests `pages/trainer/` and `pages/progress/`. Import alias `@/*` → `./src/*` in **admin
only**; the member app uses relative imports. Philippine context throughout: ₱ amounts,
Mamburao/Occidental Mindoro, `+63` numbers, cash-only payments by design. Legacy camelCase types
survive in `g-fitness-admin/src/types/`; new code uses `types/db.ts`.

[MIGRATION_STATUS](docs/MIGRATION_STATUS.md) (real vs mock, payment/QR semantics, progression) ·
[DATA_ACCESS](docs/DATA_ACCESS.md) (API layer, RLS testing, PostgREST traps) ·
[DESIGN_SYSTEM](docs/DESIGN_SYSTEM.md) · [DEPLOYMENT](docs/DEPLOYMENT.md) (Vercel, PWA, TWA) ·
[BUSINESS_MODEL](docs/BUSINESS_MODEL.md) · [supabase/README](supabase/README.md) (schema, functions,
VAPID) · `WHAT SHOULD BE IMPLEMENTED…txt` (panel feedback). Root-level `*.md` files, `README.md`
included, are presentation-facing or historical — **not specs**.

## Roadmap

**Backend/logic**, **the six panel features** and **design/frontend** are done — registration →
approval → payment → activation and the booking round trip verified by hand, admin dashboard
rebuilt page by page on real data. Outstanding:
- ~~0034–0038 unrun.~~ **All applied 2026-08-17**, verified two ways: the migration's own
  verification grid (33 achievements seeded, 5 badges kept, **0 orphaned unlocks**) and an
  independent PostgREST probe — every object that answered `PGRST205` now answers `200`.
  **0039 followed as a security fix** and is also applied. **`create-member` still needs
  redeploying** for its birth-date/gender half — the last outstanding backend task.
- **QR scan** — built, never tested on real hardware; the six-character code
  (`utils/checkInCode.ts`, first 6 hex of the member UUID, derived) is the fallback. **Staff
  approving registrations** needs an Edge Function (RLS won't let `staff` set `profiles.status`).
  Push is done — confirmed on a real Android phone 2026-08-17.

### Verifying work
**A green build proves nothing.** Every visual bug here — wrong cascade layer, focus ring resolving
white, dead classes emitting no CSS — compiled perfectly. Run `preview_start` and measure with
`getComputedStyle`. Pure functions can be imported into the dev server and *called*;
**components can too** — `createRoot` a scratch div and render them in a `MemoryRouter`, reaching
screens behind the login. Import deps from `/node_modules/.vite/deps/<name>.js?v=<hash>` using the
**exact** versioned URL the app's own modules use, or you get a second React instance and every
context throws. Clear stale probe nodes between runs — they poison `elementFromPoint` silently.
**SQL:** a throwaway `postgres:16-alpine` container as a **non-superuser**; when Docker will not
start, `npx pgsql-parser` checks top-level syntax and `language sql` bodies, but **plpgsql bodies
are opaque to it**. Say plainly what ran and what did not.
