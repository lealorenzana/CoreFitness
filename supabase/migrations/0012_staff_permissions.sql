-- Core Fitness — what a 'staff' account may do.
--
-- RUN 0011 FIRST, in a separate query. This file references the 'staff' enum
-- value, and Postgres rejects using a new enum value in the transaction that
-- added it.
--
-- The matrix, in one sentence: staff run the front desk, admins run the gym.
--
--   Staff CAN    take payments, check members in, activate/extend memberships,
--                add walk-in member profiles, send notifications, and read
--                everything an admin can read.
--
--   Staff CANNOT change membership plan pricing (that's the gym's revenue
--                model), create or modify any account, manage trainers, or
--                archive/suspend a member.
--
--   NOT YET      approving a registration. It flips `profiles.status` to
--                'active', and staff have no write access to `profiles` — by
--                design, since that table carries role and status. Making it a
--                staff action needs an Edge Function running as service-role
--                (same pattern as create-trainer), not a widened policy.
--                Until then the queue is read-only for staff and an admin
--                approves.
--
-- The split is deliberate: everything staff can do is a *transaction* that gets
-- recorded and is reversible by an admin. Everything they can't do changes the
-- shape of the business or who has access.
--
-- Policies are permissive (OR'd), so each `_staff` policy below is additive —
-- existing admin policies keep working untouched.

-- Helper so the intent reads clearly at each call site, and so widening or
-- narrowing the role set later is a one-line change.
create or replace function is_front_desk() returns boolean
language sql security definer stable set search_path = public as $$
  select get_my_role() in ('admin', 'staff');
$$;

-- ============ READ ACCESS ============
-- Staff need the same visibility as an admin to do desk work.

drop policy if exists profiles_select_staff on profiles;
create policy profiles_select_staff on profiles for select
  using (is_front_desk());

drop policy if exists member_profiles_select_staff on member_profiles;
create policy member_profiles_select_staff on member_profiles for select
  using (is_front_desk());

drop policy if exists memberships_select_staff on memberships;
create policy memberships_select_staff on memberships for select
  using (is_front_desk());

drop policy if exists payments_select_staff on payments;
create policy payments_select_staff on payments for select
  using (is_front_desk());

drop policy if exists attendance_select_staff on attendance;
create policy attendance_select_staff on attendance for select
  using (is_front_desk());

drop policy if exists bookings_select_staff on bookings;
create policy bookings_select_staff on bookings for select
  using (is_front_desk());

drop policy if exists pending_registrations_select_staff on pending_registrations;
create policy pending_registrations_select_staff on pending_registrations for select
  using (is_front_desk());

drop policy if exists notifications_select_staff on notifications;
create policy notifications_select_staff on notifications for select
  using (is_front_desk());

-- ============ WRITE ACCESS — desk transactions only ============

-- Take a payment.
drop policy if exists payments_insert_staff on payments;
create policy payments_insert_staff on payments for insert
  with check (is_front_desk());
drop policy if exists payments_update_staff on payments;
create policy payments_update_staff on payments for update
  using (is_front_desk()) with check (is_front_desk());

-- Activate or extend a membership (what recording a payment does next).
drop policy if exists memberships_insert_staff on memberships;
create policy memberships_insert_staff on memberships for insert
  with check (is_front_desk());
drop policy if exists memberships_update_staff on memberships;
create policy memberships_update_staff on memberships for update
  using (is_front_desk()) with check (is_front_desk());

-- Check a member in. (attendance_insert_staff already exists for admin/trainer;
-- this widens the same action to the front desk.)
drop policy if exists attendance_insert_frontdesk on attendance;
create policy attendance_insert_frontdesk on attendance for insert
  with check (is_front_desk());

-- Create the member_profiles row for a walk-in, and edit contact details.
drop policy if exists member_profiles_insert_staff on member_profiles;
create policy member_profiles_insert_staff on member_profiles for insert
  with check (is_front_desk());
drop policy if exists member_profiles_update_staff on member_profiles;
create policy member_profiles_update_staff on member_profiles for update
  using (is_front_desk()) with check (is_front_desk());
-- Note: prevent_member_profile_tamper still guards qr_code and experience_level
-- for anyone who isn't an admin, so staff cannot reassign a member's QR code.

-- Clear the registration queue after approving or rejecting.
drop policy if exists pending_registrations_delete_staff on pending_registrations;
create policy pending_registrations_delete_staff on pending_registrations for delete
  using (is_front_desk());

-- Send notifications.
drop policy if exists notifications_insert_frontdesk on notifications;
create policy notifications_insert_frontdesk on notifications for insert
  with check (get_my_role() in ('admin', 'staff', 'trainer'));

-- ============ DELIBERATELY NOT GRANTED ============
-- membership_plans  — pricing stays with the admin.
-- profiles          — no account creation or role/status changes. Approving a
--                     registration flips profiles.status, so that path must go
--                     through an Edge Function running as service-role rather
--                     than a direct staff write.
-- trainer_profiles  — trainer management stays with the admin.
--
-- Verify:
--   select policyname, cmd from pg_policies
--    where policyname like '%staff%' or policyname like '%frontdesk%'
--    order by tablename, policyname;
