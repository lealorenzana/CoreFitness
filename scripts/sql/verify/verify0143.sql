-- VERIFICATION for 0143_ai_coach_foundation.sql
-- Paste into the Supabase SQL editor right after 0143. Read-only: it changes
-- nothing and ends in an error that *is* the report.
do $$
declare v_rls int; v_write_pol int; v_fns int; v_member_can_record boolean; v_ctx_ok int; v_tenant boolean;
begin
  select count(*) into v_rls from pg_class where relname in ('ai_coach_profiles','ai_usage_days') and relrowsecurity;
  select count(*) into v_write_pol from pg_policies
   where tablename in ('ai_coach_profiles','ai_usage_days') and cmd in ('INSERT','UPDATE','DELETE','ALL')
     and permissive = 'PERMISSIVE';
  select count(*) into v_fns from pg_proc where pronamespace = 'public'::regnamespace
   and proname in ('ai_coach_status','set_ai_coach_consent','ai_coach_context','ai_record_usage');
  select has_function_privilege('authenticated', 'ai_record_usage(uuid, uuid, int, int)', 'execute') into v_member_can_record;
  select count(*) into v_ctx_ok from pg_proc where proname = 'ai_coach_context' and prosrc like '%consent_reads_data%';
  select tenancy_gym_tables() @> array['ai_coach_profiles','ai_usage_days'] into v_tenant;
  raise exception 'REPORT 0143: RLS on=% of 2 % | write policies=% % | functions=% of 4 % | member can record usage=% % | context needs consent=% % | tenant tables=% %',
    v_rls, case when v_rls = 2 then 'OK' else 'NOT OK - STOP' end,
    v_write_pol, case when v_write_pol = 0 then 'OK' else 'NOT OK - STOP' end,
    v_fns, case when v_fns = 4 then 'OK' else 'NOT OK' end,
    v_member_can_record, case when not v_member_can_record then 'OK' else 'NOT OK - STOP' end,
    v_ctx_ok, case when v_ctx_ok = 1 then 'OK' else 'NOT OK - STOP' end,
    v_tenant, case when v_tenant then 'OK' else 'NOT OK' end;
end $$;
