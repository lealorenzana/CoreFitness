# Migration status — what's real vs. still mock

Detail split out of [CLAUDE.md](../CLAUDE.md). Last audited **2026-08-15**.

## Page audit

**The migration is complete. Nothing in either app reads mock data.** `SharedStorage` is deleted
from both apps, as are `mockDashboard.ts`, `mockRetention.ts`, `mockServices.ts`,
`mockTrainerFeedback.ts` and the member's `data/events.ts`. No orphaned (routeless) pages remain.

### The last mock data hid in chrome, not pages (2026-08-15)

An earlier version of this file claimed no mock data remained. That was wrong, and it stayed wrong
for a while because the audit only looked at `pages/`. Three things were still on localStorage:

- **`main.tsx` called `initializeSharedData()` on every boot**, and that function ran
  `SharedStorage.setPayments(MOCK_PAYMENTS)` *unconditionally* — mock payments were rewritten into
  localStorage on every single page load.
- **The admin header notification bell** (`components/layout/Header.tsx`) — on every admin page —
  generated expiry warnings from mock members. It now calls `dashboardService.getHeaderAlerts()`.
- **`MemberDetailModal`** showed payments, attendance and trainer notes from mock fixtures.

Why it survived: the screens anyone demoed — Dashboard, Members, Payments, Revenue — were real.
**When auditing for mock data, grep `components/layout/`, shared modals and `main.tsx`, not just
`pages/`.**

Real across both apps: auth for all 3 roles (real `supabase.auth`, no hardcoded credentials),
member self-registration → admin approval, membership plans catalog, payment recording (updates
the member's real membership status/expiry), attendance (QR + manual check-in), notifications,
trainer account creation, group classes, personal training, events, gym settings, staff accounts.

**Settings** and **Events** each had a duplicate of a real feature living beside it — a second
membership-plans editor in Settings, a second broadcast composer in Events, both writing to
localStorage while the real page wrote to Postgres. Duplicated editors are worse than missing
ones: staff can't tell which is live. Both are now links to the single real page.

## Progress Hub (migration 0020) — the last mock, now real

`body_measurements`, `fitness_goals` and `workout_logs` exist. **Members write their own rows;
trainers and the front desk read them.** A trainer-only model would leave the feature dead for
every member without a trainer, which on the free tier is all of them.

Fields deliberately **not** carried over from the old fixtures, because nothing measures them:

- **`calories`** on a workout log — needs body mass and heart rate. The Charts tab now plots
  *minutes trained*, which the member actually records.
- **`isPr`** (personal-record flag) — needs per-exercise weights, which this schema doesn't model.
- **`muscleMassKg`** — needs a body-composition scale the gym doesn't have.
- **Badges, entirely.** No table, no earning rules — gamification with nothing behind it, and the
  easiest thing on the screen for a panel to puncture. **They came back in 0028 with both**; see
  [Progression and achievements](#progression-and-achievements-0028) below.
- **Weekly workout plans** with sets and reps — nothing stores them. The curated free resources
  under Workouts are the real answer to "what should I do".

Two rules the tabs follow:

- **A blank field is NULL, not zero.** `Number('')` is `0`, so a member who only weighs themselves
  would otherwise record a 0 cm waist — and one such point flattens an entire chart. The weight
  chart skips entries with no weight rather than plotting them at the floor.
- **Goal progress is derived, never stored.** A `current_value` column would drift the moment
  someone logged a new weight and forgot to come back. Goals tied to a readable metric (weight,
  body fat, waist) show a bar; a custom goal shows none, because nothing measures it.

**Trainer feedback needs no table** — a trainer's recommendation already inserts a `notifications`
row, and that tab reads those back. Two tables holding the same message would eventually disagree,
and the member would see one version in their bell and another in Progress.

`useMemberId()` returns the real `auth.uid()`. It used to return `localStorage['memberEmail']`
with a hardcoded fallback of `'eya.lorenzana@email.com'`, so a member without that key cached read
a stranger's progress data.

Both "AI" features stay rule-based by design (admin `chatbot.ts`, `trainerChatbot.ts`) — that is
not mock data pending migration.

## Progression and achievements (0028)

Badges were deleted in 0020 for having no table and no earning rules. 0028 supplies both, so the
feature returns without the thing that made it fakeable.

**The rules live in SQL.** `sync_my_achievements()` is SECURITY DEFINER, grades the caller against
the real tables and is the only thing that can write `achievement_unlocks` — the table has **no
INSERT policy at all**. Had the browser decided who earned what, any member could unlock anything
with one REST call, which is the 0020 objection wearing a table.

The catalogue (title, icon, tier) lives in `src/data/achievements.ts` because it is presentation.
The halves are joined by a string key and nothing type-checks that join, so
`npm run check:achievements` diffs them: a key with no rule is a badge nobody can earn, a rule with
no key renders as a blank tile.

**A training day** is a calendar day (Manila) with either a check-in or a self-logged workout.
Counting *days*, not rows, is what stops three log entries in one afternoon reading as three
sessions. `verified_days` and `logged_days` are reported separately and shown separately — the gym
witnessed the first, the member's own word covers the second.

**Levels need two axes, both met.** Intermediate is 20 training days *and* 6 consistent weeks;
Advanced is 60 and 16. A week is consistent at two training days. Volume alone can be crammed into
a fortnight; consistency alone can be two months of doing very little. Neither threshold references
a paid entitlement — gating Advanced behind PT or classes would make it unreachable on the free
tier, which is every self-registered member.

Two rules that look like bugs and are not:

- **A level, once reached, is kept.** The displayed level is the higher of "computed now" and
  "highest ever unlocked". Same reasoning as `fitness_goals.achieved_on` — a quiet month is not
  grounds for demoting somebody. `member_progression()` returns `computed_level` alongside `level`
  so a screen can tell the difference.
- **The earned level never overwrites `experience_level`.** That column is self-declared (0016) and
  drives class recommendations; somebody who trained ten years elsewhere is advanced here on day
  one with zero check-ins. `LevelProgressCard` *offers* to raise it and can only ever raise it.

`trainer_stats()` counts an approved `pt_sessions` row whose `starts_at` has passed as delivered —
the enum is the shared `booking_status` and has no 'completed'. Classes led count only those with
an approved booking, because the scheduler generates rows from templates weeks ahead and a class
nobody attended did not happen.

## Notifications as an inbox (0029)

The bell used to have exactly one way to get rid of something: its X **deleted the row**. That is
the wrong default for the thing that *is* the member's history — a payment receipt swiped away in
a hurry was gone.

Three states now, and the two swipes are not the same thing:

| | `cleared_at` (swipe left) | `archived_at` (swipe right) | DELETE |
|---|---|---|---|
| In the bell | no | no | — |
| In the Inbox list | **yes** | no | — |
| In Archived | no | yes | — |
| Recoverable | yes | yes | **no** |

Deleting is still a real DELETE, but it only exists on the full-list screen behind an explicit
multi-select and a confirm. One careless finger on a small row must not destroy a record; a member
who genuinely wants rid of forty of them can select all and say so once.

- **Archiving also sets `cleared_at` and `read`.** Restoring from Archived returns the row to the
  Inbox list without it reappearing in the bell — a notification archived last week popping back
  into the tray would read as a new arrival.
- **The badge counts bell rows only.** Unread-but-cleared does not count, or the badge would point
  at something the bell will not show.
- **`prevent_notification_tamper`** pins a recipient's UPDATE to `read`/`archived_at`/`cleared_at`.
  `notifications_update_self` grants UPDATE on the whole row, which meant a member could rewrite
  the title and body of a message the gym sent them — in the record their trainer also reads.
  Admins keep a way in for support fixes.
- Swipe is not the only path. The bell's X does the same as swipe-left, and the detail sheet has
  Archive and Mark read/unread buttons, because a gesture is invisible to a keyboard.

The full list lives at `/member/notifications` and `/trainer/notifications` — one component, the
route picks the shell. **The admin app's own bell is untouched** and still deletes.

## Training plans and their reminder (0030)

A member picks weekdays and one time; `gym_plans` holds **one row per chosen weekday**, so "who is
training today" is a plain indexed equality and nobody can list Tuesday twice.

The feature is the *reminder*, so it has two delivery paths and the app is honest about which is
guaranteed:

- **The Home card cannot fail.** `TodayPlanCard` reads the member's own rows: on a planned day it
  says so, gives the time, and says whether they have already checked in. No scheduler involved.
- **The notification is the nudge.** `send_due_gym_reminders()` writes a real `notifications` row
  and is called by pg_cron every 15 minutes.

Rules that look like bugs and are not:

- **No nudge if you already checked in.** Being told to go to the gym you are standing in is worse
  than no reminder.
- **A three-hour window after the planned time.** A 6pm reminder arriving at 11pm is noise.
- **`last_reminded_on`** makes it once-a-day whatever the cron cadence, so the schedule can be
  tightened without spamming anyone.
- **`send_due_gym_reminders()` is revoked from `authenticated`.** Nothing in either app may trigger
  a sweep of reminders; that is cron's job alone.

**pg_cron is optional.** The migration's scheduling block is wrapped in an exception handler, so a
project without the extension still gets everything else. Check `select * from cron.job;` — if it
is empty the nudge is not scheduled and only the Home card is live.

## What sign-up collects (0031)

`member_profiles` has carried `emergency_contact_*` since 0001 and **nothing ever wrote to them**.
Registration now fills them, and adds the two columns that never existed: `date_of_birth` and
`gender`.

- **A birth date, never an age.** An `age int` is right for one year and then quietly lies with
  nothing in the app noticing. `age_years()` derives it; the check constraint rejects future dates
  and anything implying 130+, which catches typos without inventing gym policy on who may join.
- **Emergency contact is required, address is optional.** In a business where people lift heavy
  things, "who do we call" is the one blank field that matters. One line in `validate()` if the
  gym would rather it were optional.
- **The details ride through the review queue.** A self-registering member has no `member_profiles`
  row — the trigger writes `profiles` + `pending_registrations`, and approval creates the member
  row. So `pending_registrations` gained matching columns and `approveMemberRegistration` copies
  them across. Without that copy the intake would be collected, shown once, and deleted with the
  queue entry.
- `handle_new_member_signup` was rewritten (keeping 0027's phone-uniqueness guard) to carry the new
  metadata keys. Every value goes through `nullif(…, '')` — `''::date` raises rather than yielding
  NULL, so blank optional fields would otherwise break the whole signup.

**Not yet updated:** the `create-member` Edge Function and the admin's walk-in Add Member form
still do not collect these, so a walk-in member has NULL birth date, gender and emergency contact.

## What a trainer can see about a member (0032)

Since 0020, `body_measurements`, `fitness_goals` and `workout_logs` carried a blanket
`*_select_staff` policy: **any trainer could read every member's weight, body fat and goals**,
whether or not they coached them and whether or not the member agreed. Nothing displayed it, so it
went unnoticed — the permission was live regardless.

`member_share_prefs` gives the member three switches, and `trainer_may_see()` makes them the actual
boundary. Gating in the UI alone would have left the data one REST call away.

- **Admin and staff are not gated.** They run the gym and answer for incidents. The member app
  therefore labels the section "What your trainer sees" and states plainly that staff always see
  membership and check-ins — a switch implying otherwise would be the same lie as the six dead
  Settings toggles.
- **Default is shared.** No row = shared, which is exactly the pre-0032 behaviour, so applying the
  migration changes nothing until a member chooses. Defaulting to hidden would have silently
  blanked every trainer already coaching someone.
- **Trainers may read the switches.** That is what lets the trainer app show "Not shared" instead
  of an empty panel — telling a coach "this member has no goals" when they have several and kept
  them private is a lie the app would be telling on the member's behalf.
- The trainer's member modal shows **two levels, named apart**: "Says" (self-declared, drives class
  recommendations) and "Earned" (from `member_progression`). Labelling both "Level" is what made
  the member's own screens look self-contradictory.

Verified on a throwaway Postgres **as a non-superuser role** — a table owner bypasses RLS, so
policy tests run as the owner pass vacuously. Confirmed: default shares, a member always sees their
own rows, a trainer is blocked on exactly the switched-off categories, and admin is unaffected.

## Mock data the audit missed

"No mock data remains" was **wrong twice**. Both were found by looking at the running app, not by
grepping — which is the lesson: a page nobody opens during an audit keeps whatever it was born with.

**Member Events** (fixed). Six invented events with 2024 dates, invented headcounts
("15/25 attending"), and a hardcoded `isRegistered: true` telling every member they were signed up
for a nutrition workshop that never existed. The admin Events page, reading the same database,
correctly showed "No events yet" — the two screens disagreed in the most visible way possible and
it went unnoticed for months. Now on `events` + `event_registrations` (0014). Also removed with it:
"Register Now" that only flipped local state, and Share/Remind buttons that toasted success while
copying nothing and setting nothing. The category filters (Classes/Workshops/Competitions/Social)
went too — `events` has no category column, so they filtered a taxonomy that does not exist.

**Admin chatbot** (`g-fitness-admin/src/data/chatbot.ts`) — **fixed 2026-08-17.** It was the last
mock data in either app, and almost all of it was mock: `Basic ₱800 / Standard ₱1,500 /
Premium ₱2,500` (the same invented pricing purged from the member app), hours of 5:00 AM–10:00 PM
that contradicted `gym_settings`, **three gyms that do not exist** (G-Fitness Poblacion, Fitness
Regency, Ferrer Fitness), **four invented coaches**, **three invented phone numbers**, an invented
class timetable and an invented facilities list including a boxing ring and a yoga studio.

Now: `services/chatbotService.ts` loads `gym_settings`, active `membership_plans`, the trainer
roster and the active `class_templates`; `data/chatbot.ts` is a pure function from that context to
the answer table. Each source degrades independently — a failed trainer read must not blank the
opening hours — and **a section with no data names the page that fills it rather than guessing**
("The opening hours have not been set yet. You can set them in Settings → Gym Information.").
Facilities has no data source at all, so it answers with the gym's own `activity_options` and says
outright that the system keeps no equipment inventory.

Two regex bugs went with it, both found by *running* the patterns rather than reading them:
`/hi/` matched "this", "which" and "hindi", so "What is this?" was answered with a greeting; and
`/location/` never matched "Where are you located?", which fell through to the fallback.

## Per-user state must not live in localStorage (0033)

Two "why does this keep happening again?" bugs, one cause: state that describes the **member** was
stored on the **device**.

- **Onboarding replayed on every new browser/phone.** The gate was
  `localStorage.getItem('onboarding_complete')` in Login.tsx. A second phone, a desktop, a private
  window, a reinstalled PWA or cleared site data had never seen that key, so someone who finished
  onboarding days earlier was walked through all five steps again. Now
  `member_profiles.onboarding_completed_at`, asked of the database at login. **Skipping counts as
  finishing** — otherwise skippers loop forever.
- **Achievement celebrations replayed on every launch.** `markSeen` fired from inside the
  `setQueue` updater on dismissal, wrapped in a swallowed `.catch()`. Anything that interrupted the
  tap-through — closing the app, a dropped request, an error nobody logged — left `seen = false`
  and the badge came back. It is now marked **on show**, which is also what the column name means,
  and failures are logged instead of swallowed. (The RLS policy was verified as *not* the cause: a
  member's `update … set seen = true` affects its row correctly.)

### 0033 did not actually fix it — 0036 does

The paragraph that used to sit here read:

> Both write through the same deferral as `experience_level`: onboarding runs while the member is
> still `pending_approval` with no `member_profiles` row, so the value is parked in localStorage and
> applied on the first read after approval. localStorage is a transport for a pending write here,
> never the source of truth.

Every clause of that is true, and together they describe the bug rather than a fix. **The parking
lot is per-browser.** "Applied on the first read after approval" can only happen on the one device
that did the parking. Sign in on a phone after registering on a laptop and there is nothing to
apply — so `onboarding_completed_at` stays NULL, and the login gate that reads it sends the member
through all five steps. Again on the next device. Forever.

Reported from a real phone on 2026-08-17: a member who had completed onboarding when the account
was created was shown it again on their phone browser. The column was NULL and always would be.

`experience_level` was lost the same way, and that one is worse, because Book a Session reads it to
decide what to recommend — so a member's recommendations were based on an answer the database never
received.

**0036 fixes the ordering instead of the symptom.** `handle_new_member_signup` now creates the
`member_profiles` row at sign-up, so onboarding has somewhere to write when it runs; approval fills
that row in (`apply_registration_details`) instead of inserting it. Existing members are backfilled
to "onboarded", since every row that existed then belonged to somebody who had already been walked
through it.

The client keeps a parking lot for the case where the row still somehow does not exist, but it is
now `auth.users.raw_user_meta_data` (`lib/api/parkedAnswers.ts`) — per **user**, server-side, and
therefore actually able to survive the trip to another device.

**The lesson, since this is twice now:** moving a flag from localStorage into a column does nothing
if the write cannot land. Check that the row exists at the moment the write happens, and remember
that a zero-row UPDATE reports success.

## Dead files — delete, don't fix

**All cleared as of 2026-08-15; both apps build clean and no orphaned pages remain.** Kept as a
record of the pattern, because it recurred four separate times:

- Admin: `Workouts.tsx`, `TrainerEvaluations.tsx`, `GymManagement.tsx`, `MemberProgress.tsx`,
  `data/members.ts`, `data/trainers.ts` — these held all 14 TS errors that blocked the build.
- Member: `ClassSchedule.tsx` (a mock timetable superseded by `BookClass`), `GymList.tsx`,
  `GymDetail.tsx`, `Progress.tsx` (superseded by `progress/ProgressHub.tsx`), and
  `pages/Notifications.tsx` (superseded by the 🔔 in `components/Notifications.tsx`).

A fully built screen with no route is worse than a missing one: it looks like working code, it
keeps compiling, and it quietly holds the build hostage. Check for a route *and* a link before
fixing errors in any page you did not just open from the sidebar.

## Member booking (migration 0015 + 0016)

Group classes and personal training are separate tables on purpose: a class has a roster and a
capacity, a PT session is exactly one member. Routing PT through `classes` would mean capacity-1
classes, and every "how full is this class" query would quietly count PT sessions too.

Both start `pending`; **the front desk approves both** from the single admin Bookings queue.
Trainers see requests read-only.

Three things a member legitimately needs but the table policies correctly refuse — a trainer's
name (lives in `profiles`), how full a class is (needs everyone's `bookings`), when a trainer is
already busy (needs everyone's `pt_sessions`). Migration 0016 exposes each as a **narrow
read-only view** (`public_trainers`, `class_availability`, `trainer_busy_slots`) rather than
widening the policies, which would leak emails and the full roster of who trains when. Those
views are deliberately SECURITY DEFINER; their column list *is* the policy.

PT slots are **derived, never stored** (`computeOpenSlots`). A slots table would need generating,
expiring and regenerating on every availability edit, and would drift on cancellation. The
partial unique index on `(trainer_id, starts_at)` remains the real guarantee — the view only
stops a member being offered a slot that is about to be rejected.

Class instances are materialised from `class_templates` by `generate_class_instances()`, called
on admin Schedule load rather than by cron (the free tier has no scheduled worker). A unique
index absorbs repeats, so calling it on every visit is safe.

**Experience level** (`member_profiles.experience_level`) is set by the member — 0016 relaxed the
0006 tamper trigger for this column. It only reorders a list and adds a "For you" badge
(*recommend, don't restrict*), so there is nothing to gain by lying about it. `qr_code` stays
admin-only: that one is not a preference, it is the identity the front desk scans.

## Membership tiers, freeze and cancel (migration 0017)

`plan_tier` and the `frozen`/`cancelled` statuses existed since 0001 but nothing
read them. What a plan includes is now **four columns the admin edits per plan** —
`can_book_classes`, `can_book_pt`, `class_bookings_per_week`, `pt_sessions_per_month` —
rather than rules hardcoded against tier names. A gym that wants unlimited classes on its
cheapest plan configures that; it isn't a code change. **The tier is a label, not a hidden
rulebook.** `NULL` on a quota means unlimited; the boolean carries the on/off, so `0` is never
a meaningful value.

Enforcement is **triggers on `bookings` and `pt_sessions`**, not the client. The phone app's
`getEntitlement()` exists to explain *why* a button is disabled — if it and the trigger ever
disagree, the member gets a raw Postgres error instead of a sentence, so keep them in step.
The weekly quota counts against the week the **class** falls in, not the week it was booked;
otherwise booking four Mondays in one sitting blows a quota for a week not yet reached.

Front desk can always book a member into PT regardless of quota (`is_front_desk()` short-circuits
the trigger) — they're making a judgment call in person, often having just taken payment. The
quota stops self-service overreach, it doesn't overrule staff.

- **Freeze** — front desk only. A member who could freeze themselves would freeze the day
  before expiry and hold a membership forever. `memberships.frozen_at` records the start so
  unfreeze can credit the days back; the credit is *computed* from that date, never passed in.
- **Cancel** — stops the renewal, leaves `expiry_date` alone. They paid cash up front and no
  refund mechanism exists, so removing days already bought would just be keeping their money.
  `membership_is_usable()` encodes this: `active` **or** `cancelled` still counts as usable
  until expiry. `frozen` does not — that is the point of a freeze.

## What the member deliberately cannot do

- **Record a payment.** `RenewMembership` picks a plan and sends the member to the desk with the
  amount. It used to write a `SharedStorage.addPayment({status:'Pending'})` row that the admin —
  reading Postgres — never saw. A payment record is the gym's evidence that cash changed hands;
  only the person who took the cash can assert it.
- **Insert a notification.** That would be a writable channel into the staff inbox.
- **Change their own email.** It is the login identity; changing it means changing `auth.users`,
  which needs a confirmation round-trip. Shown read-only rather than desynced from
  `profiles.email`.
- **Approve anything**, including their own booking — `bookings_cancel_self` (0016) pins the only
  reachable status to `cancelled` via `with check`.

## Trainer screens — migrated

All six `pages/trainer/*` screens read real data through `services/trainerService.ts`, the member
app's counterpart to the admin's `dashboardService` and subject to the same rule: **zero or an
empty state, never a plausible invention**. Deliberately removed for having no table behind them:
star ratings, lifetime "sessions completed", per-trainer attendance %, and members' weight/BMI/
goals. A trainer's "recommendation" to a member inserts a real `notifications` row
(`notifications_insert_staff`) instead of dying in component state.

**`TrainerBookings` is read-only on purpose** — `bookings_update_admin` means only the front desk
approves. The old Accept/Decline buttons would have silently failed against real data.
`TrainerSchedule` *can* now write availability (`trainer_profiles_update_self`, 0010) and sets the
hours that PT slots are generated from.

The same class of bug recurred in the **member** `Trainers.tsx`: it decided whether to show the
member directory or a coach's client roster by matching the **first word of your display name**
against the mock trainer list. Any member called Ana saw a coach's roster. That branch is gone —
trainers have their own screens behind a real `profiles.role` check.

Likewise `TrainerProfile.tsx` fell back to `trainers[0]` when the id didn't match, so an unknown
link rendered somebody else's profile with full confidence. It now matches on exact id only.

## Payments — three deliberate distinctions

All cash-gym driven, in `lib/api/payments.ts`:

- **`recorded_by`** — auto-stamped from the caller's session. A disputed cash payment has to name
  the staff member who took it.
- **`paid_on` vs `created_at`** — the day the cash arrived vs. the day it was keyed in. All revenue
  in `dashboardService` aggregates on `paid_on` (migration 0008). Cash gets taken Saturday and
  entered Monday; collapsing the two would destroy the audit trail.
- **Renewal carry-over** — renewing *before* expiry extends from the current `expiry_date`, not
  today, so unused days survive. Resetting to today confiscates paid-for days and trains members
  to renew on the last possible day, which is exactly when lapses happen. An expired membership
  restarts from today.

Dates use a local `toDateString` helper, **never `toISOString()`** — that shifts to UTC and lands
on the wrong day either side of midnight in Manila.

`listMemberships()` is ordered newest-first, and consumers must pick the newest row per member.
Without that a payment can extend an old expired membership instead of the live one.

## QR check-in

Payload format: **`CF1.<timestamp base36>.<member id>`**, uppercased (`utils/qrCode.ts`), valid
60 seconds. Uppercase + `.` + `-` keeps it inside QR *alphanumeric* mode, which packs far tighter
than the base64 JSON blob it replaced (~48 chars vs ~196) — the old one was too dense for a
webcam to decode off a phone screen.

`member_profiles.qr_code` is set to the member's **profile UUID**, by both the approval flow and
the `create-member` Edge Function. That convention is what lets the scanner resolve a code.

The admin scanner still parses the legacy base64 format too, because an installed phone serves its
cached bundle until the next deploy reaches it. It also accepts a **plain member id** typed by
hand, logged as `manual` rather than `qr`.

## The member record (admin)

Clicking a row in admin **Members** opens `MemberDetailDrawer`, assembled by
`services/memberDetailService.ts` from ten tables: profile, member profile, every membership,
payments, attendance, class bookings, PT sessions, measurements, goals, workout logs, and the
`notifications` rows a trainer sent. Screen assembly belongs in the service — a component that
fetched its own rows is free to invent a fallback when one comes back empty.

Three things it deliberately does *not* do:

- **`totalPaid` counts `status = 'completed'` only**, and says how many rows it left out. Summing
  pending and failed payments reports money the gym never took.
- **Goal progress is shown only where there is a reading to measure against** — currently just
  `weight_kg`, from the latest measurement. Everything else says "no reading yet" rather than
  drawing a bar at an invented position.
- **`member_progression()` failing is not an error.** 0028 isn't live everywhere, and a missing
  function comes back as a PostgREST error, not an empty result — `lib/api/progression.ts` returns
  null and the drawer hides the section. The record must still open.

It replaced `MemberDetailModal.tsx`, which was imported by nothing and shipped hardcoded body
measurements (170 cm / 65 kg / BMI 22.5 / 18% fat), workout counts (3 this week, 4-day streak, 48
total) and three invented goals. It never rendered *only* because it was unmounted — deleted along
with `AddMemberModal.tsx` and `EditMemberModal.tsx`, both equally orphaned.

`exportMembersToCSV` was reading `member.membershipType` and `member.joinDate`, gone since the
Supabase migration, so two columns exported blank for every member. An `as never[]` cast at the
call site is what kept TypeScript quiet; both are gone and the row shape is checked now.

## The trainer record (admin)

`TrainerDetailDrawer` + `services/trainerDetailService.ts`, same shape as the member one: classes
taught, bookings on those classes, PT sessions, bookable hours, and the members they work with
(derived from both PT sessions and class bookings, excluding cancelled and rejected).

**Two availability systems exist and the admin was showing the wrong one.**
`trainer_profiles.availability` is a free-text weekday CSV with no times; `trainer_availability`
(0015) is what `computeOpenSlots` expands and what the member app books against. The old Schedule
tab printed the CSV, and the "Availability Set" stat counted it — so a trainer with no bookable
hours at all was reported as available. The roster card now says which, and the drawer shows the
real rows and points at **Schedule → Trainer Hours**, which owns the editor.

Note `trainer_availability_write_self` is `trainer_id = auth.uid() **or is_front_desk()**` — the
desk *can* write a trainer's hours, and the Schedule page does. Read the policy before assuming a
table is trainer-only.

Also fixed: the Add Trainer modal had a second **"Email" field bound to `addForm.email` that was
never sent** — `handleAddTrainer` only ever passed `loginEmail`, so whatever the desk typed was
discarded on submit. And trainers had **no lifecycle at all** — a coach who left kept a working
login forever. Suspend / reactivate / archive now flip `profiles.status`; archive keeps every class
and session, because deleting the trainer would orphan them.

Beware `.order(col, { referencedTable: 'profiles' })` on these joins: it emits `profiles.order=…`,
which sorts *inside* a to-one embed and therefore does nothing. Sort in the client.

## The Schedule page

Three tabs over two different things. `class_templates` is the recurring **plan** ("Yoga, Tuesdays
06:00"); `classes` rows are the dated **sessions** members book, materialised by
`generate_class_instances` on page load (the free tier has no cron worker; it is idempotent).

- **Class Timetable** — the plan, by weekday. Templates are now **editable**; before, add and
  retire were the only verbs, so fixing a typo meant retiring the template and building a
  replacement, orphaning every session already generated from the original.
- **Upcoming Sessions** — the next 14 days of real `classes` rows with **real headcounts** from the
  `class_availability` view (0016). The page previously showed only the plan, so "is Saturday's
  class full?" was unanswerable from here.
- **Trainer Hours** — bookable PT windows. `trainer_availability_write_self` is
  `trainer_id = auth.uid() **or is_front_desk()**, so the desk can write these.

**Clash detection** (`services/scheduleService.ts`, `findConflicts`) — nothing stopped one trainer
being scheduled onto two classes at the same hour, or two classes sharing a room, and both go on to
generate bookable sessions. Derived on every render, never stored: a stored flag goes stale the
moment a start time is edited. Retired templates are skipped (they generate nothing). Rooms match
case- and space-insensitively. Back-to-back is **not** a clash — `aStart < bEnd && bStart < aEnd`,
so 06:00–07:00 and 07:00–08:00 sit clean.

`hoursOverlap` guards the same way for trainer hours: two overlapping windows on one day would
offer the same PT slot twice, and there is no database constraint against it.

## The booking queue (admin)

One screen for both kinds — `bookings` (class) and `pt_sessions` (1-on-1) are separate tables for
good reason (0015) but the same job at the desk. `services/bookingQueueService.ts` assembles the
rows and runs the checks the desk was previously doing from memory:

- **Capacity** — counted from **approved** bookings only. `class_availability.booked_count` counts
  `pending + approved`, which is right for a member deciding whether to ask and wrong here: a class
  with 30 pending and 0 approved is empty, and blocking the first approval on the other 29 requests
  would be nonsense.
- **Membership** — `membershipIsUsable()`, the same rule as `membership_is_usable()` in 0024.
- **Entitlement** — `can_book_classes` / `can_book_pt` read off the plan (0017). The tier is a
  label, not a hidden rulebook, so never infer from it.
- **Past** — a pending request for a slot that has already been and gone.

All four are **warnings, not blocks.** The desk overrides them for real reasons (cash on the spot, a
coach agreeing to squeeze one more in), and a system that silently refuses is worse than one that
says what it thinks and lets a human decide.

Also added: search, multi-select with bulk approve/reject (**sequential, not `Promise.all`** — each
iteration writes a row *and* sends a notification), and **reversing a decision**, which was
previously impossible: a mis-tapped Reject was final and the member had already been told.

## The announcement composer (admin)

**All three stat cards were describing the wrong thing.** They summed the *entire* `notifications`
table — every booking confirmation, payment receipt, trainer note and gym reminder the system has
ever written — under a heading about broadcasts. So "Total Delivered" was a number no broadcast had
produced, "Read Rate" was the open rate of automated receipts, and "Broadcasts Sent" silently
capped at `listRecentBroadcasts`'s 20-row limit and sat there forever. They now describe the sends
listed underneath them, and each card says which window it covers.

`listRecentBroadcasts` also returns **`readCount`** and the underlying **`ids`**. "Sent to 40" says
nothing on its own; "12 opened (30%)" is the number worth having.

Other fixes: `<Card title="…">` was spreading `title` onto a `<div>`, so the "Recent Notifications"
heading rendered as a **hover tooltip** and was never visible — `Card` takes `header`, not `title`.
The composer now shows the audience headcount **before** you send (it was discoverable only from
the success toast), confirms the send with that number, caps title/message at shade-safe lengths
with live counters, validates that an action URL is an in-app path, and previews the phone
notification.

### Recall needs migration 0034

`notifications_delete_self` was `user_id = auth.uid()` and was the **only** delete policy, so an
admin deleting a broadcast's rows matched nothing — and, exactly like the zero-row UPDATE, a
zero-row DELETE is not an error. The button would have reported "removed from 40 inboxes" with all
40 untouched. Proven in a throwaway Postgres as a non-superuser: `BEFORE 0034: admin removed 0
rows, error raised: none`.

0034 adds `notifications_delete_frontdesk using (is_front_desk())`, and `recallBroadcast()` uses
`DELETE … RETURNING` to count what actually went, throwing when it is zero. So on a database
without 0034 the button fails loudly and names the migration instead of lying.

## Attendance (admin)

**The page was computing "today" in UTC.** Both `todayStr` and the log filter used
`toISOString().slice(0, 10)` and compared it against `check_in_time.slice(0, 10)` — the UTC date
out of the timestamp text. Manila is UTC+8, so **every check-in before 8am local was filed under
the previous day**: "Today's Check-ins" read 0 until 8am, and the duplicate-check-in guard compared
the wrong day, so a member who came at 7am and again at 9am was never flagged. A 6am gym visit is
ordinary here. Fixed via `utils/dates.ts` (`todayKey`, `localDateKey`, `addDays`, `daysBetween`) —
demonstrated by running it: old `2026-08-16` vs new `2026-08-17` for the same 6am instant.

**Undo needs migration 0035.** `attendance` had SELECT and INSERT policies and nothing else, so a
mis-scan was permanent — and it counted toward that member's training days in
`member_training_stats` and against the gym in Retention. 0035 adds a delete policy restricted to
**today, compared in Manila time** (a UTC comparison would put the last eight hours of every gym
day out of reach immediately). `deleteCheckIn()` uses `DELETE … RETURNING` and throws on zero rows,
so on a database without 0035 it fails loudly instead of claiming success. No UPDATE policy: the
member, time and method are facts — if one is wrong the row is wrong, so delete and scan again.

Also: the log now shows the **activity** the desk recorded (0018) — it was written and never
displayed back — plus a per-hour bar strip with the busiest hour, a 7-day unique-member count, and
a working CSV export.

### The CSV exports that never exported

`utils/toast.ts` contained a **fake `exportToCSV`** — it took the data, threw it away (`void
data`), toasted "Exporting…", waited a second and toasted "exported successfully!". **Retention and
Revenue both imported that one**, so their Export buttons announced success and produced no file.
Both now import the real implementation in `exportUtils.ts`; the fake is deleted so the name cannot
be picked up by accident again.

Deleted alongside it: `exportAttendanceToCSV` and `exportRevenueToCSV`, which read `record.date` /
`record.time` / `record.memberName` — fields no current row shape carries — and `generatePDFReport`,
which alerted "In production, this would download a PDF file". The real `exportToCSV` was also
stamping filenames with `toISOString()`; it uses `todayKey()` now.

## Settings (admin)

The localStorage fakes were removed long ago, but **the whole Gym Information form was
write-only**. `gym_name`, `address`, `phone`, `email`, `opening_time` and `closing_time` have been
collected since 0013 and **nothing read any of them** — only `activity_options` had a consumer.
Two real consumers now exist:

- **The payment receipt** carries the gym's name, address, phone and email. It previously said
  "G-FITNESS RECEIPT" and "G-Fitness Management System" — a name from the old prototype, on the one
  document a member keeps — with no contact details at all beyond "contact gym management".
- **Schedule flags classes outside opening hours** (`findOutOfHours`). Verified by running it: a
  class starting exactly at opening is fine, one ending exactly at closing is fine, retired
  templates are skipped, and **unset hours assume nothing** rather than defaulting to a 9-to-5.

Each field on the form now says where it appears, so the next person can tell it isn't decorative.

Also added: **staff lifecycle** — suspend / reactivate / archive, which did not exist, so a
front-desk colleague who left kept a login that takes payments and checks members in. Never offered
on your own row (suspending yourself locks you out of the only screen that could undo it), and the
row is marked "(you)". Plus an **admin avatar** (every other role has had one since 0021), the
`updated_at`/`updated_by` **audit line** for gym info — recorded since 0013, never displayed — a
live password requirement checklist, and closing-before-opening validation.

## Rules that are easy to break

- **Members are archived, never deleted** (`profiles.status = 'archived'`). A delete cascades
  through memberships/payments/attendance and destroys the gym's records. Note `profiles.status`
  is plain `text` in the live DB, **not** an enum — new statuses need no migration; `ProfileStatus`
  in `types/db.ts` is the only thing enforcing allowed values.
- **Analytics return zero, never a plausible invention.** Where an entity isn't migrated (trainer
  session counts, body-composition KPIs) `dashboardService` returns 0. The fake "+12%" growth
  badges were deleted — a fabricated delta beside a real number reads as authoritative.
  Retention is threshold rules over real check-ins (21/14/7 days inactive), **not ML**.
- **Orphaned pages are a recurring trap** — fully built screens with no route and no link. All are
  cleared now (see *Dead files*), but it recurred five times: `MembershipPlans.tsx` was one before
  it moved to `/membership-plans`, and the member's `pages/Notifications.tsx` was the last
  (notifications actually surface through the 🔔 in `components/Notifications.tsx`, rendered by
  `Home.tsx`). **Grep for the page's full path, not its basename** — a basename sweep reported
  `pages/Notifications.tsx` as reachable because `components/Notifications.tsx` shares the name.
  Equally, a path sweep gives false positives for files imported relatively (`./tabs/GoalsTab`),
  so confirm both ways before deleting.
- **Hardcoded fallbacks are worse than empty states.** Nearly every mock member screen fell back
  to a literal `'Eya Lorenzana' / 'eya.lorenzana@email.com' / Premium / Dec 31 2026` identity when
  its lookup missed, which for a Supabase-backed member is *always*. `PaymentHistory` went further
  and ignored its lookup entirely (`setPayments(FALLBACK)`), showing six invented invoices — two
  paid by GCash and bank transfer, in a gym that is cash-only by design. If a lookup misses, render
  nothing.
- **Two Edge Functions exist for one reason** — a client-side `signUp()` would swap the admin's
  own session. `create-trainer`, and `create-member` for walk-ins (created already `active`, so
  they skip the approval queue).
- `supabase.functions.invoke` does **not** surface an Edge Function's JSON error body on a non-2xx.
  `lib/api/trainers.ts` unwraps `error.context` to get the real message.
- Admin notification **broadcasts** insert one `notifications` row per recipient; reading that
  history back needs `notifications_select_admin` (0007). Members still see only their own rows.
