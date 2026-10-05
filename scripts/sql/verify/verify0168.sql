-- VERIFICATION for 0168 (Remove demo data also removes part 3)
-- Paste into the Supabase SQL editor right after 0168. Read-only; the error is the report.
-- wrapper should be true, base_kept true, base_hidden true, marker true.
do $$
declare c1 boolean; c2 boolean; c3 boolean; c4 boolean;
begin
  c1 := has_function_privilege('authenticated', 'remove_demo_data()', 'execute');
  select exists (select 1 from pg_proc where proname = 'remove_demo_data_parts_1_2') into c2;
  c3 := not has_function_privilege('authenticated', 'remove_demo_data_parts_1_2()', 'execute');
  select coalesce((select migration_0168_applied()), false) into c4;
  raise exception 'REPORT 0168: wrapper=% | base_kept=% | base_hidden=% | marker=%', c1, c2, c3, c4;
end
$$;
