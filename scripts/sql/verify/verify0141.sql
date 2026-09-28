-- VERIFICATION for 0141_finer_switches_and_brand_colour.sql
-- Paste into the Supabase SQL editor right after 0141. Read-only: it changes
-- nothing and ends in an error that *is* the report.
--
-- Ten finer switches, each inside a parent; a switch is on only while its
-- parent is; the owner's list says so; both colour roles take a code; codes
-- are stored in one case.
do $$
declare v_kids int; v_orphans int; v_parent_clause int; v_cols int; v_accent int; v_action int; v_trg int;
begin
  select count(*) into v_kids from platform_features
   where key in ('shop','requests','chat','rooms','programs','photos','squads','seasons','quests','referrals')
     and parent_key is not null;
  -- A parent that does not exist would leave its child on forever.
  select count(*) into v_orphans from platform_features f
   where f.parent_key is not null and not exists (select 1 from platform_features p where p.key = f.parent_key);
  select count(*) into v_parent_clause from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'gym_module_on' and prosrc like '%parent_key%';
  select count(*) into v_cols from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'my_gym_modules'
     and pg_get_function_result(oid) like '%parent_key%';
  select count(*) into v_accent from pg_constraint
   where conrelid = 'gym_settings'::regclass and conname = 'gym_settings_accent_check'
     and pg_get_constraintdef(oid) like '%#[0-9a-fA-F]{6}%';
  select count(*) into v_action from pg_constraint
   where conrelid = 'gym_settings'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%accent_action%';
  select count(*) into v_trg from pg_trigger
   where tgrelid = 'gym_settings'::regclass and tgname = 'gym_colour_case';
  raise exception 'REPORT 0141: switches with a parent=% of 10 % | orphans=% % | parent rule in gym_module_on=% % | owner list has parent_key=% % | accent takes a code=% % | action checks=% (want 1) % | one-case trigger=% %',
    v_kids, case when v_kids = 10 then 'OK' else 'NOT OK' end,
    v_orphans, case when v_orphans = 0 then 'OK' else 'NOT OK - STOP' end,
    v_parent_clause, case when v_parent_clause = 1 then 'OK' else 'NOT OK - STOP' end,
    v_cols, case when v_cols = 1 then 'OK' else 'NOT OK' end,
    v_accent, case when v_accent = 1 then 'OK' else 'NOT OK' end,
    v_action, case when v_action = 1 then 'OK' else 'NOT OK' end,
    v_trg, case when v_trg = 1 then 'OK' else 'NOT OK' end;
end $$;
