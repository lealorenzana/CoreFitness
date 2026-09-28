-- VERIFICATION for 0140_platform_insight.sql
-- Paste into the Supabase SQL editor right after 0140. Read-only: it changes
-- nothing and ends in an error that *is* the report.
--
-- The snapshot table has RLS on and no policy; every new function is fenced to
-- the platform admin; the export's allow-list leaves the private tables out.
do $$
declare v_rls int; v_pol int; v_fns int; v_guarded int; v_leak text;
begin
  select count(*) into v_rls from pg_class where relname = 'platform_capacity_snapshots' and relrowsecurity;
  select count(*) into v_pol from pg_policies where tablename = 'platform_capacity_snapshots';
  select count(*) into v_fns from pg_proc where pronamespace = 'public'::regnamespace and proname in
    ('snapshot_capacity','platform_capacity_history','platform_capacity_details','platform_gym_footprint','platform_events_search',
     'platform_event_actions','platform_gym_usage','gym_export_allowed','gym_export_tables','platform_export_gym');
  select count(*) into v_guarded from pg_proc where pronamespace = 'public'::regnamespace and proname in
    ('snapshot_capacity','platform_capacity_history','platform_capacity_details','platform_gym_footprint','platform_events_search',
     'platform_event_actions','platform_gym_usage','gym_export_allowed') and prosrc like '%is_platform_admin()%';
  select string_agg(t, ', ') into v_leak from unnest(gym_export_tables()) t
   where t in ('messages','conversations','progress_photos','assistant_conversations','assistant_messages','waiver_acceptances',
               'member_profiles','body_measurements','workout_logs','workout_sets','gym_invitations','trainer_credentials');
  raise exception 'REPORT 0140: snapshots RLS=% policies=% % | functions=% of 10 % | platform-only=% of 8 % | private tables in export: % %',
    v_rls, v_pol, case when v_rls = 1 and v_pol = 0 then 'OK' else 'NOT OK - STOP' end,
    v_fns, case when v_fns = 10 then 'OK' else 'NOT OK' end,
    v_guarded, case when v_guarded = 8 then 'OK' else 'NOT OK - STOP' end,
    coalesce(v_leak, 'none'), case when v_leak is null then 'OK' else 'NOT OK - STOP' end;
end $$;
