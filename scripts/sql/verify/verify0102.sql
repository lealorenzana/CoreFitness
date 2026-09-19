-- Paste into the Supabase SQL editor right after 0102. Read-only: it changes
-- nothing and ends in an error that *is* the report. Every "NOT OK" means stop.
do $$
declare
  v_ledger_out int; v_unlocks_out int; v_orphan_unlocks int; v_left int; v_rules int;
begin
  select count(*) into v_ledger_out from point_ledger where gym_id is distinct from gym_one();
  select count(*) into v_unlocks_out from achievement_unlocks where gym_id is distinct from gym_one();
  -- Every badge someone holds is in their gym's catalogue (so the shelf can name it).
  select count(*) into v_orphan_unlocks from achievement_unlocks u
   where not exists (select 1 from achievements a where a.gym_id = u.gym_id and a.key = u.achievement_key);
  select count(*) into v_rules from point_rules where gym_id = gym_one() and is_active;
  -- 0100 left 5 transition keys; 0102 drops 2. Three stay until Part B moves the apps.
  select count(*) into v_left from pg_constraint where conname like '%\_transition' escape '\';
  raise exception 'REPORT 0102: points outside Gym #1=% % | badges outside Gym #1=% % | badges missing from the catalogue=% (the same as before is fine) | active point rules in Gym #1=% | transition keys left=% %',
    v_ledger_out, case when v_ledger_out = 0 then 'OK' else 'NOT OK' end,
    v_unlocks_out, case when v_unlocks_out = 0 then 'OK' else 'NOT OK' end,
    v_orphan_unlocks, v_rules,
    v_left, case when v_left = 3 then 'OK' else 'NOT OK' end;
end $$;
