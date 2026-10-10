-- VERIFICATION for 0179 (joining rules, approval, minimum age)
-- Paste into the Supabase SQL editor right after 0179. Read-only; the error is the report.
do $$
declare c1 boolean; c2 boolean; c3 boolean; c4 boolean; c5 boolean;
begin
  select exists (select 1 from information_schema.columns where table_name = 'gym_settings' and column_name = 'join_approval') into c1;
  select exists (select 1 from information_schema.columns where table_name = 'gym_settings' and column_name = 'min_age') into c2;
  c3 := has_function_privilege('authenticated', 'set_join_settings(text, text, int)', 'execute');
  c4 := has_function_privilege('authenticated', 'request_to_join(uuid, text, text, text)', 'execute');
  select coalesce((select migration_0179_applied()), false) into c5;
  raise exception 'REPORT 0179: join_approval=% | min_age=% | settings_fn=% | join_fn=% | marker=%', c1, c2, c3, c4, c5;
end
$$;
