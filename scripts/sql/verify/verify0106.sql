-- Paste into the Supabase SQL editor right after 0106. Read-only: it changes
-- nothing and ends in an error that *is* the report. Any "NOT OK" means stop.
--
-- The platform owner's own row is NOT created by this migration: pasting
-- yourself into platform_admins is a deliberate, manual act. Until you do,
-- every function here refuses everyone, which is the safe direction.
do $$
declare
  v_admins int; v_gyms int; v_fns int; v_writable int;
begin
  select count(*) into v_admins from platform_admins;
  select count(*) into v_gyms from gyms;
  -- The five platform functions exist.
  select count(*) into v_fns from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('platform_gyms', 'create_gym', 'make_gym_owner', 'set_gym_status', 'set_gym_plan');
  -- Nothing but the definer functions may write the platform log.
  select count(*) into v_writable from pg_policies
   where schemaname = 'public' and tablename = 'platform_events' and cmd <> 'SELECT';
  raise exception 'REPORT 0106: platform admins=% (0 until you add yourself) | gyms=% | platform functions=% of 5 % | write policies on the platform log=% %',
    v_admins, v_gyms,
    v_fns, case when v_fns = 5 then 'OK' else 'NOT OK' end,
    v_writable, case when v_writable = 0 then 'OK' else 'NOT OK' end;
end $$;
