-- 0272 — streaks: a switch, restores, and what a lapsed membership does (2026-11-24)
--
-- The owner's decisions (docs/ROADMAP.md has the entry):
--   * Streaks are a switch, a child of Progress, ON at every gym. Off: no streak on any screen,
--     no nudge, no milestone points, and the streak badges read 0 so none unlock. Nothing is
--     deleted: switch it back on and every streak is where it was.
--   * A streak still counts WEEKS (0151: rest days must never break it).
--   * Restore, TikTok style: a missed week can be restored by the member themselves on the day
--     after it ended (the Monday, Manila). Not restored by the end of that Monday, it is gone.
--     Restores a month grow with the streak that broke: under 12 weeks 1, 12+ 2, 26+ 3, 52+ 4,
--     104+ 5. Free; no points. The desk can also restore the most recent missed week, within 14
--     days, for a reason (sick, injury, gym closed, other + a note). Every restore records who
--     and why. A restored week is like a frozen one: it keeps the streak, it adds no week, so a
--     restore can never earn a milestone by itself.
--   * A lapsed membership: frozen weeks pause (0151, unchanged). After a membership expires, the
--     next N weeks (the owner's grace, default 2, gym_settings.streak_grace_weeks) pause too
--     while no membership covers them; renew in time and the streak carries on, after that a
--     missed week breaks it. Members are held to this: member Terms §streaks, new version date.
--   * A week nobody at the gym checked in (with check-ins before and after it) was a closed
--     week (a holiday, a typhoon, a paused gym): it pauses everyone. There is no history of a
--     gym's pauses to read, and this is the honest trace one leaves.
--
-- Safe to paste again. Pasted before the apps that read it are deployed (an unknown switch
-- reads as on, which is this switch's default anyway).
-- The weekly nudge sweep below is redefined without the old team loop (0273 removes teams).

-- ---- 1. the switch ------------------------------------------------------------------------
insert into platform_features (key, label, description, sort_order, parent_key) values
  ('streaks', 'Streaks',
   'Weeks in a row a member reaches their own target. A missed week can be restored, by the member or the desk.',
   62, 'progress')
on conflict (key) do nothing;
select sync_platform_plan_features();

-- ---- 2. the owner's grace after a membership ends -----------------------------------------
alter table gym_settings add column if not exists streak_grace_weeks smallint not null default 2;
alter table gym_settings drop constraint if exists gym_settings_streak_grace_weeks_check;
alter table gym_settings add constraint gym_settings_streak_grace_weeks_check check (streak_grace_weeks between 0 and 8);

-- A closed week is found by looking for check-ins at the whole gym.
create index if not exists idx_attendance_gym_time on attendance(gym_id, check_in_time);

-- ---- 3. restores ----------------------------------------------------------------------------
create table if not exists streak_restores (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id) on delete cascade,
  member_id   uuid not null references profiles(id) on delete cascade,
  week        date not null,                 -- the Monday of the week restored
  kind        text not null check (kind in ('member', 'desk')),
  reason      text check (reason in ('sick', 'injury', 'gym_closed', 'other')),
  note        text,
  lost_weeks  int not null,                  -- the streak that was restored
  restored_by uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (gym_id, member_id, week),
  check (kind = 'member' or reason is not null),
  check (reason is distinct from 'other' or coalesce(btrim(note), '') <> '')
);
create index if not exists idx_streak_restores_member on streak_restores(gym_id, member_id, created_at desc);
alter table streak_restores enable row level security;
revoke all on streak_restores from anon;
grant select on streak_restores to authenticated;
drop policy if exists streak_restores_read on streak_restores;
create policy streak_restores_read on streak_restores for select to authenticated
  using (member_id = auth.uid()
         or coalesce(storage_role_here() in ('admin', 'staff'), false));
-- Not coaches: a desk restore's reason can be health ("sick", "injury"), and health is desk-only.
-- No insert/update/delete policy for any role: restore_my_streak() and restore_member_streak() write.
drop policy if exists tenant_select on streak_restores;
create policy tenant_select on streak_restores as restrictive for select to anon, authenticated
  using (gym_id = current_gym_id());

-- ---- 4. weeks that pause a streak -----------------------------------------------------------
-- Weeks after a membership ended, for the gym's grace, that no membership covers in full.
create or replace function member_lapse_weeks(p_member uuid, p_gym uuid)
returns setof date language sql stable security definer set search_path = public as $$
  with g as (select coalesce((select streak_grace_weeks from gym_settings where gym_id = p_gym), 2)::int as n),
  ends as (
    select distinct m.expiry_date as e from memberships m
     where m.member_id = p_member and m.gym_id = p_gym and m.status <> 'pending'
       and m.expiry_date is not null and m.expiry_date < manila_today()
  ),
  wk as (select date_trunc('week', ends.e + 1)::date + 7 * i as w from ends, g, generate_series(0, g.n - 1) i)
  select distinct w from wk
   where not exists (select 1 from memberships m
                      where m.member_id = p_member and m.gym_id = p_gym and m.status <> 'pending'
                        and m.start_date is not null and m.start_date <= wk.w
                        and (m.expiry_date is null or m.expiry_date >= wk.w + 6));
$$;

-- Nobody at the gym checked in that week, though people did before and after it.
create or replace function gym_week_closed(p_gym uuid, p_week date)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from attendance a where a.gym_id = p_gym
                        and a.check_in_time >= (p_week::timestamp at time zone 'Asia/Manila')
                        and a.check_in_time <  ((p_week + 7)::timestamp at time zone 'Asia/Manila'))
     and exists (select 1 from attendance a where a.gym_id = p_gym
                    and a.check_in_time < (p_week::timestamp at time zone 'Asia/Manila'))
     and exists (select 1 from attendance a where a.gym_id = p_gym
                    and a.check_in_time >= ((p_week + 7)::timestamp at time zone 'Asia/Manila'));
$$;

-- ---- 5. the streak, counted one way (0151/0219), now with what broke it ---------------------
-- last_miss: the newest week that broke a run; lost_run: the run it broke.
create or replace function streak_state(p_member uuid, p_gym uuid)
returns table (current_run int, best_run int, target int, last_miss date, lost_run int)
language plpgsql stable security definer set search_path = public as $$
declare
  v_target int := coalesce((select streak_target from member_profiles
                             where gym_id = p_gym and profile_id = p_member), 2);
  v_this date := manila_week_start();
  v_first date;
  v_hits date[];
  v_pause date[];
  w date;
  v_run int := 0;
  v_best int := 0;
  v_miss date;
  v_lost int := 0;
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
  select coalesce(array_agg(f), '{}') into v_pause from (
    select member_frozen_weeks(p_member, p_gym) as f
    union select r.week from streak_restores r where r.member_id = p_member and r.gym_id = p_gym
    union select member_lapse_weeks(p_member, p_gym)
  ) p;

  select min(wk) into v_first from unnest(v_hits) wk;
  if v_first is null then
    return query select 0, 0, v_target, null::date, 0;
    return;
  end if;

  -- Oldest to newest. A paused week is skipped; this week cannot break it.
  w := v_first;
  while w <= v_this loop
    if w = any(v_hits) then
      v_run := v_run + 1;
      v_best := greatest(v_best, v_run);
    elsif w = any(v_pause) or w = v_this or gym_week_closed(p_gym, w) then
      null;
    else
      if v_run > 0 then v_miss := w; v_lost := v_run; end if;
      v_run := 0;
    end if;
    w := w + 7;
  end loop;

  return query select v_run, v_best, v_target, v_miss, v_lost;
end;
$$;

create or replace function streak_weeks(p_member uuid, p_gym uuid)
returns table (current_run int, best_run int, target int)
language sql stable security definer set search_path = public as $$
  select s.current_run, s.best_run, s.target from streak_state(p_member, p_gym) s;
$$;

-- Each week between two dates, as every screen shows it.
create or replace function streak_week_states(p_member uuid, p_gym uuid, p_from date, p_to date)
returns table (week date, days int, state text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_target int := coalesce((select streak_target from member_profiles
                             where gym_id = p_gym and profile_id = p_member), 2);
  v_since date := (select (created_at at time zone 'Asia/Manila')::date from member_profiles
                    where gym_id = p_gym and profile_id = p_member);
  v_this date := manila_week_start();
  v_frozen date[];
  v_restored date[];
  v_lapse date[];
  w date;
  n int;
begin
  select coalesce(array_agg(f), '{}') into v_frozen from member_frozen_weeks(p_member, p_gym) f;
  select coalesce(array_agg(r.week), '{}') into v_restored from streak_restores r
   where r.member_id = p_member and r.gym_id = p_gym;
  select coalesce(array_agg(f), '{}') into v_lapse from member_lapse_weeks(p_member, p_gym) f;
  w := date_trunc('week', p_from)::date;
  while w <= p_to loop
    n := case when w > v_this then 0 else training_days_between(p_member, p_gym, w, w + 6) end;
    week := w; days := n;
    state := case
      when n >= v_target then 'hit'
      when w = v_this then 'current'
      when w > v_this then 'future'
      when w = any(v_frozen) then 'frozen'
      when w = any(v_restored) then 'restored'
      when n = 0 and v_since is not null and w + 6 < v_since then 'before'
      when w = any(v_lapse) or gym_week_closed(p_gym, w) then 'paused'
      else 'miss' end;
    return next;
    w := w + 7;
  end loop;
end;
$$;

-- ---- 6. what can be restored ------------------------------------------------------------------
-- Restores a month, by the streak that broke.
create or replace function streak_restore_allowance(p_weeks int)
returns int language sql immutable as $$
  select case when p_weeks >= 104 then 5 when p_weeks >= 52 then 4 when p_weeks >= 26 then 3
              when p_weeks >= 12 then 2 else 1 end;
$$;

-- NULL when nothing can be restored. p_desk: the desk's 14 days instead of the member's Monday.
create or replace function streak_restore_offer(p_member uuid, p_gym uuid, p_desk boolean)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  s record;
  v_this date := manila_week_start();
  v_today date := manila_today();
  v_month date := date_trunc('month', v_today)::date;
  v_allow int;
  v_used int;
begin
  select * into s from streak_state(p_member, p_gym);
  if s.last_miss is null or s.lost_run <= 0 then return null; end if;
  if p_desk then
    if s.last_miss + 6 < v_today - 14 then return null; end if;
  elsif s.last_miss <> v_this - 7 or v_today <> v_this then
    return null;
  end if;
  v_allow := streak_restore_allowance(s.lost_run);
  select count(*)::int into v_used from streak_restores r
   where r.member_id = p_member and r.gym_id = p_gym and r.kind = 'member'
     and (r.created_at at time zone 'Asia/Manila')::date >= v_month;
  return jsonb_build_object(
    'week', s.last_miss,
    'lost', s.lost_run,
    'restored_to', s.lost_run + s.current_run,
    'until', case when p_desk then s.last_miss + 6 + 14 else v_this end,
    'allowance', v_allow,
    'used', v_used,
    'left', greatest(v_allow - v_used, 0));
end;
$$;

-- The member restores their own, on the Monday after the missed week.
create or replace function restore_my_streak() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); o jsonb;
begin
  if auth.uid() is null or v_gym is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not exists (select 1 from member_profiles where gym_id = v_gym and profile_id = auth.uid()) then
    raise exception 'You are not a member here.' using errcode = '42501';
  end if;
  if not gym_module_on(v_gym, 'streaks') then raise exception 'Streaks are switched off at this gym.'; end if;
  if not gym_writable() then raise exception 'This gym is read-only at the moment.' using errcode = '42501'; end if;
  o := streak_restore_offer(auth.uid(), v_gym, false);
  if o is null then raise exception 'There is no streak to restore today.'; end if;
  if (o->>'left')::int <= 0 then raise exception 'You have used your restores for this month.'; end if;
  insert into streak_restores (gym_id, member_id, week, kind, lost_weeks, restored_by)
  values (v_gym, auth.uid(), (o->>'week')::date, 'member', (o->>'lost')::int, auth.uid())
  on conflict (gym_id, member_id, week) do nothing;
  return streak_card(auth.uid(), v_gym);
end;
$$;

-- The desk restores the most recent missed week, within 14 days, for a reason.
create or replace function restore_member_streak(p_member uuid, p_reason text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); o jsonb;
begin
  if auth.uid() is null or v_gym is null
     or coalesce(storage_role_here() in ('admin', 'staff'), false) is not true then
    raise exception 'Only the desk can restore a member''s streak.' using errcode = '42501';
  end if;
  if not exists (select 1 from member_profiles where gym_id = v_gym and profile_id = p_member) then
    raise exception 'That member is not at this gym.' using errcode = '42501';
  end if;
  if not gym_module_on(v_gym, 'streaks') then raise exception 'Streaks are switched off at this gym.'; end if;
  if not gym_writable() then raise exception 'This gym is read-only at the moment.' using errcode = '42501'; end if;
  if p_reason is null or p_reason not in ('sick', 'injury', 'gym_closed', 'other') then
    raise exception 'Choose a reason.';
  end if;
  if p_reason = 'other' and coalesce(btrim(p_note), '') = '' then raise exception 'Write the reason.'; end if;
  o := streak_restore_offer(p_member, v_gym, true);
  if o is null then raise exception 'There is no missed week from the last 14 days to restore.'; end if;
  insert into streak_restores (gym_id, member_id, week, kind, reason, note, lost_weeks, restored_by)
  values (v_gym, p_member, (o->>'week')::date, 'desk', p_reason, nullif(btrim(p_note), ''), (o->>'lost')::int, auth.uid())
  on conflict (gym_id, member_id, week) do nothing;
  return streak_card(p_member, v_gym);
end;
$$;

create or replace function log_streak_restore_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform log_activity('streak.restore', 'member', new.member_id, new.member_id,
    case when new.kind = 'member'
         then act_name(new.member_id) || ' restored their ' || new.lost_weeks || '-week streak'
         else act_name(new.restored_by) || ' restored ' || act_name(new.member_id) || '''s ' || new.lost_weeks || '-week streak' end,
    jsonb_build_object('weeks', new.lost_weeks, 'week', new.week, 'kind', new.kind, 'reason', new.reason, 'note', new.note),
    new.gym_id);
  return new;
end $$;
drop trigger if exists trg_act_streak_restore on streak_restores;
create trigger trg_act_streak_restore after insert on streak_restores
  for each row execute function log_streak_restore_activity();

-- ---- 7. one member's streak, as every screen shows it (0219's card, plus restore and lapse) ----
create or replace function streak_card(p_member uuid, p_gym uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  s record;
  v_week date := manila_week_start();
  v_today date := manila_today();
  v_days int;
  v_left int;
  v_frozen boolean;
  v_dots jsonb;
  v_next int;
  v_nudges boolean;
  v_history jsonb;
  v_plan int;
  v_grace int := coalesce((select streak_grace_weeks from gym_settings where gym_id = p_gym), 2);
  v_ended date;
  v_renew date;
  v_lapse jsonb;
  v_restores jsonb;
begin
  select * into s from streak_state(p_member, p_gym);
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
  select streak_nudges into v_nudges from member_profiles where gym_id = p_gym and profile_id = p_member;

  select jsonb_agg(jsonb_build_object('week', w.week, 'days', w.days, 'state', w.state) order by w.week)
    into v_history from streak_week_states(p_member, p_gym, v_week - 77, v_week) w;

  select count(*)::int into v_plan from gym_plans gp
   where gp.member_id = p_member and gp.gym_id = p_gym and gp.active;

  -- No membership today: when it ended, and the last day a renewal keeps the streak.
  if not v_frozen and not exists (select 1 from memberships m
                     where m.member_id = p_member and m.gym_id = p_gym and m.status in ('active', 'frozen')
                       and (m.start_date is null or m.start_date <= v_today)
                       and (m.expiry_date is null or m.expiry_date >= v_today)) then
    select max(m.expiry_date) into v_ended from memberships m
     where m.member_id = p_member and m.gym_id = p_gym and m.status <> 'pending' and m.expiry_date < v_today;
    if v_ended is not null then
      v_renew := greatest(v_ended, date_trunc('week', v_ended + 1)::date + 7 * v_grace - 1);
      v_lapse := jsonb_build_object('ended_on', v_ended, 'renew_by', v_renew, 'in_grace', v_today <= v_renew,
                                    'grace_weeks', v_grace);
    end if;
  end if;

  select jsonb_agg(x order by x->>'at' desc) into v_restores from (
    select jsonb_build_object('week', r.week, 'kind', r.kind, 'reason', r.reason, 'note', r.note,
                              'weeks', r.lost_weeks, 'at', r.created_at,
                              'by', case when r.kind = 'desk' then act_name(r.restored_by) end) as x
      from streak_restores r where r.member_id = p_member and r.gym_id = p_gym
     order by r.created_at desc limit 5) t;

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
    'at_risk', s.current_run > 0 and not v_frozen and v_lapse is null and s.target - v_days > 0 and s.target - v_days = v_left,
    'out_of_reach', not v_frozen and v_lapse is null and s.target - v_days > v_left,
    'next_milestone', v_next,
    'nudges', coalesce(v_nudges, true),
    'history', coalesce(v_history, '[]'::jsonb),
    'plan_days', coalesce(v_plan, 0),
    'closed_days', (select coalesce(to_jsonb(gs.closed_days), '[]'::jsonb) from gym_settings gs where gs.gym_id = p_gym),
    'restore', streak_restore_offer(p_member, p_gym, false),
    'desk_restore', streak_restore_offer(p_member, p_gym, true),
    'restores', coalesce(v_restores, '[]'::jsonb),
    'lapse', v_lapse);
end;
$$;

-- ---- 8. who reads it: everything switched off with Streaks ------------------------------------
create or replace function my_streak() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_gym uuid := current_gym_id();
begin
  if auth.uid() is null or v_gym is null then return null; end if;
  if not exists (select 1 from member_profiles where gym_id = v_gym and profile_id = auth.uid()) then return null; end if;
  if not gym_module_on(v_gym, 'streaks') then return null; end if;   -- 'streaks' is off whenever Progress is
  return streak_card(auth.uid(), v_gym);
end;
$$;

create or replace function member_streak(p_member uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); c jsonb;
begin
  if not (p_member = auth.uid()
          or coalesce(storage_role_here() in ('admin', 'staff'), false)
          or (storage_role_here() = 'trainer' and is_my_trainee(p_member))) then
    raise exception 'That is not yours to see.' using errcode = '42501';
  end if;
  if not exists (select 1 from member_profiles where gym_id = v_gym and profile_id = p_member) then return null; end if;
  if not gym_module_on(v_gym, 'streaks') then return null; end if;
  c := streak_card(p_member, v_gym);
  -- A coach sees that a week was restored, never why: the reason can be health, which is desk-only.
  if p_member <> auth.uid() and storage_role_here() = 'trainer' then
    c := jsonb_set(c, '{restores}', (select coalesce(jsonb_agg(x - 'reason' - 'note' - 'by'), '[]'::jsonb)
                                       from jsonb_array_elements(c->'restores') x));
  end if;
  return c;
end;
$$;

-- The calendar: one month of training days, and the weeks that touch it.
create or replace function my_streak_month(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_gym uuid := current_gym_id();
  v_me uuid := auth.uid();
  v_from date := date_trunc('month', p_month)::date;
  v_to date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_days jsonb;
  v_weeks jsonb;
begin
  if v_me is null or v_gym is null or p_month is null then return null; end if;
  if not exists (select 1 from member_profiles where gym_id = v_gym and profile_id = v_me) then return null; end if;
  if not gym_module_on(v_gym, 'streaks') then return null; end if;
  select jsonb_agg(jsonb_build_object(
           'd', g.d::date,
           'checkin', exists (select 1 from attendance a where a.member_id = v_me and a.gym_id = v_gym
                                and (a.check_in_time at time zone 'Asia/Manila')::date = g.d::date),
           'logged', exists (select 1 from workout_logs l where l.member_id = v_me and l.gym_id = v_gym
                               and l.counts and l.performed_on = g.d::date))
         order by g.d)
    into v_days from generate_series(v_from::timestamp, v_to::timestamp, interval '1 day') g(d);
  select jsonb_agg(jsonb_build_object('week', w.week, 'days', w.days, 'state', w.state) order by w.week)
    into v_weeks from streak_week_states(v_me, v_gym, v_from, v_to) w;
  return jsonb_build_object('month', v_from, 'days', coalesce(v_days, '[]'::jsonb), 'weeks', coalesce(v_weeks, '[]'::jsonb));
end;
$$;

create or replace function settle_my_streak() returns int[]
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_best int; m int; v_id uuid; v_new int[] := '{}';
begin
  if auth.uid() is null or v_gym is null then return v_new; end if;
  if not exists (select 1 from member_profiles where gym_id = v_gym and profile_id = auth.uid()) then return v_new; end if;
  if not gym_module_on(v_gym, 'streaks') or not gym_writable() then return v_new; end if;
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

-- The nudge before it breaks (0151), and on a Monday the nudge to restore.
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
  if not gym_module_on(v_gym, 'streaks') or not gym_writable() then return; end if;
  for r in
    select mp.profile_id as id
      from member_profiles mp
      join gym_roles g on g.gym_id = mp.gym_id and g.user_id = mp.profile_id and g.role = 'member' and g.status = 'active'
     where mp.gym_id = v_gym and mp.streak_nudges
  loop
    c := streak_card(r.id, v_gym);
    if c->'restore' is not null and jsonb_typeof(c->'restore') = 'object' and (c->'restore'->>'left')::int > 0 then
      v_title := 'Restore your ' || (c->'restore'->>'lost') || '-week streak';
      v_msg := 'You missed last week. Restore it in the app today, or it resets tonight.';
      if notify_once(r.id, 'info', v_title, v_msg, '/member/home',
                     'streak-restore:' || v_week || ':' || r.id, v_gym) then
        member_id := r.id; title := v_title; message := v_msg;
        return next;
      end if;
      continue;
    end if;
    continue when not (c->>'at_risk')::boolean;
    v_title := 'Keep your ' || (c->>'current') || '-week streak';
    v_msg := case when (c->>'needed')::int = 1
                  then 'One more training day this week keeps it going. Check in or log a workout today.'
                  else (c->>'needed') || ' more training days this week keep it going. That is every day left.' end;
    if notify_once(r.id, 'info', v_title, v_msg, '/member/home',
                   'streak:' || v_week || ':' || r.id, v_gym) then
      member_id := r.id; title := v_title; message := v_msg;
      return next;
    end if;
  end loop;
end;
$$;

-- ---- 9. the badges read 0 while Streaks are off (0219's body, two columns changed) ----------
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
     where gym_module_on(gym.id, 'streaks')
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
    coalesce((select current_run from sw), 0)::int,
    coalesce((select best_run from sw), 0)::int,
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

-- ---- 10. tenancy: the restore table is one gym's (0260's list plus one) ---------------------------
create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'ai_coach_profiles','ai_meal_guides','ai_proposals','ai_usage_days',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','cash_outs','challenge_participants','challenges','checkin_picks','class_templates',
    'class_waitlist','classes','coach_checkins','coaching_prices','coaching_standins','coachings','conversations',
    'equipment_exercises','equipment_reports','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','guest_visits','guests','gym_equipment','gym_exercise_media','gym_goals','gym_house_rules','gym_invitations','gym_modules','gym_payment_methods','gym_photos','gym_plans',
    'gym_program_days','gym_programs','gym_settings','gym_terms_acceptances','gym_waivers','gym_workout_items','gym_workouts',
    'house_rules_acceptances','invoice_counters','member_profiles','member_share_prefs','membership_events',
    'membership_plans','membership_requests','memberships','messages',
    'notifications','payments','pending_registrations','personal_records','plan_features',
    'point_ledger','point_rules','program_enrolments','progress_photos',
    'pt_sessions','referral_codes','referrals','refund_rules','renewal_requests',
    'reward_redemptions','rewards','room_assignments','room_comments','room_leaves','room_members','room_posts',
    'room_submissions','rooms',
    'saved_resources','season_claims','season_tiers','shop_products','shop_sale_items','shop_sales',
    'squad_members','squad_weeks','squads','staff_permissions','stock_moves','streak_milestones','terms_acceptances',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_payment_methods','trainer_profiles',
    'trainer_ratings','waiver_acceptances','winback_rules','winback_sends','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routine_versions','workout_routines','workout_sets',
    -- 0235: coaching house rules — each is one gym's.
    'coaching_pauses','coach_cut_settlements','coach_dues_payments',
    -- 0245: reels.
    'gym_reels','reel_likes',
    -- 0246: the gym chat.
    'gym_chat_messages','gym_chat_reactions','gym_chat_people','gym_chat_reports',
    -- 0259: time slots.
    'slot_templates','slot_bookings',
    -- 0260: repeats and pauses.
    'booking_repeats','booking_repeat_weeks','booking_pauses',
    -- 0272: streak restores.
    'streak_restores']::text[]
$$;

-- ---- 11. grants: helpers to nobody, screens to the signed in -----------------------------------
revoke all on function member_lapse_weeks(uuid, uuid) from public, anon, authenticated;
revoke all on function gym_week_closed(uuid, date) from public, anon, authenticated;
revoke all on function streak_state(uuid, uuid) from public, anon, authenticated;
revoke all on function streak_week_states(uuid, uuid, date, date) from public, anon, authenticated;
revoke all on function streak_restore_allowance(int) from public, anon, authenticated;
revoke all on function streak_restore_offer(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function log_streak_restore_activity() from public, anon, authenticated;
revoke all on function streak_weeks(uuid, uuid) from public, anon, authenticated;
revoke all on function streak_card(uuid, uuid) from public, anon, authenticated;
revoke all on function restore_my_streak() from public, anon;
revoke all on function restore_member_streak(uuid, text, text) from public, anon;
revoke all on function my_streak_month(date) from public, anon;
revoke all on function my_streak() from public, anon;
revoke all on function member_streak(uuid) from public, anon;
revoke all on function settle_my_streak() from public, anon;
revoke all on function streak_nudge_sweep() from public, anon;
grant execute on function restore_my_streak() to authenticated;
grant execute on function restore_member_streak(uuid, text, text) to authenticated;
grant execute on function my_streak_month(date) to authenticated;
grant execute on function my_streak() to authenticated;
grant execute on function member_streak(uuid) to authenticated;
grant execute on function settle_my_streak() to authenticated;
grant execute on function streak_nudge_sweep() to authenticated;

create or replace function migration_0272_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0272_applied() from public, anon;
grant execute on function migration_0272_applied() to authenticated;
comment on function migration_0272_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';
