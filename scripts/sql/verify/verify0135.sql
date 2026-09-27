-- VERIFICATION for 0135_platform_gym_profile.sql
-- Paste into the Supabase SQL editor right after 0135. Read-only: it changes
-- nothing and ends in an error that *is* the report.
--
-- "policies on gym_notes" must be exactly 1 (is_platform_admin only): the notes
-- are the platform owner's, and no gym may read or write them.
do $$
declare v_fns int; v_pol int; v_notes int;
begin
  select count(*) into v_fns from pg_proc where pronamespace = 'public'::regnamespace
     and proname in ('platform_gym_contacts', 'platform_gym_weeks', 'platform_gym_features', 'platform_gym_events');
  select count(*) into v_pol from pg_policies where schemaname = 'public' and tablename = 'gym_notes';
  select count(*) into v_notes from gym_notes;
  raise exception 'REPORT 0135: profile functions=% of 4 % | policies on gym_notes=% % | notes=%',
    v_fns, case when v_fns = 4 then 'OK' else 'NOT OK' end,
    v_pol, case when v_pol = 1 then 'OK' else 'NOT OK - STOP' end, v_notes;
end $$;
