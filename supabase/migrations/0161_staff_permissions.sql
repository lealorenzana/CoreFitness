-- ============================================================================
-- 0161 — What each front-desk account may do, set by the owner, kept by the database
-- ============================================================================
--
-- `staff` has been one fixed set since 0011/0012: payments, check-ins, member
-- desk work, bookings, the shop, announcements and events, handing rewards
-- over. A gym with a cashier who should not touch bookings, or a part-timer
-- who only checks people in, had nothing between "all of it" and "no account".
--
-- Now an owner narrows one staff account to the parts of the desk it runs. A
-- staff account with no row here keeps the whole desk, so nothing changes for
-- any gym until its owner decides otherwise.
--
-- ---- WHERE IT IS ENFORCED -----------------------------------------------------------------------
--
-- Not in the sidebar — that only hides links. Two places, both in SQL:
--   * a RESTRICTIVE policy per table and command (restrictive policies AND with
--     every other policy, so no existing policy is rewritten, and
--     `staff_may()` is true for everyone who is not staff — members, coaches,
--     the owner are untouched);
--   * a BEFORE trigger on the same tables for writes, because SECURITY DEFINER
--     functions (record_sale, void_sale, close_cash_day, set_account_status,
--     mark_redemption_collected, …) bypass RLS but not triggers, and still run
--     as the staff member who called them.
-- Announcements are the exception: notifications are also written by the
-- system on behalf of whoever caused them (a payment receipt the desk's
-- payment triggers), so only the desk's own direct writes — the broadcast and
-- its recall — are gated, by policy, never by trigger.
--
-- A session-less run (pg_cron, maintenance) is never staff, so it passes.
-- ============================================================================

create table if not exists staff_permissions (
  gym_id     uuid not null default acting_gym_id() references gyms(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  areas      text[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id),
  primary key (gym_id, user_id),
  constraint staff_permissions_known_areas
    check (areas <@ array['checkins', 'payments', 'members', 'bookings', 'shop', 'communications', 'rewards']::text[])
);
alter table staff_permissions enable row level security;
drop policy if exists staff_permissions_read on staff_permissions;
create policy staff_permissions_read on staff_permissions for select to authenticated
  using (user_id = auth.uid() or get_my_role() = 'admin');
-- No write policy: set_staff_permissions() only.

-- ---- the one question every gate asks ------------------------------------------------------------
create or replace function staff_may(p_area text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then true
    when get_my_role() is distinct from 'staff' then true
    else coalesce((select p_area = any (sp.areas) from staff_permissions sp
                    where sp.gym_id = current_gym_id() and sp.user_id = auth.uid()), true)
  end;
$$;
revoke all on function staff_may(text) from public, anon;
grant execute on function staff_may(text) to authenticated;

create or replace function trg_staff_area() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_area text := tg_argv[0];
begin
  if not staff_may(v_area) then
    raise exception 'This account is not allowed to work on % here — the owner sets that under Staff accounts.',
      case v_area when 'checkins' then 'check-ins' when 'members' then 'members'' details' when 'communications' then 'announcements and events'
                  else v_area end
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- ---- the gates ----------------------------------------------------------------------------------------
do $$
declare
  g record;
begin
  -- (table, area, gate reads too?)
  for g in select * from (values
      ('payments', 'payments', true), ('cash_closeouts', 'payments', true), ('memberships', 'payments', false),
      ('renewal_requests', 'payments', false),
      ('attendance', 'checkins', false),
      ('member_profiles', 'members', false), ('membership_events', 'members', false), ('membership_requests', 'members', false),
      ('bookings', 'bookings', false), ('pt_sessions', 'bookings', false), ('class_waitlist', 'bookings', false),
      ('shop_sales', 'shop', true), ('shop_sale_items', 'shop', true), ('stock_moves', 'shop', false),
      ('events', 'communications', false),
      ('reward_redemptions', 'rewards', false), ('season_claims', 'rewards', false)
    ) as t(tbl, area, reads)
  loop
    if to_regclass('public.' || g.tbl) is null then continue; end if;
    execute format('drop policy if exists staff_area_write on %I', g.tbl);
    execute format('drop policy if exists staff_area_update on %I', g.tbl);
    execute format('drop policy if exists staff_area_delete on %I', g.tbl);
    execute format('drop policy if exists staff_area_read on %I', g.tbl);
    execute format('create policy staff_area_write on %I as restrictive for insert to authenticated with check (staff_may(%L))', g.tbl, g.area);
    execute format('create policy staff_area_update on %I as restrictive for update to authenticated using (staff_may(%L)) with check (staff_may(%L))', g.tbl, g.area, g.area);
    execute format('create policy staff_area_delete on %I as restrictive for delete to authenticated using (staff_may(%L))', g.tbl, g.area);
    if g.reads then
      execute format('create policy staff_area_read on %I as restrictive for select to authenticated using (staff_may(%L))', g.tbl, g.area);
    end if;
    execute format('drop trigger if exists staff_area_guard on %I', g.tbl);
    execute format('create trigger staff_area_guard before insert or update or delete on %I for each row execute function trg_staff_area(%L)', g.tbl, g.area);
  end loop;
end $$;

-- Approvals and account status (set_account_status) change someone else's
-- gym_roles row: gated as members' details. A person's own row — joining
-- another gym, accepting an invitation — never is.
create or replace function trg_staff_roles() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_who uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
begin
  if v_who is distinct from auth.uid() and not staff_may('members') then
    raise exception 'This account is not allowed to change members'' accounts here — the owner sets that under Staff accounts.'
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
drop trigger if exists staff_area_guard on gym_roles;
create trigger staff_area_guard before insert or update or delete on gym_roles
  for each row execute function trg_staff_roles();

-- Announcements: the desk's own writes only (see the header).
drop policy if exists staff_area_write on notifications;
drop policy if exists staff_area_delete on notifications;
create policy staff_area_write on notifications as restrictive for insert to authenticated with check (staff_may('communications'));
create policy staff_area_delete on notifications as restrictive for delete to authenticated using (staff_may('communications'));

-- ---- reading and setting -------------------------------------------------------------------------------
-- The caller's own areas: null = the whole desk (no row, or not staff).
create or replace function my_staff_permissions() returns text[]
language sql stable security definer set search_path = public as $$
  select sp.areas from staff_permissions sp
   where sp.gym_id = current_gym_id() and sp.user_id = auth.uid() and get_my_role() = 'staff';
$$;
revoke all on function my_staff_permissions() from public, anon;
grant execute on function my_staff_permissions() to authenticated;

-- Owner only. NULL areas = back to the whole desk (the row goes).
create or replace function set_staff_permissions(p_user uuid, p_areas text[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_gym uuid := current_gym_id();
begin
  if get_my_role() is distinct from 'admin' or not gym_writable() then
    raise exception 'Only the gym owner sets what a staff account may do.' using errcode = '42501';
  end if;
  if not exists (select 1 from gym_roles where gym_id = v_gym and user_id = p_user and role = 'staff') then
    raise exception 'That person is not on this gym''s staff.';
  end if;
  if p_areas is null then
    delete from staff_permissions where gym_id = v_gym and user_id = p_user;
  else
    insert into staff_permissions (gym_id, user_id, areas, updated_at, updated_by)
    values (v_gym, p_user, (select coalesce(array_agg(distinct a order by a), '{}') from unnest(p_areas) a), now(), auth.uid())
    on conflict (gym_id, user_id) do update set areas = excluded.areas, updated_at = now(), updated_by = auth.uid();
  end if;
end;
$$;
revoke all on function set_staff_permissions(uuid, text[]) from public, anon;
grant execute on function set_staff_permissions(uuid, text[]) to authenticated;

-- ---- tenancy ---------------------------------------------------------------------------------------------
-- 0157's list plus staff_permissions.
create or replace function tenancy_gym_tables() returns text[] language sql immutable as $$
  select array['account_status_events','achievement_unlocks','achievements','activity_log',
    'ai_coach_profiles','ai_meal_guides','ai_proposals','ai_usage_days',
    'assistant_conversations','assistant_messages','attendance','body_measurements','bookings',
    'cancellation_reasons','cash_closeouts','challenge_participants','challenges','class_templates',
    'class_waitlist','classes','conversations','event_registrations','events','fitness_goals','freemium_trials',
    'goal_templates','gym_exercise_media','gym_goals','gym_house_rules','gym_invitations','gym_modules','gym_photos','gym_plans',
    'gym_program_days','gym_programs','gym_settings','gym_terms_acceptances','gym_waivers','gym_workout_items','gym_workouts',
    'house_rules_acceptances','invoice_counters','member_profiles','member_share_prefs','membership_events',
    'membership_plans','membership_requests','memberships','messages',
    'notifications','payments','pending_registrations','personal_records','plan_features',
    'point_ledger','point_rules','program_enrolments','progress_photos',
    'pt_sessions','referral_codes','referrals','refund_rules','renewal_requests',
    'reward_redemptions','rewards','room_assignments','room_comments','room_members','room_posts',
    'room_submissions','rooms',
    'saved_resources','season_claims','season_tiers','shop_products','shop_sale_items','shop_sales',
    'squad_members','squad_weeks','squads','staff_permissions','stock_moves','streak_milestones','terms_acceptances',
    'trainer_availability','trainer_credentials','trainer_feedback','trainer_profiles',
    'trainer_ratings','waiver_acceptances','winback_rules','winback_sends','workout_logs','workout_plans',
    'workout_routine_exercises','workout_routines','workout_sets']::text[]
$$;

drop policy if exists tenant_select on staff_permissions;
drop policy if exists tenant_insert on staff_permissions;
drop policy if exists tenant_update on staff_permissions;
drop policy if exists tenant_delete on staff_permissions;
create policy tenant_select on staff_permissions as restrictive for select to anon, authenticated using (gym_id = current_gym_id());
create policy tenant_insert on staff_permissions as restrictive for insert to anon, authenticated with check (gym_id = current_gym_id() and gym_writable());
create policy tenant_update on staff_permissions as restrictive for update to anon, authenticated
  using (gym_id = current_gym_id() and gym_writable()) with check (gym_id = current_gym_id());
create policy tenant_delete on staff_permissions as restrictive for delete to anon, authenticated using (gym_id = current_gym_id() and gym_writable());

create or replace function migration_0161_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0161_applied() from public, anon;
grant execute on function migration_0161_applied() to authenticated;
comment on function migration_0161_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0161.sql
