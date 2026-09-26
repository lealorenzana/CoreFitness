-- VERIFICATION for 0122_gym_programs.sql
-- Paste into the Supabase SQL editor right after 0122. Read-only: it changes
-- nothing and ends in an error that *is* the report.
--
-- Two lines decide whether it is safe to keep:
--
--   **"write policies on enrolments"** must be 0. Enrolments are written only by
--   start_program / leave_program / assign_program, which check the Premium
--   lock; a write policy would let a free member enrol in a Premium program.
--
--   **"Premium programs on free plans"** must be 0. The feature must arrive
--   switched off for every free-tier plan, or the lock opens for everybody.
--
-- "Premium programs on premium plans" should equal the number of premium-tier
-- plans across all gyms. Nothing is published by pasting this: every gym starts
-- with no programs until its owner builds or copies one.
do $$
declare
  v_tbls int; v_write int; v_free_on int; v_prem_on int; v_prem int; v_fns int; v_progs int;
begin
  select count(*) into v_tbls from pg_tables where schemaname = 'public'
     and tablename in ('gym_workouts', 'gym_workout_items', 'gym_programs', 'gym_program_days', 'program_enrolments');

  select count(*) into v_write from pg_policies
   where schemaname = 'public' and tablename = 'program_enrolments'
     and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') and permissive = 'PERMISSIVE';

  select count(*) filter (where p.tier = 'free' and pf.enabled),
         count(*) filter (where p.tier = 'premium' and pf.enabled)
    into v_free_on, v_prem_on
    from plan_features pf join membership_plans p on p.id = pf.plan_id
   where pf.feature_key = 'premium_programs';
  select count(*) into v_prem from membership_plans where tier = 'premium';

  select count(*) into v_fns from pg_proc where pronamespace = 'public'::regnamespace
     and proname in ('start_program', 'leave_program', 'assign_program', 'start_program_day',
                     'program_progress', 'copy_starter_program', 'program_unlocked');
  select count(*) into v_progs from gym_programs;

  raise exception 'REPORT 0122: tables=% of 5 % | write policies on enrolments=% % | Premium programs on free plans=% % | Premium programs on premium plans=% of % | functions=% of 7 % | programs so far=%',
    v_tbls, case when v_tbls = 5 then 'OK' else 'NOT OK' end,
    v_write, case when v_write = 0 then 'OK' else 'NOT OK - STOP' end,
    v_free_on, case when v_free_on = 0 then 'OK' else 'NOT OK - STOP' end,
    v_prem_on, v_prem,
    v_fns, case when v_fns = 7 then 'OK' else 'NOT OK' end,
    v_progs;
end $$;
