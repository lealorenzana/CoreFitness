-- 0153: REST DAYS, CLOSED DAYS, YOUR PLAN, AND THE SQUAD STREAK
--
-- Three refinements to the gym streak (0151/0152):
--
--   * DAYS THE GYM IS CLOSED. "Days left this week" counted every day to Sunday,
--     so a gym closed on Sundays could tell a member to train on a day they cannot
--     get in. gym_settings.closed_days (0 = Sunday … 6 = Saturday, the convention of
--     0015/0030) is set by the owner on Settings; gym_days_left() counts only open
--     days, and today only while the gym is still open (closing_time, Manila time).
--     The card's days_left, at_risk and out_of_reach, and so the nudge, follow it.
--     Rest days were never a problem: the streak counts days in a week, not which.
--
--   * YOUR PLAN. The card carries plan_days — how many weekdays the member's own
--     training plan (0030) names — so the app can offer "match your plan". Offered,
--     never applied: changing someone's target silently would change their streak.
--
--   * THE SQUAD STREAK. Consecutive weeks a squad (0124) reached its weekly target,
--     by squad_days() — computed, never stored, the week in progress never breaking
--     it, counted from the week the squad began. my_squad_streak() for the squad's
--     own members, squad_streaks() for the board (squad names only, as 0124's board),
--     member_squad_streak() for the desk and the member's coaches. On the gym's last
--     open day of the week a squad short of its target is nudged once, through the
--     same sweep and the members' own streak_nudges switch.
--
-- streak_card() is 0152's with three lines changed; streak_nudge_sweep() is 0151's
-- with the squad loop added.

-- ---- 1. the days the gym is closed -------------------------------------------------
alter table gym_settings add column if not exists closed_days smallint[] not null default '{}';
alter table gym_settings drop constraint if exists gym_settings_closed_days_check;
alter table gym_settings add constraint gym_settings_closed_days_check
  check (closed_days <@ array[0,1,2,3,4,5,6]::smallint[] and cardinality(closed_days) < 7);

-- Open days left this week (Manila), today included while the gym is still open.
create or replace function gym_days_left(p_gym uuid) returns int
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_now time := (now() at time zone 'Asia/Manila')::time;
  v_end date := manila_week_start() + 6;
  v_closed smallint[];
  v_close_text text;
  v_close time;
  d date;
  n int := 0;
begin
  select coalesce(gs.closed_days, '{}'), gs.closing_time into v_closed, v_close_text
    from gym_settings gs where gs.gym_id = p_gym;
  -- closing_time is text (0013). A value that is not a time is "not set", never an
  -- error: one odd entry must not break every member's streak card at this gym.
  begin
    v_close := nullif(btrim(v_close_text), '')::time;
  exception when others then
    v_close := null;
  end;
  d := v_today;
  while d <= v_end loop
    if not (extract(dow from d)::smallint = any(coalesce(v_closed, '{}'))) then
      if not (d = v_today and v_close is not null and v_now >= v_close) then
        n := n + 1;
      end if;
    end if;
    d := d + 1;
  end loop;
  return n;
end;
$$;

-- ---- 2. the streak card: closed days and the plan ----------------------------------
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
  v_since date;
  v_history jsonb;
  v_plan int;
begin
  select * into s from streak_weeks(p_member, p_gym);
  v_days := training_days_between(p_member, p_gym, v_week, v_week + 6);
  v_left := gym_days_left(p_gym);                 -- open days left, today while still open (0153)
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
  select streak_nudges, (created_at at time zone 'Asia/Manila')::date into v_nudges, v_since
    from member_profiles where gym_id = p_gym and profile_id = p_member;

  -- The last twelve weeks, oldest first, by 0151's rules (see the header).
  select jsonb_agg(jsonb_build_object(
           'week', w.wk,
           'days', w.days,
           'state', case
             when w.days >= s.target then 'hit'
             when w.wk = v_week then 'current'
             when w.wk in (select f from member_frozen_weeks(p_member, p_gym) f) then 'frozen'
             -- Only an empty week: training on record means they were here, whatever the join date says.
             when w.days = 0 and v_since is not null and w.wk + 6 < v_since then 'before'
             else 'miss' end)
         order by w.wk)
    into v_history
    from (select (v_week - 7 * i) as wk,
                 training_days_between(p_member, p_gym, v_week - 7 * i, v_week - 7 * i + 6) as days
            from generate_series(0, 11) i) w;

  -- The member's own training plan (0030): how many days a week it names.
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
    -- At risk: a streak to lose, and exactly as many days left as it still needs —
    -- every remaining day counts. More needed than left is already out of reach,
    -- and a nudge then would promise something that can no longer happen.
    'at_risk', s.current_run > 0 and not v_frozen and s.target - v_days > 0 and s.target - v_days = v_left,
    -- Out of reach this week: more days needed than remain.
    'out_of_reach', not v_frozen and s.target - v_days > v_left,
    'next_milestone', v_next,
    'nudges', coalesce(v_nudges, true),
    'history', coalesce(v_history, '[]'::jsonb),
    'plan_days', coalesce(v_plan, 0),
    'closed_days', (select coalesce(to_jsonb(gs.closed_days), '[]'::jsonb) from gym_settings gs where gs.gym_id = p_gym));
end;
$$;

-- ---- 3. the squad streak -------------------------------------------------------------
create or replace function squad_streak_card(p_squad uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s record;
  v_week date := manila_week_start();
  v_first date;
  v_target int;
  v_days int;
  v_left int;
  v_members int;
  w date;
  v_run int := 0;
  v_best int := 0;
  v_cur int := 0;
  v_hist jsonb;
begin
  select * into s from squads where id = p_squad;
  if s is null then return null; end if;
  v_target := s.weekly_target;
  v_first := date_trunc('week', (s.created_at at time zone 'Asia/Manila')::date)::date;
  v_days := squad_days(p_squad, v_week);
  v_left := gym_days_left(s.gym_id);
  select count(*)::int into v_members from squad_members where squad_id = p_squad and left_at is null;

  -- Best, oldest to newest; this week cannot break it.
  w := v_first;
  while w <= v_week loop
    if squad_days(p_squad, w) >= v_target then
      v_run := v_run + 1; v_best := greatest(v_best, v_run);
    elsif w <> v_week then
      v_run := 0;
    end if;
    w := w + 7;
  end loop;
  -- Current, newest to oldest, from last week while this one is not reached.
  w := case when v_days >= v_target then v_week else v_week - 7 end;
  while w >= v_first and squad_days(p_squad, w) >= v_target loop
    v_cur := v_cur + 1;
    w := w - 7;
  end loop;

  select jsonb_agg(jsonb_build_object(
           'week', x.wk, 'days', x.days,
           'state', case when x.days >= v_target then 'hit'
                         when x.wk = v_week then 'current'
                         when x.wk < v_first then 'before'
                         else 'miss' end) order by x.wk)
    into v_hist
    from (select (v_week - 7 * i) as wk, squad_days(p_squad, v_week - 7 * i) as days
            from generate_series(0, 11) i) x;

  return jsonb_build_object(
    'squad_id', s.id, 'name', s.name, 'target', v_target, 'current', v_cur, 'best', v_best,
    'days_this_week', v_days, 'needed', greatest(v_target - v_days, 0), 'days_left', v_left,
    'members', v_members,
    -- At risk: a streak to lose, short of the target, on the gym's last open day.
    'at_risk', v_cur > 0 and v_days < v_target and v_left = 1,
    -- Out of reach: more days needed than every member training every day left could give.
    'out_of_reach', v_target - v_days > v_left * greatest(v_members, 1),
    'history', coalesce(v_hist, '[]'::jsonb));
end;
$$;

-- The caller's squad. NULL when not in one, or engagement's Squads switched off (0141).
create or replace function my_squad_streak() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_squad uuid := my_squad_id(); v_gym uuid := current_gym_id();
begin
  if v_squad is null or v_gym is null or not gym_module_on(v_gym, 'squads') then return null; end if;
  return squad_streak_card(v_squad);
end;
$$;

-- The board's streaks — squad names and numbers only, as 0124's board.
create or replace function squad_streaks() returns table (squad_name text, current_streak int, is_mine boolean)
language sql stable security definer set search_path = public as $$
  select s.name, (squad_streak_card(s.id)->>'current')::int, s.id = my_squad_id()
    from squads s
   where s.gym_id = current_gym_id() and s.archived_at is null and auth.uid() is not null
     and gym_module_on(s.gym_id, 'squads')
   order by 2 desc, 1
   limit 20;
$$;

-- One member's squad streak, for the desk and their coaches (0124's member_squad guard).
create or replace function member_squad_streak(p_member uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_squad uuid;
begin
  if not (p_member = auth.uid()
          or coalesce(storage_role_here() in ('admin', 'staff'), false)
          or (storage_role_here() = 'trainer' and is_my_trainee(p_member))) then
    raise exception 'That is not yours to see.' using errcode = '42501';
  end if;
  select m.squad_id into v_squad from squad_members m join squads s on s.id = m.squad_id
   where m.member_id = p_member and m.gym_id = current_gym_id() and m.left_at is null and s.archived_at is null;
  if v_squad is null then return null; end if;
  return squad_streak_card(v_squad) - 'history';
end;
$$;

-- ---- 4. the nudge, squads included --------------------------------------------------
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

  -- The squad's streak (0153): on the gym's last open day of the week, a squad
  -- short of its target with a streak to lose tells each of its members once.
  for r in
    select s.id as squad_id, s.name, m.member_id as id
      from squads s
      join squad_members m on m.squad_id = s.id and m.left_at is null
      join member_profiles mp on mp.gym_id = s.gym_id and mp.profile_id = m.member_id and mp.streak_nudges
     where s.gym_id = v_gym and s.archived_at is null
  loop
    c := squad_streak_card(r.squad_id);
    continue when not (c->>'at_risk')::boolean;
    v_title := r.name || '''s ' || (c->>'current') || '-week streak ends tonight';
    v_msg := (c->>'needed') || ' more training ' || case when (c->>'needed')::int = 1 then 'day' else 'days' end
             || ' between you keep it going. Check in or log a workout today.';
    if notify_once(r.id, 'info', v_title, v_msg, '/member/squad',
                   'squad-streak:' || v_week || ':' || r.id, v_gym) then
      member_id := r.id; title := v_title; message := v_msg;
      return next;
    end if;
  end loop;
end;
$$;

-- ---- 5. grants and the probe marker -------------------------------------------------
revoke all on function gym_days_left(uuid), squad_streak_card(uuid), streak_card(uuid, uuid)
  from public, anon, authenticated;
revoke all on function my_squad_streak(), squad_streaks(), member_squad_streak(uuid), streak_nudge_sweep()
  from public, anon;
grant execute on function my_squad_streak(), squad_streaks(), member_squad_streak(uuid), streak_nudge_sweep()
  to authenticated;

create or replace function migration_0153_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0153_applied() from public, anon;
grant execute on function migration_0153_applied() to authenticated;
comment on function migration_0153_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0153.sql
