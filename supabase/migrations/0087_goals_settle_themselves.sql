-- 0087 — goals that settle themselves, strength goals, and points that are earned.
--
-- Three problems with goals as they stood (the gym asked for Goals to be
-- reworked, 2026-09-18):
--
--   1. **Preset goals never finished.** `achieved_on` for a preset goal belongs
--      to `settle_goals()` (0055), which only pg_cron ever called — and pg_cron
--      is optional here. With no scheduler the goal sat at "done" forever
--      without being marked done. Worse, `goal_progress()` refuses a caller with
--      no `auth.uid()` unless `trainer_may_see()` says yes, so even a scheduled
--      run would have counted every preset goal as 0.
--   2. **A number goal could be marked reached by hand, for 100 points.** Any
--      member could set a goal and tap "Mark achieved"; 0051 then paid out. The
--      rule this repo keeps is that anything the client can grant proves
--      nothing.
--   3. **There was no way to aim at a lift** — "Squat 100 kg" — although 0050
--      and 0086 now record every set.
--
-- So:
--
--   * `fitness_goals.exercise_id` and metric `lift_kg`: a strength goal whose
--     current value is the heaviest set recorded for that exercise.
--   * `goal_value_of()` / `goal_is_reached()` — one definition of "where is it
--     now" and "is it done", used by everything below.
--   * `settle_my_goals()` — the member's own goals, settled when the Goals
--     screen opens (sweeps run on page load here, as elsewhere). `settle_goals()`
--     does the same for everyone, for a scheduler if there is one.
--   * Measured goals (weight, body fat, waist, lift) join preset goals in being
--     marked reached **only by the settler**; a custom goal is still the
--     member's to tick — but a ticked custom goal earns **no points**, because
--     nothing was checked.
--
-- Safe to re-run.

alter table fitness_goals
  add column if not exists exercise_id uuid references exercises(id) on delete set null;

comment on column fitness_goals.exercise_id is
  'For metric lift_kg: the exercise whose heaviest recorded set is the goal''s current value (0087).';

-- ── The preset count, with no caller check ──────────────────────────────────
-- 0055's body, lifted out so the settlers can use it; `goal_progress()` keeps
-- its check and now calls this. Not granted to anyone.
create or replace function goal_template_count(p_member uuid, p_template text)
returns int
language plpgsql stable security definer set search_path = public as $fn$
declare
  t record;
  since date;
  n int := 0;
begin
  select * into t from goal_templates where key = p_template;
  if t is null then return 0; end if;
  since := (now() at time zone 'Asia/Manila')::date - t.period_days;

  if t.metric = 'training_days' then
    select count(*) into n from (
      select (a.check_in_time at time zone 'Asia/Manila')::date as d
        from attendance a
       where a.member_id = p_member
         and (a.check_in_time at time zone 'Asia/Manila')::date >= since
      union
      select w.performed_on from workout_logs w
       where w.member_id = p_member and w.performed_on >= since
    ) s;
  elsif t.metric = 'consistent_weeks' then
    select count(*) into n from (
      select date_trunc('week', d)::date as wk
        from (
          select (a.check_in_time at time zone 'Asia/Manila')::date as d
            from attendance a
           where a.member_id = p_member
             and (a.check_in_time at time zone 'Asia/Manila')::date >= since
          union
          select w.performed_on from workout_logs w
           where w.member_id = p_member and w.performed_on >= since
        ) days
       group by 1
      having count(*) >= 2
    ) weeks;
  elsif t.metric = 'heavy_sets' then
    select count(*) into n
      from workout_sets s
      join workout_logs l on l.id = s.log_id
     where l.member_id = p_member
       and l.performed_on >= since
       and s.weight_kg is not null
       and s.exercise_id is not null
       and s.weight_kg >= 0.8 * (
             select max(s2.weight_kg)
               from workout_sets s2
               join workout_logs l2 on l2.id = s2.log_id
              where l2.member_id = p_member
                and s2.exercise_id = s.exercise_id
           );
  elsif t.metric = 'cardio_minutes' then
    select coalesce(sum(s.duration_seconds) / 60, 0) into n
      from workout_sets s
      join workout_logs l on l.id = s.log_id
      join exercises e on e.id = s.exercise_id
     where l.member_id = p_member
       and l.performed_on >= since
       and e.muscle_group = 'cardio'
       and s.duration_seconds is not null;
  end if;
  return coalesce(n, 0);
end;
$fn$;

revoke all on function goal_template_count(uuid, text) from public, anon, authenticated;

create or replace function goal_progress(p_goal uuid)
returns int
language plpgsql stable security definer set search_path = public as $fn$
declare
  g record;
begin
  select * into g from fitness_goals where id = p_goal;
  if g is null or g.template_key is null then return 0; end if;
  if g.member_id is distinct from auth.uid()
     and not trainer_may_see(g.member_id, 'goals') then
    return 0;
  end if;
  return goal_template_count(g.member_id, g.template_key);
end;
$fn$;

-- ── Where a goal stands, and whether it is done ─────────────────────────────
-- Internal (no caller check): the settlers use them. `goal_current_value()`
-- below is the checked, granted version.
create or replace function goal_value_of(p_goal uuid)
returns numeric
language plpgsql stable security definer set search_path = public as $fn$
declare
  g record;
  v numeric;
begin
  select * into g from fitness_goals where id = p_goal;
  if g is null then return null; end if;

  if g.template_key is not null then
    return goal_template_count(g.member_id, g.template_key);
  end if;

  -- The latest reading that actually has this number: a later reading with
  -- only a chest measurement must not blank a weight goal.
  if g.metric in ('weight_kg', 'body_fat_pct', 'waist_cm') then
    select case g.metric
             when 'weight_kg' then m.weight_kg
             when 'body_fat_pct' then m.body_fat_pct
             else m.waist_cm
           end
      into v
      from body_measurements m
     where m.member_id = g.member_id
       and case g.metric
             when 'weight_kg' then m.weight_kg
             when 'body_fat_pct' then m.body_fat_pct
             else m.waist_cm
           end is not null
     order by m.measured_on desc, m.created_at desc
     limit 1;
    return v;
  end if;

  -- The heaviest set ever finished for the exercise.
  if g.metric = 'lift_kg' and g.exercise_id is not null then
    select max(s.weight_kg) into v
      from workout_sets s
      join workout_logs l on l.id = s.log_id
     where l.member_id = g.member_id
       and l.completed_at is not null
       and s.exercise_id = g.exercise_id
       and s.weight_kg is not null;
    return v;
  end if;

  return null;
end;
$fn$;

create or replace function goal_is_reached(p_goal uuid)
returns boolean
language plpgsql stable security definer set search_path = public as $fn$
declare
  g record;
  v numeric;
  going_down boolean;
begin
  select * into g from fitness_goals where id = p_goal;
  if g is null or g.target_value is null then return false; end if;
  if g.template_key is null and g.metric not in ('weight_kg', 'body_fat_pct', 'waist_cm', 'lift_kg') then
    return false;   -- a custom goal: nothing measures it
  end if;
  v := goal_value_of(p_goal);
  if v is null then return false; end if;
  if g.template_key is not null then return v >= g.target_value; end if;

  -- Direction from the goal's own start. Without one: a lift goes up, a body
  -- fat or waist goal goes down, and a weight goal — which could be either —
  -- counts only an exact hit. (The app always records a start, from the latest
  -- reading, so that last case is an old goal made before it did.)
  if g.start_value is not null and g.start_value <> g.target_value then
    going_down := g.target_value < g.start_value;
  elsif g.metric = 'lift_kg' then
    going_down := false;
  elsif g.metric in ('body_fat_pct', 'waist_cm') then
    going_down := true;
  else
    return v = g.target_value;
  end if;

  return case when going_down then v <= g.target_value else v >= g.target_value end;
end;
$fn$;

revoke all on function goal_value_of(uuid), goal_is_reached(uuid) from public, anon, authenticated;

-- The member's (or a sharing trainer's) view of a goal's current value.
create or replace function goal_current_value(p_goal uuid)
returns numeric
language plpgsql stable security definer set search_path = public as $fn$
declare
  g record;
begin
  select member_id into g from fitness_goals where id = p_goal;
  if g is null then return null; end if;
  if g.member_id is distinct from auth.uid()
     and not trainer_may_see(g.member_id, 'goals') then
    return null;
  end if;
  return goal_value_of(p_goal);
end;
$fn$;

revoke all on function goal_current_value(uuid) from public, anon;
grant execute on function goal_current_value(uuid) to authenticated;

-- ── Settling ────────────────────────────────────────────────────────────────
-- One loop, two scopes. `app.goal_settling` is how the guard below knows the
-- write is the settler's (see 0055 for why a role check cannot do this).
create or replace function settle_goals_for(p_member uuid)
returns int
language plpgsql security definer set search_path = public as $fn$
declare
  g record;
  n int := 0;
begin
  perform set_config('app.goal_settling', 'on', true);
  for g in
    select f.id
      from fitness_goals f
     where f.achieved_on is null
       and f.target_value is not null
       and (p_member is null or f.member_id = p_member)
       and (f.template_key is not null
            or f.metric in ('weight_kg', 'body_fat_pct', 'waist_cm', 'lift_kg'))
  loop
    if goal_is_reached(g.id) then
      update fitness_goals
         set achieved_on = (now() at time zone 'Asia/Manila')::date
       where id = g.id;
      n := n + 1;
    end if;
  end loop;
  perform set_config('app.goal_settling', 'off', true);
  return n;
end;
$fn$;

revoke all on function settle_goals_for(uuid) from public, anon, authenticated;

-- For a scheduler, if the project has one: everyone.
create or replace function settle_goals() returns int
language sql security definer set search_path = public as $fn$
  select settle_goals_for(null)
$fn$;
revoke all on function settle_goals() from public, anon, authenticated;

-- For the Goals screen: the caller's own, and nobody else's.
create or replace function settle_my_goals() returns int
language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then return 0; end if;
  return settle_goals_for(auth.uid());
end;
$fn$;
revoke all on function settle_my_goals() from public, anon;
grant execute on function settle_my_goals() to authenticated;

-- ── Only the settler marks a measured or preset goal reached ────────────────
create or replace function trg_guard_goal_achieved() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if current_setting('app.goal_settling', true) = 'on' then
    return new;
  end if;
  if get_my_role() in ('admin', 'staff') then
    return new;
  end if;
  if new.achieved_on is distinct from old.achieved_on
     and (new.template_key is not null
          or new.metric in ('weight_kg', 'body_fat_pct', 'waist_cm', 'lift_kg')) then
    raise exception 'This goal is marked reached automatically when your numbers get there.';
  end if;
  return new;
end;
$fn$;

-- ── Points only for a goal something checked ───────────────────────────────
create or replace function trg_points_goal() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.achieved_on is not null and old.achieved_on is null
     and (new.template_key is not null
          or new.metric in ('weight_kg', 'body_fat_pct', 'waist_cm', 'lift_kg')) then
    perform award_points(new.member_id, 'goal_achieved', 'fitness_goals', new.id);
  end if;
  return null;
end;
$fn$;

-- Marker for scripts/probe-migrations.py.
create or replace function migration_0087_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0087_applied() from public, anon;
grant execute on function migration_0087_applied() to authenticated;
