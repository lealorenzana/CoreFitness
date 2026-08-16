-- 0023 — Re-assert who may INSERT into `notifications`.
--
-- Symptom (again): a signed-in trainer sending a recommendation from the member
-- app gets
--   new row violates row-level security policy for table "notifications" (42501)
--
-- IMPORTANT: this migration is **cleanup, not the fix.**
--
-- The first theory was policy drift, as in 0009. That was checked against the
-- live database and disproved — `pg_policies` showed both INSERT policies
-- present and both granting `trainer`:
--
--   notifications_insert_staff      (0009)  admin, trainer
--   notifications_insert_frontdesk  (0012)  admin, staff, trainer
--
-- PostgreSQL ORs permissive policies, so a trainer with `get_my_role() =
-- 'trainer'` is already allowed. A 42501 therefore means `get_my_role()` is not
-- returning 'trainer' for that session — either the auth user has no `profiles`
-- row, or the row's role is something else. That is an account problem, and no
-- policy change can fix it. TrainerMembers now checks this before inserting and
-- reports the real reason.
--
-- What this migration *does* do is collapse two overlapping policies into one.
-- The overlap is a maintenance hazard: with two policies covering the same
-- command, spot-checking either one looks correct even when the other is gone.
--
-- Idempotent — safe to run repeatedly, and safe to defer.

-- The role helper must exist and be SECURITY DEFINER, or it cannot read
-- `profiles` from inside a policy on another table.
create or replace function get_my_role() returns user_role
language sql security definer stable as $$
  select role from profiles where id = auth.uid();
$$;

drop policy if exists notifications_insert_staff on notifications;
drop policy if exists notifications_insert_frontdesk on notifications;

-- One policy, one place to look.
-- Members are deliberately excluded: a member cannot write notifications, not
-- even to themselves, or the bell stops being a record of what the gym did.
drop policy if exists notifications_insert_staff_roles on notifications;
create policy notifications_insert_staff_roles on notifications for insert
  with check (get_my_role() in ('admin', 'staff', 'trainer'));

-- ── Verify ───────────────────────────────────────────────────────────────────
-- 1. Exactly one INSERT policy, allowing the three roles:
--
--    select policyname, cmd, with_check
--      from pg_policies
--     where tablename = 'notifications' and cmd = 'INSERT';
--
-- 2. What the database thinks YOUR role is — run while signed in as the trainer
--    (Supabase SQL Editor runs as the service role, so this returns null there;
--    it is meaningful only from the app's session):
--
--    select auth.uid(), get_my_role();
--
--    If get_my_role() returns null while logged in as a trainer, the account has
--    no `profiles` row — that, not the policy, is the bug.
