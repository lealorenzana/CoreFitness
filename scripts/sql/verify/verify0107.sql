-- Paste into the Supabase SQL editor right after 0107. Read-only: it changes
-- nothing and ends in an error that *is* the report. Any "NOT OK" means stop.
--
-- What it checks: the column exists; gyms that were already running kept their
-- dashboards (stamped, so no setup wizard); a gym created by 0106's "Add a gym"
-- is NOT stamped (it genuinely has not been set up); and both reads now carry
-- the new columns.
do $$
declare
  v_col int; v_stamped int; v_pending int; v_ctx int; v_plat int; v_fns int;
begin
  select count(*) into v_col from information_schema.columns
   where table_schema = 'public' and table_name = 'gyms' and column_name = 'onboarded_at';

  select count(*) into v_stamped from gyms where onboarded_at is not null;
  select count(*) into v_pending from gyms where onboarded_at is null;

  -- my_gym_context() ends in `onboarded`, platform_gyms() in `owners, onboarded`.
  select count(*) into v_ctx from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'my_gym_context'
     and 'onboarded' = any (p.proargnames);
  select count(*) into v_plat from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'platform_gyms'
     and 'owners' = any (p.proargnames) and 'onboarded' = any (p.proargnames);

  select count(*) into v_fns from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('finish_gym_setup', 'platform_find_user');

  raise exception 'REPORT 0107: onboarded_at column=% % | gyms already set up=% | gyms still to set up=% (each needs an owner invited) | my_gym_context carries onboarded=% % | platform_gyms carries owners+onboarded=% % | new functions=% of 2 %',
    v_col, case when v_col = 1 then 'OK' else 'NOT OK' end,
    v_stamped, v_pending,
    v_ctx, case when v_ctx = 1 then 'OK' else 'NOT OK' end,
    v_plat, case when v_plat = 1 then 'OK' else 'NOT OK' end,
    v_fns, case when v_fns = 2 then 'OK' else 'NOT OK' end;
end $$;
