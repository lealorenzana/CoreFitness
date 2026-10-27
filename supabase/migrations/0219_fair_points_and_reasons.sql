-- 0219 — fair points, programs that retire, and reasons (2026-10-28; plan
-- docs/superpowers/plans/2026-10-28-simplify.md, Task F1).
--
-- The owner: "find everything that members can exploit to earn more points —
-- there should be no exploitations." What a member could do alone, before this:
--   * finish an empty workout again and again — every finish paid;
--   * insert workouts dated up to 30 days back, with no sets — each was a
--     training day for streaks, the earned level, challenges and badges, and so
--     paid through streak milestones, challenges and achievement points;
--   * log one absurd set (80 kg → 400 kg) for a record, delete the set and do
--     it again — the weekly cap counted rows that were then deleted;
--   * set a target they had already reached and be paid for reaching it;
--   * delete what paid and earn it again;
--   * insert a reward request already "approved".
-- Now (each rule in SQL, so no client can skip it):
--   * a workout COUNTS only when finished, with 3+ sets, 10+ minutes from start
--     to finish, and dated the day it was finished (or the day before, for a
--     workout finished after midnight). Only counting workouts are training
--     days anywhere, and only the first counting workout of a day pays.
--     `counts` and the finish time are the server's; a member cannot set them.
--     The start time is the phone's (a workout saved with no signal is
--     uploaded later), held within 3 hours of upload — so faking it gains at
--     most the one workout a day an honest member earns anyway;
--   * a record pays only when believable (at most 1.5× the best weight, 2× the
--     best time) — it is still recorded, since a warm-up logged first is a low
--     baseline; the weekly cap counts payouts, not rows;
--   * a target pays only when it is at least 7 days old, at most twice in 30 days;
--   * deleting a workout, a record or a target that paid takes its points back;
--   * a member's reward request is always stored as pending, one at a time.
-- Workouts finished before 0219 keep counting as they did; unfinished ones stop.
--
-- Also: delete_or_retire_program() (deleted when nobody is on it, else hidden
-- for new members), and record_reason() — the desk and owner's reason for a
-- cancel, delete, decline, refund, void, freeze, price change or points removal,
-- written to the activity log (detail ->> 'reason').
--
-- Paste after 0218. Then scripts/sql/verify/verify0219.sql.

-- ── 1. When a workout counts ───────────────────────────────────────────────
alter table workout_logs add column if not exists started_at timestamptz;
alter table workout_logs add column if not exists counts boolean not null default false;
update workout_logs set started_at = coalesce(started_at, created_at);
update workout_logs set counts = (completed_at is not null);
alter table workout_logs alter column started_at set default now();
alter table workout_logs alter column started_at set not null;
create index if not exists workout_logs_counting on workout_logs (gym_id, member_id, performed_on) where counts;

/**
 * A real workout: finished, 3+ sets, 10+ minutes, dated the day it was finished (or the day before).
 * Invoker's rights: the guard below runs as the member (that is how it tells their write from the
 * server's), and as the member it can count only their own sets — never another member's.
 */
create or replace function workout_qualifies(l workout_logs) returns boolean
language sql stable security invoker set search_path = public as $$
  select l.completed_at is not null
     and l.completed_at - l.started_at >= interval '10 minutes'
     and l.performed_on between (l.completed_at at time zone 'Asia/Manila')::date - 1
                            and (l.completed_at at time zone 'Asia/Manila')::date
     and (select count(*) from workout_sets s where s.log_id = l.id) >= 3
$$;
revoke all on function workout_qualifies(workout_logs) from public, anon;
grant execute on function workout_qualifies(workout_logs) to authenticated;

create or replace function trg_workout_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.counts := false;
    if direct_user_write() then
      new.started_at := least(greatest(coalesce(new.started_at, now()), now() - interval '3 hours'), now());
      if new.completed_at is not null then new.completed_at := now(); end if;
    end if;
    return new;
  end if;
  -- The recount after a set changes (below) is the server's own write.
  if coalesce(current_setting('app.workout_counting', true), '') = 'on' and not direct_user_write() then return new; end if;
  new.started_at := old.started_at;
  if direct_user_write() then
    if old.completed_at is null and new.completed_at is not null then
      new.completed_at := now();
    elsif old.completed_at is not null then
      new.completed_at := old.completed_at;
    end if;
  end if;
  new.counts := workout_qualifies(new);
  return new;
end;
$$;
drop trigger if exists workout_guard on workout_logs;
create trigger workout_guard before insert or update on workout_logs
  for each row execute function trg_workout_guard();

-- A set added or removed after the finish can make a workout count, or stop it.
create or replace function trg_workout_recount() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_log uuid := coalesce(new.log_id, old.log_id);
begin
  perform set_config('app.workout_counting', 'on', true);
  update workout_logs l set counts = workout_qualifies(l)
   where l.id = v_log and l.completed_at is not null and l.counts is distinct from workout_qualifies(l);
  perform set_config('app.workout_counting', '', true);
  return null;
end;
$$;
drop trigger if exists workout_sets_recount on workout_sets;
create trigger workout_sets_recount after insert or delete on workout_sets
  for each row execute function trg_workout_recount();

-- ── 2. Workout points: the first counting workout of the day ───────────────
create or replace function trg_points_workout() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare v_paid int;
begin
  if new.counts and not old.counts then
    perform act_as_gym(new.gym_id);
    select coalesce(sum(points), 0) into v_paid from point_ledger
     where gym_id = new.gym_id and member_id = new.member_id and rule_key = 'workout_logged'
       and (created_at at time zone 'Asia/Manila')::date = manila_today();
    if v_paid <= 0 then
      perform award_points(new.member_id, 'workout_logged', 'workout_logs', new.id);
    end if;
  elsif old.counts and not new.counts then
    perform take_points_back(new.gym_id, new.member_id, 'workout_logged', 'workout_logs', new.id, 'workout_logs_uncounted');
  end if;
  return null;
end;
$fn$;

/** Puts back what one source paid, once. Never fails the write it rides on. */
create or replace function take_points_back(p_gym uuid, p_member uuid, p_rule text, p_table text, p_id uuid, p_back text)
returns void language plpgsql security definer set search_path = public as $$
declare v_had int;
begin
  begin
    select coalesce(sum(points), 0) into v_had from point_ledger
     where gym_id = p_gym and member_id = p_member and rule_key = p_rule
       and source_id = p_id and source_table in (p_table, p_back);
    if v_had > 0 and exists (select 1 from member_profiles where gym_id = p_gym and profile_id = p_member) then
      insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
      values (p_gym, p_member, p_rule, -v_had, p_back, p_id)
      on conflict (gym_id, member_id, rule_key, source_table, source_id) do nothing;
    end if;
  exception when others then null;
  end;
end;
$$;
revoke all on function take_points_back(uuid, uuid, text, text, uuid, text) from public, anon, authenticated;

create or replace function trg_points_back_workout() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform take_points_back(old.gym_id, old.member_id, 'workout_logged', 'workout_logs', old.id, 'workout_logs_removed');
  return old;
end;
$$;
drop trigger if exists workout_logs_points_back on workout_logs;
create trigger workout_logs_points_back before delete on workout_logs
  for each row execute function trg_points_back_workout();

-- ── 3. Only counting workouts are training days ────────────────────────────
-- Each function below is its last body (live 2026-10-28), with `and <alias>.counts`
-- added where it reads workout_logs. Nothing else changes.
create or replace function training_days_between(p_member uuid, p_gym uuid, p_from date, p_to date)
returns integer language sql stable security definer set search_path = public as $function$
  select count(*)::int from (
    select (a.check_in_time at time zone 'Asia/Manila')::date as d from attendance a
     where a.member_id = p_member and a.gym_id = p_gym
       and (a.check_in_time at time zone 'Asia/Manila')::date between p_from and p_to
    union
    select w.performed_on from workout_logs w
     where w.member_id = p_member and w.gym_id = p_gym and w.counts and w.performed_on between p_from and p_to
  ) days;
$function$;

create or replace function streak_weeks(p_member uuid, p_gym uuid)
returns table(current_run integer, best_run integer, target integer)
language plpgsql stable security definer set search_path = public as $function$
declare
  v_target int := coalesce((select streak_target from member_profiles
                             where gym_id = p_gym and profile_id = p_member), 2);
  v_this date := manila_week_start();
  v_first date;
  v_hits date[];
  v_frozen date[];
  w date;
  v_run int := 0;
  v_best int := 0;
  v_cur int := 0;
begin
  select coalesce(array_agg(wk), '{}') into v_hits from (
    select date_trunc('week', d)::date as wk from (
      select (a.check_in_time at time zone 'Asia/Manila')::date as d from attendance a
       where a.member_id = p_member and a.gym_id = p_gym
      union
      select l.performed_on from workout_logs l
       where l.member_id = p_member and l.gym_id = p_gym and l.counts
    ) days group by 1 having count(*) >= v_target
  ) h;
  select coalesce(array_agg(f), '{}') into v_frozen from member_frozen_weeks(p_member, p_gym) f;

  select min(wk) into v_first from unnest(v_hits) wk;
  if v_first is null then
    return query select 0, 0, v_target;
    return;
  end if;

  w := v_first;
  while w <= v_this loop
    if w = any(v_hits) then
      v_run := v_run + 1;
      v_best := greatest(v_best, v_run);
    elsif w = any(v_frozen) or w = v_this then
      null;
    else
      v_run := 0;
    end if;
    w := w + 7;
  end loop;

  w := case when v_this = any(v_hits) then v_this else v_this - 7 end;
  while w >= v_first loop
    if w = any(v_hits) then
      v_cur := v_cur + 1;
    elsif w = any(v_frozen) then
      null;
    else
      exit;
    end if;
    w := w - 7;
  end loop;

  return query select v_cur, v_best, v_target;
end;
$function$;

create or replace function streak_card(p_member uuid, p_gym uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $function$
declare
  s record;
  v_week date := manila_week_start();
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_days int;
  v_left int;
  v_frozen boolean;
  v_dots jsonb;
  v_next int;
  v_nudges boolean;
  v_since date;
  v_history jsonb;
  v_plan int;
begin
  select * into s from streak_weeks(p_member, p_gym);
  v_days := training_days_between(p_member, p_gym, v_week, v_week + 6);
  v_left := gym_days_left(p_gym);
  v_frozen := exists (select 1 from memberships m where m.member_id = p_member and m.gym_id = p_gym and m.status = 'frozen');
  select jsonb_agg(
           exists (select 1 from attendance a where a.member_id = p_member and a.gym_id = p_gym
                      and (a.check_in_time at time zone 'Asia/Manila')::date = g.d::date)
           or exists (select 1 from workout_logs l where l.member_id = p_member and l.gym_id = p_gym
                         and l.counts and l.performed_on = g.d::date)
           order by g.d)
    into v_dots from generate_series(v_week::timestamp, (v_week + 6)::timestamp, interval '1 day') g(d);
  select min(m) into v_next from unnest(array[4, 12, 26, 52]) m where m > s.best_run;
  select streak_nudges, (created_at at time zone 'Asia/Manila')::date into v_nudges, v_since
    from member_profiles where gym_id = p_gym and profile_id = p_member;

  select jsonb_agg(jsonb_build_object(
           'week', w.wk,
           'days', w.days,
           'state', case
             when w.days >= s.target then 'hit'
             when w.wk = v_week then 'current'
             when w.wk in (select f from member_frozen_weeks(p_member, p_gym) f) then 'frozen'
             when w.days = 0 and v_since is not null and w.wk + 6 < v_since then 'before'
             else 'miss' end)
         order by w.wk)
    into v_history
    from (select (v_week - 7 * i) as wk,
                 training_days_between(p_member, p_gym, v_week - 7 * i, v_week - 7 * i + 6) as days
            from generate_series(0, 11) i) w;

  select count(*)::int into v_plan from gym_plans gp
   where gp.member_id = p_member and gp.gym_id = p_gym and gp.active;

  return jsonb_build_object(
    'target', s.target,
    'current', s.current_run,
    'best', s.best_run,
    'days_this_week', v_days,
    'needed', greatest(s.target - v_days, 0),
    'days_left', v_left,
    'week', v_dots,
    'today_index', v_today - v_week,
    'frozen', v_frozen,
    'at_risk', s.current_run > 0 and not v_frozen and s.target - v_days > 0 and s.target - v_days = v_left,
    'out_of_reach', not v_frozen and s.target - v_days > v_left,
    'next_milestone', v_next,
    'nudges', coalesce(v_nudges, true),
    'history', coalesce(v_history, '[]'::jsonb),
    'plan_days', coalesce(v_plan, 0),
    'closed_days', (select coalesce(to_jsonb(gs.closed_days), '[]'::jsonb) from gym_settings gs where gs.gym_id = p_gym));
end;
$function$;

create or replace function member_training_stats(uid uuid)
returns table(training_days integer, verified_days integer, logged_days integer, consistent_weeks integer,
              current_week_streak integer, best_week_streak integer, weekend_days integer, early_checkins integer,
              late_checkins integer, distinct_activities integer, goals_achieved integer, measurements integer,
              classes_attended integer, pt_sessions_done integer, member_since date)
language sql stable security definer set search_path = public as $function$
  with
  gym as (select acting_gym_id() as id),
  raw as (
    select (a.check_in_time at time zone 'Asia/Manila')::date as d, true as verified
    from attendance a, gym
    where a.member_id = uid and a.gym_id = gym.id
    union all
    select w.performed_on, false
    from workout_logs w, gym
    where w.member_id = uid and w.gym_id = gym.id and w.counts
  ),
  by_day as (
    select d, bool_or(verified) as verified
    from raw
    group by d
  ),
  weeks as (
    select date_trunc('week', d)::date as wk, count(*) as n
    from by_day
    group by 1
  ),
  consistent as (
    select wk from weeks where n >= 2
  ),
  sw as (
    select s.current_run, s.best_run from gym, streak_weeks(uid, gym.id) s
  ),
  activities as (
    select distinct lower(trim(act)) as act from (
      select a.activity as act from attendance a, gym
       where a.member_id = uid and a.gym_id = gym.id and a.activity is not null
      union all
      select w.activity from workout_logs w, gym
       where w.member_id = uid and w.gym_id = gym.id and w.counts and w.activity is not null
    ) s
    where trim(act) <> ''
  )
  select
    (select count(*) from by_day)::int,
    (select count(*) from by_day where verified)::int,
    (select count(*) from by_day where not verified)::int,
    (select count(*) from consistent)::int,
    (select current_run from sw)::int,
    (select best_run from sw)::int,
    (select count(*) from by_day where extract(isodow from d) in (6, 7))::int,
    (select count(*) from attendance a, gym
      where a.member_id = uid and a.gym_id = gym.id
        and extract(hour from (a.check_in_time at time zone 'Asia/Manila')) < 7)::int,
    (select count(*) from attendance a, gym
      where a.member_id = uid and a.gym_id = gym.id
        and extract(hour from (a.check_in_time at time zone 'Asia/Manila')) >= 20)::int,
    (select count(*) from activities)::int,
    (select count(*) from fitness_goals g, gym
      where g.member_id = uid and g.gym_id = gym.id and g.achieved_on is not null)::int,
    (select count(*) from body_measurements m, gym where m.member_id = uid and m.gym_id = gym.id)::int,
    (select count(*) from bookings b
       join classes c on c.id = b.class_id, gym
      where b.member_id = uid and b.gym_id = gym.id
        and b.status = 'approved' and c.scheduled_at < now())::int,
    (select count(*) from pt_sessions p, gym
      where p.member_id = uid and p.gym_id = gym.id
        and p.status = 'approved' and p.starts_at < now())::int,
    (select mp.created_at::date from member_profiles mp, gym
      where mp.profile_id = uid and mp.gym_id = gym.id);
$function$;

create or replace function gym_goal_contribution(p_goal uuid, p_member uuid)
returns integer language plpgsql stable security definer set search_path = public as $function$
declare g record;
begin
  select * into g from gym_goals where id = p_goal;
  if g.id is null then return 0; end if;
  return case g.metric
    when 'training_days' then training_days_between(p_member, g.gym_id, g.starts_on, g.ends_on)
    when 'workouts_logged' then (select count(*)::int from workout_logs w
       where w.member_id = p_member and w.gym_id = g.gym_id and w.counts and w.performed_on between g.starts_on and g.ends_on)
    when 'checkins' then (select count(*)::int from attendance a
       where a.member_id = p_member and a.gym_id = g.gym_id
         and (a.check_in_time at time zone 'Asia/Manila')::date between g.starts_on and g.ends_on)
    else 0 end;
end;
$function$;

create or replace function goal_template_count(p_member uuid, p_template text, p_gym uuid default null)
returns integer language plpgsql stable security definer set search_path = public as $function$
declare
  v_gym uuid := coalesce(p_gym, acting_gym_id());
  t record;
  since date;
  n int := 0;
begin
  select * into t from goal_templates where gym_id = v_gym and key = p_template;
  if t is null then return 0; end if;
  since := (now() at time zone 'Asia/Manila')::date - t.period_days;

  if t.metric = 'training_days' then
    select count(*) into n from (
      select (a.check_in_time at time zone 'Asia/Manila')::date as d
        from attendance a
       where a.member_id = p_member and a.gym_id = v_gym
         and (a.check_in_time at time zone 'Asia/Manila')::date >= since
      union
      select w.performed_on from workout_logs w
       where w.member_id = p_member and w.gym_id = v_gym and w.counts and w.performed_on >= since
    ) s;
  elsif t.metric = 'consistent_weeks' then
    select count(*) into n from (
      select date_trunc('week', d)::date as wk
        from (
          select (a.check_in_time at time zone 'Asia/Manila')::date as d
            from attendance a
           where a.member_id = p_member and a.gym_id = v_gym
             and (a.check_in_time at time zone 'Asia/Manila')::date >= since
          union
          select w.performed_on from workout_logs w
           where w.member_id = p_member and w.gym_id = v_gym and w.counts and w.performed_on >= since
        ) days
       group by 1
      having count(*) >= 2
    ) weeks;
  elsif t.metric = 'heavy_sets' then
    select count(*) into n
      from workout_sets s
      join workout_logs l on l.id = s.log_id
     where l.member_id = p_member and l.gym_id = v_gym and l.counts
       and l.performed_on >= since
       and s.weight_kg is not null
       and s.exercise_id is not null
       and s.weight_kg >= 0.8 * (
             select max(s2.weight_kg)
               from workout_sets s2
               join workout_logs l2 on l2.id = s2.log_id
              where l2.member_id = p_member and l2.gym_id = v_gym and l2.counts
                and s2.exercise_id = s.exercise_id
           );
  elsif t.metric = 'cardio_minutes' then
    select coalesce(sum(s.duration_seconds) / 60, 0) into n
      from workout_sets s
      join workout_logs l on l.id = s.log_id
      join exercises e on e.id = s.exercise_id
     where l.member_id = p_member and l.gym_id = v_gym and l.counts
       and l.performed_on >= since
       and e.muscle_group = 'cardio'
       and s.duration_seconds is not null;
  end if;
  return coalesce(n, 0);
end;
$function$;

create or replace function challenge_progress(p_challenge uuid, p_member uuid)
returns integer language plpgsql stable security definer set search_path = public as $function$
declare
  c record;
  n int := 0;
begin
  select * into c from challenges where id = p_challenge and in_my_gym(gym_id);
  if c is null then
    return 0;
  end if;

  if p_member is distinct from auth.uid()
     and auth.uid() is not null
     and coalesce(get_my_role()::text, '') not in ('admin', 'staff', 'trainer') then
    return 0;
  end if;

  with raw as (
    select (a.check_in_time at time zone 'Asia/Manila')::date as d, true as verified
      from attendance a
     where a.member_id = p_member and a.gym_id = c.gym_id
       and (a.check_in_time at time zone 'Asia/Manila')::date between c.starts_on and c.ends_on
    union all
    select w.performed_on, false
      from workout_logs w
     where w.member_id = p_member and w.gym_id = c.gym_id and w.counts
       and w.performed_on between c.starts_on and c.ends_on
  ),
  by_day as (
    select d, bool_or(verified) as verified from raw group by d
  ),
  weeks as (
    select date_trunc('week', d)::date as wk, count(*) as k from by_day group by 1
  ),
  activities as (
    select distinct lower(trim(act)) as act from (
      select a.activity as act from attendance a
       where a.member_id = p_member and a.gym_id = c.gym_id and a.activity is not null
         and (a.check_in_time at time zone 'Asia/Manila')::date between c.starts_on and c.ends_on
      union all
      select w.activity from workout_logs w
       where w.member_id = p_member and w.gym_id = c.gym_id and w.counts and w.activity is not null
         and w.performed_on between c.starts_on and c.ends_on
    ) s
    where trim(act) <> ''
  )
  select case c.metric_key
    when 'training_days'       then (select count(*) from by_day)
    when 'verified_days'       then (select count(*) from by_day where verified)
    when 'logged_days'         then (select count(*) from by_day where not verified)
    when 'consistent_weeks'    then (select count(*) from weeks where k >= 2)
    when 'weekend_days'        then (select count(*) from by_day where extract(isodow from d) in (6,7))
    when 'distinct_activities' then (select count(*) from activities)
    when 'early_checkins'      then (select count(*) from attendance a
                                      where a.member_id = p_member and a.gym_id = c.gym_id
                                        and extract(hour from (a.check_in_time at time zone 'Asia/Manila')) < 7
                                        and (a.check_in_time at time zone 'Asia/Manila')::date between c.starts_on and c.ends_on)
    when 'late_checkins'       then (select count(*) from attendance a
                                      where a.member_id = p_member and a.gym_id = c.gym_id
                                        and extract(hour from (a.check_in_time at time zone 'Asia/Manila')) >= 20
                                        and (a.check_in_time at time zone 'Asia/Manila')::date between c.starts_on and c.ends_on)
    when 'goals_achieved'      then (select count(*) from fitness_goals g
                                      where g.member_id = p_member and g.gym_id = c.gym_id
                                        and g.achieved_on between c.starts_on and c.ends_on)
    when 'measurements'        then (select count(*) from body_measurements m
                                      where m.member_id = p_member and m.gym_id = c.gym_id
                                        and m.measured_on between c.starts_on and c.ends_on)
    when 'classes_attended'    then (select count(*) from bookings b
                                      join classes cl on cl.id = b.class_id
                                     where b.member_id = p_member and b.gym_id = c.gym_id and b.status = 'approved'
                                       and cl.scheduled_at < now()
                                       and (cl.scheduled_at at time zone 'Asia/Manila')::date between c.starts_on and c.ends_on)
    when 'pt_sessions_done'    then (select count(*) from pt_sessions p
                                      where p.member_id = p_member and p.gym_id = c.gym_id and p.status = 'approved'
                                        and p.starts_at < now()
                                        and (p.starts_at at time zone 'Asia/Manila')::date between c.starts_on and c.ends_on)
    else 0
  end into n;

  return coalesce(n, 0);
end;
$function$;

-- ── 4. Records: believable, capped by payouts, taken back when deleted ─────
create or replace function trg_detect_personal_record() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_member uuid;
  v_kind   text;
  v_val    numeric;
  v_prev   numeric;
  v_pr     uuid;
  v_pts    int := 0;
  v_rule   int;
  v_week   date := date_trunc('week', now() at time zone 'Asia/Manila')::date;
  v_name   text;
begin
  if new.exercise_id is null then return new; end if;
  select l.member_id into v_member from workout_logs l where l.id = new.log_id;
  if v_member is null then return new; end if;

  if coalesce(new.weight_kg, 0) > 0 then
    v_kind := 'weight'; v_val := new.weight_kg;
    select max(s.weight_kg) into v_prev
      from workout_sets s join workout_logs l on l.id = s.log_id
     where l.member_id = v_member and s.gym_id = new.gym_id and s.exercise_id = new.exercise_id
       and s.id <> new.id and s.weight_kg is not null and not set_is_discounted(s.id);
  elsif coalesce(new.duration_seconds, 0) > 0 then
    v_kind := 'duration'; v_val := new.duration_seconds;
    select max(s.duration_seconds) into v_prev
      from workout_sets s join workout_logs l on l.id = s.log_id
     where l.member_id = v_member and s.gym_id = new.gym_id and s.exercise_id = new.exercise_id
       and s.id <> new.id and s.duration_seconds is not null and not set_is_discounted(s.id);
  else
    return new;
  end if;

  -- The first set is the baseline; a tie is not a record.
  if v_prev is null or v_val <= v_prev then return new; end if;

  insert into personal_records (gym_id, member_id, exercise_id, kind, value, previous, set_id)
  values (new.gym_id, v_member, new.exercise_id, v_kind, v_val, v_prev, new.id)
  on conflict (set_id, kind) do nothing
  returning id into v_pr;
  if v_pr is null then return new; end if;

  -- Points: the gym's rule, the member's plan, and at most three payouts a week —
  -- counted from the ledger, which a deleted record cannot leave (0219).
  select points into v_rule from point_rules
   where gym_id = new.gym_id and key = 'personal_record' and is_active;
  -- An unbelievable jump (over 1.5× the best weight, 2× the best time) is still a
  -- record — a warm-up logged first is a low baseline — but it pays nothing; the
  -- desk can remove a fake one, which also clears the baseline (0219).
  if v_rule is not null and member_plan_allows(v_member, 'points_earn')
     and v_val <= v_prev * (case when v_kind = 'weight' then 1.5 else 2 end)
     and (select count(*) from point_ledger p
           where p.member_id = v_member and p.gym_id = new.gym_id and p.rule_key = 'personal_record'
             and p.source_table = 'personal_records' and p.points > 0
             and (p.created_at at time zone 'Asia/Manila')::date >= v_week) < 3 then
    insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
    values (new.gym_id, v_member, 'personal_record', v_rule, 'personal_records', v_pr)
    on conflict (gym_id, member_id, rule_key, source_table, source_id) do nothing;
    v_pts := v_rule;
    update personal_records set points_awarded = v_pts where id = v_pr;
  end if;

  select name into v_name from exercises where id = new.exercise_id;
  perform notify_once(v_member, 'personal_record', 'New personal record',
    v_name || ': ' || case when v_kind = 'weight' then trim(to_char(v_val, 'FM999990.##')) || ' kg'
                           else v_val::int || ' seconds' end
      || case when v_pts > 0 then ' (+' || v_pts || ' points)' else '' end,
    '/member/season', 'pr:' || v_pr, new.gym_id);
  return new;
end;
$$;

create or replace function trg_points_back_record() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.removed_at is null then
    perform take_points_back(old.gym_id, old.member_id, 'personal_record', 'personal_records', old.id, 'personal_records_removed');
  end if;
  return old;
end;
$$;
drop trigger if exists personal_records_points_back on personal_records;
create trigger personal_records_points_back before delete on personal_records
  for each row execute function trg_points_back_record();

-- ── 5. Targets: a week old, at most two paid in 30 days ────────────────────
create or replace function trg_points_goal() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.achieved_on is not null and old.achieved_on is null
     and (new.template_key is not null
          or new.metric in ('weight_kg', 'body_fat_pct', 'waist_cm', 'lift_kg'))
     and (new.created_at at time zone 'Asia/Manila')::date <= new.achieved_on - 7
     and (select count(*) from point_ledger p
           where p.gym_id = new.gym_id and p.member_id = new.member_id and p.rule_key = 'goal_achieved'
             and p.source_table = 'fitness_goals' and p.points > 0
             and p.created_at > now() - interval '30 days') < 2 then
    perform act_as_gym(new.gym_id);
    perform award_points(new.member_id, 'goal_achieved', 'fitness_goals', new.id);
  end if;
  return null;
end;
$fn$;

create or replace function trg_points_back_goal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform take_points_back(old.gym_id, old.member_id, 'goal_achieved', 'fitness_goals', old.id, 'fitness_goals_removed');
  return old;
end;
$$;
drop trigger if exists fitness_goals_points_back on fitness_goals;
create trigger fitness_goals_points_back before delete on fitness_goals
  for each row execute function trg_points_back_goal();

-- ── 6. A member's reward request: pending, one at a time ───────────────────
create or replace function trg_validate_redemption() returns trigger
language plpgsql security definer set search_path = public as $function$
declare
  r record;
begin
  perform act_as_gym(new.gym_id);
  -- Two requests at once must not both pass the balance check.
  perform pg_advisory_xact_lock(hashtext('redeem:' || new.member_id::text));
  if not plan_allows(new.member_id, 'points_redeem') then
    raise exception 'Redeeming points is not included in your membership.';
  end if;

  select * into r from rewards where id = new.reward_id and gym_id = new.gym_id;
  if r is null or not r.is_active then
    raise exception 'That reward is not available.';
  end if;
  if r.stock is not null and r.stock <= 0 then
    raise exception 'That reward is out of stock.';
  end if;

  new.cost_points := r.cost_points;
  -- A member asks; only the gym decides (0219).
  if not coalesce(is_front_desk(), false) then
    new.status := 'pending';
    new.decided_by := null; new.decided_at := null; new.decision_note := null;
    new.fulfilled_at := null; new.fulfilled_by := null;
    new.requested_at := now();
  end if;

  if member_points_balance(new.member_id) < r.cost_points then
    raise exception 'You do not have enough points for that yet.';
  end if;

  return new;
end;
$function$;

-- ── 7. Programs: deleted when nobody is on them, else retired ──────────────
create or replace function delete_or_retire_program(p_program uuid, p_reason text) returns text
language plpgsql security definer set search_path = public as $$
declare p record; v_on boolean;
begin
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
    raise exception 'Say why, in a few words (a reason of 3 to 300 characters).';
  end if;
  select * into p from gym_programs where id = p_program and gym_id = current_gym_id();
  if p.id is null then raise exception 'That program is not in this gym.'; end if;
  if not (coalesce(storage_role_here(), '') in ('admin', 'staff') or p.author_id is not distinct from auth.uid() and p.author_id is not null) or not coalesce(gym_writable(), false) then
    raise exception 'Only the gym or the program''s author can remove it.' using errcode = '42501';
  end if;
  v_on := exists (select 1 from program_enrolments e where e.program_id = p.id);
  if v_on then
    update gym_programs set hidden = true, published = false, updated_at = now() where id = p.id;
  else
    delete from gym_programs where id = p.id;
  end if;
  perform log_activity(case when v_on then 'program.retired' else 'program.deleted' end, 'program', p.id, null,
    case when v_on then 'Retired the program ' else 'Deleted the program ' end || p.name,
    jsonb_build_object('reason', btrim(p_reason)), p.gym_id);
  return case when v_on then 'retired' else 'deleted' end;
end;
$$;
revoke all on function delete_or_retire_program(uuid, text) from public, anon;
grant execute on function delete_or_retire_program(uuid, text) to authenticated;

-- ── 8. Reasons ─────────────────────────────────────────────────────────────
/**
 * The owner or desk's reason for something that undoes or changes money:
 * a cancel, delete, decline, refund, void, freeze, price or plan change, or
 * points removed. Written beside the action's own activity row.
 */
create or replace function record_reason(p_action text, p_subject_type text, p_subject_id uuid, p_member uuid,
                                         p_summary text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(storage_role_here(), '') not in ('admin', 'staff') then
    raise exception 'Only the gym records a reason.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
    raise exception 'Say why, in a few words (a reason of 3 to 300 characters).';
  end if;
  perform log_activity(left(coalesce(p_action, 'reason'), 60), left(coalesce(p_subject_type, 'item'), 40), p_subject_id, p_member,
    left(coalesce(nullif(btrim(p_summary), ''), 'A change'), 300), jsonb_build_object('reason', btrim(p_reason)), current_gym_id());
end;
$$;
revoke all on function record_reason(text, text, uuid, uuid, text, text) from public, anon;
grant execute on function record_reason(text, text, uuid, uuid, text, text) to authenticated;

-- The triggers' own functions are not callable.
do $$
declare f text;
begin
  foreach f in array array['trg_workout_guard()', 'trg_workout_recount()', 'trg_points_back_workout()',
    'trg_points_back_record()', 'trg_points_back_goal()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end
$$;

-- What's new, once per person (0212).
insert into app_releases (app, title, items)
select 'member', 'Fair points', array[
  'A workout earns points when it is a real one: at least 3 sets and 10 minutes, once a day.',
  'Only those workouts, and your check-ins, count as training days for your streak, level and challenges.',
  'Targets earn points once they are a week old.'
]
where not exists (select 1 from app_releases where app = 'member' and title = 'Fair points');

create or replace function migration_0219_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0219_applied() to anon, authenticated;
