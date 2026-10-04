-- VERIFICATION for 0158_platform_price_list_honest.sql
-- Paste into the Supabase SQL editor right after 0158. Read-only: it changes
-- nothing and ends in an error that *is* the report.
do $$
declare v_orphans int; v_anon boolean; v_save boolean; v_marker boolean;
begin
  -- Child features the website lists although their parent is off on that plan: must be 0.
  select count(*) into v_orphans
    from platform_price_list() l
    cross join unnest(l.includes) as inc(label)
    join platform_features f on f.label = inc.label and f.parent_key is not null
   where not exists (select 1 from platform_plan_features pp
                      where pp.plan_key = l.key and pp.feature_key = f.parent_key and pp.enabled);
  select has_function_privilege('anon', 'platform_price_list()', 'execute') into v_anon;
  select has_function_privilege('anon', 'save_platform_plan(text, text, text, numeric, numeric, int, int, int, boolean, boolean, int)', 'execute') into v_save;
  select coalesce((select migration_0158_applied()), false) into v_marker;
  raise exception 'REPORT 0158: features listed without their part=% % | site can read prices=% % | anon can save plans=% % | marker=% %',
    v_orphans, case when v_orphans = 0 then 'OK' else 'NOT OK - STOP' end,
    v_anon, case when v_anon then 'OK' else 'NOT OK - STOP' end,
    v_save, case when not v_save then 'OK' else 'NOT OK - STOP' end,
    v_marker, case when v_marker then 'OK' else 'NOT OK' end;
end
$$;
