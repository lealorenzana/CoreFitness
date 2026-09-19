# SaaS Part B — Gym-Aware Apps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Both apps know which gym they are in: a person picks their gym, signs up into a chosen
gym, sees that gym's name, logo and colour, and every screen reads roles and statuses *in that
gym*; the admin app goes online on Vercel.

**Architecture:** One RPC, `my_gym_context()`, answers "who am I, where" for both apps (gym, role
and status there, branding, lock reason) and replaces every `profiles.role/status` read in the
gates. One view, `gym_people`, is `profiles` with the per-gym `role`/`status` in place of the legacy
columns, so list screens swap a table name and keep their filters. The Edge Functions create
accounts in the caller's gym through a new RPC. A clean-up migration then drops Part A's
transition leftovers.

**Tech Stack:** Postgres (0104–0105), React 19 + Vite (both apps), Supabase Edge Functions (Deno),
Vercel, Playwright fixture checks, pglite harness.

**Spec:** [multi-tenant SaaS design](../specs/2026-09-20-multi-tenant-saas-design.md) · builds on
[Part A](2026-09-20-saas-part-a-tenancy.md) and [TENANCY](../../TENANCY.md).

## Global Constraints

- Migrations pasted by hand, one at a time, each with `migration_NNNN_applied()`, a probe entry and a
  read-only `verifyNNNN.sql`. Rules R1–R5 of [TENANCY](../../TENANCY.md) apply to every function.
- **Nothing that works today may stop working.** Today's single-gym users see no picker and no
  new step; the picker appears only for someone with two or more gyms.
- A gym's accent replaces violet only; amber stays "what you can do next". Every accent's text
  shade meets 4.5:1 on the Nocturne background (checked in the task, not assumed).
- Per-user caches are memory-only and cleared in `logout()` (CLAUDE.md).
- Edge Functions are pasted by the user in the Supabase dashboard (no CLI login in this session).
- A list is still "preview + SeeAll to its own page"; no redundant or bottom-only buttons.
- Every fixture check (12) stays green; new behaviour gets its own check.
- Commit trailer: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

### Task 1: 0104 — `my_gym_context()`, `gym_people`, `add_person_to_gym()`

**Files:** Create `supabase/migrations/0104_gym_context.sql`, `scripts/sql/verify/verify0104.sql`;
modify `scripts/sql/tenancy-isolation.mjs`, `scripts/probe-migrations.py`.

**Produces:**
- `my_gym_context() → table(gym_id uuid, gym_name text, slug text, role user_role, status text,
  lock_reason text, short_name text, logo_url text, accent text, gym_count int)` — one row for the
  caller's current gym, none when they have no gym.
- view `gym_people` (security_invoker): every `profiles` column except `role`/`status`, then
  `role` and `status` from `gym_roles` in the current gym, `gym_id`, `joined_at`.
- `add_person_to_gym(p_user uuid, p_role user_role, p_status text default 'active') → void` — the
  caller must be admin (or front desk for `member`) of their current gym; inserts `gym_roles` and the
  member/trainer profile row there; sets `profiles.active_gym_id` when it is null.
- `set_gym_role(p_user uuid, p_role user_role) → void` — admin only, this gym only.

- [ ] Harness checks: context row for a one-gym admin, a two-gym member (gym_count 2), nobody for
  the outsider; `gym_people` in Gym B lists Gym B's roles and a two-gym person with their Gym B
  role; `add_person_to_gym` by Gym A's admin lands in Gym A only, refused for staff adding a
  trainer, refused for a member; `set_gym_role` cannot touch another gym.
- [ ] Write 0104; harness green; rule scripts green; verify0104 (context row for Gym #1 exists
  for every active account); probe; commit.

### Task 2: Member app — gym context, gate, picker, Switch gym

**Files:** Create `g-fitness-member/src/lib/gymContext.ts`, `src/pages/ChooseGym.tsx`; modify
`src/App.tsx` (RoleProtectedRoute, LoginRoute), `src/utils/auth.ts` (login, logout),
`src/lib/memberNav.ts` / `trainerNav.ts` (More: Switch gym), `src/lib/lazyPage.ts`.

- `gymContext.ts`: `getGymContext(force?)` (memory cache, cleared on logout), `myGyms()`,
  `switchGym(id)` (`set_active_gym`, then reload so every cache refills), `joinGym(id)`.
- Gate: `role`/`status` from `my_gym_context`; a person whose current gym is not usable (pending,
  suspended, archived, or no gym) but who is active in another goes to `/choose-gym`.
- Login: after sign-in, `my_gyms()`; two or more usable gyms → `/choose-gym` with the current one
  highlighted; one → straight in (today's behaviour).
- `/choose-gym`: rows (logo, name, your role there, status), tap = switch; "Join another gym"
  opens the gym list (Task 3). Reached from More → **Switch gym** too.
- [ ] Fixture check `gym-picker-check.js`: one-gym member goes straight in; two-gym member sees
  the picker, switches, and the header shows the other gym's name; add to `ui-checks.json`.
- [ ] Update every existing fixture's network mocks with `rpc/my_gym_context` (and `my_gyms`) so
  the 12 checks stay green; commit.

### Task 3: Member app — sign up into a chosen gym, join links

**Files:** modify `src/pages/Register.tsx`, `src/lib/api/members.ts` (signUp metadata `gym_id`),
create `src/components/ui/GymListSheet.tsx` (replaces the dead `GymSelectionSheet.tsx` and
`data/gyms.ts`), route `/join/:slug` in `App.tsx`.

- Register's first step is "Your gym": a searchable list from `list_gyms()`; `/join/<slug>` arrives
  with it chosen. The plan choice lists that gym's plans. Sign-up sends `gym_id`.
- A signed-in person uses the same sheet via "Join another gym" → `request_to_join`.
- [ ] Fixture check `signup-gym-check.js` (list, search, join link preselects, metadata carries the
  gym); commit.

### Task 4: Member app — the gym's brand on screen, and the lock notice

**Files:** create `src/lib/gymTheme.ts`; modify `src/components/layout/Layout.tsx`, the headers
that show the gym name/logo, `index.html` untouched (launcher/splash stay Core Fitness).

- `gymTheme.ts`: 8 accents → the `--color-primary*` token set; applied on context load, reset on
  logout. Contrast of each `-300` text shade against `#0B0B12` asserted in a script.
- Lock notice: when `lock_reason` is set, a banner on Today/More says the gym is read-only and why.
- [ ] Fixture check: a teal gym renders teal tokens; a suspended gym shows the notice; commit.

### Task 5: Member app — per-gym roles in queries, per-gym upserts

**Files:** `src/lib/api/notifications.ts` (audiences → `gym_people`), `pages/trainer/TrainerMembers.tsx`,
`lib/api/members.ts`/`trainers.ts` (embedded status → `gym_people`), `lib/api/progress.ts`,
`sharePrefs.ts`, `trainerRatings.ts` (`onConflict` includes `gym_id`).
- [ ] tsc, build, all fixture checks; commit.

### Task 6: Admin app — gym context, gate, picker, Branding, lock notice

**Files:** create `g-fitness-admin/src/lib/gymContext.ts`, `src/pages/ChooseGym.tsx`; modify
`components/ProtectedRoute.tsx`, `pages/AdminLogin.tsx`, `components/layout/Sidebar.tsx`,
`components/ui/CashCloseout.tsx`, `components/layout/Header.tsx`; delete `hooks/useGymContext.tsx`
and `data/gyms.ts` (the prototype fixture); Settings → **Branding** (accent picker beside the
existing logo, name, tagline; saved to `gym_settings.accent`).
- [ ] Fixture check `admin-gym-check.js`; existing admin checks' mocks gain the context RPC; commit.

### Task 7: Admin app — per-gym roles in every query

**Files:** `services/dashboardService.ts`, `services/searchService.ts`, `lib/api/profiles.ts`,
`settings.ts`, `achievements.ts`, `notifications.ts`, `members.ts`, `trainers.ts`,
`pages/Notifications.tsx`; role changes go through `set_gym_role`, status through
`set_account_status`.
- [ ] `grep` shows no `.from('profiles')` filtering on `role`/`status` left in either app; admin sweep
  and all checks green; commit.

### Task 8: Edge Functions create accounts in the caller's gym

**Files:** `supabase/functions/create-member|create-staff|create-trainer/index.ts`.
- Caller's role from `my_gym_context` (callerClient); after creating the auth user with the service
  key, the profile gets `active_gym_id` = caller's gym and `add_person_to_gym` runs **as the caller**.
- [ ] The user pastes the three functions in the dashboard; commit.

### Task 9: Admin app on Vercel

- `g-fitness-admin/vercel.json` (SPA rewrite, no caching of `index.html`), new Vercel project
  `corefitness-admin`, env vars before the first deploy (Vite inlines them), deploy + promote,
  `verify-deploy.py` against it. Supabase Auth → URL configuration gets the new origin.
- [ ] DEPLOYMENT.md updated; commit.

### Task 10: 0105 — clean-up, docs, ship

- 0105: drop the three `*_transition` keys and the mirror trigger and `active_gym_id` default
  (only after Tasks 5–9 are live). Harness updated (two-gym measurements/ratings/share prefs).
- Deploy the member app; paste 0104 before, 0105 after; TENANCY/CLAUDE.md/MIGRATION_STATUS; commit.
