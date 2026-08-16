-- Core Fitness — RLS policies
-- Run this AFTER 0001_schema.sql, in the same Supabase SQL Editor.

-- ============ ROLE HELPER ============
-- security definer + fixed search_path so it can't be hijacked and bypasses the
-- caller's own RLS on profiles (otherwise checking your own role would recurse).
create or replace function get_my_role() returns user_role
language sql security definer stable set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

-- ============ PRIVILEGE-ESCALATION GUARDS ============
-- A member can update their own profile row, but never their own role/status.
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

create trigger trg_prevent_profile_privilege_escalation
before update on profiles
for each row execute function prevent_profile_privilege_escalation();

-- A member can update their own member_profiles row, but never their QR code or
-- experience level (both are admin-managed for this foundation phase).
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

create trigger trg_prevent_member_profile_tamper
before update on member_profiles
for each row execute function prevent_member_profile_tamper();

-- ============ ENABLE RLS ============
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
create policy profiles_select_self on profiles for select
  using (id = auth.uid());
create policy profiles_select_admin on profiles for select
  using (get_my_role() = 'admin');
create policy profiles_select_trainer on profiles for select
  using (get_my_role() = 'trainer');

-- Self-registration only: a signed-up user may insert exactly their own row,
-- and only as a member pending approval — blocks role/status self-escalation at signup.
create policy profiles_insert_self on profiles for insert
  with check (id = auth.uid() and role = 'member' and status = 'pending_approval');
create policy profiles_insert_admin on profiles for insert
  with check (get_my_role() = 'admin');

create policy profiles_update_self on profiles for update
  using (id = auth.uid());
create policy profiles_update_admin on profiles for update
  using (get_my_role() = 'admin');

-- ============ MEMBER_PROFILES ============
create policy member_profiles_select_self on member_profiles for select
  using (profile_id = auth.uid());
create policy member_profiles_select_admin on member_profiles for select
  using (get_my_role() = 'admin');
create policy member_profiles_select_trainer on member_profiles for select
  using (get_my_role() = 'trainer');

create policy member_profiles_insert_admin on member_profiles for insert
  with check (get_my_role() = 'admin');

create policy member_profiles_update_self on member_profiles for update
  using (profile_id = auth.uid());
create policy member_profiles_update_admin on member_profiles for update
  using (get_my_role() = 'admin');

-- ============ TRAINER_PROFILES ============
create policy trainer_profiles_select_authenticated on trainer_profiles for select
  using (auth.uid() is not null);
create policy trainer_profiles_write_admin on trainer_profiles for all
  using (get_my_role() = 'admin') with check (get_my_role() = 'admin');

-- ============ MEMBERSHIP_PLANS ============
create policy membership_plans_select_authenticated on membership_plans for select
  using (auth.uid() is not null);
create policy membership_plans_write_admin on membership_plans for all
  using (get_my_role() = 'admin') with check (get_my_role() = 'admin');

-- ============ MEMBERSHIPS ============
-- Members can only ever READ their own membership status — never write it.
-- This is what fixes "a payment never updates membership status" being editable by the wrong party.
create policy memberships_select_self on memberships for select
  using (member_id = auth.uid());
create policy memberships_select_admin on memberships for select
  using (get_my_role() = 'admin');
create policy memberships_select_trainer on memberships for select
  using (get_my_role() = 'trainer');
create policy memberships_write_admin on memberships for all
  using (get_my_role() = 'admin') with check (get_my_role() = 'admin');

-- ============ PAYMENTS ============
create policy payments_select_self on payments for select
  using (member_id = auth.uid());
create policy payments_select_admin on payments for select
  using (get_my_role() = 'admin');
create policy payments_write_admin on payments for all
  using (get_my_role() = 'admin') with check (get_my_role() = 'admin');

-- ============ CLASSES ============
create policy classes_select_authenticated on classes for select
  using (auth.uid() is not null);
create policy classes_write_admin on classes for all
  using (get_my_role() = 'admin') with check (get_my_role() = 'admin');

-- ============ BOOKINGS ============
create policy bookings_select_self on bookings for select
  using (member_id = auth.uid());
create policy bookings_select_admin on bookings for select
  using (get_my_role() = 'admin');
create policy bookings_select_trainer on bookings for select
  using (
    get_my_role() = 'trainer'
    and class_id in (select id from classes where trainer_id = auth.uid())
  );
create policy bookings_insert_self on bookings for insert
  with check (member_id = auth.uid());
-- Approve/reject only, admin-only for this foundation phase (no member self-cancel yet —
-- that belongs to the freeze/cancel feature phase).
create policy bookings_update_admin on bookings for update
  using (get_my_role() = 'admin') with check (get_my_role() = 'admin');

-- ============ ATTENDANCE ============
-- A member never self-reports their own check-in.
create policy attendance_select_self on attendance for select
  using (member_id = auth.uid());
create policy attendance_select_admin on attendance for select
  using (get_my_role() = 'admin');
create policy attendance_select_trainer on attendance for select
  using (get_my_role() = 'trainer');
create policy attendance_insert_staff on attendance for insert
  with check (get_my_role() in ('admin','trainer'));

-- ============ NOTIFICATIONS ============
create policy notifications_select_self on notifications for select
  using (user_id = auth.uid());
create policy notifications_update_self on notifications for update
  using (user_id = auth.uid());
create policy notifications_insert_staff on notifications for insert
  with check (get_my_role() in ('admin','trainer'));

-- ============ PENDING_REGISTRATIONS ============
-- The signed-up user may file exactly one review-queue entry pointing at themselves.
create policy pending_registrations_insert_self on pending_registrations for insert
  with check (auth_user_id = auth.uid());
create policy pending_registrations_select_admin on pending_registrations for select
  using (get_my_role() = 'admin');
create policy pending_registrations_delete_admin on pending_registrations for delete
  using (get_my_role() = 'admin');
