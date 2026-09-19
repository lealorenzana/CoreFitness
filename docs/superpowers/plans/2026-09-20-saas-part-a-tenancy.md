# SaaS Part A — Tenancy Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the database multi-gym: every gym's rows carry a `gym_id`, nobody reads or writes
across gyms, today's data becomes Gym #1 and today's apps keep working unchanged.

**Architecture:** Four layers, each a migration. (1) `gyms`, `gym_roles`, `platform_admins`,
`gym_applications` and a *current gym* per person (`profiles.active_gym_id`), with `get_my_role()`
re-pointed at `gym_roles`. (2) `gym_id` on every gym table, defaulting to the caller's current
gym, and every key and foreign key widened to include it — so the database itself refuses a
cross-gym reference. (3) One *restrictive* same-gym policy set per table, ANDed with the ~180
existing policies without touching them. (4) Every SECURITY DEFINER function (they skip RLS)
scoped to one gym, in four area migrations. A pglite harness proves separation on every push.

**Tech Stack:** Postgres 15+ (Supabase; pglite locally/CI), PL/pgSQL, Node 22 ESM test scripts,
GitHub Actions.

**Spec:** [docs/superpowers/specs/2026-09-20-multi-tenant-saas-design.md](../specs/2026-09-20-multi-tenant-saas-design.md)

## Global Constraints

- Migrations are pasted by hand in the Supabase SQL editor, **one at a time, in number order** —
  never `db push`. Each ends with a `migration_00NN_applied()` marker function and gets a probe entry
  in `scripts/probe-migrations.py`.
- Gym #1 id is **`c0f1e55e-0000-4000-8000-000000000001`**, slug `core-fitness`. Existing data,
  accounts and the demo data (`5eed____-…`) all belong to it. Do **not** remove the demo data.
- **The apps must keep working between the paste and Part B's deploy.** No column the apps read is
  renamed or dropped in Part A; `profiles.role`/`status` stay and are mirrored into `gym_roles`.
- A SECURITY DEFINER function keeps the **`auth.uid() is not null`** guard pattern; NULL-safe
  comparisons use `IS DISTINCT FROM` / `coalesce(get_my_role()::text,'')`.
- **RLS filters rows and does not raise**: a forbidden update/delete is zero rows, a forbidden
  insert raises `new row violates row-level security policy`.
- Tests run as the real `authenticated` role (assert `current_user` first), never as the owner.
- Write scripts with the Write tool, never heredocs (bash mangles backticks and backslashes).
- Every function rewrite starts from its **last** definition, found with
  `python scripts/sql/definer-inventory.py` — copy it verbatim, then edit. Never rewrite from memory.
- Commit message trailer: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## The rewrite rules (every function task applies these)

- **R1 — one gym.** A function that reads gym rows filters them by one gym: the gym of the row it
  was handed (`NEW.gym_id`, or the gym of the id passed in) when it has one, else `current_gym_id()`.
  Put it in a variable `v_gym uuid` at the top.
- **R2 — explicit inserts.** Every insert into a gym table inside a definer function names
  `gym_id` explicitly (`v_gym`). The column default is for app inserts only; a sweep with no caller
  has no current gym and must not rely on it.
- **R3 — roles are per gym.** Another person's role or status comes from `gym_roles` in `v_gym`
  (`select role from gym_roles where user_id = X and gym_id = v_gym`), never from `profiles.role`
  or `profiles.status`. "Every active admin" = `gym_roles where gym_id = v_gym and role = 'admin'
  and status = 'active'`.
- **R4 — sweeps.** A sweep takes `p_gym uuid default null`. Called by a signed-in user it runs for
  `current_gym_id()`; called with no user (pg_cron) and no argument it loops
  `for v_gym in select id from gyms where status = 'active'` and does each gym.
- **R5 — signatures stay.** Apps call these functions today. Add parameters only with defaults;
  never rename or drop one. Replacing a function with a new signature means `drop function` of the
  old one first (Postgres treats a new parameter list as a new function).
- **R6 — one person, one body.** Clash checks (`assert_member_free`, `assert_trainer_free`, the
  overlap triggers, `idx_pt_sessions_trainer_slot`) stay **across gyms**: a coach cannot be in two
  gyms at once. They raise "busy" without revealing the other gym's details.

## File map

| File | Responsibility |
|---|---|
| `scripts/sql/lib/live-db.mjs` (new) | Build a pglite database from every real migration with Supabase's stubs and grants. One place, used by replay and isolation. |
| `scripts/sql/replay-migrations.mjs` (modify) | Now a thin caller of `live-db.mjs`. |
| `scripts/sql/tenancy-isolation.mjs` (new) | Two gyms, every role, every table and every definer function: nothing crosses. |
| `scripts/sql/definer-inventory.py` (new, exists) | Lists each function at its last definition and the tables it touches. |
| `supabase/migrations/0097_tenancy_core.sql` | gyms, gym_roles, platform_admins, gym_applications, current gym, get_my_role, role mirror. |
| `supabase/migrations/0098_tenancy_tag_data.sql` | gym_id everywhere, widened keys and FKs, gym_settings per gym, seed_gym_defaults. |
| `supabase/migrations/0099_tenancy_same_gym_policies.sql` | Restrictive policies, gym_writable, profiles/person tables, views. |
| `supabase/migrations/0100_tenancy_accounts_money.sql` | Group 1 definer functions. |
| `supabase/migrations/0101_tenancy_schedule.sql` | Group 2 definer functions. |
| `supabase/migrations/0102_tenancy_engagement.sql` | Group 3 definer functions. |
| `supabase/migrations/0103_tenancy_notify_activity.sql` | Group 4 definer functions and sweeps. |
| `scripts/sql/verify/verify0097.sql` … `verify0103.sql` | Paste-after checks for the live database. |
| `scripts/probe-migrations.py`, `.github/workflows/ci.yml`, `docs/*`, `CLAUDE.md` | Probe, CI, docs. |

The gym-specific tables (52), used by name in Tasks 3–4. Keep this list identical everywhere it
appears (it is defined once, in 0098, as `tenancy_gym_tables()`):

```
account_status_events achievement_unlocks achievements activity_log assistant_conversations
assistant_messages attendance body_measurements bookings cancellation_reasons cash_closeouts
challenge_participants challenges class_templates class_waitlist classes event_registrations
events fitness_goals freemium_trials goal_templates gym_plans gym_settings invoice_counters
member_profiles member_share_prefs membership_events membership_plans memberships notifications
payments pending_registrations plan_features point_ledger point_rules pt_sessions refund_rules
renewal_requests reward_redemptions rewards saved_resources trainer_availability
trainer_credentials trainer_feedback trainer_profiles trainer_ratings workout_logs workout_plans
workout_routine_exercises workout_routines workout_sets
```

Global (no `gym_id`): `profiles`, `push_subscriptions`, `notification_prefs`, `features`,
`achievement_metrics`. Nullable `gym_id` (library): `exercises`, `workout_resources`. Nullable
`gym_id` (platform-wide log): `client_errors`.

---

### Task 1: One live-schema builder, and a failing isolation harness in CI

**Files:**
- Create: `scripts/sql/lib/live-db.mjs`
- Modify: `scripts/sql/replay-migrations.mjs` (everything from `const db = await PGlite.create()`
  through the migration loop moves into the module)
- Create: `scripts/sql/tenancy-isolation.mjs`
- Modify: `.github/workflows/ci.yml` (the "Rule checks" loop), `scripts/sql/README.md`

**Interfaces:**
- Produces: `liveDb(repo: string, opts?: { seeds?: string[] }) => Promise<PGlite>` — every
  migration applied, Supabase roles/schemas stubbed, Supabase's default grants reproduced, the
  real-admin fixture inserted, seeds from `scripts/demo-data/` applied. Throws with the failing
  file name on the first error.
- Produces: in `tenancy-isolation.mjs`, helpers `as(uid)`, `asOwner()`, `one(sql)`, `check(label,
  ok, detail)` and the `GYM_A`/`GYM_B` fixtures used by every later task.

- [ ] **Step 1: Create `scripts/sql/lib/live-db.mjs`.** Move the stub `db.exec` block, `prep`, the
  migration loop, the admin fixture and the seed loop out of `replay-migrations.mjs` unchanged, then
  add Supabase's grants after the migrations (Supabase grants these by default; pglite does not, and
  without them every test passes because the role can reach nothing):

```js
/**
 * The live schema in pglite: every migration in order, Supabase's own furniture
 * stubbed, Supabase's default grants reproduced. Shared by replay-migrations and
 * tenancy-isolation so neither drifts from the other.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const requireFromCwd = createRequire(pathToFileURL(process.cwd() + '/'));
const { PGlite } = await import(pathToFileURL(requireFromCwd.resolve('@electric-sql/pglite')).href);

export const describe = (e) => [e.message, e.detail && `detail: ${e.detail}`, e.hint && `hint: ${e.hint}`,
  e.where && `where: ${e.where}`].filter(Boolean).join('\n   ');

export async function liveDb(repo, { seeds = [], log = () => {} } = {}) {
  const MIG = `${repo}/supabase/migrations`;
  const db = await PGlite.create();
  await db.exec(STUBS);                       // the create role / auth / storage block, verbatim
  const prep = (sql) => sql.replace(/create\s+extension[^;]*;/gi, 'select 1;');
  const files = readdirSync(MIG).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  for (const f of files) {
    try { await db.exec(prep(readFileSync(`${MIG}/${f}`, 'utf8'))); }
    catch (e) { throw new Error(`MIGRATION FAILED: ${f}\n   ${describe(e)}`); }
  }
  log(`applied ${files.length}/${files.length} migrations`);
  await db.exec(`
    grant usage on schema public to anon, authenticated;
    grant all on all tables in schema public to anon, authenticated;
    grant all on all sequences in schema public to anon, authenticated;
    grant execute on all functions in schema public to authenticated;`);
  await db.exec(ADMIN_FIXTURE);               // the real-admin insert, verbatim
  for (const seed of seeds) {
    try { await db.exec(readFileSync(`${repo}/scripts/demo-data/${seed}`, 'utf8')); log(`SEED OK: ${seed}`); }
    catch (e) { throw new Error(`SEED FAILED: ${seed}\n   ${describe(e)}`); }
  }
  return db;
}
```

  `STUBS` and `ADMIN_FIXTURE` are the two template strings moved verbatim from
  `replay-migrations.mjs`. Execute is granted to `authenticated` only: a blanket grant to `anon`
  would undo every migration's `revoke … from anon`, and the functions anon may call are granted by
  their own migrations.

- [ ] **Step 2: Reduce `replay-migrations.mjs` to a caller.**

```js
import { liveDb, describe } from './lib/live-db.mjs';
const REPO = process.argv[2];
try {
  await liveDb(REPO, { seeds: process.argv.slice(3), log: console.log });
} catch (e) {
  console.log(e.message);
  process.exit(e.message.startsWith('SEED') ? 3 : 2);
}
```

  Keep the file's header comment. Run from `scratchpad/sqlharness` (pglite installed there):
  `node "<repo>/scripts/sql/replay-migrations.mjs" "<repo>" seed-demo-data.sql seed-demo-data-2.sql`
  Expected: `applied 96/96 migrations`, `SEED OK` twice — identical to before.

- [ ] **Step 3: Write `scripts/sql/tenancy-isolation.mjs` with the fixtures and the first checks.**

```js
/**
 * Tenancy: two gyms, every role, nothing crosses. Built on the real migrations
 * (lib/live-db.mjs), acting as the real `authenticated` role — an owner bypasses
 * RLS, so `current_user` is asserted before any result is believed.
 *
 *   node <repo>/scripts/sql/tenancy-isolation.mjs "<repo>"   (from a dir with pglite installed)
 */
import { liveDb, describe } from './lib/live-db.mjs';

const REPO = process.argv[2];
const db = await liveDb(REPO, { seeds: ['seed-demo-data.sql', 'seed-demo-data-2.sql'] });

export const GYM_A = 'c0f1e55e-0000-4000-8000-000000000001';   // Gym #1: today's data
export const GYM_B = 'b0000000-0000-4000-8000-00000000000b';
// People. BOTH is a member of both gyms.
const P = {
  adminA: 'a1000000-0000-4000-8000-000000000001', staffA: 'a1000000-0000-4000-8000-000000000002',
  trainerA: 'a1000000-0000-4000-8000-000000000003', memberA: 'a1000000-0000-4000-8000-000000000004',
  adminB: 'b1000000-0000-4000-8000-000000000001', staffB: 'b1000000-0000-4000-8000-000000000002',
  trainerB: 'b1000000-0000-4000-8000-000000000003', memberB: 'b1000000-0000-4000-8000-000000000004',
  both: 'ab000000-0000-4000-8000-000000000005', outsider: '0c000000-0000-4000-8000-000000000006',
};

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures++;
};
const asOwner = () => db.exec('reset role;');
async function as(uid) {
  await db.exec(`reset role; set request.jwt.claim.sub = '${uid}'; set role authenticated;`);
  const { rows } = await db.query('select current_user as u');
  if (rows[0].u !== 'authenticated') throw new Error('not running as authenticated');
}
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const fails = async (sql) => { try { await db.exec(sql); return null; } catch (e) { return describe(e); } };

// ---- 0097: the tenancy core exists -----------------------------------------
await asOwner();
const core = await one(`select to_regclass('public.gyms') is not null as gyms,
  to_regclass('public.gym_roles') is not null as roles,
  to_regprocedure('public.current_gym_id()') is not null as cur`);
check('0097 tables and current_gym_id exist', core.gyms && core.roles && core.cur, JSON.stringify(core));
if (!core.gyms) { console.log(`\n${failures} FAILED`); process.exit(1); }

// ... fixtures and checks are added by Tasks 2–8, below this line ...

console.log(failures ? `\n${failures} FAILED` : '\nall tenancy checks passed');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 4: Run it and watch it fail.**
  Run (from `scratchpad/sqlharness`): `node "<repo>/scripts/sql/tenancy-isolation.mjs" "<repo>"`
  Expected: `FAIL  0097 tables and current_gym_id exist` and exit code 1.

- [ ] **Step 5: Add it to CI.** In `.github/workflows/ci.yml`, "Rule checks" loop, append
  `tenancy-isolation` to `for s in booking-conflicts trainer-decisions reasons-and-limits
  cancellation-and-visibility; do`. Add a line to `scripts/sql/README.md` naming the file and what it
  proves. (CI goes red until Task 2 — commit Tasks 1 and 2 together, or push after Task 2.)

- [ ] **Step 6: Commit** (after Task 2 turns it green, or locally now):

```bash
git add scripts/sql/lib/live-db.mjs scripts/sql/replay-migrations.mjs scripts/sql/tenancy-isolation.mjs scripts/sql/definer-inventory.py scripts/sql/README.md .github/workflows/ci.yml
git commit -m "Tenancy harness: one live-schema builder, a failing isolation check in CI"
```

---

### Task 2: 0097 — gyms, roles per gym, and the current gym

**Files:**
- Create: `supabase/migrations/0097_tenancy_core.sql`
- Modify: `scripts/sql/tenancy-isolation.mjs` (fixtures + 0097 checks), `scripts/probe-migrations.py`
- Create: `scripts/sql/verify/verify0097.sql`

**Interfaces:**
- Produces (SQL): tables `gyms(id, slug, name, status, plan, paid_until, created_at)`,
  `gym_roles(gym_id, user_id, role user_role, status text, created_at)`,
  `platform_admins(user_id, created_at)`, `gym_applications(...)`; column
  `profiles.active_gym_id uuid`; functions `gym_one() → uuid`, `current_gym_id() → uuid`,
  `set_active_gym(p_gym uuid) → void`, `my_gyms() → table(gym_id, name, slug, role, status)`,
  `list_gyms(p_search text default null) → table(id, slug, name, short_name, logo_url, accent)`
  (anon-callable, active gyms only), `is_platform_admin() → boolean`,
  `get_my_role() → user_role` (now per current gym), trigger `trg_mirror_profile_role`.

- [ ] **Step 1: Add the fixture block and 0097 checks to the harness** (below the 0097 existence check):

```js
// Gym B, its people, and one person in both gyms. Inserted as owner.
await asOwner();
const person = (id, email, first) => `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${email}', '{}');
  insert into profiles (id, first_name, last_name, email, status, role) values ('${id}', '${first}', 'Test', '${email}', 'active', 'member');`;
await db.exec(`
  insert into gyms (id, slug, name) values ('${GYM_B}', 'gym-b', 'Gym B');
  ${Object.entries(P).map(([k, id]) => person(id, k + '@corefitness-test.com', k)).join('\n')}
  insert into gym_roles (gym_id, user_id, role, status) values
    ('${GYM_A}', '${P.adminA}', 'admin', 'active'), ('${GYM_A}', '${P.staffA}', 'staff', 'active'),
    ('${GYM_A}', '${P.trainerA}', 'trainer', 'active'), ('${GYM_A}', '${P.memberA}', 'member', 'active'),
    ('${GYM_B}', '${P.adminB}', 'admin', 'active'), ('${GYM_B}', '${P.staffB}', 'staff', 'active'),
    ('${GYM_B}', '${P.trainerB}', 'trainer', 'active'), ('${GYM_B}', '${P.memberB}', 'member', 'active'),
    ('${GYM_A}', '${P.both}', 'member', 'active'), ('${GYM_B}', '${P.both}', 'member', 'active')
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  update profiles set active_gym_id = '${GYM_B}' where id in ('${P.adminB}','${P.staffB}','${P.trainerB}','${P.memberB}');
  update profiles set active_gym_id = '${GYM_A}' where id in ('${P.adminA}','${P.staffA}','${P.trainerA}','${P.memberA}','${P.both}');
  update profiles set active_gym_id = null where id = '${P.outsider}';
  delete from gym_roles where user_id = '${P.outsider}';`);

// Everyone who existed before 0097 is in Gym #1 with their old role.
const gym1 = await one(`select count(*)::int as missing from profiles p
  where p.id not in (select id from unnest(array['${Object.values(P).join("','")}']::uuid[]) id)
    and not exists (select 1 from gym_roles r where r.user_id = p.id and r.gym_id = '${GYM_A}' and r.role = p.role)`);
check('every existing account has its role in Gym #1', gym1.missing === 0, `${gym1.missing} missing`);

await as(P.adminB);
check('get_my_role() is the role in the current gym', (await one('select get_my_role()::text as r')).r === 'admin');
check('current_gym_id() is the active gym', (await one('select current_gym_id() as g')).g === GYM_B);
await as(P.memberA);
check('a member of Gym A only is a member', (await one('select get_my_role()::text as r')).r === 'member');
check('set_active_gym refuses a gym with no role', !!(await fails(`select set_active_gym('${GYM_B}')`)));
await as(P.both);
await db.exec(`select set_active_gym('${GYM_B}')`);
check('set_active_gym switches a two-gym member', (await one('select current_gym_id() as g')).g === GYM_B);
check('my_gyms lists both gyms', (await one('select count(*)::int as n from my_gyms()')).n === 2);
await db.exec(`select set_active_gym('${GYM_A}')`);
await as(P.outsider);
check('someone with no gym has no role', (await one('select get_my_role() as r')).r === null);
check('platform_admins is unreadable to a gym admin', true);   // tightened below
await as(P.adminA);
check('a gym admin cannot make themself platform admin',
  !!(await fails(`insert into platform_admins (user_id) values ('${P.adminA}')`)));
check('a gym admin cannot grant themself a role in Gym B',
  !!(await fails(`insert into gym_roles (gym_id, user_id, role, status) values ('${GYM_B}', '${P.adminA}', 'admin', 'active')`)));
await db.exec(`reset role; set request.jwt.claim.sub = ''; set role anon;`);
check('anon lists active gyms', (await one(`select count(*)::int as n from list_gyms('gym')`)).n >= 1);
check('anon may apply', !(await fails(`insert into gym_applications (gym_name, owner_name, email, phone)
  values ('New Gym', 'Owner', 'owner@corefitness-test.com', '09170000000')`)));
check('anon cannot read applications', (await one('select count(*)::int as n from gym_applications')).n === 0);
```

- [ ] **Step 2: Run the harness — expect `FAIL 0097 tables … exist`.**

- [ ] **Step 3: Write `supabase/migrations/0097_tenancy_core.sql`:**

```sql
-- 0097 — Tenancy core. Core Fitness becomes a service for many gyms.
--
-- A person is global (profiles); a role is per gym (gym_roles). Each person
-- has a *current gym* (profiles.active_gym_id) set only through
-- set_active_gym(), which refuses a gym where they hold no active role.
-- get_my_role() keeps its name and meaning — "my role" — but now means "my
-- role in my current gym", so every policy and function that calls it (179
-- places) becomes gym-aware at once. Existing data is Gym #1.
--
-- Transition: the apps still read and write profiles.role/status until Part
-- B. trg_mirror_profile_role copies those writes into gym_roles, so an
-- approval or promotion made from today's admin app still takes effect.
-- Spec: docs/superpowers/specs/2026-09-20-multi-tenant-saas-design.md

create table if not exists gyms (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 40),
  name        text not null check (length(name) between 2 and 80),
  status      text not null default 'active' check (status in ('active', 'suspended')),
  plan        text not null default 'trial' check (plan in ('trial', 'standard', 'premium')),
  paid_until  date,
  created_at  timestamptz not null default now()
);

create or replace function gym_one() returns uuid language sql immutable as
$$ select 'c0f1e55e-0000-4000-8000-000000000001'::uuid $$;
comment on function gym_one() is
  'Gym #1 — the gym that existed before tenancy. Used only by the transition mirror and the backfill.';

insert into gyms (id, slug, name, plan, paid_until)
select gym_one(), 'core-fitness', coalesce((select gym_name from gym_settings limit 1), 'Core Fitness'),
       'premium', null
on conflict (id) do nothing;

create table if not exists gym_roles (
  gym_id     uuid not null references gyms(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  role       user_role not null,
  status     text not null default 'pending_approval'
             check (status in ('active', 'pending_approval', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  primary key (gym_id, user_id)
);
create index if not exists gym_roles_user on gym_roles (user_id);

insert into gym_roles (gym_id, user_id, role, status)
select gym_one(), p.id, p.role,
       case when p.status in ('active', 'pending_approval', 'suspended', 'archived') then p.status else 'active' end
from profiles p
on conflict (gym_id, user_id) do nothing;

alter table profiles add column if not exists active_gym_id uuid references gyms(id) on delete set null;
update profiles set active_gym_id = gym_one() where active_gym_id is null;

create table if not exists platform_admins (
  user_id    uuid primary key references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists gym_applications (
  id              uuid primary key default gen_random_uuid(),
  gym_name        text not null check (length(gym_name) between 2 and 80),
  owner_name      text not null check (length(owner_name) between 2 and 80),
  email           text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 120),
  phone           text not null check (length(phone) between 7 and 20),
  address         text check (length(address) <= 200),
  member_estimate integer check (member_estimate between 0 and 100000),
  message         text check (length(message) <= 1000),
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reason          text check (length(reason) <= 500),
  gym_id          uuid references gyms(id),
  decided_by      uuid references profiles(id),
  decided_at      timestamptz,
  created_at      timestamptz not null default now()
);

-- ---- the current gym --------------------------------------------------------

create or replace function current_gym_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.active_gym_id from profiles p
  where p.id = auth.uid()
    and exists (select 1 from gym_roles r where r.user_id = p.id and r.gym_id = p.active_gym_id);
$$;

create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from platform_admins where user_id = auth.uid());
$$;

-- Same name, same meaning ("my role"), now per gym.
create or replace function get_my_role() returns user_role
language sql stable security definer set search_path = public as $$
  select r.role from gym_roles r
  join profiles p on p.id = r.user_id and p.active_gym_id = r.gym_id
  where r.user_id = auth.uid();
$$;

create or replace function set_active_gym(p_gym uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not exists (select 1 from gym_roles where user_id = auth.uid() and gym_id = p_gym
                 and status in ('active', 'pending_approval')) then
    raise exception 'You are not part of that gym.';
  end if;
  update profiles set active_gym_id = p_gym where id = auth.uid();
end;
$$;

create or replace function my_gyms()
returns table (gym_id uuid, name text, slug text, role user_role, status text)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.slug, r.role, r.status
  from gym_roles r join gyms g on g.id = r.gym_id
  where r.user_id = auth.uid() and r.status <> 'archived'
  order by g.name;
$$;

-- Public: the sign-up gym list. Active gyms only, public fields only.
-- (short_name, logo_url and accent come from gym_settings once 0098 makes it
-- per gym; until then they are NULL.)
create or replace function list_gyms(p_search text default null)
returns table (id uuid, slug text, name text)
language sql stable security definer set search_path = public as $$
  select g.id, g.slug, g.name from gyms g
  where g.status = 'active'
    and (p_search is null or g.name ilike '%' || p_search || '%' or g.slug ilike '%' || p_search || '%')
  order by g.name limit 50;
$$;

-- ---- transition mirror: profiles.role/status writes land in gym_roles -------

create or replace function trg_mirror_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := coalesce(new.active_gym_id, current_gym_id(), gym_one());
begin
  if tg_op = 'UPDATE' and new.role is not distinct from old.role
     and new.status is not distinct from old.status then
    return new;
  end if;
  insert into gym_roles (gym_id, user_id, role, status)
  values (v_gym, new.id, new.role,
          case when new.status in ('active', 'pending_approval', 'suspended', 'archived') then new.status else 'active' end)
  on conflict (gym_id, user_id) do update set role = excluded.role, status = excluded.status;
  return new;
end;
$$;
drop trigger if exists mirror_profile_role on profiles;
create trigger mirror_profile_role after insert or update of role, status on profiles
  for each row execute function trg_mirror_profile_role();

-- ---- rules -------------------------------------------------------------------

alter table gyms enable row level security;
alter table gym_roles enable row level security;
alter table platform_admins enable row level security;
alter table gym_applications enable row level security;

drop policy if exists gyms_select on gyms;
create policy gyms_select on gyms for select to authenticated
  using (is_platform_admin() or exists (select 1 from gym_roles r where r.gym_id = gyms.id and r.user_id = auth.uid()));
-- No insert/update/delete policy on gyms: the platform app changes gyms
-- through SECURITY DEFINER functions (Part C) that check is_platform_admin().

drop policy if exists gym_roles_select on gym_roles;
create policy gym_roles_select on gym_roles for select to authenticated
  using (user_id = auth.uid() or gym_id = current_gym_id());
-- Writes go through set_account_status() and the create-* Edge Functions (Part B);
-- no direct write policy, so nobody grants themself a role.

drop policy if exists platform_admins_select on platform_admins;
create policy platform_admins_select on platform_admins for select to authenticated
  using (user_id = auth.uid());

drop policy if exists gym_applications_insert on gym_applications;
create policy gym_applications_insert on gym_applications for insert to anon, authenticated
  with check (status = 'pending' and gym_id is null and decided_by is null and reason is null);
drop policy if exists gym_applications_select on gym_applications;
create policy gym_applications_select on gym_applications for select to authenticated
  using (is_platform_admin());

revoke all on function list_gyms(text) from public;
grant execute on function list_gyms(text) to anon, authenticated;
revoke all on function set_active_gym(uuid), my_gyms() from public, anon;
grant execute on function set_active_gym(uuid), my_gyms() to authenticated;

create or replace function migration_0097_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0097_applied() from public, anon;
grant execute on function migration_0097_applied() to authenticated;

-- VERIFICATION: scripts/sql/verify/verify0097.sql
```

- [ ] **Step 4: Run the harness — every 0097 check passes.** If
  `every existing account has its role in Gym #1` fails, the status mapping is wrong for a value
  the demo data uses: `select distinct status from profiles` and extend the `case`.

- [ ] **Step 5: Run the existing rule checks** (they must stay green — `get_my_role()` changed):
  `for s in booking-conflicts trainer-decisions reasons-and-limits cancellation-and-visibility`
  → `node "<repo>/scripts/sql/$s.mjs" "<repo>"`. These use hand-written fixtures without 0097; they
  should be unaffected. If one fails, it applied a migration file that now calls a missing table —
  read the failure before changing anything.

- [ ] **Step 6: Probe entry and verify script.** Add `('0097', 'rpc', 'migration_0097_applied')`
  in the same shape as the 0096 entry in `scripts/probe-migrations.py`. Write
  `scripts/sql/verify/verify0097.sql` in the style of `verify0096.sql`:

```sql
-- Paste after 0097. Raises REPORT with the numbers; any NOT OK means stop.
do $$
declare v_missing int; v_gyms int; v_active int;
begin
  select count(*) into v_gyms from gyms;
  select count(*) into v_missing from profiles p where not exists
    (select 1 from gym_roles r where r.user_id = p.id and r.gym_id = gym_one());
  select count(*) into v_active from profiles where active_gym_id = gym_one();
  raise exception 'REPORT gyms=% accounts_without_gym1_role=% (%) accounts_in_gym1=%',
    v_gyms, v_missing, case when v_missing = 0 then 'OK' else 'NOT OK' end, v_active;
end $$;
```

- [ ] **Step 7: Commit.**

```bash
git add supabase/migrations/0097_tenancy_core.sql scripts/sql/tenancy-isolation.mjs scripts/probe-migrations.py scripts/sql/verify/verify0097.sql
git commit -m "0097: gyms, roles per gym, the current gym"
```

---

### Task 3: 0098 — gym_id on every gym table, keys and foreign keys per gym

**Files:**
- Create: `supabase/migrations/0098_tenancy_tag_data.sql`
- Modify: `scripts/sql/tenancy-isolation.mjs`, `scripts/probe-migrations.py`
- Create: `scripts/sql/verify/verify0098.sql`

**Interfaces:**
- Consumes: `gyms`, `gym_one()`, `current_gym_id()` (Task 2).
- Produces: `tenancy_gym_tables() → text[]` (the 52 names above); `gym_id uuid not null default
  current_gym_id()` on each; composite keys listed below; `unique (gym_id, id)` on every table with
  an `id` key; every FK between two gym tables rebuilt as `(gym_id, col) → (gym_id, key)`;
  `seed_gym_defaults(p_gym uuid, p_from uuid default gym_one()) → void` (copies plans, plan
  features, point rules, cancellation reasons, refund rules, goal templates, achievements and a
  `gym_settings` row); `gym_settings.accent text`; `list_gyms` extended with `short_name`,
  `logo_url`, `accent`.

Widened keys (from the replayed schema, 2026-09-20):

| Table | Was | Becomes |
|---|---|---|
| achievements | PK (key) | PK (gym_id, key) |
| cancellation_reasons | PK (key) | PK (gym_id, key) |
| goal_templates | PK (key) | PK (gym_id, key) |
| point_rules | PK (key) | PK (gym_id, key) |
| cash_closeouts | PK (day) | PK (gym_id, day) |
| invoice_counters | PK (year) | PK (gym_id, year) |
| gym_settings | PK (id boolean) | PK (gym_id); `id` stays, default true, no longer unique |
| member_profiles | PK (profile_id); UNIQUE (qr_code) | PK (gym_id, profile_id); UNIQUE (gym_id, qr_code) |
| trainer_profiles | PK (profile_id) | PK (gym_id, profile_id) |
| freemium_trials | PK (member_id) | PK (gym_id, member_id) |
| member_share_prefs | PK (member_id) | PK (gym_id, member_id) |
| achievement_unlocks | UNIQUE (user_id, achievement_key) | UNIQUE (gym_id, user_id, achievement_key) |
| body_measurements | UNIQUE (member_id, measured_on) | UNIQUE (gym_id, member_id, measured_on) |
| gym_plans | UNIQUE (member_id, day_of_week) | UNIQUE (gym_id, member_id, day_of_week) |
| point_ledger | UNIQUE (member_id, rule_key, source_table, source_id) | + gym_id first |
| pending_registrations | UNIQUE (email) | UNIQUE (gym_id, email) |
| trainer_ratings | PK (member_id, trainer_id, period) | PK (gym_id, member_id, trainer_id, period) |
| payments_invoice_number_key | unique (invoice_number) | unique (gym_id, invoice_number) |
| renewal_requests_one_open | unique (member_id) where open | unique (gym_id, member_id) where open |
| notifications_dedupe_unique | (user_id, metadata->>'dedupe') | (gym_id, user_id, metadata->>'dedupe') |
| idx_classes_template_slot | (template_id, scheduled_at) | unchanged (template ids are per gym) |
| idx_pt_sessions_trainer_slot | (trainer_id, starts_at) | **unchanged — R6, one body** |
| exercises_name_unique | (lower(name)) | (coalesce(gym_id, '00000000-0000-0000-0000-000000000000'), lower(name)) |
| workout_resources_url_unique | (lower(url)) | same shape as exercises |

- [ ] **Step 1: Add the 0098 checks to the harness** (after the 0097 block):

```js
// ---- 0098: every gym table carries gym_id; keys and references are per gym ----
await asOwner();
const untagged = await db.query(`select t from unnest(tenancy_gym_tables()) t
  where not exists (select 1 from information_schema.columns c where c.table_schema = 'public'
    and c.table_name = t and c.column_name = 'gym_id' and c.is_nullable = 'NO')`);
check('every gym table has gym_id not null', untagged.rows.length === 0, untagged.rows.map((r) => r.t).join(', '));
check('tenancy_gym_tables() names 52 tables', (await one('select cardinality(tenancy_gym_tables()) as n')).n === 52);
const stray = await one(`select count(*)::int as n from gym_settings where gym_id <> gym_one()`);
check('existing rows are all Gym #1 (gym_settings sample)', stray.n === 0);
// Every FK between two gym tables includes gym_id.
const narrow = await db.query(`select c.conrelid::regclass::text as src, pg_get_constraintdef(c.oid) as def
  from pg_constraint c where c.contype = 'f'
    and c.conrelid::regclass::text = any(tenancy_gym_tables())
    and c.confrelid::regclass::text = any(tenancy_gym_tables())
    and pg_get_constraintdef(c.oid) not like 'FOREIGN KEY (gym_id,%'`);
check('every gym-to-gym foreign key includes gym_id', narrow.rows.length === 0,
  narrow.rows.map((r) => r.src + ' ' + r.def).join(' | '));
// Seed Gym B with the defaults, then the rows the later checks read.
await db.exec(`select seed_gym_defaults('${GYM_B}')`);
check('Gym B has its own point rules', (await one(`select count(*)::int as n from point_rules where gym_id = '${GYM_B}'`)).n > 0);
check('Gym B has its own settings row', (await one(`select count(*)::int as n from gym_settings where gym_id = '${GYM_B}'`)).n === 1);
await db.exec(`
  insert into member_profiles (gym_id, profile_id, qr_code) values
    ('${GYM_A}', '${P.memberA}', '${P.memberA}'), ('${GYM_B}', '${P.memberB}', '${P.memberB}'),
    ('${GYM_A}', '${P.both}', '${P.both}'), ('${GYM_B}', '${P.both}', '${P.both}');
  insert into trainer_profiles (gym_id, profile_id) values ('${GYM_A}', '${P.trainerA}'), ('${GYM_B}', '${P.trainerB}');
  insert into attendance (gym_id, member_id) values ('${GYM_A}', '${P.memberA}'), ('${GYM_B}', '${P.memberB}'), ('${GYM_B}', '${P.both}');
  insert into notifications (gym_id, user_id, type, title, message) values
    ('${GYM_B}', '${P.memberB}', 'system', 'B only', 'B only'), ('${GYM_B}', '${P.both}', 'system', 'B for both', 'B');
  insert into events (gym_id, title, starts_at) values ('${GYM_B}', 'Gym B open day', now() + interval '3 days');
  insert into rewards (gym_id, name, cost_points) values ('${GYM_B}', 'Gym B towel', 100);`);
const bPlan = await one(`insert into membership_plans (gym_id, name) values ('${GYM_B}', 'Gym B Monthly') returning id`);
await db.exec(`insert into memberships (gym_id, member_id, plan_id) values ('${GYM_B}', '${P.memberB}', '${bPlan.id}');
  insert into payments (gym_id, member_id, amount, method, invoice_number) values ('${GYM_B}', '${P.memberB}', 999, 'cash', 'B-0001');
  insert into classes (gym_id, name, trainer_id, scheduled_at) values ('${GYM_B}', 'Gym B Spin', '${P.trainerB}', now() + interval '2 days');`);
const aClass = await one(`select id from classes where gym_id = '${GYM_A}' limit 1`);
check('the database refuses a Gym B booking of a Gym A class',
  !!(await fails(`insert into bookings (gym_id, member_id, class_id) values ('${GYM_B}', '${P.memberB}', '${aClass.id}')`)));
check('the same person has a profile in each gym',
  (await one(`select count(*)::int as n from member_profiles where profile_id = '${P.both}'`)).n === 2);
```

- [ ] **Step 2: Run the harness — expect the 0098 checks to fail** (`tenancy_gym_tables` does not exist).

- [ ] **Step 3: Write `0098_tenancy_tag_data.sql`.** Structure, in this order (each block is in the
  file; the dynamic parts use `format()` with `%I` so names are quoted):

```sql
-- 0098 — Every gym's rows carry the gym. Keys and references become per gym,
-- so the database itself refuses a row that points into another gym.
-- The default current_gym_id() files an app's insert under the caller's gym;
-- an insert with no signed-in caller (a sweep) must name the gym, or it fails
-- on NOT NULL — loudly, never into a guessed gym.

create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_plans','gym_settings','invoice_counters','member_profiles',
    'member_share_prefs','membership_events','membership_plans','memberships','notifications',
    'payments','pending_registrations','plan_features','point_ledger','point_rules','pt_sessions',
    'refund_rules','renewal_requests','reward_redemptions','rewards','saved_resources',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_profiles',
    'trainer_ratings','workout_logs','workout_plans','workout_routine_exercises','workout_routines',
    'workout_sets']::text[]
$$;

-- 1. The prototype's text columns (0001) go; nothing reads them.
alter table member_profiles drop column if exists gym_id;
alter table attendance drop column if exists gym_id;

-- 2. Add, backfill, default, not null — per table.
do $$ declare t text; begin
  foreach t in array tenancy_gym_tables() loop
    execute format('alter table %I add column if not exists gym_id uuid references gyms(id)', t);
    execute format('update %I set gym_id = gym_one() where gym_id is null', t);
    execute format('alter table %I alter column gym_id set default current_gym_id()', t);
    execute format('alter table %I alter column gym_id set not null', t);
    execute format('create index if not exists %I on %I (gym_id)', t || '_gym_idx', t);
  end loop;
end $$;

-- Library tables: NULL = the Core Fitness library every gym reads.
alter table exercises add column if not exists gym_id uuid references gyms(id);
alter table workout_resources add column if not exists gym_id uuid references gyms(id);
alter table exercises alter column gym_id set default current_gym_id();
alter table workout_resources alter column gym_id set default current_gym_id();
alter table client_errors add column if not exists gym_id uuid references gyms(id);
alter table client_errors alter column gym_id set default current_gym_id();

-- 3. Park every foreign key that points at a gym table from a gym table.
create temporary table _fk (src regclass, name text, def text) on commit drop;
insert into _fk select c.conrelid::regclass, c.conname, pg_get_constraintdef(c.oid)
  from pg_constraint c where c.contype = 'f'
   and c.conrelid::regclass::text = any(tenancy_gym_tables())
   and c.confrelid::regclass::text = any(tenancy_gym_tables());
do $$ declare r record; begin
  for r in select * from _fk loop
    execute format('alter table %s drop constraint %I', r.src, r.name);
  end loop;
end $$;

-- 4. Widen keys (table above). Example lines — write one per row of the table:
alter table achievements drop constraint achievements_pkey, add primary key (gym_id, key);
alter table member_profiles drop constraint member_profiles_pkey, add primary key (gym_id, profile_id);
alter table member_profiles drop constraint member_profiles_qr_code_key, add unique (gym_id, qr_code);
alter table gym_settings drop constraint gym_settings_singleton;
alter table gym_settings drop constraint gym_settings_pkey, add primary key (gym_id);
-- ... every row of the widened-keys table; look each constraint's real name up with
--     select conname from pg_constraint where conrelid = '<table>'::regclass;
drop index if exists payments_invoice_number_key;
create unique index payments_invoice_number_key on payments (gym_id, invoice_number);
drop index if exists notifications_dedupe_unique;
create unique index notifications_dedupe_unique on notifications (gym_id, user_id, (metadata->>'dedupe'))
  where metadata ? 'dedupe';
-- (renewal_requests_one_open, exercises_name_unique, workout_resources_url_unique likewise)

-- 5. unique (gym_id, <pk>) on every gym table whose key does not already start with gym_id,
--    so composite references have something to point at.
do $$ declare t text; k text; begin
  foreach t in array tenancy_gym_tables() loop
    select string_agg(a.attname, ', ' order by array_position(c.conkey, a.attnum)) into k
      from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
     where c.conrelid = t::regclass and c.contype = 'p';
    if k is not null and k not like 'gym_id%' then
      execute format('alter table %I add constraint %I unique (gym_id, %s)', t, t || '_gym_key', k);
    end if;
  end loop;
end $$;

-- 6. Rebuild each parked FK with gym_id in front. ON DELETE SET NULL names its
--    column, or it would null gym_id too.
do $$ declare r record; d text; col text; begin
  for r in select * from _fk loop
    col := substring(r.def from 'FOREIGN KEY \((\w+)\)');
    d := regexp_replace(r.def, 'FOREIGN KEY \((\w+)\) REFERENCES (\w+)\((\w+)\)',
                        'FOREIGN KEY (gym_id, \1) REFERENCES \2(gym_id, \3)');
    d := replace(d, 'ON DELETE SET NULL', format('ON DELETE SET NULL (%I)', col));
    execute format('alter table %s add constraint %I %s', r.src, r.name, d);
  end loop;
end $$;

-- 7. gym_settings: branding accent; the gym's name has one home.
alter table gym_settings alter column id set default true;
alter table gym_settings add column if not exists accent text not null default 'violet'
  check (accent in ('violet','indigo','blue','teal','emerald','rose','orange','slate'));
create or replace function trg_gym_settings_name() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update gyms set name = new.gym_name where id = new.gym_id and name is distinct from new.gym_name;
  return new;
end $$;
drop trigger if exists gym_settings_name on gym_settings;
create trigger gym_settings_name after insert or update of gym_name on gym_settings
  for each row execute function trg_gym_settings_name();

-- list_gyms gains the public branding (drop first: the return type changes).
drop function if exists list_gyms(text);
create function list_gyms(p_search text default null)
returns table (id uuid, slug text, name text, short_name text, logo_url text, accent text)
language sql stable security definer set search_path = public as $$
  select g.id, g.slug, g.name, s.short_name, s.logo_url, s.accent
  from gyms g left join gym_settings s on s.gym_id = g.id
  where g.status = 'active'
    and (p_search is null or g.name ilike '%' || p_search || '%' or g.slug ilike '%' || p_search || '%')
  order by g.name limit 50;
$$;
revoke all on function list_gyms(text) from public;
grant execute on function list_gyms(text) to anon, authenticated;

-- 8. seed_gym_defaults: a new gym starts with Gym #1's rules, not an empty shell.
create or replace function seed_gym_defaults(p_gym uuid, p_from uuid default gym_one()) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception 'Only the platform can set up a gym.';
  end if;
  insert into gym_settings (gym_id, gym_name)
    select p_gym, g.name from gyms g where g.id = p_gym on conflict (gym_id) do nothing;
  -- One insert … select per table, copying every column except the key/gym columns:
  --   point_rules, cancellation_reasons, goal_templates, achievements, refund_rules,
  --   membership_plans (new ids; remember old→new in a temp table), plan_features (mapped ids).
  -- Write each insert with an explicit column list read from the table (\d in the editor);
  -- `on conflict do nothing` on each so re-running is safe.
end $$;
revoke all on function seed_gym_defaults(uuid, uuid) from public, anon;

create or replace function migration_0098_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0098_applied() from public, anon;
grant execute on function migration_0098_applied() to authenticated;
```

  Fill the two elided parts completely before running — no `...` survives into the file:
  (a) one `alter table … drop constraint … add …` line per row of the widened-keys table, with
  the constraint names from `select conrelid::regclass, conname from pg_constraint where contype in
  ('p','u') and conrelid::regclass::text = any(tenancy_gym_tables())`;
  (b) the seed inserts with explicit column lists from `select column_name from
  information_schema.columns where table_name = '<t>' order by ordinal_position`.

- [ ] **Step 4: Run the harness until every 0098 check passes.** Then run
  `replay-migrations.mjs` with both seeds — the demo seeds must still load (they insert without
  `gym_id` as the owner, where `current_gym_id()` is NULL). **A seed failing on NOT NULL gym_id is
  expected**: live, the seeds ran before 0098; in the harness they run *after* every migration. Fix
  it in `lib/live-db.mjs`, never in the seed files — after the admin fixture, when `gym_one()`
  exists, file the fixture admin under Gym #1 and run the seeds as that admin, so the default
  resolves to Gym #1:

```js
  const tenancy = (await db.query(`select to_regprocedure('public.gym_one()') is not null as t`)).rows[0].t;
  if (tenancy) await db.exec(`update profiles set active_gym_id = gym_one() where id = 'a0000000-0000-4000-9000-00000000ad01';
    set request.jwt.claim.sub = 'a0000000-0000-4000-9000-00000000ad01';`);
  // ... seed loop (still as the owner role, so RLS does not apply; only auth.uid() is set) ...
  if (tenancy) await db.exec(`set request.jwt.claim.sub = '';`);
```

- [ ] **Step 5: Run the four existing rule scripts and `npm run build` in neither app** (no app
  change in this task). Rule scripts must stay green.

- [ ] **Step 6: Probe entry, `verify0098.sql`** (reports: untagged rows per table = 0; FKs without
  gym_id between gym tables = 0; `gym_settings` rows = number of gyms), **commit**:

```bash
git add supabase/migrations/0098_tenancy_tag_data.sql scripts/sql/tenancy-isolation.mjs scripts/sql/lib/live-db.mjs scripts/probe-migrations.py scripts/sql/verify/verify0098.sql
git commit -m "0098: every gym table carries the gym; keys and references per gym"
```

---

### Task 4: 0099 — the same-gym layer on every table, person tables and views

**Files:**
- Create: `supabase/migrations/0099_tenancy_same_gym_policies.sql`
- Modify: `scripts/sql/tenancy-isolation.mjs`, `scripts/probe-migrations.py`
- Create: `scripts/sql/verify/verify0099.sql`

**Interfaces:**
- Consumes: `tenancy_gym_tables()`, `current_gym_id()`, `gyms.status/paid_until`.
- Produces: `gym_writable(p_gym uuid default null) → boolean`; `gym_lock_reason() → text`
  (`'suspended'`, `'overdue'` or NULL — Part B shows it); policies named `tenant_select`,
  `tenant_insert`, `tenant_update`, `tenant_delete` on each gym table (AS RESTRICTIVE);
  `same_gym_person(p_user uuid) → boolean`.

- [ ] **Step 1: Add the 0099 checks** — the generic sweep over every table plus the targeted ones:

```js
// ---- 0099: nothing crosses, for every table and every role ------------------
const tables = (await db.query('select unnest(tenancy_gym_tables()) as t')).rows.map((r) => r.t);
for (const who of ['adminA', 'staffA', 'trainerA', 'memberA']) {
  await as(P[who]);
  for (const t of tables) {
    const seen = await one(`select count(*)::int as n from ${t} where gym_id = '${GYM_B}'`);
    if (seen.n) check(`${who} reads no Gym B rows in ${t}`, false, `${seen.n} rows`);
    await db.exec('begin');
    const upd = await db.query(`update ${t} set gym_id = gym_id where gym_id = '${GYM_B}'`);
    const del = await db.query(`delete from ${t} where gym_id = '${GYM_B}'`);
    await db.exec('rollback');
    if (upd.affectedRows || del.affectedRows) check(`${who} changes no Gym B rows in ${t}`, false,
      `updated ${upd.affectedRows}, deleted ${del.affectedRows}`);
  }
}
check('no role in Gym A reads, updates or deletes a Gym B row in any table', true);
await as(P.adminA);
check('Gym A admin still sees Gym A rows', (await one('select count(*)::int as n from memberships')).n > 0);
check('Gym A admin cannot insert into Gym B',
  !!(await fails(`insert into events (gym_id, title, starts_at) values ('${GYM_B}', 'x', now())`)));
check('Gym A admin cannot move a row into Gym B',
  (await db.query(`update events set gym_id = '${GYM_B}' where gym_id = '${GYM_A}'`)).affectedRows === 0 ||
  !!(await fails(`update events set gym_id = '${GYM_B}' where gym_id = '${GYM_A}'`)));
check('an insert with no gym lands in my gym',
  (await one(`insert into events (title, starts_at) values ('A event', now()) returning gym_id`)).gym_id === GYM_A);
await as(P.both);
check('two-gym member sees only the current gym (A: no B notification)',
  (await one(`select count(*)::int as n from notifications where title = 'B for both'`)).n === 0);
await db.exec(`select set_active_gym('${GYM_B}')`);
check('after switching to B, the B notification shows',
  (await one(`select count(*)::int as n from notifications where title = 'B for both'`)).n === 1);
await db.exec(`select set_active_gym('${GYM_A}')`);
// People: a gym sees its own people only.
await as(P.adminA);
check('Gym A admin cannot read a Gym-B-only profile',
  (await one(`select count(*)::int as n from profiles where id = '${P.memberB}'`)).n === 0);
check('Gym A admin cannot edit a Gym-B-only profile',
  (await db.query(`update profiles set first_name = 'x' where id = '${P.memberB}'`)).affectedRows === 0);
check('Gym A admin reads the shared member (member of both)',
  (await one(`select count(*)::int as n from profiles where id = '${P.both}'`)).n === 1);
// Views run as their owner: each must stop at the gym edge too.
for (const v of ['class_availability', 'public_trainers', 'trainer_busy_slots', 'my_trainer_members',
  'public_trainer_credentials', 'bookings_needing_attention', 'trainer_evaluation', 'trainer_evaluation_months', 'activity_feed']) {
  const r = await db.query(`select * from ${v}`).catch((e) => ({ err: describe(e) }));
  if (r.err) { check(`view ${v} readable`, false, r.err); continue; }
  const leak = r.rows.filter((x) => x.gym_id === GYM_B).length;
  check(`view ${v} shows no Gym B rows`, leak === 0 && (r.rows.length === 0 || 'gym_id' in r.rows[0]),
    leak ? `${leak} rows` : 'view has no gym_id column');
}
// Suspended / overdue: read-only.
await asOwner(); await db.exec(`update gyms set status = 'suspended' where id = '${GYM_B}'`);
await as(P.adminB);
check('a suspended gym can still read', (await one('select count(*)::int as n from memberships')).n > 0);
check('a suspended gym cannot write', !!(await fails(`insert into events (title, starts_at) values ('x', now())`)));
check('the lock reason says suspended', (await one('select gym_lock_reason() as r')).r === 'suspended');
await asOwner(); await db.exec(`update gyms set status = 'active', paid_until = current_date - 8 where id = '${GYM_B}'`);
await as(P.adminB);
check('8 days overdue is read-only', !!(await fails(`insert into events (title, starts_at) values ('x', now())`)));
await asOwner(); await db.exec(`update gyms set paid_until = current_date - 6 where id = '${GYM_B}'`);
await as(P.adminB);
check('6 days overdue still writes (7-day grace)', !(await fails(`insert into events (title, starts_at) values ('grace', now())`)));
await asOwner(); await db.exec(`update gyms set paid_until = null where id = '${GYM_B}'`);
// Policies that read profiles.role directly bypass the per-gym role.
const direct = await db.query(`select tablename, policyname from pg_policies
  where schemaname = 'public' and (qual ~ 'profiles' or with_check ~ 'profiles') and (qual ~ '\\mrole\\M' or with_check ~ '\\mrole\\M')`);
check('no policy reads profiles.role directly', direct.rows.length === 0,
  direct.rows.map((r) => r.tablename + '.' + r.policyname).join(', '));
```

- [ ] **Step 2: Run — expect many FAIL lines** (no restrictive policies yet).

- [ ] **Step 3: Write `0099_tenancy_same_gym_policies.sql`:**

```sql
-- 0099 — One same-gym layer on every gym table. RESTRICTIVE policies are ANDed
-- with the permissive ones, so every existing rule keeps its meaning and simply
-- stops at the gym's edge. A suspended gym, or one more than 7 days past its
-- paid-until date, reads but cannot write.

create or replace function gym_lock_reason(p_gym uuid default null) returns text
language sql stable security definer set search_path = public as $$
  select case when g.status = 'suspended' then 'suspended'
              when g.paid_until is not null and g.paid_until < (now() at time zone 'Asia/Manila')::date - 7 then 'overdue'
         end
  from gyms g where g.id = coalesce(p_gym, current_gym_id());
$$;
create or replace function gym_writable(p_gym uuid default null) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_gym, current_gym_id()) is not null and gym_lock_reason(p_gym) is null;
$$;

do $$ declare t text; begin
  foreach t in array tenancy_gym_tables() loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_select on %I', t);
    execute format('drop policy if exists tenant_insert on %I', t);
    execute format('drop policy if exists tenant_update on %I', t);
    execute format('drop policy if exists tenant_delete on %I', t);
    execute format('create policy tenant_select on %I as restrictive for select to authenticated, anon
                    using (gym_id = current_gym_id())', t);
    execute format('create policy tenant_insert on %I as restrictive for insert to authenticated, anon
                    with check (gym_id = current_gym_id() and gym_writable())', t);
    execute format('create policy tenant_update on %I as restrictive for update to authenticated, anon
                    using (gym_id = current_gym_id() and gym_writable())
                    with check (gym_id = current_gym_id())', t);
    execute format('create policy tenant_delete on %I as restrictive for delete to authenticated, anon
                    using (gym_id = current_gym_id() and gym_writable())', t);
  end loop;
end $$;

-- Library tables: read the shared library plus your own; write only your own.
-- (exercises, workout_resources — same four policies with `gym_id is null or` on select only.)

-- People. A profile is visible to itself and to anyone in a gym it belongs to.
create or replace function same_gym_person(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user = auth.uid()
      or exists (select 1 from gym_roles where user_id = p_user and gym_id = current_gym_id());
$$;
-- tenant_select / tenant_update on profiles, push_subscriptions, notification_prefs:
--   profiles: using (same_gym_person(id)); push_subscriptions & notification_prefs: using (same_gym_person(user_id))

-- Views: each view that runs as its owner gains `gym_id` in its select list and
-- `where <base>.gym_id = current_gym_id()`. Recreate each from its LAST definition
-- (grep 'create or replace view <name>' across migrations; take the highest number).
--   class_availability, public_trainers, trainer_busy_slots, my_trainer_members,
--   public_trainer_credentials, bookings_needing_attention, trainer_evaluation,
--   trainer_evaluation_months. activity_feed is security_invoker (0037) — it only
--   needs gym_id added to its select list.
-- trainer_busy_slots stays across gyms (R6) but exposes no gym_id-bearing detail
-- beyond trainer_id/start/end; add gym_id and filter it like the others only if
-- its columns include class names or member ids.

create or replace function migration_0099_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0099_applied() from public, anon;
grant execute on function migration_0099_applied() to authenticated;
```

  Replace every comment that describes SQL with the SQL itself before running (the library
  policies; the profiles/push_subscriptions/notification_prefs restrictive policies; each view's
  full `create or replace view` recreated from its last definition with `gym_id` and the filter).
  **`create or replace view` cannot drop or reorder columns** — append `gym_id` as the last column.

- [ ] **Step 4: Fix every policy the "reads profiles.role directly" check names.** Rewrite each as
  `get_my_role() = '<role>'` (its meaning is now "in my current gym") in this same migration: `drop
  policy … ; create policy …` copied from its last definition with only that expression changed.

- [ ] **Step 5: Run the harness until every check passes.** A failure on a specific table in the
  sweep usually means a permissive policy is `to public` and the restrictive one names only
  `authenticated, anon` — they still AND, so look instead for a table whose RLS was **off** (RLS off
  means no policy applies; the loop enables it — check the table was in the list).

- [ ] **Step 6: Existing rule checks stay green; probe entry; verify0099.sql** (reports: gym tables
  with RLS off = 0; gym tables missing any of the four tenant policies = 0), **commit**:

```bash
git add supabase/migrations/0099_tenancy_same_gym_policies.sql scripts/sql/tenancy-isolation.mjs scripts/probe-migrations.py scripts/sql/verify/verify0099.sql
git commit -m "0099: the same-gym layer on every table, person tables and views; read-only when suspended"
```

---

### Task 5: 0100 — accounts, memberships, payments, cash, refunds

**Files:**
- Create: `supabase/migrations/0100_tenancy_accounts_money.sql`
- Modify: `scripts/sql/tenancy-isolation.mjs`, `scripts/probe-migrations.py`
- Create: `scripts/sql/verify/verify0100.sql`

**Interfaces:**
- Consumes: R1–R6; `current_gym_id()`, `gym_roles`, `gym_writable()`.
- Produces: same signatures as today for every function below, except:
  `set_account_status(p_user uuid, p_status text, ...)` now writes `gym_roles` in the caller's gym
  (and keeps writing `profiles.status` so today's apps show the change);
  `handle_new_member_signup` reads `raw_user_meta_data->>'gym_id'` (uuid; default `gym_one()`),
  inserts `gym_roles(gym, id, 'member', 'pending_approval')`, `member_profiles` and
  `pending_registrations` in that gym, and sets `profiles.active_gym_id`;
  `request_to_join(p_gym uuid) → void` (new: a signed-in person asks to join another gym — inserts
  `gym_roles` pending, `member_profiles`, `pending_registrations` in that gym).

Functions in this group, with the change each needs (from `definer-inventory.py`):

| Function | Change |
|---|---|
| handle_new_member_signup | gym from metadata (above) |
| apply_registration_details | R1 on member_profiles (`gym_id = current_gym_id()`) |
| set_account_status, account_lockout_reason | R3: status in gym_roles for the caller's gym; account_status_events gets gym_id (R2) |
| prevent_profile_privilege_escalation, prevent_member_profile_tamper | R3 for the caller's role; unchanged otherwise |
| claim_freemium_trial, free_tier_plan, current_membership_of, plan_allows, my_features, plan_member_counts, retire_plan, sync_plan_features, trg_seed_plan_features | R1 on membership_plans/memberships/plan_features/freemium_trials |
| freezes_this_month, frozen_days_last_year, enforce_freeze_frequency, trg_membership_event_guard | R1 via the membership's gym |
| request_renewal, decline_renewal_request, withdraw_renewal_request, trg_fulfil_renewal_request, trg_payment_plan_snapshot | R1/R2 |
| next_invoice_number, set_payment_invoice_number | counter per (gym_id, year): `next_invoice_number(p_gym uuid default null)`; the trigger passes `NEW.gym_id` |
| cash_day_summary, close_cash_day | R1: the caller's gym; cash_closeouts keyed (gym_id, day) |
| refund_quote | R1; reads gym_settings **for that gym** (`where gym_id = v_gym`, not `limit 1`) |
| sees_demo_data | unchanged (demo is Gym #1 only) |
| is_email_taken, is_phone_taken, normalize_phone, sync_profile_email, display_name_of | global — unchanged |

- [ ] **Step 1: Add the group-1 checks to the harness:**

```js
// ---- 0100: accounts and money stay in one gym --------------------------------
await as(P.adminB);
const cashB = await one(`select * from cash_day_summary(current_date)`);
check('Gym B cash summary counts only Gym B payments', Number(cashB.cash_in ?? cashB.total_in ?? 0) === 999,
  JSON.stringify(cashB));
const invB = await one(`select next_invoice_number() as n`);
check('invoice numbers are per gym (Gym B starts again)', /0002$/.test(invB.n), invB.n);
await as(P.adminA);
check('Gym A admin cannot change a Gym-B-only account status',
  !!(await fails(`select set_account_status('${P.memberB}', 'suspended', 'test')`)));
await db.exec(`select set_account_status('${P.both}', 'suspended', 'test')`);
await asOwner();
const bothB = await one(`select status from gym_roles where user_id = '${P.both}' and gym_id = '${GYM_B}'`);
check('suspending in Gym A leaves Gym B untouched', bothB.status === 'active', bothB.status);
await db.exec(`update gym_roles set status = 'active' where user_id = '${P.both}'`);
// Sign-up into a chosen gym.
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('5a000000-0000-4000-8000-000000000001', 'joinb@corefitness-test.com',
   '{"signup_source":"member_self_registration","first_name":"Join","last_name":"B","gym_id":"${GYM_B}"}')`);
const joined = await one(`select gym_id::text, role::text, status from gym_roles where user_id = '5a000000-0000-4000-8000-000000000001'`);
check('sign-up lands in the chosen gym, pending', joined.gym_id === GYM_B && joined.status === 'pending_approval', JSON.stringify(joined));
await as(P.memberA);
await db.exec(`select request_to_join('${GYM_B}')`);
await asOwner();
check('asking to join another gym is pending there',
  (await one(`select status from gym_roles where user_id = '${P.memberA}' and gym_id = '${GYM_B}'`)).status === 'pending_approval');
```

  **Before relying on a column name** (`cash_in`, `total_in`, the `set_account_status` argument list),
  read the function's last definition — the check is written against what it returns; correct the
  test if the name differs, not the function.

- [ ] **Step 2: Run — the 0100 checks fail.**
- [ ] **Step 3: Write 0100.** For each row of the table: copy the last definition (file named by the
  inventory) into 0100, apply the listed change, keep the signature (R5). `next_invoice_number`
  gains a parameter, so: `drop function if exists next_invoice_number();` then create
  `next_invoice_number(p_gym uuid default null)`. Add `request_to_join`. End with the marker function.
- [ ] **Step 4: Run the harness until green; run the four rule scripts; run
  `python scripts/sql/definer-inventory.py` and confirm every group-1 function now names 0100.**
- [ ] **Step 5: Probe entry, verify0100.sql** (reports Gym #1's next invoice number equals today's
  pattern — the counter carried over), **commit**
  `git commit -m "0100: accounts, memberships, payments, cash and refunds stay in one gym"`.

---

### Task 6: 0101 — classes, bookings, waitlist, 1-on-1, trainers

**Files:** Create `supabase/migrations/0101_tenancy_schedule.sql`, `scripts/sql/verify/verify0101.sql`;
modify the harness and the probe.

**Interfaces:** Same signatures as today (R5). No new functions.

| Function | Change |
|---|---|
| cancel_booking, trg_stamp_booking_decision, trg_stamp_pt_decision, trg_trainer_class_edit_guard | R3 (role of the actor in the row's gym), R1 |
| class_seats_left, class_waitlist_status, join_waitlist, leave_waitlist, waitlist_offer, trg_bookings_waitlist, trg_classes_waitlist | R1 via the class's gym; R2 on class_waitlist/notifications |
| enforce_class_booking_entitlement, enforce_pt_entitlement | R1 (membership in the booking's gym) |
| generate_class_instances | R1/R2: templates and classes of `current_gym_id()`; takes `p_gym default null` (R4) |
| is_my_trainee, member_commitments, may_rate_trainer, trainer_may_see | R1 (bookings/sessions in the current gym) |
| reassign_pt_session, remind_trainer, suggest_trainers_for_session | R1/R3: only trainers with an active trainer role in the session's gym |
| sweep_stale_requests | R4 |
| trainer_month_summary, trainer_stats, trainer_schedule_conflicts, trainer_credential_summary, trg_credential_* , admin_trainer_evaluations, my_trainer_ratings, mark_feedback, gym_traffic | R1 |
| assert_member_free, assert_trainer_free, trg_*_overlap | **unchanged (R6)** |

- [ ] **Step 1: Harness checks:**

```js
// ---- 0101: the timetable stays in one gym ------------------------------------
await as(P.memberA);
const bClass = await one(`select id from classes where name = 'Gym B Spin'`);
check('Gym A member cannot see a Gym B class', bClass === undefined);
await asOwner();
const bClassId = (await one(`select id from classes where name = 'Gym B Spin'`)).id;
await as(P.memberA);
check('Gym A member cannot book a Gym B class by id',
  !!(await fails(`insert into bookings (member_id, class_id) values ('${P.memberA}', '${bClassId}')`)));
check('class_seats_left of a Gym B class reveals nothing to Gym A',
  (await one(`select class_seats_left('${bClassId}') as n`)).n === null);
await as(P.adminA);
const conflicts = await db.query(`select * from trainer_month_summary(date_trunc('month', current_date)::date)`);
check('trainer_month_summary lists only Gym A trainers',
  !conflicts.rows.some((r) => r.trainer_id === P.trainerB), JSON.stringify(conflicts.rows.slice(0, 2)));
await as(P.trainerA);
check('a Gym A trainer is not the trainee-holder of a Gym B member',
  (await one(`select is_my_trainee('${P.memberB}') as ok`)).ok === false);
```

  (Read `trainer_month_summary`'s and `class_seats_left`'s last definitions for real argument and
  column names before running; correct the test, not the function.)
- [ ] **Step 2: Run — fails.** **Step 3: Write 0101** per the table and R1–R6. **Step 4: Green
  harness + four rule scripts** (booking-conflicts and trainer-decisions exercise these functions —
  they must still pass). **Step 5: Probe, verify0101.sql, commit**
  `git commit -m "0101: classes, bookings, waitlist and 1-on-1 stay in one gym"`.

---

### Task 7: 0102 — points, badges, challenges, goals, rewards, workouts

**Files:** Create `supabase/migrations/0102_tenancy_engagement.sql`, `scripts/sql/verify/verify0102.sql`;
modify the harness and the probe.

| Function | Change |
|---|---|
| award_points, trg_points_checkin, trg_points_workout, trg_points_goal, award_due_session_points | R1: rule from `point_rules` **of the source row's gym**; R2: ledger row gets that gym |
| member_points_balance, reward_wishlist_counts, decide_redemption, mark_redemption_collected, trg_validate_redemption, trg_redemption_decided, trg_notify_reward_reachable | R1 |
| award_achievement, revoke_achievement, guard_achievement_delete, sync_my_achievements, achievement_progress, achievement_rarity, log_achievement_activity | R1: achievements and unlocks of the gym; rarity's population = members **of that gym** |
| member_training_stats, member_progression, trainer_stats (if not done in 0101) | R1: attendance, bookings, logs of the current gym |
| challenge_progress, challenge_standings, settle_challenges | R1; settle_challenges is a sweep (R4) |
| goal_current_value, goal_is_reached, goal_progress, goal_template_count, goal_value_of, settle_goals, settle_goals_for, settle_my_goals, trg_guard_goal_achieved | R1; settle_goals is a sweep (R4) |
| member_exercise_history, workout_session_summary, exercise_routine_counts, resource_save_counts, trg_gym_plan_routine_is_mine | R1 (library rows with NULL gym stay readable) |
| jsonb_metric_value | pure — unchanged |

- [ ] **Step 1: Harness checks:**

```js
// ---- 0102: points and badges are earned and counted per gym -----------------
await asOwner();
await db.exec(`insert into attendance (gym_id, member_id) values ('${GYM_B}', '${P.both}')`);
await as(P.both);   // current gym: A
const balA = await one(`select member_points_balance('${P.both}') as n`);
await db.exec(`select set_active_gym('${GYM_B}')`);
const balB = await one(`select member_points_balance('${P.both}') as n`);
await db.exec(`select set_active_gym('${GYM_A}')`);
await asOwner();
const ledger = await db.query(`select gym_id::text, sum(points)::int as p from point_ledger where member_id = '${P.both}' group by 1`);
const byGym = Object.fromEntries(ledger.rows.map((r) => [r.gym_id, r.p]));
check('points balance in each gym is that gym\'s ledger only',
  Number(balA.n) === (byGym[GYM_A] ?? 0) && Number(balB.n) === (byGym[GYM_B] ?? 0), JSON.stringify({ balA, balB, byGym }));
check('a Gym B check-in earned points under Gym B\'s rules, in Gym B', (byGym[GYM_B] ?? 0) > 0);
await as(P.adminB);
const rare = await db.query(`select * from achievement_rarity()`);
check('achievement rarity is computed over Gym B members only', rare.rows.every((r) => Number(r.holders ?? 0) <= 3),
  JSON.stringify(rare.rows.slice(0, 2)));
await as(P.adminA);
const stand = await db.query(`select * from challenge_standings((select id from challenges where gym_id = '${GYM_A}' limit 1))`);
check('challenge standings list no Gym B member', !stand.rows.some((r) => [P.memberB].includes(r.member_id)));
```

  (Real column names first — `holders`, `member_id` — from the last definitions.)
- [ ] **Steps 2–5:** fail → write 0102 → green harness, rule scripts **and
  `npm run check:achievements` in `g-fitness-member`** → probe, verify0102.sql, commit
  `git commit -m "0102: points, badges, challenges and goals are per gym"`.

---

### Task 8: 0103 — notifications, reminders, activity log, errors

**Files:** Create `supabase/migrations/0103_tenancy_notify_activity.sql`, `scripts/sql/verify/verify0103.sql`;
modify the harness and the probe.

| Function | Change |
|---|---|
| notify_once | takes `p_gym uuid default null` (R5: drop old signature first); dedupe per (gym, user, key); inserts `gym_id` (R2) |
| notify_trainer_of_class_booking, notify_trainer_of_pt_cancel, notify_trainer_of_pt_request, trg_notify_achievement, trg_notify_goal_reached, trg_notify_trainer_feedback | pass `NEW.gym_id` |
| send_due_gym_reminders, send_membership_expiry_reminders, send_upcoming_session_reminders | R4 sweeps; recipients' role/status from gym_roles (R3) |
| log_activity and every log_*_activity trigger, activity_member_name | R2: activity_log row gets the source row's gym |
| prevent_notification_tamper, touch_assistant_conversation | R1 |
| client_errors_cap, prune_client_errors | per gym cap (`gym_id` may be NULL for errors before sign-in) |
| pg_cron jobs | re-schedule each sweep with no argument (loops all active gyms) — `cron.schedule` calls guarded by the existing "if pg_cron exists" pattern |

- [ ] **Step 1: Harness checks:**

```js
// ---- 0103: messages and the activity log stay in one gym ----------------------
await asOwner();
await db.exec(`select send_membership_expiry_reminders()`);   // no caller: every active gym
const cross = await one(`select count(*)::int as n from notifications n
  where not exists (select 1 from gym_roles r where r.user_id = n.user_id and r.gym_id = n.gym_id)`);
check('no notification is filed in a gym its recipient is not part of', cross.n === 0, `${cross.n}`);
await as(P.both);
await db.exec(`select notify_once('${P.both}', 'system', 'Same key', 'A', null, 'same-key')`);
await db.exec(`select set_active_gym('${GYM_B}')`);
await db.exec(`select notify_once('${P.both}', 'system', 'Same key', 'B', null, 'same-key')`);
await db.exec(`select set_active_gym('${GYM_A}')`);
await asOwner();
check('the same dedupe key notifies once per gym',
  (await one(`select count(*)::int as n from notifications where user_id = '${P.both}' and metadata->>'dedupe' = 'same-key'`)).n === 2);
await as(P.adminA);
check('the activity feed shows no Gym B activity',
  (await one(`select count(*)::int as n from activity_feed where gym_id = '${GYM_B}'`)).n === 0);
```

  (`notify_once`'s real argument order is in 0053 — match it.)
- [ ] **Steps 2–5:** fail → write 0103 → green harness and rule scripts → probe, verify0103.sql, commit
  `git commit -m "0103: notifications, reminders and the activity log are per gym"`.

- [ ] **Step 6: The completeness gate.** Run `python scripts/sql/definer-inventory.py`. Every
  function whose table list includes a gym table must show 0097–0103 as its last definition, **or**
  be in the "unchanged" rows above (R6 clash checks; global identity functions; `jsonb_metric_value`;
  `sees_demo_data`). Write the list of deliberate exceptions into `docs/DATA_ACCESS.md` under a new
  heading *Tenancy*. Any other function still on an old migration is a gap: add it to 0103.

---

### Task 9: Paste runbook, docs, CLAUDE.md, CI green

**Files:**
- Modify: `docs/DATA_ACCESS.md` (Tenancy: current gym, restrictive layer, R1–R6, exceptions),
  `docs/MIGRATION_STATUS.md` (0097–0103 and their verify scripts), `docs/VERIFYING.md`
  (the isolation harness), `CLAUDE.md` (Roadmap line; one Architecture paragraph on tenancy —
  keep the file at ≤ 200 lines by trimming elsewhere), `scripts/sql/verify/README.md`.

- [ ] **Step 1: Full local run.** From `scratchpad/sqlharness`: replay with both seeds, the four rule
  scripts, `tenancy-isolation.mjs`. All green. Then both apps: `npm run build` (no app code changed —
  this proves nothing broke in types) and the 12 fixture checks
  (`UI_CHECKS_CHANNEL=chrome node <repo>/scripts/ci/run-ui-checks.mjs`) with both dev servers up.
- [ ] **Step 2: Push; CI must be green** (`gh run list --limit 1`, then `gh run view <id>`).
- [ ] **Step 3: Hand the user the paste order** — before the first paste, run the backup workflow by
  hand (`gh workflow run backup.yml`, then confirm it succeeded); then 0097 → verify0097 → 0098 →
  verify0098 → … → 0103 → verify0103, one at a time; after each, `python scripts/probe-migrations.py`.
  After 0103: open the live phone app and admin app as today — everything must look and behave as
  before (Gym #1 is the only gym).
- [ ] **Step 4: Commit docs** —
  `git commit -m "Tenancy: docs, runbook, CLAUDE.md"` and push.

---

## Self-review notes (kept for the executor)

- **Spec coverage:** gyms/gym_roles/platform_admins/gym_applications/active gym → Task 2;
  gym_id + keys + seed defaults + accent + list_gyms → Task 3; same-gym rules, suspended/overdue,
  person tables, views → Task 4; definer groups (1)–(4) → Tasks 5–8; isolation in CI → Tasks 1, 9;
  migration of existing data to Gym #1 and apps unchanged → Tasks 2–3, checked in Task 9;
  backup before paste → Task 9. The platform app, admin on Vercel, picker, branding UI and website
  are Parts B–D and get their own plans.
- **Known judgement calls an executor may hit:** `create or replace view` column order (append
  `gym_id` last); a new parameter list is a new function (drop first, R5); demo seeds run as the
  real admin in the harness so the `gym_id` default resolves.
