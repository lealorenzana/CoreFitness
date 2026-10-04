-- VERIFICATION for 0153_house_rules.sql
-- Paste into the Supabase SQL editor right after 0153. Read-only: it changes
-- nothing and ends in an error that *is* the report.
do $$
declare v_rls int; v_writes int; v_frozen boolean; v_pub boolean; v_acc boolean; v_anon boolean; v_tenant boolean; v_marker boolean;
begin
  select count(*) into v_rls from pg_class where relname in ('gym_house_rules', 'house_rules_acceptances') and relrowsecurity;
  select count(*) into v_writes from pg_policies where tablename in ('gym_house_rules', 'house_rules_acceptances')
     and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') and permissive = 'PERMISSIVE';
  select exists (select 1 from pg_trigger where tgname = 'house_rules_frozen' and not tgisinternal) into v_frozen;
  select has_function_privilege('authenticated', 'publish_house_rules(text)', 'execute') into v_pub;
  select has_function_privilege('authenticated', 'accept_house_rules(uuid)', 'execute') into v_acc;
  select has_function_privilege('anon', 'publish_house_rules(text)', 'execute') or has_function_privilege('anon', 'accept_house_rules(uuid)', 'execute')
      or has_function_privilege('anon', 'my_house_rules()', 'execute') into v_anon;
  select 'gym_house_rules' = any(tenancy_gym_tables()) and 'house_rules_acceptances' = any(tenancy_gym_tables()) into v_tenant;
  select coalesce((select migration_0153_applied()), false) into v_marker;
  raise exception 'REPORT 0153: RLS on=% of 2 % | write policies=% % | versions frozen=% % | owners can publish=% % | members can agree=% % | anon can call=% % | on tenancy list=% % | marker=% %',
    v_rls, case when v_rls = 2 then 'OK' else 'NOT OK - STOP' end,
    v_writes, case when v_writes = 0 then 'OK' else 'NOT OK - STOP' end,
    v_frozen, case when v_frozen then 'OK' else 'NOT OK - STOP' end,
    v_pub, case when v_pub then 'OK' else 'NOT OK' end,
    v_acc, case when v_acc then 'OK' else 'NOT OK' end,
    v_anon, case when not v_anon then 'OK' else 'NOT OK - STOP' end,
    v_tenant, case when v_tenant then 'OK' else 'NOT OK' end,
    v_marker, case when v_marker then 'OK' else 'NOT OK' end;
end
$$;
