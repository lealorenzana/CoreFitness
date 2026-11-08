-- ============================================================================
-- 0242 — The front desk reads members' and coaches' notifications, not the owner's
-- ============================================================================
--
-- notifications_select_staff lets the front desk (is_front_desk()) read EVERY
-- notification in its gym, because the desk sends and recalls the members'
-- broadcasts. That reached the owner's own rows too: Core Fitness's billing
-- reminders, the receipts for what the gym pays, replies to the owner's tickets.
-- The desk's app never shows them (its bell reads only its own), but anyone with
-- the desk's sign-in could ask the API for them. The owner (2026-11-08): "yes, for
-- greater RBAC".
--
-- A RESTRICTIVE select policy, so it narrows the permissive ones instead of adding:
-- a front desk (role 'staff' in the current gym) reads a row only if it is its own,
-- or it is addressed to a MEMBER or COACH of that gym. The owner (admin) and the
-- platform admin are unchanged; members and coaches only ever read their own anyway.
-- Broadcasts go to members and coaches only (audiences all_members / all_trainers /
-- everyone = both), so the desk's history and recall see exactly what they did.
-- ============================================================================

-- Is this notification addressed to a member or coach of that gym? SECURITY DEFINER so the check does not depend on
-- what the caller may read of gym_roles; it answers a yes/no about one row and nothing else.
create or replace function notification_for_client(p_user uuid, p_gym uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from gym_roles r
                  where r.user_id = p_user and r.gym_id = p_gym and r.role in ('member', 'trainer'));
$$;
revoke execute on function notification_for_client(uuid, uuid) from public, anon;
grant execute on function notification_for_client(uuid, uuid) to authenticated;  -- the policy runs as the caller

drop policy if exists notifications_desk_reads_clients_only on notifications;
create policy notifications_desk_reads_clients_only on notifications as restrictive for select to authenticated
  using (
    user_id = auth.uid()
    or get_my_role() is distinct from 'staff'
    or notification_for_client(user_id, gym_id)
  );

create or replace function migration_0242_applied() returns boolean language sql stable as $$ select true $$;
grant execute on function migration_0242_applied() to anon, authenticated;
