# Tenancy — one database, many gyms (0097–0103)

Core Fitness is a service for many gyms. This is how the database keeps them apart, what was
deliberately *not* made per gym, and how to change anything here without opening a leak.
Spec: [multi-tenant SaaS design](superpowers/specs/2026-09-20-multi-tenant-saas-design.md) ·
Plan: [Part A](superpowers/plans/2026-09-20-saas-part-a-tenancy.md).

## The model

- **A person is global, a role is per gym.** `profiles` holds identity; `gym_roles(gym_id,
  user_id, role, status)` holds what they are *in each gym*. One person can be a member at one
  gym and a coach at another. `profiles.role`/`status` are **legacy**, kept only for today's apps
  and mirrored into `gym_roles` (`trg_mirror_profile_role`) until Part B moves the apps.
- **The current gym** is `profiles.active_gym_id`, changed only by `set_active_gym(gym)`, which
  refuses a gym where the caller holds no role. `current_gym_id()` returns it — and returns NULL
  the moment they lose their role there. **`get_my_role()` means "my role in my current gym"**:
  every policy and function that called it became gym-aware in 0097 without being touched.
- **Gym #1** is `gym_one()` (`c0f1e55e-…0001`, slug `core-fitness`): everything that existed before.
- **51 tables carry `gym_id`**, listed once in `tenancy_gym_tables()`. Global: `profiles`,
  `push_subscriptions`, `notification_prefs`, `features`, `achievement_metrics`. Library
  (`gym_id` NULL = shared): `exercises`, `workout_resources`. Platform log (NULL = before sign-in):
  `client_errors`. `tenancy-isolation.mjs` fails if a new table is in neither list.

## Three layers

1. **Keys and references (0098).** Every key that was per-person or per-name includes `gym_id`
   (`member_profiles` is `(gym_id, profile_id)`, `point_rules` is `(gym_id, key)`, invoice numbers
   restart per gym per year), and **every foreign key between two gym tables is `(gym_id, x)`** —
   the database itself refuses a Gym B booking of a Gym A class, whatever the app sends.
2. **The same-gym layer (0099).** Four `RESTRICTIVE` policies per gym table (`tenant_select` …
   `tenant_delete`) require `gym_id = current_gym_id()`; writes also need `gym_writable()`.
   Restrictive policies are ANDed with the permissive ones, so the ~180 older rules keep their
   meaning and stop at the gym's edge. Profiles, push subscriptions and preferences are visible
   only within a shared gym (`same_gym_person`). Views that run as their owner filter to the
   current gym themselves.
3. **SECURITY DEFINER functions (0100–0103).** They run as the owner and skip RLS, so each one
   that reads or writes a gym's rows was rewritten from its last definition to stay in one gym.

**Read-only when locked:** a suspended gym, or one more than 7 days past `paid_until`, reads and
exports but cannot write (`gym_lock_reason()` says which, for the apps to show).

## The acting gym — how system code says which gym

`gym_id` defaults to `acting_gym_id()`: the gym system code set for this transaction
(`act_as_gym(g)`, owner-only), else the caller's current gym, else — **only while exactly one gym
exists** — that gym. The last fallback keeps pg_cron and today's Edge Functions working in the
window between pasting 0098 and 0103; from the second gym on, code with no caller **must** name
its gym or its insert fails on NOT NULL (loudly, never into a guessed gym). Policies check
`current_gym_id()`, never the acting gym, so a client gains nothing from it.

## Rules for any function you write or change

- **R1 One gym.** A trigger starts with `perform act_as_gym(new.gym_id)` so everything it calls
  (plan checks, balances, the notifications it files) resolves there. A member-keyed reader
  filters `gym_id = acting_gym_id()`. A function handed an id refuses another gym's with
  `in_my_gym(row.gym_id)` — true for system callers, else only for the caller's current gym.
- **R2 Explicit writes.** An insert in system code names `gym_id` (or runs under `act_as_gym`).
- **R3 Roles are per gym.** Another person's role or status comes from `gym_roles` in that gym
  (`role_in_gym(g)` for the caller) — never `profiles.role`/`status`. "Every active admin" is
  `gym_roles where gym_id = g and role = 'admin' and status = 'active'`.
- **R4 Sweeps.** pg_cron (no caller) runs every active gym; a signed-in caller's page-load run
  covers their gym only (`v_only := case when auth.uid() is not null then current_gym_id() end`).
- **R5 Signatures.** Apps call these by name. Add parameters only with defaults; a new argument
  list is a new function, so `drop function` the old one first.
- **Start from the last definition**: `python scripts/sql/last-definition.py <name>` prints it
  verbatim; `python scripts/sql/definer-inventory.py` lists every definer and the tables it touches.

## Deliberately not per gym

- **One body.** A coach or member cannot be in two places at once, so the clash checks stay across
  gyms: `assert_member_free`, `assert_trainer_free`, the overlap triggers (0068) and the
  double-booking index. `trainer_busy_slots` shows a coach's sessions everywhere, but only for
  coaches of your gym and only the time. `trainer_schedule_conflicts` lists a cross-gym clash but
  names the other side only "At another gym". A member's *own* `member_commitments` spans gyms; the
  desk sees only its gym's part.
- **Identity.** `display_name_of`, `activity_member_name`, `is_email_taken`, `is_phone_taken`,
  `sync_profile_email`.
- **Reached only through an already-scoped key** (definer, but safe): `plan_allows` (plan from
  the gym's membership), `trg_payment_plan_snapshot`, `trg_redemption_decided`, and own-row
  writers `leave_waitlist`, `mark_feedback`, `touch_assistant_conversation`, `trg_bookings_waitlist`.
- **The shared library.** NULL-gym exercises and resources are read by every gym and curated by the
  platform and by Gym #1's staff (`may_curate_library()`), as on today's Exercises page; a Gym #1
  insert stays shared (`trg_library_row_gym`). Other gyms add and edit only their own rows.

## Per gym now, where it used to be global

Point balances, badges and **levels** (a two-gym member has two shelves and two levels);
the free trial is **once per member per gym**; invoice numbers; the cash drawer; refund rules and
the processing fee; cancellation reasons; goal templates; notification dedupe (the same event
notifies once in each gym); the crash-report cap.

## Transition leftovers (removed by the clean-up after Part B)

- `trg_mirror_profile_role` and `profiles.active_gym_id default gym_one()`.
- Three `*_transition` keys the apps' own upserts still name: `member_share_prefs(member_id)`,
  `body_measurements(member_id, measured_on)`, `trainer_ratings(member_id, trainer_id, period)`.
  Until they go, a person in two gyms shares those three rows' uniqueness across gyms.
- Sign-up without a `gym_id` in its metadata (today's app) lands in Gym #1.

## Proving it

`scripts/sql/tenancy-isolation.mjs` (in CI on every push): two gyms on the real migrations and
demo data, every role, **every table** (read, update, delete across the edge), every view, and
the definer functions group by group — 120 checks. It also fails on an unclassified table, a
policy that reads `profiles.role`, a table with RLS off, or a gym-to-gym foreign key without
`gym_id`. The demo seeds run where they ran live, before 0097, so the backfills meet them as they
will in production.

## Pasting 0097–0103

1. Run the backup by hand first: GitHub → **Actions → Weekly database backup → Run workflow**, and
   wait for the green tick ([BACKUPS](BACKUPS.md)).
2. Paste one at a time, in order. After each, paste its `scripts/sql/verify/verifyNNNN.sql`
   (read-only; it ends in an error that *is* the report) and stop at any **NOT OK**; then
   `python scripts/probe-migrations.py`.
3. After 0103, open both apps as usual: nothing should look or behave differently — Gym #1 is the
   only gym. The first row of `platform_admins` is pasted by hand (Part C).
