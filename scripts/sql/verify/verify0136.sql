-- VERIFICATION for 0136_platform_health_growth.sql
-- Paste into the Supabase SQL editor right after 0136. Read-only: it changes
-- nothing and ends in an error that *is* the report.
--
-- The four functions exist and each refuses anyone but the platform admin (the
-- SQL editor runs as the database owner, so it reads the definitions instead).
do $$
declare v_fns int; v_guarded int;
begin
  select count(*) into v_fns from pg_proc where pronamespace = 'public'::regnamespace
     and proname in ('platform_gym_health', 'platform_growth', 'platform_funnel', 'platform_feature_adoption');
  select count(*) into v_guarded from pg_proc where pronamespace = 'public'::regnamespace
     and proname in ('platform_gym_health', 'platform_growth', 'platform_funnel', 'platform_feature_adoption')
     and prosrc like '%is_platform_admin()%';
  raise exception 'REPORT 0136: functions=% of 4 % | platform-admin only=% of 4 %',
    v_fns, case when v_fns = 4 then 'OK' else 'NOT OK' end,
    v_guarded, case when v_guarded = 4 then 'OK' else 'NOT OK - STOP' end;
end $$;
