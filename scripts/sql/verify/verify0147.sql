-- VERIFICATION for 0147_ai_coach_owner_platform.sql
-- Paste into the Supabase SQL editor right after 0147. Read-only: it changes
-- nothing and ends in an error that *is* the report.
do $$
declare v_fns int; v_auth int; v_anon int; v_owner int; v_coach int; v_platform int; v_marker boolean;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('set_ai_coach_limits','gym_ai_usage','platform_ai_usage','platform_gym_usage');
  select count(*) into v_auth from (values ('set_ai_coach_limits(int,int)'), ('gym_ai_usage()'),
      ('platform_ai_usage(int)'), ('platform_gym_usage(int)')) f(sig)
   where has_function_privilege('authenticated', f.sig, 'execute');
  select count(*) into v_anon from (values ('set_ai_coach_limits(int,int)'), ('gym_ai_usage()'),
      ('platform_ai_usage(int)'), ('platform_gym_usage(int)')) f(sig)
   where has_function_privilege('anon', f.sig, 'execute');
  select count(*) into v_owner from pg_proc
   where proname = 'set_ai_coach_limits' and prosrc like '%r.role = ''admin''%' and prosrc like '%gym_writable%';
  select count(*) into v_coach from pg_proc
   where proname = 'platform_gym_usage' and prosrc like '%ai_usage_days%' and prosrc like '%is_platform_admin()%'
     and prosrc like '%''payments''%';
  select count(*) into v_platform from pg_proc
   where proname = 'platform_ai_usage' and prosrc like '%is_platform_admin()%';
  select coalesce((select migration_0147_applied()), false) into v_marker;
  raise exception 'REPORT 0147: functions=% of 4 % | members can call=% of 4 % | anon can call=% % | owner only, writable=% % | usage counts the coach and kept 0140''s list=% % | platform only=% % | marker=% %',
    v_fns, case when v_fns = 4 then 'OK' else 'NOT OK' end,
    v_auth, case when v_auth = 4 then 'OK' else 'NOT OK' end,
    v_anon, case when v_anon = 0 then 'OK' else 'NOT OK - STOP' end,
    v_owner, case when v_owner = 1 then 'OK' else 'NOT OK - STOP' end,
    v_coach, case when v_coach = 1 then 'OK' else 'NOT OK' end,
    v_platform, case when v_platform = 1 then 'OK' else 'NOT OK - STOP' end,
    v_marker, case when v_marker then 'OK' else 'NOT OK' end;
end $$;
