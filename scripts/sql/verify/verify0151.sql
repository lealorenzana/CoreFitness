-- VERIFICATION for 0151_gym_streak.sql
-- Paste into the Supabase SQL editor right after 0151. Read-only: it changes
-- nothing and ends in an error that *is* the report.
do $$
declare v_cols int; v_fns int; v_members int; v_inner int; v_table boolean; v_rule int; v_badges int;
        v_same int; v_marker boolean;
begin
  select count(*) into v_cols from information_schema.columns
   where table_name = 'member_profiles' and column_name in ('streak_target', 'streak_nudges');
  select count(*) into v_fns from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('member_frozen_weeks', 'streak_weeks', 'streak_card', 'my_streak',
     'member_streak', 'set_streak_target', 'settle_my_streak', 'streak_nudge_sweep');
  -- The five a member's app or the desk calls.
  select count(*) into v_members from (values ('my_streak()'), ('member_streak(uuid)'), ('set_streak_target(int,boolean)'),
      ('settle_my_streak()'), ('streak_nudge_sweep()')) f(sig)
   where has_function_privilege('authenticated', f.sig, 'execute') and not has_function_privilege('anon', f.sig, 'execute');
  -- The three inner helpers: nobody calls them directly.
  select count(*) into v_inner from (values ('member_frozen_weeks(uuid,uuid)'), ('streak_weeks(uuid,uuid)'),
      ('streak_card(uuid,uuid)')) f(sig)
   where has_function_privilege('authenticated', f.sig, 'execute') or has_function_privilege('anon', f.sig, 'execute');
  select exists (select 1 from pg_class where relname = 'streak_milestones' and relrowsecurity) into v_table;
  select count(*) into v_rule from point_rules where key = 'streak_milestone';
  select count(*) into v_badges from achievements where key in ('streak_26', 'streak_52');
  -- The badges and the streak card read one number: member_training_stats uses streak_weeks.
  select count(*) into v_same from pg_proc where proname = 'member_training_stats' and prosrc like '%streak_weeks(%';
  select coalesce((select migration_0151_applied()), false) into v_marker;
  raise exception 'REPORT 0151: columns=% of 2 % | functions=% of 8 % | callable by members, not anon=% of 5 % | inner helpers callable=% % | milestones table with RLS=% % | point rule rows=% % | new badges=% % | one streak definition=% % | marker=% %',
    v_cols, case when v_cols = 2 then 'OK' else 'NOT OK' end,
    v_fns, case when v_fns = 8 then 'OK' else 'NOT OK' end,
    v_members, case when v_members = 5 then 'OK' else 'NOT OK' end,
    v_inner, case when v_inner = 0 then 'OK' else 'NOT OK - STOP' end,
    v_table, case when v_table then 'OK' else 'NOT OK' end,
    v_rule, case when v_rule > 0 then 'OK' else 'NOT OK' end,
    v_badges, case when v_badges > 0 and v_badges % 2 = 0 then 'OK' else 'NOT OK' end,
    v_same, case when v_same = 1 then 'OK' else 'NOT OK' end,
    v_marker, case when v_marker then 'OK' else 'NOT OK' end;
end $$;
