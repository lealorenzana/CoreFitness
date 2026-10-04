-- 0151: THE GYM STREAK — YOUR OWN WEEKLY TARGET, A NUDGE BEFORE IT BREAKS, MILESTONES THAT PAY
--
-- A streak already existed (0028): consecutive weeks with two or more training
-- days, behind two badges ("Month of Momentum", "Quarter Strong"), shown on
-- Progress and nowhere a member looks first. This keeps that ONE definition and
-- extends it, rather than adding a second "streak" that disagrees with it:
--
--   * A training day is still training_days_between()'s (0124): a Manila day
--     with a check-in OR a logged workout.
--   * Each member picks a weekly target, 2–5 days (member_profiles.streak_target,
--     default 2 = the old rule, so nobody's streak changes until they choose).
--     Not 1: the existing badges say "twice a week or better", and a 1-day
--     target would make them false.
--   * A week the member was frozen for (0057's freeze/unfreeze events) neither
--     counts nor breaks the streak — "frozen means no access at all".
--   * This week is in progress: until it is reached it does not break anything.
--
-- member_training_stats() (0102) now takes current/best from streak_weeks(), so
-- the badges, Progress, Achievements and everything else read the same number.
-- consistent_weeks (levels) stays "weeks with 2+ days", untouched.
--
-- A nudge before it breaks: streak_nudge_sweep() (run when the owner's dashboard
-- loads, like 0130's win-back sweep) writes one notification per member per week,
-- on the day the member must train every remaining day to keep the streak.
-- Members switch it off (streak_nudges); a gym with Progress switched off (0141)
-- sends none. Points at 4, 12, 26 and 52 weeks, once each, via settle_my_streak()
-- and the ledger's own idempotency; badges at 26 and 52 join the existing 4 and 12.

-- ---- 1. the member's own target --------------------------------------------------------
alter table member_profiles add column if not exists streak_target smallint not null default 2;
alter table member_profiles add column if not exists streak_nudges boolean not null default true;
alter table member_profiles drop constraint if exists member_profiles_streak_target_check;
alter table member_profiles add constraint member_profiles_streak_target_check check (streak_target between 2 and 5);

-- ---- 2. weeks a member was frozen ------------------------------------------------------
-- A freeze lasts from its event to the next unfreeze or cancel; one still open
-- lasts until now while a membership is frozen (otherwise it ended that day).
create or replace function member_frozen_weeks(p_member uuid, p_gym uuid)
returns setof date language sql stable security definer set search_path = public as $$
  with ev as (
    select e.kind, e.created_at,
           lead(e.created_at) over (order by e.created_at) as next_at
      from membership_events e
     where e.member_id = p_member and e.gym_id = p_gym
  ),
  spans as (
    select (created_at at time zone 'Asia/Manila')::date as d_from,
           (coalesce(next_at,
                     case when exists (select 1 from memberships m
                                        where m.member_id = p_member and m.gym_id = p_gym and m.status = 'frozen')
                          then now() else created_at end) at time zone 'Asia/Manila')::date as d_to
      from ev where kind = 'freeze'
  )
  select distinct date_trunc('week', g)::date
    from spans, generate_series(d_from, d_to, interval '1 day') g;
$$;

-- ---- 3. the streak, counted one way ----------------------------------------------------
create or replace function streak_weeks(p_member uuid, p_gym uuid)
returns table (current_run int, best_run int, target int)
language plpgsql stable security definer set search_path = public as $$
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
       where l.member_id = p_member and l.gym_id = p_gym
    ) days group by 1 having count(*) >= v_target
  ) h;
  select coalesce(array_agg(f), '{}') into v_frozen from member_frozen_weeks(p_member, p_gym) f;

  select min(wk) into v_first from unnest(v_hits) wk;
  if v_first is null then
    return query select 0, 0, v_target;
    return;
  end if;

  -- Best: oldest to newest. A frozen week is skipped; this week cannot break it.
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

  -- Current: newest to oldest, starting last week when this one is not reached yet.
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
$$;

-- ---- 4. member_training_stats reads it (0102's body, two lines changed) ----------------
create or replace function member_training_stats(uid uuid)
returns table (
  training_days        int,
  verified_days        int,
  logged_days          int,
  consistent_weeks     int,
  current_week_streak  int,
  best_week_streak     int,
  weekend_days         int,
  early_checkins       int,
  late_checkins        int,
  distinct_activities  int,
  goals_achieved       int,
  measurements         int,
  classes_attended     int,
  pt_sessions_done     int,
  member_since         date
)
language sql
stable
security definer
set search_path = public
as $$
  with
  gym as (select acting_gym_id() as id),
  -- Every training day from both sources, tagged with where it came from.
  raw as (
    select (a.check_in_time at time zone 'Asia/Manila')::date as d, true as verified
    from attendance a, gym
    where a.member_id = uid and a.gym_id = gym.id
    union all
    select w.performed_on, false
    from workout_logs w, gym
    where w.member_id = uid and w.gym_id = gym.id
  ),
  by_day as (
    select d, bool_or(verified) as verified
    from raw
    group by d
  ),
  -- A week is "consistent" at two or more training days (0028) — for levels.
  weeks as (
    select date_trunc('week', d)::date as wk, count(*) as n
    from by_day
    group by 1
  ),
  consistent as (
    select wk from weeks where n >= 2
  ),
  -- The streak: the member's own target, frozen weeks skipped (0151).
  sw as (
    select s.current_run, s.best_run from gym, streak_weeks(uid, gym.id) s
  ),
  activities as (
    select distinct lower(trim(act)) as act from (
      select a.activity as act from attendance a, gym
       where a.member_id = uid and a.gym_id = gym.id and a.activity is not null
      union all
      select w.activity from workout_logs w, gym
       where w.member_id = uid and w.gym_id = gym.id and w.activity is not null
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
    -- Attended, not booked: the class has to have actually happened.
    (select count(*) from bookings b
       join classes c on c.id = b.class_id, gym
      where b.member_id = uid and b.gym_id = gym.id
        and b.status = 'approved' and c.scheduled_at < now())::int,
    (select count(*) from pt_sessions p, gym
      where p.member_id = uid and p.gym_id = gym.id
        and p.status = 'approved' and p.starts_at < now())::int,
    (select mp.created_at::date from member_profiles mp, gym
      where mp.profile_id = uid and mp.gym_id = gym.id);
$$;

-- ---- 5. one member's streak, as every screen shows it ----------------------------------
create or replace function streak_card(p_member uuid, p_gym uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
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
begin
  select * into s from streak_weeks(p_member, p_gym);
  v_days := training_days_between(p_member, p_gym, v_week, v_week + 6);
  v_left := (v_week + 6) - v_today + 1;                       -- today included
  v_frozen := exists (select 1 from memberships m where m.member_id = p_member and m.gym_id = p_gym and m.status = 'frozen');
  -- Monday to Sunday: was it a training day?
  select jsonb_agg(
           exists (select 1 from attendance a where a.member_id = p_member and a.gym_id = p_gym
                      and (a.check_in_time at time zone 'Asia/Manila')::date = g.d::date)
           or exists (select 1 from workout_logs l where l.member_id = p_member and l.gym_id = p_gym
                         and l.performed_on = g.d::date)
           order by g.d)
    into v_dots from generate_series(v_week::timestamp, (v_week + 6)::timestamp, interval '1 day') g(d);
  select min(m) into v_next from unnest(array[4, 12, 26, 52]) m where m > s.best_run;
  select streak_nudges into v_nudges from member_profiles where gym_id = p_gym and profile_id = p_member;
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
    -- At risk: a streak to lose, and exactly as many days left as it still needs —
    -- every remaining day counts. More needed than left is already out of reach,
    -- and a nudge then would promise something that can no longer happen.
    'at_risk', s.current_run > 0 and not v_frozen and s.target - v_days > 0 and s.target - v_days = v_left,
    -- Out of reach this week: more days needed than remain.
    'out_of_reach', not v_frozen and s.target - v_days > v_left,
    'next_milestone', v_next,
    'nudges', coalesce(v_nudges, true));
end;
$$;

-- The member's own card. NULL when Progress is switched off at this gym (0141).
create or replace function my_streak() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_gym uuid := current_gym_id();
begin
  if auth.uid() is null or v_gym is null then return null; end if;
  if not exists (select 1 from member_profiles where gym_id = v_gym and profile_id = auth.uid()) then return null; end if;
  if not gym_module_on(v_gym, 'progress') then return null; end if;
  return streak_card(auth.uid(), v_gym);
end;
$$;

-- For the desk and the member's own coaches — the same card, never another gym's.
create or replace function member_streak(p_member uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_gym uuid := current_gym_id();
begin
  if not (p_member = auth.uid()
          or coalesce(storage_role_here() in ('admin', 'staff'), false)
          or (storage_role_here() = 'trainer' and is_my_trainee(p_member))) then
    raise exception 'That is not yours to see.' using errcode = '42501';
  end if;
  if not exists (select 1 from member_profiles where gym_id = v_gym and profile_id = p_member) then return null; end if;
  return streak_card(p_member, v_gym);
end;
$$;

-- The member sets their own target and whether they want the nudge.
create or replace function set_streak_target(p_target int, p_nudges boolean default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id();
begin
  if auth.uid() is null or v_gym is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if p_target is null or p_target not between 2 and 5 then
    raise exception 'A weekly target is 2 to 5 days.';
  end if;
  if not gym_writable() then raise exception 'This gym is read-only at the moment.' using errcode = '42501'; end if;
  update member_profiles
     set streak_target = p_target,
         streak_nudges = coalesce(p_nudges, streak_nudges)
   where gym_id = v_gym and profile_id = auth.uid();
  if not found then raise exception 'You are not a member here.' using errcode = '42501'; end if;
end;
$$;

-- ---- 6. milestones that pay, once each ---------------------------------------------------
insert into point_rules (gym_id, key, label, points, sort_order)
select g.id, 'streak_milestone', 'Reached a streak milestone (4, 12, 26 or 52 weeks)', 50, 10 from gyms g
on conflict (gym_id, key) do nothing;

create table if not exists streak_milestones (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null default acting_gym_id() references gyms(id),
  member_id  uuid not null references profiles(id) on delete cascade,
  weeks      int not null check (weeks in (4, 12, 26, 52)),
  reached_at timestamptz not null default now(),
  unique (gym_id, member_id, weeks)
);
alter table streak_milestones enable row level security;
revoke all on streak_milestones from anon;
grant select on streak_milestones to authenticated;
drop policy if exists streak_milestones_read on streak_milestones;
create policy streak_milestones_read on streak_milestones for select to authenticated
  using (member_id = auth.uid()
         or coalesce(storage_role_here() in ('admin', 'staff'), false)
         or (storage_role_here() = 'trainer' and is_my_trainee(member_id)));
-- No insert/update/delete policy, for any role: settle_my_streak() is the writer.
drop policy if exists tenant_select on streak_milestones;
create policy tenant_select on streak_milestones as restrictive for select to anon, authenticated
  using (gym_id = current_gym_id());

-- Records every milestone the member's best run has reached and pays each once.
-- Returns the milestones newly reached by this call (for a celebration on screen).
create or replace function settle_my_streak() returns int[]
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_best int; m int; v_id uuid; v_new int[] := '{}';
begin
  if auth.uid() is null or v_gym is null then return v_new; end if;
  if not exists (select 1 from member_profiles where gym_id = v_gym and profile_id = auth.uid()) then return v_new; end if;
  if not gym_module_on(v_gym, 'progress') or not gym_writable() then return v_new; end if;
  perform act_as_gym(v_gym);
  select best_run into v_best from streak_weeks(auth.uid(), v_gym);
  foreach m in array array[4, 12, 26, 52] loop
    continue when v_best < m;
    insert into streak_milestones (gym_id, member_id, weeks) values (v_gym, auth.uid(), m)
    on conflict (gym_id, member_id, weeks) do nothing
    returning id into v_id;
    continue when v_id is null;
    perform award_points(auth.uid(), 'streak_milestone', 'streak_milestones', v_id);
    v_new := v_new || m;
    v_id := null;
  end loop;
  return v_new;
end;
$$;

-- Two more badges, after 0038's 4 and 12, read from the same metric.
insert into achievements
  (gym_id, key, audience, title, description, requirement, icon, tier, category, rule_kind, metric, threshold, builtin, sort_order)
select g.id, v.key, 'member', v.title, v.description, v.requirement, v.icon, v.tier, 'Consistency', 'metric', 'best_week_streak', v.threshold, true, v.sort_order
  from gyms g,
       (values ('streak_26', 'Half a Year', 'Twenty-six weeks without a break.', 'Hit your weekly target 26 weeks running.', 'Flame', 'gold', 26, 8),
               ('streak_52', 'A Whole Year', 'Fifty-two weeks. A year of showing up.', 'Hit your weekly target 52 weeks running.', 'Trophy', 'platinum', 52, 9))
         as v(key, title, description, requirement, icon, tier, threshold, sort_order)
on conflict (gym_id, key) do nothing;

-- ---- 7. the nudge before it breaks ------------------------------------------------------
-- Run when the owner's or desk's dashboard loads (and by pg_cron if set up, after
-- act_as_gym). One notification per member per week, on the first day they must
-- train every remaining day to keep a streak. Returns who was told, for the push.
create or replace function streak_nudge_sweep()
returns table (member_id uuid, title text, message text)
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid := current_gym_id();
  v_week date := manila_week_start();
  r record;
  c jsonb;
  v_title text;
  v_msg text;
begin
  if v_gym is null or coalesce(storage_role_here(), '') not in ('admin', 'staff') then return; end if;
  if not gym_module_on(v_gym, 'progress') or not gym_writable() then return; end if;
  for r in
    select mp.profile_id as id
      from member_profiles mp
      join gym_roles g on g.gym_id = mp.gym_id and g.user_id = mp.profile_id and g.role = 'member' and g.status = 'active'
     where mp.gym_id = v_gym and mp.streak_nudges
  loop
    c := streak_card(r.id, v_gym);
    continue when not (c->>'at_risk')::boolean;
    v_title := 'Keep your ' || (c->>'current') || '-week streak';
    v_msg := case when (c->>'needed')::int = 1
                  then 'One more training day this week keeps it going. Check in or log a workout today.'
                  else (c->>'needed') || ' more training days this week keep it going — that is every day left.' end;
    if notify_once(r.id, 'info', v_title, v_msg, '/member/home',
                   'streak:' || v_week || ':' || r.id, v_gym) then
      member_id := r.id; title := v_title; message := v_msg;
      return next;
    end if;
  end loop;
end;
$$;

-- ---- 8. grants, tenancy list, probe marker ---------------------------------------------
revoke all on function member_frozen_weeks(uuid, uuid), streak_weeks(uuid, uuid), streak_card(uuid, uuid)
  from public, anon, authenticated;
revoke all on function my_streak(), member_streak(uuid), set_streak_target(int, boolean),
  settle_my_streak(), streak_nudge_sweep() from public, anon;
grant execute on function my_streak(), member_streak(uuid), set_streak_target(int, boolean),
  settle_my_streak(), streak_nudge_sweep() to authenticated;

create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'ai_coach_profiles','ai_meal_guides','ai_proposals','ai_usage_days',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','conversations','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_exercise_media','gym_goals','gym_invitations','gym_modules','gym_photos','gym_plans',
    'gym_program_days','gym_programs','gym_settings','gym_waivers','gym_workout_items','gym_workouts',
    'invoice_counters','member_profiles','member_share_prefs','membership_events',
    'membership_plans','membership_requests','memberships','messages',
    'notifications','payments','pending_registrations','personal_records','plan_features',
    'point_ledger','point_rules','program_enrolments','progress_photos',
    'pt_sessions','referral_codes','referrals','refund_rules','renewal_requests',
    'reward_redemptions','rewards','room_assignments','room_comments','room_members','room_posts',
    'room_submissions','rooms',
    'saved_resources','season_claims','season_tiers','shop_products','shop_sale_items','shop_sales',
    'squad_members','squad_weeks','squads','stock_moves','streak_milestones',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_profiles',
    'trainer_ratings','waiver_acceptances','winback_rules','winback_sends','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routines','workout_sets']::text[]
$$;

create or replace function migration_0151_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0151_applied() from public, anon;
grant execute on function migration_0151_applied() to authenticated;
comment on function migration_0151_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0151.sql
