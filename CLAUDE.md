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
ESLint and Tailwind setup; run `npm` from inside the app directory. `supabase/` holds 36 SQL
migrations, RLS policies and four Edge Functions (`create-trainer`, `create-member`, `create-staff`,
`send-push`) — [supabase/README.md](supabase/README.md) covers setup and secrets.

## Commands

```bash
(cd g-fitness-admin  && npm install && npm run dev)   # → localhost:5174
(cd g-fitness-member && npm install && npm run dev)   # → localhost:5173
```

- `npm run build` — `tsc -b && vite build`. Both build clean. Both tsconfigs set `noUnusedLocals`/
  `noUnusedParameters`, so **an unused import fails the build** though `npm run dev` is happy.
- `npm run lint` (flat-config ESLint) · `npm run preview` · `npm run check:achievements` (member,
  diffs the SQL earning rules against the TS catalogue).
- No test framework. Verify in the browser, by REST call, or — for SQL — in a throwaway
  `postgres:16-alpine` container as a **non-superuser** ([DATA_ACCESS](docs/DATA_ACCESS.md)).
- Both apps need `.env.local` (copy `.env.example`). Deploy member by promoting a verified preview,
  never straight to prod; env vars must exist in Vercel *before* deploying — Vite inlines them.
  Commands and the post-deploy checklist: [DEPLOYMENT](docs/DEPLOYMENT.md).

## Data honesty — read this before touching a page

**Full audit: [docs/MIGRATION_STATUS.md](docs/MIGRATION_STATUS.md).** Every page is Supabase-backed.
**"No mock data remains" was claimed twice and was wrong twice** — member Events carried six
invented 2024 events, and the admin chatbot answered from three gyms that do not exist, four
invented coaches, three invented phone numbers and invented prices. Grep found neither; opening the
page did. The rules that keep getting violated:
- Members are **archived, never deleted**; analytics return **zero, never a plausible invention**.
- A missed lookup renders **nothing, never a hardcoded fallback identity** — member Profile once
  shipped `<img src="/eya.png">`, so every member saw a real person's face on their own profile.
- Payments distinguish **`paid_on` from `created_at`**, and members store a **birth date, not an
  age** — a derived number cannot go stale, a stored one silently does.
- **Calendar dates come from `utils/dates.ts`, never `toISOString()`.** Manila is UTC+8, so the UTC
  date is yesterday for the first eight hours of every local day — which hid every pre-8am check-in
  from the admin Attendance page and from its own duplicate guard.
- **A control that writes a flag nothing reads is a lie.** Wire it to something observable, or cut.
  The whole Gym Information form was write-only from 0013 until receipts and Schedule read it.
- **Per-user state never lives in `localStorage`** — *and moving it to a column is not the fix
  unless the row exists when the write runs.* 0033 moved onboarding completion to `member_profiles`
  and it still replayed on every device, because that row was created at approval and onboarding
  runs first (0036).
- **A reward the client can grant itself is not a reward.** Badge rules live in SQL.

The mock data hid in *chrome*, not pages — the notification bell, a shared modal, a boot-time
re-seed in `main.tsx`. When auditing, grep layouts and shared modals, not just `pages/`.

## Architecture

### Auth and routing — real Supabase Auth

`profiles.role` (`admin`/`staff`/`trainer`/`member`) and `profiles.status` (`active`/`pending_approval`/`suspended`/`archived`) are the source of truth — not localStorage flags.
**`staff`** is a front-desk role (0011/0012): payments, check-ins and membership extensions, but not
plan pricing, trainers, accounts or settings — everything staff can do is a recorded, reversible
transaction. `<ProtectedRoute adminOnly>` is convenience; **RLS is the boundary.** The member app
also caches a legacy user object into `localStorage['user']`/`isLoggedIn`/`trainerMode` for the ~6
pages still reading `getCurrentUser()` — never treat those as real auth state.

### The data-access layer

`src/lib/api/*.ts`, one module per table, typed against `src/types/db.ts`; per-app **services**
above them assemble whole screens — put multi-table assembly in a service, not a component. Most
modules exist twice, once per app: **diff before you copy**, `notify.ts` differs on purpose.
**[docs/DATA_ACCESS.md](docs/DATA_ACCESS.md) lists every trap that has cost time here**, above all
that a **zero-row `UPDATE`/`DELETE` is not an error** — it reports success and writes nothing.

### Notifications and web push

Two channels, deliberately unequal. The `notifications` row is the **record** and is always
awaited; the push is the **alert** — fire-and-forget, never allowed to throw, because a booking must
not fail to approve over an uninstalled app (`lib/api/notify.ts`). **Preferences gate delivery,
never the record.** **Push needs HTTPS — never testable on `http://localhost`.**

The bell is a worktray (0029) — swipe clears, swipe archives, delete only behind a multi-select on
`/{member,trainer}/notifications`; **the desk can delete anyone's rows only since 0034**, which the
admin "Recall" button needs. State table:
[MIGRATION_STATUS](docs/MIGRATION_STATUS.md#notifications-as-an-inbox-0029).

**Training plans (0030)** are the one server-scheduled thing here: pg_cron calls
`send_due_gym_reminders()`, which writes a row only if the planned time has passed, within three
hours, and the member has not checked in. pg_cron is **optional** — check `cron.job` first.

### Mobile shell — always full-screen

[PhoneChassis.tsx](g-fitness-member/src/components/layout/PhoneChassis.tsx) fills the viewport via
`100dvh` + safe-area insets. **There is no decorative phone frame** — it ships as a real Android
app via a PWABuilder **TWA** loading the live Vercel URL, so a redeploy updates installed phones
and the APK only needs rebuilding if the name, icon, package ID, `start_url` or `scope` changes
([DEPLOYMENT](docs/DEPLOYMENT.md)). Use `dvh`, not `vh`. All three shells — `Layout`,
`MobileFrame`, `TrainerLayout` — delegate to it; content scrolls inside `<main>`, not the page.
Pages portal by id into `#phone-screen`, `#phone-toast-root`, `#phone-overlay-root` and
`#modal-root` — all four must exist, and **all four are `pointer-events: none`**, so anything
portalled in **must** set `pointer-events-auto` on its own container or it paints perfectly and
cannot be tapped. That shipped three times in one session, including an undismissable modal.
**An overlay must portal to one of those roots, never render inline**: `<main>` is `relative` and
scrolls, so `absolute inset-0` inside a page resolves to the top of the *content*, not the screen —
measured at −2000px on a scrolled list. `overscroll-behavior` on the shell is what stops Chrome's
pull-to-refresh reloading the whole TWA; screens stay fresh via `hooks/useLiveData.ts` instead.

### Styling and design system

**Full reference including the traps: [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).** The parts you cannot afford to rediscover:
- **Admin is Tailwind v3** (no cascade layers). **Member is v4** with **no config file**: one was
  silently ignored, and classes defined only there emitted *no CSS* for months. **Unlayered author
  CSS beats every layer**, whatever the specificity.
- **If a class looks like it does nothing, it probably does nothing.** Verify against the built
  bundle, never the source — `npm run build`, then grep `dist/assets/*.css`.
- Tokens are CSS custom properties in each `src/index.css`. Never `brand-*`/`dark-*`.
- **Amber = primary action, violet = selection/structure. Type floor is 12px.** No greens or reds.
  Headings opt into `.display` (Anton, uppercase) — never globally.
- Primitives: member in `g-fitness-member/src/components/ui/` (`Card`, `StepFlow`); admin has
  `FormField`, `DatePicker`, `TimePicker`, `Popover`. Reach for one before writing a new field.
- **`requestAnimationFrame` does not fire on a page that isn't compositing** (background tab, locked
  phone, this harness's browser pane), so anything that must be *correct* uses a CSS transition or
  `setTimeout`. Framer Motion is for decoration only.
- Documented there and got wrong twice each: **native pickers** (`color-scheme: dark` only — never
  `filter: invert(1)` on top), **focus rings**, **popovers inside scrolling modals**.

### Levels, achievements and what a trainer may see

**Two different levels exist and must be named apart on screen.** `experience_level` is
self-declared and drives class recommendations; the *earned* level comes from `member_progression()`.
Labelling both "level" made Home and Book a Session look self-contradictory.

**Earning rules live in SQL** (0028): `sync_my_achievements()` is SECURITY DEFINER and the only
thing that can write `achievement_unlocks`, which has no INSERT policy — so a badge cannot be
granted from a browser. `src/data/achievements.ts` is presentation only, joined by a string key
nothing type-checks — **`npm run check:achievements` must stay green.** And **members choose what
trainers see** (0032): `trainer_may_see()` gates measurements, goals and workout logs in RLS, not
in the UI. Admin/staff are deliberately ungated; default is shared.

### "AI" features

Deterministic and rule-based, not model calls — keep the vocabulary honest. Admin
[chatbot.ts](g-fitness-admin/src/data/chatbot.ts) plus the member app's `trainerChatbot.ts` and
`memberAssistant.ts`. The admin one answers from live data (`chatbotService`); a missing value
names the page that sets it and never guesses. **Test these regexes by running them:** `\bamenit\b`
can never match "amenities", `/hi/` matched "this"/"which"/"hindi", and `/location/` never matched
"Where are you located?" — all three shipped.

## Conventions

- React 19 + React Router v7 + TypeScript, function components, default exports for pages/layouts.
  Framer Motion for transitions; Recharts (admin only); Lucide for icons.
- Pages in `src/pages/`; member app nests `pages/trainer/` and `pages/progress/`. Import alias
  `@/*` → `./src/*` in **admin only**; the member app uses relative imports.
- Philippine context throughout: ₱ amounts, Mamburao/Occidental Mindoro, `+63` numbers. Cash-only
  payments by design. Never `toISOString()` for a calendar date — it shifts to UTC.
- Legacy camelCase types survive in `g-fitness-admin/src/types/`; new code uses `types/db.ts`.

## Docs

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

- **0034, 0035 and 0036 have not been run** (0028–0033 were verified present on 2026-08-17 by
  probing PostgREST). Without 0034/0035, Notifications → Recall and Attendance → Undo match no rows
  and the clients throw. **0036 matters most**: it creates the member row at sign-up, which is what
  stops onboarding replaying, and backfills existing members. Both apps degrade without it.
  **`create-member` also needs redeploying** for its birth-date/gender half.
- ~~Push has never reached a device.~~ **Confirmed delivering to a real Android phone on
  2026-08-17**, so `VAPID_PRIVATE_KEY` is right and the whole chain works end to end.
- **QR scan** — built, never tested on real hardware; the six-character code
  (`utils/checkInCode.ts`, first 6 hex of the member UUID, derived) is the fallback. **Staff
  approving registrations** needs an Edge Function (RLS won't let `staff` set `profiles.status`).

### Verifying UI work

**Build success proves nothing about rendering.** Every visual bug here — wrong cascade layer,
focus ring resolving white, dead classes emitting no CSS, an inline border beating its own focus
rule — compiled perfectly. Use `.claude/launch.json` (`preview_start`) and measure with
`getComputedStyle`; pure functions can be imported into the running dev server and *called*, which
is how the regexes and clash detectors were checked. Most screens sit behind a login the harness
cannot pass: **say plainly what was seen and what was not.**
