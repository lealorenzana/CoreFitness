-- VERIFICATION for 0153_streak_rest_closed_squad.sql
-- Paste into the Supabase SQL editor right after 0153. Read-only: it changes
-- nothing and ends in an error that *is* the report.
do $$
declare v_col boolean; v_fns int; v_members int; v_inner int; v_card boolean; v_sweep boolean; v_marker boolean;
begin
  select exists (select 1 from information_schema.columns where table_name = 'gym_settings' and column_name = 'closed_days') into v_col;
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('gym_days_left', 'squad_streak_card', 'my_squad_streak', 'squad_streaks', 'member_squad_streak');
  select count(*) into v_members from (values ('my_squad_streak()'), ('squad_streaks()'), ('member_squad_streak(uuid)')) f(sig)
   where has_function_privilege('authenticated', f.sig, 'execute') and not has_function_privilege('anon', f.sig, 'execute');
  select count(*) into v_inner from (values ('gym_days_left(uuid)'), ('squad_streak_card(uuid)'), ('streak_card(uuid,uuid)')) f(sig)
   where has_function_privilege('authenticated', f.sig, 'execute') or has_function_privilege('anon', f.sig, 'execute');
  select exists (select 1 from pg_proc where proname = 'streak_card' and prosrc like '%gym_days_left(%' and prosrc like '%plan_days%') into v_card;
  select exists (select 1 from pg_proc where proname = 'streak_nudge_sweep' and prosrc like '%squad_streak_card(%') into v_sweep;
  select coalesce((select migration_0153_applied()), false) into v_marker;
  raise exception 'REPORT 0153: closed days column=% % | functions=% of 5 % | callable by members, not anon=% of 3 % | inner helpers callable=% % | card counts open days and the plan=% % | sweep includes squads=% % | marker=% %',
    v_col, case when v_col then 'OK' else 'NOT OK' end,
    v_fns, case when v_fns = 5 then 'OK' else 'NOT OK' end,
    v_members, case when v_members = 3 then 'OK' else 'NOT OK' end,
    v_inner, case when v_inner = 0 then 'OK' else 'NOT OK - STOP' end,
    v_card, case when v_card then 'OK' else 'NOT OK' end,
    v_sweep, case when v_sweep then 'OK' else 'NOT OK' end,
    v_marker, case when v_marker then 'OK' else 'NOT OK' end;
end $$;
