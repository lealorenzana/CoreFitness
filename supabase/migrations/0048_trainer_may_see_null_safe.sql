-- 0048 — close the NULL hole in trainer_may_see().
--
-- 0039 fixed this exact bug everywhere it could find it:
--
--     `get_my_role() <> 'admin'` is NULL for a caller with no profile row, so
--     the guard is skipped — use IS DISTINCT FROM.
--
-- It missed one. `trainer_may_see()` was written in 0032, seven migrations
-- earlier, and has never been redefined since — so it still carries the broken
-- comparison while every other guard in the schema was repaired.
--
-- ---------------------------------------------------------------------------
-- What actually happens
-- ---------------------------------------------------------------------------
-- Walk a caller whose `get_my_role()` returns NULL through the original CASE:
--
--   when get_my_role() in ('admin','staff') then true   -- NULL IN (...) is NULL
--   when get_my_role() <> 'trainer' then false          -- NULL <> 'x'  is NULL
--   else <the member's sharing preference>              -- <-- lands here
--
-- Neither guard fires, because NULL is not false — it is unknown, and a CASE
-- branch only fires on true. Execution falls through to the ELSE, which returns
-- the member's own sharing flag, and that flag **defaults to shared** (0032, so
-- that applying it changed nothing for trainers already coaching someone).
--
-- The result is that a caller the function cannot identify is treated better
-- than a trainer: it reads `body_measurements`, `fitness_goals`, `workout_logs`
-- and — since 0047 — `workout_plans`, for every member who has not explicitly
-- opted out.
--
-- ---------------------------------------------------------------------------
-- How narrow is it
-- ---------------------------------------------------------------------------
-- Stated honestly rather than talked up or waved away. It needs an
-- **authenticated** session whose `profiles` row is missing: `anon` cannot
-- reach the function (0032 revokes it), and the signup trigger gives every
-- normal account a profile. What produces one is an auth user created outside
-- that path — from the Supabase dashboard, or a signup whose trigger no-opped —
-- and there is no way to be sure none exists.
--
-- That is a bad reason to leave it. The failure mode of the fix is that an
-- unidentifiable caller is refused, which is what should have happened anyway.
--
-- ---------------------------------------------------------------------------
-- The change
-- ---------------------------------------------------------------------------
-- One operator. `IS DISTINCT FROM` is the NULL-safe `<>`: it returns true when
-- one side is NULL and the other is not, so an unknown role now takes the
-- `false` branch instead of falling past it.
--
-- The admin/staff branch above is deliberately left as `IN`. For NULL it yields
-- NULL and is not taken, which is correct — an unidentified caller is not
-- admin — and it now falls into a guard that denies rather than one that leaks.
--
-- Everything else is copied from 0032 unchanged: same signature, same
-- categories, same default-shared behaviour for a member with no preferences
-- row. Nothing about what members have chosen changes.

create or replace function trainer_may_see(member uuid, category text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- The gym itself is not gated; see 0032's header.
    when get_my_role() in ('admin', 'staff') then true
    -- NULL-safe (0048). `<>` here returned NULL for a caller with no profile
    -- row, which is not false, so the branch never fired and an unidentifiable
    -- caller fell through to the member's sharing preference below.
    when get_my_role() is distinct from 'trainer' then false
    else coalesce(
      (
        select case category
          when 'measurements' then p.share_measurements
          when 'goals'        then p.share_goals
          when 'workouts'     then p.share_workouts
          else false
        end
        from member_share_prefs p
        where p.member_id = member
      ),
      -- No preferences row: shared, matching the behaviour 0032 replaced.
      -- An unknown category is the only false default.
      category in ('measurements', 'goals', 'workouts')
    )
  end;
$$;

-- Re-stated because CREATE OR REPLACE does not reset privileges, and a future
-- reader should not have to open 0032 to learn who may call this.
revoke all on function trainer_may_see(uuid, text) from public, anon;
grant execute on function trainer_may_see(uuid, text) to authenticated;

comment on function trainer_may_see(uuid, text) is
  'Whether the CURRENT caller may see one category of a member''s private '
  'training data. admin/staff always may; a trainer may when that member has '
  'not switched the category off; anyone else - including a caller with no '
  'profile row - may not. NULL-safe since 0048.';
