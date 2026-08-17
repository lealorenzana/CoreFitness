# Core Fitness — Supabase Setup

One-time setup, entirely on the free tier. Do this once; the two apps (`g-fitness-admin`,
`g-fitness-member`) then share this single project as their backend.

## 1. Create the project

1. Go to [supabase.com](https://supabase.com) and create a free account/project (any region).
2. Wait for provisioning to finish (~2 min).

## 2. Run the schema

In the Supabase dashboard: **SQL Editor → New query**. Run each migration file **in order**,
as its own query (the SQL Editor silently stops executing the rest of a multi-statement script
if one statement partway through errors — always verify each step before moving to the next):

1. [`migrations/0001_schema.sql`](migrations/0001_schema.sql) — enums, tables, indexes.
2. [`migrations/0002_rls.sql`](migrations/0002_rls.sql) — role helper, privilege-escalation
   triggers, RLS policies.
3. [`migrations/0003_notifications_delete_policy.sql`](migrations/0003_notifications_delete_policy.sql) —
   adds the delete policy 0002 omitted for `notifications`.
4. [`migrations/0004_seed_plans.sql`](migrations/0004_seed_plans.sql) — seeds the 3 starter
   membership plans (Free/Freemium/Premium).
5. [`migrations/0005_registration_trigger.sql`](migrations/0005_registration_trigger.sql) —
   server-side trigger that creates `profiles`/`pending_registrations` rows on signup (needed
   because this project requires email confirmation, so the client has no session to insert with
   immediately after `signUp()`).
6. [`migrations/0006_fix_rls_policies.sql`](migrations/0006_fix_rls_policies.sql) — idempotent
   rebuild of every policy/trigger from 0002. Only needed if you hit the failure mode below;
   safe to run even if 0002 applied cleanly (drops-if-exists before every create).
7. **`0007` through `0038`** — keep going in numeric order. They are not listed individually here
   because each one's own header explains what it does and why. The recent ones:
   `0028` earned training levels + `achievement_unlocks`, `0029` archive/clear state on
   `notifications`, `0030` weekly gym plans + the reminder job, `0031` date of birth, gender and
   emergency contact at sign-up, `0032` member-controlled sharing with trainers, `0033` onboarding
   completion on the member row instead of localStorage, `0034` front-desk delete on `notifications`
   (the admin "Recall" button), `0035` same-day undo of a check-in, `0036` the member row created at
   sign-up, `0037` the `activity_log` audit trail, `0038` the achievement catalogue as data.
   What changed is summarised in
   [docs/MIGRATION_STATUS.md](../docs/MIGRATION_STATUS.md).

   **`0037` is the only migration that adds triggers to tables you write to constantly** —
   `bookings`, `payments`, `attendance`, `memberships`, `profiles`, `membership_plans`, `events`
   and `class_templates`. Every trigger is `after`, so it cannot change what is written; each one
   calls `log_activity()`, which is SECURITY DEFINER because `activity_log` has an admin SELECT
   policy and **no INSERT policy at all** — nothing holding an anon or authenticated key can write
   or forge a row. The migration ends by backfilling history from existing timestamps, flagged
   `reconstructed = true`. Re-running it is safe: every backfill insert is guarded by `not exists`.

   Booking **cancellations are deliberately not backfilled.** `bookings` stores no `cancelled_at`
   and no `cancelled_by`, so for a row already sitting at `status = 'cancelled'` there is no honest
   answer to "when?" or "by whom?" — dating them by `requested_at` puts the cancellation before the
   booking existed, and dating them `now()` claims they all happened at migration time. Every
   cancellation from 0037 onward is captured exactly, including whether the member or the desk did it.

   **`0036` is not optional if members are re-seeing onboarding.** 0033 moved the completion flag
   into `member_profiles`, but that row did not exist until approval — and onboarding runs before
   approval, so the write matched zero rows, reported success, and the flag was never stored. 0036
   creates the row at sign-up, backfills every existing member as already onboarded, and adds the
   `interests` column. It also replaces the approval-time INSERT with `apply_registration_details`;
   the admin app falls back to the old INSERT on `PGRST202` so approvals keep working until you run
   it, but nothing else about the fix applies until you do.

   **`0030` wants pg_cron.** It is wrapped so the migration still succeeds without it — you get
   the plan, the policies and `send_due_gym_reminders()`, and only the scheduled nudge is missing.
   After running it, confirm with `select jobname, schedule, active from cron.job;` — if that
   returns nothing, enable pg_cron under **Database → Extensions** and re-run `0030`.

`profiles.status` is plain `text` (not an enum), so the `archived` status used by the Members
page needs no migration — see the note at the top of `0001_schema.sql`.

After running 0002 (or if login ever fails with "This account does not have admin access" or a
Postgres `PGRST116`/"Cannot coerce the result to a single JSON object" error despite the account
data looking correct), verify policies actually landed:

```sql
select count(*) from pg_policies where tablename = 'profiles'; -- should be 7
```

If it's 0, the SQL Editor run silently aborted partway through (this happened once during
development — `get_my_role()` was created but the trigger and every policy after it never ran).
Re-run `0006_fix_rls_policies.sql` to fix it without guessing where the original run stopped.

Confirm in **Table Editor** that all 11 tables from `0001` appear (`profiles`, `member_profiles`,
`trainer_profiles`, `membership_plans`, `memberships`, `payments`, `classes`, `bookings`,
`attendance`, `notifications`, `pending_registrations`). Later migrations add more on top.

## 3. Get the frontend keys

**Project Settings → API**:
- `Project URL` → this is `VITE_SUPABASE_URL`.
- `anon` `public` key → this is `VITE_SUPABASE_ANON_KEY`.

Both are safe to put in the frontend — they're meant to be public, protected by the RLS
policies you just ran. **Never** copy the `service_role` key into either app's `.env` file;
it bypasses RLS entirely and is only used server-side (step 5).

Create `.env.local` in **both** `g-fitness-admin/` and `g-fitness-member/` (copy from that
app's `.env.example`):

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

`.env.local` is already gitignored in both apps (`*.local` rule) — nothing to change there.

## 4. Bootstrap the first admin account

Self-registration only ever creates `role='member'` accounts (enforced by RLS — see
`profiles_insert_self` in `0002_rls.sql`). The first admin has to be created by hand once:

1. **Authentication → Users → Add user** in the dashboard. Set an email + password, and
   toggle **Auto Confirm User** on (skips email verification for this prototype).
2. Copy the new user's UUID from the Users list.
3. Back in **SQL Editor**, run (replacing the placeholders):

```sql
insert into profiles (id, role, first_name, last_name, email, status)
values ('paste-the-uuid-here', 'admin', 'Admin', 'User', 'the-email-you-used', 'active');
```

That account can now log into the admin app with real credentials. Any further trainer
accounts are created from inside the admin app itself (Trainers page → calls the
`create-trainer` Edge Function below) — no manual SQL needed for those.

## 5. Deploy the Edge Functions

This function lets an authenticated admin create a trainer account without the admin's own
browser session getting signed out (a plain client-side `supabase.auth.signUp` would do that).
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are automatically injected
into every deployed Edge Function by Supabase itself — there's nothing to configure for those;
the service-role key never needs to be (and cannot be) set by hand as a secret.

The three `create-*` functions exist for the same reason: a client-side `supabase.auth.signUp()`
would swap the admin's own browser session for the newly created account.

| Function | Purpose |
|----------|---------|
| `create-trainer` | Admin creates a trainer account (Trainers page) |
| `create-member` | Admin registers a **walk-in** member at the front desk (Members page). Created already `active`, skipping the self-registration approval queue |
| `create-staff` | Admin creates a front-desk staff account. The only way one can exist — staff have no write access to `profiles` |
| `send-push` | Delivers a web push notification to a member's registered devices. Needs the VAPID secrets below |

**Easiest path — no CLI needed**, repeat for each:
1. Dashboard → **Edge Functions → Create a new function**, name it exactly `create-trainer`
   (then again for the others).
2. Paste the contents of the matching `functions/<name>/index.ts`.
3. Deploy.

**CLI alternative** (if you have the Supabase CLI installed and are logged in):
```bash
supabase functions deploy create-trainer && supabase functions deploy create-member && supabase functions deploy create-staff && supabase functions deploy send-push
```

### Web push (VAPID keys)

`send-push` is the only function needing secrets set by hand. Generate a keypair once:

```bash
npx web-push generate-vapid-keys
```

Then set the **private** half as an Edge Function secret — it signs every push request and must
never reach a browser:

```bash
supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
```

(Dashboard equivalent: **Edge Functions → Secrets**.)

The **public** half also goes in `g-fitness-member/.env.local` as `VITE_VAPID_PUBLIC_KEY` — it is
sent to the browser by design, since that is what the subscription is keyed to. Leave it unset to
ship without push; the Settings switch then explains itself rather than failing on tap.

Push only works over **HTTPS on the deployed app or an installed PWA** — not over
`http://localhost` in a plain tab, and on iOS only after Add to Home Screen.

## 6. You're ready

Run both dev servers and log in as the admin account you just bootstrapped. See the
verification checklist in the approved plan for the full end-to-end test sequence
(trainer creation, member registration + approval, booking, payment, QR check-in, RLS
negative tests).

   **`0038` moves the achievement rules out of code.** 0028 hardcoded 33 earning rules as an `if`
   ladder inside `sync_my_achievements()`, so the gym could not add one without a developer. 0038
   creates `achievements` + `achievement_metrics`, seeds the same 33 into them, and rewrites the
   evaluator as a single loop over the table. The security property is unchanged:
   `achievement_unlocks` still has **no INSERT policy**, and the evaluator is still SECURITY DEFINER
   and still grades only the caller. Editing the rules is an admin act; granting yourself a badge is
   still impossible from a browser. Hand-awards go through the admin-only `award_achievement()`.

   Two rules stay in code as `rule_kind = 'builtin'` — the Intermediate and Advanced level badges.
   Their thresholds come from `level_thresholds()`, the same function `member_progression()` uses
   for the level on the member's Home screen; copying those numbers into the table would let the
   badge and the level disagree. Their copy and icon are editable, their rule is not.

   Re-running is safe: the seed is `on conflict … do update … where achievements.builtin`, so an
   admin's own achievements are never clobbered. Deleting one anybody has earned is blocked by a
   trigger — retire it instead, which keeps existing badges and stops new ones.
