# Panel Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans`.
> Steps use checkbox (`- [ ]`) syntax. Tick them as they land — this file is the
> tracker that survives a compaction, so an untidy checkbox costs a re-derivation.

**Goal:** Close every gap in the panel's system-improvement list — booking
integrity, membership policy, trainer evaluation, information architecture — and
prove each one works from all three roles.

**Architecture:** Rules that a client could fake go in SQL (migrations 0068–0072),
consistent with the whole codebase. The apps get the screens that expose them.
Nothing here rewrites the booking model; it adds guards, policies and reasons to
the model 0015/0017 already established.

**Tech Stack:** Supabase Postgres + RLS, React 19, Vite. Admin = Tailwind v3,
member = Tailwind v4.

**Spec:** the panel's improvement list, reproduced in *Requirement Map* below.

## Global Constraints

- **Migrations are pasted by hand, one at a time.** `db push` is wrong here.
  Every file must be re-runnable (`if not exists`, `drop policy if exists`,
  `create or replace`).
- **Manila is UTC+8.** Calendar dates come from `utils/dates.ts`; SQL uses
  `at time zone 'Asia/Manila'`, never `current_date` for a local day.
- **Anything a client can grant or skip lives in SQL.** A screen that enforces a
  rule the database does not is not an implementation of that rule.
- **A zero-row UPDATE/DELETE is not an error** — every status write needs
  `.select()` and a zero-row guard.
- **`auth.uid()` is NULL outside a browser session.** SECURITY DEFINER guards
  must read `auth.uid() is not null and <not-admin>`, never bare `is distinct from`.
- **No new mock data. NULL means NULL and says so.** A withheld average is not 0.
- **Lint baselines: admin 37, member 60.** Both apps must build clean
  (`noUnusedLocals` makes an unused import a build failure).
- Type floor 12px, amber = primary action, violet = selection. No greens/reds.

---

## Requirement Map

Every line of the panel's list, mapped to the task that closes it. Nothing is
dropped; items already satisfied are marked with the evidence.

| # | Requirement | Task |
|---|---|---|
| A1 | Reason for suspension/freezing | 2 |
| A2 | Research basis for membership plans | 9 |
| A3 | Freeze / cancel / refund policies, defined and in-system | 2, 9 |
| A4 | Statement-style modal labels, not question-style | 7 |
| A5 | Class booking limits settable by Admin **and** Trainer | 4 |
| A6 | Export the schedule (PNG and beyond) | 6 |
| A7 | Test what each membership plan actually unlocks | 10 |
| A8 | A test account per plan, verified against its plan | 10 |
| A9 | Notifications and Events look redundant — combine | 7 |
| A10 | Coordinate/integrate CORE Points in the gym | 8 |
| A11 | Attendance and History as tabs, not separate sections | 7 |
| A12 | Everything an IT expert may test must work | 10, 11 |
| M1 | No double-booking across classes and PT | 1 |
| M2 | Where announcements and events live for members | 7 |
| M3 | Member submits rating + monthly evaluation + feedback | 5 |
| M4 | Payment marked paid shows on the member side (esp. PT) | 3 |
| M5 | Features traceable to the research objectives | 9 |
| T1 | Fix bugs; trainer approves bookings under admin oversight | 4 |
| T2 | Two trainers, same slot, independent capacity | 1, 10 |
| T3 | Trainer feedback and recommendations | 5 |
| T4 | Trainer sees ratings **without** knowing who rated | 5 |
| T5 | Admin sees ratings, evaluations and feedback for monitoring | 5 |
| T6 | Members can see trainer credentials | 5 |
| T7 | Acceptance logic — availability alone, or prioritisation | 4 |
| T8 | Pending booking left too long: remind, escalate, offer out | 4 |
| T9 | Real-world edge cases around waiting and approaching dates | 4, 10 |
| OT | Cross-role testing, conflicts, edge cases, consistency | 10, 11 |

---

## File Structure

**New migrations** (each its own paste):
- `supabase/migrations/0068_booking_conflicts.sql` — member-level overlap guard
  across `bookings` and `pt_sessions`; trainer-level overlap guard.
- `supabase/migrations/0069_account_status_events.sql` — a reason for every
  suspension, mirroring `membership_events`.
- `supabase/migrations/0070_refund_policy.sql` — refund tiers as data, a
  `refund_quote()` function, freeze ceiling in settings.
- `supabase/migrations/0071_trainer_decisions.sql` — trainers approve their own
  work; every decision is logged and admin can reverse it; the stale-request sweep.
- `supabase/migrations/0072_trainer_feedback.sql` — trainer→member feedback and
  recommendations; anonymised rating reads for the trainer.

**New shared modules:**
- `g-fitness-admin/src/lib/api/trainerRatings.ts` — admin read of evaluations.
- `g-fitness-admin/src/lib/api/accountEvents.ts` — suspension history.
- `g-fitness-admin/src/lib/api/refunds.ts` — quote + record.
- `g-fitness-member/src/lib/api/trainerFeedback.ts` — trainer→member notes.
- `g-fitness-admin/src/utils/exportImage.ts` — DOM node → PNG, no new dependency.

**Modified:** listed per task.

---

## Task 1: A member cannot be in two places at once

**Requirement:** M1, T2.

**Files:**
- Create: `supabase/migrations/0068_booking_conflicts.sql`
- Modify: `g-fitness-member/src/lib/api/bookings.ts`,
  `g-fitness-member/src/lib/api/ptSessions.ts`,
  `g-fitness-member/src/pages/BookClass.tsx`

**Decision — where the rule lives.** In SQL, on both tables, as a BEFORE INSERT
trigger. The member app could check before inserting and still lose a race; and
the front desk books people in too, through a different screen. A guard in one
form is not the rule.

**Decision — overlap, not equality.** A 10:00 class of 60 minutes conflicts with
a 10:30 PT session. Compare half-open intervals `[starts_at, starts_at + duration)`
with `overlaps`, never `starts_at = starts_at`.

**Decision — T2 is already right at the database.** `idx_pt_sessions_trainer_slot`
is `unique(trainer_id, starts_at) where status in ('pending','approved')` — it is
scoped to the trainer, so Trainer A being full says nothing about Trainer B. What
is unverified is whether the *member's slot picker* narrows by trainer. Task 10
proves it end-to-end; this task fixes it if the read is wrong.

- [x] **Step 1: Write `member_busy_at()` and the two triggers** — landed as `member_commitments()` + `assert_member_free()` + `assert_trainer_free()`, commit c9cfde7

```sql
-- Every commitment a member already holds, as intervals, from both tables.
create or replace function member_commitments(p_member uuid)
returns table (source text, starts_at timestamptz, ends_at timestamptz, label text)
language sql stable security definer set search_path = public as $fn$
  select 'class', c.scheduled_at,
         c.scheduled_at + make_interval(mins => c.duration_minutes), c.name
    from bookings b join classes c on c.id = b.class_id
   where b.member_id = p_member and b.status in ('pending','approved')
  union all
  select 'pt', s.starts_at,
         s.starts_at + make_interval(mins => s.duration_minutes), 'Personal training'
    from pt_sessions s
   where s.member_id = p_member and s.status in ('pending','approved');
$fn$;
```

Then `trg_booking_no_member_overlap()` on `bookings` and
`trg_pt_no_member_overlap()` on `pt_sessions`, each raising a message naming the
clash: `'You are already booked for % at %.'`. Exclude the row's own id on UPDATE.

- [ ] **Step 2: Paste 0068, then probe it** — BLOCKED ON USER

Book a class and a PT session at the same hour as the same member; the second
insert must raise. Book the same hour as a *different* member — must succeed.

- [x] **Step 3: Surface the clash before the tap, not only after**

`BookClass.tsx` marks a slot "You're busy" using `listMemberCommitments()`. The
trigger stays the boundary; this is courtesy.

- [x] **Step 4: Build, lint, commit** — member build clean, lint 59 (baseline 60)

---

## Task 2: A suspension, freeze or cancellation that says why

**Requirement:** A1, A3 (the reason half).

**Files:**
- Create: `supabase/migrations/0069_account_status_events.sql`,
  `g-fitness-admin/src/lib/api/accountEvents.ts`
- Modify: `g-fitness-admin/src/pages/Members.tsx`,
  `g-fitness-admin/src/pages/Settings.tsx`,
  `g-fitness-admin/src/lib/api/members.ts`

**Decision — an events table, not a column.** `membership_events` (0057) already
proved the shape: a reason on the row is overwritten by the next change and loses
the history the desk actually argues about. `account_status_events` mirrors it,
including **no UPDATE or DELETE policy for anyone**.

**Decision — an RPC, not a trigger reading a session variable.** `set_account_status(
p_profile, p_status, p_reason)` writes the event and the profile in one
transaction and rejects a blank reason for `suspended` and `archived`. A trigger
on `profiles` cannot see a reason that is not a column.

- [x] **Step 1: Write 0069** — table, `set_account_status()`, RLS (select: self,
      admin, staff; insert: **nobody** — the RPC is SECURITY DEFINER).
- [ ] **Step 2: Paste and probe** — a suspend with a blank reason must raise. BLOCKED ON USER
- [x] **Step 3: Members.tsx** — the suspend dialog takes a required reason.
      Reactivate takes an optional one.
- [x] **Step 4: MemberDetail.tsx** — landed in MemberDetailDrawer.tsx (the route is a redirect) — an "Account history" section listing events.
- [x] **Step 5: Member app** — a suspended member sees *why* on the login screen,
      not a generic refusal.
- [x] **Step 6: Build, lint, commit** — commit 977e07f, admin 37 / member 59

---

## Task 3: A payment the member can see was received

**Requirement:** M4.

**Files:**
- Modify: `g-fitness-admin/src/pages/Payments.tsx`,
  `g-fitness-admin/src/lib/api/payments.ts`,
  `g-fitness-member/src/pages/PaymentHistory.tsx`,
  `g-fitness-member/src/lib/api/payments.ts`,
  `g-fitness-member/src/pages/Home.tsx`

**Finding to confirm first:** `payments.status` is already
`completed|pending|failed` and `paid_on` is distinct from `created_at` (0045).
What is missing is (a) a PT session's payment link and (b) the member being
*told*. Confirm by reading both `payments.ts` modules before writing anything.

- [ ] **Step 1: Admin marks a pending payment paid** — one action, writing
      `status='completed'` and `paid_on`, with a `.select()` zero-row guard.
- [ ] **Step 2: Notify the member** — `notify_once` with a dedupe key of
      `payment:<id>:paid`, so a double-click cannot send two receipts.
- [ ] **Step 3: PT payment** — a `pt_sessions.payment_id` link, so "paid" is
      visible on the session, not only in the ledger.
- [ ] **Step 4: Member side** — PaymentHistory shows Paid/Pending distinctly and
      Home surfaces an outstanding balance.
- [ ] **Step 5: Build, lint, commit**

---

## Task 4: Trainers decide, admin oversees, and nothing waits forever

**Requirement:** T1, T7, T8, T9, A5.

**Files:**
- Create: `supabase/migrations/0071_trainer_decisions.sql`
- Modify: `g-fitness-member/src/pages/trainer/TrainerBookings.tsx`,
  `g-fitness-member/src/lib/api/ptSessions.ts`,
  `g-fitness-member/src/lib/api/bookings.ts`,
  `g-fitness-admin/src/pages/Bookings.tsx`,
  `g-fitness-admin/src/services/bookingQueueService.ts`

**Decision — T7: availability, not a priority queue.** A prioritisation mechanism
needs a fairness rule the gym has not stated, and an unexplained ordering is worse
than first-come-first-served. Requests are ordered by `requested_at`; the trainer
sees how long each has waited. Revisit only if the gym asks.

**Decision — oversight is reversal plus a log, not a second approval.** Making a
trainer's approval provisional until an admin confirms means a member is told
"approved" twice and can be un-approved after arriving. Instead: the trainer's
decision is final and immediate, `decided_by` and `decided_by_role` are recorded,
every decision writes to `activity_log`, and the admin can reverse any of them
from the same queue. Admin control without a member-visible limbo.

**Decision — T8 is a re-runnable sweep, not a trigger.** "Has been pending for
three days" is not an event; nothing writes a row when time passes. Same shape as
0051/0053, and pg_cron stays optional — the admin Bookings page calls it on load,
so the escalation happens late at worst, never not at all.

**The escalation ladder** (each step `notify_once`, dedupe-keyed):
| When | Who hears |
|---|---|
| pending 24h | trainer: "still waiting" |
| pending 48h | member: "still pending — you may pick another trainer" |
| pending 72h | admin: it is on the desk's queue now |
| session < 24h away, still pending | trainer **and** member and admin |
| start time passed, never decided | auto-`rejected`, member told why, slot freed |

- [x] **Step 1: Write 0071** — `decided_by`/`decided_by_role` columns; update
      policies letting a trainer decide *their own* class bookings and PT
      sessions; `sweep_stale_requests()`; activity-log triggers.
- [ ] **Step 2: Paste and probe** — BLOCKED ON USER. As a trainer, approve a session on another
      trainer's roster: must be refused by RLS.
- [x] **Step 3: TrainerBookings** — rewritten; class + PT in one queue, waiting time per row — Accept/Decline, with waiting time on each row.
      Delete the "read-only, deliberately" docstring; it is no longer true.
- [x] **Step 4: Admin Bookings** — show who decided, allow reversal, run the sweep.
- [x] **Step 5: A5 — class capacity** — policy + guard in 0071; the trainer-facing field is still owed — trainer may edit `capacity` on their own
      classes; admin on any. Policy first, then the field.
- [x] **Step 6: Build, lint, commit** — commit 87facd4

---

## Task 5: Evaluation that is anonymous to the trainer and legible to the gym

**Requirement:** M3, T3, T4, T5, T6.

**Files:**
- Create: `supabase/migrations/0072_trainer_feedback.sql`,
  `g-fitness-admin/src/lib/api/trainerRatings.ts`,
  `g-fitness-member/src/lib/api/trainerFeedback.ts`
- Modify: `g-fitness-admin/src/pages/Trainers.tsx`,
  `g-fitness-member/src/pages/trainer/TrainerHome.tsx`,
  `g-fitness-member/src/pages/TrainerProfile.tsx`

**Already built (0066), verify rather than rebuild:** monthly `period`, the
`(member_id, trainer_id, period)` key, `trainer_rating_summary` with
`security_invoker = false`, and the admin `trainer_evaluation_months` view.

**Decision — T4 anonymity is a view, not a UI omission.** A trainer reading
`trainer_ratings` directly would see `member_id`; hiding the column in JSX leaves
it in the network response. `trainer_ratings_anon` exposes score, comment, period
and **no member identity**, and the trainer's SELECT policy points at that.

**Decision — T5 admin sees identity.** The gym monitors and coaches; an anonymous
complaint it cannot follow up is not monitoring. Admin reads the base table.

- [ ] **Step 1: 0072** — `trainer_feedback` (trainer→member, T3), the
      `trainer_ratings_anon` view, tightened trainer SELECT policy.
- [ ] **Step 2: Paste and probe** — as a trainer, `select member_id from
      trainer_ratings` must return nothing readable.
- [ ] **Step 3: Trainer app** — ratings + comments, no names; a form to leave a
      member feedback and recommendations.
- [ ] **Step 4: Admin Trainers** — an Evaluations panel: score distribution,
      month over month, comments **with** names.
- [ ] **Step 5: T6 credentials** — confirm 0054's credentials render on the member
      app's trainer profile. If they do not, wire them.
- [ ] **Step 6: Build, lint, commit**

---

## Task 6: Take the schedule out of the app

**Requirement:** A6.

**Files:**
- Create: `g-fitness-admin/src/utils/exportImage.ts`
- Modify: `g-fitness-admin/src/pages/Schedule.tsx`

**Decision — no html2canvas.** The calendar is our own markup; serialising it into
an SVG `<foreignObject>` and painting that to a canvas needs no dependency and no
CDN. Fonts are the known risk — inline the two families as the export runs, and
if that fails, fall back to CSV rather than shipping a PNG with the wrong type.

- [ ] **Step 1: `exportImage.ts`** — node → PNG blob → download.
- [ ] **Step 2: Export menu on Schedule** — PNG, plus CSV and a printable view
      (`window.print()` with a print stylesheet). Three formats, three real uses:
      pin it up, open it in Excel, hand it to a member.
- [ ] **Step 3: Verify the PNG actually decodes** — download it and read it back.
- [ ] **Step 4: Build, lint, commit**

---

## Task 7: Information architecture — say it once, in the right place

**Requirement:** A4, A9, A11, M2.

**Files:**
- Modify: `g-fitness-admin/src/pages/Notifications.tsx`,
  `g-fitness-admin/src/pages/Events.tsx`,
  `g-fitness-admin/src/pages/Attendance.tsx`,
  `g-fitness-admin/src/pages/AttendanceHistory.tsx`,
  `g-fitness-admin/src/components/layout/Sidebar.tsx`,
  `g-fitness-member/src/pages/Home.tsx`, `g-fitness-member/src/pages/Events.tsx`

**A9 decision — one section, two tabs; not one merged list.** An announcement is
a message with no date; an event is a date with a message. Merging the *records*
would give every announcement a nullable date and every event a nullable audience,
and the admin form would ask questions that do not apply. They share a home —
**Communications**, with Announcements and Events as tabs — and the same
attachment picker. The tables stay apart.

**A11 decision — same treatment.** Attendance (today's desk) and History (the
report) become tabs of one **Attendance** section. The sidebar loses a row.

**A4:** replace every question-style modal label. Audit is mechanical:
`grep -rn 'label="\(Who\|When\|Where\|What\|They\|How\)' src/`. "Who" → "Member",
"When" → "Date & Time", "They Are" → "Personal Information".

**M2:** members currently reach events from Book. Announcements have no home
beyond the bell. Home gets an "Updates" card — the latest announcement and the
next event — with a route to the full list.

- [ ] **Step 1:** A4 grep, list every hit, replace with statement labels.
- [ ] **Step 2:** Communications shell with two tabs; both existing pages become
      panels. Routes `/notifications` and `/events` must keep working — a
      bookmark that 404s is a regression.
- [ ] **Step 3:** Attendance tabs, same rule for `/attendance-history`.
- [ ] **Step 4:** Sidebar down to seven rows; the drawer still opens on the
      current page **in the state initialiser, never an effect**.
- [ ] **Step 5:** Member Home "Updates" card + `/updates` route.
- [ ] **Step 6:** Build, lint, commit.

---

## Task 8: CORE Points that mean something at the desk

**Requirement:** A10.

**Files:**
- Modify: `g-fitness-admin/src/pages/Rewards.tsx`,
  `g-fitness-admin/src/pages/Attendance.tsx`,
  `g-fitness-admin/src/pages/MemberDetail.tsx`

**Reading of the requirement:** points exist (0051) and members can see them, but
the *gym* cannot act on them — the desk cannot see a member's balance while they
are standing there, and redemption is not a counter action. "Integrate in gyms"
means the front desk, not more member-side chrome.

- [ ] **Step 1:** Balance on the check-in card, so the desk sees it at check-in.
- [ ] **Step 2:** Redeem-at-the-desk on Rewards, writing the ledger through the
      existing SECURITY DEFINER writer — **the ledger has no INSERT policy for
      any role** and that must stay true.
- [ ] **Step 3:** Points on MemberDetail with the ledger as history.
- [ ] **Step 4:** Build, lint, commit.

---

## Task 9: The paper trail — research, policy, objectives

**Requirement:** A2, A3 (the policy half), M5.

**Files:**
- Create: `supabase/migrations/0070_refund_policy.sql`,
  `docs/MEMBERSHIP_POLICY.md`, `docs/OBJECTIVES_TRACE.md`
- Modify: `docs/BUSINESS_MODEL.md`, `g-fitness-admin/src/pages/Settings.tsx`,
  `g-fitness-member/src/pages/Terms.tsx`

**A2 honesty constraint.** I can cite the literature I actually know and mark what
needs checking; **I must not invent citations**. Every reference gets author, year
and venue, and anything I cannot vouch for is listed as "to verify" rather than
dressed up as a source. A fabricated citation in a capstone is worse than none.

**A3 — the policy the system will enforce**, drafted for the gym to approve:
| Situation | Outcome |
|---|---|
| Cancel within 7 days, no visits | 100% refund |
| Cancel within 7 days, has visited | 50% |
| Cancel 8–30 days | 25% |
| Cancel after 30 days | none; unused whole months may be frozen instead |
| Freeze | max 2 per calendar month (0057), max 60 days per year |
| Medical, with documentation | admin override, any amount, reason required |

Cash-only gym: a refund is a recorded desk transaction, not a gateway reversal.

- [ ] **Step 1:** `refund_quote(membership_id)` in SQL returning percentage **and
      the rule that produced it** — a number with no reason cannot be argued with.
- [ ] **Step 2:** Tiers editable in Settings; seeded with the table above.
- [ ] **Step 3:** Cancel dialog shows the quote before confirming; the amount and
      reason land on `membership_events`.
- [ ] **Step 4:** `docs/MEMBERSHIP_POLICY.md`, linked from Terms so a member can
      read the rule that binds them — **a rule enforced only in SQL ambushes them**.
- [ ] **Step 5:** `docs/OBJECTIVES_TRACE.md` — each research objective → the
      features that serve it → how to demonstrate it. Objectives come from the
      manuscript; **quote it, do not paraphrase it into something it did not say**.
- [ ] **Step 6:** Commit.

---

## Task 10: Prove it, per role and per plan

**Requirement:** A7, A8, A12, T2, T9, OT.

**Files:**
- Create: `docs/TEST_MATRIX.md`, `scripts/seed-test-accounts.sql`,
  `scripts/verify/*.mjs`

**Decision — real accounts, not assertions about code.** The panel will click.
Seed one member per plan (Free Trial / Free Plan / Premium), two trainers with
overlapping availability, and one staff account, then drive each app.

- [ ] **Step 1:** `seed-test-accounts.sql` — re-runnable, every password recorded
      in `docs/TEST_MATRIX.md`. Emails on the existing `corefitness-test.com`
      domain so real members are never touched.
- [ ] **Step 2:** Plan-gate matrix — for each plan × feature, what the member
      should see. Drive it with Playwright and record the actual result.
      **A gate must lock and explain, never hide.**
- [ ] **Step 3:** T2 scenario — Trainer A booked solid at Tuesday 10:00, Trainer B
      free. A second member books B at Tuesday 10:00 and it must succeed.
- [ ] **Step 4:** M1 scenario — same member, class then PT at one time: refused.
- [ ] **Step 5:** T8 scenario — a request backdated 72h; run the sweep; assert
      exactly the notifications in the ladder, and no duplicates on a second run.
- [ ] **Step 6:** Payment, freeze, cancel-with-refund, suspend-with-reason: each
      end to end, admin action visible on the member side.
- [ ] **Step 7:** Record every result in `docs/TEST_MATRIX.md` — **including the
      failures**, which become fixes, not omissions.
- [ ] **Step 8:** Commit.

---

## Task 11: Business-logic review, beyond the visible bugs

**Requirement:** A12, OT (last line).

Not a bug hunt — a read of the rules for gaps that only show up in use.

- [ ] **Step 1:** Every `.update(`/`.delete(` in both `lib/api` without a
      `.select()` zero-row guard. This has bitten four times.
- [ ] **Step 2:** Every SECURITY DEFINER function: does its guard block its own
      legitimate caller? (0055 and 0062 both shipped this bug.)
- [ ] **Step 3:** Every policy added in 0068–0072: is RLS actually **on** for that
      table? Assert it in the file.
- [ ] **Step 4:** Expiry, freeze and suspension interactions — can a frozen member
      book? Can a suspended one? Should a freeze extend the expiry date?
- [ ] **Step 5:** Fix what turns up; record what is deliberate.
- [ ] **Step 6:** Update CLAUDE.md (**overdue**), MIGRATION_STATUS, roadmap to 0072.
- [ ] **Step 7:** Commit.

---

## Sequencing

1 → 2 → 3 → 4 → 5 are the logic changes and each needs its migration pasted
before the next is verified. 6, 7, 8 touch only the apps and can be done at any
point. 9 is writing. 10 and 11 come last, because they test the rest.

**Blocking on the user:** every migration file. They are pasted by hand, one at a
time, in the Supabase SQL Editor. The apps must degrade honestly until then — a
screen that reads a table that does not exist yet says so.
