# Gym styles, phase 4 — repeat bookings, no-shows, late cancels (0260)

Owner's answers, 2026-11-15. The owner's standing rule: "fully customizable by admin — we adjust to their gym
setup, not them adjusting to our system." Every rule below is the gym owner's setting; the value in brackets is
only the default.

## What exists before 0260 (checked in the code)
- `booking_status` is `pending | approved | rejected | cancelled` (0001). No "came" or "no-show"; 0129 guesses a
  class's attendance from any check-in that Manila day.
- Members book by inserting rows (`bookings`, `pt_sessions`) under RLS and triggers: 0180's approval mode,
  0017→0194/0119's plan limits, 0068's clashes, 0251's seats. Slots go through `book_slot` (0259).
- `cancel_booking()` (0081, last 0101) refuses only once a session started. `cancel_slot` (0259) refuses a member
  inside `slot_cancel_minutes`.
- Plan limits count `pending`/`approved` rows, so a no-show (still `approved`) already counts as used, and any
  cancel gives the place back.
- Coaching packages are sold by the month — nothing to use up.

## 1. Repeat bookings — switch `repeats` (off at every gym, every plan)
- **Who may set a repeat** [member]: any mix of member, coach, desk (`repeat_who`).
- **How it repeats** [a number of weeks]: `repeat_kind` = `weeks` (the setter picks 2 … `repeat_max_weeks` [4],
  counting the first) or `until_stopped` (books ahead `repeat_ahead_days` [7] and keeps going until stopped).
- A repeat starts from a booking that already exists (the first week). Kinds: a timetable class (one-off classes
  do not repeat), a 1-on-1 (same coach, weekday, time, length), a time slot.
- **Every week is its own booking, booked as the person who set the repeat would book it** — same approval, plan
  limits, clashes, seats, pause. A week that is refused is recorded with its reason (`booking_repeat_weeks`) and
  shown, never silently skipped; a class week whose class does not exist yet is "waiting" and is booked when the
  timetable reaches it. The sweep `extend_repeats()` runs on page load (pg_cron optional, `extend_repeats_all`).
- Stopping keeps the weeks already booked (each can be cancelled on its own).
- The member, the coach of the session/class and the desk can stop a repeat; the setter's role must still be
  allowed (if the setter leaves the gym, the repeat stops and says why).

## 2. Late cancels — one window per kind
- `class_cancel_minutes`, `pt_cancel_minutes`, `slot_cancel_minutes` (0259's, kept), each 0 … 1440 [0 = until it
  starts, so nothing changes until the owner sets it]. Settings has *Use the same for all*.
- Inside the window a member's cancel is, per `late_cancel_mode`:
  `block` (the app says ask the front desk) · `mark` [default] (goes through, the place opens, recorded as late,
  counts toward the no-show pause) · `mark_free` (goes through, recorded as late, never counts).
- Slots follow the same mode. **A desk or coach cancel is never late.**

## 3. No-shows — switch `noshows` (off at every gym)
- Off at every gym until the owner turns it on, like time slots: G Fitness is live and members would otherwise be
  told about no-shows the day 0260 is pasted. Only sessions that start after the owner turned it on are judged
  (`noshow_since`) — switching it on never judges history.
- `noshow_mode` [auto_coach]: `auto` (everything by check-in) · `hand` (coach or desk marks) · `auto_coach`
  (classes and slots by check-in, 1-on-1 by the coach) · `off`.
- Auto counts a check-in only from `noshow_window_minutes` [60] before the start until it ends — never "any check-in
  that day". A session is judged once it has ended.
- A 1-on-1 the coach has not answered stays unmarked, never a no-show, and the coach is reminded once.
  Under `hand` the class's coach is reminded too.
- Settings tells owners whose desk does not scan everyone to choose *Marked by hand only*.
- Every mark can be changed by the coach (their own sessions/classes) or the desk ("they were here"); the member
  sees their own marks. Marks are written only by definer functions (a trigger refuses them from the app).

## 4. What a no-show (or a counted late cancel) leads to — never points
- `noshow_tell` [on]: on the record (admin drawer, coach's member sheet) and the member and coach are told.
- `noshow_counts_used` [on = how quotas work today]: off → a no-show no longer counts against the plan's weekly
  classes / monthly 1-on-1. (0194/0119's triggers redefined with that one condition.)
- Pause [off]: `noshow_pause_count` [3] in `noshow_pause_within_days` [30] → the member cannot self-book for
  `noshow_pause_days` [7]; the app says why and until when; the desk can lift it; the desk and coaches can still
  book for them. Counting restarts after each pause.
- **Packages: nothing is used up** (monthly). A package session's no-show is still recorded, both told, and counts
  toward the pause. Session-counted packages are a possible later setting, built only if the owner asks.
- Undoing a no-show undoes its effects: the quota follows the mark, an automatic pause it caused is lifted, and
  the member is told it was removed.

## 5. Screens (after 0260 is live)
- Admin Settings → Bookings: *Repeat bookings*, *Late cancels*, *No-shows* cards (all four switches' rules);
  the member drawer's record; Personal training / Class bookings / Attendance: mark came / didn't come, lift a pause.
- Member: *Repeat weekly* on a booking, its weeks and Stop; the late window said before cancelling; marks on
  bookings; the pause banner on booking screens.
- Coach: mark came / didn't come on their sessions and classes, the reminder, the trainee's record.
- Terms: the rules read from the gym's own settings (`gym_booking_rules()`), in the same commit; version date.

## 6. Checks
`scripts/sql/repeats-noshows.mjs` (fails at BEFORE=0260); `time-slots.mjs` updated for the late mode;
`tenancy-isolation.mjs` default-off list; UI checks with the screens.
