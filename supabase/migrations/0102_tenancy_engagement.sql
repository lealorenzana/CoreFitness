-- 0102 — Points, badges, levels, challenges, goals and rewards are per gym.
--
-- A member of two gyms has two point balances, two badge shelves and two
-- levels: each gym runs its own rules (point_rules, achievements, goal
-- templates, rewards — seeded from Gym #1's by seed_gym_defaults) and counts
-- only what happened there. Each function is its last definition, changed
-- only where it touches another gym:
--   * a trigger first sets the acting gym to its row's gym, so everything it
--     calls (plan_allows, balances, the notifications it files) resolves there;
--   * a member-keyed reader filters by the acting gym;
--   * an id from another gym reads as not found; sweeps run gym by gym.
-- The two keys 0098 kept for this group's ON CONFLICT clauses are dropped at the end.
--
-- Plan: docs/superpowers/plans/2026-09-20-saas-part-a-tenancy.md (Task 7)

-- ---- points ---------------------------------------------------------------------------

create or replace function award_points(
  p_member uuid, p_rule text, p_source_table text, p_source_id uuid
) returns void language plpgsql security definer set search_path = public as $fn$
declare
  v_gym    uuid := acting_gym_id();
  v_points int;
begin
  -- Earning is a plan feature (0049). Checked here rather than at each call
  -- site so a new rule cannot forget it.
  if not plan_allows(p_member, 'points_earn') then
    return;
  end if;

  select points into v_points from point_rules where gym_id = v_gym and key = p_rule and is_active;
  if v_points is null then
    return;                       -- rule switched off by the gym, or unknown
  end if;

  insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
  values (v_gym, p_member, p_rule, v_points, p_source_table, p_source_id)
  -- The idempotency guarantee, made explicit. A second award for the same
  -- source is not an error to handle, it is a no-op by design.
  on conflict (gym_id, member_id, rule_key, source_table, source_id) do nothing;
end;
$fn$;

create or replace function trg_points_checkin() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  perform act_as_gym(new.gym_id);
  perform award_points(new.member_id, 'checkin', 'attendance', new.id);
  return null;
end;
$fn$;

create or replace function trg_points_workout() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  -- Only on the transition. An UPDATE that touches notes on an already
  -- completed session must not look like a second workout.
  if new.completed_at is not null and old.completed_at is null then
    perform act_as_gym(new.gym_id);
    perform award_points(new.member_id, 'workout_logged', 'workout_logs', new.id);
  end if;
  return null;
end;
$fn$;

create or replace function trg_points_goal() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.achieved_on is not null and old.achieved_on is null
     and (new.template_key is not null
          or new.metric in ('weight_kg', 'body_fat_pct', 'waist_cm', 'lift_kg')) then
    perform act_as_gym(new.gym_id);
    perform award_points(new.member_id, 'goal_achieved', 'fitness_goals', new.id);
  end if;
  return null;
end;
$fn$;

-- The nightly sweep: every gym for pg_cron, the caller's gym for a signed-in caller.
create or replace function award_due_session_points() returns int
language plpgsql security definer set search_path = public as $fn$
declare
  n int := 0;
  r record;
  v_only uuid := case when auth.uid() is not null then current_gym_id() end;
begin
  -- "Attended" exactly as 0028 defines it, so the badge and the points can
  -- never disagree about whether a session happened.
  for r in
    select b.gym_id, b.member_id, b.id
      from bookings b
      join classes c on c.id = b.class_id
     where b.status = 'approved' and c.scheduled_at < now()
       and (v_only is null or b.gym_id = v_only)
     order by b.gym_id
  loop
    perform act_as_gym(r.gym_id);
    perform award_points(r.member_id, 'class_attended', 'bookings', r.id);
    n := n + 1;
  end loop;

  for r in
    select p.gym_id, p.member_id, p.id
      from pt_sessions p
     where p.status = 'approved' and p.starts_at < now()
       and (v_only is null or p.gym_id = v_only)
     order by p.gym_id
  loop
    perform act_as_gym(r.gym_id);
    perform award_points(r.member_id, 'pt_session', 'pt_sessions', r.id);
    n := n + 1;
  end loop;

  perform act_as_gym(null);
  return n;
end;
$fn$;

create or replace function member_points_balance(p_member uuid)
returns int language sql stable security definer set search_path = public as $fn$
  select coalesce((select sum(points) from point_ledger
                    where member_id = p_member and gym_id = acting_gym_id()), 0)
       - coalesce((select sum(cost_points) from reward_redemptions
                    where member_id = p_member and gym_id = acting_gym_id()
                      and status in ('pending','approved','fulfilled')), 0);
$fn$;

-- ---- rewards ---------------------------------------------------------------------------

create or replace function reward_wishlist_counts()
returns table (reward_id uuid, members int)
language sql stable security definer set search_path = public as $fn$
  select mp.saving_for_reward, count(*)::int
    from member_profiles mp
    join gym_roles r on r.user_id = mp.profile_id and r.gym_id = mp.gym_id and r.status = 'active'
   where mp.saving_for_reward is not null
     and mp.gym_id = current_gym_id()
     and get_my_role() in ('admin', 'staff')
   group by mp.saving_for_reward
$fn$;

create or replace function decide_redemption(p_id uuid, p_status text, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $fn$
declare r record;
begin
  if auth.uid() is not null and get_my_role() is distinct from 'admin' then
    raise exception 'Only an admin can approve or decline a reward.';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'A decision is approved or rejected.';
  end if;
  if p_status = 'rejected' and coalesce(btrim(p_note), '') = '' then
    raise exception 'Say why — the member reads it.';
  end if;

  update reward_redemptions
     set status = p_status, decided_by = auth.uid(), decided_at = now(),
         decision_note = nullif(btrim(p_note), '')
   where id = p_id and status = 'pending' and in_my_gym(gym_id)
  returning gym_id, member_id, reward_id into r;
  if r.member_id is null then
    raise exception 'That request has already been decided.';
  end if;

  perform act_as_gym(r.gym_id);
  perform notify_once(r.member_id, 'system',
    case when p_status = 'approved' then 'Reward approved' else 'Reward request declined' end,
    case when p_status = 'approved'
      then (select name from rewards where id = r.reward_id) || ' is ready — collect it at the front desk.'
      else (select name from rewards where id = r.reward_id) || ': ' || btrim(p_note) || ' Your points were not spent.'
    end,
    '/member/rewards', 'redemption:' || p_id || ':' || p_status);
end;
$fn$;

create or replace function mark_redemption_collected(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $fn$
declare r record;
begin
  if auth.uid() is not null and not is_front_desk() then
    raise exception 'Only the front desk can hand a reward over.';
  end if;
  update reward_redemptions
     set status = 'fulfilled', fulfilled_at = now(), fulfilled_by = auth.uid()
   where id = p_id and status = 'approved' and in_my_gym(gym_id)
  returning gym_id, member_id, reward_id into r;
  if r.member_id is null then
    raise exception 'Only an approved reward can be handed over.';
  end if;
  perform act_as_gym(r.gym_id);
  perform notify_once(r.member_id, 'system', 'Reward collected',
    (select name from rewards where id = r.reward_id) || ' — enjoy it.',
    '/member/rewards', 'redemption:' || p_id || ':collected');
end;
$fn$;

create or replace function trg_validate_redemption() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  r record;
begin
  perform act_as_gym(new.gym_id);
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

  -- The price is the gym's, not the client's. Overwritten rather than
  -- validated, so a crafted request cannot buy a reward for one point.
  new.cost_points := r.cost_points;

  if member_points_balance(new.member_id) < r.cost_points then
    raise exception 'You do not have enough points for that yet.';
  end if;

  return new;
end;
$fn$;

create or replace function trg_notify_reward_reachable() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  bal int;
  r record;
begin
  perform act_as_gym(new.gym_id);
  bal := member_points_balance(new.member_id);

  -- The most expensive reward of this gym now affordable. One message, not one per reward.
  select id, name, cost_points into r
    from rewards
   where gym_id = new.gym_id
     and is_active and (stock is null or stock > 0) and cost_points <= bal
   order by cost_points desc
   limit 1;

  if r.id is not null then
    perform notify_once(
      new.member_id, 'success', 'You can claim a reward',
      'You have ' || bal || ' CORE Points — enough for ' || r.name || '.',
      '/member/rewards',
      'reward:' || r.id::text
    );
  end if;
  return null;
end;
$fn$;

-- ---- badges ----------------------------------------------------------------------------

create or replace function award_achievement(p_user uuid, p_key text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_gym uuid := current_gym_id();
  a record;
  target_role text;
begin
  -- IS DISTINCT FROM, not <>. A caller with no profile row has a NULL role and
  -- must be rejected, not waved through.
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only an admin can award an achievement' using errcode = 'insufficient_privilege';
  end if;

  select * into a from achievements where gym_id = v_gym and key = p_key;
  if not found then
    raise exception 'No such achievement: %', p_key;
  end if;

  select role::text into target_role from gym_roles where user_id = p_user and gym_id = v_gym;
  if target_role is null then
    raise exception 'No such account';
  end if;
  if target_role is distinct from a.audience then
    raise exception 'That achievement belongs to the % catalogue, but this account is a %',
      a.audience, target_role;
  end if;

  insert into achievement_unlocks (gym_id, user_id, achievement_key)
  values (v_gym, p_user, p_key)
  on conflict (gym_id, user_id, achievement_key) do nothing;
end;
$$;

create or replace function revoke_achievement(p_user uuid, p_key text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if get_my_role() is distinct from 'admin' then
    raise exception 'Only an admin can revoke an achievement' using errcode = 'insufficient_privilege';
  end if;
  delete from achievement_unlocks
   where user_id = p_user and achievement_key = p_key and gym_id = current_gym_id();
end;
$$;

create or replace function guard_achievement_delete() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  select count(*) into n from achievement_unlocks u
   where u.gym_id = old.gym_id and u.achievement_key = old.key;
  if n > 0 then
    raise exception
      'Cannot delete "%": % member(s) have already earned it. Retire it instead so their badge still shows.',
      old.key, n
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

-- A member's record in the acting gym. Every count below is that gym's.
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
  -- A week is "consistent" at two or more training days (0028).
  weeks as (
    select date_trunc('week', d)::date as wk, count(*) as n
    from by_day
    group by 1
  ),
  consistent as (
    select wk from weeks where n >= 2
  ),
  -- Longest unbroken run of consistent weeks, ever (gaps-and-islands, 0028).
  islands as (
    select wk - ((row_number() over (order by wk))::int * 7) as grp
    from consistent
  ),
  best as (
    select coalesce(max(cnt), 0) as run from (
      select count(*) as cnt from islands group by grp
    ) t
  ),
  -- Current run, anchored on this week or last (0028).
  anchor as (
    select max(wk) as wk
    from consistent
    where wk <= date_trunc('week', (now() at time zone 'Asia/Manila')::date)::date
      and wk >= date_trunc('week', (now() at time zone 'Asia/Manila')::date)::date - 7
  ),
  backwards as (
    select c.wk, (row_number() over (order by c.wk desc))::int as rn
    from consistent c, anchor
    where anchor.wk is not null and c.wk <= anchor.wk
  ),
  current_run as (
    select count(*) as run
    from backwards, anchor
    where backwards.wk = anchor.wk - ((backwards.rn - 1) * 7)
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
    (select run from current_run)::int,
    (select run from best)::int,
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

create or replace function member_progression(uid uuid default auth.uid())
returns table (
  level               text,
  computed_level      text,
  training_days       int,
  verified_days       int,
  logged_days         int,
  consistent_weeks    int,
  current_week_streak int,
  best_week_streak    int,
  next_level          text,
  next_days           int,
  next_weeks          int,
  member_since        date
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s record;
  computed text := 'beginner';
  held text := 'beginner';
  nxt text;
  nd int;
  nw int;
  d int;
  w int;
begin
  -- A member reads their own; the people who coach and serve them in this gym
  -- can read it too. SECURITY DEFINER bypasses RLS, so the check is here.
  if uid is null or (uid <> auth.uid() and get_my_role() not in ('admin', 'staff', 'trainer')) then
    raise exception 'Not allowed to read this member''s progression';
  end if;

  select * into s from member_training_stats(uid);

  select days, weeks into d, w from level_thresholds('intermediate');
  if s.training_days >= d and s.consistent_weeks >= w then computed := 'intermediate'; end if;

  select days, weeks into d, w from level_thresholds('advanced');
  if s.training_days >= d and s.consistent_weeks >= w then computed := 'advanced'; end if;

  -- The ratchet: a level reached in this gym stays reached.
  if exists (select 1 from achievement_unlocks a
              where a.user_id = uid and a.gym_id = acting_gym_id() and a.achievement_key = 'level_advanced') then
    held := 'advanced';
  elsif exists (select 1 from achievement_unlocks a
                 where a.user_id = uid and a.gym_id = acting_gym_id() and a.achievement_key = 'level_intermediate') then
    held := 'intermediate';
  end if;

  if computed = 'advanced' or held = 'advanced' then
    held := 'advanced';
    nxt := null;
  elsif computed = 'intermediate' or held = 'intermediate' then
    held := 'intermediate';
    nxt := 'advanced';
  else
    held := 'beginner';
    nxt := 'intermediate';
  end if;

  if nxt is not null then
    select days, weeks into nd, nw from level_thresholds(nxt);
  end if;

  return query select
    held, computed,
    s.training_days, s.verified_days, s.logged_days,
    s.consistent_weeks, s.current_week_streak, s.best_week_streak,
    nxt, nd, nw, s.member_since;
end;
$$;

create or replace function sync_my_achievements()
returns setof text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_gym      uuid := current_gym_id();
  role_name  text;
  earned     text[] := '{}';
  s          record;
  t          record;
  stats      jsonb;
  a          record;
  lvl_days   int;
  lvl_weeks  int;
begin
  if uid is null or v_gym is null then
    return;
  end if;

  select r.role::text into role_name from gym_roles r where r.user_id = uid and r.gym_id = v_gym;

  if role_name = 'member' then
    select * into s from member_training_stats(uid);
    -- `member_since` is a date and cannot meet a numeric threshold (0038).
    stats := row_to_json(s)::jsonb - 'member_since' || jsonb_build_object(
      'days_as_member',
      case when s.member_since is null then 0 else (current_date - s.member_since) end);

    -- The two level rules a metric+threshold cannot express (0038).
    select days, weeks into lvl_days, lvl_weeks from level_thresholds('intermediate');
    if s.training_days >= lvl_days and s.consistent_weeks >= lvl_weeks then
      earned := earned || 'level_intermediate'::text;
    end if;
    select days, weeks into lvl_days, lvl_weeks from level_thresholds('advanced');
    if s.training_days >= lvl_days and s.consistent_weeks >= lvl_weeks then
      earned := earned || 'level_advanced'::text;
    end if;

  elsif role_name = 'trainer' then
    select * into t from trainer_stats(uid);
    stats := row_to_json(t)::jsonb;
  else
    -- Admin and staff have no achievement set.
    return;
  end if;

  -- One pass over this gym's active metric rules for this audience.
  for a in
    select ac.key, ac.metric, ac.threshold, ac.metric2, ac.threshold2
      from achievements ac
     where ac.gym_id = v_gym
       and ac.audience = role_name
       and ac.active
       and ac.rule_kind = 'metric'
  loop
    if jsonb_metric_value(stats, a.metric) >= a.threshold
       and (a.metric2 is null
            or jsonb_metric_value(stats, a.metric2) >= a.threshold2) then
      earned := earned || a.key;
    end if;
  end loop;

  -- Only keys this gym's catalogue has (the level keys may be retired here).
  return query
  with ins as (
    insert into achievement_unlocks (gym_id, user_id, achievement_key)
    select v_gym, uid, k from unnest(earned) as k
     where exists (select 1 from achievements x where x.gym_id = v_gym and x.key = k)
    on conflict (gym_id, user_id, achievement_key) do nothing
    returning achievement_key
  )
  select ins.achievement_key from ins;
end;
$$;

create or replace function achievement_progress(p_user uuid default null)
returns table (achievement_key text, value numeric, threshold numeric, value2 numeric, threshold2 numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  me        uuid := auth.uid();
  v_gym     uuid := current_gym_id();
  target    uuid := coalesce(p_user, auth.uid());
  role_name text;
  s         record;
  t         record;
  stats     jsonb;
  d         int;
  w         int;
begin
  if me is null or target is null or v_gym is null then
    return;
  end if;
  -- NULL-safe on purpose (DATA_ACCESS).
  if target is distinct from me
     and not (coalesce(get_my_role()::text, '') in ('admin', 'staff') or is_my_trainee(target, me)) then
    raise exception 'You can only see achievement progress for yourself or the members you train'
      using errcode = '42501';
  end if;

  -- Their role in this gym; someone not in it has no progress here.
  select r.role::text into role_name from gym_roles r where r.user_id = target and r.gym_id = v_gym;

  if role_name = 'member' then
    select * into s from member_training_stats(target);
    stats := row_to_json(s)::jsonb - 'member_since' || jsonb_build_object(
      'days_as_member',
      case when s.member_since is null then 0 else (current_date - s.member_since) end);

    select lt.days, lt.weeks into d, w from level_thresholds('intermediate') lt;
    achievement_key := 'level_intermediate'; value := s.training_days; threshold := d;
    value2 := s.consistent_weeks; threshold2 := w;
    return next;
    select lt.days, lt.weeks into d, w from level_thresholds('advanced') lt;
    achievement_key := 'level_advanced'; value := s.training_days; threshold := d;
    value2 := s.consistent_weeks; threshold2 := w;
    return next;
  elsif role_name = 'trainer' then
    select * into t from trainer_stats(target);
    stats := row_to_json(t)::jsonb;
  else
    return;
  end if;

  return query
  select ac.key,
         jsonb_metric_value(stats, ac.metric),
         ac.threshold::numeric,
         case when ac.metric2 is null then null else jsonb_metric_value(stats, ac.metric2) end,
         ac.threshold2::numeric
    from achievements ac
   where ac.gym_id = v_gym
     and ac.audience = role_name
     and ac.active
     and ac.rule_kind = 'metric';
end;
$$;

-- How rare a badge is among this gym's active members or coaches.
create or replace function achievement_rarity()
returns table (achievement_key text, holders int, audience_size int)
language sql stable security definer set search_path = public as $$
  with pop as (
    select r.role::text as r, count(*)::int as n
      from gym_roles r
     where r.gym_id = current_gym_id() and r.status = 'active' and r.role::text in ('member', 'trainer')
     group by r.role
  ), held as (
    select u.achievement_key as k, count(*)::int as n
      from achievement_unlocks u
      join gym_roles r on r.user_id = u.user_id and r.gym_id = u.gym_id and r.status = 'active'
     where u.gym_id = current_gym_id()
     group by u.achievement_key
  )
  select a.key, coalesce(held.n, 0), coalesce(pop.n, 0)
    from achievements a
    left join held on held.k = a.key
    left join pop on pop.r = a.audience
   where a.gym_id = current_gym_id()
     and a.active
     and auth.uid() is not null;
$$;

create or replace function log_achievement_activity() returns trigger
language plpgsql security definer set search_path = public as $body$
declare
  v_title text;
  v_who   text;
begin
  if tg_op = 'INSERT' then
    select title into v_title from achievements where gym_id = new.gym_id and key = new.achievement_key;
    v_who := coalesce(activity_member_name(new.user_id), 'someone');
    -- Only a hand-award has an actor; the self-sync runs as the member
    -- themselves, and logging those would bury the log in badges.
    if auth.uid() is not null and auth.uid() <> new.user_id then
      perform log_activity('achievement.awarded', 'achievement', null, new.user_id,
        'Awarded "' || coalesce(v_title, new.achievement_key) || '" to ' || v_who,
        jsonb_build_object('achievement_key', new.achievement_key), new.gym_id);
    end if;
    return new;
  end if;

  select title into v_title from achievements where gym_id = old.gym_id and key = old.achievement_key;
  perform log_activity('achievement.revoked', 'achievement', null, old.user_id,
    'Removed "' || coalesce(v_title, old.achievement_key) || '" from '
      || coalesce(activity_member_name(old.user_id), 'someone'),
    jsonb_build_object('achievement_key', old.achievement_key), old.gym_id);
  return old;
end;
$body$;

-- ---- challenges -------------------------------------------------------------------------

create or replace function challenge_progress(p_challenge uuid, p_member uuid)
returns int
language plpgsql stable security definer set search_path = public as $fn$
declare
  c record;
  n int := 0;
begin
  -- This gym's challenge only (system callers — the settle sweep — see all).
  select * into c from challenges where id = p_challenge and in_my_gym(gym_id);
  if c is null then
    return 0;
  end if;

  -- Only the member themselves, or the gym, may read a progress figure (0094).
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
     where w.member_id = p_member and w.gym_id = c.gym_id
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
       where w.member_id = p_member and w.gym_id = c.gym_id and w.activity is not null
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
    -- `measured_on`, not `created_at`: the day it was measured (0020).
    when 'measurements'        then (select count(*) from body_measurements m
                                      where m.member_id = p_member and m.gym_id = c.gym_id
                                        and m.measured_on between c.starts_on and c.ends_on)
    -- "Attended", exactly as 0028 means it: approved, and the time has passed.
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
$fn$;

create or replace function challenge_standings(p_challenge uuid)
returns table (member_id uuid, first_name text, last_name text, joined_at timestamptz,
               completed_on date, progress int, target int)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(get_my_role()::text, '') not in ('admin', 'staff') then
    raise exception 'Only the gym can see challenge standings' using errcode = '42501';
  end if;
  return query
  select cp.member_id, p.first_name::text, p.last_name::text, cp.joined_at, cp.completed_on,
         challenge_progress(cp.challenge_id, cp.member_id), c.target::int
    from challenge_participants cp
    join challenges c on c.id = cp.challenge_id
    join profiles p on p.id = cp.member_id
   where cp.challenge_id = p_challenge
     and c.gym_id = current_gym_id()
   order by cp.completed_on nulls last, challenge_progress(cp.challenge_id, cp.member_id) desc, cp.joined_at;
end;
$$;

create or replace function settle_challenges() returns int
language plpgsql security definer set search_path = public as $fn$
declare
  r record;
  n int := 0;
  v_only uuid := case when auth.uid() is not null then current_gym_id() end;
begin
  for r in
    select c.gym_id, p.challenge_id, p.member_id, c.target, c.reward_points
      from challenge_participants p
      join challenges c on c.id = p.challenge_id
     where p.completed_on is null
       and c.is_active
       and (v_only is null or c.gym_id = v_only)
       -- Still running, or finished within the last week: a challenge that
       -- ended on Sunday must still settle on Monday.
       and c.starts_on <= (now() at time zone 'Asia/Manila')::date
       and c.ends_on >= (now() at time zone 'Asia/Manila')::date - 7
     order by c.gym_id
  loop
    perform act_as_gym(r.gym_id);
    if challenge_progress(r.challenge_id, r.member_id) >= r.target then
      update challenge_participants
         set completed_on = (now() at time zone 'Asia/Manila')::date
       where challenge_id = r.challenge_id and member_id = r.member_id;

      if r.reward_points > 0 then
        -- The challenge's own value, in the challenge's gym, through the same
        -- entitlement check and idempotency key every other rule uses (0052).
        insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
        select r.gym_id, r.member_id, 'challenge_complete', r.reward_points,
               'challenge_participants', r.challenge_id
        where plan_allows(r.member_id, 'points_earn')
        on conflict (gym_id, member_id, rule_key, source_table, source_id) do nothing;
      end if;

      n := n + 1;
    end if;
  end loop;
  perform act_as_gym(null);
  return n;
end;
$fn$;

-- ---- goals --------------------------------------------------------------------------------

create or replace function goal_current_value(p_goal uuid)
returns numeric
language plpgsql stable security definer set search_path = public as $fn$
declare
  g record;
begin
  select member_id into g from fitness_goals where id = p_goal and in_my_gym(gym_id);
  if g is null then return null; end if;
  if g.member_id is distinct from auth.uid()
     and not trainer_may_see(g.member_id, 'goals') then
    return null;
  end if;
  return goal_value_of(p_goal);
end;
$fn$;

-- 0087's body; a signed-in caller asks only about a goal of their current gym.
create or replace function goal_is_reached(p_goal uuid)
returns boolean
language plpgsql stable security definer set search_path = public as $fn$
declare
  g record;
  v numeric;
  going_down boolean;
begin
  select * into g from fitness_goals where id = p_goal and in_my_gym(gym_id);
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

create or replace function goal_progress(p_goal uuid)
returns int
language plpgsql stable security definer set search_path = public as $fn$
declare
  g record;
begin
  select * into g from fitness_goals where id = p_goal and in_my_gym(gym_id);
  if g is null or g.template_key is null then return 0; end if;
  if g.member_id is distinct from auth.uid()
     and not trainer_may_see(g.member_id, 'goals') then
    return 0;
  end if;
  return goal_template_count(g.member_id, g.template_key, g.gym_id);
end;
$fn$;

drop function if exists goal_template_count(uuid, text);
create function goal_template_count(p_member uuid, p_template text, p_gym uuid default null)
returns int
language plpgsql stable security definer set search_path = public as $fn$
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
       where w.member_id = p_member and w.gym_id = v_gym and w.performed_on >= since
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
           where w.member_id = p_member and w.gym_id = v_gym and w.performed_on >= since
        ) days
       group by 1
      having count(*) >= 2
    ) weeks;
  elsif t.metric = 'heavy_sets' then
    select count(*) into n
      from workout_sets s
      join workout_logs l on l.id = s.log_id
     where l.member_id = p_member and l.gym_id = v_gym
       and l.performed_on >= since
       and s.weight_kg is not null
       and s.exercise_id is not null
       and s.weight_kg >= 0.8 * (
             select max(s2.weight_kg)
               from workout_sets s2
               join workout_logs l2 on l2.id = s2.log_id
              where l2.member_id = p_member and l2.gym_id = v_gym
                and s2.exercise_id = s.exercise_id
           );
  elsif t.metric = 'cardio_minutes' then
    select coalesce(sum(s.duration_seconds) / 60, 0) into n
      from workout_sets s
      join workout_logs l on l.id = s.log_id
      join exercises e on e.id = s.exercise_id
     where l.member_id = p_member and l.gym_id = v_gym
       and l.performed_on >= since
       and e.muscle_group = 'cardio'
       and s.duration_seconds is not null;
  end if;
  return coalesce(n, 0);
end;
$fn$;

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
    return goal_template_count(g.member_id, g.template_key, g.gym_id);
  end if;

  -- The latest reading in this goal's gym that actually has this number: a
  -- later reading with only a chest measurement must not blank a weight goal.
  if g.metric in ('weight_kg', 'body_fat_pct', 'waist_cm') then
    select case g.metric
             when 'weight_kg' then m.weight_kg
             when 'body_fat_pct' then m.body_fat_pct
             else m.waist_cm
           end
      into v
      from body_measurements m
     where m.member_id = g.member_id
       and m.gym_id = g.gym_id
       and case g.metric
             when 'weight_kg' then m.weight_kg
             when 'body_fat_pct' then m.body_fat_pct
             else m.waist_cm
           end is not null
     order by m.measured_on desc, m.created_at desc
     limit 1;
    return v;
  end if;

  -- The heaviest set ever finished for the exercise, in this gym.
  if g.metric = 'lift_kg' and g.exercise_id is not null then
    select max(s.weight_kg) into v
      from workout_sets s
      join workout_logs l on l.id = s.log_id
     where l.member_id = g.member_id
       and l.gym_id = g.gym_id
       and l.completed_at is not null
       and s.exercise_id = g.exercise_id
       and s.weight_kg is not null;
    return v;
  end if;

  return null;
end;
$fn$;

-- Settled goal by goal in each goal's own gym, so the points land there.
create or replace function settle_goals_for(p_member uuid)
returns int
language plpgsql security definer set search_path = public as $fn$
declare
  g record;
  n int := 0;
  v_only uuid := case when auth.uid() is not null then current_gym_id() end;
begin
  perform set_config('app.goal_settling', 'on', true);
  for g in
    select f.id, f.gym_id
      from fitness_goals f
     where f.achieved_on is null
       and f.target_value is not null
       and (p_member is null or f.member_id = p_member)
       and (v_only is null or f.gym_id = v_only)
       and (f.template_key is not null
            or f.metric in ('weight_kg', 'body_fat_pct', 'waist_cm', 'lift_kg'))
     order by f.gym_id
  loop
    perform act_as_gym(g.gym_id);
    if goal_is_reached(g.id) then
      update fitness_goals
         set achieved_on = (now() at time zone 'Asia/Manila')::date
       where id = g.id;
      n := n + 1;
    end if;
  end loop;
  perform set_config('app.goal_settling', 'off', true);
  perform act_as_gym(null);
  return n;
end;
$fn$;

-- ---- workouts and the library ---------------------------------------------------------------

create or replace function member_exercise_history(p_member uuid, p_exercise uuid)
returns table (performed_on date, top_weight_kg numeric, top_reps int)
language sql stable security definer set search_path = public as $fn$
  select l.performed_on,
         max(s.weight_kg),
         (array_agg(s.reps order by s.weight_kg desc nulls last, s.reps desc))[1]
    from workout_sets s
    join workout_logs l on l.id = s.log_id
   where l.member_id = p_member
     and l.gym_id = acting_gym_id()
     and s.exercise_id = p_exercise
     and s.weight_kg is not null
     and (p_member = auth.uid() or trainer_may_see(p_member, 'workouts'))
   group by l.performed_on
   order by l.performed_on;
$fn$;

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
    and in_my_gym(l.gym_id)
    and (l.member_id = auth.uid() or trainer_may_see(l.member_id, 'workouts'));
$fn$;

create or replace function exercise_routine_counts()
returns table (exercise_id uuid, routines int, members int)
language sql stable security definer set search_path = public as $fn$
  select e.exercise_id, count(distinct e.routine_id)::int, count(distinct r.member_id)::int
    from workout_routine_exercises e
    join workout_routines r on r.id = e.routine_id
   where e.exercise_id is not null
     and r.gym_id = current_gym_id()
     and get_my_role() in ('admin', 'staff')
   group by e.exercise_id
$fn$;

create or replace function resource_save_counts()
returns table (resource_id uuid, saved int, done int)
language sql stable security definer set search_path = public as $fn$
  select s.resource_id, count(*)::int, count(s.done_at)::int
    from saved_resources s
   where s.gym_id = current_gym_id()
     and get_my_role() in ('admin', 'staff')
   group by s.resource_id
$fn$;

create or replace function trg_gym_plan_routine_is_mine() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.routine_id is not null and not exists (
    select 1 from workout_routines r
     where r.id = new.routine_id and r.member_id = new.member_id and r.gym_id = new.gym_id
  ) then
    raise exception 'That routine is not one of yours.';
  end if;
  return new;
end;
$fn$;

-- ---- the transition keys this group was the last to name -----------------------------------

alter table achievement_unlocks drop constraint if exists achievement_unlocks_user_key_transition;
alter table point_ledger        drop constraint if exists point_ledger_source_transition;

create or replace function migration_0102_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0102_applied() from public, anon;
grant execute on function migration_0102_applied() to authenticated;
comment on function migration_0102_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0102.sql
