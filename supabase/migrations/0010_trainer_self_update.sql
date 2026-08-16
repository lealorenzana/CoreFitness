-- Core Fitness — let a trainer maintain their own trainer_profiles row.
--
-- Until now `trainer_profiles_write_admin` (FOR ALL, admin only) was the sole
-- write policy, so a trainer could not save their own availability, bio or
-- specialization. The trainer app worked around it by keeping availability in
-- localStorage — which meant the gym never saw the change, it didn't survive a
-- reinstall, and the admin Trainers page showed stale days.
--
-- Scope is deliberately narrow. `trainer_profiles` holds no role or status
-- column, so self-service here cannot escalate privileges: role lives on
-- `profiles`, which keeps its own policies and its
-- prevent_profile_escalation trigger.
--
-- Policies are permissive (OR'd), so this is additive — admins keep full write
-- access through the existing policy.

drop policy if exists trainer_profiles_update_self on trainer_profiles;
create policy trainer_profiles_update_self on trainer_profiles for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Verify — expect trainer_profiles_update_self alongside trainer_profiles_write_admin:
--   select policyname, cmd, permissive from pg_policies where tablename = 'trainer_profiles';
