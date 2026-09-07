# Test Matrix

What to click, what should happen, and what actually did. Written for the
evaluation the panel described: different accounts, different plans, booking
conflicts, trainer availability, account restrictions.

**Fill it in by running it.** Record what happened, including the failures. A
failure recorded is a fix; a failure omitted is a bug the panel finds instead.

---

## Run 1 — 7 September 2026 · schema and anonymous boundary

What can be checked without anyone's password. Run it again any time with
`scripts/probe-migrations.py`.

### Which migrations are actually live

Probed over REST with the anon key, which reports the **schema** — three
independent objects per migration, so one missing object cannot be mistaken for
a whole file failing, or the reverse.

| Migration | Evidence | Result |
|---|---|---|
| 0068 booking conflicts | `member_commitments`, `trainer_schedule_conflicts` | **LIVE** |
| 0069 account status | `account_status_events`, `account_lockout_reason` | **LIVE** |
| 0070 refund policy | `refund_rules`, `frozen_days_last_year`, `pt_sessions.payment_id` | **NOT PASTED** |
| 0071 trainer decisions | `bookings.decided_by_role`, `sweep_stale_requests` | **LIVE** |
| 0072 trainer feedback | `trainer_feedback`, `public_trainer_credentials`, `my_trainer_ratings` | **LIVE** |
| 0073 pro-rata refunds | `gym_settings.refund_processing_fee` | **NOT PASTED** (written after this run) |

**0070 is the finding.** All three of its objects are absent — the table returns
PGRST205 "no such table", the function PGRST202, and the column 42703. That is
not one failed statement, it is a file that never ran. Everything refund-shaped
depends on it: the cancel dialog's quote, the Settings → Refund Policy tab, and
0073, which alters a column 0070 creates.

**Paste 0070 before 0073.** 0073 assumes `refund_rules` exists and rewrites
`refund_quote()`, so on its own it will fail. *(Done — see Run 2.)*

### Anonymous boundary — §6 rows that can be checked now

Every one of these is a *negative* test: the correct outcome is a refusal.

| # | Check | Expected | Result |
|---|---|---|---|
| 6.a | Anon calls `member_commitments` | Refused | **PASS** — 401, `42501` |
| 6.b | Anon calls `trainer_schedule_conflicts` | Refused | **PASS** — 401 |
| 6.c | Anon calls `sweep_stale_requests` | Refused | **PASS** — 401, front-desk only |
| 6.d | Anon reads `public_trainer_credentials` | Refused | **PASS** — 401, `permission denied for view` |
| 6.e | Anon calls `my_trainer_ratings` | Refused | **PASS** — 401 |
| 6.f | Anon reads `account_status_events` | Zero rows, not an error | **PASS** — 200 `[]`, RLS filtering rather than blocking |
| 6.g | Anon reads `trainer_feedback` | Zero rows | **PASS** — 200 `[]` |
| 6.h | Anon reads `membership_plans` | Readable — the catalogue is public to signed-in users and the key is valid | **PASS** — 200 |

6.d is worth noting: `public_trainer_credentials` is `security_invoker = false`,
so it reads every row regardless of caller. It refusing anon is exactly the
grant working — the mistake it guards against is the one caught in review before
0072 shipped.

---

## Run 2 — 7 September 2026 · after 0070 and 0073 were pasted

| Migration | Result |
|---|---|
| 0068, 0069, 0071, 0072 | **LIVE** (unchanged) |
| **0070** refund policy | **LIVE** — table, function and column all present |
| **0073** pro-rata refunds | **LIVE** — `refund_quote` and the fee column present |

`scripts/probe-migrations.py` prints **"All probed migrations are live."**

### Two more boundary checks, both passing

| # | Check | Expected | Result |
|---|---|---|---|
| 6.i | Anon reads `refund_rules` | Zero rows — the policy is `auth.uid() is not null` | **PASS** — 200 `[]` |
| 6.j | Anon calls `refund_quote` | Refused | **PASS** — 401 |

**What this run could not check.** The *contents* of the seeded rows — that four
refund tiers exist and that 0073 rewrote the fourth one's label — are invisible
to an anonymous caller, correctly. Confirm them signed in as admin, on
Settings → Refund Policy: **four rules**, the last reading *"After 30 days — the
unused part of the term, pro-rata"*. If that last one still says *"no refund"*,
0073's label update did not match and should be re-run.

### Still blocked, and on what

Everything in §2–§5 needs **signed-in accounts**, and auth accounts cannot be
created from SQL — `auth.users` belongs to Supabase Auth and hand-inserted rows
produce accounts that appear in the dashboard and cannot sign in.

To unblock: register the test members through the member app, add the trainers
and staff from admin, then run `scripts/seed-test-accounts.sql`. Approving a
registration needs an admin sign-in, so that step needs somebody with the
password.

*Run 3 lifted most of that block without accounts — see below.*

---

## Run 3 — 7 September 2026 · the app's own logic, driven under the harness

**38 checks, all passing.** Two scripts drive the *real* application code with a
routed network, so `useFeatures`, `FeatureLock`, `listOpenPtSlots()` and every
gated screen's own branching all execute exactly as they do for a member.

| Script | Covers | Result |
|---|---|---|
| `scripts/plan-gates.js` | §2.1–§2.4, all three plans × 8 checks | **24 / 24** |
| `scripts/trainer-scenarios.js` | §3.1.3–3.1.4, §3.2, §3.4's human half | **14 / 14** |

Run both with the Playwright MCP runner's `filename` argument, member dev
server on `:5173`. They write `shots/19-trainer-overdue-queue.png` and
`shots/20-member-pending-survives.png` — **not committed** (`shots/.gitignore`
excludes `*.png`), so regenerate them rather than looking for them.
`scripts/freeze-dialog-shot.js` does the same for the admin freeze dialog on
`:5174`.

### What Run 3 does not prove

**Nothing here reaches Postgres.** The network is routed, so a pass means *the
app agrees with the rules and tells the member the truth before the write* —
not that the boundary holds.

**Run 4 below covers most of what this could not**: 0068's conflict guard,
0057's freeze limit, 0069's suspension reason and 0071's decision policies are
all executed there, as a real `authenticated` role. Only §2.6's entitlement
gates still need a signed-in member.

### §2 — what each plan actually unlocks

The `DEFAULTS` table in `plan-gates.js` is transcribed from 0049's seed and the
app matched it on every cell. Two things worth stating plainly:

- **The Free Plan unlocks none of the six gated areas** — and it is not meant
  to. What it *does* keep is the whole of the rest of the app: gym-floor
  check-in, the free workout library, announcements and events, notifications,
  its QR code, attendance history and the membership screen. It cannot book
  classes or PT either, but that comes from **0017**, not from `plan_features`
  — the two systems are separate and a Free Plan member is bounded by both.
- **The chathead is the sharpest per-plan difference to demonstrate.** It is
  absent on Free Plan and Free Trial and present on Premium, from the same
  `ai_model` row that locks the chat route.

### §3.2 — the panel's two-trainers question, answered with the slot lists

Both coaches work 06:00–18:00 in 30-minute slots. Trainer A has a PT session at
12:00 and teaches a class at 14:00; Trainer B has neither.

| | 12:00 | 12:30 | 14:00 | 14:30 |
|---|---|---|---|---|
| Trainer A | — | — | — | — |
| Trainer B | ✓ | ✓ | ✓ | ✓ |

A being full says nothing about B, and A's own class blocks A's PT diary. The
member's separate 10:00–11:00 class **marks** B's 10:30 slot
(*"You are already booked for Morning Yoga at 10:00 AM"*) and leaves 11:00
clean — the half-open interval, checked rather than assumed.

### §3.4 — the three-day wait, as a person rather than a row

The trainer's queue states *"waiting 3 days"* on the old request and
*"waiting 5h"* on the recent one, banners *"One member has been waiting more
than a day"*, and keeps **both** actionable. A pending request also survives
the trainer clearing their availability entirely: the member still sees it,
still pending. A request that vanished when a coach stopped working would be
the worst possible version of "still pending".

---

## 1. Test accounts

Auth accounts cannot be created from SQL — `auth.users` is Supabase's, and
inserting into it by hand produces rows that do not work. Create these through
the app, then run `scripts/seed-test-accounts.sql` to put each on the right
plan.

Use the `@corefitness-test.com` domain throughout so no real member is touched.

| Account | Role | Plan | Created how |
|---|---|---|---|
| `free.member@corefitness-test.com` | member | **Free Plan** | Register in the member app, approve in admin |
| `trial.member@corefitness-test.com` | member | **Free Trial** | Register, approve (this is the default grant) |
| `premium.member@corefitness-test.com` | member | **Premium** | Register, approve, then change plan + record payment in admin |
| `second.member@corefitness-test.com` | member | Free Trial | For the two-members-one-slot tests |
| `trainer.a@corefitness-test.com` | trainer | — | Admin → Trainers → Add (Edge Function) |
| `trainer.b@corefitness-test.com` | trainer | — | Same. **Give both the same availability window.** |
| `desk@corefitness-test.com` | staff | — | Admin → Settings → Staff accounts |

Record the passwords wherever the team keeps them. **Not in this file** — it is
in the repository.

---

## 2. What each plan should unlock

Derived from the `features` defaults in migration 0049. **The tier is not the
rule** — `plan_features` is a matrix the admin can edit, so if a row here
disagrees with the app, check the matrix before calling it a bug.

| Feature (`key`) | Free Plan | Free Trial | Premium | Where it locks |
|---|---|---|---|---|
| Workout tracker (`workout_tracker`) | ✗ | ✓ | ✓ | Progress → Workouts tab |
| AI workout plan (`plan_builder`) | ✗ | ✗ | ✓ | Plan Builder page |
| Smarter AI assistant (`ai_model`) | ✗ | ✗ | ✓ | Chat route + the chathead in `Layout` |
| Earn CORE Points (`points_earn`) | ✗ | ✓ | ✓ | MY CORE card on Progress |
| Redeem CORE Points (`points_redeem`) | ✗ | ✗ | ✓ | The **Redeem button** on the Rewards page — not the page, which is gated on `points_earn` |
| Gym challenges (`challenges`) | ✗ | ✓ | ✓ | Challenges page |

**Two rules to check on every locked screen, not just that it is locked:**

- **It locks and explains, it never hides.** A missing menu item is a bug. The
  wording must come from the `features` row that denied it.
- **The free workout library is never gated** (0019). It exists *for* members
  who cannot pay. If the Free Plan account cannot reach Workouts → Library, that
  is a serious bug, not a gate working.

| # | Test | Expected | Result |
|---|---|---|---|
| 2.1 | Sign in as Free Plan, open every gated screen above | Six locks, each explaining itself in its own words | **PASS** (Run 3) |
| 2.2 | Same account → Workouts → free library | **Fully available** | **PASS** (Run 3) |
| 2.3 | Sign in as Free Trial | Tracker, points-earn and challenges work; plan builder, AI and redeem are locked | **PASS** (Run 3) |
| 2.4 | Sign in as Premium | All six available | **PASS** (Run 3) |
| 2.5 | Admin → Plans → untick one feature for Premium; reload the member app | That one screen locks; nothing else changes | |
| 2.6 | As the Free Plan member, call the gated table directly from the browser console | **RLS refuses** — the gate is not only in the UI | |

---

## 3. Booking rules

### 3.1 A member cannot be in two places at once (migration 0068)

| # | Test | Expected | Result |
|---|---|---|---|
| 3.1.1 | Book a class Tuesday 10:00, then request PT Tuesday 10:00 | Refused, naming the class and its time | **PASS** (Run 4, at the database) |
| 3.1.2 | Book two classes at the same hour | Refused | **PASS** (Run 4) |
| 3.1.3 | Class 10:00–11:00, then PT at **11:00** | **Allowed** — the end instant is free | **PASS** (Run 3, UI) |
| 3.1.4 | Class 10:00–11:00, then PT at **10:30** | Refused — overlap, not equality | **PASS** (Run 3, UI — flagged, not hidden) |
| 3.1.5 | The clashing slot in the picker, before tapping | Shown, disabled, and says what you are already booked for | |
| 3.1.6 | Cancel the class, then retry the PT slot | Now allowed | **PASS** (Run 4) |

### 3.2 Trainer availability is per trainer — the panel's scenario

| # | Test | Expected | Result |
|---|---|---|---|
| 3.2.1 | Fill Trainer A's Tuesday 10:00 | A's 10:00 disappears from A's slot list | **PASS** (Run 3) |
| 3.2.2 | **Second member books Trainer B, Tuesday 10:00** | **Succeeds.** A being full says nothing about B | **PASS** (Run 3) |
| 3.2.3 | Trainer A teaches a class at 14:00; check A's PT slots | 14:00 absent — a class blocks the coach's own PT | **PASS** (Run 3) |
| 3.2.4 | Trainer B at the same 14:00 | Available | **PASS** (Run 3) |

### 3.3 Trainers decide, admin oversees (migration 0071)

| # | Test | Expected | Result |
|---|---|---|---|
| 3.3.1 | As Trainer A, accept a request for A's own class | Succeeds; the member is notified | **PASS** (Run 4) |
| 3.3.2 | As Trainer A, accept a request on **Trainer B's** class | Refused — matches no policy, and the zero-row guard surfaces it rather than showing a success toast | **PASS** (Run 4 — 0 rows, no error, exactly as designed) |
| 3.3.3 | Admin → Bookings after 3.3.1 | Row says "Accepted by *their trainer*", not by the desk | **PASS** (Run 4 — `decided_by_role` is 'trainer') |
| 3.3.4 | Admin reverses it | Allowed; the member is notified of the new outcome | **PASS** (Run 4) |
| 3.3.5 | As a trainer, try to change a booking's `member_id` | Refused by the guard even on their own class | **WAS A BUG** — accepted until 0074. **PASS** (Run 4) |
| 3.3.6 | As Trainer A, set capacity on A's class below the number already booked | Refused | **PASS** (Run 4) |

### 3.4 Nobody waits forever (the sweep)

Backdate `requested_at` in SQL to simulate elapsed time; the sweep reads the
clock, not a queue.

| # | Test | Expected | Result |
|---|---|---|---|
| 3.4.1 | Backdate a pending PT request 25h; open admin Bookings | Trainer notified once | **PASS** (Run 4) |
| 3.4.2 | Reload the page | **No second notification** — the dedupe index holds | **PASS** (Run 4) |
| 3.4.3 | Backdate 49h | Member told it is still pending and they may pick another trainer | **PASS** (Run 4) |
| 3.4.4 | Backdate 73h | Every admin notified | |
| 3.4.5 | A pending request starting in under 24h | Trainer, member **and** admin all notified | |
| 3.4.6 | A pending request whose start time has passed | Auto-declined; member told why; `decided_by_role` is `'system'`, **not** the admin who opened the page | |
| 3.4.7 | `select sweep_stale_requests();` twice | Second call returns 0 | |
| 3.4.8 | Call it as a **member** | Refused — front desk only | |

---

## 4. Membership, money and restrictions

| # | Test | Expected | Result |
|---|---|---|---|
| 4.1 | Suspend a member with a blank reason | Refused, before the click | |
| 4.2 | Suspend with a reason; sign in as them | Told **why**, not a generic refusal | |
| 4.3 | Admin → member → Account history | Shows the transition, the reason and who did it | |
| 4.4 | Reactivate | Allowed with no reason | |
| 4.5 | Freeze twice in one calendar month, then a third time as staff | Third refused, naming the limit | |
| 4.6 | Same third freeze as **admin** | Allowed — admin may override | |
| 4.7 | Cancel a membership | Refund quote shown **with the rule that produced it**, before confirming | |
| 4.8 | Cancel a 3-day-old membership with no check-ins | 100% | |
| 4.9 | Same, but with one check-in | 50% | |
| 4.10 | Deactivate every refund rule, then quote | Says **"an admin decides"**, not 0% | |
| 4.11 | Record a pending payment, then Confirm | Member notified; `paid_on` is **today**, not the day the record was created | |
| 4.12 | Double-click Confirm | **One** notification | |
| 4.13 | Member → Payment history | Paid and pending clearly distinct | |
| 4.14 | A frozen member tries to book | *Undecided — see Open questions* | |

---

## 5. Ratings, feedback and credentials

| # | Test | Expected | Result |
|---|---|---|---|
| 5.1 | Rate a trainer 5★ with a comment | Saved for the current month | |
| 5.2 | Rate the same trainer again next month | A **second** row, not an overwrite | |
| 5.3 | As that trainer, open the profile | Score and comment visible, **no member name anywhere** | |
| 5.4 | As that trainer: `select * from trainer_ratings` | **0 rows** — the base table no longer answers to trainers | |
| 5.5 | Inspect the network response on 5.3 | **No `member_id` in the payload** | |
| 5.6 | As admin, read the evaluations | Score, comment **and** who wrote it | |
| 5.7 | Member-facing average with fewer than 3 ratings | Withheld, and says so — never 0 stars | |
| 5.8 | Admin average with 1 rating | **Shown** — the gym needs to see one bad review | |
| 5.9 | Admin verifies a credential; open that trainer in the member app | Title and verified date under "Verified by the gym" | |
| 5.10 | A **pending** credential | Does not appear to members | |
| 5.11 | Member checks the network payload on 5.9 | **No `file_path`** | |
| 5.12 | As Trainer A, write feedback signed as Trainer B | Refused by the insert policy | |
| 5.13 | Trainer leaves a member feedback | Member notified; the note names the coach | |

---

## 6. Roles and boundaries

| # | Test | Expected | Result |
|---|---|---|---|
| 6.1 | Staff account → pricing, trainers, settings, audit log | All unreachable | |
| 6.2 | Staff records a payment and a check-in | Both work | |
| 6.3 | Member calls `set_account_status` from the console | Refused | **PASS** (Run 4) |
| 6.4 | Member updates `memberships` directly | Refused | |
| 6.5 | Member reads another member's `member_commitments` | Refused | **PASS** (Run 4) |
| 6.6 | Trainer reads a member's measurements without sharing on | Refused (`trainer_may_see`, 0032/0048) | |
| 6.7 | Suspended account signs in | Refused, with the reason | |

---

## Run 4 — 7 September 2026 · the rules themselves, as SQL

**64 checks, all passing, and one real bug found.** Run 3 proved the app agrees
with the rules. This runs the rules.

`scripts/sql/*.mjs` stub only the tables each migration touches, apply the
migration **verbatim from `supabase/migrations/`**, then act as a real
`authenticated` role — not as the owner, who bypasses RLS and would pass every
assertion regardless. Real PostgreSQL, in-process, no credentials and no
Docker; `scripts/sql/README.md` has the three traps that cost time.

| Script | Under test | Result |
|---|---|---|
| `booking-conflicts.mjs` | 0068 — member and trainer overlap, `member_commitments` | **18 / 18** |
| `trainer-decisions.mjs` | 0071 + 0074 — decisions, RLS, class size, the sweep | **22 / 22** |
| `reasons-and-limits.mjs` | 0057, 0069 + 0074 — reasons, the freeze limit, suspension | **24 / 24** |

### The bug it found

`trg_stamp_booking_decision` and `trg_stamp_pt_decision` (0071) both open with
*"if the status did not change there is nothing to stamp — return"*. Correct
about stamping, wrong about **pinning**: the checks that stop a trainer
reassigning a booking sit *below* that return, so an update leaving `status`
alone never reaches them. With `bookings_update_trainer` letting a trainer
update any booking on a class they teach, and RLS choosing rows rather than
columns, this was live:

```sql
update bookings set member_id = '<anyone>' where id = '<a booking on my class>';
```

A trainer could move a seat from the member who booked it to anybody, and the
row kept its original `decided_by` — so the audit trail said nothing happened.
The same shape on `pt_sessions` let a trainer move `starts_at`, rescheduling
somebody's session without telling them.

**0074 fixes it** by resolving the caller's role and pinning the columns
*before* the early return. Both cases are now checks 3.3.5 and 3.3.9. 0074 also
repairs one sentence: 0069 raised *"A reason is required to suspended an
account."*

### What Run 4 proves that Run 3 could not

- A clash is **refused by the database**, in the words the desk reads:
  *"This clashes with Morning Yoga on Tuesday 8 September at 10:00 am."*
- **Trainer A being full says nothing about Trainer B** — asserted on the writes
  themselves, not on a slot list.
- A trainer accepting a booking on **another trainer's class** updates **zero
  rows**. RLS filters; it does not raise. That is exactly why `assertWrote()`
  exists, and why a success toast on a zero-row write is a lie.
- `member_commitments` refuses another member's diary, serves the front desk,
  and **does not lock out a caller with no session at all** — the 0055/0062 bug.
- A freeze or cancellation **without a reason is refused**, whitespace included;
  the third freeze in a month is refused at the desk and allowed for an admin;
  and the record has **no UPDATE or DELETE policy for anyone**, so a reason
  cannot be edited afterwards.
- The sweep runs with no session (as pg_cron does), reminds at 24h, tells the
  member at 48h **and offers a different trainer**, escalates to the admin at
  72h, alarms all three inside 24 hours, auto-declines a request whose start has
  passed and stamps it **`system` with no author** — and running it twice sends
  nothing the second time, because the dedupe index makes a repeat impossible
  rather than unlikely.
- A member calling the sweep is refused.

### Still not covered

`plan_allows()` and the entitlement gates (§2.6) sit on `current_membership_of`
and `membership_is_usable`, one fixture layer deeper. That row still needs a
signed-in member against the live project, and it is the last one that does.

---

## Decisions — settled 7 September 2026

These were open questions. The gym has answered them; the answers are recorded
here because a rule nobody wrote down gets re-litigated at the desk every time.

1. **A frozen member cannot book. Confirmed.** `membership_is_usable()` accepts
   `active` and `cancelled` and not `frozen`, so the entitlement check refuses —
   and that is intended, not an accident of the enum. A freeze is a pause on the
   membership, not on attendance alone; a member who wants to book for the week
   after their holiday unfreezes first, which takes the desk one click. The
   alternative — bookable while frozen — would let someone hold a class seat
   during a period the gym is crediting back to them for free.
2. **A freeze does extend the expiry date. Confirmed, kept.**
   `unfreezeMembership()` adds the frozen days back
   ([memberships.ts](../g-fitness-admin/src/lib/api/memberships.ts)). This is
   money and it was worth asking about, but the alternative is charging a member
   for days the gym deliberately denied them access — which is the same reading
   of a prepaid term that makes 0073's pro-rata refund the lawful one under RA
   7394. Consistency here matters more than the few days it costs. The yearly
   ceiling below is what stops it becoming unbounded.
3. **The 60-day yearly ceiling is shown, not enforced.** The freeze dialog now
   reads `frozen_days_last_year()` and `gym_settings.max_freeze_days_per_year`
   and shows "N of 60 days used this year", with a warning line once it is
   passed. No trigger refuses on it: the monthly limit is a rule members have
   been told, but nobody has ever been told about a yearly one, and refusing on
   an unpublished rule is how a desk ends up arguing on the gym's behalf for a
   number it cannot explain. Before this, **nothing read either value** — the
   setting existed and affected nothing.
   `gym_settings.max_freeze_days_at_once` is **still unread**, deliberately:
   a freeze here has no end date to check it against.
4. **Admin evaluations show who wrote them. Kept as built.** This reverses an
   earlier decision to hide names from everyone. The panel asked for the
   information needed for monitoring, and a complaint nobody can attribute
   cannot be followed up — nor can one member rating every trainer 1★ be spotted.
   The protection that matters is unchanged and is in SQL, not in JSX: the
   trainer reads `trainer_ratings_anon`, which has no `member_id` column at all
   (0072). The admin panel says "Admin only" above the names so nobody reads one
   out to a coach by accident.
5. **RA 7394 constrains the refund table, and the law won.** 0073 rewrote
   `refund_quote()` to `max(pro-rata for the unused term, the gym's tier) − a
   documented fee`; the tiers are a floor, so lowering one cannot cut a payout
   below the statutory pro-rata. See [MEMBERSHIP_POLICY](MEMBERSHIP_POLICY.md).

## How to run the SQL checks

As a **real member/trainer role, never the owner** — an owner bypasses RLS, so
an unprotected table looks safe when the test role simply could not reach it.
Recipes are in [VERIFYING](VERIFYING.md).
