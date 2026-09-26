# Content Studio 0122 — Gym Workouts and Programs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A gym builds its own workouts and multi-week programs; its members follow them in the existing workout player (points, badges and history for free), a program can be Premium-only, and a coach can assign one to a trainee.

**Architecture:** Four gym tables (`gym_workouts`, `gym_workout_items`, `gym_programs`, `gym_program_days`) plus `program_enrolments`. A program day is run as an ordinary `workout_logs` row carrying `gym_workout_id` and `program_day_id` (0050's rule: extend `workout_logs`, never a second table), so a day is "done" when a finished log points at it — computed, never stored. Premium is the member-plan gate `plan_allows(member, 'premium_programs')`, the same function RLS and the screen use; a locked program's row stays readable so the lock can explain itself, its days and workouts do not.

**Tech Stack:** Postgres/Supabase RLS + definer RPCs, pglite harness, React 19 (admin Tailwind v3, member v4), Playwright fixtures.

**Spec:** `docs/superpowers/specs/2026-09-26-content-studio-design.md` (0122 section)

## Global Constraints

- Programs are built by the **owner (admin) on the admin website**; trainers build **workouts** (phone) and **assign** programs to **their own trainees** (`is_my_trainee`, 0082). Front desk reads, never writes.
- Everything starts as a **draft** (`published = false`); members see published, non-hidden rows only.
- Premium lock: **locks and explains, never hides** (0049). Exercise guides (0121) are never locked.
- A member follows **one program at a time** (partial unique index); starting another ends the first (`status = 'left'`).
- Starter pack is **copied** into the gym as drafts — editing a copy never touches another gym.
- Every new table joins `tenancy_gym_tables()` with the four restrictive policies; FKs between gym tables are **composite `(gym_id, id)`**.
- Assign notifies through `notify_once` (dedupe key per enrolment).
- A member feature is not done until admin and trainer see it: the admin member drawer and the trainer's member sheet show the active program and progress.

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/0122_gym_programs.sql` | tables, policies, RPCs, feature row, starter pack |
| `scripts/sql/programs.mjs`, `scripts/sql/verify/verify0122.sql` | proof, paste report |
| `g-fitness-admin/src/lib/api/programs.ts` | admin reads/writes |
| `g-fitness-admin/src/pages/Programs.tsx` (+ route `/programs`, Training group link) | workouts + programs editor, starter pack |
| `g-fitness-admin/src/components/ui/MemberDetailDrawer.tsx` | member's active program + progress |
| `g-fitness-member/src/lib/api/programs.ts` | member/trainer reads, start/leave/assign, run a day |
| `g-fitness-member/src/pages/Program.tsx` (+ route `/member/program/:id`) | program page, week × day ticks, Start |
| `g-fitness-member/src/pages/Workouts.tsx` | "Your gym's programs" first on the library tab |
| `g-fitness-member/src/pages/GuidedWorkout.tsx` | load a gym workout when the log has `gym_workout_id` |
| `g-fitness-member/src/pages/trainer/TrainerMembers.tsx` | assign a program; show the trainee's |
| fixtures `admin-programs-check.js`, `program-check.js` | screens |

---

### Task 1: Migration 0122 and its proof

**Produces (SQL):** tables above; `workout_logs.gym_workout_id`, `workout_logs.program_day_id`; features row `premium_programs` (free off, freemium off, premium on) + `sync_plan_features()`; functions:
- `program_unlocked(p_program uuid) returns boolean` — not premium, or staff/admin/trainer, or `plan_allows(auth.uid(),'premium_programs')`
- `member_may_see_workout(p_workout uuid) returns boolean` — in a published, unlocked program's day
- `start_program(p_program uuid) returns uuid` (enrolment id; ends any other active one)
- `leave_program(p_program uuid) returns void`
- `assign_program(p_member uuid, p_program uuid) returns uuid` — admin, or trainer with `is_my_trainee`; notifies
- `start_program_day(p_day uuid) returns uuid` (workout_logs id) — needs an active enrolment in that program and `program_unlocked`
- `program_progress(p_member uuid) returns table(program_id uuid, program_name text, day_id uuid, week int, day int, workout_id uuid, workout_name text, done boolean)` — self, front desk, or trainer of that trainee
- `copy_starter_program(p_key text) returns uuid` — admin; keys `beginner_full_body`, `push_pull_legs`

Harness `programs.mjs` (two gyms; admin/staff/trainer/trainer2/free member/premium member each):
1. admin creates workout + items + program + days (draft); a member sees none of them
2. publish → member sees program, days, workout, items
3. gym B sees none of gym A's
4. premium program: free member reads the program row, **0** days, **0** items of a workout used only there; premium member reads them
5. free member `start_program` on premium → refused; on a free program → ok; starting another ends the first
6. `start_program_day` without enrolment → refused; with → returns a log with `gym_workout_id`, `program_day_id`
7. finishing the log (`completed_at`) makes `program_progress` report that day done
8. trainer creates a workout (own), trainer2 cannot edit it, admin can; trainer cannot create a program
9. desk cannot write any of it
10. trainer assigns a program to a trainee (after a pt_session links them) → enrolment + one notification; to a non-trainee → refused
11. `copy_starter_program('push_pull_legs')` → a draft program with 12 days whose workouts use the shared exercises; running it twice makes two independent copies
12. tenancy list contains the five tables; no write policy on `program_enrolments`

### Task 2: Admin — Programs page, drawer
Fixture first (`admin-programs-check.js`): starter-pack button sends `copy_starter_program`; the program grid shows week × day cells; setting a cell sends an upsert to `gym_program_days`; Publish sends `published: true`; Premium toggle sends `premium`; the member drawer shows "Following: <program> · n of m days".

### Task 3: Member — program list, program page, running a day
Fixture first (`program-check.js`): Workouts library tab lists the gym's published programs first; a premium program for a free member shows the lock and "Premium" reason and no Start; a free program page shows weeks with ticks for done days; Start sends `start_program`; a day's Start sends `start_program_day` and lands on `/member/track/session/<id>`, where the player shows the gym workout's exercises.

### Task 4: Trainer — assign
Fixture extension: the trainee sheet in TrainerMembers shows the trainee's program and an "Assign a program" picker that sends `assign_program`.

### Task 5: Ship
Docs (CLAUDE.md ≤200 lines, spec status), all harnesses, all fixtures, four builds, audits, commit, push; deploy on the user's word, **before** the paste.
