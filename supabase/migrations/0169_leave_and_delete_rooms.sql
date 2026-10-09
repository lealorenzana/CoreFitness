-- ============================================================================
-- 0169 — Leave any room; a trainer closes or deletes their own
-- ============================================================================
--
-- A member could leave only a coaching group (joined by code). A class room and
-- a 1-on-1 room are *computed* — everyone who booked the class in the last 60
-- days, the trainee of the sessions (0128) — so there was no way out of one, and
-- a trainer could close only a group and delete nothing.
--
--   * leave_room() now works for every room. A group membership is deleted as
--     before; leaving a class or 1-on-1 room is remembered in room_leaves, and
--     room_member_ids() skips the member until they come back on their own: a
--     new booking of that class, or a new session with that coach, made after
--     they left.
--   * set_room_archived() lets a trainer close or reopen any of their rooms, and
--     rooms.closed_by_trainer stops sync_gym_rooms() reopening a class room the
--     trainer closed (it reopened every class room whose class was active).
--   * delete_room(): a trainer deletes their own coaching group — its posts,
--     comments and classwork go with it (foreign keys cascade). Class and
--     1-on-1 rooms are closed instead: the sweep would only make them again.
-- ============================================================================

create table if not exists room_leaves (
  gym_id    uuid not null default acting_gym_id() references gyms(id) on delete cascade,
  room_id   uuid not null,
  member_id uuid not null references profiles(id) on delete cascade,
  left_at   timestamptz not null default now(),
  primary key (room_id, member_id),
  foreign key (gym_id, room_id) references rooms (gym_id, id) on delete cascade
);
alter table room_leaves enable row level security;
drop policy if exists room_leaves_own on room_leaves;
create policy room_leaves_own on room_leaves for select to authenticated using (member_id = auth.uid());

alter table rooms add column if not exists closed_by_trainer boolean not null default false;

-- 0128's rule, with a leave honoured until the member comes back on their own.
create or replace function room_member_ids(p_room uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.member_id from rooms r join room_members m on m.room_id = r.id
   where r.id = p_room and r.kind = 'group'
  union
  select r.member_id from rooms r
   where r.id = p_room and r.kind = 'pt'
     and not exists (
       select 1 from room_leaves l where l.room_id = r.id and l.member_id = r.member_id
          and l.left_at > coalesce((select max(s.created_at) from pt_sessions s
                                     where s.gym_id = r.gym_id and s.trainer_id = r.trainer_id and s.member_id = r.member_id),
                                   '-infinity'::timestamptz))
  union
  select x.member_id from (
    select b.member_id, max(b.requested_at) as last_booked
      from rooms r
      join classes c  on c.template_id = r.template_id and c.gym_id = r.gym_id
      join bookings b on b.class_id = c.id and b.gym_id = r.gym_id
     where r.id = p_room and r.kind = 'class'
       and b.status <> 'cancelled'
       and c.scheduled_at >= now() - interval '60 days'
     group by b.member_id) x
   where not exists (select 1 from room_leaves l where l.room_id = p_room and l.member_id = x.member_id
                       and l.left_at > x.last_booked);
$$;

create or replace function leave_room(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  select * into r from rooms where id = p_room and gym_id = current_gym_id();
  if r.id is null or not is_in_room(p_room, auth.uid()) then
    raise exception 'You are not in that room.';
  end if;
  if r.kind = 'group' then
    delete from room_members where room_id = p_room and member_id = auth.uid() and gym_id = r.gym_id;
  else
    insert into room_leaves (gym_id, room_id, member_id, left_at) values (r.gym_id, p_room, auth.uid(), now())
    on conflict (room_id, member_id) do update set left_at = excluded.left_at;
  end if;
end;
$$;

create or replace function set_room_archived(p_room uuid, p_archived boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  select * into r from rooms where id = p_room and gym_id = current_gym_id();
  if r.id is null or r.trainer_id is distinct from auth.uid() or not gym_writable() then
    raise exception 'Only this room''s trainer can close or reopen it.' using errcode = '42501';
  end if;
  update rooms set archived_at = case when p_archived then now() end, closed_by_trainer = p_archived where id = p_room;
end;
$$;

create or replace function delete_room(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  select * into r from rooms where id = p_room and gym_id = current_gym_id();
  if r.id is null or r.trainer_id is distinct from auth.uid() or not gym_writable() then
    raise exception 'Only this room''s trainer can delete it.' using errcode = '42501';
  end if;
  if r.kind <> 'group' then
    raise exception 'A class or 1-on-1 room comes back by itself while the class or the sessions continue — close it instead.';
  end if;
  delete from rooms where id = p_room;
end;
$$;
revoke all on function delete_room(uuid) from public, anon;
grant execute on function delete_room(uuid) to authenticated;

-- 0128's sweep, except it never reopens a room its trainer closed.
create or replace function sync_gym_rooms() returns int
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id(); n int := 0; k int;
begin
  if v_gym is null or storage_role_here() is null then return 0; end if;

  insert into rooms (gym_id, kind, trainer_id, template_id, name)
  select t.gym_id, 'class', t.trainer_id, t.id, t.name
    from class_templates t
   where t.gym_id = v_gym and t.active and t.trainer_id is not null
  on conflict (gym_id, template_id) where kind = 'class' do nothing;
  get diagnostics k = row_count; n := n + k;

  update rooms r set trainer_id = t.trainer_id, name = t.name
    from class_templates t
   where r.gym_id = v_gym and r.kind = 'class' and t.id = r.template_id and t.gym_id = r.gym_id
     and t.trainer_id is not null
     and (r.trainer_id is distinct from t.trainer_id or r.name is distinct from t.name);
  update rooms r set archived_at = now()
    from class_templates t
   where r.gym_id = v_gym and r.kind = 'class' and t.id = r.template_id and r.archived_at is null
     and (not t.active or t.trainer_id is null);
  update rooms r set archived_at = null
    from class_templates t
   where r.gym_id = v_gym and r.kind = 'class' and t.id = r.template_id and r.archived_at is not null
     and t.active and t.trainer_id is not null and not r.closed_by_trainer;

  insert into rooms (gym_id, kind, trainer_id, member_id, name)
  select distinct s.gym_id, 'pt', s.trainer_id, s.member_id,
         left(coalesce(nullif(btrim(p.first_name || ' ' || p.last_name), ''), 'Trainee') || ' · 1-on-1', 80)
    from pt_sessions s join profiles p on p.id = s.member_id
   where s.gym_id = v_gym
  on conflict (gym_id, trainer_id, member_id) where kind = 'pt' do nothing;
  get diagnostics k = row_count; n := n + k;
  return n;
end;
$$;

-- ---- tenancy ---------------------------------------------------------------------------------------
-- 0167's list plus room_leaves.
create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'ai_coach_profiles','ai_meal_guides','ai_proposals','ai_usage_days',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','conversations','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_exercise_media','gym_goals','gym_house_rules','gym_invitations','gym_modules','gym_payment_methods','gym_photos','gym_plans',
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
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_profiles',
    'trainer_ratings','waiver_acceptances','winback_rules','winback_sends','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routines','workout_sets']::text[]
$$;

drop policy if exists tenant_select on room_leaves;
drop policy if exists tenant_insert on room_leaves;
drop policy if exists tenant_update on room_leaves;
drop policy if exists tenant_delete on room_leaves;
create policy tenant_select on room_leaves as restrictive for select to anon, authenticated using (gym_id = current_gym_id());
create policy tenant_insert on room_leaves as restrictive for insert to anon, authenticated with check (gym_id = current_gym_id() and gym_writable());
create policy tenant_update on room_leaves as restrictive for update to anon, authenticated
  using (gym_id = current_gym_id() and gym_writable()) with check (gym_id = current_gym_id());
create policy tenant_delete on room_leaves as restrictive for delete to anon, authenticated using (gym_id = current_gym_id() and gym_writable());

create or replace function migration_0169_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0169_applied() from public, anon;
grant execute on function migration_0169_applied() to authenticated;
comment on function migration_0169_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0169.sql
