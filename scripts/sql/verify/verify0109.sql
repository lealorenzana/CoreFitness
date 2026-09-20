-- Paste into the Supabase SQL editor right after 0109. Read-only: it changes
-- nothing and ends in an error that *is* the report. Any "NOT OK" means stop.
--
-- "platform admins" must be at least 1. 0109 adds a guard that refuses to
-- remove the last one, because there is no bootstrap function to undo it — but
-- the guard cannot help a project that already has none.
do $$
declare
  v_fns int; v_cols int; v_admins int; v_open int; v_resolved int;
  v_crash_args int; v_people_leak int;
begin
  select count(*) into v_fns from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('platform_rename_gym', 'platform_gym_people', 'platform_gym_detail',
                     'resolve_crashes', 'platform_overview', 'list_platform_admins',
                     'add_platform_admin', 'remove_platform_admin');

  select count(*) into v_cols from information_schema.columns
   where table_schema = 'public' and table_name = 'client_errors'
     and column_name in ('resolved_at', 'resolved_by');

  -- platform_crash_reports gained a second argument; the old one-argument form
  -- must be gone, or a stale overload could answer instead.
  select count(*) into v_crash_args from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'platform_crash_reports';

  select count(*) into v_admins from platform_admins;
  select count(*) into v_open from client_errors where resolved_at is null;
  select count(*) into v_resolved from client_errors where resolved_at is not null;

  -- The privacy line, checked as a property of the function's own text rather
  -- than by running it: a gym's members must not be reachable through it.
  select count(*) into v_people_leak from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'platform_gym_people'
     and prosrc not like '%(''admin'', ''staff'')%';

  raise exception 'REPORT 0109: new functions=% of 8 % | client_errors resolved columns=% of 2 % | platform_crash_reports overloads=% % | platform admins=% % | crash reports open=% (resolved=%) | platform_gym_people restricted to admin+staff=%',
    v_fns, case when v_fns = 8 then 'OK' else 'NOT OK' end,
    v_cols, case when v_cols = 2 then 'OK' else 'NOT OK' end,
    v_crash_args, case when v_crash_args = 1 then 'OK' else 'NOT OK — a stale overload survives' end,
    v_admins, case when v_admins >= 1 then 'OK' else 'NOT OK — nobody can run the platform' end,
    v_open, v_resolved,
    case when v_people_leak = 0 then 'OK' else 'NOT OK — STOP' end;
end $$;
