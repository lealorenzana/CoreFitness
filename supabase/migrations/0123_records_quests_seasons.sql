-- 0123 — Personal records, weekly quests, monthly seasons.
-- Spec: docs/superpowers/specs/2026-09-27-records-quests-seasons-design.md
--
-- ---- PERSONAL RECORDS ARE THE DATABASE'S CALL ------------------------------------------
--
-- A trigger on workout_sets decides, so no client can claim one, and a set sent
-- late by the offline outbox is judged when it arrives. The first set of an
-- exercise is the baseline, a tie is not a record, and a custom exercise never
-- counts (0050 keeps those out of every aggregate). Weights are self-typed, so
-- PR *points* are capped at three a week per member — the record itself is
-- still kept and celebrated — and the desk can remove a PR: its points are
-- reversed by a negative ledger row (the ledger stays append-only), and its set
-- stops counting as the bar, so one fake 500 kg does not block every real PR.
--
-- ---- QUESTS ARE CHALLENGES THAT REPEAT ---------------------------------------------------
--
-- A challenge marked repeats_weekly is a template. roll_weekly_quests() gives
-- each Manila week its own copy (parent_id = the template) and enrols every
-- active member. After that it is 0052's machinery unchanged — progress,
-- standings, settle_challenges and challenge_complete points, idempotent per
-- copy, so each week pays once.
--
-- ---- A SEASON IS A CALENDAR MONTH ------------------------------------------------------
--
-- The season score is the points earned this month (the ledger only records
-- earning; spending lives in reward_redemptions). The owner sets tiers; each
-- may give a reward from the gym's catalogue, claimed once per season and
-- handed over by the desk, costing no points.
--
-- ---- BOARDS ARE OPT-IN -------------------------------------------------------------------
--
-- member_profiles.show_on_boards, false until the member turns it on (0032's
-- stance: members choose what others see).

-- ---- 1. opting in ------------------------------------------------------------------------

alter table member_profiles add column if not exists show_on_boards boolean not null default false;

create or replace function set_show_on_boards(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update member_profiles set show_on_boards = coalesce(p_on, false)
   where profile_id = auth.uid() and gym_id = current_gym_id();
  if not found then raise exception 'Only a member of this gym can choose that.'; end if;
end;
$$;

-- ---- 2. personal records -------------------------------------------------------------------

insert into point_rules (gym_id, key, label, points, sort_order)
select g.id, 'personal_record', 'Set a personal record', 15, 7 from gyms g
on conflict (gym_id, key) do nothing;

create table if not exists personal_records (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null default acting_gym_id() references gyms(id),
  member_id      uuid not null references profiles(id) on delete cascade,
  exercise_id    uuid not null references exercises(id) on delete cascade,
  kind           text not null check (kind in ('weight', 'duration')),
  value          numeric(8,2) not null,
  previous       numeric(8,2) not null,
  set_id         uuid not null,
  achieved_at    timestamptz not null default now(),
  points_awarded int not null default 0,
  removed_at     timestamptz,
  removed_by     uuid references profiles(id),
  unique (set_id, kind),
  foreign key (gym_id, set_id) references workout_sets (gym_id, id) on delete cascade
);
create index if not exists personal_records_member_idx on personal_records (member_id, exercise_id, achieved_at desc);
create index if not exists personal_records_week_idx on personal_records (gym_id, achieved_at desc);

-- Sets that no longer count as a bar: those behind a removed PR.
create or replace function set_is_discounted(p_set uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from personal_records r where r.set_id = p_set and r.removed_at is not null);
$$;

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

  -- Points: the gym's rule, the member's plan, and at most three a week.
  select points into v_rule from point_rules
   where gym_id = new.gym_id and key = 'personal_record' and is_active;
  if v_rule is not null and plan_allows(v_member, 'points_earn')
     and (select count(*) from personal_records r
           where r.member_id = v_member and r.gym_id = new.gym_id and r.points_awarded > 0
             and (r.achieved_at at time zone 'Asia/Manila')::date >= v_week) < 3 then
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
drop trigger if exists workout_sets_personal_record on workout_sets;
create trigger workout_sets_personal_record after insert on workout_sets
  for each row execute function trg_detect_personal_record();

create or replace function remove_personal_record(p_pr uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if coalesce(storage_role_here(), '') not in ('admin', 'staff') or not gym_writable() then
    raise exception 'Only the front desk can remove a record.' using errcode = '42501';
  end if;
  select * into r from personal_records where id = p_pr and gym_id = current_gym_id();
  if r.id is null then raise exception 'That record is not in this gym.'; end if;
  if r.removed_at is not null then return; end if;
  update personal_records set removed_at = now(), removed_by = auth.uid() where id = p_pr;
  if r.points_awarded > 0 then
    insert into point_ledger (gym_id, member_id, rule_key, points, source_table, source_id)
    values (r.gym_id, r.member_id, 'personal_record', -r.points_awarded, 'personal_records_removed', r.id)
    on conflict (gym_id, member_id, rule_key, source_table, source_id) do nothing;
  end if;
end;
$$;

-- A member's standing records (the best current one per exercise and kind).
create or replace function member_personal_records(p_member uuid)
returns table (id uuid, exercise_id uuid, exercise_name text, kind text, value numeric,
               previous numeric, achieved_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (p_member = auth.uid()
          or coalesce(storage_role_here() in ('admin', 'staff'), false)
          or (storage_role_here() = 'trainer' and is_my_trainee(p_member) and trainer_may_see(p_member, 'workouts'))) then
    raise exception 'Those records are not yours to see.' using errcode = '42501';
  end if;
  return query
    select distinct on (r.exercise_id, r.kind) r.id, r.exercise_id, e.name, r.kind, r.value, r.previous, r.achieved_at
      from personal_records r join exercises e on e.id = r.exercise_id
     where r.member_id = p_member and r.gym_id = current_gym_id() and r.removed_at is null
     order by r.exercise_id, r.kind, r.value desc;
end;
$$;

-- This week's records in the gym, opted-in members only.
create or replace function pr_wall()
returns table (first_name text, last_initial text, exercise_name text, kind text, value numeric, achieved_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.first_name::text, left(coalesce(p.last_name, ''), 1), e.name, r.kind, r.value, r.achieved_at
    from personal_records r
    join member_profiles mp on mp.profile_id = r.member_id and mp.gym_id = r.gym_id
    join profiles p on p.id = r.member_id
    join exercises e on e.id = r.exercise_id
   where r.gym_id = current_gym_id() and auth.uid() is not null
     and r.removed_at is null and mp.show_on_boards
     and (r.achieved_at at time zone 'Asia/Manila')::date >= date_trunc('week', now() at time zone 'Asia/Manila')::date
   order by r.achieved_at desc
   limit 30;
$$;

alter table personal_records enable row level security;
grant select on personal_records to authenticated;
drop policy if exists personal_records_read on personal_records;
create policy personal_records_read on personal_records for select to authenticated
  using (member_id = auth.uid() or coalesce(storage_role_here() in ('admin', 'staff'), false));

-- ---- 3. weekly quests -------------------------------------------------------------------------

alter table challenges add column if not exists repeats_weekly boolean not null default false;
alter table challenges add column if not exists parent_id uuid;
alter table challenges drop constraint if exists challenges_parent_fk;
alter table challenges add constraint challenges_parent_fk
  foreign key (gym_id, parent_id) references challenges (gym_id, id) on delete cascade;
create unique index if not exists challenges_one_copy_a_week on challenges (parent_id, starts_on)
  where parent_id is not null;

create or replace function roll_weekly_quests() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_week  date := date_trunc('week', now() at time zone 'Asia/Manila')::date;
  v_only  uuid := case when auth.uid() is not null then current_gym_id() end;
  t       record;
  v_child uuid;
  n       int := 0;
begin
  for t in
    select * from challenges
     where repeats_weekly and is_active and parent_id is null
       and (v_only is null or gym_id = v_only)
       and starts_on <= v_week + 6 and ends_on >= v_week
  loop
    perform act_as_gym(t.gym_id);
    insert into challenges (gym_id, title, description, metric_key, target, starts_on, ends_on,
                            reward_points, is_active, parent_id, image_url)
    values (t.gym_id, t.title, t.description, t.metric_key, t.target, v_week, v_week + 6,
            t.reward_points, true, t.id, t.image_url)
    on conflict (parent_id, starts_on) where parent_id is not null do nothing
    returning id into v_child;
    if v_child is null then
      select id into v_child from challenges where parent_id = t.id and starts_on = v_week;
    end if;
    -- Everyone active this week, including someone who joined the gym on Wednesday.
    insert into challenge_participants (gym_id, challenge_id, member_id)
    select t.gym_id, v_child, r.user_id
      from gym_roles r join member_profiles mp on mp.profile_id = r.user_id and mp.gym_id = r.gym_id
     where r.gym_id = t.gym_id and r.role = 'member' and r.status = 'active'
    on conflict do nothing;
    n := n + 1;
  end loop;
  perform act_as_gym(null);
  return n;
end;
$$;

-- ---- 4. seasons --------------------------------------------------------------------------------

create table if not exists season_tiers (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null default acting_gym_id() references gyms(id),
  name          text not null check (char_length(btrim(name)) between 1 and 40),
  points_needed int not null check (points_needed > 0),
  reward_id     uuid,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  unique (gym_id, id),
  foreign key (gym_id, reward_id) references rewards (gym_id, id) on delete set null (reward_id)
);

create table if not exists season_claims (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null default acting_gym_id() references gyms(id),
  member_id      uuid not null references profiles(id) on delete cascade,
  tier_id        uuid not null,
  season_start   date not null,
  claimed_at     timestamptz not null default now(),
  handed_over_at timestamptz,
  handed_by      uuid references profiles(id),
  unique (member_id, tier_id, season_start),
  foreign key (gym_id, tier_id) references season_tiers (gym_id, id) on delete cascade
);

create or replace function season_start() returns date
language sql stable as $$ select date_trunc('month', now() at time zone 'Asia/Manila')::date $$;

-- Points earned in this season (Manila month), in the caller's gym.
create or replace function season_score(p_member uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(points), 0)::int from point_ledger
   where member_id = p_member and gym_id = current_gym_id()
     and (created_at at time zone 'Asia/Manila')::date >= season_start();
$$;

create or replace function my_season()
returns table (season_start date, season_end date, score int, rank int, members_ranked int)
language sql stable security definer set search_path = public as $$
  with scores as (
    select r.user_id, season_score(r.user_id) as s
      from gym_roles r where r.gym_id = current_gym_id() and r.role = 'member' and r.status = 'active'
  )
  select season_start(), (season_start() + interval '1 month' - interval '1 day')::date,
         season_score(auth.uid()),
         (select count(*)::int + 1 from scores where s > season_score(auth.uid())),
         (select count(*)::int from scores);
$$;

create or replace function season_board()
returns table (first_name text, last_initial text, score int, is_me boolean)
language sql stable security definer set search_path = public as $$
  select p.first_name::text, left(coalesce(p.last_name, ''), 1), season_score(p.id), p.id = auth.uid()
    from member_profiles mp join profiles p on p.id = mp.profile_id
    join gym_roles r on r.user_id = mp.profile_id and r.gym_id = mp.gym_id and r.role = 'member' and r.status = 'active'
   where mp.gym_id = current_gym_id() and mp.show_on_boards and auth.uid() is not null
   order by 3 desc, 1
   limit 10;
$$;

create or replace function claim_season_reward(p_tier uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare t record; v_id uuid;
begin
  if storage_role_here() is distinct from 'member' or not gym_writable() then
    raise exception 'Only a member of this gym can claim a season reward.' using errcode = '42501';
  end if;
  select * into t from season_tiers where id = p_tier and gym_id = current_gym_id();
  if t.id is null then raise exception 'That tier is not in this gym.'; end if;
  if season_score(auth.uid()) < t.points_needed then
    raise exception 'You need % points this month for %.', t.points_needed, t.name;
  end if;
  insert into season_claims (gym_id, member_id, tier_id, season_start)
  values (t.gym_id, auth.uid(), t.id, season_start())
  on conflict (member_id, tier_id, season_start) do nothing
  returning id into v_id;
  if v_id is null then raise exception 'You already claimed % this month.', t.name; end if;
  return v_id;
end;
$$;

create or replace function open_season_claims()
returns table (id uuid, member_id uuid, member_name text, tier_name text, reward_name text, claimed_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(storage_role_here(), '') not in ('admin', 'staff') then
    raise exception 'Only the front desk sees claims.' using errcode = '42501';
  end if;
  return query
    select c.id, c.member_id, (p.first_name || ' ' || coalesce(p.last_name, ''))::text, t.name::text,
           rw.name::text, c.claimed_at
      from season_claims c
      join season_tiers t on t.id = c.tier_id
      join profiles p on p.id = c.member_id
      left join rewards rw on rw.id = t.reward_id
     where c.gym_id = current_gym_id() and c.handed_over_at is null
     order by c.claimed_at;
end;
$$;

create or replace function hand_over_season_claim(p_claim uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(storage_role_here(), '') not in ('admin', 'staff') or not gym_writable() then
    raise exception 'Only the front desk hands rewards over.' using errcode = '42501';
  end if;
  update season_claims set handed_over_at = now(), handed_by = auth.uid()
   where id = p_claim and gym_id = current_gym_id() and handed_over_at is null;
  if not found then raise exception 'That claim is not waiting here.'; end if;
end;
$$;

alter table season_tiers  enable row level security;
alter table season_claims enable row level security;
grant select, insert, update, delete on season_tiers to authenticated;
grant select on season_claims to authenticated;
drop policy if exists season_tiers_read  on season_tiers;
drop policy if exists season_tiers_write on season_tiers;
create policy season_tiers_read on season_tiers for select to authenticated using (true);
create policy season_tiers_write on season_tiers for all to authenticated
  using (storage_role_here() = 'admin') with check (storage_role_here() = 'admin');
drop policy if exists season_claims_read on season_claims;
create policy season_claims_read on season_claims for select to authenticated
  using (member_id = auth.uid() or coalesce(storage_role_here() in ('admin', 'staff'), false));

-- ---- 5. tenancy -------------------------------------------------------------------------------

create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_exercise_media','gym_invitations','gym_modules','gym_photos','gym_plans',
    'gym_program_days','gym_programs','gym_settings','gym_waivers','gym_workout_items','gym_workouts',
    'invoice_counters','member_profiles','member_share_prefs','membership_events',
    'membership_plans','membership_requests','memberships',
    'notifications','payments','pending_registrations','personal_records','plan_features',
    'point_ledger','point_rules',
    'program_enrolments','pt_sessions','refund_rules','renewal_requests','reward_redemptions','rewards',
    'saved_resources','season_claims','season_tiers',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_profiles',
    'trainer_ratings','waiver_acceptances','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routines','workout_sets']::text[]
$$;

do $$
declare t text;
begin
  foreach t in array array['personal_records', 'season_tiers', 'season_claims'] loop
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

revoke all on function set_show_on_boards(boolean), set_is_discounted(uuid), remove_personal_record(uuid),
  member_personal_records(uuid), pr_wall(), roll_weekly_quests(), season_score(uuid), my_season(),
  season_board(), claim_season_reward(uuid), open_season_claims(), hand_over_season_claim(uuid)
  from public, anon;
grant execute on function set_show_on_boards(boolean), set_is_discounted(uuid), remove_personal_record(uuid),
  member_personal_records(uuid), pr_wall(), roll_weekly_quests(), season_score(uuid), my_season(),
  season_board(), claim_season_reward(uuid), open_season_claims(), hand_over_season_claim(uuid)
  to authenticated;

-- ---- the probe's marker ------------------------------------------------------------------

create or replace function migration_0123_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0123_applied() from public, anon;
grant execute on function migration_0123_applied() to authenticated;
comment on function migration_0123_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0123.sql
