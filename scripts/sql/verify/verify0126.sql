-- VERIFICATION for 0126_exercise_library.sql
-- Paste into the Supabase SQL editor right after 0126. Read-only: it changes
-- nothing and ends in an error that *is* the report.
--
-- "shared exercises" must be 229 (0050's 36 + 0126's 193), every one with
-- cues and steps, no name twice. "hidden for a gym's own copy" is how many
-- times a gym already had its own exercise of the same name — its own wins.
do $$
declare v_n int; v_guided int; v_names int; v_hidden int;
begin
  select count(*), count(*) filter (where cardinality(cues) > 0 and cardinality(steps) > 0), count(distinct lower(name))
    into v_n, v_guided, v_names from exercises where gym_id is null;
  select count(*) into v_hidden from gym_exercise_media m
    join exercises lib on lib.id = m.exercise_id and lib.gym_id is null
   where m.hidden and exists (select 1 from exercises own where own.gym_id = m.gym_id and lower(own.name) = lower(lib.name));
  raise exception 'REPORT 0126: shared exercises=% % | with cues and steps=% % | distinct names=% % | hidden for a gym''s own copy=%',
    v_n, case when v_n >= 229 then 'OK' else 'NOT OK' end,
    v_guided, case when v_guided = v_n then 'OK' else 'NOT OK' end,
    v_names, case when v_names = v_n then 'OK' else 'NOT OK' end,
    v_hidden;
end $$;
