# Accounts, documents, paying, deleting, suspending and switching — implementation plan

> Executed natively in this session (the owner's standing choice), part by part, each verified, pushed and deployed.

**Goal:** one account from application to admin app; documents in one batch with per-document send-back; pay before approval;
self-service deletion; platform-wide suspension; members switch gyms and keep their training.

**Spec:** `docs/superpowers/specs/2026-10-31-accounts-documents-switching-design.md` (approved 2026-10-31).

**Architecture:** every rule in SQL (definer functions, revoked from public/anon, RLS the boundary); one migration per part, pasted
by the owner one at a time (0222–0227), each with marker, `verify02xx.sql`, probe entry, CI suite line, pglite harness, platform
`LAST`, ROADMAP + CLAUDE.md. UI in the site (`corefitness-site`), platform (`corefitness-platform`), admin and member apps; fixture
checks in `scripts/` registered in `scripts/ci/ui-checks.json`.

## Global constraints
- Migrations never `db push`; the connector only reads. Permanent deletions in the live database are the owner's to paste.
- Legal text changes in the same commit as the rule; a changed document's version is its date (member `lib/legalVersions.ts`;
  the site's `legalText.ts` `VERSION`, which the platform must then publish).
- Members are archived, never deleted: self-service deletion **anonymises** — the gym's payments and visits stay as *Deleted member*.
- A member feature is not done until admin and the coach can see it.

## Review focus
1. An applicant who signed up with email but never confirmed it must not get a gym owner login (approval refuses; the page says why).
2. A batch submit with five of six files must send nothing; a send-back of a *verified* document must reopen only that one.
3. A deleted account must not be able to sign in after 7 days, and signing in during the 7 days must cancel the erase.
4. A suspended person must be refused by **every** app, including a session already open (the next request fails).
5. A switch must never leave a member in two gyms, or in none, if the new gym declines.

---

## Part A — the applicant's account is the owner's login (0222)

**Files:** `supabase/migrations/0222_owner_account.sql`; `corefitness-platform/src/pages/Applications.tsx` (approval no longer opens
*Name the owner* for an application); `corefitness-site/src/Account.tsx`, `App.tsx` (confirm-email state, *Send the link again*,
*Connect Google*); `scripts/sql/owner-account.mjs`; `scripts/site-account-check.js`, `scripts/platform-applicant-check.js` (updated).

**Interfaces:**
- `create_gym(p_name, p_slug, p_application)` (redefined): with an application, requires `application.user_id` to be an account
  whose email is **confirmed** (`auth.users.email_confirmed_at`), else raises *"Their email is not confirmed yet — they must open the
  link we sent."*; inserts `gym_roles(gym, user, 'admin', 'active')` and sets `profiles.active_gym_id`. No edge function, no password.
- `my_application_account()` → `{ email_confirmed boolean, providers text[] }` for the site.
- Site: an unconfirmed email account sees *Confirm your email to send documents* + **Send the link again**
  (`supabase.auth.resend({ type: 'signup', email })`); a signed-in account sees **Connect Google**
  (`supabase.auth.linkIdentity({ provider: 'google' })`) when Google is not linked yet. The approval email keeps "sign in with the
  email and password (or Google) you applied with".
- The Gyms page's hand-made gym keeps `inviteOwner` (no application).

**Steps:** harness (confirmed → owner role; unconfirmed → refused; no application → unchanged) → migration → platform + site →
checks → build, deploy site + platform note → commit.

## Part B — documents in one batch (0223)

**Files:** `supabase/migrations/0223_document_batches.sql`; `corefitness-site/src/Documents.tsx`; `corefitness-platform/src/pages/
Applications.tsx` (document review); `scripts/sql/document-batches.mjs`; `scripts/site-documents-check.js`, platform check updated.

**Interfaces:**
- `application_documents.status` gains `'draft'` (attached, not sent) and `'requested'` (sent back — including a verified one).
- `save_document_draft(p_application, p_kind, p_path, p_file_name, p_expires_on)` replaces the per-document send: the newest draft
  per kind; the old row stays (`replaced`).
- `submit_documents(p_application)` — refuses unless every kind that needs sending (first time: all six; after a send-back: every
  `requested`/`rejected` kind) has a draft; turns those drafts `pending` in one go; notifies the platform.
- `request_document_again(p_document, p_reason)` (platform only; works on `verified` too) → `requested`, reason kept; emails the
  applicant through `send-email` (template `documents_requested`, listing every requested kind and reason) and shows them on the page.
- Approval still requires all six `verified` and in date.

**Steps:** harness (five drafts → submit refused; six → all pending; send back one verified → only it reopens; resubmit only it) →
migration → site (attach six, one *Submit documents*; after a send-back only those rows open, one *Send these again*) → platform
(each document: Verify / Send back with a reason) → checks → deploy → commit.

## Part C — paying before approval (0224)

**Files:** `supabase/migrations/0224_application_payment.sql`; `supabase/functions/paymongo-checkout` (+ webhook) purpose
`application`; `corefitness-site/src/Status.tsx` / `Account.tsx` (*Pay for your plan*); platform Applications (payment line,
Confirm); `scripts/sql/application-payment.mjs`; `scripts/site-pay-check.js`.

**Interfaces:**
- `application_payments` (application, plan key, amount from `platform_price_list()` — never the client's number, method
  `paymongo|gcash|maya|bank`, reference, status `pending|paid|refused`, checkout id).
- `claim_application_payment(p_application, p_method, p_reference)` (applicant; only when all six are verified and the plan is not the
  trial); `confirm_application_payment(p_id, p_received)` (platform).
- PayMongo: `paymongo-checkout` purpose `application` (the platform's own account, amount read in SQL); the webhook marks it paid.
- `create_gym` (Part A's) also refuses an application on a paid plan with no `paid` payment; the trial skips it.
- The page shows *Pay for your plan* only once all six are verified: PayMongo button, and GCash/Maya/bank details from
  `platform_payment_options()` with a reference box.

**Steps:** harness → migration → functions (owner deploys with `--use-api`) → site + platform → checks → deploy → commit.

## Part D — deleting your data (0225)

**Files:** `supabase/migrations/0225_delete_my_account.sql`; member Settings → Account (*Delete my account*), the coach's settings,
admin Settings → My profile, the site's application page; `scripts/sql/delete-account.mjs`; checks `member-delete-check.js`,
`admin-delete-check.js`; member Privacy + Terms (deletion, 7 days, what is kept), site platform Privacy.

**Interfaces:**
- `account_deletions (person, requested_at, erase_after, cancelled_at, erased_at)`.
- `request_account_deletion()` — refuses an owner of an open gym (*"Ask Core Fitness to close the gym or hand it over first."*) and a
  coach with an active package (*"End or hand over your packages first."*); cancels the coach's future single sessions through
  `cancel_booking()` with reason `coach_left`; locks the account (`profiles.status = 'deletion_pending'`, refused by
  `my_gym_context()` except to cancel).
- `cancel_account_deletion()` — signing in during the 7 days offers it.
- `erase_due_accounts()` (re-runnable sweep): anonymises — profile names → *Deleted member*, contact/photo/notes null; deletes
  workouts, sets, routines, plans, measurements, targets, progress photos (+ storage objects), chats, assistant chats, PAR-Q answers,
  tours, push subscriptions; keeps payments, invoices, attendance, memberships (anonymised through the profile); bans the auth user.
  Called from app loads and pg_cron where present.

**Steps:** harness (owner refused; coach refused then allowed; erase keeps payments, removes workouts; cancel within 7 days) →
migration → three apps + site → legal → checks → deploy → commit.

## Part E — the platform suspends an account (0226)

**Files:** `supabase/migrations/0226_platform_suspension.sql`; `corefitness-platform/src/pages/People.tsx` (new: search any account
across gyms; Suspend / Lift with a reason) + nav; member/admin sign-in handling (`my_gym_context()` → `lock_reason
'platform_suspended'`, a *Suspended by Core Fitness* screen with the reason); admin member drawer and the coach sheet show the
badge; `scripts/sql/platform-suspension.mjs`; checks `platform-people-check.js`, `member-suspended-check.js`.

**Interfaces:**
- `platform_suspensions (person, reason, suspended_by, at, lifted_at)`; `platform_suspend(p_person, p_reason)`,
  `platform_lift_suspension(p_person)` (platform admin only); `is_platform_suspended(uid)` used by `my_gym_context()` and by RLS
  helpers so an open session fails on its next request; the gym sees the flag, never the reason (`gym_people.platform_suspended`).
- Email through `send-email` (template `account_suspended`).

**Steps:** harness → migration → platform People → apps → checks → deploy → commit.

## Part F — switching gyms, members only (0227)

**Files:** `supabase/migrations/0227_switch_gym.sql`; member `ChooseGym.tsx` / `JoinGym.tsx` → **Switch gym** (consent screen: what
moves, what starts over, the refund quote); admin Members (a *switching in* tag on the new gym's request; the old gym's drawer says
*Switched to another gym*); coach (the package ends with reason `member_switched`); member Privacy (moving data between gyms, with
consent); `scripts/sql/switch-gym.mjs`; checks `member-switch-check.js`, `admin-switch-check.js`.

**Interfaces:**
- A member may hold one active/pending member role: `request_gym_switch(p_to_gym)` files the join at the new gym under its joining
  rules (open → accepted at once; code → needs the code; desk → pending) and a cancel request at the old gym (0118 shape, reason
  `switched_gym`, refund per `refund_quote`). `complete_gym_switch(p_member, p_to_gym)` runs when the new gym accepts (trigger on the
  role becoming active): old role → `archived`, old packages ended, old gym notified; the member's own rows move — `workout_logs`,
  `workout_sets`, `workout_routines` (+exercises), `gym_plans`, `body_measurements`, `fitness_goals`, `progress_photos` (+ storage
  path), `achievement_unlocks` for training badges — by updating `gym_id`; **visit badges** (visit-count and check-in-streak keys)
  are not moved (they lock again); the points balance is 0 at the new gym (the old ledger stays with the old gym, shown as history).
- `join_gym` refuses a second gym for a member (*"Switch gym instead"*); coaches unaffected.
- Declined at the new gym → nothing moved, the old membership untouched, the cancel request withdrawn.

**Steps:** harness (moves, relocks, zero points, decline leaves everything) → migration → member + admin + coach → legal → checks →
deploy → commit.

## Part G — test members in Core Fitness Lab

**Files:** `scripts/demo-data/lab-switch-members.sql` (three made-up members `5eed…`, removable by `remove_demo_data()`), README line.
The owner pastes it after Part F.

## Order
A → B → C → D → E → F → G, each verified (harness + checks + full affected suites), pushed and deployed before the next; the owner
pastes each migration when told.
