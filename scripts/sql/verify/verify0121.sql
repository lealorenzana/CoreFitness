-- VERIFICATION for 0121_exercise_media.sql
-- Paste into the Supabase SQL editor right after 0121. Read-only: it changes
-- nothing and ends in an error that *is* the report.
--
-- Two lines decide whether it is safe to keep:
--
--   **"write policies on photo slots"** must be 0. `gym_photos` is written only
--   by reserve_gym_photo()/release_gym_photo(); a write policy would let a
--   client add rows that are not counted, or delete rows to dodge the limit.
--
--   **"gym A-can-curate policies"** must be 0: `may_curate_library()` must be the
--   platform alone, or one gym still edits every gym's exercise list.
--
-- "shared exercises with starter guides" should read 36 of 36 on a database
-- seeded by 0050 (more if the platform has since added its own).
do $$
declare
  v_tbls int; v_write int; v_curate int; v_starter int; v_shared int; v_cap int; v_used int;
begin
  select count(*) into v_tbls from pg_tables
   where schemaname = 'public' and tablename in ('gym_exercise_media', 'gym_photos');

  select count(*) into v_write from pg_policies
   where schemaname = 'public' and tablename = 'gym_photos'
     and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') and permissive = 'PERMISSIVE';

  select count(*) into v_curate from pg_proc
   where proname = 'may_curate_library' and pronamespace = 'public'::regnamespace
     and prosrc ~ 'gym_one';

  select count(*) filter (where cardinality(cues) > 0 and cardinality(steps) > 0), count(*)
    into v_starter, v_shared from exercises where gym_id is null;

  select count(*) into v_cap from platform_plans where max_photos is not null;
  select count(*) into v_used from gym_photos;

  raise exception 'REPORT 0121: tables=% of 2 % | write policies on photo slots=% % | gym-A-can-curate policies=% % | shared exercises with starter guides=% of % | plans with a photo limit=% | photos stored=%',
    v_tbls, case when v_tbls = 2 then 'OK' else 'NOT OK' end,
    v_write, case when v_write = 0 then 'OK' else 'NOT OK - STOP' end,
    v_curate, case when v_curate = 0 then 'OK' else 'NOT OK - STOP' end,
    v_starter, v_shared, v_cap, v_used;
end $$;
