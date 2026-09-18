-- 0090 — a member can save a free workout for later, and tick it off; the
-- gym sees how the library and the exercise list are used (counts only).
--
-- The library (0019) is 37 links long and grows. A member who finds "Yoga With
-- Adriene" on Tuesday had no way to find it again on Saturday except to scroll,
-- and no way to say "I did that one". Per-member state never lives in
-- localStorage here (CLAUDE.md), so it is a table: one row per member per
-- resource, `done_at` set when they mark it done.
--
-- Never gated — the library exists for members who cannot pay, and so does
-- saving from it.

create table if not exists saved_resources (
  member_id   uuid not null references member_profiles(profile_id) on delete cascade,
  resource_id uuid not null references workout_resources(id) on delete cascade,
  saved_at    timestamptz not null default now(),
  done_at     timestamptz,
  primary key (member_id, resource_id)
);

alter table saved_resources enable row level security;

drop policy if exists saved_resources_own on saved_resources;
create policy saved_resources_own on saved_resources
  for all using (member_id = auth.uid()) with check (member_id = auth.uid());

grant select, insert, update, delete on saved_resources to authenticated;

-- ── What the gym sees ────────────────────────────────────────────────────
-- The admin manages the library (Resources) and the exercise list (Exercises)
-- but could not see what members do with either. Counts only, never names:
-- a saved list is the member's own, and RLS keeps the rows theirs. Security
-- definer so the count can cross members; the role check keeps it staff-only.

create or replace function resource_save_counts()
returns table (resource_id uuid, saved int, done int)
language sql stable security definer set search_path = public as $fn$
  select s.resource_id, count(*)::int, count(s.done_at)::int
    from saved_resources s
   where get_my_role() in ('admin', 'staff')
   group by s.resource_id
$fn$;
revoke all on function resource_save_counts() from public, anon;
grant execute on function resource_save_counts() to authenticated;

-- Hiding an exercise (Exercises → eye) takes it out of the picker, but a
-- routine that already has it keeps it and still runs. The admin should know
-- how many routines that is before hiding it.
create or replace function exercise_routine_counts()
returns table (exercise_id uuid, routines int, members int)
language sql stable security definer set search_path = public as $fn$
  select e.exercise_id, count(distinct e.routine_id)::int, count(distinct r.member_id)::int
    from workout_routine_exercises e
    join workout_routines r on r.id = e.routine_id
   where e.exercise_id is not null
     and get_my_role() in ('admin', 'staff')
   group by e.exercise_id
$fn$;
revoke all on function exercise_routine_counts() from public, anon;
grant execute on function exercise_routine_counts() to authenticated;

-- Marker for scripts/probe-migrations.py.
create or replace function migration_0090_applied() returns boolean
language sql immutable as $fn$ select true $fn$;
revoke all on function migration_0090_applied() from public, anon;
grant execute on function migration_0090_applied() to authenticated;

-- VERIFICATION — as a member:
--   insert into saved_resources (member_id, resource_id) values (auth.uid(), '<id>');   -- ok
--   update saved_resources set done_at = now() where resource_id = '<id>';                -- 1 row
--   insert into saved_resources (member_id, resource_id) values ('<someone else>', '<id>'); -- refused
