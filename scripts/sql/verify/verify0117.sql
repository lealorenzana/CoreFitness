-- Paste into the Supabase SQL editor right after 0117. Read-only: it changes
-- nothing, removes nothing, and ends in an error that *is* the report.
--
-- **Pasting this does not delete anything.** 0117 only creates the two
-- functions; removing the demo data is a separate, deliberate act from the
-- platform app (or `select remove_demo_data();`).
--
-- One line decides whether 0117 is good: **"new functions"** must be 2.
--
-- The rest is the reason the migration exists: how much of what every gym
-- dashboard shows is seeded. If "seeded people" is 0 you have already cleared
-- it, or never seeded it, and there is nothing to do before a demo.
do $$
declare
  v_fns int; v_sum record; v_marker int; v_admins int;
begin
  select count(*) into v_fns from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('demo_data_summary', 'remove_demo_data');

  select count(*) into v_marker from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'migration_0117_applied';

  -- Who could press it. Zero platform admins means nobody can, which is worth
  -- knowing *before* the evening you need to.
  select count(*) into v_admins from platform_admins;

  select * into v_sum from demo_data_summary();

  raise exception 'REPORT 0117: new functions=% of 2 % | marker=% % | platform admins who could remove it=% % | seeded people=% (% coaches) | their payments=% check-ins=% classes=% bookings=% events=% challenges=% rewards=%',
    v_fns, case when v_fns = 2 then 'OK' else 'NOT OK' end,
    v_marker, case when v_marker = 1 then 'OK' else 'NOT OK' end,
    v_admins, case when v_admins > 0 then 'OK' else 'NOT OK - add one first' end,
    v_sum.people, v_sum.coaches,
    v_sum.payments, v_sum.attendance, v_sum.classes, v_sum.bookings,
    v_sum.events, v_sum.challenges, v_sum.rewards;
end $$;
