-- 0122 — A gym's own workouts and multi-week programs; the Premium lock; a
-- coach assigning one. The second half of the Content Studio
-- (docs/superpowers/specs/2026-09-26-content-studio-design.md; 0121 was the first).
--
-- ---- A PROGRAM DAY IS AN ORDINARY WORKOUT ------------------------------------------------
--
-- 0050's rule: extend `workout_logs`, never a second table. A program day is run
-- as a `workout_logs` row carrying `gym_workout_id` and `program_day_id`, in the
-- same full-screen player as a member's own routine. So it earns the same
-- points, counts for the same badges and streaks, and appears in history, with
-- no new code in any of those places. A day is "done" when a finished log points
-- at it — computed by `program_progress()`, never stored as a tick that could
-- disagree with the history.
--
-- ---- THE PREMIUM LOCK LOCKS AND EXPLAINS, NEVER HIDES ------------------------------------
--
-- 0049's rule. A Premium program's *row* (name, description, cover) is readable
-- by every member of the gym, so the screen can show it with a lock and the
-- reason. Its days and its workouts are not, and it cannot be started. The gate
-- is `plan_allows(member, 'premium_programs')` — the function RLS and the screen
-- share, so they cannot drift. Exercise guides (0121) are never locked.
--
-- ---- WHO BUILDS WHAT ------------------------------------------------------------------
--
-- The owner builds programs, on the admin website. Trainers build workouts (their
-- own; the owner edits any) and assign a program to their own trainees (0082's
-- `is_my_trainee`). The front desk reads. Everything starts as a draft.
--
-- ---- ENROLMENTS ARE WRITTEN BY FUNCTIONS ONLY -----------------------------------------
--
-- `program_enrolments` has no write policy for anybody. start_program,
-- leave_program and assign_program are the writers, and each checks the lock.

-- ---- 1. workouts ---------------------------------------------------------------------------

create table if not exists gym_workouts (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null default acting_gym_id() references gyms(id),
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  notes      text check (notes is null or char_length(notes) <= 500),
  level      class_level not null default 'all_levels',
  published  boolean not null default false,
  hidden     boolean not null default false,
  created_by uuid not null default auth.uid() references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gym_id, id)
);

create table if not exists gym_workout_items (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null default acting_gym_id() references gyms(id),
  workout_id     uuid not null,
  position       int not null default 0,
  exercise_id    uuid not null references exercises(id) on delete restrict,
  target_sets    int not null default 3 check (target_sets between 1 and 20),
  target_reps    int check (target_reps is null or target_reps between 1 and 200),
  target_seconds int check (target_seconds is null or target_seconds between 1 and 7200),
  rest_seconds   int not null default 90 check (rest_seconds between 0 and 600),
  foreign key (gym_id, workout_id) references gym_workouts (gym_id, id) on delete cascade
);
create index if not exists gym_workout_items_workout_idx on gym_workout_items (workout_id, position);

-- ---- 2. programs -----------------------------------------------------------------------------

create table if not exists gym_programs (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null default acting_gym_id() references gyms(id),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  description text check (description is null or char_length(description) <= 1000),
  cover_url   text,
  level       class_level not null default 'all_levels',
  weeks       int not null default 4 check (weeks between 1 and 16),
  premium     boolean not null default false,
  published   boolean not null default false,
  hidden      boolean not null default false,
  created_by  uuid not null default auth.uid() references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (gym_id, id)
);

create table if not exists gym_program_days (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null default acting_gym_id() references gyms(id),
  program_id uuid not null,
  week       int not null check (week between 1 and 16),
  day        int not null check (day between 1 and 7),
  workout_id uuid not null,
  unique (program_id, week, day),
  unique (gym_id, id),
  foreign key (gym_id, program_id) references gym_programs (gym_id, id) on delete cascade,
  foreign key (gym_id, workout_id) references gym_workouts (gym_id, id) on delete restrict
);
create index if not exists gym_program_days_program_idx on gym_program_days (program_id, week, day);

create table if not exists program_enrolments (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null default acting_gym_id() references gyms(id),
  program_id  uuid not null,
  member_id   uuid not null references profiles(id) on delete cascade,
  status      text not null default 'active' check (status in ('active', 'finished', 'left')),
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  assigned_by uuid references profiles(id),
  foreign key (gym_id, program_id) references gym_programs (gym_id, id) on delete cascade
);
-- One program at a time: "which one am I on?" has one answer.
create unique index if not exists program_enrolments_one_active
  on program_enrolments (gym_id, member_id) where status = 'active';

-- ---- 3. a program day runs as a workout log -----------------------------------------------

alter table workout_logs add column if not exists gym_workout_id uuid;
alter table workout_logs add column if not exists program_day_id uuid;
alter table workout_logs drop constraint if exists workout_logs_gym_workout_fk;
alter table workout_logs add constraint workout_logs_gym_workout_fk
  foreign key (gym_id, gym_workout_id) references gym_workouts (gym_id, id) on delete set null (gym_workout_id);
alter table workout_logs drop constraint if exists workout_logs_program_day_fk;
alter table workout_logs add constraint workout_logs_program_day_fk
  foreign key (gym_id, program_day_id) references gym_program_days (gym_id, id) on delete set null (program_day_id);
create index if not exists workout_logs_program_day_idx on workout_logs (program_day_id) where program_day_id is not null;

-- ---- 4. the Premium feature ------------------------------------------------------------------

insert into features (key, label, description, default_free, default_freemium, default_premium, sort_order)
values ('premium_programs', 'Premium programs',
        'Follow the gym''s Premium training programs, week by week.',
        false, false, true, 20)
on conflict (key) do nothing;
select sync_plan_features();

-- ---- 5. who may see what ------------------------------------------------------------------------

-- The gym's working side: owner, desk and coaches see every row of their gym.
create or replace function content_staff_here() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(storage_role_here() in ('admin', 'staff', 'trainer'), false);
$$;

create or replace function program_unlocked(p_program uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from gym_programs p
     where p.id = p_program
       and (not p.premium or content_staff_here() or plan_allows(auth.uid(), 'premium_programs')));
$$;

create or replace function program_open_to_members(p_program uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from gym_programs p where p.id = p_program and p.published and not p.hidden);
$$;

-- A member sees a workout only through a published program they may open.
create or replace function member_may_see_workout(p_workout uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from gym_program_days d
     where d.workout_id = p_workout
       and program_open_to_members(d.program_id)
       and program_unlocked(d.program_id));
$$;

create or replace function may_edit_workout(p_workout uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select storage_role_here() = 'admin'
      or (storage_role_here() = 'trainer'
          and exists (select 1 from gym_workouts w where w.id = p_workout and w.created_by = auth.uid()));
$$;

-- An exercise a gym's workout may use: the shared library, or the gym's own.
create or replace function exercise_usable_here(p_exercise uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from exercises e
                  where e.id = p_exercise and (e.gym_id is null or e.gym_id = current_gym_id()));
$$;

alter table gym_workouts       enable row level security;
alter table gym_workout_items  enable row level security;
alter table gym_programs       enable row level security;
alter table gym_program_days   enable row level security;
alter table program_enrolments enable row level security;
grant select, insert, update, delete on gym_workouts, gym_workout_items, gym_programs, gym_program_days
  to authenticated;
grant select on program_enrolments to authenticated;

drop policy if exists gym_workouts_read   on gym_workouts;
drop policy if exists gym_workouts_insert on gym_workouts;
drop policy if exists gym_workouts_update on gym_workouts;
drop policy if exists gym_workouts_delete on gym_workouts;
create policy gym_workouts_read on gym_workouts for select to authenticated
  using (content_staff_here() or member_may_see_workout(id));
create policy gym_workouts_insert on gym_workouts for insert to authenticated
  with check (storage_role_here() in ('admin', 'trainer') and created_by = auth.uid());
create policy gym_workouts_update on gym_workouts for update to authenticated
  using (may_edit_workout(id)) with check (storage_role_here() in ('admin', 'trainer'));
create policy gym_workouts_delete on gym_workouts for delete to authenticated
  using (may_edit_workout(id));

drop policy if exists gym_workout_items_read  on gym_workout_items;
drop policy if exists gym_workout_items_write on gym_workout_items;
create policy gym_workout_items_read on gym_workout_items for select to authenticated
  using (content_staff_here() or member_may_see_workout(workout_id));
create policy gym_workout_items_write on gym_workout_items for all to authenticated
  using (may_edit_workout(workout_id))
  with check (may_edit_workout(workout_id) and exercise_usable_here(exercise_id));

drop policy if exists gym_programs_read  on gym_programs;
drop policy if exists gym_programs_write on gym_programs;
-- The row stays readable when locked: the lock has to be able to explain itself.
create policy gym_programs_read on gym_programs for select to authenticated
  using (content_staff_here() or (published and not hidden));
create policy gym_programs_write on gym_programs for all to authenticated
  using (storage_role_here() = 'admin')
  with check (storage_role_here() = 'admin');

drop policy if exists gym_program_days_read  on gym_program_days;
drop policy if exists gym_program_days_write on gym_program_days;
create policy gym_program_days_read on gym_program_days for select to authenticated
  using (content_staff_here() or (program_open_to_members(program_id) and program_unlocked(program_id)));
create policy gym_program_days_write on gym_program_days for all to authenticated
  using (storage_role_here() = 'admin')
  with check (storage_role_here() = 'admin');

drop policy if exists program_enrolments_read on program_enrolments;
create policy program_enrolments_read on program_enrolments for select to authenticated
  using (member_id = auth.uid()
         or coalesce(storage_role_here() in ('admin', 'staff'), false)
         or (storage_role_here() = 'trainer' and is_my_trainee(member_id)));

-- The author and the gym never change on edit; the timestamp does.
create or replace function trg_content_keep_author() returns trigger
language plpgsql as $$
begin
  new.created_by := old.created_by;
  new.gym_id := old.gym_id;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists gym_workouts_author on gym_workouts;
create trigger gym_workouts_author before update on gym_workouts
  for each row execute function trg_content_keep_author();
drop trigger if exists gym_programs_author on gym_programs;
create trigger gym_programs_author before update on gym_programs
  for each row execute function trg_content_keep_author();

-- ---- 6. following a program -----------------------------------------------------------------

-- Whether a member's own plan includes Premium programs, whoever is asking.
-- plan_allows() answers "yes" for an admin or desk caller (0049: the gym is
-- never gated), which is right for their own screens but wrong when the owner
-- assigns a Premium program to somebody on the free plan.
create or replace function member_has_premium_programs(p_member uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare m record; v boolean;
begin
  select * into m from current_membership_of(p_member);
  if m.plan_id is null or not membership_is_usable(m.status, m.expiry_date, m.never_expires) then
    return false;
  end if;
  select pf.enabled into v from plan_features pf
   where pf.plan_id = m.plan_id and pf.feature_key = 'premium_programs';
  return coalesce(v, false);
end;
$$;

create or replace function enrol_member(p_member uuid, p_program uuid, p_by uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_id uuid;
begin
  update program_enrolments set status = 'left', ended_at = now()
   where gym_id = v_gym and member_id = p_member and status = 'active' and program_id <> p_program;
  select id into v_id from program_enrolments
   where gym_id = v_gym and member_id = p_member and program_id = p_program and status = 'active';
  if v_id is null then
    insert into program_enrolments (gym_id, program_id, member_id, assigned_by)
    values (v_gym, p_program, p_member, p_by) returning id into v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function enrol_member(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function start_program(p_program uuid) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or storage_role_here() is distinct from 'member' or not gym_writable() then
    raise exception 'Only a member of this gym can follow a program.' using errcode = '42501';
  end if;
  if not exists (select 1 from gym_programs where id = p_program and gym_id = current_gym_id()
                  and published and not hidden) then
    raise exception 'That program is not available.';
  end if;
  if not program_unlocked(p_program) then
    raise exception 'That program is part of Premium. Ask the desk about upgrading.' using errcode = '42501';
  end if;
  return enrol_member(auth.uid(), p_program, null);
end;
$$;

create or replace function leave_program(p_program uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update program_enrolments set status = 'left', ended_at = now()
   where member_id = auth.uid() and program_id = p_program and status = 'active'
     and gym_id = current_gym_id();
  if not found then raise exception 'You are not following that program.'; end if;
end;
$$;

create or replace function assign_program(p_member uuid, p_program uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); v_name text; v_premium boolean; v_id uuid;
begin
  if not gym_writable() or not (storage_role_here() = 'admin'
       or (storage_role_here() = 'trainer' and is_my_trainee(p_member))) then
    raise exception 'You can assign programs only to your own trainees.' using errcode = '42501';
  end if;
  if not exists (select 1 from gym_roles where user_id = p_member and gym_id = v_gym
                  and role = 'member' and status = 'active') then
    raise exception 'That person is not an active member here.';
  end if;
  select name, premium into v_name, v_premium from gym_programs
   where id = p_program and gym_id = v_gym and published and not hidden;
  if v_name is null then raise exception 'That program is not published.'; end if;
  if v_premium and not member_has_premium_programs(p_member) then
    raise exception 'That program is part of Premium, and this member''s plan does not include it.'
      using errcode = '42501';
  end if;
  v_id := enrol_member(p_member, p_program, auth.uid());
  perform notify_once(p_member, 'program', 'A program for you',
    'Your coach set you on ' || v_name || '. Open it to see this week.',
    '/member/program/' || p_program, 'program:' || v_id, v_gym);
  return v_id;
end;
$$;

-- Run one day: an ordinary workout log, in the ordinary player.
create or replace function start_program_day(p_day uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare d record; v_log uuid;
begin
  select pd.id, pd.gym_id, pd.program_id, pd.workout_id, w.name into d
    from gym_program_days pd join gym_workouts w on w.id = pd.workout_id
   where pd.id = p_day and pd.gym_id = current_gym_id();
  if d.id is null then raise exception 'That day is not part of a program here.'; end if;
  if not exists (select 1 from program_enrolments where member_id = auth.uid()
                  and program_id = d.program_id and status = 'active') then
    raise exception 'Start the program first.';
  end if;
  if not program_unlocked(d.program_id) then
    raise exception 'That program is part of Premium. Ask the desk about upgrading.' using errcode = '42501';
  end if;
  insert into workout_logs (member_id, gym_id, activity, gym_workout_id, program_day_id)
  values (auth.uid(), d.gym_id, d.name, d.workout_id, d.id)
  returning id into v_log;
  return v_log;
end;
$$;

-- The active program and every day in it, each marked done when a finished log
-- points at it. The member, the desk, or that member's coach.
create or replace function program_progress(p_member uuid)
returns table (program_id uuid, program_name text, day_id uuid, week int, day int,
               workout_id uuid, workout_name text, done boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (p_member = auth.uid()
          or coalesce(storage_role_here() in ('admin', 'staff'), false)
          or (storage_role_here() = 'trainer' and is_my_trainee(p_member))) then
    raise exception 'That progress is not yours to see.' using errcode = '42501';
  end if;
  return query
    select p.id, p.name, d.id, d.week, d.day, w.id, w.name,
           exists (select 1 from workout_logs l
                    where l.member_id = p_member and l.program_day_id = d.id and l.completed_at is not null)
      from program_enrolments e
      join gym_programs p on p.id = e.program_id
      join gym_program_days d on d.program_id = p.id and d.week <= p.weeks
      join gym_workouts w on w.id = d.workout_id
     where e.member_id = p_member and e.status = 'active' and e.gym_id = current_gym_id()
     order by d.week, d.day;
end;
$$;

-- ---- 7. the starter pack ------------------------------------------------------------------------
-- Copied into the gym as drafts, built from the shared exercises (0121 gave
-- them cues and steps). A copy, so editing it never changes another gym's.

create or replace function copy_starter_program(p_key text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_gym  uuid := current_gym_id();
  spec   jsonb;
  v_prog uuid;
  v_w    uuid[] := '{}';
  v_wid  uuid;
  w      jsonb;
  it     jsonb;
  n      int;
  wk     int;
  i      int;
begin
  if storage_role_here() is distinct from 'admin' or not gym_writable() then
    raise exception 'Only the gym owner adds starter programs.' using errcode = '42501';
  end if;

  spec := case p_key
    when 'beginner_full_body' then '{
      "name": "3-Day Beginner Full Body",
      "description": "Three full-body sessions a week for four weeks. Two workouts, alternated, so every muscle trains twice a week with rest between.",
      "level": "beginner",
      "days": [1, 3, 5],
      "rotation": [[0,1,0],[1,0,1],[0,1,0],[1,0,1]],
      "workouts": [
        {"name": "Full Body A", "items": [
          {"exercise": "Back Squat", "sets": 3, "reps": 8, "rest": 120},
          {"exercise": "Push-up", "sets": 3, "reps": 10, "rest": 60},
          {"exercise": "Seated Cable Row", "sets": 3, "reps": 10, "rest": 60},
          {"exercise": "Plank", "sets": 3, "seconds": 30, "rest": 45}]},
        {"name": "Full Body B", "items": [
          {"exercise": "Romanian Deadlift", "sets": 3, "reps": 8, "rest": 120},
          {"exercise": "Dumbbell Shoulder Press", "sets": 3, "reps": 10, "rest": 60},
          {"exercise": "Lat Pulldown", "sets": 3, "reps": 10, "rest": 60},
          {"exercise": "Walking Lunge", "sets": 2, "reps": 10, "rest": 60}]}]}'::jsonb
    when 'push_pull_legs' then '{
      "name": "Push / Pull / Legs",
      "description": "The classic three-day split for four weeks: pushing muscles, pulling muscles, then legs.",
      "level": "intermediate",
      "days": [1, 3, 5],
      "rotation": [[0,1,2],[0,1,2],[0,1,2],[0,1,2]],
      "workouts": [
        {"name": "Push", "items": [
          {"exercise": "Barbell Bench Press", "sets": 4, "reps": 8, "rest": 120},
          {"exercise": "Overhead Press", "sets": 3, "reps": 8, "rest": 90},
          {"exercise": "Incline Dumbbell Press", "sets": 3, "reps": 10, "rest": 75},
          {"exercise": "Triceps Pushdown", "sets": 3, "reps": 12, "rest": 60}]},
        {"name": "Pull", "items": [
          {"exercise": "Deadlift", "sets": 3, "reps": 5, "rest": 150},
          {"exercise": "Barbell Row", "sets": 3, "reps": 8, "rest": 90},
          {"exercise": "Lat Pulldown", "sets": 3, "reps": 10, "rest": 75},
          {"exercise": "Barbell Curl", "sets": 3, "reps": 12, "rest": 60}]},
        {"name": "Legs", "items": [
          {"exercise": "Back Squat", "sets": 4, "reps": 8, "rest": 150},
          {"exercise": "Leg Press", "sets": 3, "reps": 10, "rest": 90},
          {"exercise": "Leg Curl", "sets": 3, "reps": 12, "rest": 60},
          {"exercise": "Calf Raise", "sets": 3, "reps": 15, "rest": 45}]}]}'::jsonb
  end;
  if spec is null then
    raise exception 'There is no starter program called %.', p_key;
  end if;

  insert into gym_programs (gym_id, name, description, level, weeks, created_by)
  values (v_gym, spec->>'name', spec->>'description', (spec->>'level')::class_level,
          jsonb_array_length(spec->'rotation'), auth.uid())
  returning id into v_prog;

  for w in select value from jsonb_array_elements(spec->'workouts') loop
    insert into gym_workouts (gym_id, name, level, created_by)
    values (v_gym, w->>'name', (spec->>'level')::class_level, auth.uid())
    returning id into v_wid;
    v_w := v_w || v_wid;
    n := 0;
    for it in select value from jsonb_array_elements(w->'items') loop
      insert into gym_workout_items (gym_id, workout_id, position, exercise_id,
                                     target_sets, target_reps, target_seconds, rest_seconds)
      select v_gym, v_wid, n, e.id, (it->>'sets')::int, (it->>'reps')::int, (it->>'seconds')::int,
             coalesce((it->>'rest')::int, 90)
        from exercises e where e.gym_id is null and lower(e.name) = lower(it->>'exercise')
       limit 1;
      n := n + 1;
    end loop;
  end loop;

  for wk in 1 .. jsonb_array_length(spec->'rotation') loop
    for i in 0 .. jsonb_array_length(spec->'days') - 1 loop
      insert into gym_program_days (gym_id, program_id, week, day, workout_id)
      values (v_gym, v_prog, wk, (spec->'days'->>i)::int,
              v_w[(spec->'rotation'->(wk - 1)->>i)::int + 1]);
    end loop;
  end loop;

  return v_prog;
end;
$$;

-- ---- 8. tenancy ------------------------------------------------------------------------------

create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_exercise_media','gym_invitations','gym_modules','gym_photos','gym_plans',
    'gym_program_days','gym_programs','gym_settings','gym_waivers','gym_workout_items','gym_workouts',
    'invoice_counters','member_profiles','member_share_prefs','membership_events',
    'membership_plans','membership_requests','memberships',
    'notifications','payments','pending_registrations','plan_features','point_ledger','point_rules',
    'program_enrolments','pt_sessions','refund_rules','renewal_requests','reward_redemptions','rewards',
    'saved_resources',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_profiles',
    'trainer_ratings','waiver_acceptances','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routines','workout_sets']::text[]
$$;

do $$
declare t text;
begin
  foreach t in array array['gym_workouts', 'gym_workout_items', 'gym_programs', 'gym_program_days',
                           'program_enrolments'] loop
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

revoke all on function content_staff_here(), program_unlocked(uuid), program_open_to_members(uuid),
  member_may_see_workout(uuid), may_edit_workout(uuid), exercise_usable_here(uuid),
  member_has_premium_programs(uuid), start_program(uuid), leave_program(uuid),
  assign_program(uuid, uuid), start_program_day(uuid), program_progress(uuid),
  copy_starter_program(text)
  from public, anon;
grant execute on function content_staff_here(), program_unlocked(uuid), program_open_to_members(uuid),
  member_may_see_workout(uuid), may_edit_workout(uuid), exercise_usable_here(uuid),
  member_has_premium_programs(uuid), start_program(uuid), leave_program(uuid),
  assign_program(uuid, uuid), start_program_day(uuid), program_progress(uuid),
  copy_starter_program(text)
  to authenticated;

-- ---- the probe's marker ------------------------------------------------------------------

create or replace function migration_0122_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0122_applied() from public, anon;
grant execute on function migration_0122_applied() to authenticated;
comment on function migration_0122_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0122.sql
