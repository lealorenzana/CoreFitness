-- VERIFICATION for 0161_staff_permissions.sql
-- Paste into the Supabase SQL editor right after 0161. Read-only: it changes
-- nothing and ends in an error that *is* the report.
do $$
declare v_rls boolean; v_writes int; v_gates int; v_triggers int; v_set boolean; v_anon boolean; v_tenant boolean; v_marker boolean;
begin
  select relrowsecurity into v_rls from pg_class where relname = 'staff_permissions';
  select count(*) into v_writes from pg_policies where tablename = 'staff_permissions' and cmd in ('INSERT','UPDATE','DELETE','ALL') and permissive = 'PERMISSIVE';
  select count(distinct tablename) into v_gates from pg_policies where policyname like 'staff_area_%';
  select count(*) into v_triggers from pg_trigger where tgname = 'staff_area_guard' and not tgisinternal;
  select has_function_privilege('authenticated', 'set_staff_permissions(uuid, text[])', 'execute') into v_set;
  select has_function_privilege('anon', 'set_staff_permissions(uuid, text[])', 'execute') into v_anon;
  select 'staff_permissions' = any(tenancy_gym_tables()) into v_tenant;
  select coalesce((select migration_0161_applied()), false) into v_marker;
  raise exception 'REPORT 0161: RLS on=% % | write policies=% % | gated tables=% (18 expected) | guard triggers=% (18 expected) | owner can set=% % | anon=% % | tenancy=% % | marker=% %',
    v_rls, case when v_rls then 'OK' else 'NOT OK - STOP' end,
    v_writes, case when v_writes = 0 then 'OK' else 'NOT OK - STOP' end,
    v_gates, v_triggers,
    v_set, case when v_set then 'OK' else 'NOT OK' end,
    v_anon, case when not v_anon then 'OK' else 'NOT OK - STOP' end,
    v_tenant, case when v_tenant then 'OK' else 'NOT OK' end,
    v_marker, case when v_marker then 'OK' else 'NOT OK' end;
end
$$;
