# Test Matrix

What to click, what should happen, and what actually did. Written for the
evaluation the panel described: different accounts, different plans, booking
conflicts, trainer availability, account restrictions.

**Nothing in the Result column is filled in yet.** Migrations 0068–0072 are not
pasted, so half of what is listed here does not exist in the database. Filling
these in from reading the code would be worthless — a green row nobody clicked
is the failure mode this whole document exists to prevent.

**Fill it in by running it.** Record what happened, including the failures. A
failure recorded is a fix; a failure omitted is a bug the panel finds instead.

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
| Redeem CORE Points (`points_redeem`) | ✗ | ✗ | ✓ | Rewards page |
| Gym challenges (`challenges`) | ✗ | ✓ | ✓ | Challenges page |

**Two rules to check on every locked screen, not just that it is locked:**

- **It locks and explains, it never hides.** A missing menu item is a bug. The
  wording must come from the `features` row that denied it.
- **The free workout library is never gated** (0019). It exists *for* members
  who cannot pay. If the Free Plan account cannot reach Workouts → Library, that
  is a serious bug, not a gate working.

| # | Test | Expected | Result |
|---|---|---|---|
| 2.1 | Sign in as Free Plan, open every gated screen above | Six locks, each explaining itself in its own words | |
| 2.2 | Same account → Workouts → free library | **Fully available** | |
| 2.3 | Sign in as Free Trial | Tracker, points-earn and challenges work; plan builder, AI and redeem are locked | |
| 2.4 | Sign in as Premium | All six available | |
| 2.5 | Admin → Plans → untick one feature for Premium; reload the member app | That one screen locks; nothing else changes | |
| 2.6 | As the Free Plan member, call the gated table directly from the browser console | **RLS refuses** — the gate is not only in the UI | |

---

## 3. Booking rules

### 3.1 A member cannot be in two places at once (migration 0068)

| # | Test | Expected | Result |
|---|---|---|---|
| 3.1.1 | Book a class Tuesday 10:00, then request PT Tuesday 10:00 | Refused, naming the class and its time | |
| 3.1.2 | Book two classes at the same hour | Refused | |
| 3.1.3 | Class 10:00–11:00, then PT at **11:00** | **Allowed** — the end instant is free | |
| 3.1.4 | Class 10:00–11:00, then PT at **10:30** | Refused — overlap, not equality | |
| 3.1.5 | The clashing slot in the picker, before tapping | Shown, disabled, and says what you are already booked for | |
| 3.1.6 | Cancel the class, then retry the PT slot | Now allowed | |

### 3.2 Trainer availability is per trainer — the panel's scenario

| # | Test | Expected | Result |
|---|---|---|---|
| 3.2.1 | Fill Trainer A's Tuesday 10:00 | A's 10:00 disappears from A's slot list | |
| 3.2.2 | **Second member books Trainer B, Tuesday 10:00** | **Succeeds.** A being full says nothing about B | |
| 3.2.3 | Trainer A teaches a class at 14:00; check A's PT slots | 14:00 absent — a class blocks the coach's own PT | |
| 3.2.4 | Trainer B at the same 14:00 | Available | |

### 3.3 Trainers decide, admin oversees (migration 0071)

| # | Test | Expected | Result |
|---|---|---|---|
| 3.3.1 | As Trainer A, accept a request for A's own class | Succeeds; the member is notified | |
| 3.3.2 | As Trainer A, accept a request on **Trainer B's** class | Refused — matches no policy, and the zero-row guard surfaces it rather than showing a success toast | |
| 3.3.3 | Admin → Bookings after 3.3.1 | Row says "Accepted by *their trainer*", not by the desk | |
| 3.3.4 | Admin reverses it | Allowed; the member is notified of the new outcome | |
| 3.3.5 | As a trainer, try to change a booking's `member_id` | Refused by the guard even on their own class | |
| 3.3.6 | As Trainer A, set capacity on A's class below the number already booked | Refused | |

### 3.4 Nobody waits forever (the sweep)

Backdate `requested_at` in SQL to simulate elapsed time; the sweep reads the
clock, not a queue.

| # | Test | Expected | Result |
|---|---|---|---|
| 3.4.1 | Backdate a pending PT request 25h; open admin Bookings | Trainer notified once | |
| 3.4.2 | Reload the page | **No second notification** — the dedupe index holds | |
| 3.4.3 | Backdate 49h | Member told it is still pending and they may pick another trainer | |
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
| 6.3 | Member calls `set_account_status` from the console | Refused | |
| 6.4 | Member updates `memberships` directly | Refused | |
| 6.5 | Member reads another member's `member_commitments` | Refused | |
| 6.6 | Trainer reads a member's measurements without sharing on | Refused (`trainer_may_see`, 0032/0048) | |
| 6.7 | Suspended account signs in | Refused, with the reason | |

---

## Open questions — decide these before the panel does

1. **Can a frozen member book?** The entitlement check uses
   `membership_is_usable()`, and `frozen` is not usable — so no. That is
   probably right, but it is not written down anywhere as a decision, and a
   member who froze for a holiday may reasonably expect to book for after it.
2. **Should a freeze extend the expiry date?** `unfreezeMembership()` does
   extend it. Confirm the gym agrees, because it is money.
3. **Should the 60-day yearly freeze ceiling be enforced, or only shown?**
   `frozen_days_last_year()` computes it; nothing refuses on it yet.
4. **Does RA 7394 constrain the refund table?** If it does, the law wins. See
   [MEMBERSHIP_POLICY](MEMBERSHIP_POLICY.md).

## How to run the SQL checks

As a **real member/trainer role, never the owner** — an owner bypasses RLS, so
an unprotected table looks safe when the test role simply could not reach it.
Recipes are in [VERIFYING](VERIFYING.md).
