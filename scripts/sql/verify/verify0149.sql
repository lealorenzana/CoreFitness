-- VERIFICATION for 0149_platform_drilldowns_support_view.sql
-- Paste into the Supabase SQL editor right after 0149. Read-only: it changes
-- nothing and ends in an error that *is* the report.
do $$
declare v_fns int; v_auth int; v_anon int; v_guard int; v_crypt boolean; v_marker boolean;
begin
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('platform_checkins_breakdown', 'platform_checkins_daily', 'platform_ai_overview',
     'platform_feature_adoption', 'platform_gym_usage', 'platform_support_snapshot', 'platform_reset_gym_password');
  select count(*) into v_auth from (values ('platform_checkins_breakdown(int)'), ('platform_checkins_daily(int)'),
      ('platform_ai_overview(int)'), ('platform_support_snapshot(uuid)'), ('platform_reset_gym_password(uuid,uuid,text)')) f(sig)
   where has_function_privilege('authenticated', f.sig, 'execute');
  select count(*) into v_anon from (values ('platform_checkins_breakdown(int)'), ('platform_checkins_daily(int)'),
      ('platform_ai_overview(int)'), ('platform_support_snapshot(uuid)'), ('platform_reset_gym_password(uuid,uuid,text)')) f(sig)
   where has_function_privilege('anon', f.sig, 'execute');
  -- Every one of them asks is_platform_admin() itself; the snapshot also needs a live grant.
  select count(*) into v_guard from pg_proc
   where proname in ('platform_checkins_breakdown', 'platform_checkins_daily', 'platform_ai_overview',
                     'platform_support_snapshot', 'platform_reset_gym_password')
     and prosrc like '%is_platform_admin()%'
     and (proname <> 'platform_support_snapshot' or prosrc like '%support_grants%');
  -- The password reset stores a bcrypt hash with pgcrypto, which Supabase keeps in `extensions`.
  select exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'extensions' and p.proname = 'gen_salt') into v_crypt;
  select coalesce((select migration_0149_applied()), false) into v_marker;
  raise exception 'REPORT 0149: functions=% of 7 % | members can call=% of 5 % | anon can call=% % | platform-only guards=% of 5 % | pgcrypto in extensions=% % | marker=% %',
    v_fns, case when v_fns = 7 then 'OK' else 'NOT OK' end,
    v_auth, case when v_auth = 5 then 'OK' else 'NOT OK' end,
    v_anon, case when v_anon = 0 then 'OK' else 'NOT OK - STOP' end,
    v_guard, case when v_guard = 5 then 'OK' else 'NOT OK - STOP' end,
    v_crypt, case when v_crypt then 'OK' else 'NOT OK - the password fallback cannot hash; deploy reset-gym-password instead' end,
    v_marker, case when v_marker then 'OK' else 'NOT OK' end;
end $$;
