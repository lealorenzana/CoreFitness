-- VERIFICATION for 0235 (coaching house rules: pause, the gym's cut, coach dues)
-- Paste into the Supabase SQL editor right after 0235. Read-only; the error is the report.
do $$
declare c boolean; cols int; tbls int; rls int; trg boolean; reg int; open_fns int; changed int;
begin
  select coalesce((select migration_0235_applied()), false) into c;
  select count(*) into cols from information_schema.columns
   where table_schema = 'public' and table_name = 'gym_settings'
     and column_name in ('coaching_pause', 'coaching_cut_on', 'coaching_cut_percent', 'coach_dues_on', 'coach_dues_amount', 'coach_dues_since');
  select count(*) into tbls from pg_tables where schemaname = 'public'
     and tablename in ('coaching_pauses', 'coach_cut_settlements', 'coach_dues_payments');
  select count(*) into rls from pg_class where relname in ('coaching_pauses', 'coach_cut_settlements', 'coach_dues_payments') and relrowsecurity;
  select exists (select 1 from pg_trigger where tgname = 'memberships_coaching_follows_freeze') into trg;
  select count(*) into reg from unnest(tenancy_gym_tables()) t where t in ('coaching_pauses', 'coach_cut_settlements', 'coach_dues_payments');
  -- None of the new functions may be callable by a visitor.
  select count(*) into open_fns from pg_proc p
   where p.proname in ('coaching_house_rules', 'set_coaching_house_rules', 'decide_coaching_pause', 'my_coaching_pauses',
                       'coach_earnings', 'settle_coach_cut', 'unsettle_coach_cut', 'coach_dues', 'record_coach_dues',
                       'undo_coach_dues', 'coaching_on_pause', 'trg_coaching_follows_freeze')
     and has_function_privilege('anon', p.oid, 'execute');
  -- Nothing changes until an owner says so: every gym still on the defaults.
  select count(*) into changed from gym_settings
   where coaching_pause <> 'never' or coaching_cut_on or coach_dues_on;
  raise exception 'REPORT 0235: settings columns %/6 | tables %/3 (RLS on %/3, registered %/3) | freeze trigger=% | functions a visitor can call=% (want 0) | gyms off the defaults=% | marker=%',
    cols, tbls, rls, reg, trg, open_fns, changed, c;
end
$$;
