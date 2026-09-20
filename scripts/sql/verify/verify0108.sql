-- Paste into the Supabase SQL editor right after 0108. Read-only: it changes
-- nothing and ends in an error that *is* the report. Any "NOT OK" means stop.
--
-- The single most important line is "gyms whose plan no longer resolves" — it
-- must be 0. Every gym pointed at one of three words in a CHECK constraint;
-- they now point at rows, and a gym pointing at nothing would lose its plan.
--
-- "features not included anywhere" must also be 0 on the day you paste this:
-- every plan opens including everything, precisely so that pasting takes
-- nothing away from a gym that is running today. It stops being 0 the moment
-- you untick a box on the Plans screen, which is the point of the screen.
do $$
declare
  v_plans int; v_orphans int; v_cells int; v_expected int; v_off int;
  v_priced int; v_limits int; v_fns int; v_pay int; v_policies int;
begin
  select count(*) into v_plans from platform_plans;
  select count(*) into v_orphans from gyms g
   where not exists (select 1 from platform_plans p where p.key = g.plan);

  select count(*) into v_cells from platform_plan_features;
  select (select count(*) from platform_plans) * (select count(*) from platform_features)
    into v_expected;
  select count(*) into v_off from platform_plan_features where not enabled;

  select count(*) into v_priced from platform_plans where price_monthly is not null;
  select count(*) into v_limits from platform_plans
   where max_members is not null or max_staff is not null;

  select count(*) into v_fns from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('gym_plan_allows', 'gym_headroom', 'my_gym_features', 'my_gym_billing',
                     'record_gym_payment', 'platform_revenue', 'gyms_due', 'platform_price_list',
                     'save_platform_plan', 'set_platform_plan_feature', 'retire_platform_plan');

  -- Nothing may read a gym's payments through a policy; every read is a
  -- SECURITY DEFINER function that names who may see it.
  select count(*) into v_policies from pg_policies
   where schemaname = 'public' and tablename = 'gym_payments';
  select count(*) into v_pay from gym_payments;

  raise exception 'REPORT 0108: plans=% | gyms whose plan no longer resolves=% % | plan/feature cells=% of % % | features not included anywhere=% (0 on paste day, by design) | plans with a price=% (only the free trial, until you set one) | plans with a limit=% (0 until you set one) | new functions=% of 11 % | policies on gym_payments=% % | payments recorded=%',
    v_plans,
    v_orphans, case when v_orphans = 0 then 'OK' else 'NOT OK — STOP' end,
    v_cells, v_expected, case when v_cells = v_expected then 'OK' else 'NOT OK' end,
    v_off,
    v_priced,
    v_limits,
    v_fns, case when v_fns = 11 then 'OK' else 'NOT OK' end,
    v_policies, case when v_policies = 0 then 'OK' else 'NOT OK' end,
    v_pay;
end $$;
