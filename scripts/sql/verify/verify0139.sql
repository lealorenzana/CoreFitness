-- VERIFICATION for 0139_trials_end.sql
-- Paste into the Supabase SQL editor right after 0139. Read-only: it changes
-- nothing and ends in an error that *is* the report.
--
-- Every gym on a trial plan that has never paid now has an end date; Gym #1
-- (G Fitness) and every gym that has paid kept theirs; the trigger exists.
do $$
declare v_trials int; v_dated int; v_soonest date; v_gym1 date; v_gym1_plan text; v_trigger int;
begin
  select count(*), count(g.paid_until), min(g.paid_until) into v_trials, v_dated, v_soonest
    from gyms g join platform_plans pp on pp.key = g.plan
   where coalesce(pp.trial_days, 0) > 0 and g.id <> gym_one()
     and not exists (select 1 from gym_payments x where x.gym_id = g.id);
  select paid_until, plan into v_gym1, v_gym1_plan from gyms where id = gym_one();
  select count(*) into v_trigger from pg_trigger where tgname = 'gym_trial_ends' and not tgisinternal;
  raise exception 'REPORT 0139: trial gyms=% with an end date=% % | soonest end=% (never before today+14 for an old trial) | G Fitness: plan=% paid_until=% (unchanged) | trigger % ',
    v_trials, v_dated, case when v_trials = v_dated then 'OK' else 'NOT OK - STOP' end,
    coalesce(v_soonest::text, 'none'), v_gym1_plan, coalesce(v_gym1::text, 'none'),
    case when v_trigger = 1 then 'OK' else 'NOT OK - STOP' end;
end $$;
