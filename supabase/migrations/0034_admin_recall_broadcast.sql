-- 0034 — let the front desk take back an announcement it should not have sent.
--
-- `notifications_delete_self` (0003, rewritten in 0006) is `user_id = auth.uid()`
-- and it is the ONLY delete policy on the table. So an admin deleting a
-- broadcast's rows matched nothing — and a DELETE that matches no rows is not an
-- error in PostgreSQL, exactly like the zero-row UPDATE that silently discarded
-- every onboarding experience level. The client would have reported "removed
-- from 40 inboxes" while the rows sat untouched in all 40.
--
-- Two ways to fix it: drop the feature, or give the desk the permission the
-- feature needs. A gym that announces "closed Sunday" to 200 people and then
-- realises it meant Saturday needs the second one.
--
-- Deliberately admin/staff, matching every other broadcast power — `is_front_desk()`
-- is the same predicate `notifications_insert_staff` should have used, and the
-- people who can send an announcement are the people who can unsend it.

drop policy if exists notifications_delete_frontdesk on notifications;
create policy notifications_delete_frontdesk on notifications for delete
  using (is_front_desk());

-- The self policy stays. Both are permissive, so a member keeps deleting their
-- own rows from `/{member,trainer}/notifications` and the desk gains the rest.
-- Nothing else changes: this grants DELETE only, so the tamper trigger from 0029
-- still governs what an UPDATE may touch.
