-- VERIFICATION for 0142_plan_rows_for_new_features.sql
-- Paste into the Supabase SQL editor right after 0142. Read-only: it changes
-- nothing and ends in an error that *is* the report.
--
-- Every plan has one row per feature, no child is sold where its parent is not,
-- and a feature added later will be filled in by a trigger.
do $$
declare v_holes int; v_child_over int; v_trg int;
begin
  select (select count(*) from platform_plans) * (select count(*) from platform_features)
       - (select count(*) from platform_plan_features) into v_holes;
  select count(*) into v_child_over from platform_plan_features c
    join platform_features f on f.key = c.feature_key and f.parent_key is not null
    join platform_plan_features p on p.plan_key = c.plan_key and p.feature_key = f.parent_key
   where c.enabled and not p.enabled;
  select count(*) into v_trg from pg_trigger
   where tgrelid = 'platform_features'::regclass and tgname = 'platform_feature_seeded';
  raise exception 'REPORT 0142: missing plan rows=% % | children sold without their parent=% (display only; the parent rule still turns them off) % | new-feature trigger=% %',
    v_holes, case when v_holes = 0 then 'OK' else 'NOT OK' end,
    v_child_over, case when v_child_over = 0 then 'OK' else 'CHECK' end,
    v_trg, case when v_trg = 1 then 'OK' else 'NOT OK' end;
end $$;
