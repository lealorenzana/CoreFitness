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

## What the apps read (Part B, 0104)

- **`my_gym_context()`** answers "who am I, where": gym, role and status *there*, branding, lock
  reason, and how many gyms this person belongs to. Every sign-in gate in both apps reads it —
  never the legacy `profiles.role`. Before 0104 is pasted both apps fall back to `profiles`, which
  is exactly right while there is one gym (`lib/gymContext.ts`, in each app; diff before you copy).
- **`gym_people`** is `profiles` with this gym's role and status in place of the legacy columns, so
  a list screen swaps the table name and keeps its filters. Fifteen admin queries and two member
  ones read it.
- **`add_person_to_gym()` / `set_gym_role()`** are how an account joins a gym or changes role; the
  three `create-*` Edge Functions call the first **as the caller**, so the rules decide, not the
  service key. **`public_plans(gym)`** lets someone with no account see the plans of the gym they
  are signing up to — that step had nothing to show before.
- **The picker.** One gym: no picker, ever. Several: at sign-in and from More → Gyms (phone) or
  `/admin/choose-gym`. The gym is remembered (it is `profiles.active_gym_id`), so a relaunch goes
  straight in. Switching reloads the app, which is the only sure way to drop every memory cache.
- **Colour.** Eight accents (`g-fitness-member/src/lib/gymTheme.ts`, chosen in admin Settings →
  Branding). They replace violet only; amber keeps its meaning. `scripts/accent-contrast.mjs`
  proves each text shade clears 4.5:1, so a gym cannot make its own app unreadable.

## Transition leftovers (removed by the clean-up after Part B)

- **Gone in 0105:** the three `*_transition` keys (share preferences, body measurements, coach
  ratings). Part B's apps name the gym in those upserts, so a person in two gyms can now be
  measured in both on the same day. **Paste 0105 only after the member app carrying Part B is
  deployed** — an older copy still open on a phone would upsert on a key that no longer exists.
- **Still here on purpose:** `trg_mirror_profile_role` and `profiles.active_gym_id default
  gym_one()`. Three admin paths still write `profiles.status` directly (archive a member, suspend a
  coach, suspend a staff account). Each needs a reason dialog before it can move to
  `set_account_status()`, and inventing a reason to satisfy 0069 would be worse than waiting.
- Sign-up without a `gym_id` in its metadata (an older app build) still lands in Gym #1.

## Proving it

`scripts/sql/tenancy-isolation.mjs` (in CI on every push): two gyms on the real migrations and
demo data, every role, **every table** (read, update, delete across the edge), every view, and
the definer functions group by group — 120 checks. It also fails on an unclassified table, a
policy that reads `profiles.role`, a table with RLS off, or a gym-to-gym foreign key without
`gym_id`. The demo seeds run where they ran live, before 0097, so the backfills meet them as they
will in production.

## The four apps (Parts C and D)

| App | Who | Where |
|---|---|---|
| `g-fitness-member` | members and coaches | `corefitness-gym.vercel.app` (and the APK) |
| `g-fitness-admin` | gym owners and their front desk | `corefitness-admin.vercel.app` |
| `corefitness-platform` | the platform owner | **localhost only**, `:5175` |
| `corefitness-site` | anyone | `corefitness-site.vercel.app` |

The platform app stays off the internet on purpose: letting a gym in and
suspending one are the two most consequential actions in the system. It calls
only 0106's functions — gyms with counts and status, applications, crash
reports and its own decision log — and the isolation harness asserts it reads
no member, payment or attendance row of any gym.

### Letting a gym in, end to end (0107)

Creating the gym and creating its owner are deliberately two acts, because they
need two different powers. `create_gym()` is SQL: it makes the gym and copies
Gym #1's **rules** — plans, point rules, cancellation reasons, goal templates,
badges, settings — and none of its **identity**, so no gym ever inherits
another's address, phone or logo on its own receipts. Making a login needs the
Auth admin key, which no SQL function and no browser may hold; that half is the
`approve-gym` Edge Function, called from the platform app.

`approve-gym` creates the account with a **temporary password it returns once**,
and the platform app shows it to hand over. Nothing in this project sends mail,
so no screen claims an invitation was emailed. If the address already belongs to
someone here, no second account is made — a role is per gym, a person is not —
and `make_gym_owner()` simply adds the gym to them.

The gym is then real but blank, and `gyms.onboarded_at` is NULL. The admin app
sends its **owner** to `/admin/setup` — gym details, hours, accent, plan prices,
and their own password in place of the temporary one — and tells **staff** that
the owner has not set the gym up yet, because those are not the desk's to
decide. `finish_gym_setup()` stamps the date, once; every field stays editable
on Settings and Membership Plans afterwards. 0107's backfill stamped every gym
that was already configured, so no existing gym meets the wizard.

The platform's own list carries `owners` and `onboarded`, so a gym nobody can
sign into is visible as exactly that.

### What the service sells, and the three gates (0108–0110)

The platform→gym relationship is deliberately the **same shape** as the
gym→member one, one level up, so there is one idiom here rather than two:

| gym → member (0049)  | platform → gym (0108)    | what it is                |
|----------------------|--------------------------|---------------------------|
| `membership_plans`   | `platform_plans`         | what is sold              |
| `features`           | `platform_features`      | what can be sold          |
| `plan_features`      | `platform_plan_features` | what this plan includes   |
| `plan_allows()`      | `gym_plan_allows()`      | the single question       |
| `payments`           | `gym_payments`           | that it was paid for      |

Prices live in those rows, not in code: the website reads `public_plans()`, so a
price change is one edit and never disagrees with what a gym is charged. A price
left NULL means **not decided** and the page says "Talk to us" — NULL is never
zero. `gyms.paid_until` is the consequence of `record_gym_payment()`, and a late
payment covering an old period never pulls a gym's access in.

A `max_members` on a plan is enforced by a **trigger on `gym_roles`**, not by a
screen, so it holds on every road into a gym — the desk, an approval, an Edge
Function, the platform itself. It fires on the way *in* only, so a gym over a
lowered cap can still archive its way back under it.

**Three gates decide whether a member sees a feature, and the honest treatment
differs:**

| gate | function | when it says no |
|---|---|---|
| the gym's plan | `gym_plan_allows()` (0108) | **hide** |
| the gym's own choice | `gym_module_on()` (0110) | **hide** |
| the member's membership | `plan_allows()` (0049) | **lock and explain** |

The first two mean the member can never have it however much they pay, so a lock
would advertise something that will never open. The third they can change, so
0049's rule stands unaltered. `gym_module_on()` folds the first two together
because a member cannot act on either, and the gym owner's own settings screen
is the one place that separates them (`my_gym_modules()` returns `not_sold` vs
`off`, and offers no switch for the former).

A gym also owns **its own words** (`points_name`, `welcome_message` — Gym #1
keeps "CORE Points"; every other gym starts at plain "Points") and **its own
door**: `open` (listed, anyone may ask), `code` (unlisted; link or a six-character
code, replaceable when it leaks) or `closed` (the desk creates every account).

### Its own nouns, and its own address (0114)

`gym_settings.vocabulary` is a jsonb of exactly six nouns — `member(s)`,
`trainer(s)`, `class(es)`. The allowed keys are enforced by a CHECK through
`gym_vocabulary_keys_ok()`, so a typo in a client is an error rather than a word
that silently never appears, and a value that is not a short string is refused
rather than coerced. **A missing key means the English word**, so a gym that
never opened the setting reads byte for byte as it did before the column
existed; typing the default back in stores nothing, so "reset" and "never set"
are one row rather than two that drift. `gym_vocabulary()` always returns all
six, merged, so no screen has to know which were overridden. In the member app
`visibleDestinations()` skips the rename entirely unless `hasOwnWords()` — so
`t()` still finds its translations for every gym that did not rename anything,
and a gym that did gets its own word untranslated, which is right: "PTs" is that
gym's proper noun, not a string with a Filipino equivalent.

`set_gym_slug()` lets the **owner** move `/join/<slug>`, which until 0114 only a
platform admin could do — so a gym created as `core-fitness` and later renamed
"G Fitness" handed its members a link with somebody else's name on it, and the
link is printed on posters. Deliberately the *same* rules as
`platform_rename_gym()` (lowercase, digits, single dashes, 3–40, unique): two
rule sets for one column is how a link that works on one screen 404s from
another. It refuses while `gym_writable()` is false, so a suspended gym cannot
move its door and **neither can a support session** (0113). Both the gym's own
activity log and the platform log record the move, because "every link you
already shared has stopped working" is the kind of fact somebody rings about.

**`/join/<slug>` reads `gym_by_slug()`, never `list_gyms()`.** `list_gyms()`
returns only gyms whose rule is `open` — so the gyms whose entire joining story
*is* that link were the one case it could never find, and a `code` gym's own
link answered "No gym by that name". Searching is the listed question; a link is
the addressed one.

The website writes the one row a stranger may write anywhere here: a `pending`
`gym_applications` row (0097). The status and shape are enforced in SQL, not in
the form, and the page has a honeypot field for bots. Its prices live in
`corefitness-site/src/pricing.ts`; a tier with no number says "Talk to us"
rather than inventing one.

## Pasting 0097–0103

1. Run the backup by hand first: GitHub → **Actions → Weekly database backup → Run workflow**, and
   wait for the green tick ([BACKUPS](BACKUPS.md)).
2. Paste one at a time, in order. After each, paste its `scripts/sql/verify/verifyNNNN.sql`
   (read-only; it ends in an error that *is* the report) and stop at any **NOT OK**; then
   `python scripts/probe-migrations.py`.
3. After 0103, open both apps as usual: nothing should look or behave differently — Gym #1 is the
   only gym. The first row of `platform_admins` is pasted by hand (Part C).
