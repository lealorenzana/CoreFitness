-- VERIFICATION for 0144_ai_coach_profile.sql
-- Paste into the Supabase SQL editor right after 0144. Read-only: it changes
-- nothing and ends in an error that *is* the report.
do $$
declare v_cols int; v_check int; v_save boolean; v_save_anon boolean; v_ctx int;
begin
  select count(*) into v_cols from information_schema.columns
   where table_schema = 'public' and table_name = 'ai_coach_profiles'
     and column_name in ('goal','experience','days_per_week','minutes','equipment','likes','avoid','has_injury','onboarded_at');
  select count(*) into v_check from pg_constraint
   where conname = 'ai_coach_profiles_answers_check' and conrelid = 'public.ai_coach_profiles'::regclass;
  select has_function_privilege('authenticated', 'save_ai_coach_profile(jsonb)', 'execute') into v_save;
  select has_function_privilege('anon', 'save_ai_coach_profile(jsonb)', 'execute') into v_save_anon;
  select count(*) into v_ctx from pg_proc
   where proname = 'ai_coach_context' and prosrc like '%onboarded_at%' and prosrc like '%consent_reads_data%';
  raise exception 'REPORT 0144: columns=% of 9 % | answers check=% % | members can save=% % | anon can save=% % | context has profile and consent=% %',
    v_cols, case when v_cols = 9 then 'OK' else 'NOT OK' end,
    v_check, case when v_check = 1 then 'OK' else 'NOT OK' end,
    v_save, case when v_save then 'OK' else 'NOT OK' end,
    v_save_anon, case when not v_save_anon then 'OK' else 'NOT OK - STOP' end,
    v_ctx, case when v_ctx = 1 then 'OK' else 'NOT OK - STOP' end;
end $$;
