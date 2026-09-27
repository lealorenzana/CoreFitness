# Coaching rooms (a Google Classroom for trainers) — design

**Date:** 2026-09-27 · **Status:** approved in conversation, building · **Migrations:** 0128 (rooms + stream), 0129 (classwork + monitoring)

## Decisions made in conversation

| Question | Decision |
|---|---|
| What is a room | **Both**: automatic rooms for each of the trainer's recurring classes and each 1-on-1 trainee, **and** coaching groups the trainer creates, joined by code. |
| Classwork | **Workouts + check-ins.** A workout is turned in automatically when logged (proof, not a tick); a check-in is an answer, a body weight, or a note/photo. The trainer returns each hand-in with a comment. |
| Stream | **Trainer posts, members comment** (first name + initial). Hand-ins and feedback are private between the member and the trainer. Comments can be switched off per room. |
| Points | **Owner decides**: rule `classwork_on_time`, **off by default** (0 points); when on, paid once per assignment, never for a late one. |
| Who can use rooms | **Owner decides per plan**: feature `coaching_rooms`, on for paid plans by default. Without it a member reads a class room's stream; classwork and joining groups lock and explain. |

## Rooms (0128)

One `rooms` table, three kinds:

| Kind | Created | Members |
|---|---|---|
| `class` | automatically, one per active `class_templates` row with a trainer | anyone with a non-cancelled booking in a class of that template from 60 days ago onward — **computed**, never stored |
| `pt` | automatically, one per (trainer, member) pair with a `pt_sessions` row | that member — computed |
| `group` | by the trainer | `room_members` rows, written only by `join_room(code)`, `leave_room`, `remove_from_room` |

- `sync_my_rooms()` (definer, re-runnable, called on page load) creates missing class/pt rooms for the calling trainer and archives class rooms whose template retired. A trigger is not used: rooms depend on elapsed data, so a sweep is the pattern (CLAUDE.md).
- `room_member_ids(room)` returns the member ids of any kind; `is_in_room(room, member)` and `may_see_room(room)` are the one definition every policy calls.
- Visibility: the room's trainer; its members (current gym); the gym's `admin`/`staff` **read-only plus removing posts/comments**. Never another gym (tenancy restrictive policies) or another trainer.
- A group's `join_code` is 6 letters, unique per gym, resettable by its trainer. An archived room stays readable and takes no new posts, comments or classwork.
- **No write policy on `rooms` or `room_members`**; posts and comments have narrow insert policies (the trainer posts to own rooms; a member comments where they may see, comments on and not archived) and delete policies (author, or the gym's admin/staff).
- Posts: text (1–2000), optional photo (gym media path) or YouTube/Vimeo link (`is_allowed_video_url`). Comments: 1–1000.
- Plan gate: `plan_allows(member,'coaching_rooms')`. Without it: class rooms' stream readable, no commenting, no groups, no classwork.
- Notifications through `notify_once`: new post → the room's members.

## Classwork (0129)

- `room_assignments`: room, kind `workout` (a `gym_workouts` row) or `checkin` (`checkin_type`: `question` | `weight` | `note`, with a prompt), title, instructions, `due_on` (Manila date), optional `assigned_to uuid[]` (null = whole room), created by the room's trainer.
- `room_submissions`: one per (assignment, member). Written only by:
  - a trigger on `workout_logs` completion carrying `gym_workout_id` — every open assignment of that workout for that member is turned in, pointing at the log;
  - `submit_checkin(assignment, text, number, photo)` — validates the type;
  - `return_submission(submission, comment)` — the room's trainer only.
- Status is computed: turned in (on time / late: `turned_in_at` after the end of `due_on` Manila), missing (past due, none), assigned. Never stored.
- Points: `classwork_on_time` through the idempotent ledger, behind `plan_allows(…,'points_earn')`, `act_as_gym` first (the 0125 lesson).
- Reminders: `classwork_due_sweep()` (page-load sweep) sends "due tomorrow" once to members who have not turned in. The trainer is notified of hand-ins grouped per assignment (one dedupe key per assignment per day).
- Monitoring, one definer function per screen, all computed: `room_progress(room)` (grid + on-time rate + last workout + class attendance + latest check-in weight **only where `trainer_may_see(member,'measurements')`**) and attention flags: ≥2 missing, no workout in 10 days, missed last 3 booked classes.

## Screens

- **Trainer**: the Members tab becomes **Rooms** (grid of room cards, "To review", "All my members" → the existing roster, "+ New group"). Room: Stream · Classwork · People · Progress. Assignment detail: each member's status, what they did, "Return with comment". Home: To review, due today.
- **Member**: **Rooms** in the More sheet (list + "Join with code", `/join-room/<code>` link). Room: Stream · Classwork · People. Today: "Due this week". Returned work shows the comment.
- **Admin**: Training → **Rooms** (every room by trainer, activity, remove a post/comment); Membership Plans shows `coaching_rooms`; Rewards shows the new rule; the member drawer lists rooms and hand-in record.

## Testing

`scripts/sql/rooms.mjs` (0128) and `scripts/sql/classwork.mjs` (0129), each with deliberate breaks; fixture screen checks for trainer rooms, member rooms and the admin page; `verify0128.sql`, `verify0129.sql`; probe rows; CI list.
