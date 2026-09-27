-- VERIFICATION for 0129_room_classwork.sql
-- Paste into the Supabase SQL editor right after 0129. Read-only: it changes
-- nothing and ends in an error that *is* the report.
--
-- "write policies on classwork" must be 0: classwork is set, turned in and
-- returned only through the functions. "points rule switched ON" must be 0 —
-- it ships off; the owner turns it on in Rewards.
do $$
declare v_write int; v_rules int; v_on int; v_gyms int; v_trg int;
begin
  select count(*) into v_write from pg_policies
   where schemaname = 'public' and tablename in ('room_assignments', 'room_submissions')
     and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') and permissive = 'PERMISSIVE';
  select count(*), count(*) filter (where is_active) into v_rules, v_on from point_rules where key = 'classwork_on_time';
  select count(*) into v_gyms from gyms;
  select count(*) into v_trg from pg_trigger where tgname = 'workout_turns_in';
  raise exception 'REPORT 0129: write policies on classwork=% % | gyms with the points rule=% of % % | points rule switched ON=% % | turn-in trigger=% %',
    v_write, case when v_write = 0 then 'OK' else 'NOT OK - STOP' end,
    v_rules, v_gyms, case when v_rules = v_gyms then 'OK' else 'NOT OK' end,
    v_on, case when v_on = 0 then 'OK' else 'CHECK' end,
    v_trg, case when v_trg = 1 then 'OK' else 'NOT OK' end;
end $$;
