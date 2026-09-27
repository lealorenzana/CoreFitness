-- VERIFICATION for 0127_gym_additions_stay_the_gyms.sql
-- Paste into the Supabase SQL editor right after 0127. Read-only: it changes
-- nothing and ends in an error that *is* the report.
--
-- "filing trigger" must be 0: nothing a gym adds is filed as shared any more.
-- "moved to G Fitness" is how many exercises/links went back to G Fitness.
-- "still shared, used by another gym" were added by hand but another gym has
-- logged or planned with them, so they stay shared (the next select lists them).
do $$
declare v_trg int; v_ex int; v_links int; v_kept int; v_lib int;
begin
  select count(*) into v_trg from pg_trigger where tgname = 'library_row_gym';
  select count(*) into v_ex from exercises where gym_id = gym_one() and (sort_order >= 900 or created_by is not null);
  select count(*) into v_links from workout_resources where gym_id = gym_one() and created_by is not null;
  select count(*) into v_kept from exercises where gym_id is null and (sort_order >= 900 or created_by is not null);
  select count(*) into v_lib from exercises where gym_id is null and sort_order < 900 and created_by is null;
  raise exception 'REPORT 0127: filing trigger=% % | G Fitness own exercises=% | G Fitness own links=% | still shared, used by another gym=% | shared library=% %',
    v_trg, case when v_trg = 0 then 'OK' else 'NOT OK - STOP' end,
    v_ex, v_links, v_kept,
    v_lib, case when v_lib >= 229 then 'OK' else 'NOT OK' end;
end $$;
