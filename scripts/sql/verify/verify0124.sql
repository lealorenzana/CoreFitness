-- VERIFICATION for 0124_squads_gym_goal.sql
-- Paste into the Supabase SQL editor right after 0124. Read-only: it changes
-- nothing and ends in an error that *is* the report.
--
-- Two lines decide whether it is safe to keep:
--
--   **"write policies on squads"** must be 0. Squads, their members and their
--   paid weeks are written only by the functions, which enforce the code, the
--   five-member limit and paying once.
--
--   **"goal_progress still the personal one"** must be 1. 0124 names its gym
--   functions gym_goal_*; the members' personal goal_progress (0087) must be
--   untouched, or every personal goal's progress bar breaks.
--
-- "gyms with both rules" should equal "gyms". "squads" and "gym goals" read 0
-- after pasting.
do $$
declare v_write int; v_personal int; v_rules int; v_gyms int; v_tbls int; v_sq int; v_goals int;
begin
  select count(*) into v_write from pg_policies
   where schemaname = 'public' and tablename in ('squads', 'squad_members', 'squad_weeks')
     and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') and permissive = 'PERMISSIVE';
  select count(*) into v_personal from pg_proc
   where proname = 'goal_progress' and pronamespace = 'public'::regnamespace;
  select count(*) into v_rules from (
    select gym_id from point_rules where key in ('squad_week', 'gym_goal')
     group by gym_id having count(*) = 2) r;
  select count(*) into v_gyms from gyms;
  select count(*) into v_tbls from pg_tables where schemaname = 'public'
     and tablename in ('squads', 'squad_members', 'squad_weeks', 'gym_goals');
  select count(*) into v_sq from squads;
  select count(*) into v_goals from gym_goals;

  raise exception 'REPORT 0124: write policies on squads=% % | goal_progress still the personal one=% % | tables=% of 4 % | gyms with both rules=% of % % | squads=% | gym goals=%',
    v_write, case when v_write = 0 then 'OK' else 'NOT OK - STOP' end,
    v_personal, case when v_personal = 1 then 'OK' else 'NOT OK - STOP' end,
    v_tbls, case when v_tbls = 4 then 'OK' else 'NOT OK' end,
    v_rules, v_gyms, case when v_rules = v_gyms then 'OK' else 'NOT OK' end,
    v_sq, v_goals;
end $$;
