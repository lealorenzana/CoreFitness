-- Core Fitness — corrective migration
--
-- Live diagnosis found that 0002_rls.sql never actually applied: `select count(*)
-- from pg_policies` returned 1 for the whole database, and get_my_role() existed
-- but trg_prevent_profile_privilege_escalation did not — meaning the original
-- run stopped partway through and left every table with RLS enabled but no
-- (or almost no) policies, which defaults to deny-all except the postgres role.
-- That's why admin login could never see its own profiles row even though the
-- data was confirmed correct via a superuser query.
--
-- This migration is idempotent (drop-if-exists before every create) so it's
-- safe to run regardless of exactly how far the original script got.

-- ============ ROLE HELPER ============
create or replace function get_my_role() returns user_role
language sql security definer stable set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

-- ============ PRIVILEGE-ESCALATION GUARDS ============
create or replace function prevent_profile_privilege_escalation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if get_my_role() <> 'admin' then
    if new.role is distinct from old.role or new.status is distinct from old.status then
      raise exception 'Only admins can change role or status';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_profile_privilege_escalation on profiles;
create trigger trg_prevent_profile_privilege_escalation
before update on profiles
for each row execute function prevent_profile_privilege_escalation();

create or replace function prevent_member_profile_tamper() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if get_my_role() <> 'admin' then
    if new.qr_code is distinct from old.qr_code
       or new.experience_level is distinct from old.experience_level then
      raise exception 'Only admins can change qr_code or experience_level';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_member_profile_tamper on member_profiles;
create trigger trg_prevent_member_profile_tamper
before update on member_profiles
for each row execute function prevent_member_profile_tamper();

-- ============ ENABLE RLS (no-op if already enabled) ============
alter table profiles enable row level security;
alter table member_profiles enable row level security;
alter table trainer_profiles enable row level security;
alter table membership_plans enable row level security;
alter table memberships enable row level security;
alter table payments enable row level security;
alter table classes enable row level security;
alter table bookings enable row level security;
alter table attendance enable row level security;
alter table notifications enable row level security;
alter table pending_registrations enable row level security;

-- ============ PROFILES ============
drop policy if exists profiles_select_self on profiles;
create policy profiles_select_self on profiles for select
  using (id = auth.uid());
drop policy if exists profiles_select_admin on profiles;
create policy profiles_select_admin on profiles for select
  using (get_my_role() = 'admin');
drop policy if exists profiles_select_trainer on profiles;
create policy profiles_select_trainer on profiles for select
  using (get_my_role() = 'trainer');

drop policy if exists profiles_insert_self on profiles;
create policy profiles_insert_self on profiles for insert
  with check (id = auth.uid() and role = 'member' and status = 'pending_approval');
drop policy if exists profiles_insert_admin on profiles;
create policy profiles_insert_admin on profiles for insert
  with check (get_my_role() = 'admin');

drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles for update
  using (id = auth.uid());
drop policy if exists profiles_update_admin on profiles;
create policy profiles_update_admin on profiles for update
  using (get_my_role() = 'admin');

-- ============ MEMBER_PROFILES ============
drop policy if exists member_profiles_select_self on member_profiles;
create policy member_profiles_select_self on member_profiles for select
  using (profile_id = auth.uid());
drop policy if exists member_profiles_select_admin on member_profiles;
create policy member_profiles_select_admin on member_profiles for select
  using (get_my_role() = 'admin');
drop policy if exists member_profiles_select_trainer on member_profiles;
create policy member_profiles_select_trainer on member_profiles for select
  using (get_my_role() = 'trainer');

drop policy if exists member_profiles_insert_admin on member_profiles;
create policy member_profiles_insert_admin on member_profiles for insert
  with check (get_my_role() = 'admin');

drop policy if exists member_profiles_update_self on member_profiles;
create policy member_profiles_update_self on member_profiles for update
  using (profile_id = auth.uid());
drop policy if exists member_profiles_update_admin on member_profiles;
create policy member_profiles_update_admin on member_profiles for update
  using (get_my_role() = 'admin');

-- ============ TRAINER_PROFILES ============
drop policy if exists trainer_profiles_select_authenticated on trainer_profiles;
create policy trainer_profiles_select_authenticated on trainer_profiles for select
  using (auth.uid() is not null);
drop policy if exists trainer_profiles_write_admin on trainer_profiles;
create policy trainer_profiles_write_admin on trainer_profiles for all
  using (get_my_role() = 'admin') with check (get_my_role() = 'admin');

-- ============ MEMBERSHIP_PLANS ============
drop policy if exists membership_plans_select_authenticated on membership_plans;
create policy membership_plans_select_authenticated on membership_plans for select
  using (auth.uid() is not null);
drop policy if exists membership_plans_write_admin on membership_plans;
create policy membership_plans_write_admin on membership_plans for all
  using (get_my_role() = 'admin') with check (get_my_role() = 'admin');

-- ============ MEMBERSHIPS ============
drop policy if exists memberships_select_self on memberships;
create policy memberships_select_self on memberships for select
  using (member_id = auth.uid());
drop policy if exists memberships_select_admin on memberships;
create policy memberships_select_admin on memberships for select
  using (get_my_role() = 'admin');
drop policy if exists memberships_select_trainer on memberships;
create policy memberships_select_trainer on memberships for select
  using (get_my_role() = 'trainer');
drop policy if exists memberships_write_admin on memberships;
create policy memberships_write_admin on memberships for all
  using (get_my_role() = 'admin') with check (get_my_role() = 'admin');

-- ============ PAYMENTS ============
drop policy if exists payments_select_self on payments;
create policy payments_select_self on payments for select
  using (member_id = auth.uid());
drop policy if exists payments_select_admin on payments;
create policy payments_select_admin on payments for select
  using (get_my_role() = 'admin');
drop policy if exists payments_write_admin on payments;
create policy payments_write_admin on payments for all
  using (get_my_role() = 'admin') with check (get_my_role() = 'admin');

-- ============ CLASSES ============
drop policy if exists classes_select_authenticated on classes;
create policy classes_select_authenticated on classes for select
  using (auth.uid() is not null);
drop policy if exists classes_write_admin on classes;
create policy classes_write_admin on classes for all
  using (get_my_role() = 'admin') with check (get_my_role() = 'admin');

-- ============ BOOKINGS ============
drop policy if exists bookings_select_self on bookings;
create policy bookings_select_self on bookings for select
  using (member_id = auth.uid());
drop policy if exists bookings_select_admin on bookings;
create policy bookings_select_admin on bookings for select
  using (get_my_role() = 'admin');
drop policy if exists bookings_select_trainer on bookings;
create policy bookings_select_trainer on bookings for select
  using (
    get_my_role() = 'trainer'
    and class_id in (select id from classes where trainer_id = auth.uid())
  );
drop policy if exists bookings_insert_self on bookings;
create policy bookings_insert_self on bookings for insert
  with check (member_id = auth.uid());
drop policy if exists bookings_update_admin on bookings;
create policy bookings_update_admin on bookings for update
  using (get_my_role() = 'admin') with check (get_my_role() = 'admin');

-- ============ ATTENDANCE ============
drop policy if exists attendance_select_self on attendance;
create policy attendance_select_self on attendance for select
  using (member_id = auth.uid());
drop policy if exists attendance_select_admin on attendance;
create policy attendance_select_admin on attendance for select
  using (get_my_role() = 'admin');
drop policy if exists attendance_select_trainer on attendance;
create policy attendance_select_trainer on attendance for select
  using (get_my_role() = 'trainer');
drop policy if exists attendance_insert_staff on attendance;
create policy attendance_insert_staff on attendance for insert
  with check (get_my_role() in ('admin','trainer'));

-- ============ NOTIFICATIONS ============
drop policy if exists notifications_select_self on notifications;
create policy notifications_select_self on notifications for select
  using (user_id = auth.uid());
drop policy if exists notifications_update_self on notifications;
create policy notifications_update_self on notifications for update
  using (user_id = auth.uid());
drop policy if exists notifications_insert_staff on notifications;
create policy notifications_insert_staff on notifications for insert
  with check (get_my_role() in ('admin','trainer'));
drop policy if exists notifications_delete_self on notifications;
create policy notifications_delete_self on notifications for delete
  using (user_id = auth.uid());

-- ============ PENDING_REGISTRATIONS ============
drop policy if exists pending_registrations_insert_self on pending_registrations;
create policy pending_registrations_insert_self on pending_registrations for insert
  with check (auth_user_id = auth.uid());
drop policy if exists pending_registrations_select_admin on pending_registrations;
create policy pending_registrations_select_admin on pending_registrations for select
  using (get_my_role() = 'admin');
drop policy if exists pending_registrations_delete_admin on pending_registrations;
create policy pending_registrations_delete_admin on pending_registrations for delete
  using (get_my_role() = 'admin');
