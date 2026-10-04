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
| `demo-removal.mjs` | 0117 | `remove_demo_data()` against **both real seeds**: the demo goes, a real member beside it keeps their payment and their auth row, nothing is left pointing at a deleted person, and a second run is safe. Irreversible in production, so the proof comes before the button |
| `onboarding-payments.mjs` | 0148 + 0149 | an application with a plan and a status link (anon), the conversation, payment methods, a gym's payment claim (owner only, once per reference, allowed while overdue) and the platform's verify/reject; the check-in drill-down, AI per gym, support access only while granted (and never an invitation's token), the password reset's refusals |
| `gym-terms.mjs` | 0154 | an applicant agrees to a dated version of the gym documents by their status token, once (a second call cannot move it; a wrong token is a plain "no"); malformed and future versions refused; anon can neither read nor write the columns; the platform sees it, a gym member sees no applications; `platform_public_terms()` gives a stranger the grace/reminder/contact facts and nothing else |
| `member-terms.mjs` | 0155 | which version of the member Terms/Privacy a member agreed to: at sign-up through the real auth trigger chain (versions sent, none sent, malformed — the sign-up never fails), no tick no record; a member reads only their own and cannot write, rewrite or delete one; the desk reads its gym's, another gym nothing; `accept_member_terms()` records a newer version once, refuses future/malformed/empty and non-members; the backfill marks earlier consents `unversioned` and never twice |
| `gym-owner-terms.mjs` | 0156 | the platform publishes a version of the gym documents (malformed and future dates refused, owners cannot) and the website reads it; only an **active** owner of the gym agrees, only to the version in effect, once for the gym (a second owner cannot move it); desk, members, archived owners, other gyms and anon cannot; nobody writes the table; the platform sees every gym's agreement; setting back to draft keeps agreements already given |
| `house-rules.mjs` | 0157 | a gym's own house rules: only an active owner publishes (not the desk, members, or a read-only gym); a version can never be edited, not even by the table owner; the same words twice are refused; a member agrees only to the version in effect and only at their own gym, once; a coach cannot; the desk sees every version with how many agreed; nothing crosses gyms; an empty version withdraws them |
| `tenancy-isolation.mjs` | 0097–0103, on **every** real migration + both demo seeds | two gyms, every role, every table, every definer function: nothing crosses |

`lib/live-db.mjs` builds the real schema (every migration, Supabase's stubs and grants) and is
shared by `replay-migrations.mjs` and `tenancy-isolation.mjs`. `definer-inventory.py` lists every
function at its **last** definition and the tables it touches — start any function rewrite there.

Each exits non-zero if anything fails, so they can be chained.

## How they are built, and the three traps

Each script stubs **only the tables the migration touches**, to the same column
types the real ones use, then applies the migration file **verbatim from
`supabase/migrations/`**. Nothing is retyped, so a script cannot drift from the
migration it is testing.

- **Reproduce Supabase's *default privileges*, not a sweep of grants.** `live-db.mjs` used to
  re-run `grant all on all tables ... to anon` after the last migration, which undid every
  `revoke ... from anon` any migration had written: a revoke was untestable and `anon` was more
  privileged in the harness than in production. It now sets `alter default privileges` before the
  migrations, which is what Supabase uses and what grants at creation, so a later revoke survives.
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
