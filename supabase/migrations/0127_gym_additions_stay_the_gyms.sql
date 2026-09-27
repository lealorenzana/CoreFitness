-- 0127: WHAT A GYM ADDS IS THE GYM'S — ALWAYS
--
-- Reported 2026-09-27: G Fitness's owner could not delete exercises they had
-- added. They were not G Fitness's at all. A trigger from before tenancy was
-- finished (0099's `library_row_gym`, narrowed by 0121) filed some additions
-- into the SHARED library every gym reads:
--   * 0099–0120: anything added in Gym #1 (G Fitness), by anyone;
--   * 0121–0126: anything added by an account that is also the platform admin —
--     and until today the platform admin was G Fitness's owner.
-- So G Fitness's own exercises and training links went to every gym's members,
-- and G Fitness could not delete them (only the platform may touch shared rows).
--
-- The rule from here, with no exception: **a row added in a gym's app belongs
-- to that gym.** The shared library is curated deliberately (a migration like
-- 0126), never by accident of who happened to be signed in.
--
--   1. The trigger is gone, from exercises and workout_resources.
--   2. The rows it misfiled go back to G Fitness — only the ones a person added
--      (exercises: sort_order 900, what both apps write, or a created_by;
--      links: a created_by), never the seeded library (0050, 0126, 0019/0058/
--      0075), and only if no OTHER gym has used it (a member's logged set, a
--      routine, a program, a record, a goal). One another gym relies on stays
--      shared, so nobody's history breaks; the verify script lists them.
--   3. Another gym's "hide this" on a row that became G Fitness's is removed —
--      that gym can no longer see it at all.
--
-- Safe to re-run.

drop trigger if exists library_row_gym on exercises;
drop trigger if exists library_row_gym on workout_resources;
drop function if exists trg_library_row_gym();

-- Has any gym other than p_gym used this exercise? Dynamic over the tables that
-- reference exercises, skipping any not present (an older database).
create or replace function exercise_used_outside(p_exercise uuid, p_gym uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare t text; v boolean;
begin
  foreach t in array array['workout_sets', 'workout_routine_exercises', 'gym_workout_items',
                           'personal_records', 'fitness_goals'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select exists (select 1 from %I where exercise_id = $1 and gym_id is distinct from $2)', t)
        into v using p_exercise, p_gym;
      if v then return true; end if;
    end if;
  end loop;
  return false;
end;
$$;
revoke all on function exercise_used_outside(uuid, uuid) from public, anon, authenticated;

-- A gym's own row must not collide with a same-named row it already owns.
with moved as (
  update exercises e set gym_id = gym_one()
   where e.gym_id is null
     and (e.sort_order >= 900 or e.created_by is not null)
     and not exercise_used_outside(e.id, gym_one())
     and not exists (select 1 from exercises o where o.gym_id = gym_one() and lower(o.name) = lower(e.name))
  returning e.id
)
delete from gym_exercise_media m using moved
 where m.exercise_id = moved.id and m.gym_id is distinct from gym_one();

update workout_resources r set gym_id = gym_one()
 where r.gym_id is null
   and r.created_by is not null
   and not exists (select 1 from workout_resources o where o.gym_id = gym_one() and lower(o.url) = lower(r.url));

create or replace function migration_0127_applied() returns boolean
language sql immutable as $marker$ select true $marker$;
revoke all on function migration_0127_applied() from public, anon;
grant execute on function migration_0127_applied() to authenticated;
comment on function migration_0127_applied() is
  'Marker for scripts/probe-migrations.py. Delete only alongside the probe entry.';

-- VERIFICATION: scripts/sql/verify/verify0127.sql
