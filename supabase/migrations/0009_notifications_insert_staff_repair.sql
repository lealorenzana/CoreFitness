-- Core Fitness — re-assert the notifications INSERT policy for staff.
--
-- Symptom: a signed-in trainer sending a recommendation from the member app got
--   "new row violates row-level security policy for table notifications" (42501)
-- while the admin broadcast on the same table kept working.
--
-- The policy in 0002/0006 already grants insert to both admin and trainer, so the
-- live database had drifted from the migration files — the same failure mode as
-- the original admin-login bug, where 0002 aborted partway and left one policy
-- standing DB-wide.
--
-- Idempotent: drop-then-create, so running it twice is a no-op. Safe to run even
-- if the policy is already correct.

drop policy if exists notifications_insert_staff on notifications;
create policy notifications_insert_staff on notifications for insert
  with check (get_my_role() in ('admin', 'trainer'));

-- Verify — expect one row, with_check listing both roles:
--   select policyname, cmd, with_check
--     from pg_policies
--    where tablename = 'notifications' and policyname = 'notifications_insert_staff';
