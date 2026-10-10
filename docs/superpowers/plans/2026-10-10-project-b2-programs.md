# Project B-2 — Programs that build week on week — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** A program stops being "the same workout on numbered days" and becomes what the word means: each exercise gets heavier, longer or more reps every week (progressive overload), with an optional lighter week, and the player shows this week's target beside last week's.

**Architecture:** Progression is data on the program's workout items (0122's `gym_workout_items`), computed — never stored per week — by one SQL function, `program_day_targets(day)`, that the member player, the owner's builder preview and (later) the AI coach all read. A program can also belong to one member (a coach's or the AI coach's program for them), so "Gym", "Coach ___" and "AI coach" programs share one table, labelled by `source`.

**Spec:** §B2, §B4 (coach programs), §B8 (AI builds a full program — the table it writes to).

## Global Constraints
- "Done" stays computed (`program_progress()`), never stored. A program day is an ordinary `workout_logs` row (0122).
- A Premium program's days stay locked (`program_unlocked`), its row readable so the lock explains itself.
- A personal program (`member_id` set) is visible only to that member, their own coach (`is_my_trainee`) and the owner — never other members.
- Numbers shown are the database's; the client never computes a target.

### Task 1: 0173 — progression and program ownership
- `gym_workout_items`: `target_weight_kg numeric`, `progress_kind text not null default 'none' check (progress_kind in ('none','weight','reps','sets','seconds'))`, `progress_step numeric not null default 0 check (progress_step >= 0)`.
- `gym_programs`: `deload_every int check (deload_every between 2 and 12)` (every Nth week repeats week 1's load), `source text not null default 'gym' check (source in ('gym','trainer','ai'))`, `author_id uuid`, `member_id uuid` (null = the gym's, for everyone).
- `program_day_targets(p_day uuid)` → `(item_id, position, exercise_id, exercise_name, sets, reps, seconds, weight_kg, rest_seconds, prev_weight_kg, prev_reps)`: week `w`; effective step `e = w - 1`, or `0` when `deload_every` divides `w`; target = base + `e × step` for the item's kind; `prev_*` is the same for week `w - 1` (null in week 1). Readable by whoever may read the day (same rule as `gym_program_days`).
- Personal programs: RLS on `gym_programs`/`gym_program_days` adds `member_id is null or member_id = auth.uid() or is_my_trainee(member_id) or is_gym_admin()`; trainers may insert `source = 'trainer'` programs only with `member_id` one of their own trainees (`author_id = auth.uid()` set by trigger).
- Tests `scripts/sql/program-progression.mjs`: week 1/2/3 weights for a +2.5 kg item; reps item; deload week equals week 1; a trainer cannot create a program for another coach's trainee; another member cannot read a personal program; marker.

### Task 2: The member player shows the week's target
- `lib/api/programs.ts` `programDayTargets(dayId)`; `getOpenRoutineSession` also returns `programDayId`; `GuidedWorkout` builds the routine from the targets when the log has a `program_day_id`.
- Each exercise card: "This week: 3 × 8 @ 42.5 kg · last week 40 kg" (violet for this week, muted for last).
- Programs and Program screens label the program **Gym**, **Coach ___** or **AI coach** and show "Week N of M".

### Task 3: Builders
- Admin Programs (owner): per item, "Each week: + [2.5] kg / + [1] rep / + [1] set / + [5] s / stays the same"; program "Lighter week every [ ] weeks"; a preview table of weeks 1–M computed by `program_day_targets`.
- Trainer (member app, trainer side): "New program for <trainee>" from the trainee sheet, same fields; assigns it (`assign_program`).

### Task 4: Checks and ship
- `member-program-targets-check.js` (player shows week 3's target and week 2's), `admin-program-progression-check.js` (fields save, preview reads the function), `trainer-program-check.js` (trainer makes one for their trainee).
- Build + lint both apps, commit, deploy, hand over 0173.
