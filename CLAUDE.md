# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Core Fitness is a gym management capstone for a real gym in Mamburao, Occidental Mindoro. It began
as a localStorage prototype; **that migration is complete** — everything runs on Supabase, free
tier. Two independent Vite apps:

| App | Directory | Port | Target |
|-----|-----------|------|--------|
| Admin dashboard | `g-fitness-admin/` | 5174 | Desktop web, runs locally |
| Member + Trainer app | `g-fitness-member/` | 5173 | Installable phone app (PWA → Android APK) |

Not a monorepo — no workspaces, no shared package. Each has its own `package.json`, tsconfig,
ESLint and Tailwind setup; run `npm` from inside the app directory. `supabase/` holds 35 SQL
migrations, RLS policies and four Edge Functions (`create-trainer`, `create-member`,
`create-staff`, `send-push`) — [supabase/README.md](supabase/README.md) covers setup and secrets.

## Commands

```bash
cd g-fitness-admin && npm install && npm run dev    # → localhost:5174
```
```bash
cd g-fitness-member && npm install && npm run dev   # → localhost:5173
```

- `npm run build` — `tsc -b && vite build`. Both build clean. Both tsconfigs set `noUnusedLocals`/
  `noUnusedParameters`, so **an unused import fails the build** though `npm run dev` is happy.
- `npm run lint` — flat-config ESLint. `npm run preview` — serve the production build.
- `npm run check:achievements` (member) — diffs the SQL earning rules against the TS catalogue.
- No test framework. Verify in the browser, by REST call, or — for SQL — in a throwaway
  `postgres:16-alpine` container with stubbed `auth.uid()`, asserting in a `do $$ … $$` block.
- Both apps need `.env.local` (copy `.env.example`). Deploy member with
  `npx vercel deploy --prod --yes`; env vars must exist in Vercel *before* deploying — Vite inlines
  them. Details: [DEPLOYMENT](docs/DEPLOYMENT.md).

## Data honesty — read this before touching a page

**Full audit: [docs/MIGRATION_STATUS.md](docs/MIGRATION_STATUS.md).** Nearly every page is
Supabase-backed. **"No mock data remains" was claimed twice and was wrong twice** — member Events
carried six invented 2024 events until it was opened and compared against the admin's "No events
yet", and the **admin chatbot still quotes ₱800/₱1,500/₱2,500 plans that exist nowhere in the
database**. Grep does not find these; opening the page does.

Six rules that keep getting violated:
- Members are **archived, never deleted**.
- Analytics return **zero, never a plausible invention**.
- A missed lookup renders **nothing, never a hardcoded fallback identity** — member Profile once
  shipped `<img src="/eya.png">`, so every member saw one real person's face on their own profile.
- Payments distinguish **`paid_on` from `created_at`**, and members store a **birth date, not an
  age** — a derived number cannot go stale, a stored one silently does.
- **Calendar dates come from `utils/dates.ts`, never `toISOString()`.** Manila is UTC+8, so the
  UTC date is yesterday for the first eight hours of every local day — which hid every pre-8am
  check-in from the admin Attendance page and from its duplicate guard.
- **A control that writes a flag nothing reads is a lie.** Wire it to something observable, or cut.
- **Per-user state never lives in `localStorage`.** Onboarding completion and achievement
  celebrations both did, so both replayed on every new browser, phone or reinstall.
- **A reward the client can grant itself is not a reward.** Badges were deleted once for having no
  earning rules; those rules now live in SQL, where a browser cannot reach them.

The mock data hid in *chrome*, not pages — the notification bell, a shared modal, a boot-time
re-seed in `main.tsx`. When auditing, grep layouts and shared modals, not just `pages/`.

## Architecture

### Auth and routing (real Supabase Auth)

`profiles.role` (`admin`/`staff`/`trainer`/`member`) and `profiles.status` (`active`/
`pending_approval`/`suspended`/`archived`) are the source of truth — not localStorage flags.
**`staff`** is a front-desk role (0011/0012): payments, check-ins and membership extensions, but
not plan pricing, trainers, accounts or settings — everything staff can do is a recorded,
reversible transaction. `<ProtectedRoute adminOnly>` is convenience; **RLS is the boundary.** The
member app also caches a legacy user object into `localStorage['user']`/`isLoggedIn`/`trainerMode`
for the ~6 pages still reading `getCurrentUser()` — never treat those as real auth state.

Self-registration goes through `handle_new_member_signup` (trigger on `auth.users`, `0005`), not a
client insert: with email confirmation on, `signUp()` returns no session to insert with. Also note
`signUp` does **not** error on a duplicate email — it returns a user with empty `identities`.

### The data-access layer: `src/lib/api/*.ts`

One module per table, **mostly byte-identical between both apps** — no shared workspace, so a fix
in one must be copied to the other, typed against `src/types/db.ts` (byte-identical, snake_case).
RLS enforces authorization; the API layer does not duplicate it. **Diff before you copy** —
`notify.ts` legitimately differs, and these files are untracked, so an overwrite is unrecoverable.

**Never `.insert().select()` a row you are not allowed to read.** It compiles to
`INSERT … RETURNING`, so PostgreSQL checks the **SELECT** policy on the new row too and fails with
`42501` naming the *insert*. Drop `.select()` only where the writer isn't the row's owner.
Conversely, **`.update()` on a row that doesn't exist is not an error** — it reports success and
writes nothing, which silently discarded every onboarding experience level ever collected.
Self-updates carry `.select()` so a zero-row write throws.

**Test RLS as a non-superuser role.** A table owner bypasses RLS, so policy assertions run as
`postgres` pass whether or not the policy works.

Above them sit per-app **services** that assemble screens from several API calls and enforce the
honesty rule — `dashboardService` (admin), `trainerService`/`bookingService`/`memberHomeService`
(member). Put multi-table screen assembly in a service, not a component.

### Notifications and web push

Two channels, deliberately unequal. The `notifications` row is the **record** and is always
awaited; the push is the **alert** — fire-and-forget, never allowed to throw, because a booking
must not fail to approve over an uninstalled app (`lib/api/notify.ts`). **Preferences gate
delivery, never the record.** **Push needs HTTPS — never testable on `http://localhost`.**

The bell is a worktray (0029): swipe left sets `cleared_at` (out of the bell, still in the list),
swipe right sets `archived_at`, and a member DELETEs only from `/{member,trainer}/notifications`,
behind a multi-select. **The desk can delete anyone's rows only since 0034** — that is what the
admin Notifications "Recall" button needs, and without it the DELETE matched nothing and reported
success, because a zero-row DELETE is no more an error than a zero-row UPDATE. Table: [MIGRATION_STATUS](docs/MIGRATION_STATUS.md#notifications-as-an-inbox-0029).

**Training plans (0030)** are the one server-scheduled thing here: pg_cron calls
`send_due_gym_reminders()`, which writes a row only if the planned time has passed, within three
hours, and the member has not checked in. pg_cron is **optional** — the migration degrades and the
Home card carries the feature alone, so check `select * from cron.job;` before believing it is live.

### Mobile shell — always full-screen

[PhoneChassis.tsx](g-fitness-member/src/components/layout/PhoneChassis.tsx) fills the viewport via
`100dvh` + safe-area insets. **There is no decorative phone frame** — it ships as a real Android
app via a PWABuilder **TWA** loading the live Vercel URL, so a redeploy updates installed phones
([DEPLOYMENT](docs/DEPLOYMENT.md)). Use `dvh`, not `vh`. All three shells — `Layout`,
`MobileFrame`, `TrainerLayout` — delegate to it. Content scrolls inside `<main>`, not the page.

Pages portal by id into `#phone-screen`, `#phone-toast-root`, `#phone-overlay-root`,
`#modal-root` — all four must exist. **Those roots are `pointer-events: none`** (they cover the
screen and would otherwise eat every tap), so anything portalled in **must** set
`pointer-events-auto` on its own container. Forget it and the overlay paints perfectly and cannot
be clicked — which shipped three times in one session, including an undismissable modal.

### Styling and design system

**Full reference, including the traps: [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).** The parts
you cannot afford to rediscover:

- **Admin is Tailwind v3** (no cascade layers). **Member is v4** with **no config file**: one was
  silently ignored, and classes defined only there emitted *no CSS* for months. **Unlayered author
  CSS beats every layer**, whatever the specificity.
- **If a class looks like it does nothing, it probably does nothing.** Verify against the built
  bundle, never the source — `npm run build`, then grep `dist/assets/*.css`.
- Tokens are CSS custom properties in each `src/index.css`. Never `brand-*`/`dark-*`.
- **Amber = primary action, violet = selection/structure. Type floor is 12px.** Headings opt into
  `.display` (Anton, uppercase) — never globally.
- Primitives live in `g-fitness-member/src/components/ui/`; `Card` (`panelStyle`) and
  [StepFlow](g-fitness-member/src/components/ui/StepFlow.tsx) matter most — reach for one first.
- **Focus rings are unlayered in member, `:not(:focus-visible)`-scoped in admin.** Both were got
  wrong twice; the reasoning is commented in both `index.css` files. An **inline** border/outline
  outranks every stylesheet rule, so a `:focus-within` colour on that element can never apply.
- **`requestAnimationFrame` does not fire on a page that isn't compositing** (background tab, locked
  phone, this harness's browser pane). Anything that must be *correct* — a dismissal, a progress
  bar's final width — uses a CSS transition or `setTimeout`. Framer Motion is for decoration only.

### Levels, achievements and what a trainer may see

**Two different levels exist and must be named apart on screen.** `experience_level` is
self-declared and drives class recommendations; the *earned* level comes from
`member_progression()` and counts only what this gym recorded. Neither overwrites the other, and
labelling both "level" is what made Home and Book a Session look self-contradictory.

**Earning rules live in SQL** (0028): `sync_my_achievements()` is SECURITY DEFINER and the only
thing that can write `achievement_unlocks`, which has no INSERT policy — so a badge cannot be
granted from a browser. `src/data/achievements.ts` is presentation only, joined by a string key
nothing type-checks; **`npm run check:achievements` must stay green.**

**Members choose what trainers see** (0032) — `trainer_may_see()` gates measurements, goals and
workout logs in RLS, not in the UI. Admin/staff are deliberately ungated; default is shared.
Rationale for all three: [MIGRATION_STATUS](docs/MIGRATION_STATUS.md).

### "AI" features

Deterministic and rule-based, not model calls: admin
[chatbot.ts](g-fitness-admin/src/data/chatbot.ts) (regex, bilingual EN/Fil),
[trainerChatbot.ts](g-fitness-member/src/data/trainerChatbot.ts) and
[memberAssistant.ts](g-fitness-member/src/data/memberAssistant.ts). Keep the vocabulary honest —
rule-based, not ML. Test these regexes by **running** them: `\bamenit\b` can never match
"amenities", and that shipped.

## Conventions

- React 19 + React Router v7 + TypeScript, function components, default exports for pages/layouts.
- Pages in `src/pages/`; member app nests `pages/trainer/` and `pages/progress/`.
- Framer Motion for transitions; Recharts (admin only); Lucide for icons.
- Import alias `@/*` → `./src/*` in **admin only**; member app uses relative imports.
- Philippine context throughout: ₱ amounts, Mamburao/Occidental Mindoro, `+63` numbers. Cash-only
  payments by design. Never `toISOString()` for a calendar date — it shifts to UTC.
- Legacy camelCase `Member`/`EditMemberData`/`NewMemberData` types survive in
  `g-fitness-admin/src/types/`. New code uses `src/types/db.ts`; don't merge the two systems.

## Docs

[MIGRATION_STATUS](docs/MIGRATION_STATUS.md) (real vs mock, payment/QR semantics, progression) ·
[DESIGN_SYSTEM](docs/DESIGN_SYSTEM.md) · [BUSINESS_MODEL](docs/BUSINESS_MODEL.md) ·
[DEPLOYMENT](docs/DEPLOYMENT.md) · [supabase/README](supabase/README.md) (schema, functions,
VAPID) · `WHAT SHOULD BE IMPLEMENTED IN THE SYSTEM.txt` (panel feedback). `README.md` and other
root-level `*.md` files are presentation-facing or historical — not specs.

## Roadmap

**Backend/logic** and **the six panel features** are done — 34 migrations, registration → approval
→ payment → activation and the booking round trip verified by hand. **Design/frontend** is largely
rebuilt on the new primitives.

### Outstanding

- **Migrations 0028–0035 have not been run** against the live project. **0034 is what makes the
  admin Notifications "Recall" button work** — without it the delete matches no rows and, since a
  zero-row DELETE is not an error, it would report success; the client now throws instead. **0035**
  is the same story for undoing a check-in. All were verified on a
  throwaway Postgres 16 with fixtures, but the RPCs have never been called through PostgREST and
  no reminder has reached a real member. The walk-in form now collects birth date and gender, but
  **`create-member` must be redeployed** for its half to take effect (the admin writes them again
  from the client so they land either way).
- **Push has never reached a device.** Every piece is deployed and verified present.
  `VAPID_PRIVATE_KEY` was pasted wrong once (the whole JSON file instead of the value) and its
  replacement was never verified — if wrong, rows write fine and pushes fail silently.
- **QR scan** — compact format built, never tested on real hardware. The six-character code
  (`utils/checkInCode.ts`, first 6 hex of the member UUID, derived not stored) is the fallback.
- **Staff approving registrations** — needs an Edge Function; it flips `profiles.status`, which
  RLS won't let `staff` do directly. The member app is also **well behind on Vercel**, and the
  bundle is ~1 MB in one chunk.

### Verifying UI work

**Build success proves nothing about rendering.** Every visual bug this project has hit — wrong
cascade layer, focus ring resolving white, dead classes emitting no CSS, an inline border beating
its own focus rule — compiled perfectly. Use `.claude/launch.json` (`preview_start`) and measure
with `getComputedStyle`. Most member screens sit behind a login: **say plainly what was seen.**
