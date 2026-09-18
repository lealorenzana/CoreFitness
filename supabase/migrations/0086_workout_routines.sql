-- 0086 — saved routines, and a workout that runs one.
--
-- Until now the tracker (0050) was a blank form: pick an exercise, type the
-- reps, add a set, repeat. A member who does the same leg day every Monday typed
-- the same five exercises every Monday. The gym asked (2026-09-18) for the other
-- way round: build the routine once — "Leg day: squat 4×8, leg press 3×12 …" —
-- edit it whenever, and have the app walk you through it set by set, with a rest
-- timer, until the routine is done; then show what you did on that day from the
-- Attendance calendar.
--
-- ## What is new, and what is reused
--
--   * `workout_routines` — a member's saved routine (name, notes, order).
--   * `workout_routine_exercises` — its exercises in order, each with a target:
--     sets, reps and kg (or seconds for a timed exercise) and the rest between
--     sets.
--   * `workout_logs.routine_id` — which routine a session ran.
--
-- The session itself is still a `workout_logs` row and every set still a
-- `workout_sets` row (0050). That is deliberate, for the same reasons 0050 gave
-- for not adding `workout_sessions`: points (0051) fire on `completed_at`,
-- achievements count `workout_logs`, Progress charts read `workout_sets`, and a
-- trainer's view is already gated by `trainer_may_see(…, 'workouts')` (0032/0048).
-- A routine-run workout lands in all of them with no new plumbing.
--
-- ## The gate
--
-- Routines follow `workout_tracker` (0049), like the sets they produce: a member
-- whose plan does not include the tracker can still read routines they made on
-- a plan that did (nothing is taken away), but cannot create or change one. The
-- app locks the screen and says why; this is the boundary behind it.

-- ── Routines ────────────────────────────────────────────────────────────────
create table if not exists workout_routines (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references member_profiles(profile_id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  notes       text check (notes is null or char_length(notes) <= 280),
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_workout_routines_member
  on workout_routines (member_id, position, created_at);

-- Its own trigger function rather than 0001's `set_updated_at()`: the live
-- project does not have that one (the first paste of this file failed on it),
-- and a migration should not depend on a helper nothing else here uses.
create or replace function workout_routines_touch() returns trigger
language plpgsql as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists workout_routines_updated_at on workout_routines;
create trigger workout_routines_updated_at before update on workout_routines
  for each row execute function workout_routines_touch();

create table if not exists workout_routine_exercises (
  id               uuid primary key default gen_random_uuid(),
  routine_id       uuid not null references workout_routines(id) on delete cascade,
  position         int not null default 0,
  -- Same naming rule as workout_sets (0050): the catalogue when it has it, a
  -- custom name when it does not.
  exercise_id      uuid references exercises(id) on delete restrict,
  custom_name      text,
  target_sets      int not null default 3 check (target_sets between 1 and 20),
  target_reps      int check (target_reps is null or target_reps between 1 and 200),
  target_weight_kg numeric(6,2) check (target_weight_kg is null or target_weight_kg >= 0),
  target_seconds   int check (target_seconds is null or target_seconds between 1 and 7200),
  rest_seconds     int not null default 90 check (rest_seconds between 0 and 600),
  constraint workout_routine_exercises_named check (exercise_id is not null or custom_name is not null)
);

create index if not exists idx_workout_routine_exercises_routine
  on workout_routine_exercises (routine_id, position);

alter table workout_logs
  add column if not exists routine_id uuid references workout_routines(id) on delete set null;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table workout_routines          enable row level security;
alter table workout_routine_exercises enable row level security;

revoke all on workout_routines, workout_routine_exercises from anon;
grant select, insert, update, delete on workout_routines, workout_routine_exercises to authenticated;

-- The member's own routines, readable always.
drop policy if exists workout_routines_select_self on workout_routines;
create policy workout_routines_select_self on workout_routines
  for select using (member_id = auth.uid());

-- The gym reads them the way it reads the member's workouts: only if shared.
drop policy if exists workout_routines_select_gym on workout_routines;
create policy workout_routines_select_gym on workout_routines
  for select using (trainer_may_see(member_id, 'workouts'));

drop policy if exists workout_routines_insert_self on workout_routines;
create policy workout_routines_insert_self on workout_routines
  for insert to authenticated
  with check (member_id = auth.uid() and plan_allows(member_id, 'workout_tracker'));

drop policy if exists workout_routines_update_self on workout_routines;
create policy workout_routines_update_self on workout_routines
  for update using (member_id = auth.uid())
  with check (member_id = auth.uid() and plan_allows(member_id, 'workout_tracker'));

-- Deleting stays open whatever the plan: a member may always remove their own.
drop policy if exists workout_routines_delete_self on workout_routines;
create policy workout_routines_delete_self on workout_routines
  for delete using (member_id = auth.uid());

-- Exercises inherit from their routine.
drop policy if exists workout_routine_exercises_select on workout_routine_exercises;
create policy workout_routine_exercises_select on workout_routine_exercises
  for select using (
    exists (select 1 from workout_routines r
             where r.id = workout_routine_exercises.routine_id
               and (r.member_id = auth.uid() or trainer_may_see(r.member_id, 'workouts')))
  );

drop policy if exists workout_routine_exercises_write on workout_routine_exercises;
create policy workout_routine_exercises_write on workout_routine_exercises
  for insert to authenticated
  with check (
    exists (select 1 from workout_routines r
             where r.id = workout_routine_exercises.routine_id
               and r.member_id = auth.uid()
               and plan_allows(r.member_id, 'workout_tracker'))
  );

drop policy if exists workout_routine_exercises_update on workout_routine_exercises;
create policy workout_routine_exercises_update on workout_routine_exercises
  for update using (
    exists (select 1 from workout_routines r
             where r.id = workout_routine_exercises.routine_id and r.member_id = auth.uid())
  )
  with check (
    exists (select 1 from workout_routines r
             where r.id = workout_routine_exercises.routine_id
               and r.member_id = auth.uid()
               and plan_allows(r.member_id, 'workout_tracker'))
  );

drop policy if exists workout_routine_exercises_delete on workout_routine_exercises;
create policy workout_routine_exercises_delete on workout_routine_exercises
  for delete using (
    exists (select 1 from workout_routines r
             where r.id = workout_routine_exercises.routine_id and r.member_id = auth.uid())
  );

-- ── Last time's numbers ─────────────────────────────────────────────────────
-- The guided workout shows "last time: 40 kg × 10" beside each set. One call
-- for the whole routine: per exercise, the sets of the most recent *finished*
-- session that included it. Runs as the caller (invoker), so RLS decides —
-- a member only ever reads their own.
create or replace function member_last_sets(p_exercises uuid[])
returns table (exercise_id uuid, set_number int, reps int, weight_kg numeric, duration_seconds int)
language sql stable security invoker set search_path = public as $fn$
  with latest as (
    select distinct on (s.exercise_id) s.exercise_id, s.log_id
      from workout_sets s
      join workout_logs l on l.id = s.log_id
     where l.member_id = auth.uid()
       and l.completed_at is not null
       and s.exercise_id = any(p_exercises)
     order by s.exercise_id, l.completed_at desc
  )
  select s.exercise_id, s.set_number, s.reps, s.weight_kg, s.duration_seconds
    from workout_sets s
    join latest on latest.log_id = s.log_id and latest.exercise_id = s.exercise_id
   order by s.exercise_id, s.set_number
$fn$;

revoke all on function member_last_sets(uuid[]) from public, anon;
grant execute on function member_last_sets(uuid[]) to authenticated;

-- Marker for scripts/probe-migrations.py.
create or replace function migration_0086_applied() returns boolean
language sql immutable as $fn$ select true $fn$;

revoke all on function migration_0086_applied() from public, anon;
grant execute on function migration_0086_applied() to authenticated;

-- VERIFICATION — as a member on a plan with the tracker:
--   insert into workout_routines (member_id, name) values (auth.uid(), 'Leg day');       -- ok
--   the same on the Free Plan                                                             -- refused (RLS)
--   insert into workout_routines (member_id, name) values ('<someone else>', 'x');        -- refused
--   select * from member_last_sets(array['<exercise id>']::uuid[]);                       -- own sets only
