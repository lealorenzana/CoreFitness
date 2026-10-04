-- VERIFICATION for 0164 (start billing)
-- Paste into the Supabase SQL editor right after 0164. Read-only; the error is the report. Every value should be true.
do $$
declare c0 boolean; c1 boolean; c2 boolean;
begin
  c0 := has_function_privilege('authenticated','platform_set_billing(uuid, date, text)','execute');
  c1 := not has_function_privilege('anon','platform_set_billing(uuid, date, text)','execute');
  select coalesce((select migration_0164_applied()), false) into c2;
  raise exception 'REPORT 0164: check 1=% | check 2=% | marker=%', c0, c1, c2;
end
$$;
