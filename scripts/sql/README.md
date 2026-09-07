# The SQL harness

Runs the migrations' own rules against **real PostgreSQL** and asserts what they
do — refusals included — without Supabase credentials, without Docker, and
without anybody's password.

## Why this exists

Every other check in this repository stops at the application. `plan-gates.js`
and `trainer-scenarios.js` prove the *app* agrees with the rules and warns a
member before the write; they route the network, so nothing they do reaches
Postgres. The rules themselves live in triggers, policies and SECURITY DEFINER
functions, and until these scripts existed **none of that had ever been
executed** outside the live project.

The first run found a real bug — see `0074_decision_guard_runs_first.sql`.

## Running them

Docker has never started in this environment, so these use
[`@electric-sql/pglite`](https://pglite.dev) — PostgreSQL compiled to WASM,
in-process. It is not a project dependency: neither app should carry a test
database in its bundle, so install it wherever you are running from.

```bash
npm install @electric-sql/pglite
```

Then, from that directory, pass the path to the repository root:

```bash
node <path-to>/scripts/sql/booking-conflicts.mjs "<path-to-repo>"
```

| Script | Migration under test | Checks |
|---|---|---|
| `booking-conflicts.mjs` | 0068 | 18 |
| `trainer-decisions.mjs` | 0071 + 0074 | 24 |
| `reasons-and-limits.mjs` | 0057, 0069 + 0074 | 24 |

Each exits non-zero if anything fails, so they can be chained.

## How they are built, and the three traps

Each script stubs **only the tables the migration touches**, to the same column
types the real ones use, then applies the migration file **verbatim from
`supabase/migrations/`**. Nothing is retyped, so a script cannot drift from the
migration it is testing.

- **Reproduce Supabase's roles first.** `create role anon; authenticated;
  service_role;` — nearly every migration here revokes from `anon`, and a
  missing role fails the whole file with an error that looks nothing like the
  rule you were testing.
- **A table owner bypasses RLS entirely.** An assertion run as `postgres` passes
  whether or not the policy works. `as(uid)` in `trainer-decisions.mjs` does
  `set role authenticated` and then **asserts `current_user`** before anything
  after it is believed.
- **Copy the real function's modifiers, not just its body.** `get_my_role()` is
  `security definer`; a stub without those words makes every policy that calls
  it fail with 42501 for a reason that has nothing to do with the rule.

## What they do not cover

`plan_allows()` and the entitlement gates (TEST_MATRIX §2.6) are not here yet —
they sit on `current_membership_of` and `membership_is_usable`, so the fixture
is a layer deeper. That row still needs a signed-in member against the live
project.
