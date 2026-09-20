-- 0105 — The last of Part A's transition scaffolding.
--
-- 0098 kept three old keys alive because the apps' own upserts named them:
-- body measurements, share preferences and coach ratings were unique *per
-- person*, which is wrong once a person can belong to two gyms — their weight
-- on Monday at one gym would collide with their weight on Monday at the other.
-- Part B's apps name the gym in those upserts (lib/api/progress.ts,
-- sharePrefs.ts, trainerRatings.ts), so the per-gym keys 0098 added are now the
-- only ones needed.
--
-- **Paste this only after the member app carrying those changes is deployed.**
-- An older copy still open on someone's phone would upsert on the old key and
-- get "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" — a failed save with a puzzling message.
--
-- What deliberately stays:
--   * trg_mirror_profile_role and profiles.active_gym_id's default. Three admin
--     paths still set profiles.status directly (archiving a member, suspending
--     a coach, suspending a staff account). Each needs a reason dialog before it
--     can move to set_account_status(), and inventing a reason to satisfy 0069
--     would be worse than waiting (docs/TENANCY.md).
--   * profiles.role and profiles.status themselves: the mirror writes them, and
--     they are what the apps fall back to before 0104 is live.
--
-- Plan: docs/superpowers/plans/2026-09-20-saas-part-b-gym-aware-apps.md (Task 10)

alter table member_share_prefs drop constraint if exists member_share_prefs_member_id_transition;
alter table body_measurements  drop constraint if exists body_measurements_member_day_transition;
alter table trainer_ratings    drop constraint if exists trainer_ratings_period_transition;

create or replace function migration_0105_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0105_applied() from public, anon;
grant execute on function migration_0105_applied() to authenticated;
comment on function migration_0105_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0105.sql
