-- 0124 — Squads and the gym-wide goal.
-- Spec: docs/superpowers/specs/2026-09-27-squads-gym-goal-design.md
--
-- ---- A TRAINING DAY MEANS ONE THING ----------------------------------------------------
--
-- A squad's week and a training_days goal both count *training days*: distinct
-- Manila days a member checked in or logged a workout — exactly 0028's badges
-- and 0052's challenges. training_days_between() is that one definition.
--
-- ---- SQUADS ARE FRIEND GROUPS -------------------------------------------------------------
--
-- Two to five active members, one squad per member per gym, joined only with
-- the squad's code. The code and the member list are the squad's own: outsiders
-- see only the board (names of squads, never of people). Every write is a
-- function — squads, squad_members and squad_weeks have no write policy.
--
-- When a squad's training days this week reach its target, settle_squads()
-- records the week once and pays every active member the gym's squad_week rule,
-- through the same idempotent ledger key as everything else.
--
-- ---- THE GYM GOAL IS COMPUTED ----------------------------------------------------------------
--
-- Progress is summed across the gym's members, never stored. Reaching it pays
-- its points once to every member who contributed at least one unit.

-- ---- 1. one definition of a training day ------------------------------------------------------

create or replace function training_days_between(p_member uuid, p_gym uuid, p_from date, p_to date)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from (
    select (a.check_in_time at time zone 'Asia/Manila')::date as d from attendance a
     where a.member_id = p_member and a.gym_id = p_gym
       and (a.check_in_time at time zone 'Asia/Manila')::date between p_from and p_to
    union
    select w.performed_on from workout_logs w
     where w.member_id = p_member and w.gym_id = p_gym and w.performed_on between p_from and p_to
  ) days;
$$;

create or replace function manila_week_start(p_offset_weeks int default 0) returns date
language sql stable as $$
  select (date_trunc('week', now() at time zone 'Asia/Manila')::date + 7 * p_offset_weeks)::date
$$;

-- ---- 2. the two point rules -------------------------------------------------------------------

insert into point_rules (gym_id, key, label, points, sort_order)
select g.id, 'squad_week', 'Your squad hit its weekly target', 30, 8 from gyms g
on conflict (gym_id, key) do nothing;
-- The goal's own points are copied per goal (like a challenge's reward_points);
-- this row exists so the ledger's rule reference holds and the gym can see it.
insert into point_rules (gym_id, key, label, points, sort_order)
select g.id, 'gym_goal', 'The whole gym reached its goal', 1, 9 from gyms g
on conflict (gym_id, key) do nothing;

-- ---- 3. squads ------------------------------------------------------------------------------------

create table if not exists squads (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null default acting_gym_id() references gyms(id),
  name          text not null check (char_length(btrim(name)) between 2 and 30),
  code          text not null check (code ~ '^[A-Z]{6}$'),
  weekly_target int not null default 10 check (weekly_target between 1 and 35),
  created_by    uuid not null references profiles(id),
  created_at    timestamptz not null default now(),
  archived_at   timestamptz,
  unique (gym_id, id),
  unique (gym_id, code)
);
create unique index if not exists squads_name_per_gym on squads (gym_id, lower(name)) where archived_at is null;

create table if not exists squad_members (
  id        uuid primary key default gen_random_uuid(),
  gym_id    uuid not null default acting_gym_id() references gyms(id),
  squad_id  uuid not null,
  member_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at   timestamptz,
  foreign key (gym_id, squad_id) references squads (gym_id, id) on delete cascade
);
create unique index if not exists squad_members_one_squad on squad_members (gym_id, member_id) where left_at is null;

create table if not exists squad_weeks (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null default acting_gym_id() references gyms(id),
  squad_id   uuid not null,
  week_start date not null,
  days       int not null,
  reached_at timestamptz not null default now(),
  unique (squad_id, week_start),
  foreign key (gym_id, squad_id) references squads (gym_id, id) on delete cascade
);

create or replace function my_squad_id() returns uuid
language sql stable security definer set search_path = public as $$
  select squad_id from squad_members
   where member_id = auth.uid() and gym_id = current_gym_id() and left_at is null;
$$;

create or replace function squad_days(p_squad uuid, p_week date) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(training_days_between(m.member_id, m.gym_id, p_week, p_week + 6)), 0)::int
    from squad_members m where m.squad_id = p_squad and m.left_at is null;
$$;

create or replace function create_squad(p_name text, p_target int) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_code text; v_id uuid; i int := 0;
begin
  if storage_role_here() is distinct from 'member' or not gym_writable() then
    raise exception 'Only a member of this gym can start a squad.' using errcode = '42501';
  end if;
  if my_squad_id() is not null then
    raise exception 'You are already in a squad. Leave it first.';
  end if;
  loop
    v_code := (select string_agg(chr(65 + floor(random() * 26)::int), '') from generate_series(1, 6));
    exit when not exists (select 1 from squads where gym_id = v_gym and code = v_code);
    i := i + 1;
    if i > 20 then raise exception 'Could not make a squad code. Try again.'; end if;
  end loop;
  insert into squads (gym_id, name, code, weekly_target, created_by)
  values (v_gym, btrim(p_name), v_code, coalesce(p_target, 10), auth.uid())
  returning id into v_id;
  insert into squad_members (gym_id, squad_id, member_id) values (v_gym, v_id, auth.uid());
  return v_id;
end;
$$;

create or replace function join_squad(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_squad uuid;
begin
  if storage_role_here() is distinct from 'member' or not gym_writable() then
    raise exception 'Only a member of this gym can join a squad.' using errcode = '42501';
  end if;
  if my_squad_id() is not null then
    raise exception 'You are already in a squad. Leave it first.';
  end if;
  select id into v_squad from squads
   where gym_id = v_gym and code = upper(btrim(p_code)) and archived_at is null;
  if v_squad is null then raise exception 'No squad here has that code.'; end if;
  -- Serialise joins to one squad, so two people cannot both take the fifth place.
  perform 1 from squads where id = v_squad for update;
  if (select count(*) from squad_members where squad_id = v_squad and left_at is null) >= 5 then
    raise exception 'That squad is full — five is the most.';
  end if;
  insert into squad_members (gym_id, squad_id, member_id) values (v_gym, v_squad, auth.uid());
  return v_squad;
end;
$$;

create or replace function leave_squad() returns void
language plpgsql security definer set search_path = public as $$
declare v_squad uuid := my_squad_id();
begin
  if v_squad is null then raise exception 'You are not in a squad.'; end if;
  update squad_members set left_at = now() where squad_id = v_squad and member_id = auth.uid() and left_at is null;
  if not exists (select 1 from squad_members where squad_id = v_squad and left_at is null) then
    update squads set archived_at = now() where id = v_squad;
  end if;
end;
$$;

-- The caller's squad: one row per member, with the squad's own figures repeated.
create or replace function my_squad()
returns table (squad_id uuid, squad_name text, code text, weekly_target int, squad_days int,
               member_id uuid, first_name text, days_this_week int, is_me boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.code, s.weekly_target, squad_days(s.id, manila_week_start()),
         m.member_id, p.first_name::text,
         training_days_between(m.member_id, m.gym_id, manila_week_start(), manila_week_start() + 6),
         m.member_id = auth.uid()
    from squads s
    join squad_members m on m.squad_id = s.id and m.left_at is null
    join profiles p on p.id = m.member_id
   where s.id = my_squad_id()
   order by 8 desc, 7;
$$;

-- Every active squad in the gym this week — names of squads, never of people.
create or replace function squad_board()
returns table (squad_name text, members int, days int, weekly_target int, reached boolean, is_mine boolean)
language sql stable security definer set search_path = public as $$
  select s.name, (select count(*)::int from squad_members m where m.squad_id = s.id and m.left_at is null),
         squad_days(s.id, manila_week_start()), s.weekly_target,
         squad_days(s.id, manila_week_start()) >= s.weekly_target, s.id = my_squad_id()
    from squads s
   where s.gym_id = current_gym_id() and s.archived_at is null and auth.uid() is not null
   order by 3 desc, 1
   limit 20;
$$;

-- Pays a squad week once. This week and last, so Sunday's finish pays on Monday.
create or replace function settle_squads() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_only uuid := case when auth.uid() is not null then current_gym_id() end;
  s record; wk date; v_days int; v_week uuid; v_pts int; n int := 0;
begin
  for s in select * from squads where archived_at is null and (v_only is null or gym_id = v_only) loop
    foreach wk in array array[manila_week_start(), manila_week_start(-1)] loop
      v_days := squad_days(s.id, wk);
      continue when v_days < s.weekly_target;
      insert into squad_weeks (gym_id, squad_id, week_start, days)
      values (s.gym_id, s.id, wk, v_days)
      on conflict (squad_id, week_start) do nothing
      returning id into v_week;
      continue when v_week is null;
      select points into v_pts from point_rules where gym_id = s.gym_id and key = 'squad_week' and is_active;
      if v_pts is not null then
        insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
        select s.gym_id, m.member_id, 'squad_week', v_pts, 'squad_weeks', v_week
          from squad_members m
         where m.squad_id = s.id and m.left_at is null and plan_allows(m.member_id, 'points_earn')
        on conflict (gym_id, member_id, rule_key, source_table, source_id) do nothing;
      end if;
      n := n + 1;
    end loop;
  end loop;
  return n;
end;
$$;

-- ---- 4. the gym-wide goal ----------------------------------------------------------------------

create table if not exists gym_goals (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null default acting_gym_id() references gyms(id),
  title         text not null check (char_length(btrim(title)) between 2 and 80),
  metric        text not null check (metric in ('training_days', 'workouts_logged', 'checkins')),
  target        int not null check (target > 0),
  starts_on     date not null,
  ends_on       date not null,
  reward_points int not null default 0 check (reward_points >= 0),
  is_active     boolean not null default true,
  reached_at    timestamptz,
  created_by    uuid not null default auth.uid() references profiles(id),
  created_at    timestamptz not null default now(),
  constraint gym_goals_window check (ends_on >= starts_on),
  unique (gym_id, id)
);

-- One member's contribution to a goal, in the goal's own unit.
create or replace function gym_goal_contribution(p_goal uuid, p_member uuid) returns int
language plpgsql stable security definer set search_path = public as $$
declare g record;
begin
  select * into g from gym_goals where id = p_goal;
  if g.id is null then return 0; end if;
  return case g.metric
    when 'training_days' then training_days_between(p_member, g.gym_id, g.starts_on, g.ends_on)
    when 'workouts_logged' then (select count(*)::int from workout_logs w
       where w.member_id = p_member and w.gym_id = g.gym_id and w.performed_on between g.starts_on and g.ends_on)
    when 'checkins' then (select count(*)::int from attendance a
       where a.member_id = p_member and a.gym_id = g.gym_id
         and (a.check_in_time at time zone 'Asia/Manila')::date between g.starts_on and g.ends_on)
    else 0 end;
end;
$$;

create or replace function gym_goal_progress(p_goal uuid) returns table (progress int, contributors int)
language sql stable security definer set search_path = public as $$
  with c as (
    select gym_goal_contribution(p_goal, r.user_id) as n
      from gym_goals g join gym_roles r on r.gym_id = g.gym_id and r.role = 'member'
     where g.id = p_goal
  )
  select coalesce(sum(n), 0)::int, count(*) filter (where n > 0)::int from c;
$$;

-- The goal running today in the caller's gym, with the caller's own share.
create or replace function current_gym_goal()
returns table (id uuid, title text, metric text, target int, starts_on date, ends_on date,
               reward_points int, reached boolean, progress int, contributors int, mine int)
language sql stable security definer set search_path = public as $$
  select g.id, g.title, g.metric, g.target, g.starts_on, g.ends_on, g.reward_points, g.reached_at is not null,
         p.progress, p.contributors, gym_goal_contribution(g.id, auth.uid())
    from gym_goals g, lateral gym_goal_progress(g.id) p
   where g.gym_id = current_gym_id() and g.is_active and auth.uid() is not null
     and (now() at time zone 'Asia/Manila')::date between g.starts_on and g.ends_on
   order by g.ends_on
   limit 1;
$$;

create or replace function settle_gym_goals() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_only uuid := case when auth.uid() is not null then current_gym_id() end;
  g record; n int := 0;
begin
  for g in select * from gym_goals
            where is_active and reached_at is null and (v_only is null or gym_id = v_only)
              and starts_on <= (now() at time zone 'Asia/Manila')::date
              and ends_on >= (now() at time zone 'Asia/Manila')::date - 7 loop
    continue when (select progress from gym_goal_progress(g.id)) < g.target;
    update gym_goals set reached_at = now() where id = g.id and reached_at is null;
    if g.reward_points > 0 then
      insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
      select g.gym_id, r.user_id, 'gym_goal', g.reward_points, 'gym_goals', g.id
        from gym_roles r
       where r.gym_id = g.gym_id and r.role = 'member'
         and gym_goal_contribution(g.id, r.user_id) > 0 and plan_allows(r.user_id, 'points_earn')
      on conflict (gym_id, member_id, rule_key, source_table, source_id) do nothing;
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ---- 5. who reads what ------------------------------------------------------------------------

alter table squads        enable row level security;
alter table squad_members enable row level security;
alter table squad_weeks   enable row level security;
alter table gym_goals     enable row level security;
grant select on squads, squad_members, squad_weeks to authenticated;
grant select, insert, update, delete on gym_goals to authenticated;

drop policy if exists squads_read on squads;
create policy squads_read on squads for select to authenticated
  using (id = my_squad_id() or coalesce(storage_role_here() in ('admin', 'staff'), false));
drop policy if exists squad_members_read on squad_members;
create policy squad_members_read on squad_members for select to authenticated
  using (squad_id = my_squad_id() or coalesce(storage_role_here() in ('admin', 'staff'), false));
drop policy if exists squad_weeks_read on squad_weeks;
create policy squad_weeks_read on squad_weeks for select to authenticated
  using (squad_id = my_squad_id() or coalesce(storage_role_here() in ('admin', 'staff'), false));

drop policy if exists gym_goals_read  on gym_goals;
drop policy if exists gym_goals_write on gym_goals;
create policy gym_goals_read on gym_goals for select to authenticated using (true);
create policy gym_goals_write on gym_goals for all to authenticated
  using (storage_role_here() = 'admin') with check (storage_role_here() = 'admin');

-- ---- 6. tenancy --------------------------------------------------------------------------------

create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_exercise_media','gym_goals','gym_invitations','gym_modules','gym_photos','gym_plans',
    'gym_program_days','gym_programs','gym_settings','gym_waivers','gym_workout_items','gym_workouts',
    'invoice_counters','member_profiles','member_share_prefs','membership_events',
    'membership_plans','membership_requests','memberships',
    'notifications','payments','pending_registrations','personal_records','plan_features',
    'point_ledger','point_rules',
    'program_enrolments','pt_sessions','refund_rules','renewal_requests','reward_redemptions','rewards',
    'saved_resources','season_claims','season_tiers','squad_members','squad_weeks','squads',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_profiles',
    'trainer_ratings','waiver_acceptances','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routines','workout_sets']::text[]
$$;

do $$
declare t text;
begin
  foreach t in array array['squads', 'squad_members', 'squad_weeks', 'gym_goals'] loop
    execute format('drop policy if exists tenant_select on %I', t);
    execute format('drop policy if exists tenant_insert on %I', t);
    execute format('drop policy if exists tenant_update on %I', t);
    execute format('drop policy if exists tenant_delete on %I', t);
    execute format('create policy tenant_select on %I as restrictive for select to anon, authenticated
                      using (gym_id = current_gym_id())', t);
    execute format('create policy tenant_insert on %I as restrictive for insert to anon, authenticated
                      with check (gym_id = current_gym_id() and gym_writable())', t);
    execute format('create policy tenant_update on %I as restrictive for update to anon, authenticated
                      using (gym_id = current_gym_id() and gym_writable())
                      with check (gym_id = current_gym_id())', t);
    execute format('create policy tenant_delete on %I as restrictive for delete to anon, authenticated
                      using (gym_id = current_gym_id() and gym_writable())', t);
  end loop;
end $$;

-- ---- grants ------------------------------------------------------------------------------------

revoke all on function training_days_between(uuid, uuid, date, date), my_squad_id(), squad_days(uuid, date),
  create_squad(text, int), join_squad(text), leave_squad(), my_squad(), squad_board(), settle_squads(),
  gym_goal_contribution(uuid, uuid), gym_goal_progress(uuid), current_gym_goal(), settle_gym_goals()
  from public, anon;
grant execute on function training_days_between(uuid, uuid, date, date), my_squad_id(), squad_days(uuid, date),
  create_squad(text, int), join_squad(text), leave_squad(), my_squad(), squad_board(), settle_squads(),
  gym_goal_contribution(uuid, uuid), gym_goal_progress(uuid), current_gym_goal(), settle_gym_goals()
  to authenticated;

-- ---- the probe's marker ------------------------------------------------------------------

create or replace function migration_0124_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0124_applied() from public, anon;
grant execute on function migration_0124_applied() to authenticated;
comment on function migration_0124_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0124.sql
