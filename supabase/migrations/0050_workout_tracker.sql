-- 0050 — what you actually lifted.
--
-- `workout_logs` (0020) records an activity, a duration and a note: "Weights,
-- 45 minutes". That is a diary entry, not a training log — it cannot answer
-- "am I getting stronger", which is the question a gym member opens an app to
-- ask. `workout_plans` (0047) knows the prescription and nothing about whether
-- it happened.
--
-- ---------------------------------------------------------------------------
-- Why workout_logs is extended and not replaced
-- ---------------------------------------------------------------------------
-- A parallel `workout_sessions` table was the obvious move and the wrong one:
--
--   * `achievement_metrics` counts `logged_days` from `workout_logs` (0028), so
--     a second table means every badge either re-plumbs or quietly stops
--     counting half the training.
--   * `trainer_may_see(member,'workouts')` gates `workout_logs` (0032, fixed in
--     0048). A second table is a second RLS surface to get right.
--   * Existing rows would be stranded in the old one.
--   * Worst: the member gets two screens that both mean "log a workout".
--
-- So `workout_logs` becomes the session header and `workout_sets` hangs off it.
-- Every existing consumer keeps working untouched, and every existing row is
-- still a valid session — one with no sets recorded.
--
-- ---------------------------------------------------------------------------
-- What the gate withholds, precisely
-- ---------------------------------------------------------------------------
-- `workout_tracker` (0049) gates **sets**, not logging. A free member can still
-- write "Weights, 45 minutes" exactly as they could yesterday — taking that
-- away would be a regression dressed as a feature. What the paid tiers add is
-- the exercise-by-exercise detail. A gate that removes something people already
-- had is not a gate, it is a downgrade.

-- ============================================================================
-- 1. THE EXERCISE CATALOGUE
-- ============================================================================
-- Free text was the cheap option and it destroys the feature it enables:
-- "Bench Press", "bench" and "Benchpress" become three exercises, and the
-- history chart that justifies the whole tracker silently plots a third of the
-- data. The gym owns the list, the way it owns the achievement rules (0038) and
-- the activity options (0040).

create table if not exists exercises (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  /** 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core' | 'full_body'
      | 'cardio'. Text rather than an enum so the gym can add one without a
      migration — the app groups by whatever it finds. */
  muscle_group text not null default 'full_body',
  /** 'barbell' | 'dumbbell' | 'machine' | 'bodyweight' | 'cable' | 'other'. */
  equipment    text not null default 'other',
  /** Whether it is measured in reps+weight or in time/distance. The tracker
      shows different fields for each, so this is not cosmetic. */
  is_timed     boolean not null default false,
  is_active    boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

-- Case-folded, so the admin cannot create "Squat" beside an existing "squat"
-- and split every member's history down the middle. A plain UNIQUE on name
-- would have allowed exactly that.
create unique index if not exists exercises_name_unique on exercises (lower(name));

-- A catalogue nobody seeded is an empty dropdown, and an empty dropdown is a
-- tracker that cannot be used — the "control that does nothing" failure with
-- extra steps. These are the movements this gym's equipment supports; the admin
-- edits, deactivates and adds to them.
insert into exercises (name, muscle_group, equipment, is_timed, sort_order) values
  ('Barbell Bench Press',     'chest',     'barbell',    false,  1),
  ('Incline Dumbbell Press',  'chest',     'dumbbell',   false,  2),
  ('Push-up',                 'chest',     'bodyweight', false,  3),
  ('Chest Fly',               'chest',     'machine',    false,  4),
  ('Deadlift',                'back',      'barbell',    false, 10),
  ('Barbell Row',             'back',      'barbell',    false, 11),
  ('Lat Pulldown',            'back',      'cable',      false, 12),
  ('Seated Cable Row',        'back',      'cable',      false, 13),
  ('Pull-up',                 'back',      'bodyweight', false, 14),
  ('Back Squat',              'legs',      'barbell',    false, 20),
  ('Front Squat',             'legs',      'barbell',    false, 21),
  ('Leg Press',               'legs',      'machine',    false, 22),
  ('Romanian Deadlift',       'legs',      'barbell',    false, 23),
  ('Walking Lunge',           'legs',      'dumbbell',   false, 24),
  ('Leg Curl',                'legs',      'machine',    false, 25),
  ('Leg Extension',           'legs',      'machine',    false, 26),
  ('Calf Raise',              'legs',      'machine',    false, 27),
  ('Overhead Press',          'shoulders', 'barbell',    false, 30),
  ('Dumbbell Shoulder Press', 'shoulders', 'dumbbell',   false, 31),
  ('Lateral Raise',           'shoulders', 'dumbbell',   false, 32),
  ('Face Pull',               'shoulders', 'cable',      false, 33),
  ('Barbell Curl',            'arms',      'barbell',    false, 40),
  ('Dumbbell Curl',           'arms',      'dumbbell',   false, 41),
  ('Triceps Pushdown',        'arms',      'cable',      false, 42),
  ('Skull Crusher',           'arms',      'barbell',    false, 43),
  ('Dip',                     'arms',      'bodyweight', false, 44),
  ('Plank',                   'core',      'bodyweight', true,  50),
  ('Hanging Leg Raise',       'core',      'bodyweight', false, 51),
  ('Cable Crunch',            'core',      'cable',      false, 52),
  ('Russian Twist',           'core',      'bodyweight', false, 53),
  ('Treadmill Run',           'cardio',    'machine',    true,  60),
  ('Stationary Bike',         'cardio',    'machine',    true,  61),
  ('Rowing Machine',          'cardio',    'machine',    true,  62),
  ('Jump Rope',               'cardio',    'other',      true,  63),
  ('Burpee',                  'full_body', 'bodyweight', false, 70),
  ('Kettlebell Swing',        'full_body', 'other',      false, 71)
on conflict do nothing;

-- ============================================================================
-- 2. THE SESSION HEADER
-- ============================================================================

alter table workout_logs
  add column if not exists plan_id uuid references workout_plans(id) on delete set null,
  -- NULL = started but not finished. The member can build a session across a
  -- workout and the app knows which one is still open, rather than treating a
  -- half-entered session as a completed one in every count.
  add column if not exists completed_at timestamptz;

comment on column workout_logs.plan_id is
  'The workout_plans row this session was performed against, when the member '
  'ticked off a prescribed day. NULL for a session logged from scratch, which '
  'is most of them.';

create index if not exists idx_workout_logs_open
  on workout_logs(member_id) where completed_at is null;

-- ============================================================================
-- 3. THE SETS
-- ============================================================================

create table if not exists workout_sets (
  id             uuid primary key default gen_random_uuid(),
  log_id         uuid not null references workout_logs(id) on delete cascade,
  -- One of these two carries the name. A member doing something the gym has not
  -- catalogued should not be blocked from recording it, but a custom entry is
  -- deliberately not aggregated — see the check constraint and the comment.
  exercise_id    uuid references exercises(id) on delete restrict,
  custom_name    text,
  set_number     int not null check (set_number > 0),
  reps           int check (reps is null or reps >= 0),
  weight_kg      numeric(6,2) check (weight_kg is null or weight_kg >= 0),
  duration_seconds int check (duration_seconds is null or duration_seconds >= 0),
  distance_m     int check (distance_m is null or distance_m >= 0),
  created_at     timestamptz not null default now(),
  constraint workout_sets_named check (exercise_id is not null or custom_name is not null),
  -- A set that records nothing is not a set. Without this the tracker could
  -- save rows that count towards "5 exercises" and contain no training at all.
  constraint workout_sets_measured check (
    reps is not null or duration_seconds is not null or distance_m is not null
  ),
  unique (log_id, exercise_id, custom_name, set_number)
);

-- `on delete restrict` above, deliberately: deleting an exercise that members
-- have logged would silently rewrite their history. The admin deactivates it
-- instead (`is_active = false`), which hides it from the picker and leaves
-- every past set intact.

create index if not exists idx_workout_sets_log on workout_sets(log_id);
create index if not exists idx_workout_sets_exercise on workout_sets(exercise_id, created_at desc);

-- ============================================================================
-- 4. RLS
-- ============================================================================

alter table exercises    enable row level security;
alter table workout_sets enable row level security;

-- Everyone reads the catalogue: the member picks from it, the trainer reads a
-- member's log through it, and the admin edits it.
drop policy if exists exercises_select_authenticated on exercises;
create policy exercises_select_authenticated on exercises
  for select to authenticated using (true);

-- Admin only, matching the achievement catalogue (0038): changing the list
-- changes what every member's history is measured in.
drop policy if exists exercises_write_admin on exercises;
create policy exercises_write_admin on exercises
  for all to authenticated
  using (get_my_role() is not distinct from 'admin')
  with check (get_my_role() is not distinct from 'admin');

-- Sets inherit their parent log's visibility rather than restating it. One
-- definition of "whose workout is this", so a change to the sharing rules
-- cannot leave sets exposed after logs are locked down.
--
-- Worth knowing, because it surprised the test that found it: the EXISTS
-- subquery below reads `workout_logs`, and **that read is itself RLS-filtered**
-- for the caller. So these policies can never be more permissive than the ones
-- on `workout_logs` — if the member's sharing switch closes the parent row, the
-- subquery finds nothing and the sets disappear with it, whatever this policy
-- says. That is the behaviour we want and it is free, but it also means these
-- policies cannot be read in isolation: `workout_sets_select_gym` only works
-- because 0032 gave the gym a matching read on `workout_logs`.
drop policy if exists workout_sets_select_self on workout_sets;
create policy workout_sets_select_self on workout_sets
  for select using (
    exists (select 1 from workout_logs l
             where l.id = workout_sets.log_id and l.member_id = auth.uid())
  );

drop policy if exists workout_sets_select_gym on workout_sets;
create policy workout_sets_select_gym on workout_sets
  for select using (
    exists (select 1 from workout_logs l
             where l.id = workout_sets.log_id
               and trainer_may_see(l.member_id, 'workouts'))
  );

-- The gate. INSERT only: a member whose plan lapses keeps everything they have
-- already recorded and can still tidy it, exactly as 0049 did for saved plans.
drop policy if exists workout_sets_insert_self on workout_sets;
create policy workout_sets_insert_self on workout_sets
  for insert to authenticated
  with check (
    exists (select 1 from workout_logs l
             where l.id = workout_sets.log_id
               and l.member_id = auth.uid()
               and plan_allows(l.member_id, 'workout_tracker'))
  );

drop policy if exists workout_sets_update_self on workout_sets;
create policy workout_sets_update_self on workout_sets
  for update using (
    exists (select 1 from workout_logs l
             where l.id = workout_sets.log_id and l.member_id = auth.uid())
  );

drop policy if exists workout_sets_delete_self on workout_sets;
create policy workout_sets_delete_self on workout_sets
  for delete using (
    exists (select 1 from workout_logs l
             where l.id = workout_sets.log_id and l.member_id = auth.uid())
  );

-- ============================================================================
-- 5. WHAT THE SCREENS ASK FOR
-- ============================================================================

-- "Today's Workout — 5 exercises, 45 minutes." Counts distinct exercises, not
-- sets: four sets of bench is one exercise, and reporting it as four would
-- flatter the member with a number they did not earn.
create or replace function workout_session_summary(p_log uuid)
returns table (exercise_count int, set_count int, total_volume_kg numeric)
language sql stable security definer set search_path = public as $fn$
  select
    count(distinct coalesce(s.exercise_id::text, s.custom_name))::int,
    count(*)::int,
    coalesce(sum(s.reps * s.weight_kg), 0)::numeric
  from workout_sets s
  join workout_logs l on l.id = s.log_id
  where s.log_id = p_log
    and (l.member_id = auth.uid() or trainer_may_see(l.member_id, 'workouts'));
$fn$;

-- Best working set per exercise over time — the "am I getting stronger" answer,
-- and the reason the catalogue had to be a catalogue.
--
-- Heaviest set, not estimated 1RM: a formula would invent a number the member
-- never lifted, and this project has a rule about inventing plausible values.
-- Custom-named sets are excluded, because "bench"/"Bench Press" would plot as
-- two unrelated lines and neither would be true.
create or replace function member_exercise_history(p_member uuid, p_exercise uuid)
returns table (performed_on date, top_weight_kg numeric, top_reps int)
language sql stable security definer set search_path = public as $fn$
  select l.performed_on,
         max(s.weight_kg),
         (array_agg(s.reps order by s.weight_kg desc nulls last, s.reps desc))[1]
    from workout_sets s
    join workout_logs l on l.id = s.log_id
   where l.member_id = p_member
     and s.exercise_id = p_exercise
     and s.weight_kg is not null
     and (p_member = auth.uid() or trainer_may_see(p_member, 'workouts'))
   group by l.performed_on
   order by l.performed_on;
$fn$;

revoke all on function workout_session_summary(uuid) from public, anon;
revoke all on function member_exercise_history(uuid, uuid) from public, anon;
grant execute on function workout_session_summary(uuid) to authenticated;
grant execute on function member_exercise_history(uuid, uuid) to authenticated;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
--   select count(*) from exercises;                     -- expect 36
--   select muscle_group, count(*) from exercises group by 1 order by 1;
--
-- The name index is case-folded (expect a unique violation, not a second row):
--   insert into exercises (name) values ('back squat');
--
-- A set with no measurement is refused (expect workout_sets_measured):
--   insert into workout_sets (log_id, custom_name, set_number)
--   values ('<a log>', 'Something', 1);
--
-- As a free-tier member (expect 0 rows / RLS violation on the insert):
--   insert into workout_sets (log_id, exercise_id, set_number, reps)
--   values ('<own log>', '<an exercise>', 1, 10);
