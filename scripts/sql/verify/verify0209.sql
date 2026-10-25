-- VERIFICATION for 0209 (the lobby TV is a plan feature, and the gym designs its screen)
-- Paste into the Supabase SQL editor right after 0209. Read-only; the error is the report.
do $$
declare a boolean; b text; c boolean; d boolean; e boolean; f boolean;
begin
  select exists (select 1 from platform_features where key = 'lobby_tv') into a;
  select string_agg(plan_key, ',' order by plan_key) from platform_plan_features where feature_key = 'lobby_tv' and enabled into b;
  select exists (select 1 from information_schema.columns where table_name = 'gym_settings' and column_name = 'tv_design') into c;
  select exists (select 1 from pg_trigger where tgname = 'trg_tv_design' and not tgisinternal) into d;
  select not has_function_privilege('anon', 'save_tv_design(jsonb)', 'execute')
     and not has_function_privilege('anon', 'my_tv_design()', 'execute') into e;
  select coalesce((select migration_0209_applied()), false) into f;
  raise exception 'REPORT 0209: feature=% | on plans=% | tv_design column=% | trigger=% | closed to visitors=% | marker=%', a, b, c, d, e, f;
end
$$;
