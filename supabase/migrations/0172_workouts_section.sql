-- ============================================================================
-- 0172 — One Workouts section
-- ============================================================================
--
-- Train's "My plan" was four tabs for overlapping things (This week ·
-- Programs · Routines · Free workouts). It becomes WORKOUTS: Today ·
-- Routines · Programs · Browse, with a three-step introduction shown once —
-- until the member starts a first workout or taps Skip. Whether they have seen
-- it is per-member state, so it is a column, written by a definer function
-- (CLAUDE.md: per-user state never lives in localStorage).
--
-- And every routine says where it came from. 0145 gave workout_routines a
-- `source` ('member', or 'coach' = the AI coach — its functions write that
-- value, so it keeps that meaning). A trainer's routine is 'trainer', with its
-- author; `edited_by`/`edited_at` record a coach's edit to a member's routine
-- (project B-3), so the member sees "Edited by Coach ___".
-- ============================================================================

alter table member_profiles add column if not exists workouts_intro_seen_at timestamptz;

create or replace function mark_workouts_intro_seen() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  -- The first time stands: a second call (another device) keeps it.
  update member_profiles set workouts_intro_seen_at = coalesce(workouts_intro_seen_at, now())
   where profile_id = auth.uid();
end;
$$;
revoke all on function mark_workouts_intro_seen() from public, anon;
grant execute on function mark_workouts_intro_seen() to authenticated;

alter table workout_routines drop constraint if exists workout_routines_source_check;
alter table workout_routines add constraint workout_routines_source_check
  check (source in ('member', 'coach', 'trainer'));
alter table workout_routines add column if not exists author_id uuid references profiles(id) on delete set null;
alter table workout_routines add column if not exists edited_by uuid references profiles(id) on delete set null;
alter table workout_routines add column if not exists edited_at timestamptz;
comment on column workout_routines.source is
  'member = written by the member; coach = proposed by the AI coach (0145, applied by the member); trainer = written by a coach (author_id).';

create or replace function migration_0172_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0172_applied() from public, anon;
grant execute on function migration_0172_applied() to authenticated;
comment on function migration_0172_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0172.sql
