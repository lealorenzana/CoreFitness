# Project B-3 — One place per coach, and coaches who edit routines — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** A member and their coach have ONE place — the 1-on-1 room — holding their chat, the coach's notes and everything the coach gave them; the separate Messages and Coach notes tabs go. A coach can write a routine for their trainee and edit one the AI coach made; the member sees "Edited by Coach ___" and can go back to the earlier version.

**Architecture:** No data moves. The 1-on-1 room's timeline is a **read** that unions what already exists — `messages` (0131, the pair's conversation), `trainer_feedback` (notes), `room_posts`/`room_assignments` in that room, and routines/programs the coach wrote for the member (0172/0173) — in one definer function, `coach_timeline(room)`, readable only by the two people. Writing stays where it was: a chat message is still `send_message`, a note still `trainer_feedback`. Coach edits go through definer functions that check `is_my_trainee` and the member's sharing (`trainer_may_see`), snapshot the routine before changing it, and notify.

**Spec:** §B3, §B4, decisions "Room = the one place", "Changes apply, member is told".

## Global Constraints
- Only the two people see a 1-on-1 room; owner and desk have no policy on it (0131's privacy stays).
- `chat` stays a gym switch: off = the room still has notes and routines, no free chat.
- A coach sees a member's routines only if the member shares workouts with coaches (`trainer_may_see`).
- An edit never destroys the member's version: the prior state is kept and can be restored by the member.

### Task 1: 0174 — timeline, coach routines, versions
- `coach_timeline(p_room uuid, p_before timestamptz default null, p_limit int default 30)` → `(kind text, id uuid, at timestamptz, author_id uuid, body text, ref_id uuid, extra jsonb)` with kinds `message`, `note`, `post`, `assignment`, `routine`, `program`; only for a `kind = 'pt'` room whose member or trainer is `auth.uid()`; paged by `p_before`.
- `workout_routine_versions (id, gym_id, routine_id, snapshot jsonb, made_by, created_at)` — RLS on, no insert policy; the member reads their own routines' versions.
- `coach_save_routine(p_member uuid, p_routine uuid, p_name text, p_notes text, p_exercises jsonb)` — creates (`source 'trainer'`, `author_id`) or edits (snapshot first; `edited_by`, `edited_at`); refuses unless `is_my_trainee(p_member)` and, for an existing routine not written by this coach, `trainer_may_see(p_member, 'workouts')`; notifies the member ("Coach Ben edited Leg day").
- `restore_routine_version(p_version uuid)` — member only, their own routine; snapshots the current state first so it can be undone.
- Tests `scripts/sql/coach-place.mjs`: the timeline lists a message, a note and a coach routine in time order for both people and nobody else; a coach edits an AI routine of a sharing trainee (snapshot exists, edited_by set, member notified); refused without sharing; refused for another coach's trainee; member restores the version.

### Task 2: Member — the room is the place
- `Room.tsx` for a `pt` room: a **Timeline** channel (default) built from `coach_timeline` — messages as chat bubbles, notes as pinned cards, routines/programs as cards with Open — and a composer (`send_message`; hidden with a line when `chat` is off).
- `memberNav.ts` Coaching tabs: Bookings · Coaches · Rooms (Messages and Notes removed); `/member/messages` and `/member/coach-notes` redirect to the 1-on-1 room with that coach (or Rooms when there are several), keeping old notification links working.
- Routines: "Edited by Coach ___" (done in B-1) plus **See earlier version** → restore.

### Task 3: Trainer — write and edit
- Trainee sheet and the 1-on-1 room: **New routine for <member>** and, on each shared routine, **Edit** — the same routine editor component, saving through `coach_save_routine`.
- Trainer's room shows the same timeline.

### Task 4: Checks and ship
- `member-coach-place-check.js`, `trainer-coach-edit-check.js`; update `member-nav-check.js` for the Coaching tabs; build + lint; commit; deploy; hand over 0174.
